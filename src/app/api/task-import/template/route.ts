import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import {
  BULK_IMPORT_HEADERS,
  BULK_IMPORT_TEMPLATE_FILENAME,
  DEADLINE_TYPE_OPTIONS,
  NEEDS_FILE_OPTIONS,
  PRIORITY_OPTIONS,
} from '@/lib/taskImport'

export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)

export async function GET() {
  let tempFilePath = ''

  try {
    const pythonPath = await findBundledPython()
    if (!pythonPath) {
      return NextResponse.json({ error: 'Không tìm thấy môi trường tạo Excel trên máy hiện tại.' }, { status: 500 })
    }

    tempFilePath = path.join(os.tmpdir(), `vyvy-import-template-${Date.now()}.xlsx`)
    const script = `
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

headers = json.loads(sys.argv[2])
deadline_types = json.loads(sys.argv[3])
priorities = json.loads(sys.argv[4])
needs_file = json.loads(sys.argv[5])
output_path = sys.argv[1]

wb = Workbook()
ws = wb.active
ws.title = "Import đầu việc"
meta = wb.create_sheet("Danh mục")

meta["A1"] = "Loại deadline"
meta["B1"] = "Ưu tiên"
meta["C1"] = "Có cần file/báo cáo"

for idx, value in enumerate(deadline_types, start=2):
    meta.cell(row=idx, column=1, value=value)
for idx, value in enumerate(priorities, start=2):
    meta.cell(row=idx, column=2, value=value)
for idx, value in enumerate(needs_file, start=2):
    meta.cell(row=idx, column=3, value=value)

for column in range(1, 4):
    meta.cell(row=1, column=column).font = Font(bold=True)
    meta.column_dimensions[get_column_letter(column)].width = 24

ws.append(list(headers))
header_fill = PatternFill("solid", fgColor="1B1F26")
header_font = Font(color="F3F4F1", bold=True)
thin = Side(style="thin", color="D9D4C7")
border = Border(left=thin, right=thin, top=thin, bottom=thin)

for col_idx, title in enumerate(headers, start=1):
    cell = ws.cell(row=1, column=col_idx)
    cell.fill = header_fill
    cell.font = header_font
    cell.border = border
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.column_dimensions[get_column_letter(col_idx)].width = max(18, min(34, len(title) + 8))

widths = {
    1: 28,
    2: 28,
    3: 42,
    4: 24,
    5: 28,
    6: 18,
    7: 22,
    8: 16,
    9: 22,
    10: 36,
    11: 42,
}
for col_idx, width in widths.items():
    ws.column_dimensions[get_column_letter(col_idx)].width = width

for row in range(2, 302):
    for col in range(1, len(headers) + 1):
        ws.cell(row=row, column=col).border = border
        ws.cell(row=row, column=col).alignment = Alignment(vertical="top", wrap_text=True)

deadline_validation = DataValidation(type="list", formula1="'Danh mục'!$A$2:$A$7", allow_blank=False)
priority_validation = DataValidation(type="list", formula1="'Danh mục'!$B$2:$B$5", allow_blank=True)
needs_file_validation = DataValidation(type="list", formula1="'Danh mục'!$C$2:$C$3", allow_blank=True)
ws.add_data_validation(deadline_validation)
ws.add_data_validation(priority_validation)
ws.add_data_validation(needs_file_validation)
deadline_validation.add("G2:G301")
priority_validation.add("H2:H301")
needs_file_validation.add("I2:I301")

ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}301"

ws["M1"] = "Ghi chú dùng mẫu"
ws["M2"] = "Mỗi dòng là một đầu việc con. Không cần tạo trước dự án/đầu việc lớn trong app; hệ thống sẽ tạo nếu chưa có."
ws["M3"] = "Deadline hỗ trợ: 2026-07-07, 7/7/2026, 7/7, 7/7 - 10/7, cả tháng 7, hàng tuần, hàng tháng."
ws["M4"] = "Người phối hợp có thể cách nhau bằng dấu phẩy hoặc dấu /."
for row in range(1, 5):
    ws.cell(row=row, column=13).alignment = Alignment(wrap_text=True, vertical="top")
ws.column_dimensions["M"].width = 58

wb.save(output_path)
`.trim()

    const { stderr } = await execFileAsync(
      pythonPath,
      [
        '-c',
        script,
        tempFilePath,
        JSON.stringify(BULK_IMPORT_HEADERS),
        JSON.stringify(DEADLINE_TYPE_OPTIONS),
        JSON.stringify(PRIORITY_OPTIONS),
        JSON.stringify(NEEDS_FILE_OPTIONS),
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    )

    if (stderr?.trim()) console.warn(stderr)

    const buffer = await fs.readFile(tempFilePath)
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${BULK_IMPORT_TEMPLATE_FILENAME}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không tạo được file mẫu Excel.' },
      { status: 500 },
    )
  } finally {
    if (tempFilePath) await fs.unlink(tempFilePath).catch(() => undefined)
  }
}

async function findBundledPython() {
  const candidates = [
    process.env.CODEX_BUNDLED_PYTHON,
    'C:\\Users\\PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
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
