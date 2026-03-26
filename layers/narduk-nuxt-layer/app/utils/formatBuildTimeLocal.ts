export function formatBuildTimeLocal(buildTime: string | null | undefined, fallback = ''): string {
  if (!buildTime) return fallback

  const date = new Date(buildTime)
  if (Number.isNaN(date.getTime())) return buildTime

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}
