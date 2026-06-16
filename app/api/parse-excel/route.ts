import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(ab, { type: 'array' })

    // Skip guide/catalog sheets
    const dataSheetName =
      wb.SheetNames.find((n) => !['Hướng dẫn', 'Danh mục'].includes(n)) ||
      wb.SheetNames[0]
    const ws = wb.Sheets[dataSheetName]
    const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // Find header row
    const startRow = data.findIndex(
      (r) =>
        String(r[0]).toLowerCase().includes('dự án') ||
        String(r[3]).toLowerCase().includes('tên')
    )
    if (startRow === -1) {
      return NextResponse.json({ error: 'Không tìm thấy hàng tiêu đề trong file' }, { status: 422 })
    }

    const dataRows = data.slice(startRow + 1).filter((r) => r[3]?.toString().trim())

    const rows = dataRows.map((r, i) => {
      // Columns: proj, group, level, title, desc, output, owner, approver, deadline, notes
      const cols = r.map((c) => String(c ?? '').trim())

      // Deadline: Excel may give serial number, Date object string, or yyyy-mm-dd
      let deadline = cols[8] || ''
      if (deadline) {
        // Excel serial number (e.g. "46174") → convert to date
        const serial = Number(deadline)
        if (!isNaN(serial) && serial > 40000 && serial < 60000) {
          // Excel epoch: Jan 1 1900, but with leap-year bug offset = 25569 days from Unix epoch
          const d = new Date((serial - 25569) * 86400 * 1000)
          deadline = d.toISOString().split('T')[0]
        } else {
          // Try parse any date string (e.g. "7/30/2026", "2026-07-30", "30/07/2026")
          const parsed = new Date(deadline)
          if (!isNaN(parsed.getTime())) deadline = parsed.toISOString().split('T')[0]
        }
      }

      return {
        rowNum: startRow + i + 2,
        project:     cols[0] || '',
        group:       cols[1] || '',
        level:       cols[2] || '',
        title:       cols[3] || '',
        description: cols[4] || '',
        output:      cols[5] || '',
        owner:       cols[6] || '',
        approver:    cols[7] || '',
        deadline,
        notes:       cols[9] || '',
      }
    })

    return NextResponse.json({ rows, sheetName: dataSheetName })
  } catch (err) {
    console.error('parse-excel error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
