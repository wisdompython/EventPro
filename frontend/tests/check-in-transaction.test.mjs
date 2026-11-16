import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../lib/checkInTransaction.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, Error })
const { recordCheckIn } = exports

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function observer(pending, isCurrent = () => true) {
  const events = []
  const result = recordCheckIn({
    request: () => pending.promise,
    isCurrent,
    onPending: () => events.push('pending'),
    onConfirmed: (guest) => events.push(['confirmed', guest]),
    onConflict: () => events.push('duplicate'),
    onFailure: () => events.push('failed'),
  })
  return { events, result }
}

test('check-in stays pending until the server confirms and uses the returned guest', async () => {
  const pending = deferred()
  const { events, result } = observer(pending)
  assert.deepEqual(events, ['pending'])
  const serverGuest = { id: 'guest-1', status: 'checked_in', plus_one_checked_in: true }
  pending.resolve(serverGuest)
  await result
  assert.deepEqual(events, ['pending', ['confirmed', serverGuest]])
})

test('failed requests never announce access granted', async () => {
  const pending = deferred()
  const { events, result } = observer(pending)
  pending.reject(new Error('Network error'))
  await result
  assert.deepEqual(events, ['pending', 'failed'])
})

test('a conflicting check-in reports duplicate instead of new admission', async () => {
  const pending = deferred()
  const { events, result } = observer(pending)
  pending.reject(new Error('HTTP 409: already checked in'))
  await result
  assert.deepEqual(events, ['pending', 'duplicate'])
})

test('a response from an abandoned scan cannot replace the current screen', async () => {
  const pending = deferred()
  let current = true
  const { events, result } = observer(pending, () => current)
  current = false
  pending.resolve({ id: 'previous-guest', status: 'checked_in' })
  await result
  assert.deepEqual(events, ['pending'])
})

test('a failure from an abandoned scan cannot show an error for the next guest', async () => {
  const pending = deferred()
  const { events, result } = observer(pending, () => false)
  pending.reject(new Error('HTTP 409'))
  await result
  assert.deepEqual(events, ['pending'])
})
