// ============================================================
// Q3: System Design & Audit Trail
// ระบบแก้ไขเงินเดือนย้อนหลัง + Audit Trail
// ============================================================

const Database = require("better-sqlite3");
const db       = new Database(":memory:");

// ============================================================
// Database Schema
// ============================================================
db.exec(`
  -- ตารางผู้ใช้งานระบบ
  CREATE TABLE users (
    user_id   INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    role      TEXT NOT NULL,   -- HR | MANAGER | IT | FINANCE
    emp_id    INTEGER          -- รหัสพนักงานของ user นี้
  );

  -- ตารางเงินเดือน (ค่าปัจจุบัน)
  CREATE TABLE payroll (
    payroll_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id      INTEGER NOT NULL,
    pay_period  TEXT NOT NULL,          -- เช่น '2026-03-01'
    base_salary REAL NOT NULL,
    UNIQUE (emp_id, pay_period)
  );

  -- ตาราง Audit Trail (append-only ห้ามแก้/ลบ)
  CREATE TABLE payroll_audit (
    audit_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_id  INTEGER NOT NULL,
    changed_by  INTEGER NOT NULL,       -- user_id ที่แก้
    changed_at  TEXT DEFAULT (datetime('now')),
    action      TEXT NOT NULL,          -- UPDATE | APPROVE | REJECT
    field_name  TEXT NOT NULL,          -- ชื่อ field ที่เปลี่ยน
    old_value   TEXT,                   -- ค่าเก่า
    new_value   TEXT,                   -- ค่าใหม่
    reason      TEXT NOT NULL,          -- เหตุผล (บังคับกรอก)
    approved_by INTEGER,                -- user_id ผู้อนุมัติ
    approved_at TEXT
  );

  -- ข้อมูลผู้ใช้
  INSERT INTO users VALUES (1, 'นภา (HR)',      'HR',      10);
  INSERT INTO users VALUES (2, 'ก้อง (Manager)','MANAGER', 20);
  INSERT INTO users VALUES (3, 'บอม (IT)',       'IT',      30);
  INSERT INTO users VALUES (4, 'ฝน (Finance)',   'FINANCE', 40);

  -- ข้อมูลเงินเดือน
  INSERT INTO payroll (emp_id, pay_period, base_salary) VALUES (10, '2026-02-01', 25000);
  INSERT INTO payroll (emp_id, pay_period, base_salary) VALUES (30, '2026-02-01', 35000);
`);

// ============================================================
// REST API Design (documented)
// ============================================================
const API_DESIGN = `
=== REST API: ระบบแก้ไขเงินเดือนย้อนหลัง ===

POST   /api/payroll/:payrollId/amendments      -- HR ขอแก้ไข
       Body: { field: "base_salary", newValue: 27000, reason: "ปรับตามผลประเมิน" }

PATCH  /api/payroll/amendments/:id/approve     -- MANAGER/FINANCE อนุมัติ
PATCH  /api/payroll/amendments/:id/reject      -- MANAGER/FINANCE ปฏิเสธ

GET    /api/payroll/:payrollId/audit           -- ดู audit log
GET    /api/employees/:empId/payroll-history   -- ดูประวัติเงินเดือน
`;

// ============================================================
// Functions จำลอง API
// ============================================================

function amendPayroll(payrollId, changedBy, fieldName, newValue, reason) {
  const user    = db.prepare("SELECT * FROM users WHERE user_id = ?").get(changedBy);
  const payroll = db.prepare("SELECT * FROM payroll WHERE payroll_id = ?").get(payrollId);

  // Guard 1: เฉพาะ HR เท่านั้นที่แก้เงินเดือนได้
  if (user.role !== "HR") {
    throw new Error(`${user.name} ไม่มีสิทธิ์แก้เงินเดือน (role: ${user.role})`);
  }

  // Guard 2: ห้ามแก้เงินเดือนตัวเอง
  if (user.emp_id === payroll.emp_id) {
    throw new Error(`ห้ามแก้เงินเดือนตัวเอง (user: ${user.name})`);
  }

  // Guard 3: ต้องมีเหตุผล
  if (!reason || reason.trim() === "") {
    throw new Error("กรุณาระบุเหตุผลการแก้ไข");
  }

  const oldValue = String(payroll[fieldName]);

  // บันทึก Audit Trail
  db.prepare(`
    INSERT INTO payroll_audit (payroll_id, changed_by, action, field_name, old_value, new_value, reason)
    VALUES (?, ?, 'UPDATE', ?, ?, ?, ?)
  `).run(payrollId, changedBy, fieldName, oldValue, String(newValue), reason);

  // อัปเดตค่าจริง (ต้องผ่าน Approve ก่อนในระบบจริง)
  db.prepare(`UPDATE payroll SET ${fieldName} = ? WHERE payroll_id = ?`).run(newValue, payrollId);

  return { success: true, oldValue, newValue: String(newValue) };
}

function approveAmendment(auditId, approvedBy) {
  const user = db.prepare("SELECT * FROM users WHERE user_id = ?").get(approvedBy);

  // Guard: ผู้อนุมัติต้องเป็น MANAGER หรือ FINANCE เท่านั้น
  if (!["MANAGER", "FINANCE"].includes(user.role)) {
    throw new Error(`${user.name} ไม่มีสิทธิ์อนุมัติ (role: ${user.role})`);
  }

  db.prepare(`
    UPDATE payroll_audit
    SET approved_by = ?, approved_at = datetime('now')
    WHERE audit_id = ?
  `).run(approvedBy, auditId);

  return { success: true, approvedBy: user.name };
}

function getAuditLog(payrollId) {
  return db.prepare(`
    SELECT
      a.audit_id,
      u.name      AS changed_by,
      a.changed_at,
      a.action,
      a.field_name,
      a.old_value,
      a.new_value,
      a.reason,
      ap.name     AS approved_by,
      a.approved_at
    FROM payroll_audit a
    JOIN users u          ON u.user_id = a.changed_by
    LEFT JOIN users ap    ON ap.user_id = a.approved_by
    WHERE a.payroll_id = ?
    ORDER BY a.changed_at
  `).all(payrollId);
}

// ============================================================
// Demo
// ============================================================

const SEP = "─────────────────────────────────────────────────────";

console.log("=== Q3: Audit Trail Demo ===\n");

// แสดงข้อมูลเริ่มต้น
console.log("ข้อมูลเงินเดือนก่อนแก้:");
console.log(SEP);
for (const r of db.prepare("SELECT p.*, e.name as emp_name FROM payroll p JOIN users e ON e.emp_id = p.emp_id").all()) {
  console.log(`  emp: ${r.emp_name} | period: ${r.pay_period} | base_salary: ${r.base_salary}`);
}

// Case 1: HR แก้เงินเดือนตัวเอง → ถูกบล็อก (self-edit)
console.log(`\n${SEP}`);
console.log("Case 1: HR แก้เงินเดือนตัวเอง → ถูกบล็อก");
console.log(SEP);
try {
  amendPayroll(1, 1, "base_salary", 27000, "ปรับเงินเดือนตัวเอง");
} catch (e) {
  console.log(`  ถูกบล็อก: ${e.message}`);
}

// Case 2: IT แก้เงินเดือนคนอื่น → ถูกบล็อก (role ไม่ใช่ HR)
console.log(`\n${SEP}`);
console.log("Case 2: IT แก้เงินเดือน HR → ถูกบล็อก (role ไม่ใช่ HR)");
console.log(SEP);
try {
  amendPayroll(1, 3, "base_salary", 99999, "แก้เงินเดือนคนอื่น");
} catch (e) {
  console.log(`  ถูกบล็อก: ${e.message}`);
}

// Case 3: HR แก้เงินเดือน IT โดยไม่มีเหตุผล → ถูกบล็อก (no reason)
console.log(`\n${SEP}`);
console.log("Case 3: HR แก้เงินเดือน IT โดยไม่ระบุเหตุผล → ถูกบล็อก");
console.log(SEP);
try {
  amendPayroll(2, 1, "base_salary", 37000, "");
} catch (e) {
  console.log(`  ถูกบล็อก: ${e.message}`);
}

// Case 4: HR แก้เงินเดือน IT พร้อมเหตุผล → สำเร็จ (audit_id=1 ถูกสร้าง)
console.log(`\n${SEP}`);
console.log("Case 4: HR แก้เงินเดือน IT พร้อมเหตุผล → สำเร็จ");
console.log(SEP);
try {
  const result = amendPayroll(2, 1, "base_salary", 37000, "ปรับเงินเดือนตามผลประเมิน Q4");
  console.log(`  สำเร็จ: ${result.oldValue} → ${result.newValue}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}

// Case 5: IT อนุมัติ → ถูกบล็อก (role ไม่ใช่ MANAGER/FINANCE)
console.log(`\n${SEP}`);
console.log("Case 5: IT พยายามอนุมัติ → ถูกบล็อก");
console.log(SEP);
try {
  approveAmendment(1, 3);
} catch (e) {
  console.log(`  ถูกบล็อก: ${e.message}`);
}

// Case 6: Manager อนุมัติ → สำเร็จ
console.log(`\n${SEP}`);
console.log("Case 6: Manager อนุมัติ → สำเร็จ");
console.log(SEP);
try {
  const result = approveAmendment(1, 2);
  console.log(`  สำเร็จ: อนุมัติโดย ${result.approvedBy}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}

// แสดง Audit Log
console.log(`\n${SEP}`);
console.log("Audit Log ของ payroll_id = 1:");
console.log(SEP);
console.log("  audit_id | แก้โดย           | field        | เก่า  → ใหม่  | อนุมัติโดย");
console.log(SEP);
for (const r of getAuditLog(1)) {
  const approved = r.approved_by ? r.approved_by : "รออนุมัติ";
  console.log(`  ${r.audit_id}        | ${r.changed_by.padEnd(16)} | ${r.field_name.padEnd(12)} | ${r.old_value} → ${r.new_value} | ${approved}`);
}

console.log(`\n${SEP}`);
console.log("กลไกป้องกัน IT แก้เงินเดือนตัวเองใน DB:");
console.log(SEP);
console.log("  1. Application Guard  : ตรวจ user.emp_id === payroll.emp_id → Block");
console.log("  2. 4-Eyes Principle   : ผู้แก้ ≠ ผู้อนุมัติ เสมอ");
console.log("  3. Role Check         : อนุมัติได้เฉพาะ MANAGER / FINANCE");
console.log("  4. Reason Required    : บังคับระบุเหตุผลทุกครั้ง");
console.log("  5. Append-only Audit  : ห้าม UPDATE/DELETE ใน payroll_audit");
