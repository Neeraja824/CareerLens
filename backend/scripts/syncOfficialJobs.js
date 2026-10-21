import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import Job from '../models/job.model.js'
import { parseJobSourceConfig, syncJobSources } from '../services/jobSyncService.js'

export async function runOfficialJobSync({
  apply = false,
  env = process.env,
  output = console,
  connect = connectDatabase,
  disconnect = () => mongoose.disconnect(),
  JobModel = Job,
  fetchImpl = fetch,
} = {}) {
  if (apply && env.JOB_SYNC_ENABLED !== 'true') {
    output.error('Writes are disabled. Set JOB_SYNC_ENABLED=true after reviewing source configuration.')
    return false
  }

  let sources
  try {
    sources = parseJobSourceConfig(env.JOB_SOURCE_CONFIG_JSON)
  } catch (error) {
    output.error(error.message)
    return false
  }
  if (sources.length === 0) {
    output.error('No official job sources are configured in JOB_SOURCE_CONFIG_JSON.')
    return false
  }

  let connected = false
  try {
    connected = await connect()
    if (!connected) return false

    if (apply) {
      await JobModel.collection.createIndex(
        { sourceProvider: 1, sourceCompany: 1, sourceListingId: 1 },
        {
          unique: true,
          partialFilterExpression: { sourceProvider: { $in: ['greenhouse', 'lever'] } },
          name: 'unique_official_source_job',
        },
      )
    }

    const results = await syncJobSources(sources, { JobModel, fetchImpl, apply })
    output.log(apply
      ? 'Official job source sync complete.'
      : 'DRY RUN - official feeds checked; no job records were written.')
    for (const result of results) {
      output.log([
        `${result.provider}/${result.sourceCompany}`,
        `found=${result.found}`,
        `new=${result.new}`,
        `refreshed=${result.refreshed}`,
        `confirmedRemoved=${result.confirmedRemoved}`,
      ].join(' | '))
    }
    return true
  } catch (error) {
    output.error(apply
      ? `Official job source sync failed during apply; some records may already have been written. Review source records before retrying. Error: ${error.message}`
      : `Official job source sync failed before any writes. Error: ${error.message}`)
    return false
  } finally {
    if (connected || mongoose.connection.readyState !== 0) {
      await disconnect()
    }
  }
}

async function main() {
  await import('dotenv/config')
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && !['--dry-run', '--apply'].includes(args[0]))) {
    console.error('Usage: npm run sync:official-jobs -- [--dry-run|--apply]')
    process.exitCode = 1
    return
  }

  const apply = args[0] === '--apply'
  const success = await runOfficialJobSync({ apply })
  if (!success) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
