import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'meeting-files'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase server env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function ensureBucket(supabase: ReturnType<typeof serviceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = (buckets || []).some((b) => b.id === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: true })
  }
}

export async function POST(request: Request) {
  const supabase = serviceClient()

  // Auth: require valid session
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ ok: false, error: 'invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const taskId = formData.get('taskId') as string | null

  if (!file || !taskId) {
    return Response.json({ ok: false, error: 'missing file or taskId' }, { status: 400 })
  }

  await ensureBucket(supabase)

  const safeName = file.name.replace(/\s+/g, '-')
  const filePath = `${taskId}/${Date.now()}-${safeName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    return Response.json({ ok: false, error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

  return Response.json({ ok: true, publicUrl: urlData.publicUrl, filePath })
}
