export interface OgPreviewItem {
  label: string
  path: string
  ogUrl: string
}

export interface OgPreviewCategory {
  title?: string
  category?: string
  items: OgPreviewItem[]
}

export interface OgPreviewPayload {
  sections: OgPreviewCategory[]
}

export type OgPreviewData = OgPreviewCategory[] | OgPreviewPayload

export function normalizeOgPreviewSections(
  data: OgPreviewData | null | undefined,
): OgPreviewCategory[] {
  if (data == null) return []
  if (Array.isArray(data)) return data
  return data.sections ?? []
}
