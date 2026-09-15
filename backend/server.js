import fs from 'node:fs'
import path from 'node:path'
import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const port = Number(process.env.PORT) || 5000
const resumeUploadsDirectory = path.resolve(process.cwd(), 'uploads', 'resumes')

fs.mkdirSync(resumeUploadsDirectory, { recursive: true })

const databaseConnected = await connectDatabase()

app.listen(port, () => {
  if (databaseConnected) {
    console.log(`CareerLens AI backend listening on http://localhost:${port}`)
  } else {
    console.warn(`CareerLens AI backend listening on http://localhost:${port} without MongoDB connection. Authentication and resume flows will fail until MongoDB Atlas is reachable.`)
  }
})
