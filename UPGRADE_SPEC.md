# VyVy WorkOS — Bảng Yêu Cầu Nâng Cấp Giao Diện & Trải Nghiệm
Phiên bản: 1.0 · Ngày: 13/06/2026

Mục đích: Tài liệu này mô tả toàn bộ yêu cầu nâng cấp UI/UX cho VyVy WorkOS. Giữ nguyên toàn bộ database, API và logic nghiệp vụ hiện có — chỉ nâng cấp lớp giao diện, trải nghiệm và bổ sung tự động hóa.

## 3. Design System — "VyVy Dark Premium"

### 3.1 CSS Variables
```css
:root {
  --bg-base:      #0E0E0C;
  --bg-surface:   #16160F;
  --bg-card:      #1C1C14;
  --bg-card-hover:#23231A;
  --bg-input:     #14140E;
  --border:       #2C2C20;
  --border-strong:#3A3A2C;
  --text-primary:   #F5F2E8;
  --text-secondary: #B5B0A0;
  --text-muted:     #7A7668;
  --accent:       #DADF21;
  --accent-hover: #C4C91E;
  --accent-soft:  rgba(218,223,33,0.12);
  --on-accent:    #16160F;
  --success: #4ADE80;  --success-soft: rgba(74,222,128,0.14);
  --warning: #FBBF24;  --warning-soft: rgba(251,191,36,0.14);
  --danger:  #F87171;  --danger-soft:  rgba(248,113,113,0.14);
  --info:    #60A5FA;  --info-soft:    rgba(96,165,250,0.14);
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
}
```

## 9. Bảng Yêu Cầu

| Mã | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---|---|
| REQ-01 | Design system dark (CSS variables) | P0 | ⬜ |
| REQ-02 | Thư viện components/ui/ | P0 | ⬜ |
| REQ-03 | Tách page.tsx thành các module | P0 | ⬜ |
| REQ-04 | Skeleton/empty/error states | P0 | ⬜ |
| REQ-05 | Phân quyền hiển thị theo role | P0 | ⬜ |
| REQ-06 | Login: loading, lỗi rõ, ghi nhớ | P1 | ⬜ |
| REQ-07 | Dashboard cá nhân hóa + biểu đồ | P1 | ⬜ |
| REQ-08 | COO Board: chip chờ duyệt + toast | P1 | ⬜ |
| REQ-09 | Tasks: bộ lọc chip + drawer | P1 | ⬜ |
| REQ-10 | Meeting wizard + preview sửa được | P1 | ⬜ |
| REQ-11 | Responsive đầy đủ | P1 | ⬜ |
| REQ-12 | Bộ icon thống nhất (lucide) | P2 | ⬜ |
| REQ-13 | Projects: lọc/sắp xếp + empty state | P2 | ⬜ |
| REQ-14 | Automation: thẻ trạng thái + timeline | P2 | ⬜ |
| REQ-15 | Recurring: calendar view | P2 | ⬜ |
| REQ-16 | Nhân sự: drawer form + validate | P2 | ⬜ |
| REQ-17 | Onboarding tour + tooltip | P2 | ⬜ |
| REQ-18 | Nhắc thông minh + tự nhắc duyệt | P3 | ⬜ |
| REQ-19 | Cảnh báo dự án at-risk tự động | P3 | ⬜ |
| REQ-20 | Assistant: gợi ý + trích nguồn | P3 | ⬜ |
| REQ-21 | Chạy SQL recurring/notifications/RLS | P0 | ⬜ |
