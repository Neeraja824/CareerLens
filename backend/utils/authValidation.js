const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistrationInput(student) {
  const errors = {}

  if (!student.fullName || !student.fullName.trim()) {
    errors.fullName = 'Please enter your full name.'
  }

  if (!student.studentId || !student.studentId.trim()) {
    errors.studentId = 'Please enter your student ID.'
  }

  if (!student.email || !student.email.trim()) {
    errors.email = 'Please enter your college email.'
  } else if (!emailRegex.test(student.email.trim())) {
    errors.email = 'Please enter a valid email address.'
  }

  if (!student.phone || !student.phone.trim()) {
    errors.phone = 'Please enter your phone number.'
  } else if (!/^\d{10}$/.test(student.phone.replace(/\D/g, ''))) {
    errors.phone = 'Please enter a valid 10-digit phone number.'
  }

  if (!student.password) {
    errors.password = 'Password is required.'
  } else if (student.password.length < 8) {
    errors.password = 'Password must contain at least 8 characters.'
  }

  if (!student.department || !student.department.trim()) {
    errors.department = 'Please select your department.'
  }

  if (!student.branch || !student.branch.trim()) {
    errors.branch = 'Please select your branch.'
  }

  if (!student.graduationYear || !String(student.graduationYear).trim()) {
    errors.graduationYear = 'Please enter your graduation year.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

export function validateLoginInput({ email, password }) {
  const errors = {}

  if (!email || !String(email).trim()) {
    errors.email = 'Please enter your email.'
  } else if (!emailRegex.test(String(email).trim())) {
    errors.email = 'Please enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Please enter your password.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
