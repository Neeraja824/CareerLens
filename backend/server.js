import fs from 'node:fs'
import path from 'node:path'
import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const port = Number(process.env.PORT) || 5000
const resumeUploadsDirectory = path.resolve(process.cwd(), 'uploads', 'resumes')

fs.mkdirSync(resumeUploadsDirectory, { recursive: true })

app.listen(port, () => {
  console.log(`CareerLens AI backend listening on http://localhost:${port}`)
})

connectDatabase()
  .then((databaseConnected) => {
    if (!databaseConnected) {
      console.warn('MongoDB is unavailable. Database-dependent endpoints will return an error until a connection is available.')
    }
  })
  .catch(() => {
    console.error('MongoDB connection initialization failed unexpectedly.')
  })
