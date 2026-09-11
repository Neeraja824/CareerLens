import fs from 'node:fs'
import path from 'node:path'
import Resume from '../models/resume.model.js'

const allowedTypes = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const safeFileType = (fileType) => allowedTypes[fileType] || (fileType || '').toLowerCase()

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
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  }
}

export async function uploadResume(request, response) {
  try {
    if (!request.file) {
      return response.status(400).json({
        success: false,
        message: 'Please upload a PDF or DOCX file.',
      })
    }

    const fileType = safeFileType(request.file.mimetype)

    if (!['pdf', 'docx'].includes(fileType)) {
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

    return response.status(201).json({
      success: true,
      message: 'Resume uploaded successfully. AI analysis will be available after analysis is completed.',
      resume: buildResumePayload(resume),
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
    const fileExtension = resume.fileType === 'pdf' ? 'pdf' : 'docx'

    response.setHeader('Content-Disposition', `inline; filename="${resume.originalFileName}"`)
    response.setHeader('Content-Type', fileExtension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
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

    const fileType = safeFileType(request.file.mimetype)

    if (!['pdf', 'docx'].includes(fileType)) {
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
    resume.status = 'replaced'
    resume.isCurrent = true
    await resume.save()

    const resumes = await Resume.find({ userId: request.student.id })
    for (const item of resumes) {
      if (item._id.toString() !== resume._id.toString()) {
        item.isCurrent = false
        await item.save()
      }
    }

    return response.status(200).json({
      success: true,
      message: 'Resume updated successfully.',
      resume: buildResumePayload(resume),
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
