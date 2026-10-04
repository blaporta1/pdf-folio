export type Rect = [number, number, number, number];

export interface TextElement {
  id: string;
  kind: "text";
  pageIndex: number;
  rect: Rect;
  text: string;
  fontName: string;
  fontId?: string;
  fontExactAvailable: boolean;
  fontAvailabilityReason?: string;
  fontSize: number;
  baseline: number;
  horizontalScale: number;
  characterSpacing: number;
  wordSpacing: number;
  color: string;
  editable: boolean;
  limitation?: string;
}

export interface ImageElement {
  id: string;
  kind: "image";
  pageIndex: number;
  rect: Rect;
  width: number;
  height: number;
  imageBytes: Uint8Array;
  transform: [number, number, number, number, number, number];
  editable: boolean;
  limitation?: string;
}

export type PageElement = TextElement | ImageElement;

export interface PageModel {
  index: number;
  label: string;
  bounds: Rect;
  elements: PageElement[];
  scanned: boolean;
  insertable: boolean;
  insertionLimitation?: string;
}

export interface DocumentModel {
  name: string;
  size: number;
  pageCount: number;
  pages: PageModel[];
  title?: string;
}

interface BaseOperation {
  id: string;
  pageIndex: number;
  rect: Rect;
}

export interface TextOperation extends BaseOperation {
  kind: "replace-text" | "add-text";
  sourceId?: string;
  sourceRect?: Rect;
  baseline?: number;
  horizontalScale?: number;
  characterSpacing?: number;
  wordSpacing?: number;
  noWrap?: boolean;
  sourceText?: string;
  sourceFontId?: string;
  sourceFontSize?: number;
  sourceColor?: string;
  sourceHorizontalScale?: number;
  sourceCharacterSpacing?: number;
  sourceWordSpacing?: number;
  text: string;
  fontId: string;
  fontName: string;
  fontSize: number;
  color: string;
}

export interface ImageOperation extends BaseOperation {
  kind: "replace-image" | "add-image" | "delete-image";
  sourceId?: string;
  sourceRect?: Rect;
  fileName?: string;
  imageBytes?: Uint8Array;
}

export type EditOperation = TextOperation | ImageOperation;

export interface FontDefinition {
  id: string;
  family: string;
  category:
    "Sans serif" | "Serif" | "Monospace" | "Handwritten" | "Document original";
  source: string;
  file?: string;
  base14?: string;
  bytes?: Uint8Array;
  browserFile?: File;
  postscriptName?: string;
  styleName?: string;
  uploaded?: boolean;
  documentFontKey?: string;
  exactOriginal?: boolean;
  subset?: boolean;
  coverage: string;
}

export interface RenderedPage {
  url: string;
  width: number;
  height: number;
}
