import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  let tempFilePath = ''

  try {
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu file Excel để đọc.' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File Excel vượt quá giới hạn 10MB.' }, { status: 400 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['xlsx', 'xlsm', 'xltx', 'xltm'].includes(extension)) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ file Excel .xlsx/.xlsm.' }, { status: 400 })
    }

    const pythonPath = await findBundledPython()
    if (!pythonPath) {
      return NextResponse.json({ error: 'Không tìm thấy môi trường đọc Excel trên máy hiện tại.' }, { status: 500 })
    }

    tempFilePath = path.join(os.tmpdir(), `vyvy-import-${Date.now()}-${sanitizeName(file.name)}`)
    await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()))

    const script = `
import json, sys, datetime
import openpyxl

def to_text(value):
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.date):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
main = wb[wb.sheetnames[0]]

header_row = None
for row_idx in range(1, min(main.max_row, 20) + 1):
    values = [to_text(main.cell(row_idx, col).value) for col in range(1, 6)]
    if values[:3] == ["STT", "Nhóm", "Đầu việc"]:
        header_row = row_idx
        break

if header_row is None:
    raise RuntimeError("Không tìm thấy dòng tiêu đề đúng format công ty.")

headers = [to_text(main.cell(header_row, col).value) for col in range(1, 14)]
rows = []
title_seen = {}

for row_idx in range(header_row + 1, main.max_row + 1):
    raw = [main.cell(row_idx, col).value for col in range(1, 14)]
    values = [to_text(value) for value in raw]
    if not any(values):
        continue

    title = values[2]
    if not title:
        continue

    owner = values[3]
    collaborators = values[4]
    mentioned_deadline = values[5]
    entered_deadline = values[6]
    needs_deadline = values[7]
    status = values[8] or "Chưa bắt đầu"
    priority = values[9] or "Trung bình"

    warnings = []
    if not owner or owner.lower() == "chưa chốt":
        warnings.append("Thiếu người phụ trách")
    if "cần nhập" in needs_deadline.lower() and not entered_deadline:
        warnings.append("Thiếu deadline nhập")
    if mentioned_deadline and not entered_deadline:
        warnings.append("Có deadline trong họp nhưng chưa chốt ngày nhập")

    normalized = title.lower()
    duplicate = normalized in title_seen
    title_seen[normalized] = True
    if duplicate:
        warnings.append("Có thể trùng đầu việc")

    rows.append({
        "id": f"preview-{row_idx}",
        "stt": values[0],
        "group": values[1],
        "title": title,
        "owner": owner,
        "collaborators": collaborators,
        "mentionedDeadline": mentioned_deadline,
        "inputDeadline": entered_deadline,
        "needsDeadline": needs_deadline,
        "status": status,
        "priority": priority,
        "expectedResult": values[10],
        "note": values[11],
        "source": values[12],
        "warnings": warnings,
    })

catalog = { "owners": [], "statuses": [], "priorities": [] }
if len(wb.sheetnames) > 1:
    meta = wb[wb.sheetnames[1]]
    for row_idx in range(2, meta.max_row + 1):
        owner = to_text(meta.cell(row_idx, 1).value)
        status = to_text(meta.cell(row_idx, 2).value)
        priority = to_text(meta.cell(row_idx, 3).value)
        if owner:
            catalog["owners"].append(owner)
        if status:
            catalog["statuses"].append(status)
        if priority:
            catalog["priorities"].append(priority)

result = {
    "fileName": sys.argv[2],
    "sheetName": main.title,
    "headers": headers,
    "rows": rows,
    "summary": {
        "totalRows": len(rows),
        "missingOwners": sum(1 for item in rows if "Thiếu người phụ trách" in item["warnings"]),
        "missingDeadlines": sum(1 for item in rows if "Thiếu deadline nhập" in item["warnings"]),
        "duplicates": sum(1 for item in rows if "Có thể trùng đầu việc" in item["warnings"]),
    },
    "catalog": {
        "owners": sorted(set(catalog["owners"])),
        "statuses": sorted(set(catalog["statuses"])),
        "priorities": sorted(set(catalog["priorities"])),
    },
}
print(json.dumps(result, ensure_ascii=False))
`.trim()

    const { stdout, stderr } = await execFileAsync(
      pythonPath,
      ['-c', script, tempFilePath, file.name],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    )

    if (stderr?.trim()) {
      console.warn(stderr)
    }

    return NextResponse.json(JSON.parse(stdout))
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Không đọc được file Excel.',
      },
      { status: 500 },
    )
  } finally {
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => undefined)
    }
  }
}

async function findBundledPython() {
  const candidates = [
    process.env.CODEX_BUNDLED_PYTHON,
    'C:\\Users\\PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return ''
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}
