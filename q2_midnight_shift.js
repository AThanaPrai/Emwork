// ============================================================
// Q2: The Midnight Shift SQL
// หาพนักงานกะดึก วันที่ 19 มีนาคม 2026 ที่มาสาย
// รองรับการสแกนก่อนเที่ยงคืน (23:55 วันที่ 18)
// ============================================================

const Database = require("better-sqlite3");
const db       = new Database(":memory:");

// ============================================================
// สร้างตารางและข้อมูลจำลอง
// ============================================================
db.exec(`
  CREATE TABLE employees (
    emp_id   INTEGER PRIMARY KEY,
    emp_name TEXT NOT NULL
  );

  CREATE TABLE shifts (
    shift_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id     INTEGER,
    shift_date TEXT,       -- วันที่เริ่มกะ
    shift_type TEXT        -- MORNING | EVENING | NIGHT
  );

  CREATE TABLE attendance (
    att_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id   INTEGER,
    clock_in TEXT           -- datetime เช่น '2026-03-19 00:10:00'
  );

  -- พนักงาน
  INSERT INTO employees VALUES (1, 'สมชาย');    -- NIGHT  มาสาย   00:10
  INSERT INTO employees VALUES (2, 'สมหญิง');   -- NIGHT  ตรงเวลา 23:55 วันที่ 18
  INSERT INTO employees VALUES (3, 'มานะ');     -- NIGHT  มาสาย   00:20
  INSERT INTO employees VALUES (4, 'วิไล');     -- MORNING ไม่นับ
  INSERT INTO employees VALUES (5, 'ประสิทธิ์'); -- NIGHT  มาสาย   01:00
  INSERT INTO employees VALUES (6, 'รัตนา');    -- NIGHT  ตรงเวลา 00:03
  INSERT INTO employees VALUES (7, 'อนงค์');    -- EVENING ตรงเวลา 16:00
  INSERT INTO employees VALUES (8, 'ธนกร');     -- EVENING มาสาย  17:00

  -- ตารางกะ
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (1, '2026-03-19', 'NIGHT');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (2, '2026-03-19', 'NIGHT');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (3, '2026-03-19', 'NIGHT');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (4, '2026-03-19', 'MORNING');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (5, '2026-03-19', 'NIGHT');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (6, '2026-03-19', 'NIGHT');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (7, '2026-03-19', 'EVENING');
  INSERT INTO shifts (emp_id, shift_date, shift_type) VALUES (8, '2026-03-19', 'EVENING');

  -- การสแกนนิ้ว
  INSERT INTO attendance (emp_id, clock_in) VALUES (1, '2026-03-19 00:10:00'); -- NIGHT สาย
  INSERT INTO attendance (emp_id, clock_in) VALUES (2, '2026-03-18 23:55:00'); -- NIGHT ตรงเวลา (ก่อนเที่ยงคืน)
  INSERT INTO attendance (emp_id, clock_in) VALUES (3, '2026-03-19 00:20:00'); -- NIGHT สาย
  INSERT INTO attendance (emp_id, clock_in) VALUES (4, '2026-03-19 08:05:00'); -- MORNING
  INSERT INTO attendance (emp_id, clock_in) VALUES (5, '2026-03-19 01:00:00'); -- NIGHT สาย
  INSERT INTO attendance (emp_id, clock_in) VALUES (6, '2026-03-19 00:03:00'); -- NIGHT ตรงเวลา
  INSERT INTO attendance (emp_id, clock_in) VALUES (7, '2026-03-19 16:00:00'); -- EVENING ตรงเวลา
  INSERT INTO attendance (emp_id, clock_in) VALUES (8, '2026-03-19 17:00:00'); -- EVENING สาย
`);

// ============================================================
// SQL Query หลัก
//
// Logic:
//   Night Shift วันที่ 19 = clock-in ระหว่าง
//     23:45 วันที่ 18  ถึง  08:00 วันที่ 19
//   มาสาย = clock_in > 00:05 วันที่ 19
//   ตรงเวลา = clock_in ระหว่าง 23:45-23:59 วันที่ 18
//             หรือ 00:00-00:05 วันที่ 19
// ============================================================

const QUERY_LATE = `
  SELECT
    e.emp_id,
    e.emp_name,
    s.shift_type,
    a.clock_in,
    CASE
      WHEN a.clock_in > '2026-03-19 00:05:00' THEN 'สาย'
      ELSE 'ตรงเวลา'
    END AS status
  FROM shifts s
  JOIN employees e  ON e.emp_id = s.emp_id
  JOIN attendance a ON a.emp_id = s.emp_id
  WHERE
    s.shift_date = '2026-03-19'
    AND s.shift_type = 'NIGHT'
    -- รองรับสแกนก่อนเที่ยงคืน (23:45 วันที่ 18)
    -- และสแกนหลังเที่ยงคืน (00:00–08:00 วันที่ 19)
    AND a.clock_in BETWEEN '2026-03-18 23:45:00' AND '2026-03-19 08:00:00'
    AND a.clock_in > '2026-03-19 00:05:00'
  ORDER BY a.clock_in
`;

const QUERY_ALL = `
  SELECT
    e.emp_id,
    e.emp_name,
    s.shift_type,
    a.clock_in,
    CASE
      WHEN s.shift_type = 'MORNING' AND a.clock_in > '2026-03-19 08:05:00' THEN 'สาย'
      WHEN s.shift_type = 'EVENING' AND a.clock_in > '2026-03-19 16:05:00' THEN 'สาย'
      WHEN s.shift_type = 'NIGHT'   AND a.clock_in > '2026-03-19 00:05:00' THEN 'สาย'
      ELSE 'ตรงเวลา'
    END AS status
  FROM shifts s
  JOIN employees e  ON e.emp_id = s.emp_id
  JOIN attendance a ON a.emp_id = s.emp_id
  WHERE s.shift_date = '2026-03-19'
  ORDER BY s.shift_type, a.clock_in
`;

// ============================================================
// แสดงผล
// ============================================================

const LINE = "────────────────────────────────────────────────────────────────";
const HDR  = "  emp_id  ชื่อ          กะ        clock_in              สถานะ";

function printRows(rows) {
  for (const r of rows) {
    const name    = r.emp_name.padEnd(12);
    const shift   = r.shift_type.padEnd(8);
    const clockIn = r.clock_in.padEnd(22);
    const note    = r.clock_in < '2026-03-19' ? ' ← สแกนก่อนเที่ยงคืน' : '';
    console.log(`  ${r.emp_id}       ${name}  ${shift}  ${clockIn}  ${r.status}${note}`);
  }
}

console.log("=== Q2: Shift Report — 19 มีนาคม 2026 ===\n");

// Table 1: พนักงานทั้งหมดทุกกะ
console.log("Table 1: พนักงานทั้งหมด (ทุกกะ)");
console.log(LINE);
console.log(HDR);
console.log(LINE);
printRows(db.prepare(QUERY_ALL).all());
console.log(LINE);

// Table 2: เฉพาะ NIGHT ที่มาสาย
console.log("\nTable 2: กะดึก (NIGHT) ที่มาสายเท่านั้น");
console.log(LINE);
console.log(HDR);
console.log(LINE);
const nightLate = db.prepare(QUERY_LATE).all();
if (nightLate.length === 0) {
  console.log("  ไม่มีพนักงานมาสาย");
} else {
  printRows(nightLate);
}
console.log(LINE);
console.log(`  รวมมาสาย (NIGHT): ${nightLate.length} คน`);
console.log("\nKey: สมหญิง สแกน 23:55 วันที่ 18 → ถือว่าตรงเวลา (ไม่โดนนับว่าสาย)");
