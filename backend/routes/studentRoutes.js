import express from 'express'
import { getStudentProfile, updateStudentProfile } from '../controllers/studentController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/me', authMiddleware, getStudentProfile)
router.put('/me', authMiddleware, updateStudentProfile)

export default router
