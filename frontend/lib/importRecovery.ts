export interface ImportJobReference {
  uploadId: number
  eventId: number
}

export function importRecoveryKey(userId: number, organizationId: number) {
  return `event-pro:recent-imports:v1:${userId}:${organizationId}`
}

export function parseImportJobs(value: string | null): ImportJobReference[] {
  try {
    const jobs: unknown = JSON.parse(value || '[]')
    if (!Array.isArray(jobs)) return []
    return jobs.filter((job): job is ImportJobReference =>
      !!job && Number.isSafeInteger(job.uploadId) && job.uploadId > 0
      && Number.isSafeInteger(job.eventId) && job.eventId > 0,
    ).slice(0, 10)
  } catch { return [] }
}

export function rememberImportJob(jobs: ImportJobReference[], job: ImportJobReference) {
  return [job, ...jobs.filter((previous) => previous.uploadId !== job.uploadId)].slice(0, 10)
}
