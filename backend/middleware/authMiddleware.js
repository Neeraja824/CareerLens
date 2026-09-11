import jwt from 'jsonwebtoken'
import Student from '../models/student.model.js'

export async function authMiddleware(request, response, next) {
  try {
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

    const decoded = jwt.verify(token, jwtSecret)
    const student = await Student.findById(decoded.id).select('-password')

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
  } catch (error) {
    return response.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    })
  }
}
