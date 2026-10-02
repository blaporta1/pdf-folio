from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from fontTools.ttLib import TTFont
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as ReportLabTTFont

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "test" / "fixtures"
FIXTURES.mkdir(parents=True, exist_ok=True)


def image_bytes(primary: str, secondary: str) -> bytes:
    image = Image.new("RGB", (80, 60), primary)
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 0, 79, 59), fill=secondary)
    output = BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


original = image_bytes("#c94f45", "#244f70")
replacement = image_bytes("#3b9b70", "#edcf62")
(FIXTURES / "replacement.png").write_bytes(replacement)

raw = BytesIO()
c = canvas.Canvas(raw, pagesize=letter, pageCompression=1)
c.setFillColor(HexColor("#f4ead8"))
c.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
c.setFillColor(HexColor("#202725"))
c.setFont("Helvetica", 14)
c.drawString(60, 720, "Editable phrase")
c.setFont("Helvetica", 11)
c.drawString(60, 680, "Untouched anchor text")
c.setFont("Helvetica", 12)
c.drawString(60, 640, "Alpha ")
c.setFont("Helvetica-Bold", 12)
c.drawString(95, 640, "Bold")
c.setFont("Helvetica", 12)
c.drawString(122, 640, " Omega")
source = ImageReader(BytesIO(original))
c.drawImage(source, 60, 490, width=160, height=120, mask="auto")
c.drawImage(source, 320, 490, width=160, height=120, mask="auto")
c.setFillColor(HexColor("#5f5f5f"))
c.setFont("Helvetica", 9)
c.drawString(60, 455, "First repeated image")
c.drawString(320, 455, "Second repeated image")
c.linkURL("https://example.com/folio-test", (60, 670, 185, 686), relative=0)
c.showPage()
c.setFillColor(HexColor("#ffffff"))
c.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
c.setFillColor(HexColor("#222222"))
c.setFont("Helvetica", 15)
c.drawString(92, 650, "Rotated page anchor")
c.setFont("Helvetica", 11)
c.drawString(92, 620, "Crop-safe neighboring text")
c.showPage()
c.save()
raw.seek(0)

reader = PdfReader(raw)
writer = PdfWriter()
writer.clone_document_from_reader(reader)
page0 = writer.pages[0]
redaction = DictionaryObject()
redaction[NameObject("/Type")] = NameObject("/Annot")
redaction[NameObject("/Subtype")] = NameObject("/Redact")
redaction[NameObject("/Rect")] = ArrayObject([FloatObject(500), FloatObject(740), FloatObject(550), FloatObject(765)])
redaction[NameObject("/Contents")] = TextStringObject("Unapplied redaction must survive")
redaction_ref = writer._add_object(redaction)
annotations = page0.get("/Annots") or ArrayObject()
annotations.append(redaction_ref)
page0[NameObject("/Annots")] = annotations
page1 = writer.pages[1]
page1.rotate(90)
page1.cropbox.lower_left = (36, 48)
page1.cropbox.upper_right = (560, 744)

output = FIXTURES / "engine-fixture.pdf"
with output.open("wb") as stream:
    writer.write(stream)
print(output)


def make_full_font_pdf() -> None:
    font_path = ROOT / "public" / "fonts" / "Inter.ttf"
    font_bytes = font_path.read_bytes()
    tt = TTFont(font_path)
    cmap = tt.getBestCmap()
    units = tt["head"].unitsPerEm
    widths = []
    for code in range(32, 127):
        glyph = cmap.get(code, ".notdef")
        advance = tt["hmtx"].metrics[glyph][0]
        widths.append(NumberObject(round(advance * 1000 / units)))

    full = PdfWriter()
    page = full.add_blank_page(width=612, height=792)
    font_file = DecodedStreamObject()
    font_file.set_data(font_bytes)
    font_file[NameObject("/Length1")] = NumberObject(len(font_bytes))
    font_file_ref = full._add_object(font_file)
    head = tt["head"]
    hhea = tt["hhea"]
    descriptor = DictionaryObject({
        NameObject("/Type"): NameObject("/FontDescriptor"),
        NameObject("/FontName"): NameObject("/Inter-Regular"),
        NameObject("/Flags"): NumberObject(32),
        NameObject("/FontBBox"): ArrayObject([NumberObject(round(value * 1000 / units)) for value in (head.xMin, head.yMin, head.xMax, head.yMax)]),
        NameObject("/ItalicAngle"): NumberObject(0),
        NameObject("/Ascent"): NumberObject(round(hhea.ascent * 1000 / units)),
        NameObject("/Descent"): NumberObject(round(hhea.descent * 1000 / units)),
        NameObject("/CapHeight"): NumberObject(round(hhea.ascent * 1000 / units)),
        NameObject("/StemV"): NumberObject(90),
        NameObject("/FontFile2"): font_file_ref,
    })
    descriptor_ref = full._add_object(descriptor)
    cmap_lines = [
        "/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def",
        "1 begincodespacerange", "<00> <FF>", "endcodespacerange",
        "95 beginbfchar",
    ]
    cmap_lines.extend(f"<{code:02X}> <{code:04X}>" for code in range(32, 127))
    cmap_lines.extend(["endbfchar", "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"])
    to_unicode = DecodedStreamObject()
    to_unicode.set_data("\n".join(cmap_lines).encode("ascii"))
    to_unicode_ref = full._add_object(to_unicode)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/TrueType"),
        NameObject("/BaseFont"): NameObject("/Inter-Regular"),
        NameObject("/FirstChar"): NumberObject(32),
        NameObject("/LastChar"): NumberObject(126),
        NameObject("/Widths"): ArrayObject(widths),
        NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
        NameObject("/FontDescriptor"): descriptor_ref,
        NameObject("/ToUnicode"): to_unicode_ref,
    })
    font_ref = full._add_object(font)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})
    })
    contents = DecodedStreamObject()
    contents.set_data(b"BT /F1 18 Tf 72 700 Td (Original text) Tj ET")
    page[NameObject("/Contents")] = full._add_object(contents)
    path = FIXTURES / "full-embedded-font.pdf"
    with path.open("wb") as stream:
        full.write(stream)
    tt.close()
    print(path)


make_full_font_pdf()


def make_subset_font_pdf() -> None:
    pdfmetrics.registerFont(ReportLabTTFont("FixtureInter", ROOT / "public" / "fonts" / "Inter.ttf"))
    raw = BytesIO()
    fixture = canvas.Canvas(raw, pagesize=letter, pageCompression=1)
    fixture.setFont("FixtureInter", 18)
    fixture.drawString(72, 700, "Dummy PDF file")
    fixture.save()
    raw.seek(0)
    reader = PdfReader(raw)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    page = writer.pages[0]
    state = DecodedStreamObject()
    # Intentionally leave CTM, horizontal scaling, and invisible text mode altered.
    # The editor must isolate original streams before appending replacement text.
    state.set_data(b"2 0 0 2 0 0 cm BT 200 Tz 3 Tr ET")
    state_ref = writer._add_object(state)
    contents = page.get("/Contents")
    if isinstance(contents, ArrayObject):
        contents.append(state_ref)
    else:
        page[NameObject("/Contents")] = ArrayObject([contents, state_ref])
    path = FIXTURES / "subset-embedded-font.pdf"
    with path.open("wb") as stream:
        writer.write(stream)
    print(path)


make_subset_font_pdf()
