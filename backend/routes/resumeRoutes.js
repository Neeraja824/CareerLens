import express from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { authMiddleware } from '../middleware/authMiddleware.js'
import {
  deleteResume,
  getMyResumes,
  getResumeById,
  replaceResume,
  uploadResume,
  viewResume,
} from '../controllers/resumeController.js'

const router = express.Router()
const uploadsDirectory = path.resolve(process.cwd(), 'uploads', 'resumes')

fs.mkdirSync(uploadsDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsDirectory)
  },
  filename: (_request, file, callback) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`
    callback(null, safeName)
  },
})

const fileFilter = (_request, file, callback) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]
  const normalizedName = (file.originalname || '').toLowerCase()
  const isAllowedByExtension = normalizedName.endsWith('.pdf') || normalizedName.endsWith('.doc') || normalizedName.endsWith('.docx')

  if (allowedTypes.includes(file.mimetype) || isAllowedByExtension) {
    callback(null, true)
    return
  }

  callback(new Error('Please upload a PDF or DOCX file.'))
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
})

router.post('/upload', authMiddleware, upload.single('resume'), uploadResume)
router.get('/me', authMiddleware, getMyResumes)
router.get('/:id', authMiddleware, getResumeById)
router.get('/:id/view', authMiddleware, viewResume)
router.put('/:id', authMiddleware, upload.single('resume'), replaceResume)
router.delete('/:id', authMiddleware, deleteResume)

router.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return response.status(400).json({
        success: false,
        message: 'Resume size must be less than 5 MB.',
      })
    }
  }

  if (error && error.message === 'Please upload a PDF or DOCX file.') {
    return response.status(400).json({
      success: false,
      message: error.message,
    })
  }

  return response.status(500).json({
    success: false,
    message: 'Resume upload failed. Please try again.',
  })
})

export default router
