import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  parseInspectionArguments,
  readInspectionConfigFile,
} from '../scripts/inspectOfficialJobFeeds.js'

test('feed inspection CLI accepts an explicit JSON config file path with spaces', () => {
  assert.deepEqual(
    parseInspectionArguments(['--config-file', 'C:\\Temp\\source config.json']),
    { configFile: 'C:\\Temp\\source config.json' },
  )
})

test('feed inspection CLI rejects missing, malformed, and environment-file arguments', () => {
  for (const args of [
    [],
    ['--config-json', '[{}]'],
    ['--config-file'],
    ['--config-file', ''],
    ['--config-file', 'C:\\Temp\\.env'],
    ['--config-file', 'C:\\Temp\\.env.local'],
    ['--config-file', 'C:\\Temp\\.env.production.json'],
    ['--config-file', 'C:\\Temp\\settings.txt'],
  ]) {
    assert.throws(() => parseInspectionArguments(args))
  }
})

test('config file reader loads explicit JSON and strips a PowerShell UTF-8 BOM', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'careerlens-feed-inspection-'))
  const configPath = path.join(tempDirectory, 'source config.json')
  const configText = '[{"provider":"greenhouse","sourceCompany":"Netlify"}]'

  try {
    await writeFile(configPath, `\uFEFF${configText}`, 'utf8')
    const loaded = await readInspectionConfigFile(configPath)
    assert.equal(loaded, configText)
    assert.deepEqual(JSON.parse(loaded), [{
      provider: 'greenhouse',
      sourceCompany: 'Netlify',
    }])
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
})

