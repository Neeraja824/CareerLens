import express from 'express'
import { getJobById, getJobMatch, getJobs, getRecommendedJobs } from '../controllers/jobController.js'
import { reviewNetlifyListing } from '../controllers/jobReviewController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { jobReviewAuthMiddleware } from '../middleware/jobReviewAuthMiddleware.js'

const router = express.Router()

router.get('/', getJobs)
router.get('/recommended', authMiddleware, getRecommendedJobs)
router.get('/:id/match', authMiddleware, getJobMatch)
router.post(
  '/review/netlify/:sourceListingId',
  jobReviewAuthMiddleware,
  reviewNetlifyListing,
)
router.get('/:id', getJobById)

export default router
