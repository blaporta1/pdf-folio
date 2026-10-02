from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[1] / "public" / "samples" / "pdf-folio-sample.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

badge = Image.new("RGB", (720, 420), "#d7e8e2")
draw = ImageDraw.Draw(badge)
draw.rounded_rectangle((32, 32, 688, 388), radius=38, fill="#19443e")
draw.ellipse((72, 82, 292, 302), fill="#e9b973")
draw.rectangle((340, 103, 624, 129), fill="#f5f0e6")
draw.rectangle((340, 160, 570, 181), fill="#a9c6bd")
draw.rectangle((340, 215, 610, 236), fill="#a9c6bd")
draw.rectangle((340, 270, 510, 291), fill="#a9c6bd")
image_bytes = BytesIO()
badge.save(image_bytes, "PNG")
image_bytes.seek(0)

c = canvas.Canvas(str(OUT), pagesize=letter, pageCompression=1)
width, height = letter
c.setTitle("PDF Folio sample document")
c.setAuthor("PDF Folio")
c.setFillColor(HexColor("#f8f6ef"))
c.rect(0, 0, width, height, stroke=0, fill=1)
c.setFillColor(HexColor("#163f3b"))
c.setFont("Helvetica-Bold", 11)
c.drawString(54, height - 54, "PDF FOLIO FIELD NOTES")
c.setFillColor(HexColor("#79928b"))
c.setFont("Helvetica", 9)
c.drawRightString(width - 54, height - 54, "ISSUE 01  /  OCTOBER 2026")
c.setFillColor(HexColor("#20302c"))
c.setFont("Times-Bold", 38)
c.drawString(54, height - 125, "A document worth keeping")
c.setFont("Times-Roman", 18)
c.setFillColor(HexColor("#52605c"))
c.drawString(56, height - 157, "Edit this headline, replace the artwork, or add a note.")
c.drawImage(ImageReader(image_bytes), 54, height - 465, width=504, height=294, preserveAspectRatio=True, mask="auto")
c.setFillColor(HexColor("#24312e"))
c.setFont("Helvetica-Bold", 13)
c.drawString(54, 278, "Designed for exact changes")
c.setFont("Helvetica", 11)
lines = [
    "PDF Folio recognizes text spans and image regions without rebuilding the page.",
    "Everything outside the selected edit keeps its original PDF structure.",
    "Use the inspector to change type, color, position, and dimensions.",
]
for idx, line in enumerate(lines):
    c.drawString(54, 254 - idx * 18, line)
c.setStrokeColor(HexColor("#b8c9c3"))
c.line(54, 170, width - 54, 170)
c.setFillColor(HexColor("#55716a"))
c.setFont("Courier", 9)
c.drawString(54, 145, "TIP: Select any outlined region to begin.")
c.setFillColor(HexColor("#777c77"))
c.drawRightString(width - 54, 42, "1")
c.showPage()

c.setFillColor(HexColor("#f8f6ef"))
c.rect(0, 0, width, height, stroke=0, fill=1)
c.setFillColor(HexColor("#163f3b"))
c.setFont("Times-Bold", 32)
c.drawString(54, height - 90, "Page two: a clean test surface")
c.setFont("Helvetica", 12)
c.setFillColor(HexColor("#3f4946"))
c.drawString(54, height - 128, "This sentence should remain untouched when you edit the text below.")
c.setFont("Helvetica-Bold", 18)
c.setFillColor(HexColor("#a05c3f"))
c.drawString(54, height - 190, "Change only this line")
c.setFillColor(HexColor("#e1eae7"))
c.roundRect(54, height - 395, 504, 150, 9, stroke=0, fill=1)
c.setFillColor(HexColor("#163f3b"))
c.circle(128, height - 320, 42, stroke=0, fill=1)
c.setFillColor(HexColor("#26312e"))
c.setFont("Times-Roman", 16)
c.drawString(200, height - 300, "Add your own text or image here.")
c.setFont("Helvetica", 10)
c.setFillColor(HexColor("#66706c"))
c.drawString(200, height - 326, "Then export and open the result in any PDF reader.")
c.setFillColor(HexColor("#777c77"))
c.drawRightString(width - 54, 42, "2")
c.save()
print(OUT)
