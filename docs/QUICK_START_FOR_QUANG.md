# VyVy WorkOS - Hướng Dẫn Nhanh Cho Quang

Tài liệu này dùng cho MVP vận hành nội bộ VyVy WorkOS. Trước khi dùng dữ liệu thật, hãy kiểm tra đúng workspace và storage.

## 1. Tạo người

1. Vào **Nhân sự & Tải việc** hoặc **Cài đặt / Phân quyền**.
2. Tạo người mới với tên, phòng ban, chức vụ, email/tài khoản nếu có.
3. Gắn đúng vai trò: Admin, CEO, COO, trưởng bộ phận, nhân sự thực hiện.
4. Kiểm tra người đó hiện trong các dropdown giao việc, duyệt, nộp file.

## 2. Tạo dự án

1. Vào **Dự án**.
2. Bấm **Tạo dự án**.
3. Nhập tên dự án, chủ dự án, ngày bắt đầu, deadline.
4. Lưu lại rồi mở dự án để tạo các đầu việc lớn.

## 3. Tạo đầu việc lớn

1. Trong dự án, tạo **đầu việc lớn / workstream**.
2. Gắn người phụ trách, deadline và mô tả rõ kết quả cần đạt.
3. Đầu việc lớn nên đại diện cho một mảng công việc lớn, ví dụ: CRM, Ads, Nội dung, Sản phẩm.

## 4. Tạo đầu việc con

1. Trong đầu việc lớn, bấm tạo **đầu việc con**.
2. Nhập mô tả, owner, deadline, trạng thái ban đầu là **Chưa bắt đầu**.
3. Chọn mẫu bước nếu công việc cần quy trình sẵn.
4. Kiểm tra phần **Quy trình thực hiện đầu việc con** có step, owner, deadline và yêu cầu file nếu cần.

## 5. Nộp file / báo cáo

1. Vào **Dự án** hoặc **Tài liệu & Bàn giao**.
2. Tạo deliverable nếu task/step chưa có mục cần nộp.
3. Chọn người phải nộp, người kiểm tra, deadline và định dạng cần nộp.
4. Nộp bằng file PDF, Word, Excel, ảnh, ZIP hoặc dán link Drive/Figma/Notion/Sheet.
5. Mỗi lần nộp lại sẽ tạo version mới; không ghi đè version cũ.
6. Chỉ xóa version khi version đó chưa được duyệt.

## 6. Gửi nhắc việc

1. Mở chi tiết deliverable.
2. Bấm **Gửi nhắc nộp file**.
3. Nội dung nhắc sẽ được copy để gửi qua Messenger/Zalo/nội bộ.
4. Sau khi gửi thật, quay lại app và chọn **Đã gửi**.
5. Nếu chưa gửi, chọn **Chưa gửi** để app không tính sai số lần nhắc.

## 7. Xem việc cần xử lý hôm nay

1. Vào **Trung tâm điều hành**.
2. Xem các mục ưu tiên: việc quá hạn, việc cần duyệt, file chưa nộp, việc cần nhắc.
3. Vào **Lịch** để xem deadline task, step, deliverable, approval và follow-up.
4. Vào **Theo dõi & Nhắc việc** để xem danh sách cần dí file/báo cáo.

## 8. Báo CEO

1. Vào **Báo cáo CEO**.
2. Tạo hoặc mở yêu cầu cần CEO quyết.
3. Ghi rõ vấn đề, lựa chọn, đề xuất và deadline cần quyết.
4. Khi CEO đã có quyết định, cập nhật trạng thái để Command Center không báo trễ.

## 9. Backup / export dữ liệu

Nếu đang dùng Supabase:

1. Dữ liệu chính nằm trong database Supabase.
2. File nằm trong Supabase Storage bucket `project-files` hoặc bucket đã cấu hình.
3. Nên backup database và Storage định kỳ trong Supabase Dashboard.

Nếu sau này dùng local/IndexedDB:

1. Vào màn hình có nút export JSON.
2. Export metadata deliverable, version, link và ghi chú.
3. File blob cục bộ có thể không nằm trong JSON, nên cần export file riêng nếu app có cảnh báo.

## 10. Không nên làm

1. Không đánh dấu hoàn thành khi step/file/approval còn thiếu.
2. Không xóa version đã duyệt.
3. Không upload file công ty vào môi trường test nếu chưa chắc đang dùng đúng workspace.
4. Không chia sẻ `.env`, service key, anon key, token Supabase.
5. Không sửa trực tiếp database production nếu chưa backup.
6. Không dùng dữ liệu mẫu/dev làm dữ liệu vận hành thật.
