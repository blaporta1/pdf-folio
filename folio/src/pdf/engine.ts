import mupdf, {
  type Color,
  type Font,
  type Image,
  type Matrix,
  type PDFDocument,
  type PDFAnnotation,
  type PDFObject,
  type PDFPage,
  type Quad,
  type Rect as MuRect,
} from "mupdf";
import { allFonts, loadFont } from "./fonts";
import type {
  DocumentModel,
  EditOperation,
  FontDefinition,
  ImageElement,
  PageModel,
  Rect,
  RenderedPage,
  TextElement,
} from "./types";

const MAX_FILE_BYTES = 150 * 1024 * 1024;

export class PasswordRequiredError extends Error {
  constructor(public readonly invalid = false) {
    super(
      invalid
        ? "That password did not unlock this PDF."
        : "This PDF is password protected.",
    );
  }
}

export class PdfEngine {
  private originalBytes: Uint8Array | null = null;
  private password = "";
  private customFonts: FontDefinition[] = [];

  addFont(font: FontDefinition) {
    this.customFonts = [...this.customFonts, font];
  }

  getFonts() {
    return allFonts(this.customFonts);
  }

  async validateText(
    fontId: string,
    text: string,
    width: number,
    fontSize: number,
  ) {
    const definition = this.getFonts().find((font) => font.id === fontId);
    if (!definition) throw new Error("Choose an available font.");
    const font = await loadFont(definition);
    try {
      const lines = layoutLines(font, text, Math.max(1, width), fontSize);
      return {
        lines,
        requiredHeight: Math.max(
          fontSize * 1.25,
          lines.length * fontSize * 1.2,
        ),
      };
    } finally {
      font.destroy();
    }
  }

  async open(
    bytes: Uint8Array,
    name: string,
    password = "",
  ): Promise<DocumentModel> {
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error(
        "This PDF is larger than 150 MB. PDF Folio limits file size to keep browser memory stable.",
      );
    }
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    if (!doc.isPDF()) {
      doc.destroy();
      throw new Error("This file is not a readable PDF.");
    }
    if (
      doc.needsPassword() &&
      (!password || doc.authenticatePassword(password) === 0)
    ) {
      doc.destroy();
      throw new PasswordRequiredError(Boolean(password));
    }
    const pdf = doc.asPDF();
    if (!pdf) {
      doc.destroy();
      throw new Error("PDF Folio could not open the PDF editing layer.");
    }
    this.originalBytes = bytes.slice();
    this.password = password;
    const pageCount = pdf.countPages();
    const pages: PageModel[] = [];
    for (let index = 0; index < pageCount; index += 1)
      pages.push(this.extractPage(pdf, index));
    const title = pdf.getMetaData(mupdf.Document.META_INFO_TITLE);
    pdf.destroy();
    return { name, size: bytes.byteLength, pageCount, pages, title };
  }

  private extractPage(doc: PDFDocument, index: number): PageModel {
    const page = doc.loadPage(index);
    const bounds = page.getBounds() as Rect;
    const pageTransform = page.getTransform();
    const insertable =
      Math.abs(pageTransform[1]) < 0.01 && Math.abs(pageTransform[2]) < 0.01;
    const elements: Array<TextElement | ImageElement> = [];
    const text = page.toStructuredText("preserve-spans,preserve-images");
    let line = { direction: [1, 0] as [number, number], index: 0 };
    let span: Omit<TextElement, "id" | "kind" | "pageIndex"> | null = null;
    let spanKey = "";
    let charCount = 0;
    let imageCount = 0;
    const flush = () => {
      if (!span || !span.text.trim()) {
        span = null;
        return;
      }
      elements.push({
        ...span,
        id: `p${index}-t${elements.length}`,
        kind: "text",
        pageIndex: index,
      });
      span = null;
    };
    text.walk({
      beginLine: (
        _bbox: MuRect,
        _wmode: number,
        direction: [number, number],
      ) => {
        flush();
        line = { direction, index: line.index + 1 };
      },
      onChar: (
        character: string,
        origin: [number, number],
        font: Font,
        size: number,
        quad: Quad,
        color: Color,
        bidi: number,
      ) => {
        charCount += 1;
        const rect = quadToRect(quad);
        const colorHex = colorToHex(color);
        const key = `${line.index}:${font.getName()}:${size.toFixed(2)}:${colorHex}:${bidi}`;
        const horizontal =
          Math.abs(line.direction[1]) < 0.02 &&
          Math.abs(quad[1] - quad[3]) < 0.5;
        if (span && key === spanKey) {
          span.text += character;
          span.rect = unionRect(span.rect, rect);
        } else {
          flush();
          spanKey = key;
          span = {
            rect,
            text: character,
            fontName: font.getName(),
            fontSize: size,
            baseline: origin[1],
            color: colorHex,
            editable: horizontal,
            limitation: horizontal
              ? undefined
              : "Rotated or vertical text is view-only to avoid damaging its layout.",
          };
        }
      },
      endLine: flush,
      onImageBlock: (bbox: MuRect, transform: Matrix, image: Image) => {
        flush();
        let imageBytes = new Uint8Array();
        let extractionIssue = "";
        try {
          const pixmap = image.toPixmap();
          let converted = pixmap;
          try {
            const colorspace = pixmap.getColorSpace();
            if (colorspace && !colorspace.isRGB() && !colorspace.isGray())
              converted = pixmap.convertToColorSpace(
                mupdf.ColorSpace.DeviceRGB,
                true,
              );
            imageBytes = new Uint8Array(converted.asPNG()).slice();
          } finally {
            if (converted !== pixmap) converted.destroy();
            pixmap.destroy();
          }
        } catch {
          extractionIssue =
            "PDF Folio could not safely convert this image for editing.";
        }
        const mask = image.getMask();
        const hasMask = Boolean(mask);
        mask?.destroy();
        const transformedBounds = mupdf.Rect.transform([0, 0, 1, 1], transform);
        const clipped = transformedBounds.some(
          (value, offset) => Math.abs(value - bbox[offset]) > 0.6,
        );
        const transformed =
          Math.abs(transform[1]) >= 0.01 ||
          Math.abs(transform[2]) >= 0.01 ||
          transform[0] * transform[3] <= 0;
        const editable =
          !extractionIssue && !hasMask && !clipped && !transformed;
        elements.push({
          id: `p${index}-i${imageCount++}`,
          kind: "image",
          pageIndex: index,
          rect: bbox,
          width: image.getWidth(),
          height: image.getHeight(),
          imageBytes,
          transform,
          editable,
          limitation:
            extractionIssue ||
            (hasMask
              ? "This image uses a separate transparency mask. PDF Folio leaves it view-only to preserve the mask."
              : clipped
                ? "This image uses a complex clipping region. PDF Folio leaves it view-only to preserve the clipping."
                : transformed
                  ? "This image is rotated, skewed, or mirrored. PDF Folio leaves it view-only to preserve its transform."
                  : undefined),
        });
      },
    });
    flush();
    const images = elements.filter(
      (element): element is ImageElement => element.kind === "image",
    );
    for (const image of images) {
      const overlap = images.some(
        (candidate) =>
          candidate.id !== image.id && rectsOverlap(image.rect, candidate.rect),
      );
      if (overlap) {
        image.editable = false;
        image.limitation =
          "This image overlaps another image. PDF Folio leaves the stack view-only to avoid changing the wrong layer.";
      }
    }
    text.destroy();
    page.destroy();
    return {
      index,
      label: String(index + 1),
      bounds,
      elements,
      scanned: charCount === 0 && imageCount > 0,
      insertable,
      insertionLimitation: insertable
        ? undefined
        : "Adding or replacing page content is disabled on rotated pages to preserve their coordinate system.",
    };
  }

  async renderPage(
    pageIndex: number,
    operations: EditOperation[],
    scale = 1.35,
  ): Promise<RenderedPage> {
    const bytes = operations.length
      ? await this.export(operations)
      : this.requireBytes().slice();
    const doc = this.openPdf(bytes);
    const page = doc.loadPage(pageIndex);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    const png = pixmap.asPNG();
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(png)], { type: "image/png" }),
    );
    const width = pixmap.getWidth();
    const height = pixmap.getHeight();
    pixmap.destroy();
    page.destroy();
    doc.destroy();
    return { url, width, height };
  }

  async export(operations: EditOperation[]): Promise<Uint8Array> {
    if (!operations.length) return this.requireBytes().slice();
    const doc = this.openPdf(this.requireBytes());
    try {
      const fonts = this.getFonts();
      const originalAnnotations: Array<PDFObject | null> = [];
      for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex += 1) {
        const page = doc.loadPage(pageIndex) as PDFPage;
        try {
          const pageObject = page.getObject();
          const annotations = pageObject.get("Annots");
          originalAnnotations.push(annotations.isNull() ? null : annotations);
          pageObject.put("Annots", doc.newArray());
        } finally {
          page.destroy();
        }
      }
      for (const operation of operations) {
        const page = doc.loadPage(operation.pageIndex) as PDFPage;
        try {
          const transform = page.getTransform();
          if (
            Math.abs(transform[1]) >= 0.01 ||
            Math.abs(transform[2]) >= 0.01
          ) {
            throw new Error(
              "This edit is on a rotated page. PDF Folio left it unchanged to preserve the page coordinate system.",
            );
          }
          if (operation.kind === "replace-text") {
            this.removeText(page, operation.sourceRect ?? operation.rect);
            if (operation.text) await this.insertText(page, operation, fonts);
          } else if (operation.kind === "add-text" && operation.text) {
            await this.insertText(page, operation, fonts);
          } else if (operation.kind === "replace-image") {
            this.removeImage(page, operation.sourceRect ?? operation.rect);
            if (operation.imageBytes)
              this.insertImage(page, operation.rect, operation.imageBytes);
          } else if (operation.kind === "delete-image") {
            this.removeImage(page, operation.sourceRect ?? operation.rect);
          } else if (operation.kind === "add-image" && operation.imageBytes) {
            this.insertImage(page, operation.rect, operation.imageBytes);
          }
        } finally {
          page.destroy();
        }
      }
      doc.bake(true, false);
      for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex += 1) {
        const page = doc.loadPage(pageIndex) as PDFPage;
        try {
          const original = originalAnnotations[pageIndex];
          if (original) page.getObject().put("Annots", original);
          else page.getObject().delete("Annots");
        } finally {
          page.destroy();
        }
      }
      const saved = doc.saveToBuffer(
        "garbage=4,compress,compress-images,compress-fonts",
      );
      try {
        return new Uint8Array(saved.asUint8Array()).slice();
      } finally {
        saved.destroy();
      }
    } finally {
      doc.destroy();
    }
  }

  private removeText(page: PDFPage, rect: Rect) {
    const annotation = page.createAnnotation("Redact");
    try {
      annotation.setRect(rect);
      annotation.applyRedaction(
        0,
        mupdf.PDFPage.REDACT_IMAGE_NONE,
        mupdf.PDFPage.REDACT_LINE_ART_NONE,
        mupdf.PDFPage.REDACT_TEXT_REMOVE,
      );
    } finally {
      annotation.destroy();
    }
  }

  private removeImage(page: PDFPage, rect: Rect) {
    const annotation = page.createAnnotation("Redact");
    try {
      annotation.setRect(rect);
      annotation.applyRedaction(
        0,
        mupdf.PDFPage.REDACT_IMAGE_REMOVE,
        mupdf.PDFPage.REDACT_LINE_ART_NONE,
        mupdf.PDFPage.REDACT_TEXT_NONE,
      );
    } finally {
      annotation.destroy();
    }
  }

  private async insertText(
    page: PDFPage,
    operation: Extract<EditOperation, { kind: "replace-text" | "add-text" }>,
    fonts: FontDefinition[],
  ) {
    const definition =
      fonts.find((font) => font.id === operation.fontId) ?? fonts[0];
    const font = await loadFont(definition);
    try {
      const [x0, y0, x1, y1] = operation.rect;
      const width = Math.max(1, x1 - x0);
      const lines = layoutLines(
        font,
        operation.text,
        width,
        operation.fontSize,
      );
      const lineHeight = operation.fontSize * 1.2;
      const requiredHeight = Math.max(
        operation.fontSize * 1.25,
        lines.length * lineHeight,
      );
      const height = Math.max(requiredHeight, y1 - y0);
      const displayList = new mupdf.DisplayList([0, 0, width, height]);
      const device = new mupdf.DisplayListDevice(displayList);
      const text = new mupdf.Text();
      let annotation: PDFAnnotation | null = null;
      try {
        const sourceY = operation.sourceRect?.[1] ?? y0;
        const originalBaseline = operation.baseline
          ? operation.baseline - sourceY
          : operation.fontSize;
        const firstBaseline = Math.max(
          operation.fontSize * 0.86,
          Math.min(height - operation.fontSize * 0.15, originalBaseline),
        );
        lines.forEach((line, index) => {
          text.showString(
            font,
            [
              operation.fontSize,
              0,
              0,
              -operation.fontSize,
              0,
              firstBaseline + index * lineHeight,
            ],
            line,
          );
        });
        device.fillText(
          text,
          mupdf.Matrix.identity,
          mupdf.ColorSpace.DeviceRGB,
          hexToColor(operation.color),
          1,
        );
        device.close();
        annotation = page.createAnnotation("FreeText");
        annotation.setRect([x0, y0, x0 + width, y0 + height]);
        annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
        annotation.setAppearanceFromDisplayList(
          "N",
          null,
          mupdf.Matrix.identity,
          displayList,
        );
        annotation.update();
      } finally {
        annotation?.destroy();
        text.destroy();
        device.destroy();
        displayList.destroy();
      }
    } finally {
      font.destroy();
    }
  }

  private insertImage(page: PDFPage, rect: Rect, bytes: Uint8Array) {
    const image = new mupdf.Image(bytes);
    let annotation: PDFAnnotation | null = null;
    try {
      annotation = page.createAnnotation("Stamp");
      annotation.setRect(rect);
      annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
      annotation.setStampImage(image);
      annotation.update();
    } finally {
      annotation?.destroy();
      image.destroy();
    }
  }

  private openPdf(bytes: Uint8Array) {
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    if (doc.needsPassword() && doc.authenticatePassword(this.password) === 0) {
      doc.destroy();
      throw new PasswordRequiredError(true);
    }
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("The PDF editing layer is unavailable.");
    return pdf;
  }

  private requireBytes() {
    if (!this.originalBytes) throw new Error("Open a PDF first.");
    return this.originalBytes;
  }
}

export function unionRect(a: Rect, b: Rect): Rect {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

export function quadToRect(quad: Quad): Rect {
  return [
    Math.min(quad[0], quad[2], quad[4], quad[6]),
    Math.min(quad[1], quad[3], quad[5], quad[7]),
    Math.max(quad[0], quad[2], quad[4], quad[6]),
    Math.max(quad[1], quad[3], quad[5], quad[7]),
  ];
}

function colorToHex(color: Color | number): string {
  if (typeof color === "number") {
    const r = (color >>> 16) & 255;
    const g = (color >>> 8) & 255;
    const b = color & 255;
    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }
  const channels =
    color.length === 1 ? [color[0], color[0], color[0]] : color.slice(0, 3);
  return `#${channels
    .map((part: number) =>
      Math.round(part * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function rectsOverlap(a: Rect, b: Rect) {
  const overlapWidth = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const overlapHeight = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return overlapWidth > 0.5 && overlapHeight > 0.5;
}

function layoutLines(
  font: Font,
  text: string,
  maxWidth: number,
  fontSize: number,
) {
  const result: string[] = [];
  const measure = (value: string) =>
    Array.from(value).reduce((width, character) => {
      const glyph = font.encodeCharacter(character);
      if (glyph === 0 && !/\s/.test(character))
        throw new Error(
          `The selected font does not contain “${character}”. Choose a font with the required glyphs.`,
        );
      return width + font.advanceGlyph(glyph) * fontSize;
    }, 0);
  for (const character of Array.from(text)) measure(character);
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      result.push("");
      continue;
    }
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && measure(line + character) > maxWidth) {
        const breakAt = line.lastIndexOf(" ");
        if (breakAt > 0) {
          result.push(line.slice(0, breakAt).trimEnd());
          line = `${line.slice(breakAt + 1)}${character}`.trimStart();
        } else {
          result.push(line);
          line = character.trimStart();
        }
      } else {
        line += character;
      }
    }
    result.push(line);
  }
  return result.length ? result : [""];
}

function hexToColor(hex: string): Color {
  const value = hex.replace("#", "").padEnd(6, "0");
  return [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  ) as Color;
}
