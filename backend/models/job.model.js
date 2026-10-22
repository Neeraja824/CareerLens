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
      trim: true,
      maxlength: 160,
    },
    experienceLevel: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    employmentType: {
      type: String,
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
    sourceCareersUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      validate: {
        validator: (value) => value === undefined || value === null || isHttpUrl(value),
        message: 'Source careers URL must use HTTP or HTTPS.',
      },
    },
    sourceProvider: {
      type: String,
      enum: ['greenhouse', 'lever'],
    },
    sourceCompany: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: String,
      enum: ['college_placement_office', 'employer'],
    },
    sourceReviewStatus: {
      type: String,
      enum: ['approved', 'rejected'],
    },
    sourceReviewAt: {
      type: Date,
      default: null,
    },
    sourceReviewBy: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    sourceReviewAvailability: {
      type: String,
      enum: ['available', 'unavailable'],
    },
    availabilityConfirmedAt: {
      type: Date,
      default: null,
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
      default: null,
    },
    sourceFirstPublishedAt: {
      type: Date,
      default: null,
    },
    sourceUpdatedAt: {
      type: Date,
      default: null,
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
    salary: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, trim: true, maxlength: 8 },
      interval: { type: String, enum: ['hour', 'day', 'week', 'month', 'year'] },
    },
  },
  {
    timestamps: true,
    collection: 'jobs',
  },
)

jobSchema.index({ isActive: 1, expiryDate: 1, postingDate: -1 })
jobSchema.index({ importKey: 1 }, { unique: true, sparse: true, name: 'unique_job_import_key' })
jobSchema.index(
  { sourceProvider: 1, sourceCompany: 1, sourceListingId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceProvider: { $in: ['greenhouse', 'lever'] } },
    name: 'unique_official_source_job',
  },
)

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema)

export default Job
