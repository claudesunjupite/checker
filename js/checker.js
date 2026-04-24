/* checker.js — เปรียบเทียบข้อมูลจาก 3 แหล่ง รองรับ 2doc และ 3doc */

const Checker = (() => {

  // รวม qty ต่อรหัส (หัก isReturn)
  function aggregateByCode(items) {
    const map = {}; // code → { qty, name, unit, price }
    for (const item of items) {
      if (!item.code) continue;
      if (!map[item.code]) {
        map[item.code] = { qty: 0, name: item.name || '', unit: item.unit || '', price: item.price || 0 };
      }
      if (item.isReturn) {
        map[item.code].qty -= item.qty;
      } else {
        map[item.code].qty += item.qty;
      }
      if (item.price > 0) map[item.code].price = item.price;
      if (item.name && !map[item.code].name) map[item.code].name = item.name;
      if (item.unit && !map[item.code].unit) map[item.code].unit = item.unit;
    }
    return map;
  }

  function checkConsistency(parsedData) {
    const { mode, quote, ebik, summary } = parsedData;

    const ebikMap    = aggregateByCode(ebik);
    const summaryMap = aggregateByCode(summary);
    const quoteMap   = mode === '3doc' ? aggregateByCode(quote) : {};

    // รวม code ทั้งหมดจากทุกแหล่ง
    const allCodes = new Set([
      ...Object.keys(ebikMap),
      ...Object.keys(summaryMap),
      ...(mode === '3doc' ? Object.keys(quoteMap) : []),
    ]);

    const rows = [];

    for (const code of [...allCodes].sort()) {
      const b = ebikMap[code]    || { qty: 0, name: '', unit: '', price: 0 };
      const s = summaryMap[code] || { qty: 0, name: '', unit: '', price: 0 };
      const q = mode === '3doc'
        ? (quoteMap[code] || { qty: 0, name: '', unit: '', price: 0 })
        : null;

      const ebikQty    = b.qty;
      const summaryQty = s.qty;
      const quoteQty   = q ? q.qty : null;
      const price      = q ? q.price : null;
      const totalPrice = (price && quoteQty) ? price * quoteQty : null;

      const name = q?.name || b.name || s.name || '';
      const unit = q?.unit || b.unit || s.unit || '';

      // ตรวจสอบ missing
      const missing = [];
      if (mode === '3doc') {
        if (ebikQty === 0)    missing.push('ใบเบิก');
        if (quoteQty === 0)   missing.push('ใบเสนอราคา');
        if (summaryQty === 0) missing.push('ใบสรุป');
      } else {
        if (ebikQty === 0)    missing.push('ใบเบิก');
        if (summaryQty === 0) missing.push('ใบสรุป');
      }

      // ตรวจสอบ qty ไม่ตรง
      let qtyMismatch = false;
      if (missing.length === 0) {
        if (mode === '3doc') {
          qtyMismatch = !(ebikQty === quoteQty && quoteQty === summaryQty);
        } else {
          qtyMismatch = ebikQty !== summaryQty;
        }
      }

      // status
      let status = '✓';
      if (missing.length > 0) {
        status = 'ขาดจาก: ' + missing.join(', ');
      } else if (qtyMismatch) {
        status = 'จำนวนไม่ตรง';
      }

      // rowClass สำหรับ UI
      let rowClass = 'row-pass';
      if (qtyMismatch) {
        rowClass = 'row-fail';
      } else if (missing.length > 0) {
        if (mode === '3doc' && missing.includes('ใบเสนอราคา') && !missing.includes('ใบเบิก') && !missing.includes('ใบสรุป')) {
          rowClass = 'row-miss-b'; // มีในเบิก/สรุปแต่ไม่มีในเสนอราคา → แดง
        } else if (missing.includes('ใบเบิก') || missing.includes('ใบสรุป')) {
          rowClass = missing.length === 1 ? 'row-miss-a' : 'row-fail'; // ขาดฝั่งเดียว → เหลือง, ขาดหลายฝั่ง → ส้ม
        }
      }

      rows.push({
        code, name, unit,
        ebikQty, quoteQty, summaryQty,
        price, totalPrice,
        status, rowClass, missing,
      });
    }

    const pass  = rows.filter(r => r.status === '✓').length;
    const fail  = rows.length - pass;
    const total = rows.length;

    // คำนวณ VAT เฉพาะ 3doc
    let totals = null;
    if (mode === '3doc') {
      const beforeVat = rows.reduce((sum, r) => sum + (r.totalPrice || 0), 0);
      const vat       = Math.round(beforeVat * 0.07 * 100) / 100;
      const net       = Math.round((beforeVat + vat) * 100) / 100;
      totals = { beforeVat, vat, net };
    }

    return { mode, rows, summary: { total, pass, fail }, totals };
  }

  // ตรวจหา code คล้ายกัน (E-XXXX vs A-XXXX ต่างกันแค่ prefix)
  function findSuspiciousCodes(rows) {
    const warnings = [];
    const codeMap = {}; // digits → [fullCode]
    for (const row of rows) {
      const m = row.code.match(/^[A-Z]-(\d+)$/);
      if (!m) continue;
      const digits = m[1];
      if (!codeMap[digits]) codeMap[digits] = [];
      codeMap[digits].push(row.code);
    }
    for (const [digits, codes] of Object.entries(codeMap)) {
      if (codes.length > 1) {
        warnings.push(`รหัส ${codes.join(' และ ')} มีตัวเลขเดียวกัน — อาจเป็น typo ในเอกสารต้นฉบับ`);
      }
    }
    return warnings;
  }

  return { checkConsistency, findSuspiciousCodes };
})();
