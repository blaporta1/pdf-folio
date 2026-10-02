import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import mupdf, { type PDFPage } from "mupdf";
import { describe, expect, it } from "vitest";
import { PdfEngine } from "./engine";
import { bundledFonts, validateAndCreateUploadedFont } from "./fonts";
import type {
  ImageElement,
  ImageOperation,
  TextElement,
  TextOperation,
} from "./types";

const fixturePath = resolve("test/fixtures/engine-fixture.pdf");
const replacementPath = resolve("test/fixtures/replacement.png");
const fullFontPath = resolve("test/fixtures/full-embedded-font.pdf");
const subsetFontPath = resolve("test/fixtures/subset-embedded-font.pdf");
const w3cPath = "/tmp/folio-review-dummy.pdf";

function bytesAt(path: string) {
  return new Uint8Array(readFileSync(path));
}

function textFrom(bytes: Uint8Array, pageIndex = 0) {
  const document = mupdf.Document.openDocument(
    bytes,
    "application/pdf",
  ).asPDF()!;
  const page = document.loadPage(pageIndex);
  const structured = page.toStructuredText("preserve-spans");
  const text = structured.asText();
  structured.destroy();
  page.destroy();
  document.destroy();
  return text;
}

function documentFacts(bytes: Uint8Array) {
  const document = mupdf.Document.openDocument(
    bytes,
    "application/pdf",
  ).asPDF()!;
  const page = document.loadPage(0) as PDFPage;
  const facts = {
    annotations: page
      .getAnnotations()
      .map((annotation) => annotation.getType()),
    links: page.getLinks().map((link) => link.getURI()),
  };
  page.destroy();
  document.destroy();
  return facts;
}

function embeddedFontProgram(bytes: Uint8Array, name: RegExp) {
  const document = mupdf.Document.openDocument(bytes, "application/pdf").asPDF()!;
  const page = document.loadPage(0) as PDFPage;
  const fonts = page.getObject().getInheritable("Resources").get("Font");
  let program: Uint8Array | undefined;
  fonts.forEach((value) => {
    const font = value.resolve();
    const base = font.get("BaseFont").toString();
    if (!name.test(base)) return;
    let descriptor = font.get("FontDescriptor");
    const descendants = font.get("DescendantFonts");
    if (descriptor.isNull() && descendants.isArray() && descendants.length)
      descriptor = descendants.get(0).resolve().get("FontDescriptor");
    descriptor = descriptor.resolve();
    for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
      const file = descriptor.get(key);
      if (file.isNull()) continue;
      const buffer = file.readStream();
      program = new Uint8Array(buffer.asUint8Array()).slice();
      buffer.destroy();
      break;
    }
  });
  page.destroy();
  document.destroy();
  return program;
}

function withDuplicateEmbeddedFontResource(bytes: Uint8Array) {
  const document = mupdf.Document.openDocument(bytes, "application/pdf").asPDF()!;
  const page = document.loadPage(0) as PDFPage;
  const fonts = page.getObject().getInheritable("Resources").get("Font");
  const original = fonts.get("F2+0").resolve();
  const clone = document.newDictionary();
  original.forEach((value, key) => clone.put(key, value));
  fonts.put("CollisionFont", document.addObject(clone));
  const saved = document.saveToBuffer("garbage=1,compress");
  const output = new Uint8Array(saved.asUint8Array()).slice();
  saved.destroy();
  page.destroy();
  document.destroy();
  return output;
}

function sampleRgb(bytes: Uint8Array, rect: [number, number, number, number]) {
  const document = mupdf.Document.openDocument(
    bytes,
    "application/pdf",
  ).asPDF()!;
  const page = document.loadPage(0);
  const pixmap = page.toPixmap(
    mupdf.Matrix.identity,
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
  );
  const x = Math.round(rect[0] + (rect[2] - rect[0]) * 0.25);
  const y = Math.round(rect[1] + (rect[3] - rect[1]) * 0.5);
  const components = pixmap.getNumberOfComponents();
  const offset =
    (y - pixmap.getY()) * pixmap.getStride() + (x - pixmap.getX()) * components;
  const pixels = pixmap.getPixels();
  const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
  pixmap.destroy();
  page.destroy();
  document.destroy();
  return rgb;
}

describe("PdfEngine export regressions", () => {
  it("loads every bundled open-source font file", () => {
    expect(bundledFonts).toHaveLength(18);
    for (const definition of bundledFonts) {
      const path = resolve("public", definition.file!.replace(/^\//, ""));
      const font = new mupdf.Font(definition.family, bytesAt(path));
      expect(font.encodeCharacter("A"), definition.family).toBeGreaterThan(0);
      font.destroy();
    }
  });

  it("removes edited source text, embeds replacement text, and preserves untouched text, layout, links, and annotations", async () => {
    const source = bytesAt(fixturePath);
    const engine = new PdfEngine();
    const model = await engine.open(source, "engine-fixture.pdf");
    const editable = model.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Editable phrase"),
    )!;
    const untouched = model.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" &&
        element.text.includes("Untouched anchor text"),
    )!;
    expect(editable).toBeTruthy();
    expect(untouched).toBeTruthy();

    const operation: TextOperation = {
      id: "text-edit",
      kind: "replace-text",
      pageIndex: 0,
      sourceId: editable.id,
      sourceRect: editable.rect,
      rect: editable.rect,
      baseline: editable.baseline,
      text: "Edited phrase",
      fontId: "base-helvetica",
      fontName: "Helvetica",
      fontSize: editable.fontSize,
      color: "#202725",
    };
    const output = await engine.export([operation]);
    writeFileSync("/tmp/folio-engine-text-export.pdf", output);
    const extracted = textFrom(output);
    expect(extracted).toContain("Edited phrase");
    expect(extracted).not.toContain("Editable phrase");
    expect(extracted).toContain("Untouched anchor text");

    const reopened = new PdfEngine();
    const changed = await reopened.open(output, "changed.pdf");
    const untouchedAfter = changed.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" &&
        element.text.includes("Untouched anchor text"),
    )!;
    expect(untouchedAfter.rect).toEqual(untouched.rect);
    expect(documentFacts(output)).toEqual(documentFacts(source));
    expect(changed.pages[1].bounds).toEqual(model.pages[1].bounds);
    expect(
      changed.pages[1].elements
        .filter((element) => element.kind === "text")
        .map((element) => element.text),
    ).toEqual(
      model.pages[1].elements
        .filter((element) => element.kind === "text")
        .map((element) => element.text),
    );
  });

  it("redacts the immutable source rectangle when replacement text moves", async () => {
    const engine = new PdfEngine();
    const model = await engine.open(bytesAt(fixturePath), "engine-fixture.pdf");
    const source = model.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Editable phrase"),
    )!;
    const movedRect: [number, number, number, number] = [
      source.rect[0] + 180,
      source.rect[1] + 45,
      source.rect[2] + 180,
      source.rect[3] + 45,
    ];
    const output = await engine.export([
      {
        id: "move-text",
        kind: "replace-text",
        pageIndex: 0,
        sourceId: source.id,
        sourceRect: source.rect,
        rect: movedRect,
        baseline: source.baseline,
        text: "Moved phrase",
        fontId: "base-helvetica",
        fontName: "Helvetica",
        fontSize: source.fontSize,
        color: "#202725",
      },
    ]);
    const extracted = textFrom(output);
    expect(extracted).toContain("Moved phrase");
    expect(extracted).not.toContain("Editable phrase");
    const reopened = new PdfEngine();
    const changed = await reopened.open(output, "moved.pdf");
    const moved = changed.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Moved phrase"),
    )!;
    expect(moved.rect[0]).toBeGreaterThan(source.rect[0] + 170);
    expect(moved.rect[1]).toBeGreaterThan(source.rect[1] + 35);
  });

  it("replaces one repeated image instance without changing the other instance", async () => {
    const source = bytesAt(fixturePath);
    const engine = new PdfEngine();
    const model = await engine.open(source, "engine-fixture.pdf");
    const images = model.pages[0].elements.filter(
      (element): element is ImageElement => element.kind === "image",
    );
    expect(images).toHaveLength(2);
    expect(images.every((image) => image.editable)).toBe(true);
    const [first, second] = [...images].sort((a, b) => a.rect[0] - b.rect[0]);
    const operation: ImageOperation = {
      id: "image-edit",
      kind: "replace-image",
      pageIndex: 0,
      sourceId: first.id,
      sourceRect: first.rect,
      rect: first.rect,
      fileName: "replacement.png",
      imageBytes: bytesAt(replacementPath),
    };
    const output = await engine.export([operation]);
    writeFileSync("/tmp/folio-engine-image-export.pdf", output);
    const firstRgb = sampleRgb(output, first.rect);
    const secondRgb = sampleRgb(output, second.rect);
    expect(firstRgb[1]).toBeGreaterThan(firstRgb[0]);
    expect(secondRgb[0]).toBeGreaterThan(secondRgb[1]);
    expect(textFrom(output)).toContain("Untouched anchor text");
  });

  it("keeps rotated and cropped page geometry stable and marks unsafe text honestly", async () => {
    const engine = new PdfEngine();
    const model = await engine.open(bytesAt(fixturePath), "engine-fixture.pdf");
    const page = model.pages[1];
    expect(page.bounds[2] - page.bounds[0]).toBeCloseTo(696, 0);
    expect(page.bounds[3] - page.bounds[1]).toBeCloseTo(524, 0);
    const rotated = page.elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Rotated page anchor"),
    )!;
    expect(rotated).toBeTruthy();
    if (!rotated.editable)
      expect(rotated.limitation).toMatch(/Rotated|vertical/);
    expect(page.insertable).toBe(false);
    const [x0, y0] = page.bounds;
    await expect(
      engine.export([
        {
          id: "rotated-add",
          kind: "add-text",
          pageIndex: 1,
          rect: [x0 + 72, y0 + 72, x0 + 280, y0 + 92],
          baseline: y0 + 88,
          text: "Added on rotated crop",
          fontId: "base-helvetica",
          fontName: "Helvetica",
          fontSize: 13,
          color: "#202725",
        },
      ]),
    ).rejects.toThrow(/rotated page/);
  });

  it("embeds an uploaded Unicode font and rejects characters absent from a chosen font", async () => {
    const engine = new PdfEngine();
    const model = await engine.open(bytesAt(fixturePath), "engine-fixture.pdf");
    const uploaded = validateAndCreateUploadedFont(
      "Inter.ttf",
      bytesAt(resolve("public/fonts/Inter.ttf")),
    );
    engine.addFont(uploaded);
    await expect(
      engine.validateText("base-helvetica", "漢", 200, 14),
    ).rejects.toThrow(/does not contain/);
    await expect(
      engine.validateText(uploaded.id, "Café Ω Привет", 240, 14),
    ).resolves.toBeTruthy();
    const [x0, y0] = model.pages[0].bounds;
    const output = await engine.export([
      {
        id: "unicode-add",
        kind: "add-text",
        pageIndex: 0,
        rect: [x0 + 60, y0 + 360, x0 + 300, y0 + 382],
        baseline: y0 + 377,
        text: "Café Ω Привет",
        fontId: uploaded.id,
        fontName: uploaded.family,
        fontSize: 14,
        color: "#202725",
      },
    ]);
    writeFileSync("/tmp/folio-uploaded-font-export.pdf", output);
    expect(textFrom(output).normalize("NFKC")).toContain(
      "Café Ω Привет".normalize("NFKC"),
    );
  });

  it("defaults to a full embedded font and accepts glyphs not used in the source text", async () => {
    const sourceBytes = bytesAt(fullFontPath);
    const engine = new PdfEngine();
    const model = await engine.open(sourceBytes, "full-embedded-font.pdf");
    const source = model.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Original text"),
    )!;
    expect(source.fontExactAvailable).toBe(true);
    expect(source.fontId).toMatch(/^document-font-/);
    const definition = engine.getFonts().find((font) => font.id === source.fontId)!;
    expect(definition.subset).toBe(false);
    await expect(
      engine.validateText(source.fontId!, "Brand new words", 260, source.fontSize),
    ).resolves.toBeTruthy();
    const output = await engine.export([
      {
        id: "full-font-edit",
        kind: "replace-text",
        pageIndex: 0,
        sourceId: source.id,
        sourceRect: source.rect,
        rect: [source.rect[0], source.rect[1], source.rect[2] + 160, source.rect[3]],
        baseline: source.baseline,
        text: "Brand new words",
        fontId: source.fontId!,
        fontName: source.fontName,
        fontSize: source.fontSize,
        color: source.color,
      },
    ]);
    expect(textFrom(output).replace(/\s+/g, " ")).toContain("Brand new words");
    const reopened = new PdfEngine();
    const changed = await reopened.open(output, "full-font-edited.pdf");
    const replacement = changed.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Brand new words"),
    )!;
    expect(replacement.fontName).toMatch(/Inter/i);
    expect(replacement.fontExactAvailable).toBe(true);
  });

  it("reuses a committed subset font while isolating altered prior graphics and text state", async () => {
    const engine = new PdfEngine();
    const model = await engine.open(bytesAt(subsetFontPath), "subset-embedded-font.pdf");
    const source = model.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Dummy PDF file"),
    )!;
    expect(source.fontExactAvailable).toBe(true);
    await expect(
      engine.validateText(source.fontId!, "PDF file", 180, source.fontSize),
    ).resolves.toBeTruthy();
    await expect(
      engine.validateText(source.fontId!, "PDF file Ω", 220, source.fontSize),
    ).rejects.toThrow(/subset|matching TTF\/OTF/);
    const output = await engine.export([
      {
        id: "subset-font-edit",
        kind: "replace-text",
        pageIndex: 0,
        sourceId: source.id,
        sourceRect: source.rect,
        rect: source.rect,
        baseline: source.baseline,
        text: "PDF file",
        fontId: source.fontId!,
        fontName: source.fontName,
        fontSize: source.fontSize,
        color: source.color,
      },
    ]);
    expect(textFrom(output)).toContain("PDF file");
    const reopened = new PdfEngine();
    const changed = await reopened.open(output, "subset-font-edited.pdf");
    const replacement = changed.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("PDF file"),
    )!;
    expect(replacement.rect[0]).toBeCloseTo(source.rect[0], 0);
    expect(replacement.baseline).toBeCloseTo(source.baseline, 0);
    expect(embeddedFontProgram(output, /Inter-Regular/)).toEqual(
      embeddedFontProgram(bytesAt(subsetFontPath), /Inter-Regular/),
    );
  });

  it("refuses exact reuse when two distinct resources claim the same full embedded font name", async () => {
    const engine = new PdfEngine();
    const model = await engine.open(
      withDuplicateEmbeddedFontResource(bytesAt(subsetFontPath)),
      "ambiguous-font-resources.pdf",
    );
    const source = model.pages[0].elements.find(
      (element): element is TextElement =>
        element.kind === "text" && element.text.includes("Dummy PDF file"),
    )!;
    expect(source.fontName).toBe("AAAAAA+Inter-Regular");
    expect(source.fontExactAvailable).toBe(false);
    expect(source.fontId).toBeUndefined();
    expect(source.fontAvailabilityReason).toMatch(/cannot be safely reused|matching TTF\/OTF/);
  });

  it.skipIf(!existsSync(w3cPath))(
    "exports a real-world OpenOffice PDF with old text removed",
    async () => {
      const engine = new PdfEngine();
      const source = bytesAt(w3cPath);
      const model = await engine.open(source, "folio-review-dummy.pdf");
      const text = model.pages[0].elements.find(
        (element): element is TextElement =>
          element.kind === "text" && element.text.includes("Dummy PDF file"),
      )!;
      expect(text).toBeTruthy();
      expect(text.fontExactAvailable).toBe(true);
      expect(text.fontId).toMatch(/^document-font-/);
      await expect(
        engine.validateText(text.fontId!, "PDF file", text.rect[2] - text.rect[0], text.fontSize),
      ).resolves.toBeTruthy();
      await expect(
        engine.validateText(
          text.fontId!,
          "PDF Folio works",
          text.rect[2] - text.rect[0],
          text.fontSize,
        ),
      ).rejects.toThrow(/subset|matching TTF\/OTF/);
      const output = await engine.export([
        {
          id: "w3c-edit",
          kind: "replace-text",
          pageIndex: 0,
          sourceId: text.id,
          sourceRect: text.rect,
          rect: text.rect,
          baseline: text.baseline,
          text: "PDF file",
          fontId: text.fontId!,
          fontName: text.fontName,
          fontSize: text.fontSize,
          color: "#000000",
        },
      ]);
      writeFileSync("/tmp/folio-w3c-edited.pdf", output);
      const extracted = textFrom(output);
      expect(extracted).toContain("PDF file");
      expect(extracted).not.toContain("Dummy PDF file");
      expect(embeddedFontProgram(output, /Arial-BoldMT/)).toEqual(
        embeddedFontProgram(source, /Arial-BoldMT/),
      );
      const reopened = new PdfEngine();
      const changed = await reopened.open(output, "folio-w3c-edited.pdf");
      const replacement = changed.pages[0].elements.find(
        (element): element is TextElement =>
          element.kind === "text" && element.text.includes("PDF file"),
      )!;
      expect(replacement.fontName).toContain("Arial-BoldMT");
    },
  );

  it.skipIf(!existsSync(w3cPath))(
    "clears retained original-font handles on the next import and still permits an explicit replacement font",
    async () => {
      const engine = new PdfEngine();
      const w3c = await engine.open(bytesAt(w3cPath), "folio-review-dummy.pdf");
      const original = w3c.pages[0].elements.find(
        (element): element is TextElement =>
          element.kind === "text" && element.text.includes("Dummy PDF file"),
      )!;
      const oldFontId = original.fontId!;
      await engine.open(bytesAt(fixturePath), "engine-fixture.pdf");
      await expect(
        engine.validateText(oldFontId, "PDF file", 180, original.fontSize),
      ).rejects.toThrow(/available font/);

      const reopened = new PdfEngine();
      const model = await reopened.open(bytesAt(w3cPath), "folio-review-dummy.pdf");
      const replacementFont = validateAndCreateUploadedFont(
        "Inter.ttf",
        bytesAt(resolve("public/fonts/Inter.ttf")),
      );
      reopened.addFont(replacementFont);
      const source = model.pages[0].elements.find(
        (element): element is TextElement =>
          element.kind === "text" && element.text.includes("Dummy PDF file"),
      )!;
      await expect(
        reopened.validateText(
          replacementFont.id,
          "PDF Folio works",
          240,
          source.fontSize,
        ),
      ).resolves.toBeTruthy();
      const output = await reopened.export([
        {
          id: "explicit-font-change",
          kind: "replace-text",
          pageIndex: 0,
          sourceId: source.id,
          sourceRect: source.rect,
          rect: source.rect,
          baseline: source.baseline,
          text: "PDF Folio works",
          fontId: replacementFont.id,
          fontName: replacementFont.family,
          fontSize: source.fontSize,
          color: source.color,
        },
      ]);
      expect(textFrom(output)).toContain("PDF Folio works");
    },
  );
});
