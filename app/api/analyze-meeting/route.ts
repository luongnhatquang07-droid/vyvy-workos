export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Phân tích biên bản họp Notex (tóm tắt + bản ghi) -> ý chính + đầu việc.
// Cần ANTHROPIC_API_KEY (server-side). Chưa có key -> trả lỗi rõ ràng.

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json(
      { ok: false, error: 'Chưa cấu hình ANTHROPIC_API_KEY trên server. Thêm vào .env.local và Vercel để bật phân tích AI.' },
      { status: 400 },
    )
  }

  let body: { summary?: string; transcript?: string; text?: string } = {}
  try { body = await request.json() } catch { /* ignore */ }
  const parts = [body.summary, body.transcript, body.text].filter(Boolean).join('\n\n')
  const text = parts.slice(0, 120000)
  if (!text.trim()) {
    return Response.json({ ok: false, error: 'Thiếu nội dung biên bản (tóm tắt / bản ghi).' }, { status: 400 })
  }

  const prompt = [
    'Bạn là trợ lý vận hành của VyVy. Đọc TÓM TẮT và BẢN GHI cuộc họp dưới đây, phân tích và trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích) theo schema:',
    '{',
    '  "project": {"name": string, "description": string},',
    '  "keyPoints": [string],',
    '  "tasks": [{"title": string, "owner": string|null, "deadline": string|null, "note": string|null}]',
    '}',
    'keyPoints = các ý chính cần lưu ý. tasks = đầu việc cần làm; owner = tên người phụ trách nếu nêu trong họp, nếu không có thì ĐỀ XUẤT người hợp lý (ghi rõ là đề xuất trong note); deadline dạng YYYY-MM-DD hoặc null.',
    '',
    'NỘI DUNG HỌP:',
    text,
  ].join('\n')

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return Response.json({ ok: false, error: 'Không gọi được Anthropic API.' }, { status: 502 })
  }

  if (!res.ok) {
    const t = await res.text()
    return Response.json({ ok: false, error: 'Anthropic lỗi: ' + t.slice(0, 300) }, { status: 502 })
  }

  const data = await res.json()
  const raw: string = data?.content?.[0]?.text ?? ''
  let parsed: unknown
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : raw)
  } catch {
    return Response.json({ ok: false, error: 'Model trả về không phải JSON hợp lệ.', raw: raw.slice(0, 500) }, { status: 502 })
  }
  return Response.json({ ok: true, result: parsed })
}
