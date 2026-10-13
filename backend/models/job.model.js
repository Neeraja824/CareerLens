import mongoose from 'mongoose'

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20000,
    },
    requiredSkills: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: [],
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    experienceLevel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    employmentType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    externalApplicationUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
      validate: {
        validator: isHttpUrl,
        message: 'External application URL must use HTTP or HTTPS.',
      },
    },
    sourceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    sourceUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
      validate: {
        validator: isHttpUrl,
        message: 'Source URL must use HTTP or HTTPS.',
      },
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: String,
      enum: ['college_placement_office', 'employer'],
    },
    sourceListingId: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    importKey: {
      type: String,
      select: false,
    },
    postingDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'jobs',
  },
)

jobSchema.index({ isActive: 1, expiryDate: 1, postingDate: -1 })
jobSchema.index({ importKey: 1 }, { unique: true, sparse: true, name: 'unique_job_import_key' })

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema)

export default Job
