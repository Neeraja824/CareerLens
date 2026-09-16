import mongoose from 'mongoose'

export async function connectDatabase() {
  const { MONGODB_URI } = process.env
  if (!MONGODB_URI || MONGODB_URI === 'your_mongodb_connection_string') {
    console.error('MongoDB configuration error: MONGODB_URI is not configured.')
    return false
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    })
    console.log('MongoDB connected successfully')
    return true
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    let category = 'database connection'

    if (error?.code === 8000 || message.includes('authentication failed') || message.includes('bad auth')) {
      category = 'authentication'
    } else if (message.includes('querysrv') || message.includes('invalid connection string') || message.includes('uri')) {
      category = 'invalid URI'
    } else if (message.includes('timed out') || message.includes('server selection') || message.includes('network')) {
      category = 'network/IP access'
    }

    console.error(`MongoDB connection failed (${category}). Check Atlas credentials, Network Access, and backend environment configuration.`)
    return false
  }
}
