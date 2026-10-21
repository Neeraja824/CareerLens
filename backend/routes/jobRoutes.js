import express from 'express'
import { getJobById, getJobMatch, getJobs, getRecommendedJobs } from '../controllers/jobController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/', getJobs)
router.get('/recommended', authMiddleware, getRecommendedJobs)
router.get('/:id/match', authMiddleware, getJobMatch)
router.get('/:id', getJobById)

export default router
