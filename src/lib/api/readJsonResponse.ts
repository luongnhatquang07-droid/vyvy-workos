export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const text = await response.text()

  if (!contentType.includes('application/json')) {
    const snippet = text.trim().slice(0, 140)
    const looksLikeHtml = snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html') || snippet.includes('<body')
    throw new Error(
      looksLikeHtml
        ? `${fallbackMessage} API returned HTML instead of JSON. Please sign in again and retry.`
        : `${fallbackMessage} API returned a non-JSON response.`,
    )
  }

  try {
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    throw new Error(`${fallbackMessage} API returned invalid JSON.`)
  }
}
