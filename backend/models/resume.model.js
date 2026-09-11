import mongoose from 'mongoose'

const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    storedFileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    storagePath: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      default: 'uploaded',
      enum: ['uploaded', 'replaced', 'pending-analysis'],
    },
    isCurrent: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

resumeSchema.index({ userId: 1, isCurrent: 1 })

const Resume = mongoose.models.Resume || mongoose.model('Resume', resumeSchema)

export default Resume
