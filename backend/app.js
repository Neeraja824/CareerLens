import cors from 'cors'
import express from 'express'
import authRoutes from './routes/authRoutes.js'
import resumeRoutes from './routes/resumeRoutes.js'
import studentRoutes from './routes/studentRoutes.js'

const app = express()
const allowedOrigins = ['http://localhost:8080']

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.options('*', cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ success: true, message: 'CareerLens AI backend is running' })
})

app.use('/api/auth', authRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/resumes', resumeRoutes)

app.use((_request, response) => {
  response.status(404).json({ success: false, message: 'Route not found' })
})

app.use((error, _request, response, _next) => {
  console.error(error)
  const statusCode = error.message.includes('CORS') ? 403 : 500
  response.status(statusCode).json({
    success: false,
    message: statusCode === 403 ? error.message : 'Internal server error',
  })
})

export default app
