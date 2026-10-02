from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, TextStringObject
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

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
