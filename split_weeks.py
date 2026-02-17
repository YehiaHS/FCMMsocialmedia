"""
Split the Reflective Log into separate weekly .docx files,
each with a professional cover page.
"""

from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT
import os, re

# ── Constants ──────────────────────────────────────────────
STUDENT_NAME = "Yehia Salem"
STUDENT_ID   = "229916"
PATHWAY      = "Industry"
MODULE_NAME  = "Industry-Based Final Year Project"
MODULE_CODE  = "DY3"
MAJOR        = "Communication & Mass Media"
ORGANISATION = "BUE FCMM Social Media Team Internship"
FACULTY      = "Faculty of Communication and Mass Media\nThe British University in Egypt"
INDUSTRY_PARTNER = "BUE FCMM Social Media Team"

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "weeks")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Parse the original reflective log ─────────────────────
src = Document(os.path.join(os.path.dirname(__file__), "Reflective Log_1.docx"))

paragraphs = [p.text for p in src.paragraphs]

# Find week boundaries by looking for lines starting with "Week:"
week_starts = []
for i, t in enumerate(paragraphs):
    if re.match(r'^Week:\s*', t.strip()):
        week_starts.append(i)

# Each week runs from its start index to the next week start (or end)
weeks_data = []
for idx, start in enumerate(week_starts):
    end = week_starts[idx + 1] if idx + 1 < len(week_starts) else len(paragraphs)
    week_paras = paragraphs[start:end]
    # Extract week label from first line
    label = week_paras[0].replace("Week:", "").strip()
    weeks_data.append((label, week_paras))

print(f"Found {len(weeks_data)} weeks: {[w[0] for w in weeks_data]}")

# ── Helper: add cover page ────────────────────────────────
def add_cover_page(doc, week_label):
    """Add a formatted cover page to the document."""
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Calibri'
    font.size = Pt(11)

    # Spacing at top
    for _ in range(4):
        doc.add_paragraph('')

    # Faculty title
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(FACULTY)
    run.font.size = Pt(16)
    run.bold = True
    run.font.color.rgb = RGBColor(0, 51, 102)

    doc.add_paragraph('')

    # Document title
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Reflective Log")
    run.font.size = Pt(22)
    run.bold = True
    run.font.color.rgb = RGBColor(0, 51, 102)

    # Week subtitle
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"Week {week_label}")
    run.font.size = Pt(16)
    run.bold = True
    run.font.color.rgb = RGBColor(80, 80, 80)

    doc.add_paragraph('')
    doc.add_paragraph('')

    # ── Info table ──
    table = doc.add_table(rows=6, cols=2)
    table.style = 'Table Grid'
    table.autofit = True

    fields = [
        ("Module Name", MODULE_NAME),
        ("Module Code", MODULE_CODE),
        ("Student Name", STUDENT_NAME),
        ("Student ID", STUDENT_ID),
        ("Major / Pathway", f"{MAJOR} — {PATHWAY}"),
        ("Industry Partner", INDUSTRY_PARTNER),
    ]

    for i, (label, value) in enumerate(fields):
        cell_l = table.cell(i, 0)
        cell_r = table.cell(i, 1)
        # Label cell
        run_l = cell_l.paragraphs[0].add_run(label)
        run_l.bold = True
        run_l.font.size = Pt(11)
        run_l.font.color.rgb = RGBColor(0, 51, 102)
        # Value cell
        run_r = cell_r.paragraphs[0].add_run(value)
        run_r.font.size = Pt(11)

    # Set column widths
    for row in table.rows:
        row.cells[0].width = Cm(5)
        row.cells[1].width = Cm(10)

    # Page break after cover
    doc.add_page_break()


# ── Helper: add weekly content ────────────────────────────
SEPARATOR = '___'

def add_week_content(doc, week_paras):
    """Add the weekly reflective log content to the document."""
    # Add header info (first few lines before the separator)
    header_done = False
    section_title = None

    for text in week_paras:
        stripped = text.strip()

        # Skip empty lines at start
        if not stripped:
            continue

        # Skip separator lines
        if stripped.startswith(SEPARATOR):
            continue

        # Detect section headers (numbered: 1. 2. 3. etc.)
        section_match = re.match(r'^(\d+)\.\s+(.+)', stripped)

        # Detect the header block (Week:, Student Name:, etc.)
        if stripped.startswith('Week:'):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(stripped)
            run.bold = True
            run.font.size = Pt(14)
            run.font.color.rgb = RGBColor(0, 51, 102)
            continue

        if any(stripped.startswith(prefix) for prefix in
               ['Student Name:', 'Pathway:', 'Organisation', 'Hours Completed:']):
            p = doc.add_paragraph()
            # Bold the label part
            if ':' in stripped:
                label, _, value = stripped.partition(':')
                run = p.add_run(f"{label}:")
                run.bold = True
                run.font.size = Pt(11)
                run = p.add_run(f" {value.strip()}")
                run.font.size = Pt(11)
            else:
                run = p.add_run(stripped)
                run.font.size = Pt(11)
            continue

        # Section headers
        if section_match:
            doc.add_paragraph('')  # spacing
            p = doc.add_paragraph()
            run = p.add_run(stripped)
            run.bold = True
            run.font.size = Pt(13)
            run.font.color.rgb = RGBColor(0, 80, 130)
            continue

        # Skip instructional/template text
        if stripped.startswith('(') and stripped.endswith(')'):
            continue
        if stripped.startswith('Example prompts'):
            continue
        if stripped in ['What decision did you make?',
                        'What did you notice during a task or meeting?',
                        'What surprised you?']:
            continue
        if stripped.startswith('e.g. Editing, Camera operation'):
            continue
        if stripped.startswith('Attach or reference production folder'):
            continue
        if stripped.startswith('*You may include'):
            continue

        # Regular content
        if stripped:
            p = doc.add_paragraph(stripped)
            p.style = doc.styles['Normal']


# ── Generate one document per week ────────────────────────
for label, paras in weeks_data:
    doc = Document()

    # Set default margins
    for section in doc.sections:
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    add_cover_page(doc, label)
    add_week_content(doc, paras)

    # Clean filename
    safe_label = re.sub(r'[^\w\s-]', '', label).strip()
    safe_label = re.sub(r'\s+', '_', safe_label)
    filename = f"Week_{safe_label}_Reflective_Log.docx"
    filepath = os.path.join(OUTPUT_DIR, filename)
    doc.save(filepath)
    print(f"  ✓ Created: {filepath}")

print(f"\nDone! {len(weeks_data)} files saved to: {OUTPUT_DIR}")
