import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

// One-time migration route — xóa sau khi chạy xong
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  if (secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbHost = process.env.DB_MIGRATION_HOST
  const dbPassword = process.env.DB_MIGRATION_PASSWORD
  if (!dbHost || !dbPassword) {
    return NextResponse.json({ error: 'Missing DB_MIGRATION_HOST or DB_MIGRATION_PASSWORD' }, { status: 500 })
  }

  const client = new Client({
    host: dbHost,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
  } catch (e: unknown) {
    return NextResponse.json({ error: 'connect failed: ' + (e as Error).message }, { status: 500 })
  }

  const migrations = [
    `alter table task_steps add column if not exists step_deadline_status text not null default 'draft'`,
    `alter table task_steps add column if not exists step_proposed_deadline date`,
    `alter table task_steps add column if not exists step_deadline_approver_id uuid references employees(id)`,
    `alter table task_steps add column if not exists step_deadline_note text`,
    `create index if not exists task_steps_deadline_status_idx on task_steps(step_deadline_status)`,
  ]

  const results: { sql: string; ok: boolean; error?: string }[] = []
  for (const sql of migrations) {
    try {
      await client.query(sql)
      results.push({ sql: sql.slice(0, 80), ok: true })
    } catch (e: unknown) {
      results.push({ sql: sql.slice(0, 80), ok: false, error: (e as Error).message })
    }
  }

  await client.end()
  return NextResponse.json({ results })
}
