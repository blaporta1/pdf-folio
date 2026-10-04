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
  type Text,
} from "mupdf";
import { allFonts, loadFont, suggestedFontId } from "./fonts";
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

interface DocumentFontRecord {
  key: string;
  definition: FontDefinition;
  font: Font;
  glyphs: Map<number, number>;
  ambiguousGlyphs: Set<number>;
  pdfObjectNumber?: number;
  characterCodes?: Map<number, Uint8Array>;
}

interface ResourceFontInfo {
  fontName: string;
  objectNumber?: number;
  characterCodes: Map<number, Uint8Array>;
}

interface CapturedGlyph {
  x: number;
  y: number;
  codePoint: number;
  record?: DocumentFontRecord;
  advance: number;
  horizontalScale: number;
  safeTransform: boolean;
}

interface TextFormatMetrics {
  horizontalScale?: number;
  characterSpacing?: number;
  wordSpacing?: number;
  noWrap?: boolean;
}

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
  private documentFonts = new Map<string, DocumentFontRecord>();
  private documentFontSequence = 0;

  addFont(font: FontDefinition) {
    this.customFonts = [...this.customFonts, font];
  }

  addFonts(fonts: FontDefinition[]) {
    const existing = new Set(this.customFonts.map((font) => font.id));
    const added: FontDefinition[] = [];
    for (const font of fonts) {
      const key = font.id;
      if (existing.has(key)) continue;
      existing.add(key);
      added.push(font);
    }
    this.customFonts = [...this.customFonts, ...added];
    return added.length;
  }

  getFonts() {
    return [
      ...Array.from(this.documentFonts.values(), (record) => record.definition),
      ...allFonts(this.customFonts),
    ];
  }

  async validateText(
    fontId: string,
    text: string,
    width: number,
    fontSize: number,
    format: TextFormatMetrics = {},
  ) {
    const definition = this.getFonts().find((font) => font.id === fontId);
    if (!definition) throw new Error("Choose an available font.");
    const acquired = await this.acquireFont(definition);
    try {
      const lines = layoutLines(
        acquired.font,
        text,
        Math.max(1, width),
        fontSize,
        acquired.resolveGlyph,
        format,
      );
      const naturalWidth = Math.max(
        0,
        ...text
          .split("\n")
          .map((line) =>
            measureTextWidth(
              acquired.font,
              line,
              fontSize,
              acquired.resolveGlyph,
              format,
            ),
          ),
      );
      return {
        lines,
        naturalWidth,
        requiredHeight: Math.max(
          fontSize * 1.25,
          lines.length * fontSize * 1.2,
        ),
      };
    } finally {
      acquired.font.destroy();
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
    this.clearDocumentFonts();
    try {
      this.originalBytes = bytes.slice();
      this.password = password;
      const pageCount = pdf.countPages();
      const pages: PageModel[] = [];
      for (let index = 0; index < pageCount; index += 1)
        pages.push(this.extractPage(pdf, index));
      const title = pdf.getMetaData(mupdf.Document.META_INFO_TITLE);
      return { name, size: bytes.byteLength, pageCount, pages, title };
    } catch (error) {
      this.clearDocumentFonts();
      this.originalBytes = null;
      throw error;
    } finally {
      pdf.destroy();
    }
  }

  private extractPage(doc: PDFDocument, index: number): PageModel {
    const page = doc.loadPage(index);
    const bounds = page.getBounds() as Rect;
    const pageTransform = page.getTransform();
    const insertable =
      Math.abs(pageTransform[1]) < 0.01 && Math.abs(pageTransform[2]) < 0.01;
    const elements: Array<TextElement | ImageElement> = [];
    const capturedGlyphs = this.capturePageFonts(page, index);
    const text = page.toStructuredText("preserve-spans,preserve-images");
    let line = { direction: [1, 0] as [number, number], index: 0 };
    let span: Omit<TextElement, "id" | "kind" | "pageIndex"> | null = null;
    let spanKey = "";
    let previousGlyph: CapturedGlyph | undefined;
    let spacingSamples: number[] = [];
    let wordSpacingSamples: number[] = [];
    let scaleSamples: number[] = [];
    let safeFormatting = true;
    let charCount = 0;
    let imageCount = 0;
    const flush = () => {
      if (!span || !span.text.trim()) {
        span = null;
        previousGlyph = undefined;
        spacingSamples = [];
        wordSpacingSamples = [];
        scaleSamples = [];
        safeFormatting = true;
        return;
      }
      const characterSpacing = median(spacingSamples) ?? 0;
      const wordSpacing = (median(wordSpacingSamples) ?? characterSpacing) - characterSpacing;
      const horizontalScale = median(scaleSamples) ?? 1;
      const spacingStable =
        stableSamples(spacingSamples, Math.max(0.2, span.fontSize * 0.025)) &&
        stableSamples(wordSpacingSamples, Math.max(0.2, span.fontSize * 0.025)) &&
        stableSamples(scaleSamples, 0.015);
      span.horizontalScale = horizontalScale;
      span.characterSpacing = characterSpacing;
      span.wordSpacing = wordSpacing;
      if (span.editable && (!safeFormatting || !spacingStable)) {
        span.editable = false;
        span.limitation =
          "This text uses mixed or individually positioned glyph spacing that PDF Folio cannot safely reproduce.";
      }
      elements.push({
        ...span,
        id: `p${index}-t${elements.length}`,
        kind: "text",
        pageIndex: index,
      });
      span = null;
      previousGlyph = undefined;
      spacingSamples = [];
      wordSpacingSamples = [];
      scaleSamples = [];
      safeFormatting = true;
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
        try {
          charCount += 1;
          const rect = quadToRect(quad);
          const colorHex = colorToHex(color);
          const captured = findCapturedGlyph(capturedGlyphs, character, origin);
          const record = captured?.record;
          const baseFontId = suggestedFontId(font.getName());
          const fontId = record?.definition.id ?? baseFontId;
          const exact = Boolean(record || baseFontId);
          const key = `${line.index}:${fontId ?? font.getName()}:${size.toFixed(2)}:${colorHex}:${bidi}`;
          const horizontal =
            Math.abs(line.direction[1]) < 0.02 &&
            Math.abs(quad[1] - quad[3]) < 0.5;
          if (span && key === spanKey) {
            if (captured && previousGlyph) {
              const gap = captured.x - previousGlyph.x - previousGlyph.advance;
              if (span.text.endsWith(" ")) wordSpacingSamples.push(gap);
              else spacingSamples.push(gap);
            }
            if (captured) {
              scaleSamples.push(captured.horizontalScale);
              safeFormatting &&= captured.safeTransform;
            }
            span.text += character;
            span.rect = unionRect(span.rect, rect);
          } else {
            flush();
            spanKey = key;
            span = {
              rect,
              text: character,
              fontName: font.getName(),
              fontId,
              fontExactAvailable: exact,
              fontAvailabilityReason: record
                ? record.definition.subset
                  ? "Exact embedded original font (subset)"
                  : "Exact embedded original font"
                : baseFontId
                  ? "Exact PDF base font"
                  : "The original font cannot be safely reused from this PDF. Upload the matching TTF/OTF or explicitly choose a replacement font.",
              fontSize: size,
              baseline: origin[1],
              horizontalScale: captured?.horizontalScale ?? 1,
              characterSpacing: 0,
              wordSpacing: 0,
              color: colorHex,
              editable: horizontal,
              limitation: horizontal
                ? undefined
                : "Rotated or vertical text is view-only to avoid damaging its layout.",
            };
            scaleSamples = captured ? [captured.horizontalScale] : [1];
            spacingSamples = [];
            wordSpacingSamples = [];
            safeFormatting = captured?.safeTransform ?? horizontal;
          }
          previousGlyph = captured;
        } finally {
          font.destroy();
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

  private capturePageFonts(page: PDFPage, pageIndex: number): CapturedGlyph[] {
    const embeddedFonts = embeddedFontResources(page);
    const recordsByPointer = new Map<number, DocumentFontRecord>();
    const glyphs: CapturedGlyph[] = [];
    const visitText = (text: Text, ctm: Matrix) => {
      text.walk({
        showGlyph: (font, transform, glyph, unicode) => {
          try {
            const name = font.getName();
            const candidates = embeddedFonts.filter(
              (candidate) => candidate.fontName === name,
            );
            let record = recordsByPointer.get(font.pointer as number);
            if (!record && candidates.length === 1) {
              const resource = candidates[0];
              const subset = /^[A-Z]{6}\+/.test(name);
              if (!subset || (resource.objectNumber && resource.characterCodes.size)) {
                const sequence = this.documentFontSequence++;
                const key = `document-font-${sequence}`;
                const definition: FontDefinition = {
                  id: key,
                  family: displayFontName(name),
                  category: "Document original",
                  source: subset
                    ? "Exact embedded original font subset"
                    : "Exact embedded original font",
                  documentFontKey: key,
                  exactOriginal: true,
                  subset,
                  coverage: subset
                    ? "Glyphs embedded in this PDF"
                    : "Defined by the embedded font",
                };
                record = {
                  key,
                  definition,
                  font: new mupdf.Font(font.pointer),
                  glyphs: new Map(),
                  ambiguousGlyphs: new Set(),
                  pdfObjectNumber: resource.objectNumber,
                  characterCodes: resource.characterCodes,
                };
                recordsByPointer.set(font.pointer as number, record);
                this.documentFonts.set(key, record);
              }
            }
            if (record) {
              const existing = record.glyphs.get(unicode);
              if (existing !== undefined && existing !== glyph)
                record.ambiguousGlyphs.add(unicode);
              else record.glyphs.set(unicode, glyph);
            }
            const point = transformPoint(ctm, transform[4], transform[5]);
            const xVector = transformVector(ctm, transform[0], transform[1]);
            const yVector = transformVector(ctm, transform[2], transform[3]);
            const xLength = Math.hypot(...xVector);
            const yLength = Math.hypot(...yVector);
            const horizontalScale = yLength > 0.001 ? xLength / yLength : 1;
            glyphs.push({
              x: point[0],
              y: point[1],
              codePoint: unicode,
              record,
              advance: font.advanceGlyph(glyph) * xLength,
              horizontalScale,
              safeTransform:
                yLength > 0.001 &&
                Math.abs(xVector[1]) < Math.max(0.02, xLength * 0.02) &&
                Math.abs(yVector[0]) < Math.max(0.02, yLength * 0.02),
            });
          } finally {
            font.destroy();
          }
        },
      });
    };
    const device = new mupdf.Device({
      fillText: (text, ctm) => visitText(text, ctm),
      strokeText: (text, _stroke, ctm) => visitText(text, ctm),
      clipText: (text, ctm) => visitText(text, ctm),
      clipStrokeText: (text, _stroke, ctm) => visitText(text, ctm),
      ignoreText: (text, ctm) => visitText(text, ctm),
    });
    try {
      page.runPageContents(device, mupdf.Matrix.identity);
      device.close();
    } catch {
      // Selection still works when an unusual content stream cannot be walked.
    } finally {
      device.destroy();
    }
    return glyphs;
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
    const effectiveOperations = operations.filter(
      (operation) => !isNoopTextOperation(operation),
    );
    if (!effectiveOperations.length) return this.requireBytes().slice();
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
      for (const operation of effectiveOperations) {
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
    const definition = fonts.find((font) => font.id === operation.fontId);
    if (!definition) throw new Error("Choose an available font.");
    const acquired = await this.acquireFont(definition);
    const font = acquired.font;
    try {
      const [x0, y0, x1, y1] = operation.rect;
      const width = Math.max(1, x1 - x0);
      const lines = layoutLines(
        font,
        operation.text,
        width,
        operation.fontSize,
        acquired.resolveGlyph,
        operation,
      );
      if (operation.noWrap) {
        const naturalWidth = measureTextWidth(
          font,
          operation.text,
          operation.fontSize,
          acquired.resolveGlyph,
          operation,
        );
        if (naturalWidth > width + 0.1)
          throw new Error(
            "This single line no longer fits its text box. Widen or reposition the box, reduce the font size, or add an explicit line break.",
          );
      }
      const lineHeight = operation.fontSize * 1.2;
      const requiredHeight = Math.max(
        operation.fontSize * 1.25,
        lines.length * lineHeight,
      );
      const height = Math.max(requiredHeight, y1 - y0);
      if (
        definition.subset &&
        acquired.pdfObjectNumber &&
        acquired.characterCodes
      ) {
        this.insertOriginalSubsetText(
          page,
          operation,
          lines,
          acquired.pdfObjectNumber,
          acquired.characterCodes,
        );
        return;
      }
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
          const baseline = firstBaseline + index * lineHeight;
          let x = 0;
          const horizontalScale = operation.horizontalScale ?? 1;
          for (const character of Array.from(line)) {
            const codePoint = character.codePointAt(0)!;
            const glyph = acquired.resolveGlyph(character);
            text.showGlyph(
              font,
              [
                operation.fontSize * horizontalScale,
                0,
                0,
                -operation.fontSize,
                x,
                baseline,
              ],
              glyph,
              codePoint,
            );
            x +=
              font.advanceGlyph(glyph) * operation.fontSize * horizontalScale +
              (operation.characterSpacing ?? 0) +
              (character === " " ? operation.wordSpacing ?? 0 : 0);
          }
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

  private insertOriginalSubsetText(
    page: PDFPage,
    operation: Extract<EditOperation, { kind: "replace-text" | "add-text" }>,
    lines: string[],
    pdfObjectNumber: number,
    characterCodes: Map<number, Uint8Array>,
  ) {
    const doc = page._doc;
    const pageObject = page.getObject();
    const inherited = pageObject.getInheritable("Resources").resolve();
    const resources = doc.newDictionary();
    if (inherited.isDictionary())
      inherited.forEach((value, key) => resources.put(key, value));
    const inheritedFontValue = inherited.get("Font");
    const inheritedFonts = inheritedFontValue.isIndirect()
      ? inheritedFontValue.resolve()
      : inheritedFontValue;
    const fonts = doc.newDictionary();
    if (inheritedFonts.isDictionary())
      inheritedFonts.forEach((value, key) => fonts.put(key, value));
    let alias: string;
    do alias = `FolioOriginal${this.documentFontSequence++}`;
    while (!fonts.get(alias).isNull());
    fonts.put(alias, doc.newIndirect(pdfObjectNumber));
    resources.put("Font", fonts);
    pageObject.put("Resources", resources);

    const [x0, y0] = operation.rect;
    const sourceY = operation.sourceRect?.[1] ?? y0;
    const baselineOffset = operation.baseline
      ? operation.baseline - sourceY
      : operation.fontSize;
    const firstBaseline = y0 + baselineOffset;
    const lineHeight = operation.fontSize * 1.2;
    const inverse = mupdf.Matrix.invert(page.getTransform());
    const color = hexToColor(operation.color) as [number, number, number];
    const commands = [
      "Q",
      "q",
      `${color[0]} ${color[1]} ${color[2]} rg`,
      "BT",
      `${(operation.characterSpacing ?? 0) / (operation.horizontalScale ?? 1)} Tc ${(operation.wordSpacing ?? 0) / (operation.horizontalScale ?? 1)} Tw ${(operation.horizontalScale ?? 1) * 100} Tz 0 Ts 0 Tr`,
    ];
    lines.forEach((line, index) => {
      const point = transformPoint(
        inverse,
        x0,
        firstBaseline + index * lineHeight,
      );
      const encoded: number[] = [];
      for (const character of Array.from(line)) {
        const code = characterCodes.get(character.codePointAt(0)!);
        if (!code)
          throw new Error(
            `The exact original font cannot safely encode “${character}”. Upload the matching TTF/OTF or explicitly choose another font.`,
          );
        encoded.push(...code);
      }
      const hex = encoded
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      commands.push(
        `/${alias} ${operation.fontSize} Tf`,
        `1 0 0 1 ${point[0]} ${point[1]} Tm`,
        `<${hex}> Tj`,
      );
    });
    commands.push("ET", "Q");
    const prefix = doc.addStream(new TextEncoder().encode("q\n"), {});
    const stream = doc.addStream(new TextEncoder().encode(commands.join("\n")), {});
    const contents = pageObject.get("Contents");
    const array = doc.newArray();
    array.push(prefix);
    if (contents.isArray())
      for (let index = 0; index < contents.length; index += 1)
        array.push(contents.get(index));
    else if (!contents.isNull()) array.push(contents);
    array.push(stream);
    pageObject.put("Contents", array);
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

  private async acquireFont(definition: FontDefinition) {
    if (definition.documentFontKey) {
      const record = this.documentFonts.get(definition.documentFontKey);
      if (!record)
        throw new Error(
          "The original document font is no longer available. Reopen the PDF or choose another font.",
        );
      const font = new mupdf.Font(record.font.pointer);
      const glyphs = new Map(record.glyphs);
      const ambiguous = new Set(record.ambiguousGlyphs);
      return {
        font,
        pdfObjectNumber: record.pdfObjectNumber,
        characterCodes: record.characterCodes
          ? new Map(record.characterCodes)
          : undefined,
        resolveGlyph: (character: string) => {
          const codePoint = character.codePointAt(0)!;
          let glyph = font.encodeCharacter(codePoint);
          if (!glyph && !ambiguous.has(codePoint)) glyph = glyphs.get(codePoint) ?? 0;
          if (!glyph)
            throw new Error(
              `The exact original font “${definition.family}” does not contain “${character}”. ${definition.subset ? "This PDF embeds only a subset of that font. " : ""}Upload the matching TTF/OTF or explicitly choose another font.`,
            );
          return glyph;
        },
      };
    }
    const font = await loadFont(definition);
    return {
      font,
      resolveGlyph: (character: string) => {
        const codePoint = character.codePointAt(0)!;
        const glyph = font.encodeCharacter(codePoint);
        if (!glyph)
          throw new Error(
            `The selected font does not contain “${character}”. Choose a font with the required glyphs.`,
          );
        return glyph;
      },
    };
  }

  private clearDocumentFonts() {
    for (const record of this.documentFonts.values()) record.font.destroy();
    this.documentFonts.clear();
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

function embeddedFontResources(page: PDFPage) {
  const result: ResourceFontInfo[] = [];
  const visited = new Set<number>();
  const seenFonts = new Set<string>();
  try {
    const scanResources = (resources: PDFObject) => {
      resources = resolvePdfObject(resources);
      if (!resources.isDictionary()) return;
      const fonts = resolvePdfObject(resources.get("Font"));
      if (fonts.isDictionary())
        fonts.forEach((value) => {
          const objectNumber = value.isIndirect()
            ? value.asIndirect()
            : undefined;
          const font = resolvePdfObject(value);
          const subtype = font.get("Subtype");
          if (subtype.isName() && subtype.asName() === "Type3") return;
          const baseFont = font.get("BaseFont");
          let descriptor = font.get("FontDescriptor");
          if (descriptor.isNull()) {
            const descendants = font.get("DescendantFonts");
            if (descendants.isArray() && descendants.length)
              descriptor = resolvePdfObject(descendants.get(0)).get(
                "FontDescriptor",
              );
          }
          descriptor = resolvePdfObject(descriptor);
          if (!descriptor.isDictionary() || !baseFont.isName()) return;
          const embedded = ["FontFile", "FontFile2", "FontFile3"].some(
            (key) => !descriptor.get(key).isNull(),
          );
          if (!embedded) return;
          const fontName = baseFont.asName();
          const identity = `${objectNumber ?? "direct"}:${fontName}`;
          if (seenFonts.has(identity)) return;
          seenFonts.add(identity);
          result.push({
            fontName,
            objectNumber,
            characterCodes: inverseToUnicode(font.get("ToUnicode")),
          });
        });
      const xObjects = resolvePdfObject(resources.get("XObject"));
      if (!xObjects.isDictionary()) return;
      xObjects.forEach((value) => {
        const number = value.isIndirect() ? value.asIndirect() : -1;
        if (number >= 0 && visited.has(number)) return;
        if (number >= 0) visited.add(number);
        const object = resolvePdfObject(value);
        const nested = object.get("Resources");
        if (!nested.isNull()) scanResources(nested);
      });
    };
    scanResources(page.getObject().getInheritable("Resources"));
  } catch {
    // Missing or malformed resource dictionaries simply mean no exact font offer.
  }
  return result;
}

function resolvePdfObject(value: PDFObject) {
  return value.isIndirect() ? value.resolve() : value;
}

function inverseToUnicode(value: PDFObject) {
  const result = new Map<number, Uint8Array>();
  try {
    if (value.isNull()) return result;
    const buffer = value.readStream();
    let source = "";
    try {
      source = buffer.asString();
    } finally {
      buffer.destroy();
    }
    const add = (sourceHex: string, unicodeHex: string) => {
      const unicodeBytes = hexBytes(unicodeHex);
      if (!unicodeBytes.length) return;
      let text = "";
      for (let index = 0; index + 1 < unicodeBytes.length; index += 2)
        text += String.fromCharCode(
          (unicodeBytes[index] << 8) | unicodeBytes[index + 1],
        );
      const points = Array.from(text);
      if (points.length === 1)
        result.set(points[0].codePointAt(0)!, hexBytes(sourceHex));
    };
    for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const match of block[1].matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      ))
        add(match[1], match[2]);
    for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const match of block[1].matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      )) {
        const start = Number.parseInt(match[1], 16);
        const end = Number.parseInt(match[2], 16);
        const unicodeStart = Number.parseInt(match[3], 16);
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          !Number.isSafeInteger(unicodeStart) ||
          start < 0 ||
          end < start ||
          end > 0xffffffff ||
          end - start > 65535 ||
          unicodeStart < 0 ||
          unicodeStart + end - start > 0x10ffff
        )
          continue;
        const width = match[1].length / 2;
        for (let code = start; code <= end; code += 1) {
          const sourceHex = code.toString(16).padStart(width * 2, "0");
          const unicodeHex = (unicodeStart + code - start)
            .toString(16)
            .padStart(4, "0");
          add(sourceHex, unicodeHex);
        }
      }
  } catch {
    return new Map<number, Uint8Array>();
  }
  return result;
}

function hexBytes(hex: string) {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function displayFontName(name: string) {
  return name.replace(/^[A-Z]{6}\+/, "").replace(/[-_]/g, " ");
}

function transformPoint(matrix: Matrix, x: number, y: number): [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
}

function transformVector(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y, matrix[1] * x + matrix[3] * y];
}

function findCapturedGlyph(
  glyphs: CapturedGlyph[],
  character: string,
  origin: [number, number],
) {
  const codePoint = character.codePointAt(0)!;
  let best: CapturedGlyph | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const glyph of glyphs) {
    if (glyph.codePoint !== codePoint) continue;
    const next = Math.abs(glyph.x - origin[0]) + Math.abs(glyph.y - origin[1]);
    if (next < distance) {
      best = glyph;
      distance = next;
    }
  }
  return distance < 2 ? best : undefined;
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stableSamples(values: number[], tolerance: number) {
  if (values.length < 2) return true;
  const center = median(values)!;
  return values.every((value) => Math.abs(value - center) <= tolerance);
}

function isNoopTextOperation(operation: EditOperation) {
  if (
    operation.kind !== "replace-text" ||
    operation.sourceText === undefined ||
    !operation.sourceRect ||
    operation.sourceFontId === undefined ||
    operation.sourceFontSize === undefined ||
    operation.sourceColor === undefined
  )
    return false;
  const sameRect = operation.rect.every(
    (value, index) => Math.abs(value - operation.sourceRect![index]) < 0.001,
  );
  return (
    sameRect &&
    operation.text === operation.sourceText &&
    operation.fontId === operation.sourceFontId &&
    Math.abs(operation.fontSize - operation.sourceFontSize) < 0.001 &&
    operation.color.toLowerCase() === operation.sourceColor.toLowerCase() &&
    Math.abs(
      (operation.horizontalScale ?? 1) -
        (operation.sourceHorizontalScale ?? 1),
    ) < 0.001 &&
    Math.abs(
      (operation.characterSpacing ?? 0) -
        (operation.sourceCharacterSpacing ?? 0),
    ) < 0.001 &&
    Math.abs(
      (operation.wordSpacing ?? 0) - (operation.sourceWordSpacing ?? 0),
    ) < 0.001
  );
}

function layoutLines(
  font: Font,
  text: string,
  maxWidth: number,
  fontSize: number,
  resolveGlyph: (character: string) => number,
  format: TextFormatMetrics = {},
) {
  const horizontalScale = format.horizontalScale ?? 1;
  const characterSpacing = format.characterSpacing ?? 0;
  const wordSpacing = format.wordSpacing ?? 0;
  const result: string[] = [];
  const measure = (value: string) =>
    measureTextWidth(font, value, fontSize, resolveGlyph, {
      horizontalScale,
      characterSpacing,
      wordSpacing,
    });
  for (const character of Array.from(text))
    if (character !== "\n") measure(character);
  if (format.noWrap) return text.split("\n");
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

function measureTextWidth(
  font: Font,
  text: string,
  fontSize: number,
  resolveGlyph: (character: string) => number,
  format: TextFormatMetrics = {},
) {
  const horizontalScale = format.horizontalScale ?? 1;
  const characterSpacing = format.characterSpacing ?? 0;
  const wordSpacing = format.wordSpacing ?? 0;
  return Array.from(text).reduce((width, character) => {
    const glyph = resolveGlyph(character);
    return (
      width +
      font.advanceGlyph(glyph) * fontSize * horizontalScale +
      characterSpacing +
      (character === " " ? wordSpacing : 0)
    );
  }, 0);
}

function hexToColor(hex: string): Color {
  const value = hex.replace("#", "").padEnd(6, "0");
  return [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  ) as Color;
}
