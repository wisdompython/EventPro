type CheckInTransaction<T> = {
  request: () => Promise<T>
  isCurrent: () => boolean
  onPending: () => void
  onConfirmed: (guest: T) => void
  onConflict: () => void
  onFailure: () => void
}

/** An admission confirmation must come from the server and belong to this scan. */
export async function recordCheckIn<T>({ request, isCurrent, onPending, onConfirmed, onConflict, onFailure }: CheckInTransaction<T>) {
  onPending()
  let guest: T
  try {
    guest = await request()
  } catch (error) {
    if (!isCurrent()) return
    if (error instanceof Error && error.message.includes('409')) onConflict()
    else onFailure()
    return
  }
  if (isCurrent()) onConfirmed(guest)
}
