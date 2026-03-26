import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { google } from 'googleapis'

function env(key: string): string {
  return (process.env[key] || '').trim()
}

function loadCredentials(): Record<string, unknown> {
  const keyFilePath = env('GSC_SERVICE_ACCOUNT_JSON_PATH')
  if (keyFilePath) {
    const resolved = resolve(process.cwd(), keyFilePath)
    if (!existsSync(resolved)) {
      throw new Error(`Service account key file not found: ${resolved}`)
    }
    return JSON.parse(readFileSync(resolved, 'utf8')) as Record<string, unknown>
  }

  const inline = env('GSC_SERVICE_ACCOUNT_JSON')
  if (inline) {
    const raw = inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8')
    return JSON.parse(raw) as Record<string, unknown>
  }

  throw new Error(
    'Missing GSC credentials. Set GSC_SERVICE_ACCOUNT_JSON_PATH or GSC_SERVICE_ACCOUNT_JSON.',
  )
}

async function main() {
  const siteUrl = env('SITE_URL')
  if (!siteUrl) {
    throw new Error('SITE_URL is required.')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: [
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/siteverification',
    ],
  })

  const searchconsole = google.searchconsole({ version: 'v1', auth })
  const siteVerification = google.siteVerification({ version: 'v1', auth })

  console.log(`🔐 Verifying Google Search Console ownership for ${siteUrl}...`)
  await siteVerification.webResource.insert({
    verificationMethod: 'FILE',
    requestBody: {
      site: { identifier: siteUrl, type: 'SITE' },
    },
  })
  console.log('✅ Ownership verified.')

  const userEmail = env('GSC_USER_EMAIL')
  if (userEmail) {
    try {
      const resource = await siteVerification.webResource.get({ id: siteUrl }).catch(() => null)
      const owners = resource?.data.owners || []
      if (!owners.includes(userEmail)) {
        owners.push(userEmail)
      }

      await siteVerification.webResource.update({
        id: siteUrl,
        requestBody: {
          site: { identifier: siteUrl, type: 'SITE' },
          owners,
        },
      })
      console.log(`✅ Granted GSC owner access to ${userEmail}.`)
    } catch (error: any) {
      console.warn(`⚠️ Could not grant GSC owner access: ${error.message}`)
    }
  } else {
    console.log('⚠️ GSC_USER_EMAIL not set; skipping owner access grant.')
  }

  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`
  await searchconsole.sitemaps.submit({
    siteUrl,
    feedpath: sitemapUrl,
  })
  console.log(`✅ Sitemap submitted: ${sitemapUrl}`)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`❌ GSC verification failed: ${message}`)
  process.exit(1)
})
