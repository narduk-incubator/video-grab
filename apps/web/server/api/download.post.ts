import { definePublicMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { z } from 'zod'

const X_TWITTER_HOSTS = ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com']

function isXOrTwitterUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return X_TWITTER_HOSTS.includes(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

function extractTweetId(url: string): string | null {
  const match = url.match(/(?:status|statuses)\/(\d+)/i)
  return match ? match[1]! : null
}

/** Token required by X syndication API (reverse-engineered by Vercel react-tweet). */
function getSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replaceAll(/(0+|\.)/g, '')
}

const SYNDICATION_FEATURES = [
  'tfw_timeline_list:',
  'tfw_follower_count_sunset:true',
  'tfw_tweet_edit_backend:on',
  'tfw_refsrc_session:on',
  'tfw_fosnr_soft_interventions_enabled:on',
  'tfw_show_birdwatch_pivots_enabled:on',
  'tfw_show_business_verified_badge:on',
  'tfw_duplicate_scribes_to_settings:on',
  'tfw_use_profile_image_shape_enabled:on',
  'tfw_show_blue_verified_badge:on',
  'tfw_legacy_timeline_sunset:true',
  'tfw_show_gov_verified_badge:on',
  'tfw_show_business_affiliate_badge:on',
  'tfw_tweet_edit_frontend:on',
].join(';')

/** Response from cdn.syndication.twimg.com/tweet-result */
interface SyndicationMediaVariant {
  type?: string
  content_type?: string
  src?: string
  bitrate?: number
}

interface SyndicationMedia {
  type?: string
  media_url_https?: string
  video_info?: {
    variants?: SyndicationMediaVariant[]
  }
}

interface SyndicationTweet {
  id_str?: string
  text?: string
  mediaDetails?: SyndicationMedia[]
  photos?: Array<{ url?: string }>
  video?: { url?: string; variants?: SyndicationMediaVariant[] }
}

const bodySchema = z.object({
  url: z.string().min(1, 'URL is required').transform((s) => s.trim()),
})

const rateLimit = { namespace: 'download', maxRequests: 10, windowMs: 60_000 }

export default definePublicMutation(
  {
    rateLimit,
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ body: { url } }) => {
    if (!isXOrTwitterUrl(url)) {
      throw createError({
        statusCode: 400,
        message: 'Only X (Twitter) links are supported. Please paste an x.com or twitter.com video link.',
      })
    }

    const tweetId = extractTweetId(url)
    if (!tweetId) {
      throw createError({
        statusCode: 400,
        message: 'Invalid X/Twitter link. Use a tweet URL like https://x.com/username/status/1234567890',
      })
    }

    const syndicationUrl = new URL('https://cdn.syndication.twimg.com/tweet-result')
    syndicationUrl.searchParams.set('id', tweetId)
    syndicationUrl.searchParams.set('lang', 'en')
    syndicationUrl.searchParams.set('features', SYNDICATION_FEATURES)
    syndicationUrl.searchParams.set('token', getSyndicationToken(tweetId))

    let res: Response
    try {
      res = await fetch(syndicationUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw createError({
        statusCode: 502,
        message: `Could not reach X: ${message}`,
      })
    }

    const isJson = res.headers.get('content-type')?.includes('application/json')
    const raw = isJson ? await res.json() : undefined

    if (!res.ok) {
      const errMsg = raw && typeof raw === 'object' && 'error' in raw && typeof (raw as { error: unknown }).error === 'string'
        ? (raw as { error: string }).error
        : 'Could not fetch tweet. The tweet may be private, deleted, or unavailable.'
      throw createError({
        statusCode: 502,
        message: errMsg,
      })
    }

    if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
      throw createError({
        statusCode: 502,
        message: 'X returned no data for this tweet. It may be private, deleted, or temporarily unavailable.',
      })
    }

    const rawObj = raw as Record<string, unknown>
    if (rawObj.__typename === 'TweetTombstone') {
      throw createError({
        statusCode: 403,
        message: 'This tweet is unavailable (private or removed by the account owner).',
      })
    }

    const data = raw as SyndicationTweet

    const { bestUrl, variants } = extractVideoVariants(data)
    if (!bestUrl) {
      throw createError({
        statusCode: 422,
        message: 'No video found in this tweet. It may be an image, text-only, or the video is not available.',
      })
    }

    return { success: true, videoUrl: bestUrl, tweetId, variants }
  },
)

function isMp4Variant(v: SyndicationMediaVariant): boolean {
  return (
    v.type === 'video/mp4' ||
    v.content_type === 'video/mp4' ||
    (v.src?.includes('.mp4') ?? false)
  )
}

function bestMp4FromVariants(variants: SyndicationMediaVariant[]): string | null {
  const mp4s = variants.filter(isMp4Variant)
  if (!mp4s.length) {
    const fallback = variants.find((v) => v.src)
    return fallback?.src ?? null
  }
  const withBitrate = mp4s.filter((v) => v.bitrate != null && v.bitrate > 0)
  const best = withBitrate.length
    ? withBitrate.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
    : mp4s.at(-1)
  return best?.src ?? null
}

function variantLabel(bitrate: number | undefined): string {
  if (bitrate == null || bitrate <= 0) return 'Default'
  if (bitrate >= 2_500_000) return '1080p'
  if (bitrate >= 1_500_000) return '720p'
  if (bitrate >= 800_000) return '480p'
  if (bitrate >= 400_000) return '360p'
  return 'Default'
}

function collectVariants(data: SyndicationTweet): SyndicationMediaVariant[] {
  const out: SyndicationMediaVariant[] = []
  if (data.video?.variants?.length) out.push(...data.video.variants)
  const details = data.mediaDetails
  if (details?.length) {
    for (const m of details) {
      if (m.video_info?.variants?.length) out.push(...m.video_info.variants)
    }
  }
  return out
}

interface VideoVariantResult {
  url: string
  bitrate?: number
  label: string
}

function extractVideoVariants(data: SyndicationTweet): { bestUrl: string | null; variants: VideoVariantResult[] } {
  if (data.video?.url) {
    return {
      bestUrl: data.video.url,
      variants: [{ url: data.video.url, label: 'Default' }],
    }
  }
  const raw = collectVariants(data)
  const mp4s = raw.filter((v) => v.src && isMp4Variant(v))
  const withSrc = mp4s.length ? mp4s : raw.filter((v) => v.src)
  if (!withSrc.length) return { bestUrl: null, variants: [] }
  const sorted = [...withSrc].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
  const bestUrl = bestMp4FromVariants(withSrc)
  const variants: VideoVariantResult[] = sorted.map((v) => ({
    url: v.src!,
    bitrate: v.bitrate,
    label: variantLabel(v.bitrate),
  }))
  return { bestUrl, variants }
}
