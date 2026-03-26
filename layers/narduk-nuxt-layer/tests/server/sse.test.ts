import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerSSE,
  removeSSE,
  broadcastSSE,
  getSSEConnectionCount,
  getSSETotalConnections,
} from '../../server/utils/sse'

/**
 * Unit tests for the SSE broadcast registry.
 *
 * Tests the connection lifecycle (register → broadcast → remove)
 * and edge cases like dead connections and channel isolation.
 */

function createMockWriter(shouldThrow = false) {
  return {
    write: shouldThrow
      ? vi.fn(() => {
          throw new Error('Connection closed')
        })
      : vi.fn(),
    close: vi.fn(),
  } as unknown as WritableStreamDefaultWriter
}

describe('SSE broadcast', () => {
  // Reset internal state between tests by removing all connections
  beforeEach(() => {
    // Brute-force cleanup: broadcast to channels that might exist
    // to trigger dead-connection removal — but simpler to just
    // verify behavior in isolated tests
  })

  it('registerSSE returns a connection handle', () => {
    const writer = createMockWriter()
    const conn = registerSSE('test-register', writer)
    expect(conn).toBeDefined()
    expect(conn.channelId).toBe('test-register')
    expect(conn.writer).toBe(writer)
    // Cleanup
    removeSSE('test-register', conn)
  })

  it('getSSEConnectionCount tracks registrations', () => {
    const w1 = createMockWriter()
    const w2 = createMockWriter()
    const c1 = registerSSE('count-test', w1)
    const c2 = registerSSE('count-test', w2)

    expect(getSSEConnectionCount('count-test')).toBe(2)

    removeSSE('count-test', c1)
    expect(getSSEConnectionCount('count-test')).toBe(1)

    removeSSE('count-test', c2)
    expect(getSSEConnectionCount('count-test')).toBe(0)
  })

  it('broadcastSSE sends to all connections on a channel', () => {
    const w1 = createMockWriter()
    const w2 = createMockWriter()
    const c1 = registerSSE('broadcast-test', w1)
    const c2 = registerSSE('broadcast-test', w2)

    broadcastSSE('broadcast-test', 'update', { foo: 'bar' })

    expect(w1.write).toHaveBeenCalledTimes(1)
    expect(w2.write).toHaveBeenCalledTimes(1)

    // Verify SSE format
    const callArg = (w1.write as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const decoded = new TextDecoder().decode(callArg)
    expect(decoded).toContain('event: update')
    expect(decoded).toContain('data: {"foo":"bar"}')

    removeSSE('broadcast-test', c1)
    removeSSE('broadcast-test', c2)
  })

  it('broadcastSSE removes dead connections', () => {
    const goodWriter = createMockWriter()
    const deadWriter = createMockWriter(true)
    const good = registerSSE('dead-test', goodWriter)
    registerSSE('dead-test', deadWriter)

    expect(getSSEConnectionCount('dead-test')).toBe(2)

    broadcastSSE('dead-test', 'ping', {})

    // Dead writer should have been removed
    expect(getSSEConnectionCount('dead-test')).toBe(1)
    expect(goodWriter.write).toHaveBeenCalledTimes(1)

    removeSSE('dead-test', good)
  })

  it('channels are isolated from each other', () => {
    const w1 = createMockWriter()
    const w2 = createMockWriter()
    const c1 = registerSSE('channel-a', w1)
    const c2 = registerSSE('channel-b', w2)

    broadcastSSE('channel-a', 'test', { x: 1 })

    expect(w1.write).toHaveBeenCalledTimes(1)
    expect(w2.write).not.toHaveBeenCalled()

    removeSSE('channel-a', c1)
    removeSSE('channel-b', c2)
  })

  it('removeSSE is safe to call on non-existent channels', () => {
    const writer = createMockWriter()
    const conn = { writer, channelId: 'nope' }
    // Should not throw
    expect(() => removeSSE('nope', conn)).not.toThrow()
  })

  it('broadcastSSE is a no-op on empty channels', () => {
    // Should not throw
    expect(() => broadcastSSE('empty', 'test', {})).not.toThrow()
  })

  it('getSSETotalConnections counts across channels', () => {
    const before = getSSETotalConnections()
    const w1 = createMockWriter()
    const w2 = createMockWriter()
    const c1 = registerSSE('total-a', w1)
    const c2 = registerSSE('total-b', w2)

    expect(getSSETotalConnections()).toBe(before + 2)

    removeSSE('total-a', c1)
    removeSSE('total-b', c2)
  })
})
