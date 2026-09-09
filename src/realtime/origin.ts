/** Autorise la meme origine et les serveurs de developpement locaux. */
export function isAllowedOrigin(
  origin: string | undefined,
  host?: string,
): boolean {
  if (!origin) return true

  try {
    const url = new URL(origin)
    const sameOrigin = host !== undefined && url.host === host
    const localDevelopment =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1'

    return sameOrigin || localDevelopment
  } catch {
    return false
  }
}
