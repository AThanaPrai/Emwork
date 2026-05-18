// ============================================================
// Q1: The Buggy Payroll Logic — วิเคราะห์และแก้ไข 3 จุดผิด
// ============================================================

// ============================================================
// โค้ดต้นฉบับ (มีบัก)
// ============================================================
//
// async function processPayroll(empId, baseSalary, otHours) {
//     const sso = baseSalary * 0.05;
//     const otRate = (baseSalary / 30 / 8) * 1.5;
//     const gross = baseSalary + (otHours * otRate);
//     const net = gross - sso;
//     await db.query(`UPDATE salaries SET balance = balance + ${net}
//                     WHERE emp_id = ${empId}`);
//     return net;
// }

// ============================================================
// วิเคราะห์บัก 3 จุด
// ============================================================
//
// บัก 1 — Floating Point
//   ปัญหา : JavaScript ใช้ IEEE 754 float ทำให้ทศนิยมเพี้ยน
//   ตัวอย่าง: 15000 * 0.05 = 749.9999999999999 (ไม่ใช่ 750)
//   แก้ไข : ใช้ Decimal library แทนทุกการคำนวณเงิน
//
// บัก 2 — SQL Injection
//   ปัญหา : แปะ ${empId} ตรงใน query string โดยไม่กรอง
//   ตัวอย่าง: empId = "1; DROP TABLE salaries--" → ลบตารางได้ทันที
//   แก้ไข : Parameterized Query ($1, $2) + validate type ก่อนใช้
//
// บัก 3 — Race Condition
//   ปัญหา : รัน processPayroll() พร้อมกัน 2 ครั้ง → double payment
//   ตัวอย่าง: Request A และ B อ่าน balance = 50,000 พร้อมกัน
//             ทั้งคู่บวกแค่ครั้งเดียว แทนที่จะได้ 2 ครั้ง
//   แก้ไข : DB Transaction + SELECT FOR UPDATE ล็อก row

// ============================================================
// ติดตั้ง dependency: npm install decimal.js
// ============================================================
const { Decimal } = require("decimal.js");
const readline    = require("readline");

// ============================================================
// V1: ตามโจทย์ข้อสอบ (SSO = 5% ไม่มี cap)
// ============================================================
function calculateV1(baseSalary, otHours) {
  const base   = new Decimal(String(baseSalary));
  const hours  = new Decimal(String(otHours));
  const sso    = base.mul("0.05");
  const otRate = base.div("30").div("8").mul("1.5");
  const gross  = base.add(hours.mul(otRate));
  const net    = gross.sub(sso).toDecimalPlaces(2);
  return {
    sso   : sso.toFixed(2),
    otPay : hours.mul(otRate).toDecimalPlaces(2).toFixed(2),
    gross : gross.toDecimalPlaces(2).toFixed(2),
    net   : net.toFixed(2),
  };
}

// ============================================================
// V2: Real-world (SSO = 5% มี cap 750 บาท/เดือน)
// ============================================================
function calculateV2(baseSalary, otHours) {
  const base   = new Decimal(String(baseSalary));
  const hours  = new Decimal(String(otHours));
  const sso    = Decimal.min(base.mul("0.05"), new Decimal("750"));
  const otRate = base.div("30").div("8").mul("1.5");
  const gross  = base.add(hours.mul(otRate));
  const net    = gross.sub(sso).toDecimalPlaces(2);
  return {
    sso   : sso.toFixed(2),
    otPay : hours.mul(otRate).toDecimalPlaces(2).toFixed(2),
    gross : gross.toDecimalPlaces(2).toFixed(2),
    net   : net.toFixed(2),
  };
}

// ============================================================
// รับ Input จาก Terminal
// ============================================================
const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log("=== Q1: Payroll Calculator ===\n");

  const baseSalaryInput = await ask("เงินเดือนฐาน (บาท): ");
  const otHoursInput    = await ask("ชั่วโมง OT       : ");
  rl.close();

  const baseSalary = parseFloat(baseSalaryInput);
  const otHours    = parseFloat(otHoursInput);

  if (isNaN(baseSalary) || isNaN(otHours)) {
    console.log("\nกรุณากรอกตัวเลขเท่านั้น");
    return;
  }

  const v1 = calculateV1(baseSalary, otHours);
  const v2 = calculateV2(baseSalary, otHours);

  console.log("\n─────────────────────────────────────────");
  console.log(`เงินเดือนฐาน  : ${baseSalary.toLocaleString()} บาท`);
  console.log(`OT            : ${otHours} ชม.`);
  console.log(`OT Pay        : ${v1.otPay} บาท`);
  console.log(`Gross Pay     : ${v1.gross} บาท`);
  console.log("─────────────────────────────────────────");
  console.log("\n  V1 SSO 5%");
  console.log(`  หัก SSO : ${v1.sso} บาท`);
  console.log(`  Net Pay : ${v1.net} บาท`);
  console.log("\n  V2 SSO 5% cap 750 บาท)");
  console.log(`  หัก SSO : ${v2.sso} บาท`);
  console.log(`  Net Pay : ${v2.net} บาท`);
  console.log("─────────────────────────────────────────");
}

main();
