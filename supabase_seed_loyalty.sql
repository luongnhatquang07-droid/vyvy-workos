-- ───────────────────────────────────────────────────────────────────────────
-- VyVy WorkOS — Seed dự án "VyVy Loyalty OS"
-- 1 project · 3 đầu việc lớn (P0/P1/P2) · 23 đầu việc con.
-- owner để gắn sau (owner_id = null); thông tin owner/module/blocker đưa vào description.
-- An toàn: chỉ chạy nếu project code PRJ-LOY-001 CHƯA tồn tại (chạy lại không nhân đôi).
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  v_proj uuid;
  v_p0 uuid;
  v_p1 uuid;
  v_p2 uuid;
begin
  if exists (select 1 from projects where code = 'PRJ-LOY-001') then
    raise notice 'VyVy Loyalty OS da ton tai — bo qua seed.';
    return;
  end if;

  insert into projects (name, code, description, status, priority, progress_percent, issue_status)
  values (
    'VyVy Loyalty OS',
    'PRJ-LOY-001',
    'Loyalty Operating System (Care Club). North Star: Loyalty = 1/3 doanh so. DT = N x F x A. Muc tieu: N 7.360->25.000, F 1,3->1,8, AOV 340k->374k, %loyalty ~11%->33%. Tu tai tro bang hoa hong san tiet kiem. 16 module / 4 tang. Do chin: 5 idea, 11 designed, 0 ready.',
    'in_progress', 'high', 0, 'normal'
  ) returning id into v_proj;

  -- ── Workstreams theo pha ──
  insert into tasks (title, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values ('P0 · Tuan 1-2 — Gom phone + chot nen', 'workstream', 'in_progress', 'high', 0, v_proj, 'normal', 'not_submitted')
  returning id into v_p0;

  insert into tasks (title, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values ('P1 · Tuan 3-6 — Tu dong hoa loi', 'workstream', 'not_started', 'high', 0, v_proj, 'normal', 'not_submitted')
  returning id into v_p1;

  insert into tasks (title, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values ('P2 · Tuan 6+ — Toi uu & mo rong', 'workstream', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted')
  returning id into v_p2;

  -- ── P0 subtasks ──
  insert into tasks (title, description, parent_task_id, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values
   ('Dang ky Zalo OA + soan & nop 7 ZNS template', 'owner: Marketing | module: M8,M11 | blocker: CAN BUILD | critical-path: duong gang ~1 tuan duyet — chan ca P0 Mkt/CSKH', v_p0, 'subtask', 'in_progress', 'high', 0, v_proj, 'normal', 'not_submitted'),
   ('Query rolling-12th -> nguong hang + quy mo + % loyalty that', 'owner: Dev/Data | module: M1,M4 | blocker: CAN SO | bien "uoc" thanh "chot", chay tren fact_order', v_p0, 'subtask', 'pending', 'high', 0, v_proj, 'normal', 'not_submitted'),
   ('Chot nguong 4 hang + ten chuong trinh + ten 4 hang', 'owner: DenDa | module: M4 | blocker: CAN QUYET | sau khi xem query; tam 2tr/5tr/12tr; ten tam "VyVy Care Club"', v_p0, 'subtask', 'pending', 'high', 0, v_proj, 'normal', 'not_submitted'),
   ('Chot AOV target 12 thang', 'owner: DenDa | module: M1 | blocker: CAN QUYET | gia dinh tam 374k', v_p0, 'subtask', 'pending', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('In QR token chung len the insert', 'owner: Ops | module: M13 | blocker: CAN BUILD | P0 QR chung, P1 token rieng/goi', v_p0, 'subtask', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Bat Seller-Shipping TikTok (lay phone qua van don)', 'owner: Ops | module: M8 | blocker: CAN BUILD', v_p0, 'subtask', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Chuan hoa SOP: doi qua / khieu nai diem-hang / khach san', 'owner: CSKH | module: M10 | blocker: CAN BUILD', v_p0, 'subtask', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Brief Creative: the insert + bao bi VIP + UI Mini App', 'owner: Marketing | module: M12 | blocker: CAN BUILD', v_p0, 'subtask', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Ghi nhan 6 quyet dinh nen da chot', 'owner: DenDa | readiness: locked | dien noi dung tu trang 05 Execution Tracker', v_p0, 'subtask', 'completed', 'low', 100, v_proj, 'normal', 'approved');

  -- ── P1 subtasks ──
  insert into tasks (title, description, parent_task_id, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values
   ('Tier view tu fact_order + points ledger', 'owner: Dev/Data | module: M4,M5 | blocker: CAN BUILD', v_p1, 'subtask', 'not_started', 'high', 0, v_proj, 'normal', 'not_submitted'),
   ('Webhook /identify + token service + standardizer + bridge', 'owner: Dev/Data | module: M13 | blocker: CAN BUILD', v_p1, 'subtask', 'not_started', 'high', 0, v_proj, 'normal', 'not_submitted'),
   ('Chot ti le tich diem + point_cost (Cost Calculator, NET duong)', 'owner: DenDa/Data | module: M5,M6 | blocker: CAN SO | tam 1d/1.000d', v_p1, 'subtask', 'pending', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Chot danh sach qua + point_cost that (catalogue)', 'owner: DenDa | module: M6 | blocker: CAN SO', v_p1, 'subtask', 'pending', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Chot pham vi Mini App v1 (full 9 man / core)', 'owner: DenDa | module: M12 | blocker: CAN QUYET | core: Home/Hang/Doi qua/Accessories', v_p1, 'subtask', 'pending', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Chot co che referral +50/+50 + chong farm', 'owner: DenDa | module: M6 | blocker: CAN QUYET', v_p1, 'subtask', 'pending', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('In QR token rieng/theo goi', 'owner: Ops | module: M13 | blocker: CAN BUILD', v_p1, 'subtask', 'not_started', 'low', 0, v_proj, 'normal', 'not_submitted'),
   ('Sourcing accessories (bien >=55-65%)', 'owner: Ops | module: M3,M7 | blocker: CAN BUILD', v_p1, 'subtask', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Doi soat fake ma don (dinh ky vs Seller Center)', 'owner: CSKH | module: M16 | blocker: CAN BUILD', v_p1, 'subtask', 'not_started', 'low', 0, v_proj, 'normal', 'not_submitted');

  -- ── P2 subtasks ──
  insert into tasks (title, description, parent_task_id, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values
   ('Build Zalo Mini App (theo scope DenDa chot)', 'owner: Dev/Design | module: M12 | blocker: CAN BUILD', v_p2, 'subtask', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted'),
   ('Quy trinh 1:1 cham soc VIP2/SVIP', 'owner: CSKH | module: M10 | blocker: CAN BUILD', v_p2, 'subtask', 'not_started', 'low', 0, v_proj, 'normal', 'not_submitted'),
   ('Lich broadcast theo segment + livestream CTA ve OA', 'owner: Marketing | module: M9 | blocker: CAN BUILD', v_p2, 'subtask', 'not_started', 'low', 0, v_proj, 'normal', 'not_submitted'),
   ('Accessories engine — bien SKU + nhip campaign -50%', 'owner: Ops/DenDa | module: M7 | blocker: CAN QUYET | quyet may dip -50%/nam', v_p2, 'subtask', 'pending', 'low', 0, v_proj, 'normal', 'not_submitted'),
   ('Duyet ngan sach qua premium VIP (~47tr/nam)', 'owner: DenDa | module: M6 | blocker: CAN QUYET', v_p2, 'subtask', 'pending', 'low', 0, v_proj, 'normal', 'not_submitted');

  raise notice 'Seeded VyVy Loyalty OS: 1 project, 3 workstream, 23 subtask.';
end $$;
