import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockEvent {
  context?: Record<string, unknown>
}

interface MockRuntimeConfig {
  public: {
    appVersion: string
    buildVersion: string
    buildTime: string
    controlPlaneUrl: string
    posthogHost: string
    cspScriptSrc: string
    cspConnectSrc: string
    cspFrameSrc: string
    cspWorkerSrc: string
  }
}

let mockConfig: MockRuntimeConfig
let capturedHeaders: Record<string, string> | undefined

vi.stubGlobal('defineEventHandler', (fn: (event: MockEvent) => void) => fn)
vi.stubGlobal('useRuntimeConfig', () => mockConfig)
vi.stubGlobal('setResponseHeaders', (_event: MockEvent, headers: Record<string, string>) => {
  capturedHeaders = headers
})

const { default: handler } = await import('../../server/middleware/securityHeaders')

function getDirective(csp: string, name: string): string {
  return csp.split('; ').find((part) => part.startsWith(`${name} `)) || ''
}

function renderCsp(): string {
  capturedHeaders = undefined
  handler({} as never)
  return capturedHeaders?.['Content-Security-Policy'] || ''
}

beforeEach(() => {
  mockConfig = {
    public: {
      appVersion: '',
      buildVersion: '',
      buildTime: '',
      controlPlaneUrl: '',
      posthogHost: 'https://us.i.posthog.com',
      cspScriptSrc: '',
      cspConnectSrc: '',
      cspFrameSrc: '',
      cspWorkerSrc: '',
    },
  }
  capturedHeaders = undefined
})

describe('securityHeaders middleware', () => {
  it('does not include external Iconify hosts in the baseline CSP', () => {
    const csp = renderCsp()
    const connectSrc = getDirective(csp, 'connect-src')

    expect(connectSrc).not.toContain('https://api.iconify.design')
    expect(connectSrc).not.toContain('https://api.simplesvg.com')
    expect(connectSrc).not.toContain('https://api.unisvg.com')
  })

  it('merges custom CSP sources without duplicating existing entries', () => {
    mockConfig.public.posthogHost = 'https://eu.i.posthog.com'
    mockConfig.public.cspScriptSrc = 'https://cdn.example.com, https://cdn.example.com'
    mockConfig.public.cspConnectSrc =
      'https://api.example.com, wss://stream.example.com, wss://stream.example.com'

    const csp = renderCsp()
    const scriptSrc = getDirective(csp, 'script-src')
    const connectSrc = getDirective(csp, 'connect-src')

    expect(scriptSrc).toContain('https://eu.i.posthog.com')
    expect(scriptSrc.match(/https:\/\/cdn\.example\.com/g)).toHaveLength(1)

    expect(connectSrc).toContain('https://eu.i.posthog.com')
    expect(connectSrc).toContain('wss://stream.example.com')
    expect(connectSrc.match(/https:\/\/api\.example\.com/g)).toHaveLength(1)
    expect(connectSrc.match(/wss:\/\/stream\.example\.com/g)).toHaveLength(1)
  })

  it('adds baseline hardening directives', () => {
    const csp = renderCsp()

    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("object-src 'none'")
  })

  it('includes blob: in worker-src for bundled workers', () => {
    const csp = renderCsp()
    const workerSrc = getDirective(csp, 'worker-src')

    expect(workerSrc).toContain("'self'")
    expect(workerSrc).toContain('blob:')
  })

  it('supports frame-src and worker-src overrides', () => {
    mockConfig.public.cspFrameSrc = 'https://embed.example.com, https://embed.example.com'
    mockConfig.public.cspWorkerSrc = 'https://workers.cdn.example.com'

    const csp = renderCsp()
    const frameSrc = getDirective(csp, 'frame-src')
    const workerSrc = getDirective(csp, 'worker-src')

    expect(frameSrc).toContain("'self'")
    expect(frameSrc.match(/https:\/\/embed\.example\.com/g)).toHaveLength(1)

    expect(workerSrc).toContain("'self'")
    expect(workerSrc).toContain('blob:')
    expect(workerSrc).toContain('https://workers.cdn.example.com')
  })
})
