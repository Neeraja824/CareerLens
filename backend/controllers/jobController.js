import Job from '../models/job.model.js'
import Resume from '../models/resume.model.js'
import { buildActiveJobFilter } from '../utils/jobFilters.js'
import { calculateResumeSkillMatch } from '../utils/resumeSkillMatch.js'

const allowedQueryParameters = new Set([
  'keyword',
  'location',
  'skills',
  'experienceLevel',
  'employmentType',
  'page',
  'limit',
])

const MAX_PAGE = 1_000_000
const MAX_PAGE_SIZE = 100
const MAX_SKILLS = 20

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readTextParameter(query, name, maxLength) {
  const value = query[name]
  if (value === undefined) return { value: undefined }
  if (typeof value !== 'string') return { error: `${name} must be a single text value.` }

  const normalizedValue = value.trim()
  if (!normalizedValue) return { error: `${name} must not be empty.` }
  if (normalizedValue.length > maxLength) {
    return { error: `${name} must be ${maxLength} characters or fewer.` }
  }

  return { value: normalizedValue }
}

function readIntegerParameter(query, name, defaultValue, maximum) {
  const value = query[name]
  if (value === undefined) return { value: defaultValue }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return { error: `${name} must be a positive integer.` }
  }

  const parsedValue = Number(value)
  if (!Number.isSafeInteger(parsedValue) || parsedValue > maximum) {
    return { error: `${name} must not exceed ${maximum}.` }
  }

  return { value: parsedValue }
}

export function validateJobListQuery(query) {
  const unknownParameter = Object.keys(query).find((key) => !allowedQueryParameters.has(key))
  if (unknownParameter) {
    return { error: `Unsupported query parameter: ${unknownParameter}.` }
  }

  const keyword = readTextParameter(query, 'keyword', 200)
  const location = readTextParameter(query, 'location', 160)
  const experienceLevel = readTextParameter(query, 'experienceLevel', 80)
  const employmentType = readTextParameter(query, 'employmentType', 80)
  const page = readIntegerParameter(query, 'page', 1, MAX_PAGE)
  const limit = readIntegerParameter(query, 'limit', 20, MAX_PAGE_SIZE)
  const rawSkills = query.skills

  for (const result of [keyword, location, experienceLevel, employmentType, page, limit]) {
    if (result.error) return { error: result.error }
  }

  let skills
  if (rawSkills !== undefined) {
    if (typeof rawSkills !== 'string') {
      return { error: 'skills must be a single comma-separated text value.' }
    }

    skills = rawSkills.split(',').map((skill) => skill.trim())
    if (
      skills.length > MAX_SKILLS
      || skills.some((skill) => !skill || skill.length > 80)
    ) {
      return { error: `skills must contain between 1 and ${MAX_SKILLS} values, each no longer than 80 characters.` }
    }
  }

  return {
    value: {
      keyword: keyword.value,
      location: location.value,
      experienceLevel: experienceLevel.value,
      employmentType: employmentType.value,
      skills,
      page: page.value,
      limit: limit.value,
    },
  }
}

function buildJobListFilter(filters) {
  const filter = buildActiveJobFilter()

  if (filters.keyword) {
    const keyword = new RegExp(escapeRegularExpression(filters.keyword), 'i')
    filter.$and = [{
      $or: [
        { title: keyword },
        { companyName: keyword },
        { description: keyword },
        { requiredSkills: keyword },
      ],
    }]
  }

  if (filters.location) {
    filter.location = { $regex: escapeRegularExpression(filters.location), $options: 'i' }
  }
  if (filters.experienceLevel) {
    filter.experienceLevel = { $regex: `^${escapeRegularExpression(filters.experienceLevel)}$`, $options: 'i' }
  }
  if (filters.employmentType) {
    filter.employmentType = { $regex: `^${escapeRegularExpression(filters.employmentType)}$`, $options: 'i' }
  }
  if (filters.skills?.length) {
    filter.requiredSkills = {
      $in: filters.skills.map((skill) => new RegExp(`^${escapeRegularExpression(skill)}$`, 'i')),
    }
  }

  return filter
}

export async function getJobs(request, response) {
  const { value: filters, error } = validateJobListQuery(request.query)
  if (error) {
    return response.status(400).json({ success: false, message: error })
  }

  try {
    const filter = buildJobListFilter(filters)
    const skip = (filters.page - 1) * filters.limit
    const [jobs, totalJobs] = await Promise.all([
      Job.find(filter)
        .sort({ postingDate: -1, _id: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      Job.countDocuments(filter),
    ])

    return response.status(200).json({
      success: true,
      jobs,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        totalJobs,
        totalPages: Math.ceil(totalJobs / filters.limit),
      },
    })
  } catch (error) {
    console.error('Get jobs error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to load job listings.',
    })
  }
}

export async function getJobById(request, response) {
  if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
    return response.status(400).json({
      success: false,
      message: 'Invalid job ID.',
    })
  }

  try {
    const job = await Job.findOne({
      _id: request.params.id,
      ...buildActiveJobFilter(),
    }).lean()

    if (!job) {
      return response.status(404).json({
        success: false,
        message: 'Job listing not found.',
      })
    }

    return response.status(200).json({
      success: true,
      job,
    })
  } catch (error) {
    console.error('Get job error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to load job listing.',
    })
  }
}

export async function getJobMatch(request, response) {
  if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
    return response.status(400).json({
      success: false,
      message: 'Invalid job ID.',
    })
  }

  try {
    const job = await Job.findOne({
      _id: request.params.id,
      ...buildActiveJobFilter(),
    })
      .select('title requiredSkills')
      .lean()

    if (!job) {
      return response.status(404).json({
        success: false,
        message: 'Job listing not found.',
      })
    }

    const resume = await Resume.findOne({
      userId: request.student.id,
      isCurrent: true,
    })
      .select('isCurrent status skills')
      .lean()

    return response.status(200).json({
      success: true,
      job: {
        id: job._id.toString(),
        title: job.title,
      },
      resumeSkillMatch: calculateResumeSkillMatch(resume, job.requiredSkills),
    })
  } catch (error) {
    console.error('Get resume skill match error:', error)
    return response.status(500).json({
      success: false,
      message: 'Unable to calculate resume skill match.',
    })
  }
}
