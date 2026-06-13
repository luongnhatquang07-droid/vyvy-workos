-- Cho phép một đầu việc có NHIỀU Head (multi-select).
-- Thêm cột mảng head_ids; giữ head_id cũ (= head đầu tiên) để tương thích hiển thị.
alter table tasks add column if not exists head_ids uuid[] default '{}';

-- Backfill: việc đã có head_id đơn -> đưa vào mảng
update tasks
set head_ids = array[head_id]
where head_id is not null
  and (head_ids is null or head_ids = '{}');
