import Student from '../models/student.model.js'

const allowedProfileFields = [
  'fullName',
  'phone',
  'department',
  'branch',
  'academicYear',
  'education',
  'graduationYear',
  'careerInterests',
  'preferredJobRoles',
  'preferredLocations',
  'semester',
  'cgpa',
  'tenthPercentage',
  'intermediatePercentage',
  'gender',
  'dateOfBirth',
  'skills',
  'projects',
  'certifications',
  'internships',
  'resumeUrl',
  'resumeFileName',
]

export async function getStudentProfile(request, response) {
  try {
    const student = await Student.findById(request.student.id).select('-password')

    if (!student) {
      return response.status(404).json({
        success: false,
        message: 'Student profile not found.',
      })
    }

    return response.status(200).json({
      success: true,
      student,
    })
  } catch (error) {
    console.error('Get student profile error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to load student profile.',
    })
  }
}

export async function updateStudentProfile(request, response) {
  try {
    const student = await Student.findById(request.student.id)

    if (!student) {
      return response.status(404).json({
        success: false,
        message: 'Student profile not found.',
      })
    }

    const blockedFields = ['_id', 'email', 'studentId', 'password', 'role', 'isActive', 'createdAt', 'updatedAt']
    const updates = {}

    Object.entries(request.body).forEach(([key, value]) => {
      if (blockedFields.includes(key) || !allowedProfileFields.includes(key)) {
        return
      }

      updates[key] = value
    })

    if (Object.keys(updates).length === 0) {
      return response.status(400).json({
        success: false,
        message: 'No valid profile changes were provided.',
      })
    }

    Object.assign(student, updates)
    await student.save()

    const updatedStudent = await Student.findById(student._id).select('-password')

    return response.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      student: updatedStudent,
    })
  } catch (error) {
    console.error('Update student profile error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to update student profile.',
    })
  }
}
