import mongoose from 'mongoose'

export async function connectDatabase() {
  const { MONGODB_URI } = process.env
  if (!MONGODB_URI || MONGODB_URI === 'your_mongodb_connection_string') {
    console.warn('MONGODB_URI is not configured. Starting without a database connection.')
    return false
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    })
    console.log('MongoDB connected')
    return true
  } catch (error) {
    const sanitizedMessage = String(error?.message || '').replace(/(:\/\/)([^:@]+)(:)([^@]+)(@)/, '$1$2$3[REDACTED]$5')
    console.error('MongoDB connection failed:', sanitizedMessage || 'Unknown database error')
    return false
  }
}
