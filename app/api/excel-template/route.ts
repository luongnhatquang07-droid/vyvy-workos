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
  const capDoList = ['Đầu việc lớn', 'Đầu việc con']
  const nhomViecList = ['Marketing', 'Content', 'Ads', 'Livestream', 'Sale', 'CSKH', 'Finance', 'HR', 'KPI/OKR', 'Sản phẩm', 'Hệ thống', 'Vận hành', 'Khác']
  const trangThaiList = ['Chưa bắt đầu', 'Đang thực hiện', 'Đã hoàn thành']

  const wb = new ExcelJS.Workbook()
  wb.creator = 'VyVy WorkOS'

  // ── Sheet 1: Hướng dẫn ──────────────────────────────────────────────────────
  const guideSheet = wb.addWorksheet('Hướng dẫn', { properties: { tabColor: { argb: 'FF4A5E2A' } } })
  guideSheet.columns = [{ width: 30 }, { width: 60 }]

  const addGuideRow = (label: string, value: string, bold = false) => {
    const row = guideSheet.addRow([label, value])
    row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF2D331A' } }
    row.getCell(2).font = { size: 11, bold, color: { argb: bold ? 'FF4A5E2A' : 'FF5c564a' } }
    row.height = 20
    return row
  }

  guideSheet.addRow(['HƯỚNG DẪN NHẬP ĐẦU VIỆC', '']).getCell(1).font = { bold: true, size: 14, color: { argb: 'FF2D331A' } }
  guideSheet.addRow([])
  addGuideRow('Sheet nhập liệu:', '→ Nhập dữ liệu', true)
  addGuideRow('Lưu ý:', 'Chỉ nhập dữ liệu vào sheet "Nhập dữ liệu". Không xóa hoặc sửa sheet khác.')
  guideSheet.addRow([])
  addGuideRow('CỘT BẮT BUỘC (*)', '')
  addGuideRow('Dự án *', 'Chọn từ danh sách. Nếu dự án chưa có sẽ được tạo mới tự động.')
  addGuideRow('Tên đầu việc *', 'Tên rõ ràng, ngắn gọn, không để trống.')
  addGuideRow('Cấp độ *', '"Đầu việc lớn" = mốc milestone. "Đầu việc con" = task thực hiện cụ thể.')
  guideSheet.addRow([])
  addGuideRow('CỘT KHUYẾN NGHỊ', '')
  addGuideRow('Nhóm việc', 'Chọn từ danh sách để phân loại đầu việc theo mảng.')
  addGuideRow('Owner', 'Chọn tên nhân viên từ danh sách. Phải khớp chính xác với tên trong hệ thống.')
  addGuideRow('Deadline', 'Định dạng: YYYY-MM-DD (ví dụ: 2026-07-15).')
  guideSheet.addRow([])
  addGuideRow('Thứ tự nhập:', 'Nhập "Đầu việc lớn" TRƯỚC, sau đó nhập "Đầu việc con" cùng nhóm việc để hệ thống tự ghép cha-con.')

  // ── Sheet 2: Nhập dữ liệu ───────────────────────────────────────────────────
  const dataSheet = wb.addWorksheet('Nhập dữ liệu', { properties: { tabColor: { argb: 'FFdadf21' } } })

  const headers = [
    { header: 'Dự án *', key: 'project', width: 28 },
    { header: 'Nhóm việc', key: 'group', width: 18 },
    { header: 'Cấp độ *', key: 'level', width: 18 },
    { header: 'Tên đầu việc *', key: 'title', width: 36 },
    { header: 'Mô tả / Yêu cầu', key: 'desc', width: 40 },
    { header: 'Output / Kết quả mong muốn', key: 'output', width: 36 },
    { header: 'Owner', key: 'owner', width: 22 },
    { header: 'Deadline (YYYY-MM-DD)', key: 'deadline', width: 22 },
    { header: 'Ghi chú', key: 'notes', width: 30 },
  ]
  dataSheet.columns = headers

  // Header row style
  const headerRow = dataSheet.getRow(1)
  headerRow.height = 28
  headers.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.font = { bold: true, size: 11, color: { argb: 'FFF1EDE4' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D331A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFdadf21' } } }
  })

  // Example rows
  const examples = [
    ['Marketing Growth System', 'Marketing', 'Đầu việc lớn', 'Thiết kế hệ thống KOL & Affiliate', 'Xây cách vận hành KOL để tạo branding và mở phễu', 'Framework KOL hoàn chỉnh + quy trình đo hiệu quả', empNames[0] || '', '2026-07-15', 'Ưu tiên cao'],
    ['Marketing Growth System', 'Marketing', 'Đầu việc con', 'Tuyển nhân sự KOL', 'Tìm người chuyên trách KOL/Affiliate', 'JD + quyết định phân công', empNames[0] || '', '2026-07-01', ''],
  ]
  examples.forEach((ex, ri) => {
    const row = dataSheet.addRow(ex)
    row.height = 22
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFAF7F2' : 'FFF1EDE4' } }
      cell.font = { size: 10, italic: true, color: { argb: 'FF8C7E6A' } }
      cell.alignment = { vertical: 'middle', wrapText: false }
    })
  })

  // Freeze header row
  dataSheet.views = [{ state: 'frozen', ySplit: 1 }]

  // Data rows: rows 3–202 (200 rows for input)
  for (let r = 3; r <= 202; r++) {
    const row = dataSheet.getRow(r)
    row.height = 22
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r % 2 === 0 ? 'FFFAF7F2' : 'FFFFFFFF' } }
    })
  }

  // ── Sheet 3: Danh mục (hidden) ───────────────────────────────────────────────
  const refSheet = wb.addWorksheet('Danh mục')
  refSheet.state = 'hidden'

  // Col A: Dự án
  refSheet.getCell('A1').value = 'DỰ ÁN'
  projNames.forEach((n, i) => { refSheet.getCell(`A${i + 2}`).value = n })

  // Col B: Owner
  refSheet.getCell('B1').value = 'OWNER'
  empNames.forEach((n, i) => { refSheet.getCell(`B${i + 2}`).value = n })

  // Col C: Cấp độ
  refSheet.getCell('C1').value = 'CẤP ĐỘ'
  capDoList.forEach((n, i) => { refSheet.getCell(`C${i + 2}`).value = n })

  // Col D: Nhóm việc
  refSheet.getCell('D1').value = 'NHÓM VIỆC'
  nhomViecList.forEach((n, i) => { refSheet.getCell(`D${i + 2}`).value = n })

  // Col E: Trạng thái (optional)
  refSheet.getCell('E1').value = 'TRẠNG THÁI'
  trangThaiList.forEach((n, i) => { refSheet.getCell(`E${i + 2}`).value = n })

  // ── Add named ranges for dropdowns ──────────────────────────────────────────
  wb.definedNames.add(`'Danh mục'!$A$2:$A$${projNames.length + 1}`, 'DanhSachDuAn')
  wb.definedNames.add(`'Danh mục'!$B$2:$B$${empNames.length + 1}`, 'DanhSachOwner')
  wb.definedNames.add(`'Danh mục'!$C$2:$C$${capDoList.length + 1}`, 'DanhSachCapDo')
  wb.definedNames.add(`'Danh mục'!$D$2:$D$${nhomViecList.length + 1}`, 'DanhSachNhomViec')

  // ── Data validation dropdowns (rows 3–202) ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = (dataSheet as any).dataValidations
  const dvBase = { type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Giá trị không hợp lệ', error: 'Vui lòng chọn từ danh sách' }

  dv.add('A3:A202', { ...dvBase, formulae: ['DanhSachDuAn'], showInputMessage: true, promptTitle: 'Dự án', prompt: 'Chọn dự án. Nếu chưa có sẽ tự tạo mới.' })
  dv.add('B3:B202', { ...dvBase, formulae: ['DanhSachNhomViec'], showInputMessage: true, promptTitle: 'Nhóm việc', prompt: 'Chọn nhóm việc phù hợp.' })
  dv.add('C3:C202', { ...dvBase, formulae: ['DanhSachCapDo'], errorStyle: 'stop', showInputMessage: true, promptTitle: 'Cấp độ', prompt: 'Đầu việc lớn = mốc chính. Đầu việc con = việc cụ thể.' })
  dv.add('G3:G202', { ...dvBase, formulae: ['DanhSachOwner'], showInputMessage: true, promptTitle: 'Owner', prompt: 'Chọn tên nhân viên phụ trách.' })

  // ── Serialize and return ─────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau_nhap_dau_viec.xlsx"',
    },
  })
}
