function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return []

  const normalizedSkills = new Map()
  for (const skill of skills) {
    if (typeof skill !== 'string') continue

    const label = skill.trim()
    const normalized = label.toLowerCase()
    if (normalized && !normalizedSkills.has(normalized)) {
      normalizedSkills.set(normalized, label)
    }
  }

  return normalizedSkills
}

export function calculateResumeSkillMatch(resume, requiredSkills) {
  if (!resume || !resume.isCurrent || resume.status !== 'analysis-ready') {
    return {
      status: 'unavailable',
      matchPercentage: null,
      matchedSkills: [],
      missingSkills: [],
      message: 'No analysis-ready current resume is available for matching.',
    }
  }

  const normalizedRequiredSkills = normalizeSkills(requiredSkills)
  if (normalizedRequiredSkills.size === 0) {
    return {
      status: 'not_comparable',
      matchPercentage: null,
      matchedSkills: [],
      missingSkills: [],
      message: 'This job has no required skills to compare against.',
    }
  }

  const normalizedResumeSkills = normalizeSkills(resume.skills)
  const matchedSkills = []
  const missingSkills = []

  for (const [normalizedSkill, label] of normalizedRequiredSkills) {
    if (normalizedResumeSkills.has(normalizedSkill)) {
      matchedSkills.push(label)
    } else {
      missingSkills.push(label)
    }
  }

  return {
    status: 'available',
    matchPercentage: Math.round((matchedSkills.length / normalizedRequiredSkills.size) * 100),
    matchedSkills,
    missingSkills,
    message: 'Resume skill match calculated from the analyzed resume skills.',
  }
}
