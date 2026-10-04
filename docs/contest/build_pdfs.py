"""Build the five contest PDFs plus the video script from docs/contest Markdown."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    Flowable,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
# Old reportlab generator. Do not write into the submission docx/pdf folders.
PDF_DIR = ROOT / "legacy-reportlab"
SOURCES = [
    "01-功能需求分析.md",
    "02-功能设计.md",
    "03-产品说明书.md",
    "04-功能测试报告.md",
    "05-安装部署.md",
    "06-演示视频脚本.md",
]

NAVY = HexColor("#1f3a5f")
RULE = HexColor("#d5dde6")
ZEBRA = HexColor("#f4f7fb")
CODE_BG = HexColor("#f3f5f7")
MUTED = HexColor("#5c6b7a")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("YaHei", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("YaHeiBold", r"C:\Windows\Fonts\msyhbd.ttc", subfontIndex=0))
    consola = Path(r"C:\Windows\Fonts\consola.ttf")
    if consola.exists():
        pdfmetrics.registerFont(TTFont("Consola", str(consola)))
    pdfmetrics.registerFontFamily(
        "YaHei",
        normal="YaHei",
        bold="YaHeiBold",
        italic="YaHei",
        boldItalic="YaHeiBold",
    )


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def inline(text: str) -> str:
    pieces = re.split(r"(`[^`]+`)", text)
    out = []
    for piece in pieces:
        if piece.startswith("`") and piece.endswith("`") and len(piece) >= 2:
            out.append(f'<font face="Consola">{esc(piece[1:-1])}</font>')
            continue
        parts = re.split(r"(\*\*[^*]+\*\*)", piece)
        for part in parts:
            if part.startswith("**") and part.endswith("**"):
                out.append(f"<b>{esc(part[2:-2])}</b>")
            else:
                out.append(esc(part))
    return "".join(out)


class TocMark(Flowable):
    def __init__(self, key: str, bucket: dict[str, int]):
        super().__init__()
        self.key = key
        self.bucket = bucket

    def wrap(self, aw, ah):
        return (0, 0)

    def draw(self):
        self.bucket[self.key] = self.canv.getPageNumber()


def parse(path: Path) -> tuple[str, list[tuple[str, str]], list[tuple]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    title = ""
    meta: list[tuple[str, str]] = []
    body: list[tuple] = []
    i = 0
    while i < len(lines) and not lines[i].startswith("# "):
        i += 1
    if i < len(lines):
        title = lines[i][2:].strip()
        i += 1
    while i < len(lines) and not lines[i].startswith("## "):
        line = lines[i].strip()
        if line.startswith("- "):
            item = line[2:]
            if "：" in item:
                key, value = item.split("：", 1)
                meta.append((key.strip(), value.strip()))
        i += 1
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            i += 1
            chunk = []
            while i < len(lines) and not lines[i].startswith("```"):
                chunk.append(lines[i])
                i += 1
            body.append(("code", "\n".join(chunk)))
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                raw = lines[i].strip().strip("|")
                cells = [cell.strip() for cell in raw.split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) or set(cell) <= set("-: ") for cell in cells):
                    rows.append(cells)
                i += 1
            body.append(("table", rows))
            continue
        if line.startswith("## "):
            body.append(("h1", line[3:].strip()))
            i += 1
            continue
        if line.startswith("### "):
            body.append(("h2", line[4:].strip()))
            i += 1
            continue
        if line.startswith("#### "):
            body.append(("h3", line[5:].strip()))
            i += 1
            continue
        if not line.strip():
            i += 1
            continue
        chunk = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|", "```")):
            chunk.append(lines[i].strip())
            i += 1
        body.append(("p", " ".join(chunk)))
    return title, meta, body


def styles() -> dict[str, ParagraphStyle]:
    base = dict(fontName="YaHei", wordWrap="CJK")
    ink = HexColor("#1c2430")
    return {
        "h1": ParagraphStyle("h1", fontSize=14, leading=20, textColor=NAVY, spaceBefore=12, spaceAfter=6, **base),
        "h2": ParagraphStyle("h2", fontSize=12, leading=17, textColor=HexColor("#243e66"), spaceBefore=8, spaceAfter=4, **base),
        "h3": ParagraphStyle("h3", fontSize=11, leading=15, textColor=HexColor("#2c4a73"), spaceBefore=6, spaceAfter=3, **base),
        "body": ParagraphStyle("body", fontSize=10.5, leading=16.5, alignment=TA_LEFT, textColor=ink, spaceAfter=6, **base),
        "caption": ParagraphStyle("caption", fontSize=10, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=3, **base),
        "toc_title": ParagraphStyle("toc_title", fontSize=14, leading=20, textColor=NAVY, spaceAfter=8, **base),
        "toc1": ParagraphStyle("toc1", fontSize=10.5, leading=16, textColor=HexColor("#1c2430"), **base),
        "toc2": ParagraphStyle("toc2", fontSize=9.5, leading=14, textColor=MUTED, leftIndent=12, **base),
        "cover_kicker": ParagraphStyle("cover_kicker", fontSize=11, leading=16, alignment=TA_CENTER, textColor=NAVY, **base),
        "cover_title": ParagraphStyle("cover_title", fontSize=22, leading=30, alignment=TA_CENTER, textColor=NAVY, **base),
        "cover_sub": ParagraphStyle("cover_sub", fontSize=11, leading=17, alignment=TA_CENTER, textColor=MUTED, **base),
        "meta_k": ParagraphStyle("meta_k", fontSize=9, leading=13, textColor=MUTED, **base),
        "meta_v": ParagraphStyle("meta_v", fontSize=10, leading=14, textColor=HexColor("#1c2430"), **base),
        "cell": ParagraphStyle("cell", fontSize=8.5, leading=12, textColor=HexColor("#1c2430"), **base),
        "cell_h": ParagraphStyle("cell_h", fontSize=8.5, leading=12, textColor=white, **base),
        "footer": ParagraphStyle("footer", fontSize=8.5, leading=11, textColor=MUTED, **base),
    }


def make_table(rows: list[list[str]], style: dict[str, ParagraphStyle], width: float) -> Table:
    header, data = rows[0], rows[1:]
    col_n = max(len(row) for row in rows)
    weights = []
    for index in range(col_n):
        longest = 0
        for row in rows:
            if index < len(row):
                longest = max(longest, len(row[index]))
        weights.append(max(longest, 4))
    scale = width / sum(weights)
    widths = [max(18 * mm, weight * scale) for weight in weights]
    # If the minimums overflow, fall back to proportional widths.
    if sum(widths) > width:
        widths = [width * weight / sum(weights) for weight in weights]
    rendered = []
    for row_index, row in enumerate(rows):
        cells = []
        chosen = style["cell_h"] if row_index == 0 else style["cell"]
        for index in range(col_n):
            text = row[index] if index < len(row) else ""
            cells.append(Paragraph(inline(text), chosen))
        rendered.append(cells)
    table = Table(rendered, colWidths=widths, repeatRows=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "YaHeiBold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.3, RULE),
    ]
    for row_index in range(1, len(rendered)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), ZEBRA))
    table.setStyle(TableStyle(commands))
    return table


def body_story(blocks, style, width, toc_bucket, with_marks: bool):
    story = []
    mark_id = 0
    headings = []
    for kind, payload in blocks:
        if kind in {"h1", "h2", "h3"}:
            key = f"h{mark_id}"
            mark_id += 1
            headings.append((kind, payload, key))
            if with_marks:
                story.append(TocMark(key, toc_bucket))
            if kind == "h1":
                story.append(CondPageBreak(28 * mm))
                story.append(Paragraph(inline(payload), style["h1"]))
            elif kind == "h2":
                story.append(Paragraph(inline(payload), style["h2"]))
            else:
                story.append(Paragraph(inline(payload), style["h3"]))
        elif kind == "p":
            chosen = style["caption"] if payload.startswith("表") or payload.startswith("图") else style["body"]
            story.append(Paragraph(inline(payload), chosen))
        elif kind == "code":
            story.append(Spacer(1, 2))
            story.append(
                Preformatted(
                    payload if payload else " ",
                    ParagraphStyle(
                        "code",
                        fontName="Consola" if "Consola" in pdfmetrics.getRegisteredFontNames() else "YaHei",
                        fontSize=8,
                        leading=11,
                        textColor=HexColor("#1c2430"),
                        backColor=CODE_BG,
                        leftIndent=4,
                        rightIndent=4,
                        borderPadding=4,
                    ),
                )
            )
            story.append(Spacer(1, 6))
        elif kind == "table" and payload:
            story.append(make_table(payload, style, width))
            story.append(Spacer(1, 6))
    return story, headings


def cover_story(title: str, meta: list[tuple[str, str]], style) -> list:
    story = [Spacer(1, 28 * mm), Paragraph("VeriFlow", style["cover_kicker"]), Spacer(1, 8 * mm)]
    story.append(Paragraph(inline(title), style["cover_title"]))
    subtitle = next((value for key, value in meta if key == "副标题"), "")
    if subtitle:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph(inline(subtitle), style["cover_sub"]))
    story.append(Spacer(1, 12 * mm))
    rows = []
    for key, value in meta:
        if key == "副标题":
            continue
        rows.append([Paragraph(inline(key), style["meta_k"]), Paragraph(inline(value), style["meta_v"])])
    if rows:
        table = Table(rows, colWidths=[32 * mm, 120 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.2, RULE),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        story.append(table)
    story.append(Spacer(1, 16 * mm))
    story.append(Paragraph("参赛交付材料", style["cover_sub"]))
    story.append(PageBreak())
    return story


def toc_story(headings, pages: dict[str, int] | None, style) -> list:
    story = [Paragraph("目录", style["toc_title"])]
    for kind, text, key in headings:
        if kind == "h3":
            continue
        page = ""
        if pages and key in pages:
            page = str(pages[key])
        label = inline(text)
        if page:
            label = f"{label}    {page}"
        story.append(Paragraph(label, style["toc1"] if kind == "h1" else style["toc2"]))
    story.append(PageBreak())
    return story


def draw_page(canvas, doc, title: str) -> None:
    canvas.saveState()
    page = canvas.getPageNumber()
    width, height = A4
    if page == 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, height - 16 * mm, width, 16 * mm, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont("YaHei", 9)
        canvas.drawString(18 * mm, height - 10 * mm, "第八届 AIC 算法创新赛  ·  赛题 2  AI+软件创新")
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, width, 12 * mm, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont("YaHei", 8.5)
        canvas.drawString(18 * mm, 5 * mm, "VeriFlow")
        canvas.drawRightString(width - 18 * mm, 5 * mm, "第 1 页")
    else:
        canvas.setFillColor(NAVY)
        canvas.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont("YaHei", 8.5)
        canvas.drawString(18 * mm, height - 8 * mm, title)
        canvas.setFillColor(MUTED)
        canvas.setFont("YaHei", 8.5)
        canvas.drawString(18 * mm, 8 * mm, "VeriFlow 参赛文档")
        canvas.drawRightString(width - 18 * mm, 8 * mm, f"第 {page} 页")
        canvas.setStrokeColor(RULE)
        canvas.line(18 * mm, 13 * mm, width - 18 * mm, 13 * mm)
    canvas.restoreState()


def build_one(source: Path, dest: Path) -> None:
    title, meta, blocks = parse(source)
    style = styles()
    width = A4[0] - 36 * mm
    pages: dict[str, int] = {}
    _, headings = body_story(blocks, style, width, pages, with_marks=False)

    def make_doc(path: Path, on_later):
        return SimpleDocTemplate(
            str(path),
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=20 * mm,
            bottomMargin=16 * mm,
            title=title,
            author="VeriFlow",
        )

    # Pass 1 measures heading pages with a one-page table of contents placeholder.
    probe_pages: dict[str, int] = {}
    probe_body, _ = body_story(blocks, style, width, probe_pages, with_marks=True)
    probe = make_doc(dest.with_suffix(".probe.pdf"), None)
    probe.build(
        cover_story(title, meta, style) + [PageBreak()] + probe_body,
        onFirstPage=lambda c, d: draw_page(c, d, title),
        onLaterPages=lambda c, d: draw_page(c, d, title),
    )
    dest.with_suffix(".probe.pdf").unlink(missing_ok=True)

    final_pages = {key: value for key, value in probe_pages.items()}
    story = cover_story(title, meta, style) + toc_story(headings, final_pages, style)
    body, _ = body_story(blocks, style, width, {}, with_marks=False)
    story.extend(body)
    doc = make_doc(dest, None)
    doc.build(
        story,
        onFirstPage=lambda c, d: draw_page(c, d, title),
        onLaterPages=lambda c, d: draw_page(c, d, title),
    )


def main() -> int:
    register_fonts()
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        source = ROOT / name
        title, _, _ = parse(source)
        filename = f"{title}.pdf"
        build_one(source, PDF_DIR / filename)
        print(PDF_DIR / filename)
    return 0


if __name__ == "__main__":
    sys.exit(main())
