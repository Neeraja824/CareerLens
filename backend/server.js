import fs from 'node:fs'
import path from 'node:path'
import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const port = Number(process.env.PORT) || 5000
const resumeUploadsDirectory = path.resolve(process.cwd(), 'uploads', 'resumes')

fs.mkdirSync(resumeUploadsDirectory, { recursive: true })

try {
  await connectDatabase()
  app.listen(port, () => console.log(`CareerLens AI backend listening on http://localhost:${port}`))
} catch (error) {
  console.error('Unable to start backend:', error.message)
  process.exit(1)
}
