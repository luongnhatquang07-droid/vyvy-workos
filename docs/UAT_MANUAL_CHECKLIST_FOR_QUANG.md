# Final Manual UAT Checklist For Quang

Tai lieu nay dung de Quang bam test truc tiep tren app, con Codex kiem tra DB/API/count sau moi moc. Khong push, khong deploy, khong them tinh nang moi trong qua trinh UAT.

Baseline hien tai:
- App local: `http://localhost:3000`
- Supabase dang ket noi: project ref `tgmnkqcxucxpnhhsggug`
- Env label: chua co bien `APP_ENV` / `NEXT_PUBLIC_APP_ENV`, nen chua the khang dinh dev/staging/prod bang config. Hay xem project Supabase tren dashboard truoc khi dung data that.
- Orphan active baseline phai bang `0` truoc khi test.
- Du lieu QA con active: `QA Project 202606300806`, `QA UAT 202606300934 Project`
- QA tam da xoa: `QA DELETE P0 20260701 01`

## Cach lam viec

1. Quang thao tac tren app.
2. Sau moi moc, Quang gui dung cau trong cot `User confirms`.
3. Codex se chay verify DB/API/count tuong ung.
4. Neu fail, dung flow, ghi bug report, chi sua dung bug do.
5. Khong fake pass. Neu UI khong co chuc nang, ghi `NOT IMPLEMENTED`.

## Flow A - Project Lifecycle

Ten project test: `UAT FINAL PROJECT 20260701`

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| A | 1 | Vao `/projects`, bam `Tao du an`, tao project `UAT FINAL PROJECT 20260701` | Project hien trong danh sach, sidebar `Du an` tang 1 sau reload/data refresh | `Toi da tao project` | Kiem project active, count projects | Pending |
| A | 2 | Trong project moi, tao dau viec lon | Workstream hien trong project | `Toi da tao dau viec lon` | Kiem workstream active thuoc project | Pending |
| A | 3 | Tao dau viec con trong dau viec lon | Task/subtask hien dung cha | `Toi da tao dau viec con` | Kiem task active thuoc project/workstream | Pending |
| A | 4 | Them step vao dau viec con | Step hien trong quy trinh | `Toi da them step` | Kiem task_steps active thuoc task | Pending |
| A | 5 | Sua owner cua project/task/step | Owner hien dung sau luu | `Toi da sua owner` | Kiem owner_id trong DB | Pending |
| A | 6 | Sua deadline | Deadline hien dung tren Projects/Calendar | `Toi da sua deadline` | Kiem due_date va calendar source | Pending |
| A | 7 | Sua trang thai task/step | Trang thai va progress cap nhat dung | `Toi da sua trang thai` | Kiem status/progress logic | Pending |
| A | 8 | Refresh browser | Data van con, selection khong nhay sai | `Toi da refresh project` | Kiem API command-center co du data | Pending |
| A | 9 | Mo Command Center, Calendar, File Library | Count/link data co project moi neu co deadline/file | `Toi da kiem tra cac view lien quan` | Kiem count/view source | Pending |
| A | 10 | Quay lai `/projects`, xoa project test | Project bien mat khoi danh sach | `Toi da xoa project` | Kiem `deleted_at`, cascade children | Pending |
| A | 11 | Refresh va search lai project/task/file | Khong tim thay data da xoa tren app | `Toi da refresh sau xoa project` | Kiem orphan active = 0, search source khong co data xoa | Pending |

Codex verify cho Flow A:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const name = 'UAT FINAL PROJECT 20260701';
  const project = await sb.from('projects').select('id,name,deleted_at,due_date,owner_id').eq('name', name).order('created_at', { ascending:false }).limit(1).maybeSingle();
  if (project.error) throw project.error;
  const projectId = project.data?.id;
  const [workstreams,tasks,steps,deliverables,reminders,approvals,ceo] = await Promise.all([
    projectId ? sb.from('workstreams').select('id,deleted_at').eq('project_id', projectId) : {data:[]},
    projectId ? sb.from('tasks').select('id,deleted_at,status,due_date,owner_id').eq('project_id', projectId) : {data:[]},
    projectId ? sb.from('task_steps').select('id,task_id,deleted_at,status,due_date,owner_id,tasks!task_steps_task_id_fkey(project_id)').eq('tasks.project_id', projectId) : {data:[]},
    projectId ? sb.from('deliverables').select('id,deleted_at,status').eq('project_id', projectId) : {data:[]},
    projectId ? sb.from('reminders').select('id,status,response_status,tasks!reminders_task_id_fkey(project_id)').eq('tasks.project_id', projectId) : {data:[]},
    projectId ? sb.from('approvals').select('id,status,project_id').eq('project_id', projectId) : {data:[]},
    projectId ? sb.from('ceo_decision_requests').select('id,status').eq('project_id', projectId) : {data:[]},
  ]);
  console.log(JSON.stringify({
    project: project.data,
    activeChildren: {
      workstreams: (workstreams.data||[]).filter(x => !x.deleted_at).length,
      tasks: (tasks.data||[]).filter(x => !x.deleted_at).length,
      steps: (steps.data||[]).filter(x => !x.deleted_at).length,
      deliverables: (deliverables.data||[]).filter(x => !x.deleted_at).length,
      reminders: (reminders.data||[]).filter(x => x.status !== 'closed' && x.response_status !== 'CLOSED').length,
      approvals: (approvals.data||[]).filter(x => x.status !== 'CANCELLED').length,
      ceo: (ceo.data||[]).filter(x => x.status !== 'closed').length,
    }
  }, null, 2));
})();
NODE
```

## Flow B - File / Deliverable

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| B | 1 | Trong task test, tao/gia han deliverable required neu UI co | Deliverable hien trong File/Ban giao | `Toi da tao deliverable required` | Kiem deliverables row active/is_required | Pending |
| B | 2 | Gan link test, vi du `https://example.com/uat-final-report` | Tao version moi | `Toi da gan link test` | Kiem deliverable_versions version_number moi | Pending |
| B | 3 | Refresh | Version van con | `Toi da refresh link version` | Kiem persistence | Pending |
| B | 4 | Danh dau version do la `Up nham` | Version mo/gan badge Up nham, completion gate khong tinh hop le | `Toi da danh dau up nham` | Kiem review_status `UPLOADED_BY_MISTAKE` | Pending |
| B | 5 | Thu hoan thanh task | Neu chi co file up nham thi bi chan | `Toi da thu completion gate voi file up nham` | Kiem latest valid version = none | Pending |
| B | 6 | Gan link dung | Tao version moi hop le | `Toi da gan link dung` | Kiem version moi khong invalid | Pending |
| B | 7 | Duyet hoac de cho duyet tuy logic | Status dung theo rule | `Toi da xu ly duyet file` | Kiem deliverable status/approved_version_id | Pending |
| B | 8 | Mo `/file-library` va `/deliverables` | File/link hien dung, version history dung | `Toi da kiem file library va deliverables` | Kiem data source deliverables/versions | Pending |

Codex verify cho Flow B:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const projectName = 'UAT FINAL PROJECT 20260701';
  const { data: project } = await sb.from('projects').select('id').eq('name', projectName).is('deleted_at', null).maybeSingle();
  const { data: deliverables } = project ? await sb.from('deliverables').select('id,name,status,is_required,deleted_at,approved_version_id').eq('project_id', project.id).is('deleted_at', null) : { data: [] };
  const ids = (deliverables||[]).map(x => x.id);
  const { data: versions } = ids.length ? await sb.from('deliverable_versions').select('id,deliverable_id,version_number,external_url,review_status,submitted_at').in('deliverable_id', ids).order('version_number', { ascending:false }) : { data: [] };
  console.log(JSON.stringify({ deliverables, versions }, null, 2));
})();
NODE
```

## Flow C - Completion Gate

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| C | 1 | Tao task can file/buoc required | Task co step/deliverable required | `Toi da tao task can file` | Kiem task + deliverable required | Pending |
| C | 2 | Thu chuyen task sang Hoan thanh khi thieu file | Bi chan, co ly do ro | `Toi da bi chan khi thieu file` | Kiem task chua COMPLETED | Pending |
| C | 3 | Gan file/link hop le | Evidence ton tai | `Toi da gan evidence` | Kiem valid version | Pending |
| C | 4 | Neu can duyet thi duyet | Approval/deliverable dung rule | `Toi da duyet neu can` | Kiem approval/deliverable status | Pending |
| C | 5 | Thu hoan thanh lai | Pass neu du dieu kien | `Toi da hoan thanh task sau khi du dieu kien` | Kiem task status/progress | Pending |

Codex verify cho Flow C:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const { data: project } = await sb.from('projects').select('id').eq('name', 'UAT FINAL PROJECT 20260701').is('deleted_at', null).maybeSingle();
  const { data: tasks } = project ? await sb.from('tasks').select('id,title,status,progress,deleted_at').eq('project_id', project.id).is('deleted_at', null) : { data: [] };
  const taskIds = (tasks||[]).map(t => t.id);
  const { data: steps } = taskIds.length ? await sb.from('task_steps').select('id,task_id,title,status,is_required,deleted_at').in('task_id', taskIds).is('deleted_at', null) : { data: [] };
  const { data: deliverables } = taskIds.length ? await sb.from('deliverables').select('id,task_id,status,is_required,approved_version_id,deleted_at').in('task_id', taskIds).is('deleted_at', null) : { data: [] };
  console.log(JSON.stringify({ tasks, steps, deliverables }, null, 2));
})();
NODE
```

## Flow D - Follow-ups

Composer nhac viec da co trong code hien tai. Neu bam item ma khong mo drawer/modal soan tin thi danh dau `FAIL`, khong fake pass.

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| D | 1 | Tao item can di hoac dung item dang co trong `/follow-ups` | Item hien trong danh sach can di | `Toi da thay item can di` | Kiem reminders open/due | Pending |
| D | 2 | Bam item | Mo drawer/modal `Soan nhac viec` | `Toi da mo composer nhac viec` | Kiem UI + reminder context | Pending |
| D | 3 | Sua noi dung tin neu can | Tin co the sua | `Toi da sua noi dung tin` | Khong tao log khi chua bam Da gui | Pending |
| D | 4 | Bam Copy tin | Copy thanh cong, chua tinh la da gui | `Toi da copy tin` | Kiem reminder_logs chua tang | Pending |
| D | 5 | Bam Da gui | Tao reminder_log, reminder_count tang, lastRemindedAt cap nhat | `Toi da bam Da gui` | Kiem reminder_logs/reminders | Pending |
| D | 6 | Chon hen nhac lai | nextFollowUpAt cap nhat | `Toi da hen nhac lai` | Kiem next_follow_up_at | Pending |
| D | 7 | Mo Calendar | Lich follow-up tiep theo hien neu co | `Toi da kiem calendar follow-up` | Kiem calendar source reminders | Pending |

Codex verify cho Flow D:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const { data: reminders } = await sb.from('reminders').select('id,task_id,deliverable_id,person_id,reminder_level,response_status,status,last_reminded_at,next_follow_up_at,updated_at').neq('status','closed').order('updated_at', { ascending:false }).limit(10);
  const ids = (reminders||[]).map(r => r.id);
  const { data: logs } = ids.length ? await sb.from('reminder_logs').select('id,reminder_id,message_content,sent_at,confirmed_sent,follow_up_at').in('reminder_id', ids).order('sent_at', { ascending:false }).limit(20) : { data: [] };
  console.log(JSON.stringify({ reminders, logs }, null, 2));
})();
NODE
```

## Flow E - Command Center Count

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| E | 1 | Ghi so badge sidebar `Trung tam dieu hanh` | Co so hien tai | `So command center la X` | Kiem getSidebarCounts | Pending |
| E | 2 | Ghi so `Viec uu tien hom nay` | Count khop data active | `So viec uu tien hom nay la X` | Kiem Command Center VM/source | Pending |
| E | 3 | Ghi so `Can di hom nay` | Count la subset reminders due | `So can di hom nay la X` | Kiem reminders due | Pending |
| E | 4 | Sau khi xoa project test, reload Command Center | Count giam neu project co item lien quan | `Toi da reload command center sau xoa` | Kiem count khong tinh deleted graph | Pending |

Codex verify cho Flow E:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const [drafts, approvals, reminders, tasks, deliverables, ceo, meetings, projects] = await Promise.all([
    sb.from('meeting_task_drafts').select('id,import_status'),
    sb.from('approvals').select('id,status,due_at').neq('status','CANCELLED'),
    sb.from('reminders').select('id,next_follow_up_at,response_status,status').neq('status','closed').neq('response_status','CLOSED'),
    sb.from('tasks').select('id,due_date,status,deleted_at').is('deleted_at', null),
    sb.from('deliverables').select('id,due_date,status,deleted_at').is('deleted_at', null),
    sb.from('ceo_decision_requests').select('id,status'),
    sb.from('meetings').select('id,start_at,deleted_at').is('deleted_at', null),
    sb.from('projects').select('id,deleted_at').is('deleted_at', null),
  ]);
  const pendingDrafts = (drafts.data||[]).filter(x => x.import_status !== 'imported').length;
  const pendingApprovals = (approvals.data||[]).filter(x => x.status === 'PENDING' || (x.due_at && x.due_at < today)).length;
  const remindersDue = (reminders.data||[]).filter(x => !x.next_follow_up_at || x.next_follow_up_at.slice(0,10) <= today).length;
  const overdueTasks = (tasks.data||[]).filter(x => x.due_date && x.due_date < today && !['COMPLETED','CANCELLED','WAITING'].includes(x.status)).length;
  const overdueDeliverables = (deliverables.data||[]).filter(x => x.due_date && x.due_date < today && !['SUBMITTED','APPROVED'].includes(x.status)).length;
  const ceoAttention = (ceo.data||[]).filter(x => x.status !== 'closed').length;
  const meetingsToday = (meetings.data||[]).filter(x => x.start_at && x.start_at.slice(0,10) === today).length;
  console.log(JSON.stringify({
    sidebarExpected: {
      commandCenter: pendingDrafts + pendingApprovals + remindersDue + overdueTasks + ceoAttention,
      meetings: meetingsToday,
      taskInbox: pendingDrafts,
      followUps: remindersDue,
      projects: (projects.data||[]).length,
      approvals: pendingApprovals,
      deliverables: overdueDeliverables,
      ceoReports: ceoAttention,
    },
    parts: { pendingDrafts, pendingApprovals, remindersDue, overdueTasks, overdueDeliverables, ceoAttention, meetingsToday }
  }, null, 2));
})();
NODE
```

## Flow F - File Library

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| F | 1 | Mo `/file-library` | Route mo duoc, khong console error | `Toi da mo kho file` | Kiem route/API data | Pending |
| F | 2 | Chon project active | File list filter theo project | `Toi da chon project trong kho file` | Kiem deliverables project_id | Pending |
| F | 3 | Chon task/subtask | File list filter theo task | `Toi da chon task trong kho file` | Kiem deliverables task_id | Pending |
| F | 4 | Search ten file | Ket qua loc dung | `Toi da search ten file` | Kiem source deliverables/versions | Pending |
| F | 5 | Search nguoi nop | Ket qua loc dung | `Toi da search nguoi nop` | Kiem submitter/uploader | Pending |
| F | 6 | Mo detail file | Detail panel co version history | `Toi da mo detail file` | Kiem deliverable detail API | Pending |
| F | 7 | Xoa project lien quan | File thuoc project do bien mat | `Toi da xoa project co file` | Kiem deliverables deleted_at/hidden | Pending |

Codex verify cho Flow F:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const { data } = await sb.from('deliverables').select('id,name,project_id,task_id,step_id,status,deleted_at').is('deleted_at', null).order('updated_at', { ascending:false }).limit(20);
  console.log(JSON.stringify(data, null, 2));
})();
NODE
```

## Flow G - Calendar

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| G | 1 | Tao task co deadline trong project test | Deadline hien tren `/calendar` | `Toi da tao task co deadline` | Kiem tasks.due_date | Pending |
| G | 2 | Mo Calendar | Deadline hien dung ngay | `Toi da thay deadline tren calendar` | Kiem calendar source active tasks/deliverables/reminders | Pending |
| G | 3 | Xoa project test | Deadline bien mat sau reload | `Toi da xoa project va reload calendar` | Kiem task/deliverable/reminder khong active | Pending |

Codex verify cho Flow G:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const { data: tasks } = await sb.from('tasks').select('id,title,project_id,due_date,deleted_at,status').not('due_date','is',null).is('deleted_at', null);
  const { data: deliverables } = await sb.from('deliverables').select('id,name,project_id,task_id,due_date,deleted_at,status').not('due_date','is',null).is('deleted_at', null);
  const { data: reminders } = await sb.from('reminders').select('id,task_id,deliverable_id,next_follow_up_at,status,response_status').not('next_follow_up_at','is',null).neq('status','closed').neq('response_status','CLOSED');
  console.log(JSON.stringify({ tasks, deliverables, reminders }, null, 2));
})();
NODE
```

## Flow H - Search

| Flow | Step | User action | Expected result | User confirms | Codex verifies | Status |
|---|---:|---|---|---|---|---|
| H | 1 | Search project active bang topbar/Ctrl K | Tim thay project active | `Toi search thay project active` | Kiem command palette source data.projects | Pending |
| H | 2 | Search task active | Tim thay task active | `Toi search thay task active` | Kiem data.tasks active | Pending |
| H | 3 | Search file active | Tim thay file active | `Toi search thay file active` | Kiem data.deliverables active | Pending |
| H | 4 | Xoa project test | Data bien mat | `Toi da xoa project de test search` | Kiem cascade | Pending |
| H | 5 | Search lai project/task/file da xoa | Khong tim thay | `Toi search khong thay data da xoa` | Kiem getCommandCenterData khong tra deleted graph | Pending |

Codex verify cho Flow H:

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
(async () => {
  const q = 'UAT FINAL PROJECT 20260701';
  const [projects,tasks,deliverables] = await Promise.all([
    sb.from('projects').select('id,name,deleted_at').ilike('name', `%${q}%`),
    sb.from('tasks').select('id,title,deleted_at,project_id').ilike('title', `%${q}%`),
    sb.from('deliverables').select('id,name,deleted_at,project_id,task_id').ilike('name', `%${q}%`),
  ]);
  console.log(JSON.stringify({
    projects: projects.data,
    tasks: tasks.data,
    deliverables: deliverables.data,
    activeMatches: {
      projects: (projects.data||[]).filter(x => !x.deleted_at).length,
      tasks: (tasks.data||[]).filter(x => !x.deleted_at).length,
      deliverables: (deliverables.data||[]).filter(x => !x.deleted_at).length,
    }
  }, null, 2));
})();
NODE
```

## Global Orphan Audit

Chay sau moi lan xoa project test. Ket qua bat buoc tat ca bang `0`.

```bash
node - <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l => l.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g,'')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
const active = row => !row.deleted_at;
(async () => {
  const [projectsRes, workstreamsRes, tasksRes, stepsRes, deliverablesRes, approvalsRes, remindersRes, ceoRes] = await Promise.all([
    sb.from('projects').select('id,deleted_at'),
    sb.from('workstreams').select('id,project_id,deleted_at'),
    sb.from('tasks').select('id,project_id,workstream_id,deleted_at,status'),
    sb.from('task_steps').select('id,task_id,deleted_at,status'),
    sb.from('deliverables').select('id,project_id,task_id,step_id,deleted_at,status'),
    sb.from('approvals').select('id,project_id,task_id,step_id,deliverable_id,status'),
    sb.from('reminders').select('id,task_id,deliverable_id,status,response_status'),
    sb.from('ceo_decision_requests').select('id,project_id,status'),
  ]);
  const projects = projectsRes.data || [], workstreams = workstreamsRes.data || [], tasks = tasksRes.data || [], steps = stepsRes.data || [], deliverables = deliverablesRes.data || [];
  const activeProjectIds = new Set(projects.filter(active).map(x => x.id));
  const activeWorkstreamIds = new Set(workstreams.filter(x => active(x) && activeProjectIds.has(x.project_id)).map(x => x.id));
  const activeTaskIds = new Set(tasks.filter(x => active(x) && (!x.project_id || activeProjectIds.has(x.project_id)) && (!x.workstream_id || activeWorkstreamIds.has(x.workstream_id))).map(x => x.id));
  const activeStepIds = new Set(steps.filter(x => active(x) && activeTaskIds.has(x.task_id)).map(x => x.id));
  const activeDeliverableIds = new Set(deliverables.filter(x => active(x) && (!x.project_id || activeProjectIds.has(x.project_id)) && (!x.task_id || activeTaskIds.has(x.task_id)) && (!x.step_id || activeStepIds.has(x.step_id))).map(x => x.id));
  console.log(JSON.stringify({
    activeWorkstreamsUnderDeletedProject: workstreams.filter(x => active(x) && !activeProjectIds.has(x.project_id)).length,
    activeTasksUnderDeletedProjectOrWorkstream: tasks.filter(x => active(x) && ((x.project_id && !activeProjectIds.has(x.project_id)) || (x.workstream_id && !activeWorkstreamIds.has(x.workstream_id)))).length,
    activeStepsUnderDeletedTask: steps.filter(x => active(x) && !activeTaskIds.has(x.task_id)).length,
    activeDeliverablesUnderDeletedGraph: deliverables.filter(x => active(x) && ((x.project_id && !activeProjectIds.has(x.project_id)) || (x.task_id && !activeTaskIds.has(x.task_id)) || (x.step_id && !activeStepIds.has(x.step_id)))).length,
    activeRemindersUnderDeletedGraph: (remindersRes.data||[]).filter(x => x.status !== 'closed' && x.response_status !== 'CLOSED' && ((x.task_id && !activeTaskIds.has(x.task_id)) || (x.deliverable_id && !activeDeliverableIds.has(x.deliverable_id)))).length,
    activeApprovalsUnderDeletedGraph: (approvalsRes.data||[]).filter(x => x.status !== 'CANCELLED' && ((x.project_id && !activeProjectIds.has(x.project_id)) || (x.task_id && !activeTaskIds.has(x.task_id)) || (x.step_id && !activeStepIds.has(x.step_id)) || (x.deliverable_id && !activeDeliverableIds.has(x.deliverable_id)))).length,
    activeCeoRequestsUnderDeletedProject: (ceoRes.data||[]).filter(x => x.status !== 'closed' && x.project_id && !activeProjectIds.has(x.project_id)).length,
  }, null, 2));
})();
NODE
```

## Bug Report Template

```text
ID:
Route:
Muc do: P0/P1/P2
Mo ta:
Buoc tai hien:
Ket qua mong muon:
Ket qua thuc te:
Nguyen nhan code:
File lien quan:
Cach sua:
Trang thai:
```

## UAT uu tien

Lam theo thu tu:
1. Flow A - Project lifecycle
2. Flow G - Calendar
3. Flow H - Search
4. Flow F - File Library
5. Flow B/C - File + Completion gate
6. Flow D/E - Follow-ups + Command Center count
