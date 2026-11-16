import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const source = await readFile(new URL('../lib/importRecovery.ts', import.meta.url), 'utf8')
const ts = createRequire(import.meta.url)('typescript')
const { importRecoveryKey, parseImportJobs, rememberImportJob } = await import(
  `data:text/javascript,${encodeURIComponent(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText)}`
)

test('recent imports cannot share a storage key across users or workspaces', () => {
  const keys = [importRecoveryKey(1, 23), importRecoveryKey(12, 3), importRecoveryKey(1, 24), importRecoveryKey(2, 23)]
  assert.equal(new Set(keys).size, keys.length)
})

test('invalid or corrupted recovery storage never produces a job request', () => {
  for (const saved of [null, '', '{broken', '{}', 'null', '"string"']) {
    assert.deepEqual(parseImportJobs(saved), [])
  }
  const saved = JSON.stringify([null, {}, { uploadId: -1, eventId: 2 }, { uploadId: '1', eventId: 2 }, { uploadId: 1.5, eventId: 2 }, { uploadId: 1, eventId: 0 }, { uploadId: 7, eventId: 2 }])
  assert.deepEqual(parseImportJobs(saved), [{ uploadId: 7, eventId: 2 }])
})

test('reopening an import preserves other events and keeps bounded recent history', () => {
  let jobs = []
  for (let uploadId = 1; uploadId <= 12; uploadId++) jobs = rememberImportJob(jobs, { uploadId, eventId: uploadId % 2 + 1 })
  assert.equal(jobs.length, 10)
  assert.equal(jobs[0].uploadId, 12)
  jobs = rememberImportJob(jobs, { uploadId: 5, eventId: 2 })
  assert.equal(jobs.length, 10)
  assert.equal(jobs[0].uploadId, 5)
  assert.equal(jobs.filter((job) => job.uploadId === 5).length, 1)
  assert.ok(jobs.some((job) => job.eventId === 1))
  assert.ok(jobs.some((job) => job.eventId === 2))
  assert.deepEqual(parseImportJobs(JSON.stringify(jobs)), jobs)
})
