-- ============================================================
-- VyVy WorkOS — VyVy Loyalty OS: Migration + Seed
-- Chạy file này trong Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. CREATE TABLES (idempotent) ──────────────────────────

CREATE TABLE IF NOT EXISTS project_specs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         text,
  north_star    text,
  objectives    text,
  operating_model text,
  data_architecture text,
  kpis          text,   -- JSON array
  risks         text,   -- JSON array
  decisions     text,   -- JSON array
  governance    text,
  notes         text,
  raw_sections  text,
  version       text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution_trackers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage             text,
  phases            text,            -- JSON array
  module_readiness  text,            -- JSON array
  decisions_needed  text,            -- JSON array
  build_needed      text,            -- JSON array
  top3_actions      text,            -- JSON array
  critical_path     text,            -- JSON array
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_tracker_id  uuid NOT NULL REFERENCES execution_trackers(id) ON DELETE CASCADE,
  workstream            text,
  layer                 text,
  phase                 text,
  title                 text NOT NULL,
  owner                 text,
  status                text DEFAULT 'todo',
  note                  text,
  is_critical_path      boolean DEFAULT false,
  order_index           integer DEFAULT 0
);

-- ── 2. FIND OR CREATE PROJECT ──────────────────────────────
-- Tìm project "VyVy Loyalty" (tên có thể khác nhau), nếu không có thì tạo mới

DO $$
DECLARE
  v_project_id uuid;
  v_spec_id    uuid;
  v_tracker_id uuid;
BEGIN

-- Tìm project hiện có (fuzzy match)
SELECT id INTO v_project_id
FROM projects
WHERE name ILIKE '%loyalty%' OR name ILIKE '%VyVy Loyalty%' OR name ILIKE '%Customer Funnel%'
ORDER BY created_at DESC
LIMIT 1;

-- Nếu không tìm thấy, tạo mới
IF v_project_id IS NULL THEN
  INSERT INTO projects (id, name, status, priority, description)
  VALUES (
    gen_random_uuid(),
    'VyVy Loyalty Operating System',
    'in_progress',
    'high',
    'Xây dựng hệ thống loyalty VyVy từ 7.360 lên 25.000 hội viên định danh. North Star: Loyalty = ⅓ tổng doanh số.'
  )
  RETURNING id INTO v_project_id;
  RAISE NOTICE 'Created new project with id: %', v_project_id;
ELSE
  RAISE NOTICE 'Found existing project with id: %', v_project_id;
END IF;

-- Xóa spec/tracker cũ nếu có (để seed lại)
DELETE FROM project_specs WHERE project_id = v_project_id;
DELETE FROM execution_trackers WHERE project_id = v_project_id;

-- ── 3. INSERT PROJECT SPEC ─────────────────────────────────
INSERT INTO project_specs (
  id, project_id, title, north_star, objectives, operating_model, governance,
  kpis, risks, decisions, version
) VALUES (
  gen_random_uuid(),
  v_project_id,
  'VyVy Loyalty Operating System — Strategy & Spec',

  'Loyalty = ⅓ tổng doanh số. Mục tiêu: 25.000 hội viên × 1,8 lần/năm × AOV 374k ≈ 16,8 tỷ / ~50 tỷ = 33,7%.',

  '["Tăng số hội viên định danh từ 7.360 lên 25.000 (3,4×) qua QR insert-card + Zalo capture","Tăng tần suất mua từ 1,3 lên 1,8 đơn/năm qua ZNS lifecycle + accessories cross-sell","Tăng AOV từ 340k lên 374k qua combo, upsell, subscribe-and-save","Xây Customer OS (Zalo OA + Mini App + ZNS 7 kịch bản) tự động hoá toàn bộ vòng đời khách","Chương trình tự tài trợ (self-funding) bằng hoa hồng off-platform tiết kiệm được"]',

  'Loyalty không dựng kho khách riêng — ghi phone+consent vào customer_master, đọc chi tiêu từ fact_order để xếp hạng rolling-12th. Zalo OA là buồng lái CRM; ZNS + Mini App chạy auto-journey. 4 tầng: Chiến lược (M1-M3) → Cơ chế (M4-M7) → Customer OS (M8-M12) → Hạ tầng & Governance (M13-M16).',

  'RACI: DenDa = Accountable toàn bộ; Dev/Data R cho engine+webhook+Mini App; Ops/CSKH R cho QR+SOP; Mkt/Brand R cho ZNS+OA+broadcast. Chốt theo phase gate P0→P1→P2.',

  '[{"kpi":"Scan-rate","formula":"Số lượt quét QR / số gói giao","target":"25–30%"},{"kpi":"Capture-rate","formula":"Số phone+consent / số lượt quét QR","target":"≥60%"},{"kpi":"Tần suất mua","formula":"Tổng đơn paid / tổng khách / năm","target":"1,8 đơn/năm"},{"kpi":"% loyalty (DT có tier / tổng DT)","formula":"DT khách định danh / tổng DT","target":"33%"},{"kpi":"N hội viên định danh","formula":"COUNT(DISTINCT phone_e164) có ≥1 đơn paid","target":"25.000"},{"kpi":"AOV","formula":"Tổng doanh thu / số đơn paid","target":"374.000 đ"},{"kpi":"DT loyalty/năm","formula":"N × F × AOV","target":"≥16,8 tỷ"}]',

  '[{"risk":"Fake mã đơn để gian lận điểm/hạng","severity":"high","mitigation":"Hạng auto từ fact_order + đối soát định kỳ với Seller Center"},{"risk":"Zalo từ chối template ZNS","severity":"high","mitigation":"Nộp 7 template sớm + chuẩn bị bản dự phòng đúng guideline Zalo"},{"risk":"Scan-rate thấp — khách không quét QR insert","severity":"medium","mitigation":"Mồi 3 lớp (xác thực hàng thật + quà chào + cẩm nang routine) + A/B thẻ insert"},{"risk":"Accessories lỗ do chiết khấu quá biên","severity":"medium","mitigation":"Chỉ chiết khấu khi biên gộp SKU > mức giảm; Cost Calculator cảnh báo đỏ"},{"risk":"Shopee/TikTok phạt vì vi phạm chính sách","severity":"medium","mitigation":"Value-add hợp lệ, không review-bait, CTA không nói qua Zalo rẻ hơn"},{"risk":"Vi phạm NĐ13 bảo vệ dữ liệu cá nhân","severity":"high","mitigation":"Consent rõ mục đích + ghi consent_ts + cung cấp cơ chế huỷ đăng ký"}]',

  '[{"id":"T1","decision":"North Star = loyalty ⅓ doanh số; ưu tiên #1 = định danh + ép đơn 1→2","date":"11-06-2026","by":"DenDa"},{"id":"T2","decision":"Archetype = hybrid 3 lớp, premium dồn đỉnh (không flat discount)","date":"11-06-2026","by":"DenDa"},{"id":"T3","decision":"Quà-led giữ giá core; accessories là danh mục discount riêng biệt","date":"11-06-2026","by":"DenDa"},{"id":"T4","decision":"Hạng rolling 12 tháng + status protection + hard/soft benefits + accelerators","date":"11-06-2026","by":"DenDa"},{"id":"T5","decision":"Accessories: member auto −30%, campaign −50%; gate biên > mức chiết khấu","date":"11-06-2026","by":"DenDa"},{"id":"T6","decision":"Engine BUILD MỚI (bỏ amorislab) + Mini App 9 màn","date":"11-06-2026","by":"DenDa"},{"id":"T7","decision":"Customer OS: OA mgmt + sell playbook + care playbook + ZNS lifecycle","date":"11-06-2026","by":"DenDa"}]',

  'v1.0 — 2026-06-11'
)
RETURNING id INTO v_spec_id;
RAISE NOTICE 'Inserted project_spec with id: %', v_spec_id;

-- ── 4. INSERT EXECUTION TRACKER ───────────────────────────
INSERT INTO execution_trackers (
  id, project_id, stage, phases, module_readiness, decisions_needed, top3_actions, critical_path
) VALUES (
  gen_random_uuid(),
  v_project_id,

  'Phase 0 – Foundation (P0 · Tuần 1–2: Gom phone + chốt nền)',

  '[{"phase":"P0","name":"Gom phone + chốt nền","timeline":"Tuần 1–2","owner":"Ops/CSKH + DenDa","work":["Đăng ký Zalo OA + nộp 7 ZNS template duyệt (đường găng ~1 tuần)","In QR chung lên thẻ insert card, bật Seller-Shipping TikTok","Recompute hạng 7.360 khách hiện có từ fact_order rolling-12th","DenDa chốt ngưỡng 4 hạng + tên chương trình/hạng","CSKH soạn SOP đổi quà / khiếu nại điểm-hạng / khách sàn không thấy điểm","Brief Creative Director: thẻ insert + bao bì VIP"]},{"phase":"P1","name":"Tự động hoá lõi","timeline":"Tuần 3–6","owner":"Dev/Data + Mkt","work":["QR riêng/gói (token ULID per order) thay QR chung","Webhook /identify + token service + standardizer + bridge order↔phone","Tier view từ fact_order + points ledger auto","ZNS 2–6 live (Onboarding, Replenishment, Win-back, Sinh nhật, Thăng hạng, Giữ hạng)","Zalo Mini App v1 (scope do DenDa chốt)","Sourcing accessories (biên ≥55–65%)","Đối soát fake mã đơn định kỳ vs Seller Center"]},{"phase":"P2","name":"Tối ưu & mở rộng","timeline":"Tuần 6+","owner":"Mkt/Data","work":["Accessories Shop trong Mini App (giá member auto −30%)","Subscribe-and-save cho hero F&F","Referral module (chốt cơ chế + chống farm)","Đo tách kênh (% loyalty per channel)","Lịch broadcast theo segment + livestream CTA","Quy trình 1:1 chăm sóc VIP2/SVIP"]}]',

  '[{"id":"M1","name":"North Star & kinh tế","readiness":"designed"},{"id":"M2","name":"Phân khúc & value-prop từng hạng","readiness":"designed"},{"id":"M3","name":"Accessories / Lifestyle ecosystem","readiness":"idea"},{"id":"M4","name":"Hạng – chuẩn quốc tế (rolling 12th)","readiness":"designed"},{"id":"M5","name":"Điểm & points ledger","readiness":"designed"},{"id":"M6","name":"Rewards catalogue quà","readiness":"idea"},{"id":"M7","name":"Accessories discount engine","readiness":"idea"},{"id":"M8","name":"Zalo OA mgmt & mời về","readiness":"designed"},{"id":"M9","name":"Sell playbook","readiness":"designed"},{"id":"M10","name":"Care playbook","readiness":"designed"},{"id":"M11","name":"ZNS vòng đời (7 kịch bản)","readiness":"designed"},{"id":"M12","name":"Zalo Mini App","readiness":"idea"},{"id":"M13","name":"Kiến trúc & data contract","readiness":"designed"},{"id":"M14","name":"Đo lường","readiness":"designed"},{"id":"M15","name":"Org/RACI","readiness":"designed"},{"id":"M16","name":"Compliance (NĐ13 + luật sàn)","readiness":"designed"}]',

  '[{"id":"D1","question":"AOV target thực tế là bao nhiêu?","owner":"DenDa","deadline":"P0","options":["374k (giả định hiện tại)","Số khác sau khi xem data thật"]},{"id":"D2","question":"Nhịp campaign accessories −50% — bao nhiêu dịp/năm và dịp nào?","owner":"DenDa","deadline":"P0–P1","options":["đôi khi không cố định","3–4 dịp/năm cố định (Tết, 8/3, sinh nhật brand, 11/11)"]},{"id":"D3","question":"Phạm vi Mini App v1: full 9 màn hay chỉ core?","owner":"DenDa","deadline":"P1","options":["Full 9 màn (Home/Hạng/Đổi quà/Accessories/Routine/Đơn/Subscribe/Referral/Ưu đãi)","Core 4 màn (Home/Hạng/Đổi quà/Accessories)"]},{"id":"D4","question":"Cơ chế referral và chống farm điểm referral?","owner":"DenDa","deadline":"P1–P2","options":["+50/+50 điểm cả hai (cơ chế cũ)","Cơ chế mới với điều kiện chống farm"]},{"id":"D5","question":"Ngân sách quà premium VIP/năm — duyệt trần bao nhiêu?","owner":"DenDa","deadline":"P0","options":["~47 triệu/năm (ước tính hiện tại)","Số khác sau khi xem danh sách ~170 khách VIP2/SVIP"]},{"id":"D6","question":"Tên chương trình và tên 4 hạng thành viên?","owner":"DenDa","deadline":"P0","options":["VyVy Care Club + Member/VIP1/VIP2/SVIP (tên tạm)","Tên khác do DenDa chọn"]}]',

  '[{"priority":1,"action":"Đăng ký Zalo OA + soạn và nộp 7 ZNS template cho Zalo duyệt","owner":"Mkt/CSKH","deadline":"Ngay hôm nay – P0 (đường găng ~1 tuần, chặn cả dự án)"},{"priority":2,"action":"Chạy query rolling-12th trên fact_order → ra ngưỡng hạng thật + % loyalty thật + quy mô từng hạng","owner":"Dev/Data","deadline":"P0 Tuần 1"},{"priority":3,"action":"DenDa xem kết quả query → chốt ngưỡng 4 hạng + tên chương trình/hạng","owner":"DenDa","deadline":"P0 Tuần 1–2 (sau khi có query)"}]',

  '["Đăng ký Zalo OA + nộp 7 ZNS template (~1 tuần duyệt)","Query rolling-12th → ngưỡng hạng + % loyalty thật","DenDa chốt ngưỡng hạng + point_cost + ngân sách quà","Token service ULID + webhook /identify + standardizer","Bridge order↔phone auto","Zalo Mini App v1 live","ZNS 2–6 chạy auto"]'
)
RETURNING id INTO v_tracker_id;
RAISE NOTICE 'Inserted execution_tracker with id: %', v_tracker_id;

-- ── 5. INSERT EXECUTION ITEMS ──────────────────────────────
INSERT INTO execution_items
  (execution_tracker_id, workstream, layer, phase, title, owner, status, is_critical_path, order_index)
VALUES
-- P0 items
(v_tracker_id, 'Setup', 'Hạ tầng', 'P0', 'Đăng ký Zalo OA chính thức', 'Mkt/CSKH', 'todo', true, 1),
(v_tracker_id, 'Setup', 'Hạ tầng', 'P0', 'Soạn + nộp 7 ZNS template cho Zalo duyệt', 'Mkt/CSKH', 'todo', true, 2),
(v_tracker_id, 'Setup', 'Vận hành', 'P0', 'In QR chung lên thẻ insert card', 'Ops', 'todo', false, 3),
(v_tracker_id, 'Setup', 'Vận hành', 'P0', 'Bật Seller-Shipping TikTok', 'Ops', 'todo', false, 4),
(v_tracker_id, 'Data', 'Data', 'P0', 'Chạy query rolling-12th trên fact_order → ngưỡng hạng thật', 'Dev/Data', 'todo', true, 5),
(v_tracker_id, 'Strategy', 'Chiến lược', 'P0', 'DenDa chốt ngưỡng 4 hạng + tên chương trình/hạng', 'DenDa', 'todo', true, 6),
(v_tracker_id, 'Strategy', 'Chiến lược', 'P0', 'DenDa chốt point_cost + ngân sách quà premium VIP', 'DenDa', 'todo', true, 7),
(v_tracker_id, 'Ops', 'Vận hành', 'P0', 'CSKH soạn SOP đổi quà / khiếu nại điểm-hạng', 'CSKH', 'todo', false, 8),
(v_tracker_id, 'Creative', 'Brand', 'P0', 'Brief Creative Director: thẻ insert + bao bì VIP', 'Mkt/Brand', 'todo', false, 9),
-- P1 items
(v_tracker_id, 'Tech', 'Hạ tầng', 'P1', 'Token service ULID per order (QR riêng/gói)', 'Dev', 'todo', true, 10),
(v_tracker_id, 'Tech', 'Hạ tầng', 'P1', 'Webhook /identify + phone standardizer', 'Dev', 'todo', true, 11),
(v_tracker_id, 'Tech', 'Hạ tầng', 'P1', 'Bridge order↔phone auto', 'Dev/Data', 'todo', true, 12),
(v_tracker_id, 'Tech', 'Hạ tầng', 'P1', 'Tier view từ fact_order + points ledger auto', 'Dev/Data', 'todo', false, 13),
(v_tracker_id, 'CRM', 'Customer OS', 'P1', 'ZNS #2 Onboarding live', 'Mkt', 'todo', false, 14),
(v_tracker_id, 'CRM', 'Customer OS', 'P1', 'ZNS #3 Replenishment live', 'Mkt', 'todo', false, 15),
(v_tracker_id, 'CRM', 'Customer OS', 'P1', 'ZNS #4 Win-back live', 'Mkt', 'todo', false, 16),
(v_tracker_id, 'CRM', 'Customer OS', 'P1', 'ZNS #5 Sinh nhật live', 'Mkt', 'todo', false, 17),
(v_tracker_id, 'CRM', 'Customer OS', 'P1', 'ZNS #6 Thăng hạng live', 'Mkt', 'todo', false, 18),
(v_tracker_id, 'CRM', 'Customer OS', 'P1', 'ZNS #7 Giữ hạng live', 'Mkt', 'todo', false, 19),
(v_tracker_id, 'Product', 'Customer OS', 'P1', 'Zalo Mini App v1 (scope DenDa chốt)', 'Dev', 'todo', true, 20),
(v_tracker_id, 'Ops', 'Vận hành', 'P1', 'Sourcing accessories (biên ≥55–65%)', 'Ops/R&D', 'todo', false, 21),
(v_tracker_id, 'Data', 'Data', 'P1', 'Đối soát fake mã đơn định kỳ vs Seller Center', 'Dev/Data', 'todo', false, 22),
-- P2 items
(v_tracker_id, 'Product', 'Customer OS', 'P2', 'Accessories Shop trong Mini App (−30% member auto)', 'Dev/Mkt', 'todo', false, 23),
(v_tracker_id, 'Product', 'Customer OS', 'P2', 'Subscribe-and-save cho hero F&F', 'Dev/Mkt', 'todo', false, 24),
(v_tracker_id, 'Product', 'Customer OS', 'P2', 'Referral module (cơ chế + chống farm)', 'Dev/Mkt', 'todo', false, 25),
(v_tracker_id, 'Data', 'Data', 'P2', 'Đo tách kênh (% loyalty per channel)', 'Data', 'todo', false, 26),
(v_tracker_id, 'CRM', 'Customer OS', 'P2', 'Lịch broadcast theo segment + livestream CTA', 'Mkt', 'todo', false, 27),
(v_tracker_id, 'Ops', 'Vận hành', 'P2', 'Quy trình 1:1 chăm sóc VIP2/SVIP', 'CSKH', 'todo', false, 28);

RAISE NOTICE 'Done. project_id=%, spec_id=%, tracker_id=%', v_project_id, v_spec_id, v_tracker_id;

END $$;

-- ── 6. VERIFY ──────────────────────────────────────────────
SELECT 'projects'        AS tbl, COUNT(*) FROM projects        WHERE name ILIKE '%loyalty%'
UNION ALL
SELECT 'project_specs'   AS tbl, COUNT(*) FROM project_specs
UNION ALL
SELECT 'exec_trackers'   AS tbl, COUNT(*) FROM execution_trackers
UNION ALL
SELECT 'exec_items'      AS tbl, COUNT(*) FROM execution_items;
