import mongoose from 'mongoose'

export async function connectDatabase() {
  const { MONGODB_URI } = process.env
  if (!MONGODB_URI || MONGODB_URI === 'your_mongodb_connection_string') {
    console.warn('MONGODB_URI is not configured. Starting without a database connection.')
    return false
  }

  await mongoose.connect(MONGODB_URI)
  console.log('MongoDB connected')
  return true
}
