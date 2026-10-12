import asyncio
import io
import unittest
import zipfile

from fastapi import HTTPException, UploadFile

from main import (
    analyze_resume,
    clean_text,
    extract_profile_sections,
    extract_text_from_uploaded_file,
)


def build_docx(paragraphs):
    xml_paragraphs = ''
    for item in paragraphs:
        text, is_bullet = item if isinstance(item, tuple) else (item, False)
        paragraph_properties = (
            '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/>'
            '</w:numPr></w:pPr>'
            if is_bullet else ''
        )
        xml_paragraphs += (
            f'<w:p>{paragraph_properties}<w:r><w:t>{text}</w:t></w:r></w:p>'
        )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{xml_paragraphs}</w:body></w:document>'
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('word/document.xml', document)
    return buffer.getvalue()


def build_pdf(lines):
    commands = ['BT /F1 12 Tf 72 720 Td']
    for index, line in enumerate(lines):
        escaped_line = line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        if index:
            commands.append('0 -18 Td')
        commands.append(f'({escaped_line}) Tj')
    commands.append('ET')
    stream = '\n'.join(commands).encode('ascii')

    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
        b'/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode('ascii') + b' >>\nstream\n'
        + stream + b'\nendstream',
    ]

    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f'{index} 0 obj\n'.encode('ascii') + obj + b'\nendobj\n')

    xref_offset = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode('ascii'))
    pdf.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        pdf.extend(f'{offset:010d} 00000 n \n'.encode('ascii'))
    pdf.extend(
        f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n'
        f'startxref\n{xref_offset}\n%%EOF\n'.encode('ascii')
    )
    return bytes(pdf)


class ResumeAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.resume_lines = [
            'Alex Example',
            'alex@example.test | 555-0100',
            'Academic Background:',
            'BSc Computer Science, North College, 2022-2026, GPA 3.8',
            'PROJECT EXPERIENCE',
            'Campus Planner - Built with Python and React.',
            'Certifications:',
            'Cloud Fundamentals Certificate, 2025',
            'INTERNSHIP EXPERIENCE:',
            'Software Intern at Example Labs, Summer 2025',
            'TECHNICAL SKILLS:',
            'Python, React, PostgreSQL',
            'Awards and Honors:',
            'First place, campus hackathon, 2025',
            'Languages:',
            'English, Spanish',
        ]

    def test_clean_text_preserves_meaningful_line_breaks(self):
        cleaned = clean_text('Education:\r\n  BSc   Computer Science\r\n\r\nProjects:\n - Planner')

        self.assertEqual(cleaned, 'Education:\nBSc Computer Science\n\nProjects:\n- Planner')

    def test_sections_use_headings_and_do_not_include_contact_header(self):
        sections = extract_profile_sections('\n'.join(self.resume_lines))

        self.assertEqual(sections['education'], ['BSc Computer Science, North College, 2022-2026, GPA 3.8'])
        self.assertEqual(sections['projects'], ['Campus Planner - Built with Python and React.'])
        self.assertEqual(sections['certifications'], ['Cloud Fundamentals Certificate, 2025'])
        self.assertEqual(sections['experience'], ['Software Intern at Example Labs, Summer 2025'])
        self.assertEqual(sections['technicalSkills'], ['Python, React, PostgreSQL'])
        self.assertEqual(sections['achievements'], ['First place, campus hackathon, 2025'])
        self.assertEqual(sections['languages'], ['English, Spanish'])
        self.assertNotIn('Alex Example', str(sections))
        self.assertNotIn('alex@example.test', str(sections))

    def test_flattened_text_with_heading_variations_is_split_into_sections(self):
        resume_text = (
            'Alex Example | ACADEMIC BACKGROUND: BSc Computer Science, North College, 2022-2026 '
            '| Selected Projects: Campus Planner built with Python '
            '| Technical Skills: Python, React '
            '| Licenses & Certifications: Cloud Fundamentals, 2025 '
            '| Experience / Internships: Software Intern at Example Labs '
            '| Awards and Honors: First place, campus hackathon '
            '| Languages: English, Spanish'
        )

        sections = extract_profile_sections(resume_text)

        self.assertEqual(sections['education'], ['BSc Computer Science, North College, 2022-2026'])
        self.assertEqual(sections['projects'], ['Campus Planner built with Python'])
        self.assertEqual(sections['technicalSkills'], ['Python, React'])
        self.assertEqual(sections['certifications'], ['Cloud Fundamentals, 2025'])
        self.assertEqual(sections['experience'], ['Software Intern at Example Labs'])
        self.assertEqual(sections['achievements'], ['First place, campus hackathon'])
        self.assertEqual(sections['languages'], ['English, Spanish'])

    def test_multiple_projects_and_certifications_stay_in_their_sections(self):
        resume_text = '\n'.join([
            'PROJECTS:',
            '- Campus Planner: Built a scheduling app.',
            '- Budget Tracker: Created a personal finance tool.',
            'CERTIFICATIONS:',
            '- Cloud Fundamentals, 2025',
            '- Python Developer Certificate, 2024',
            'EXPERIENCE / INTERNSHIPS:',
            '- Software Intern at Example Labs, Summer 2025',
        ])

        sections = extract_profile_sections(resume_text)

        self.assertEqual(len(sections['projects']), 2)
        self.assertEqual(len(sections['certifications']), 2)
        self.assertEqual(sections['experience'], ['- Software Intern at Example Labs, Summer 2025'])
        self.assertNotIn('Software Intern at Example Labs, Summer 2025', sections['certifications'])

    def test_missing_sections_remain_empty(self):
        resume_text = 'Morgan Sample\nContact: morgan@example.test\nTechnical Skills:\nPython'
        sections = extract_profile_sections(resume_text)

        self.assertEqual(sections['education'], [])
        self.assertEqual(sections['projects'], [])
        self.assertEqual(sections['certifications'], [])
        self.assertEqual(sections['experience'], [])
        self.assertEqual(sections['technicalSkills'], ['Python'])
        self.assertNotIn(resume_text, str(sections))

    def test_docx_extraction_preserves_paragraph_boundaries_and_analysis(self):
        file_bytes = build_docx(self.resume_lines)
        extracted = extract_text_from_uploaded_file(file_bytes, 'synthetic.docx')
        self.assertIn('Academic Background:\nBSc Computer Science', extracted)

        result = asyncio.run(
            analyze_resume(UploadFile(filename='synthetic.docx', file=io.BytesIO(file_bytes)))
        )

        self.assertNotEqual(result['education'], result['projects'])
        self.assertNotEqual(result['certifications'], result['experience'])
        self.assertIn('python', [skill.lower() for skill in result['skills']])
        self.assertTrue(result['strengths'])
        self.assertTrue(result['improvements'])
        self.assertTrue(result['summary'])
        self.assertIn('BSc Computer Science', result['summary'])
        self.assertIn('Campus Planner', result['summary'])
        self.assertIn('Software Intern', result['summary'])
        self.assertEqual(result['education'], ['BSc Computer Science, North College, 2022-2026, GPA 3.8'])
        self.assertEqual(result['projects'], ['Campus Planner - Built with Python and React.'])
        self.assertEqual(result['certifications'], ['Cloud Fundamentals Certificate, 2025'])
        self.assertEqual(result['experience'], ['Software Intern at Example Labs, Summer 2025'])
        self.assertEqual(result['technicalSkills'], ['Python, React, PostgreSQL'])
        self.assertGreaterEqual(result['resumeScore'], 0)
        self.assertLessEqual(result['resumeScore'], 100)

    def test_docx_list_paragraphs_keep_bullet_markers(self):
        file_bytes = build_docx([('Delivered a measurable project outcome', True)])

        extracted = extract_text_from_uploaded_file(file_bytes, 'synthetic.docx')

        self.assertEqual(extracted, '• Delivered a measurable project outcome')

    def test_empty_docx_returns_a_client_error_instead_of_success(self):
        file_bytes = build_docx([])

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(analyze_resume(UploadFile(filename='empty.docx', file=io.BytesIO(file_bytes))))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn('No readable text', raised.exception.detail)

    def test_non_text_docx_returns_a_client_error(self):
        file_bytes = build_docx(['---', '•••'])

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(analyze_resume(UploadFile(filename='symbols.docx', file=io.BytesIO(file_bytes))))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn('No readable text', raised.exception.detail)

    def test_corrupted_encrypted_and_misnamed_docx_files_fail_safely(self):
        invalid_files = [
            ('corrupt.docx', b'not a zip archive'),
            ('encrypted.docx', b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy office container'),
            ('pdf-renamed.docx', build_pdf(['This is a PDF, not a DOCX'])),
        ]

        for filename, file_bytes in invalid_files:
            with self.subTest(filename=filename):
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(analyze_resume(UploadFile(filename=filename, file=io.BytesIO(file_bytes))))

                self.assertEqual(raised.exception.status_code, 400)
                self.assertIn('DOCX file could not be read', raised.exception.detail)

    def test_pdf_extraction_and_colon_headings(self):
        pdf_lines = [
            'Morgan Sample',
            'Education: BSc Mathematics, Example College, 2021-2025',
            'Projects:',
            'Budget Tracker built with Python',
        ]
        file_bytes = build_pdf(pdf_lines)
        extracted = extract_text_from_uploaded_file(file_bytes, 'synthetic.pdf')

        self.assertIn('Education:', extracted)
        self.assertIn('Projects:', extracted)
        result = asyncio.run(
            analyze_resume(UploadFile(filename='synthetic.pdf', file=io.BytesIO(file_bytes)))
        )

        self.assertEqual(result['education'], ['BSc Mathematics, Example College, 2021-2025'])
        self.assertEqual(result['projects'], ['Budget Tracker built with Python'])
        self.assertEqual(result['certifications'], [])
        self.assertEqual(result['experience'], [])
        self.assertIn('python', [skill.lower() for skill in result['skills']])

    def test_summary_is_empty_when_no_resume_facts_are_detected(self):
        result = asyncio.run(
            analyze_resume(UploadFile(filename='minimal.docx', file=io.BytesIO(build_docx(['Jordan Example']))))
        )

        self.assertEqual(result['summary'], '')


if __name__ == '__main__':
    unittest.main()
