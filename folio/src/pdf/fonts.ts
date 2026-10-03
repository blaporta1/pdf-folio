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
  if (!bytes && definition.browserFile)
    bytes = new Uint8Array(await definition.browserFile.arrayBuffer());
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
    postscriptName: family,
    uploaded: true,
    coverage: "Defined by the uploaded font",
  };
}

export async function indexUploadedFontFile(
  file: File,
): Promise<FontDefinition> {
  if (!/\.(ttf|otf)$/i.test(file.name))
    throw new Error("Only TTF and OTF fonts are supported.");
  if (file.size < 12 || file.size > 100 * 1024 * 1024)
    throw new Error("Font file size is outside the supported range.");
  const header = new DataView(await file.slice(0, Math.min(file.size, 65536)).arrayBuffer());
  if (header.byteLength < 12) throw new Error("Invalid OpenType header.");
  const signature = readTag(header, 0);
  if (signature === "ttcf")
    throw new Error("Font collections are not supported; choose individual TTF/OTF files.");
  if (!["\u0000\u0001\u0000\u0000", "OTTO", "true", "typ1"].includes(signature))
    throw new Error("Invalid TTF/OTF signature.");
  const tableCount = header.getUint16(4);
  if (tableCount < 1 || tableCount > 512 || 12 + tableCount * 16 > header.byteLength)
    throw new Error("Invalid OpenType table directory.");
  let nameOffset = -1;
  let nameLength = 0;
  let os2Offset = -1;
  let os2Length = 0;
  for (let index = 0; index < tableCount; index += 1) {
    const offset = 12 + index * 16;
    const tag = readTag(header, offset);
    if (tag === "name") {
      nameOffset = header.getUint32(offset + 8);
      nameLength = header.getUint32(offset + 12);
    } else if (tag === "OS/2") {
      os2Offset = header.getUint32(offset + 8);
      os2Length = header.getUint32(offset + 12);
    }
  }
  if (os2Offset >= 0 && os2Length >= 10 && os2Offset + os2Length <= file.size) {
    const os2 = new DataView(await file.slice(os2Offset, os2Offset + 10).arrayBuffer());
    const fsType = os2.getUint16(8);
    if (fsType & 0x0002)
      throw new Error("Restricted embedding: this font forbids embedding in edited PDFs.");
    if (fsType & 0x0200)
      throw new Error("Restricted embedding: this font permits bitmap embedding only.");
    if (fsType & 0x0100)
      throw new Error("Restricted embedding: this font forbids subsetting, which PDF Folio cannot guarantee.");
  }
  if (
    nameOffset < 0 ||
    nameLength < 6 ||
    nameLength > 2 * 1024 * 1024 ||
    nameOffset + nameLength > file.size
  )
    throw new Error("The font has no readable name table.");
  const table = new DataView(
    await file.slice(nameOffset, nameOffset + nameLength).arrayBuffer(),
  );
  const count = table.getUint16(2);
  const stringsOffset = table.getUint16(4);
  if (6 + count * 12 > table.byteLength || stringsOffset > table.byteLength)
    throw new Error("Invalid OpenType name table.");
  const names = new Map<number, { value: string; score: number }>();
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 12;
    const platform = table.getUint16(offset);
    const language = table.getUint16(offset + 4);
    const nameId = table.getUint16(offset + 6);
    if (![1, 2, 4, 6, 16, 17].includes(nameId)) continue;
    const length = table.getUint16(offset + 8);
    const stringOffset = stringsOffset + table.getUint16(offset + 10);
    if (stringOffset + length > table.byteLength) continue;
    const value = decodeOpenTypeName(
      new Uint8Array(table.buffer, table.byteOffset + stringOffset, length),
      platform,
    );
    if (!value) continue;
    const score = (language === 0x0409 ? 4 : 0) + (platform === 3 ? 2 : platform === 0 ? 1 : 0);
    if (!names.has(nameId) || names.get(nameId)!.score < score)
      names.set(nameId, { value, score });
  }
  const family = names.get(16)?.value ?? names.get(1)?.value ?? names.get(4)?.value;
  const styleName = names.get(17)?.value ?? names.get(2)?.value ?? "Regular";
  const postscriptName = names.get(6)?.value;
  if (!family || !postscriptName) throw new Error("The font is missing family or PostScript metadata.");
  const relativePath =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name;
  const id = `local-${file.size}-${file.lastModified}-${hashString(`${relativePath}:${postscriptName}`)}`;
  return {
    id,
    family: styleName && !/^regular$/i.test(styleName) ? `${family} ${styleName}` : family,
    category: inferCategory(family, styleName),
    source: "Local font library; available for this session only",
    browserFile: file,
    postscriptName,
    styleName,
    uploaded: true,
    coverage: `Local ${file.name}`,
  };
}

export function matchingUploadedFontId(
  originalName: string,
  fonts: FontDefinition[],
) {
  const target = normalizePostscriptName(originalName);
  const matches = fonts.filter(
    (font) =>
      font.uploaded &&
      font.postscriptName &&
      normalizePostscriptName(font.postscriptName) === target,
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

export function uploadedFontMatchesOriginal(
  originalName: string,
  font: FontDefinition | undefined,
) {
  return Boolean(
    font?.uploaded &&
      font.postscriptName &&
      normalizePostscriptName(font.postscriptName) ===
        normalizePostscriptName(originalName),
  );
}

function normalizePostscriptName(name: string) {
  return name.replace(/^[A-Z]{6}\+/, "").trim().toLowerCase();
}

function readTag(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function decodeOpenTypeName(bytes: Uint8Array, platform: number) {
  try {
    if (platform === 0 || platform === 3) {
      let value = "";
      for (let index = 0; index + 1 < bytes.length; index += 2)
        value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
      return value.replace(/\0/g, "").trim();
    }
    return new TextDecoder("windows-1252").decode(bytes).replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function inferCategory(family: string, style: string): FontDefinition["category"] {
  const value = `${family} ${style}`.toLowerCase();
  if (/mono|code|typewriter|console/.test(value)) return "Monospace";
  if (/script|hand|brush|cursive|calligraphy/.test(value)) return "Handwritten";
  if (/serif|roman|garamond|baskerville|bodoni|didot|times/.test(value)) return "Serif";
  return "Sans serif";
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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
