import io
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
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_text_from_pdf(file_bytes):
    if PdfReader is None:
        return ''

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ''
            pages.append(text)
        return '\n'.join(pages)
    except Exception:
        return ''


def extract_text_from_docx(file_bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            document_xml = archive.read('word/document.xml')
        root = ElementTree.fromstring(document_xml)
        namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        paragraphs = []
        for element in root.findall('.//w:t', namespace):
            if element.text:
                paragraphs.append(element.text)
        return '\n'.join(paragraphs)
    except Exception:
        return ''


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


def extract_lines(text, keywords):
    lines = []
    for line in re.split(r'\n+', text):
        clean_line = normalize_space(line)
        if not clean_line:
            continue
        lower_line = clean_line.lower()
        if any(keyword in lower_line for keyword in keywords):
            lines.append(clean_line)
    return lines


def extract_profile_sections(text):
    sections = {
        'education': extract_lines(text, ['education', 'b.tech', 'b.e', 'bca', 'mca', 'graduation', 'cgpa', 'gpa', 'degree']),
        'projects': extract_lines(text, ['project', 'projects', 'portfolio', 'built', 'developed']),
        'certifications': extract_lines(text, ['certification', 'certificate', 'aws certified', 'google cloud', 'oracle', 'microsoft', 'coursera']),
        'experience': extract_lines(text, ['experience', 'internship', 'intern', 'worked at', 'worked as', 'full time', 'fresher']),
    }

    for key in sections:
        sections[key] = [line for line in sections[key] if len(line) > 3]

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


def build_summary(skills, education, projects, certifications, experience):
    parts = []

    if skills:
        parts.append(f"The candidate demonstrates strong skills in {', '.join(skills[:6])}.")
    if education:
        parts.append('The resume includes academic background information.')
    if projects:
        parts.append('Project work is mentioned, suggesting practical implementation experience.')
    if certifications:
        parts.append('Relevant certifications are highlighted, adding credibility to the profile.')
    if experience:
        parts.append('Internship or work experience is present, indicating applied exposure to real-world work.')

    if not parts:
        return 'The uploaded resume provides limited structured information, so adding a clearer skills section, projects, and academic details would improve the profile.'

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

    file_bytes = await resume.read()
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail='Uploaded resume is empty. Please upload a valid file.')

    extracted_text = extract_text_from_uploaded_file(file_bytes, resume.filename)
    cleaned_text = clean_text(extracted_text)

    if not cleaned_text:
        raise HTTPException(status_code=400, detail='Unable to extract meaningful text from the uploaded resume.')

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
        'certifications': sections['certifications'],
        'experience': sections['experience'],
        'summary': build_summary(skills, sections['education'], sections['projects'], sections['certifications'], sections['experience']),
    }

    return analysis


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')), reload=True)
