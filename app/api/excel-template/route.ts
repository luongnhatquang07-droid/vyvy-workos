import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [{ data: projects }, { data: employees }] = await Promise.all([
    supabase.from('projects').select('name').order('name'),
    supabase.from('employees').select('full_name').eq('status', 'active').order('full_name'),
  ])

  const projNames = (projects || []).map((p) => p.name as string)
  const empNames = (employees || []).map((e) => e.full_name as string)
  const capDoList = ['Đầu việc lớn', 'Đầu việc con', 'Bước']
  const nhomViecList = ['Marketing', 'Content', 'Ads', 'Livestream', 'Sale', 'CSKH', 'Finance', 'HR', 'KPI/OKR', 'Sản phẩm', 'Hệ thống', 'Vận hành', 'Khác']

  const wb = new ExcelJS.Workbook()
  wb.creator = 'VyVy WorkOS'

  // ── Sheet 1: Hướng dẫn ──────────────────────────────────────────────────────
  const guideSheet = wb.addWorksheet('Hướng dẫn', { properties: { tabColor: { argb: 'FF4A5E2A' } } })
  guideSheet.columns = [{ width: 28 }, { width: 65 }]

  const G = (label: string, value: string, bold = false) => {
    const row = guideSheet.addRow([label, value])
    row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF2D331A' } }
    row.getCell(2).font = { size: 11, bold, color: { argb: bold ? 'FF4A5E2A' : 'FF5c564a' } }
    row.height = 20
  }

  const titleRow = guideSheet.addRow(['HƯỚNG DẪN NHẬP ĐẦU VIỆC & BƯỚC — VYVY WORKOS', ''])
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF2D331A' } }
  titleRow.height = 28
  guideSheet.addRow([])

  G('CẤU TRÚC 4 CẤP', '')
  G('Cấp 1', 'Dự án (Project) — đã có sẵn trong hệ thống')
  G('Cấp 2', 'Đầu việc lớn — mốc lớn, milestone trong dự án')
  G('Cấp 3', 'Đầu việc con — công việc cụ thể thuộc đầu việc lớn')
  G('Cấp 4', 'Bước — bước thực hiện nhỏ trong đầu việc con (có duyệt deadline + kết quả)')
  guideSheet.addRow([])

  G('QUY TẮC NHẬP LIỆU', '', true)
  G('Thứ tự nhập', 'Nhập theo thứ tự CẤP ĐỘ từ lớn đến nhỏ trong cùng Nhóm việc và Dự án')
  G('Ghép cha-con tự động', 'Hệ thống ghép Đầu việc con vào Đầu việc lớn cùng Nhóm việc + Dự án')
  G('Ghép Bước vào việc con', 'Bước được ghép vào Đầu việc con gần nhất cùng Nhóm việc + Dự án')
  G('Thứ tự Bước', 'Tự động tăng theo thứ tự xuất hiện trong file')
  guideSheet.addRow([])

  G('CÁC CỘT', '', true)
  G('Dự án *', 'Bắt buộc. Chọn từ dropdown. Nếu chưa có sẽ tạo mới tự động.')
  G('Nhóm việc', 'Chọn từ dropdown. Dùng để ghép cha-con tự động.')
  G('Cấp độ *', 'Bắt buộc. Chọn: Đầu việc lớn / Đầu việc con / Bước')
  G('Tên *', 'Bắt buộc. Tên hiển thị trong hệ thống.')
  G('Mô tả / Yêu cầu', 'Mô tả chi tiết công việc hoặc yêu cầu của bước.')
  G('Output / Kết quả', 'Kết quả mong muốn khi hoàn thành.')
  G('Người phụ trách', 'Chọn tên nhân viên. Cho tất cả các cấp.')
  G('Người duyệt', 'Chỉ dùng cho Bước. Người sẽ duyệt deadline + kết quả của bước.')
  G('Deadline', 'Định dạng YYYY-MM-DD. Ví dụ: 2026-07-15')
  G('Ghi chú', 'Thông tin bổ sung, không bắt buộc.')
  guideSheet.addRow([])

  G('VÍ DỤ CẤU TRÚC', '', true)
  G('Dự án: Marketing | Nhóm: KOL | Cấp độ: Đầu việc lớn', '→ Tạo mốc lớn "Hệ thống KOL"')
  G('Dự án: Marketing | Nhóm: KOL | Cấp độ: Đầu việc con', '→ Tạo việc con dưới mốc KOL')
  G('Dự án: Marketing | Nhóm: KOL | Cấp độ: Bước', '→ Tạo bước trong việc con KOL vừa nhập')

  // ── Sheet 2: Nhập dữ liệu ───────────────────────────────────────────────────
  const dataSheet = wb.addWorksheet('Nhập dữ liệu', { properties: { tabColor: { argb: 'FFdadf21' } } })

  const headers = [
    { header: 'Dự án *', key: 'project', width: 26 },
    { header: 'Nhóm việc', key: 'group', width: 16 },
    { header: 'Cấp độ *', key: 'level', width: 16 },
    { header: 'Tên *', key: 'title', width: 34 },
    { header: 'Mô tả / Yêu cầu', key: 'desc', width: 38 },
    { header: 'Output / Kết quả mong muốn', key: 'output', width: 34 },
    { header: 'Người phụ trách', key: 'owner', width: 20 },
    { header: 'Người duyệt (Bước)', key: 'approver', width: 20 },
    { header: 'Deadline (YYYY-MM-DD)', key: 'deadline', width: 22 },
    { header: 'Ghi chú', key: 'notes', width: 28 },
  ]
  dataSheet.columns = headers

  const headerRow = dataSheet.getRow(1)
  headerRow.height = 30
  headers.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.font = { bold: true, size: 11, color: { argb: 'FFF1EDE4' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D331A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFdadf21' } } }
  })

  // Apply date format to col I (deadline) for all data rows
  // Col I = index 9 (1-based)
  for (let r = 3; r <= 502; r++) {
    const cell = dataSheet.getCell(`I${r}`)
    cell.numFmt = 'yyyy-mm-dd'
  }

  // Example rows — deadline as actual Date objects so Excel renders them as dates
  type ExRow = (string | Date | null)[]
  const examples: ExRow[] = [
    ['Marketing Growth System', 'KOL/Affiliate', 'Đầu việc lớn', 'Thiết kế hệ thống KOL & Affiliate',
      'Xây cách vận hành KOL/Affiliate tạo branding và mở phễu', 'Framework KOL hoàn chỉnh',
      empNames[0] || 'Đào Hoàng Vũ', null, new Date('2026-07-30'), 'Ưu tiên cao'],
    ['Marketing Growth System', 'KOL/Affiliate', 'Đầu việc con', 'Tuyển nhân sự chuyên trách KOL',
      'Tìm người quản lý KOL, Affiliate, micro-app', 'JD + quyết định phân công',
      empNames[0] || 'Đào Hoàng Vũ', null, new Date('2026-07-10'), null],
    ['Marketing Growth System', 'KOL/Affiliate', 'Bước', 'Viết JD tuyển dụng KOL',
      'Soạn JD rõ tiêu chí năng lực, kinh nghiệm, KPI', 'File JD hoàn chỉnh',
      empNames[1] || 'Nhung', empNames[0] || 'Đào Hoàng Vũ', new Date('2026-07-05'), null],
    ['Marketing Growth System', 'KOL/Affiliate', 'Bước', 'Đăng tuyển & sàng lọc CV',
      'Đăng lên các kênh tuyển dụng, lọc CV đạt yêu cầu', 'Danh sách CV shortlist',
      empNames[1] || 'Nhung', empNames[0] || 'Đào Hoàng Vũ', new Date('2026-07-12'), null],
  ]

  examples.forEach((ex, ri) => {
    const row = dataSheet.addRow(ex)
    row.height = 22
    const levelCell = row.getCell(3)
    const levelVal = String(ex[2])
    const bgColor = levelVal === 'Đầu việc lớn' ? 'FFE8F0DC' : levelVal === 'Đầu việc con' ? 'FFF5F8EE' : 'FFFFF8E6'
    row.eachCell((cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? bgColor : 'FFFFFFFF' } }
      cell.font = { size: 10, italic: true, color: { argb: 'FF8C7E6A' } }
      cell.alignment = { vertical: 'middle' }
      // Keep date format on col I
      if (colNum === 9) cell.numFmt = 'yyyy-mm-dd'
    })
    levelCell.font = { size: 10, italic: true, bold: true, color: { argb: levelVal === 'Bước' ? 'FF8C6A00' : 'FF4A5E2A' } }
  })

  dataSheet.views = [{ state: 'frozen', ySplit: 1 }]

  // ── Sheet 3: Danh mục (hidden) ───────────────────────────────────────────────
  const refSheet = wb.addWorksheet('Danh mục')
  refSheet.state = 'hidden'

  refSheet.getCell('A1').value = 'DỰ ÁN'
  projNames.forEach((n, i) => { refSheet.getCell(`A${i + 2}`).value = n })

  refSheet.getCell('B1').value = 'NHÂN VIÊN'
  empNames.forEach((n, i) => { refSheet.getCell(`B${i + 2}`).value = n })

  refSheet.getCell('C1').value = 'CẤP ĐỘ'
  capDoList.forEach((n, i) => { refSheet.getCell(`C${i + 2}`).value = n })

  refSheet.getCell('D1').value = 'NHÓM VIỆC'
  nhomViecList.forEach((n, i) => { refSheet.getCell(`D${i + 2}`).value = n })

  // Named ranges
  wb.definedNames.add(`'Danh mục'!$A$2:$A$${projNames.length + 1}`, 'DanhSachDuAn')
  wb.definedNames.add(`'Danh mục'!$B$2:$B$${empNames.length + 1}`, 'DanhSachNhanVien')
  wb.definedNames.add(`'Danh mục'!$C$2:$C$${capDoList.length + 1}`, 'DanhSachCapDo')
  wb.definedNames.add(`'Danh mục'!$D$2:$D$${nhomViecList.length + 1}`, 'DanhSachNhomViec')

  // Dropdowns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = (dataSheet as any).dataValidations
  const dvWarn = { type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Giá trị không hợp lệ', error: 'Vui lòng chọn từ danh sách' }
  const dvStop = { ...dvWarn, errorStyle: 'stop' }

  dv.add('A3:A502', { ...dvWarn, formulae: ['DanhSachDuAn'], showInputMessage: true, promptTitle: 'Dự án', prompt: 'Chọn dự án. Nếu chưa có sẽ tạo mới tự động.' })
  dv.add('B3:B502', { ...dvWarn, formulae: ['DanhSachNhomViec'], showInputMessage: true, promptTitle: 'Nhóm việc', prompt: 'Nhóm việc giúp hệ thống ghép cha-con tự động.' })
  dv.add('C3:C502', { ...dvStop, formulae: ['DanhSachCapDo'], showInputMessage: true, promptTitle: 'Cấp độ', prompt: 'Đầu việc lớn → Đầu việc con → Bước (nhỏ nhất)' })
  dv.add('G3:G502', { ...dvWarn, formulae: ['DanhSachNhanVien'], showInputMessage: true, promptTitle: 'Người phụ trách', prompt: 'Chọn tên nhân viên phụ trách.' })
  dv.add('H3:H502', { ...dvWarn, formulae: ['DanhSachNhanVien'], showInputMessage: true, promptTitle: 'Người duyệt', prompt: 'Chỉ dùng cho Bước. Người duyệt deadline và kết quả.' })

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau_nhap_dau_viec_vyvy.xlsx"',
    },
  })
}
