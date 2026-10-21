import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Student from '../models/student.model.js'

export async function authMiddleware(request, response, next) {
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({
      success: false,
      message: 'Authentication required.',
    })
  }

  const token = authHeader.replace('Bearer ', '').trim()
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    return response.status(500).json({
      success: false,
      message: 'JWT secret is not configured.',
    })
  }

  let decoded
  try {
    decoded = jwt.verify(token, jwtSecret)
    if (!decoded || typeof decoded.id !== 'string') {
      throw new Error('Invalid token payload.')
    }
  } catch {
    return response.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    })
  }

  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({
      success: false,
      message: 'Database unavailable. Please try again later.',
    })
  }

  let student
  try {
    student = await Student.findById(decoded.id).select('-password')
  } catch (error) {
    if (error?.name === 'CastError') {
      return response.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
      })
    }

    return response.status(503).json({
      success: false,
      message: 'Authentication service is temporarily unavailable. Please try again later.',
    })
  }

  if (!student || !student.isActive) {
    return response.status(401).json({
      success: false,
      message: 'Invalid or inactive account.',
    })
  }

  request.student = {
    id: student._id.toString(),
    email: student.email,
    role: student.role,
    ...student.toObject(),
  }

  next()
}
