import mupdf, { type Font } from "mupdf";
import type { FontDefinition } from "./types";

export const bundledFonts: FontDefinition[] = [
  {
    id: "inter",
    family: "Inter",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Inter.ttf",
    coverage: "Latin, Greek, Cyrillic",
  },
  {
    id: "noto-sans",
    family: "Noto Sans",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/NotoSans.ttf",
    coverage: "Latin, Greek and Cyrillic",
  },
  {
    id: "source-serif",
    family: "Source Serif 4",
    category: "Serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/SourceSerif4.ttf",
    coverage: "Latin, Greek, Cyrillic",
  },
  {
    id: "lora",
    family: "Lora",
    category: "Serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Lora.ttf",
    coverage: "Latin and Cyrillic",
  },
  {
    id: "jetbrains-mono",
    family: "JetBrains Mono",
    category: "Monospace",
    source: "SIL Open Font License 1.1",
    file: "/fonts/JetBrainsMono.ttf",
    coverage: "Latin, Greek, Cyrillic",
  },
  {
    id: "caveat",
    family: "Caveat",
    category: "Handwritten",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Caveat.ttf",
    coverage: "Latin and Cyrillic",
  },
  {
    id: "open-sans",
    family: "Open Sans",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/OpenSans.ttf",
    coverage: "Common Latin",
  },
  {
    id: "montserrat",
    family: "Montserrat",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Montserrat.ttf",
    coverage: "Common Latin",
  },
  {
    id: "poppins",
    family: "Poppins",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Poppins.ttf",
    coverage: "Common Latin",
  },
  {
    id: "nunito",
    family: "Nunito",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Nunito.ttf",
    coverage: "Common Latin",
  },
  {
    id: "raleway",
    family: "Raleway",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Raleway.ttf",
    coverage: "Common Latin",
  },
  {
    id: "dm-sans",
    family: "DM Sans",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/DMSans.ttf",
    coverage: "Common Latin",
  },
  {
    id: "work-sans",
    family: "Work Sans",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/WorkSans.ttf",
    coverage: "Common Latin",
  },
  {
    id: "fira-sans",
    family: "Fira Sans",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/FiraSans.ttf",
    coverage: "Common Latin",
  },
  {
    id: "oswald",
    family: "Oswald",
    category: "Sans serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Oswald.ttf",
    coverage: "Common Latin",
  },
  {
    id: "merriweather",
    family: "Merriweather",
    category: "Serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/Merriweather.ttf",
    coverage: "Common Latin",
  },
  {
    id: "playfair-display",
    family: "Playfair Display",
    category: "Serif",
    source: "SIL Open Font License 1.1",
    file: "/fonts/PlayfairDisplay.ttf",
    coverage: "Common Latin",
  },
  {
    id: "fira-code",
    family: "Fira Code",
    category: "Monospace",
    source: "SIL Open Font License 1.1",
    file: "/fonts/FiraCode.ttf",
    coverage: "Common Latin",
  },
];

export const baseFonts: FontDefinition[] = [
  {
    id: "base-helvetica",
    family: "Helvetica",
    category: "Document original",
    source: "PDF base font",
    base14: "Helvetica",
    coverage: "Latin",
  },
  {
    id: "base-helvetica-bold",
    family: "Helvetica Bold",
    category: "Document original",
    source: "PDF base font",
    base14: "Helvetica-Bold",
    coverage: "Latin",
  },
  {
    id: "base-helvetica-oblique",
    family: "Helvetica Oblique",
    category: "Document original",
    source: "PDF base font",
    base14: "Helvetica-Oblique",
    coverage: "Latin",
  },
  {
    id: "base-helvetica-bold-oblique",
    family: "Helvetica Bold Oblique",
    category: "Document original",
    source: "PDF base font",
    base14: "Helvetica-BoldOblique",
    coverage: "Latin",
  },
  {
    id: "base-times",
    family: "Times Roman",
    category: "Document original",
    source: "PDF base font",
    base14: "Times-Roman",
    coverage: "Latin",
  },
  {
    id: "base-times-bold",
    family: "Times Bold",
    category: "Document original",
    source: "PDF base font",
    base14: "Times-Bold",
    coverage: "Latin",
  },
  {
    id: "base-times-italic",
    family: "Times Italic",
    category: "Document original",
    source: "PDF base font",
    base14: "Times-Italic",
    coverage: "Latin",
  },
  {
    id: "base-times-bold-italic",
    family: "Times Bold Italic",
    category: "Document original",
    source: "PDF base font",
    base14: "Times-BoldItalic",
    coverage: "Latin",
  },
  {
    id: "base-courier",
    family: "Courier",
    category: "Document original",
    source: "PDF base font",
    base14: "Courier",
    coverage: "Latin",
  },
  {
    id: "base-courier-bold",
    family: "Courier Bold",
    category: "Document original",
    source: "PDF base font",
    base14: "Courier-Bold",
    coverage: "Latin",
  },
  {
    id: "base-courier-oblique",
    family: "Courier Oblique",
    category: "Document original",
    source: "PDF base font",
    base14: "Courier-Oblique",
    coverage: "Latin",
  },
  {
    id: "base-courier-bold-oblique",
    family: "Courier Bold Oblique",
    category: "Document original",
    source: "PDF base font",
    base14: "Courier-BoldOblique",
    coverage: "Latin",
  },
  {
    id: "base-symbol",
    family: "Symbol",
    category: "Document original",
    source: "PDF base font",
    base14: "Symbol",
    coverage: "Symbols",
  },
  {
    id: "base-zapf",
    family: "Zapf Dingbats",
    category: "Document original",
    source: "PDF base font",
    base14: "ZapfDingbats",
    coverage: "Symbols",
  },
];

const fontBytes = new Map<string, Uint8Array>();

export function allFonts(customFonts: FontDefinition[] = []) {
  return [...bundledFonts, ...baseFonts, ...customFonts];
}

export async function loadFont(definition: FontDefinition): Promise<Font> {
  if (definition.base14) return new mupdf.Font(definition.base14);
  let bytes = definition.bytes ?? fontBytes.get(definition.id);
  if (!bytes && definition.file) {
    const response = await fetch(definition.file);
    if (!response.ok) throw new Error(`Could not load ${definition.family}.`);
    bytes = new Uint8Array(await response.arrayBuffer());
    fontBytes.set(definition.id, bytes);
  }
  if (!bytes)
    throw new Error(`No font data is available for ${definition.family}.`);
  return new mupdf.Font(definition.family, bytes);
}

export function validateAndCreateUploadedFont(
  name: string,
  bytes: Uint8Array,
): FontDefinition {
  const font = new mupdf.Font(name, bytes);
  const family = font.getName() || name.replace(/\.(ttf|otf)$/i, "");
  font.destroy();
  return {
    id: `upload-${crypto.randomUUID()}`,
    family,
    category: "Document original",
    source: "Uploaded by you; available for this session only",
    bytes,
    uploaded: true,
    coverage: "Defined by the uploaded font",
  };
}

export function suggestedFontId(originalName: string) {
  const exact = matchingBaseFont(originalName);
  return exact?.id;
}

export function canPreserveOriginal(
  originalName: string,
  selectedFontId: string,
) {
  return matchingBaseFont(originalName)?.id === selectedFontId;
}

function matchingBaseFont(originalName: string) {
  const normalized = originalName
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/[\s,_]/g, "-")
    .toLowerCase();
  return baseFonts.find((font) => font.base14?.toLowerCase() === normalized);
}
