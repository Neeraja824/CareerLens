import express from 'express'
import { getCurrentStudent, loginStudent, registerStudent } from '../controllers/authController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = express.Router()

router.post('/register', registerStudent)
router.post('/login', loginStudent)
router.get('/me', authMiddleware, getCurrentStudent)

export default router
