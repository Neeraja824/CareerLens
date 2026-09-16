import mongoose from 'mongoose'

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      default: 'student',
      enum: ['student'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    department: {
      type: String,
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
    },
    academicYear: {
      type: String,
      default: '',
    },
    education: {
      type: String,
      default: '',
    },
    graduationYear: {
      type: String,
      default: '',
    },
    careerInterests: {
      type: String,
      default: '',
    },
    preferredJobRoles: {
      type: String,
      default: '',
    },
    preferredLocations: {
      type: String,
      default: '',
    },
    semester: {
      type: String,
      default: '',
    },
    cgpa: {
      type: Number,
      default: null,
    },
    tenthPercentage: {
      type: Number,
      default: null,
    },
    intermediatePercentage: {
      type: Number,
      default: null,
    },
    gender: {
      type: String,
      default: '',
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    skills: {
      type: [String],
      default: [],
    },
    projects: {
      type: [
        {
          title: String,
          description: String,
          link: String,
        },
      ],
      default: [],
    },
    certifications: {
      type: [
        {
          title: String,
          issuer: String,
          year: String,
        },
      ],
      default: [],
    },
    internships: {
      type: [
        {
          company: String,
          role: String,
          duration: String,
        },
      ],
      default: [],
    },
    resumeUrl: {
      type: String,
      default: '',
    },
    resumeFileName: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'students',
  },
)

studentSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = Date.now()
  next()
})

const Student = mongoose.models.Student || mongoose.model('Student', studentSchema)

export default Student
