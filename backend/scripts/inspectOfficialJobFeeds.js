import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  inspectOfficialJobSources,
  parseJobSourceConfig,
} from '../services/jobSyncService.js'

export async function runFeedInspection({
  configJson,
  fetchImpl = fetch,
  output = console,
} = {}) {
  if (typeof configJson !== 'string' || !configJson.trim()) {
    output.error('Provide explicit source configuration with --config-file.')
    return false
  }

  try {
    const sources = parseJobSourceConfig(configJson.replace(/^\uFEFF/, ''))
    if (sources.length === 0) {
      throw new Error('Configuration must include at least one source.')
    }
    const results = await inspectOfficialJobSources(sources, { fetchImpl })
    output.log(JSON.stringify(results, null, 2))
    output.log('Feed inspection only: no environment files, database, or local records were accessed.')
    return true
  } catch (error) {
    output.error(`Public feed inspection failed: ${error.message}`)
    return false
  }
}

export function parseInspectionArguments(args) {
  if (
    args.length !== 2
    || args[0] !== '--config-file'
    || typeof args[1] !== 'string'
    || !args[1].trim()
  ) {
    throw new Error(
      'Usage: npm run inspect:official-job-feeds -- --config-file "<path to JSON source config>"',
    )
  }

  const configFile = args[1]
  const fileName = configFile.split(/[\\/]/).pop().toLowerCase()
  if (fileName.startsWith('.env') || !fileName.endsWith('.json')) {
    throw new Error('The inspector accepts an explicit .json config file, not an environment file.')
  }

  return { configFile }
}

export async function readInspectionConfigFile(configFile, read = readFile) {
  const content = await read(configFile, 'utf8')
  return content.replace(/^\uFEFF/, '')
}

async function main(args) {
  let configFile
  try {
    ({ configFile } = parseInspectionArguments(args))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  let configJson
  try {
    configJson = await readInspectionConfigFile(configFile)
  } catch (error) {
    console.error(`Unable to read explicit source configuration: ${error.message}`)
    process.exitCode = 1
    return
  }

  const success = await runFeedInspection({ configJson })
  if (!success) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2))
}
