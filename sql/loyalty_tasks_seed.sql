-- ============================================================
-- VyVy WorkOS — Seed tasks từ Loyalty Execution Items
-- Tạo 3 workstream (P0/P1/P2) + 28 subtasks cho project "Customer Funnel & Loyalty"
-- IDEMPOTENT: bỏ qua nếu workstream đã tồn tại (check by title+project_id)
-- ============================================================

DO $$
DECLARE
  v_project_id  uuid := 'f951cfc0-9c88-41a4-a9c8-aaca95c7cf56';

  -- Employees
  v_vy          uuid := 'c9fcd0ba-df16-429e-9f5f-04e54d5f0237'; -- CEO
  v_quang       uuid := 'f8a08acd-2476-44cf-b8b4-6e47a9384dfe'; -- Admin/Ops
  v_vu_dao      uuid := 'a46dcd67-ef16-4e30-a9ee-cc72b345ea7b'; -- Dept Head Marketing
  v_ma_hong     uuid := '3c7daadc-3d38-4e9b-a1bd-34bed7dc3517'; -- Dept Head R&D
  v_nhung       uuid := '47a66705-0a4d-46e2-8b81-47a2e2596907'; -- Content

  -- Departments
  v_dept_ceo    uuid := '192acd09-f117-404e-bf0b-667ff95b5448'; -- Ban điều hành
  v_dept_ops    uuid := '58af0f92-8241-4cd9-bd2a-0a503b525f6a'; -- Vận hành
  v_dept_mkt    uuid := 'fc3feff5-9de2-4852-be0d-f918bfac8247'; -- Marketing
  v_dept_rnd    uuid := '74127cec-b7f4-4d04-9ae8-6664862222fd'; -- R&D
  v_dept_cskh   uuid := 'b6213ba5-7a1a-4322-953f-16bf0f2e5f20'; -- CSKH
  v_dept_cnt    uuid := '1b5c6bf5-48dc-4cd3-9b3b-7de00021e0ba'; -- Content

  -- Workstream parent IDs (pre-gen so subtasks can reference)
  v_ws_p0       uuid;
  v_ws_p1       uuid;
  v_ws_p2       uuid;
BEGIN
  -- ── Skip nếu đã seed ──
  IF EXISTS (SELECT 1 FROM tasks WHERE project_id = v_project_id AND task_level = 'workstream') THEN
    RAISE NOTICE 'Tasks đã seed rồi, bỏ qua.';
    RETURN;
  END IF;

  v_ws_p0 := gen_random_uuid();
  v_ws_p1 := gen_random_uuid();
  v_ws_p2 := gen_random_uuid();

  -- ── 3 Workstream Parents ──
  INSERT INTO tasks (id, project_id, title, description, task_level, status, priority,
                     assignee_id, head_id, department_id, created_by,
                     start_date, due_date, created_at, updated_at)
  VALUES
  (v_ws_p0, v_project_id,
   '[P0] Foundation — Zalo OA + Ngưỡng hạng + SOP',
   'Giai đoạn 0: thiết lập hạ tầng, đăng ký Zalo OA, chốt ngưỡng hạng, SOP vận hành.',
   'workstream', 'todo', 'high',
   v_vy, v_vy, v_dept_ceo, v_quang,
   '2026-06-17', '2026-07-15', now(), now()),

  (v_ws_p1, v_project_id,
   '[P1] Core Platform — Tech + CRM + ZNS live',
   'Giai đoạn 1: xây dựng token service, webhook, bridge order↔phone, bật toàn bộ ZNS, Zalo Mini App v1.',
   'workstream', 'todo', 'high',
   v_vy, v_vy, v_dept_ceo, v_quang,
   '2026-07-16', '2026-08-15', now(), now()),

  (v_ws_p2, v_project_id,
   '[P2] Growth Layer — Accessories Shop + Referral + VIP Care',
   'Giai đoạn 2: tăng trưởng — shop phụ kiện trong Mini App, subscribe-and-save, referral module, chăm sóc VIP.',
   'workstream', 'todo', 'medium',
   v_vy, v_vy, v_dept_ceo, v_quang,
   '2026-08-16', '2026-09-30', now(), now());

  -- ── P0 Subtasks (9 items) ──
  INSERT INTO tasks (id, project_id, parent_task_id, title, task_level, status, priority,
                     assignee_id, head_id, department_id, created_by,
                     start_date, due_date, expected_output, created_at, updated_at)
  VALUES
  (gen_random_uuid(), v_project_id, v_ws_p0,
   'Đăng ký Zalo OA chính thức',
   'subtask', 'todo', 'high',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-06-17', '2026-07-01', 'Zalo OA verified & active', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'Soạn + nộp 7 ZNS template cho Zalo duyệt',
   'subtask', 'todo', 'high',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-06-17', '2026-07-05', '7 ZNS templates submitted & approved by Zalo', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'In QR chung lên thẻ insert card',
   'subtask', 'todo', 'medium',
   v_quang, v_vy, v_dept_ops, v_quang,
   '2026-06-24', '2026-07-10', 'Insert card design finalized, batch printed', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'Bật Seller-Shipping TikTok',
   'subtask', 'todo', 'medium',
   v_quang, v_vy, v_dept_ops, v_quang,
   '2026-06-17', '2026-06-30', 'TikTok Seller-Shipping enabled & tested', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'Chạy query rolling-12th trên fact_order → ngưỡng hạng thật',
   'subtask', 'todo', 'high',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-06-17', '2026-06-28', 'SQL query + kết quả ngưỡng 4 hạng confirmed', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'DenDa chốt ngưỡng 4 hạng + tên chương trình/hạng',
   'subtask', 'todo', 'high',
   v_vy, v_vy, v_dept_ceo, v_quang,
   '2026-06-24', '2026-07-05', 'Decision doc: tên + ngưỡng 4 hạng chính thức', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'DenDa chốt point_cost + ngân sách quà premium VIP',
   'subtask', 'todo', 'high',
   v_vy, v_vy, v_dept_ceo, v_quang,
   '2026-06-24', '2026-07-05', 'Budget approval + point_cost table', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'CSKH soạn SOP đổi quà / khiếu nại điểm-hạng',
   'subtask', 'todo', 'medium',
   NULL, v_vy, v_dept_cskh, v_quang,
   '2026-06-24', '2026-07-10', 'SOP document published on internal wiki', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p0,
   'Brief Creative Director: thẻ insert + bao bì VIP',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-06-17', '2026-06-30', 'Creative brief delivered + moodboard approved', now(), now());

  -- ── P1 Subtasks (13 items) ──
  INSERT INTO tasks (id, project_id, parent_task_id, title, task_level, status, priority,
                     assignee_id, head_id, department_id, created_by,
                     start_date, due_date, expected_output, created_at, updated_at)
  VALUES
  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Token service ULID per order (QR riêng/gói)',
   'subtask', 'todo', 'high',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-07-16', '2026-07-30', 'ULID token service live, QR generation tested', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Webhook /identify + phone standardizer',
   'subtask', 'todo', 'high',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-07-16', '2026-07-30', 'Webhook endpoint live + phone normalization 100%', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Bridge order↔phone auto',
   'subtask', 'todo', 'high',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-07-20', '2026-08-05', 'Auto-bridge coverage >95% orders', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Tier view từ fact_order + points ledger auto',
   'subtask', 'todo', 'medium',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-07-20', '2026-08-10', 'Tier dashboard live + points ledger auto-updated', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'ZNS #2 Onboarding live',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-07-16', '2026-07-31', 'ZNS Onboarding sending confirmed', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'ZNS #3 Replenishment live',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-07-16', '2026-07-31', 'ZNS Replenishment live', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'ZNS #4 Win-back live',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-07-20', '2026-08-05', 'ZNS Win-back live', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'ZNS #5 Sinh nhật live',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-07-20', '2026-08-05', 'ZNS Birthday live', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'ZNS #6 Thăng hạng live',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-07-20', '2026-08-10', 'ZNS Tier Upgrade live', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'ZNS #7 Giữ hạng live',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-07-20', '2026-08-10', 'ZNS Retention live', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Zalo Mini App v1 (scope DenDa chốt)',
   'subtask', 'todo', 'high',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-07-16', '2026-08-15', 'Mini App v1 published on Zalo store', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Sourcing accessories (biên ≥55–65%)',
   'subtask', 'todo', 'medium',
   v_quang, v_vy, v_dept_ops, v_quang,
   '2026-07-16', '2026-08-10', '≥5 SKU accessories sourced, margin confirmed', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p1,
   'Đối soát fake mã đơn định kỳ vs Seller Center',
   'subtask', 'todo', 'medium',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-07-16', '2026-08-15', 'Audit script live + fraud rate <0.5%', now(), now());

  -- ── P2 Subtasks (6 items) ──
  INSERT INTO tasks (id, project_id, parent_task_id, title, task_level, status, priority,
                     assignee_id, head_id, department_id, created_by,
                     start_date, due_date, expected_output, created_at, updated_at)
  VALUES
  (gen_random_uuid(), v_project_id, v_ws_p2,
   'Accessories Shop trong Mini App (−30% member auto)',
   'subtask', 'todo', 'medium',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-08-16', '2026-09-15', 'Accessories shop live in Mini App with member discount', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p2,
   'Subscribe-and-save cho hero F&F',
   'subtask', 'todo', 'medium',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-08-16', '2026-09-20', 'Subscribe-and-save flow live for hero SKUs', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p2,
   'Referral module (cơ chế + chống farm)',
   'subtask', 'todo', 'medium',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-08-16', '2026-09-25', 'Referral live + anti-farm logic verified', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p2,
   'Đo tách kênh (% loyalty per channel)',
   'subtask', 'todo', 'medium',
   v_ma_hong, v_vy, v_dept_rnd, v_quang,
   '2026-08-16', '2026-09-20', 'Channel attribution dashboard live', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p2,
   'Lịch broadcast theo segment + livestream CTA',
   'subtask', 'todo', 'medium',
   v_vu_dao, v_vy, v_dept_mkt, v_quang,
   '2026-08-16', '2026-09-30', 'Segment broadcast calendar published', now(), now()),

  (gen_random_uuid(), v_project_id, v_ws_p2,
   'Quy trình 1:1 chăm sóc VIP2/SVIP',
   'subtask', 'todo', 'medium',
   NULL, v_vy, v_dept_cskh, v_quang,
   '2026-08-16', '2026-09-30', 'VIP2/SVIP care SOP published + pilot done', now(), now());

  RAISE NOTICE 'Done: seeded 3 workstreams + 28 subtasks for project Customer Funnel & Loyalty';
END $$;
