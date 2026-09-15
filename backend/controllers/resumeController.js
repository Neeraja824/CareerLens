import fs from 'node:fs'
import path from 'node:path'
import Resume from '../models/resume.model.js'

const allowedTypes = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

export const supportedResumeTypes = Object.keys(allowedTypes)

export function isSupportedResumeType(fileType = '', fileName = '') {
  if (allowedTypes[fileType]) {
    return true
  }

  const normalizedType = String(fileType || '').toLowerCase()
  const extension = path.extname(fileName || '').toLowerCase().slice(1)

  return ['pdf', 'doc', 'docx'].includes(normalizedType) || ['pdf', 'doc', 'docx'].includes(extension)
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

const safeFileType = (fileType, fileName = '') => {
  if (allowedTypes[fileType]) {
    return allowedTypes[fileType]
  }

  const extension = path.extname(fileName || '').toLowerCase().slice(1)

  if (extension === 'pdf') return 'pdf'
  if (extension === 'doc') return 'doc'
  if (extension === 'docx') return 'docx'

  return (fileType || '').toLowerCase()
}

function buildResumePayload(resume) {
  return {
    id: resume._id.toString(),
    userId: resume.userId.toString(),
    originalFileName: resume.originalFileName,
    storedFileName: resume.storedFileName,
    fileType: resume.fileType,
    fileSize: resume.fileSize,
    uploadDate: resume.uploadDate,
    storagePath: resume.storagePath,
    status: resume.status,
    isCurrent: resume.isCurrent,
    resumeScore: resume.resumeScore ?? null,
    skills: resume.skills || [],
    missingSkills: resume.missingSkills || [],
    strengths: resume.strengths || [],
    improvements: resume.improvements || [],
    education: resume.education || [],
    projects: resume.projects || [],
    certifications: resume.certifications || [],
    experience: resume.experience || [],
    summary: resume.summary || '',
    analysisCompletedAt: resume.analysisCompletedAt,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  }
}

async function analyzeResumeWithAi(resume) {
  const fileBuffer = fs.readFileSync(resume.storagePath)

  const mimeType = resume.fileType === 'pdf'
    ? 'application/pdf'
    : resume.fileType === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/msword'

  const formData = new FormData()
  formData.append('resume', new Blob([fileBuffer], { type: mimeType }), resume.originalFileName)

  const response = await fetch(`${AI_SERVICE_URL}/analyze-resume`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({
      message: 'Resume analysis failed. Please try again later.',
    }))

    throw new Error(errorPayload.message || 'Resume analysis failed. Please try again later.')
  }

  return response.json()
}

async function applyAnalysisToResume(resume, analysisResult) {
  if (!analysisResult) {
    return resume
  }

  resume.extractedText = analysisResult.extractedText || resume.extractedText || ''
  resume.resumeScore = analysisResult.resumeScore ?? resume.resumeScore ?? null
  resume.skills = Array.isArray(analysisResult.skills) ? analysisResult.skills : []
  resume.missingSkills = Array.isArray(analysisResult.missingSkills) ? analysisResult.missingSkills : []
  resume.strengths = Array.isArray(analysisResult.strengths) ? analysisResult.strengths : []
  resume.improvements = Array.isArray(analysisResult.improvements) ? analysisResult.improvements : []
  resume.education = Array.isArray(analysisResult.education) ? analysisResult.education : []
  resume.projects = Array.isArray(analysisResult.projects) ? analysisResult.projects : []
  resume.certifications = Array.isArray(analysisResult.certifications) ? analysisResult.certifications : []
  resume.experience = Array.isArray(analysisResult.experience) ? analysisResult.experience : []
  resume.summary = analysisResult.summary || resume.summary || ''
  resume.analysisCompletedAt = new Date()
  resume.status = 'analysis-ready'

  await resume.save()
  return resume
}

export async function uploadResume(request, response) {
  try {
    if (!request.file) {
      return response.status(400).json({
        success: false,
        message: 'Please upload a PDF or DOCX file.',
      })
    }

    const fileType = safeFileType(request.file.mimetype, request.file.originalname)

    if (!['pdf', 'doc', 'docx'].includes(fileType)) {
      return response.status(400).json({
        success: false,
        message: 'Please upload a PDF or DOCX file.',
      })
    }

    const existingResumes = await Resume.find({ userId: request.student.id })

    for (const resume of existingResumes) {
      resume.isCurrent = false
      await resume.save()
    }

    const resume = await Resume.create({
      userId: request.student.id,
      originalFileName: request.file.originalname,
      storedFileName: request.file.filename,
      fileType,
      fileSize: request.file.size,
      uploadDate: new Date(),
      storagePath: request.file.path,
      status: 'uploaded',
      isCurrent: true,
    })

    let analysisResult = null

    try {
      analysisResult = await analyzeResumeWithAi(resume)
      await applyAnalysisToResume(resume, analysisResult)
    } catch (analysisError) {
      resume.status = 'pending-analysis'
      await resume.save()
      console.error('Resume analysis failed:', analysisError.message)

      return response.status(502).json({
        success: false,
        message: 'Resume uploaded successfully, but the AI analysis service is currently unavailable. Please try again later.',
        resume: buildResumePayload(resume),
      })
    }

    return response.status(201).json({
      success: true,
      message: 'Resume uploaded and analyzed successfully.',
      resume: buildResumePayload(resume),
      analysis: analysisResult,
    })
  } catch (error) {
    console.error('Upload resume error:', error)

    if (error?.message === 'Please upload a PDF or DOCX file.') {
      return response.status(400).json({
        success: false,
        message: error.message,
      })
    }

    return response.status(500).json({
      success: false,
      message: 'Resume upload failed. Please try again.',
    })
  }
}

export async function getMyResumes(request, response) {
  try {
    const resumes = await Resume.find({ userId: request.student.id }).sort({ uploadDate: -1, createdAt: -1 })

    return response.status(200).json({
      success: true,
      resumes: resumes.map(buildResumePayload),
    })
  } catch (error) {
    console.error('Get my resumes error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to load resumes.',
    })
  }
}

export async function getResumeById(request, response) {
  try {
    const resume = await Resume.findOne({
      _id: request.params.id,
      userId: request.student.id,
    })

    if (!resume) {
      return response.status(404).json({
        success: false,
        message: 'Resume not found.',
      })
    }

    return response.status(200).json({
      success: true,
      resume: buildResumePayload(resume),
    })
  } catch (error) {
    console.error('Get resume by id error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to load resume.',
    })
  }
}

export async function viewResume(request, response) {
  try {
    const resume = await Resume.findOne({
      _id: request.params.id,
      userId: request.student.id,
    })

    if (!resume) {
      return response.status(404).json({
        success: false,
        message: 'Resume not found.',
      })
    }

    if (!fs.existsSync(resume.storagePath)) {
      return response.status(404).json({
        success: false,
        message: 'Resume file not found.',
      })
    }

    const fileBuffer = fs.readFileSync(resume.storagePath)
    const fileExtension = resume.fileType === 'pdf' ? 'pdf' : resume.fileType === 'docx' ? 'docx' : 'doc'

    response.setHeader('Content-Disposition', `inline; filename="${resume.originalFileName}"`)
    response.setHeader('Content-Type', fileExtension === 'pdf'
      ? 'application/pdf'
      : fileExtension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword')
    response.send(fileBuffer)
  } catch (error) {
    console.error('View resume error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to view resume.',
    })
  }
}

export async function replaceResume(request, response) {
  try {
    const resume = await Resume.findOne({
      _id: request.params.id,
      userId: request.student.id,
    })

    if (!resume) {
      return response.status(404).json({
        success: false,
        message: 'Resume not found.',
      })
    }

    if (!request.file) {
      return response.status(400).json({
        success: false,
        message: 'Please upload a PDF or DOCX file.',
      })
    }

    const fileType = safeFileType(request.file.mimetype, request.file.originalname)

    if (!['pdf', 'doc', 'docx'].includes(fileType)) {
      return response.status(400).json({
        success: false,
        message: 'Please upload a PDF or DOCX file.',
      })
    }

    if (fs.existsSync(resume.storagePath)) {
      fs.unlinkSync(resume.storagePath)
    }

    resume.originalFileName = request.file.originalname
    resume.storedFileName = request.file.filename
    resume.fileType = fileType
    resume.fileSize = request.file.size
    resume.uploadDate = new Date()
    resume.storagePath = request.file.path
    resume.status = 'uploaded'
    resume.isCurrent = true
    resume.extractedText = ''
    resume.resumeScore = null
    resume.skills = []
    resume.missingSkills = []
    resume.strengths = []
    resume.improvements = []
    resume.education = []
    resume.projects = []
    resume.certifications = []
    resume.experience = []
    resume.summary = ''
    resume.analysisCompletedAt = null
    await resume.save()

    const resumes = await Resume.find({ userId: request.student.id })
    for (const item of resumes) {
      if (item._id.toString() !== resume._id.toString()) {
        item.isCurrent = false
        await item.save()
      }
    }

    let analysisResult = null

    try {
      analysisResult = await analyzeResumeWithAi(resume)
      await applyAnalysisToResume(resume, analysisResult)
    } catch (analysisError) {
      resume.status = 'pending-analysis'
      await resume.save()
      console.error('Replace resume analysis failed:', analysisError.message)

      return response.status(502).json({
        success: false,
        message: 'Resume uploaded successfully, but the AI analysis service is currently unavailable. Please try again later.',
        resume: buildResumePayload(resume),
      })
    }

    return response.status(200).json({
      success: true,
      message: 'Resume updated and analyzed successfully.',
      resume: buildResumePayload(resume),
      analysis: analysisResult,
    })
  } catch (error) {
    console.error('Replace resume error:', error)
    return response.status(500).json({
      success: false,
      message: 'Resume upload failed. Please try again.',
    })
  }
}

export async function deleteResume(request, response) {
  try {
    const resume = await Resume.findOne({
      _id: request.params.id,
      userId: request.student.id,
    })

    if (!resume) {
      return response.status(404).json({
        success: false,
        message: 'Resume not found.',
      })
    }

    if (fs.existsSync(resume.storagePath)) {
      fs.unlinkSync(resume.storagePath)
    }

    await Resume.deleteOne({ _id: resume._id })

    return response.status(200).json({
      success: true,
      message: 'Resume deleted successfully.',
    })
  } catch (error) {
    console.error('Delete resume error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to delete resume.',
    })
  }
}
