import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Student from '../models/student.model.js'
import { validateLoginInput, validateRegistrationInput } from '../utils/authValidation.js'

function buildStudentPayload(student) {
  return {
    id: student._id.toString(),
    fullName: student.fullName,
    email: student.email,
    role: student.role,
  }
}

export async function registerStudent(request, response) {
  try {
    const payload = {
      fullName: request.body.fullName,
      studentId: request.body.studentId,
      email: request.body.email,
      phone: request.body.phone,
      password: request.body.password,
      department: request.body.department,
      branch: request.body.branch,
      graduationYear: request.body.graduationYear,
    }

    const { isValid, errors } = validateRegistrationInput(payload)
    if (!isValid) {
      console.warn('Registration validation failed:', errors)
      return response.status(400).json({
        success: false,
        message: 'Validation error: Please check the form fields and try again.',
        errors,
      })
    }

    const normalizedEmail = String(payload.email).trim().toLowerCase()
    const normalizedStudentId = String(payload.studentId).trim().toUpperCase()

    const existingEmail = await Student.findOne({ email: normalizedEmail })
    if (existingEmail) {
      console.warn(`Registration blocked: duplicate email attempted for ${normalizedEmail}`)
      return response.status(409).json({
        success: false,
        message: 'Email already exists.',
      })
    }

    const existingStudentId = await Student.findOne({ studentId: normalizedStudentId })
    if (existingStudentId) {
      console.warn(`Registration blocked: duplicate student ID attempted for ${normalizedStudentId}`)
      return response.status(409).json({
        success: false,
        message: 'Student ID already exists.',
      })
    }

    const hashedPassword = await bcrypt.hash(payload.password, 12)

    await Student.create({
      fullName: payload.fullName.trim(),
      studentId: normalizedStudentId,
      email: normalizedEmail,
      phone: String(payload.phone).trim(),
      password: hashedPassword,
      department: payload.department.trim(),
      branch: payload.branch.trim(),
      graduationYear: String(payload.graduationYear).trim(),
      role: 'student',
      isActive: true,
    })

    return response.status(201).json({
      success: true,
      message: 'Registration successful',
    })
  } catch (error) {
    console.error('Register student error:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack,
    })

    if (error?.name === 'ValidationError' || error?.code === 11000) {
      return response.status(400).json({
        success: false,
        message: 'Validation error: Please check your details and try again.',
      })
    }

    return response.status(500).json({
      success: false,
      message: 'Backend server unavailable. Please try again later.',
    })
  }
}

export async function loginStudent(request, response) {
  try {
    const { email, password } = request.body
    const { isValid, errors } = validateLoginInput({ email, password })

    if (!isValid) {
      return response.status(400).json({
        success: false,
        message: 'Please check your email and password.',
        errors,
      })
    }

    const student = await Student.findOne({ email: String(email).trim().toLowerCase() }).select('+password')

    if (!student) {
      return response.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      })
    }

    if (!student.isActive) {
      return response.status(401).json({
        success: false,
        message: 'Your account is inactive. Please contact support.',
      })
    }

    const isMatch = await bcrypt.compare(password, student.password)
    if (!isMatch) {
      return response.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      })
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return response.status(500).json({
        success: false,
        message: 'JWT secret is not configured.',
      })
    }

    const token = jwt.sign(
      {
        id: student._id.toString(),
        email: student.email,
        role: student.role,
      },
      jwtSecret,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
      },
    )

    return response.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      student: buildStudentPayload(student),
    })
  } catch (error) {
    console.error('Login student error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to log in at the moment.',
    })
  }
}

export async function getCurrentStudent(request, response) {
  try {
    const student = await Student.findById(request.student.id).select('-password')

    if (!student) {
      return response.status(404).json({
        success: false,
        message: 'Student not found.',
      })
    }

    return response.status(200).json({
      success: true,
      student: buildStudentPayload(student),
    })
  } catch (error) {
    console.error('Get current student error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to fetch student information.',
    })
  }
}
