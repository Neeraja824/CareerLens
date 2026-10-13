import express from 'express'
import { getJobById, getJobMatch, getJobs } from '../controllers/jobController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/', getJobs)
router.get('/:id/match', authMiddleware, getJobMatch)
router.get('/:id', getJobById)

export default router
