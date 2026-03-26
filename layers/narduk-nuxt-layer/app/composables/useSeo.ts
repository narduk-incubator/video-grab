/**
 * useSeo — One-call composable for complete per-page SEO.
 *
 * Wraps `useSeoMeta()`, `useHead()`, and `defineOgImage()` into a single
 * ergonomic API. Every page should call this in its `<script setup>` block.
 *
 * @example
 * ```ts
 * // Minimal — just title + description
 * useSeo({
 *   title: 'About Us',
 *   description: 'Learn more about our team and mission.',
 * })
 *
 * // Full — with OG image, article metadata, canonical override
 * useSeo({
 *   title: 'How to Deploy Nuxt 4',
 *   description: 'Step-by-step guide to deploying Nuxt 4 on Cloudflare Workers.',
 *   image: '/images/deploy-guide.png',
 *   type: 'article',
 *   publishedAt: '2026-02-20',
 *   modifiedAt: '2026-02-25',
 *   author: 'Jane Doe',
 *   canonicalUrl: 'https://example.com/blog/deploy-nuxt-4',
 *   ogImage: {
 *     title: 'How to Deploy Nuxt 4',
 *     description: 'Step-by-step guide',
 *     icon: 'i-lucide-rocket',
 *   },
 * })
 * ```
 */

interface SeoOptions {
  /** Page title (used in <title>, og:title, twitter:title) */
  title: string
  /** Page description (used in <meta name="description">, og:description, twitter:description) */
  description: string
  /** Static image URL for og:image / twitter:image. Overridden by `ogImage` if set. */
  image?: string
  /** Open Graph type — defaults to 'website'. Use 'article' for blog posts. */
  type?: 'website' | 'article' | 'profile'
  /** ISO 8601 date string — for articles */
  publishedAt?: string
  /** ISO 8601 date string — for articles */
  modifiedAt?: string
  /** Author name — for articles */
  author?: string
  /** Override canonical URL (defaults to current page URL via @nuxtjs/seo) */
  canonicalUrl?: string
  /** Keywords for meta keywords tag */
  keywords?: string[]
  /** Dynamic OG image options — renders via OG image templates at the edge */
  ogImage?: {
    title?: string
    description?: string
    icon?: string
    /** OG image component name suffix — defaults to 'Default', auto-selects 'Article' for article type */
    component?: string
    /** Category badge text — used by the Article template */
    category?: string
  }
  /** Additional robots directives — e.g., 'noindex', 'nofollow' */
  robots?: string
}

export function useSeo(options: SeoOptions) {
  const {
    title,
    description,
    image,
    type = 'website',
    publishedAt,
    modifiedAt,
    author,
    canonicalUrl,
    keywords,
    ogImage,
    robots,
  } = options

  // --- Core meta tags (no intermediate Record<string, any>) ---
  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    // ogType accepts 'website' | 'article' | 'profile' etc.
    ogType: type,
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    // Static image fallback
    ...(image && { ogImage: image, twitterImage: image }),
    // Article-specific
    ...(type === 'article' && publishedAt && { articlePublishedTime: publishedAt }),
    ...(type === 'article' && modifiedAt && { articleModifiedTime: modifiedAt }),
    ...(type === 'article' && author && { articleAuthor: [author] }),
    // Keywords
    ...(keywords?.length && { keywords: keywords.join(', ') }),
    // Robots
    ...(robots && { robots }),
  })

  // --- Head extras ---
  if (canonicalUrl) {
    useHead({
      link: [{ rel: 'canonical', href: canonicalUrl }],
    })
  }

  // Dynamic OG: nuxt-og-image only applies on SSR; the client stub warns in dev if called.
  if (ogImage && import.meta.server) {
    const componentName = ogImage.component || (type === 'article' ? 'Article' : 'Default')
    // OgImage component names are registered at the consuming-app level;
    // the layer can't enumerate them at type-check time.
    defineOgImage(componentName as never, {
      title: ogImage.title || title,
      description: ogImage.description || description,
      icon: ogImage.icon || '✨',
      ...(ogImage.category && { category: ogImage.category }),
    })
  }
}
