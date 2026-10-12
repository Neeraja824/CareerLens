import io
import logging
import os
import re
import zipfile
from xml.etree import ElementTree

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None

load_dotenv()
app = FastAPI(title='CareerLens AI Service', version='0.1.0')
logger = logging.getLogger(__name__)


class TextExtractionError(Exception):
    pass

TECH_SKILL_LIBRARY = {
    'programming_languages': ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'php', 'ruby', 'swift', 'kotlin', 'sql', 'bash', 'powershell'],
    'frontend': ['html', 'css', 'react', 'next.js', 'vite', 'redux', 'tailwind', 'bootstrap', 'javascript', 'typescript'],
    'backend': ['node.js', 'express', 'fastapi', 'django', 'flask', 'spring boot', 'rest api', 'api', 'graphql'],
    'databases': ['mongodb', 'mysql', 'postgresql', 'sql', 'firebase', 'redis'],
    'frameworks': ['react', 'express', 'fastapi', 'django', 'flask', 'spring boot', 'bootstrap', 'vite'],
    'tools': ['git', 'github', 'docker', 'kubernetes', 'linux', 'postman', 'figma', 'jira'],
    'cloud': ['aws', 'azure', 'gcp', 'firebase', 'cloud'],
}

RECOMMENDED_SKILLS = ['React', 'Node.js', 'REST API', 'SQL', 'Git', 'Docker', 'AWS', 'MongoDB', 'JavaScript', 'Python']
SOFT_SKILLS = ['communication', 'leadership', 'teamwork', 'problem solving', 'adaptability', 'analytical thinking']


def normalize_space(text):
    return ' '.join(text.split())


def clean_text(text):
    text = text.replace('\x00', ' ')
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = [normalize_space(line) for line in text.split('\n')]

    cleaned_lines = []
    for line in lines:
        if line or (cleaned_lines and cleaned_lines[-1]):
            cleaned_lines.append(line)

    return '\n'.join(cleaned_lines).strip()


def extract_text_from_pdf(file_bytes):
    if PdfReader is None:
        raise TextExtractionError('PDF text extraction is unavailable.')

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ''
            pages.append(text)
        return '\n'.join(pages)
    except Exception as error:
        raise TextExtractionError('The PDF file could not be read.') from error


def extract_text_from_docx(file_bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            document_xml = archive.read('word/document.xml')
        root = ElementTree.fromstring(document_xml)
        namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        paragraphs = []
        for paragraph in root.findall('.//w:p', namespace):
            paragraph_text = []
            for element in paragraph.iter():
                if element.tag.endswith('}t') and element.text:
                    paragraph_text.append(element.text)
                elif element.tag.endswith('}tab'):
                    paragraph_text.append('\t')
                elif element.tag.endswith('}br'):
                    paragraph_text.append('\n')

            text = ''.join(paragraph_text).strip()
            if text:
                if paragraph.find('w:pPr/w:numPr', namespace) is not None:
                    text = f'• {text}'
                paragraphs.append(text)
        return '\n'.join(paragraphs)
    except Exception as error:
        raise TextExtractionError('The DOCX file could not be read.') from error


def extract_text_from_uploaded_file(file_bytes, filename):
    file_name = (filename or '').lower()

    if file_name.endswith('.pdf'):
        return extract_text_from_pdf(file_bytes)

    if file_name.endswith('.docx'):
        return extract_text_from_docx(file_bytes)

    # Best-effort fallback for .doc or other text-like uploads.
    try:
        return file_bytes.decode('utf-8', errors='ignore')
    except Exception:
        return ''


def detect_skills(text):
    combined_text = text.lower()
    detected = []

    for category, skills in TECH_SKILL_LIBRARY.items():
        for skill in skills:
            pattern = re.escape(skill.lower())
            if re.search(rf'(?<![a-z]){pattern}(?![a-z])', combined_text):
                detected.append(skill)

    for skill in SOFT_SKILLS:
        if skill in combined_text:
            detected.append(skill.title())

    unique = []
    for item in detected:
        if item not in unique:
            unique.append(item)

    return unique


SECTION_ALIASES = {
    'education': (
        'education',
        'academic background',
        'academic qualifications',
        'educational background',
        'educational qualifications',
        'education qualifications',
    ),
    'projects': (
        'projects',
        'project experience',
        'academic projects',
        'personal projects',
        'key projects',
        'selected projects',
    ),
    'technicalSkills': (
        'technical skills',
        'technical skill',
        'skills',
        'core skills',
        'core competencies',
        'technical expertise',
    ),
    'certifications': (
        'certifications',
        'certificates',
        'licenses and certifications',
        'licenses certifications',
        'licenses',
    ),
    'experience': (
        'experience',
        'work experience',
        'professional experience',
        'employment history',
        'work history',
        'career history',
        'internships',
        'internship',
        'internship experience',
        'experience internships',
        'professional experience internships',
    ),
    'achievements': (
        'achievements',
        'awards',
        'awards and honors',
        'awards and honours',
        'honors and awards',
        'honours and awards',
        'accomplishments',
    ),
    'languages': ('languages', 'language'),
    'summary': (
        'summary',
        'profile summary',
        'professional summary',
        'career objective',
        'objective',
        'about me',
        'profile',
    ),
}


def normalize_heading(text):
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()


NORMALIZED_SECTION_ALIASES = {
    normalize_heading(alias): section
    for section, aliases in SECTION_ALIASES.items()
    for alias in aliases
}

SECTION_HEADING_PATTERN = re.compile(
    r'(?<![a-z0-9])(?P<label>'
    + '|'.join(
        '[\\s/&|-]+'.join(re.escape(token) for token in normalize_heading(alias).split())
        for alias in sorted(NORMALIZED_SECTION_ALIASES, key=len, reverse=True)
    )
    + r')(?P<separator>\s*:\s*|\s*[-\u2013\u2014]\s*)',
    re.IGNORECASE,
)


def detect_section_heading(line):
    candidate = re.sub(r'^[\s•·▪◦\-*#\d.)]+', '', line).strip()
    if not candidate:
        return None, ''

    match = SECTION_HEADING_PATTERN.match(candidate)
    if match:
        section = NORMALIZED_SECTION_ALIASES.get(normalize_heading(match.group('label')))
        if section:
            return section, candidate[match.end():].strip()

    section = NORMALIZED_SECTION_ALIASES.get(normalize_heading(candidate))
    if section:
        return section, ''

    return None, ''


def extract_profile_sections(text):
    sections = {key: [] for key in SECTION_ALIASES}
    current_section = None

    for line in text.splitlines():
        clean_line = normalize_space(line)
        if not clean_line:
            continue

        candidate = re.sub(r'^[\s•·▪◦\-*#\d.)]+', '', clean_line).strip()
        heading_matches = list(SECTION_HEADING_PATTERN.finditer(candidate))
        if heading_matches:
            prefix = candidate[:heading_matches[0].start()].strip()
            if prefix and current_section:
                sections[current_section].append(prefix)

            for index, match in enumerate(heading_matches):
                section = NORMALIZED_SECTION_ALIASES[normalize_heading(match.group('label'))]
                current_section = section
                content_end = heading_matches[index + 1].start() if index + 1 < len(heading_matches) else len(candidate)
                inline_content = candidate[match.end():content_end].strip(' \t|')
                if inline_content:
                    sections[current_section].append(inline_content)
            continue

        heading, inline_content = detect_section_heading(clean_line)
        if heading:
            current_section = heading
            if inline_content:
                sections[current_section].append(inline_content)
            continue

        if current_section:
            sections[current_section].append(clean_line)

    return sections


def build_strengths(skills, projects, certifications, experience, education):
    strengths = []

    if skills:
        strengths.append('Strong technical foundation with relevant skills across core domains.')
    if projects:
        strengths.append('Shows practical project experience and hands-on implementation ability.')
    if certifications:
        strengths.append('Includes relevant certifications that strengthen profile credibility.')
    if experience:
        strengths.append('Contains internship or work experience that demonstrates applied learning.')
    if education:
        strengths.append('Academic background is present and supports the candidate profile.')

    if not strengths:
        strengths.append('Resume contains useful information, but more detail would improve clarity and impact.')

    return strengths


def build_improvements(skills, missing_skills, projects, certifications, experience):
    improvements = []

    if missing_skills:
        improvements.append(f"Consider adding more exposure to: {', '.join(missing_skills[:3])}.")
    if not projects:
        improvements.append('Add project descriptions with outcomes, technologies used, and measurable results.')
    if not certifications:
        improvements.append('Include certificates or training details to strengthen profile credibility.')
    if not experience:
        improvements.append('Add internship, work, or volunteer experience to show applied knowledge.')
    if not skills:
        improvements.append('Highlight key technical skills more clearly with a dedicated skills section.')

    if not improvements:
        improvements.append('Keep your resume structured, concise, and outcome-focused to improve readability.')

    return improvements


def calculate_resume_score(skills, projects, certifications, experience, education, text):
    score = 35
    score += min(25, len(skills) * 3)
    score += min(15, len(projects) * 6)
    score += min(10, len(certifications) * 5)
    score += min(10, len(experience) * 5)
    score += min(10, len(education) * 5)

    if len(text) > 250:
        score += 5
    if len(text) > 1200:
        score += 5

    # Maintain a realistic baseline for resume-readiness scoring.
    return max(0, min(100, score))


def build_summary(skills, education, projects, certifications, experience, resume_summary=None):
    if resume_summary:
        return normalize_space(resume_summary)

    parts = []

    if skills:
        parts.append(f"Skills listed include {', '.join(skills[:6])}.")
    if education:
        parts.append(f"Education includes {education[0]}.")
    if projects:
        parts.append(f"Project work includes {projects[0]}.")
    if certifications:
        parts.append(f"Certifications include {certifications[0]}.")
    if experience:
        parts.append(f"Experience includes {experience[0]}.")

    if not parts:
        return ''

    return ' '.join(parts)


@app.get('/health')
def health_check():
    return {'success': True, 'message': 'CareerLens AI service is running'}


@app.post('/analyze-resume')
async def analyze_resume(resume: UploadFile = File(...)):
    if not resume.filename:
        raise HTTPException(status_code=400, detail='No resume file was uploaded.')

    file_name = (resume.filename or '').lower()
    allowed_extensions = {'.pdf', '.doc', '.docx'}
    if not any(file_name.endswith(extension) for extension in allowed_extensions):
        raise HTTPException(status_code=400, detail='Please upload a PDF or DOCX file.')

    try:
        file_bytes = await resume.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail='Uploaded resume is empty. Please upload a valid file.')

        try:
            extracted_text = extract_text_from_uploaded_file(file_bytes, resume.filename)
        except TextExtractionError as error:
            extension = os.path.splitext(file_name)[1]
            cause_type = type(error.__cause__).__name__ if error.__cause__ else type(error).__name__
            logger.warning('Resume %s extraction failed (%s)', extension or 'document', cause_type)
            detail = (
                'The DOCX file could not be read. Verify that it is a valid, unprotected DOCX file.'
                if file_name.endswith('.docx')
                else 'The uploaded document could not be read. Please verify the file and try again.'
            )
            raise HTTPException(
                status_code=400,
                detail=detail,
            ) from error

        cleaned_text = clean_text(extracted_text)
        if not cleaned_text or not any(character.isalnum() for character in cleaned_text):
            detail = (
                'No readable text was found in the DOCX file.'
                if file_name.endswith('.docx')
                else 'No readable text was found in the uploaded resume.'
            )
            raise HTTPException(status_code=400, detail=detail)

        skills = detect_skills(cleaned_text)
        sections = extract_profile_sections(cleaned_text)
        missing_skills = [skill for skill in RECOMMENDED_SKILLS if skill.lower() not in ' '.join(skills).lower()][:5]

        analysis = {
            'extractedText': cleaned_text,
            'resumeScore': calculate_resume_score(
                skills,
                sections['projects'],
                sections['certifications'],
                sections['experience'],
                sections['education'],
                cleaned_text,
            ),
            'skills': skills,
            'missingSkills': missing_skills,
            'strengths': build_strengths(skills, sections['projects'], sections['certifications'], sections['experience'], sections['education']),
            'improvements': build_improvements(skills, missing_skills, sections['projects'], sections['certifications'], sections['experience']),
            'education': sections['education'],
            'projects': sections['projects'],
            'technicalSkills': sections['technicalSkills'],
            'certifications': sections['certifications'],
            'experience': sections['experience'],
            'achievements': sections['achievements'],
            'languages': sections['languages'],
            'summary': build_summary(
                skills,
                sections['education'],
                sections['projects'],
                sections['certifications'],
                sections['experience'],
                '\n'.join(sections['summary']),
            ),
        }
        return analysis
    except HTTPException:
        raise
    except Exception as error:
        logger.exception('Unexpected resume analysis failure')
        raise HTTPException(
            status_code=500,
            detail='Resume analysis failed due to an internal service error.',
        ) from error


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')), reload=True)
