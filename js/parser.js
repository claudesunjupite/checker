/* parser.js — อ่าน Excel และ detect ประเภท sheet */

const Parser = (() => {

  // ===== SHEET TYPE DETECTION =====
  function detectSheetType(sheetName) {
    const n = sheetName.toLowerCase();
    if (n.includes('เสนอ') || n.includes('ราคา') || n.includes('quotation') || n.includes('quote')) return 'quote';
    if (n.includes('สรุป') || n.includes('summary')) return 'summary';
    if (n.includes('เบิก') || n.includes('คืน') || n.includes('withdraw') || /^sj\d+/i.test(sheetName)) return 'ebik';
    return 'unknown';
  }

  // ===== HELPER: แปลง sheet เป็น array of arrays =====
  function sheetToRows(ws) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const rows = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        row.push(cell ? String(cell.v ?? '').trim() : '');
      }
      rows.push(row);
    }
    return rows;
  }

  // ===== HELPER: หา header row (row ที่มี "รหัส") =====
  function findHeaderRow(rows, keywords) {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const joined = rows[i].join('|').toLowerCase();
      if (keywords.some(k => joined.includes(k))) return i;
    }
    return -1;
  }

  // ===== HELPER: แปลง string จำนวนเป็น number =====
  function toNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  // ===== HELPER: อ่าน meta จาก header rows =====
  function parseMeta(rows) {
    const meta = { docId: '', company: '', date: '', machineCode: '', jobCode: '' };
    for (const row of rows.slice(0, 15)) {
      const line = row.join(' ');
      // หา docId เช่น QTA69040114
      const docMatch = line.match(/Q[A-Z]{2}\d{8}/);
      if (docMatch) meta.docId = docMatch[0];
      // วันที่
      const dateMatch = line.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2}-\d{2}-\d{2}/);
      if (dateMatch && !meta.date) meta.date = dateMatch[0];
      // รหัสเครื่องจักร
      if (line.includes('TC') || line.includes('รหัสเครื่องจักร')) {
        const tcMatch = line.match(/TC\d+/);
        if (tcMatch && !meta.machineCode) meta.machineCode = tcMatch[0];
      }
      // รหัสงาน
      const jobMatch = line.match(/\d{2}\/\d{12}/);
      if (jobMatch && !meta.jobCode) meta.jobCode = jobMatch[0];
      // บริษัท SMC
      if (line.includes('SMC') && !meta.company) meta.company = 'SMC';
    }
    return meta;
  }

  // ===== PARSE QUOTE SHEET =====
  function parseQuoteSheet(ws) {
    const rows = sheetToRows(ws);
    const headerIdx = findHeaderRow(rows, ['รหัสสินค้า', 'item no', 'รหัส']);
    if (headerIdx < 0) return [];

    const header = rows[headerIdx];
    const colCode  = header.findIndex(h => /รหัสสินค้า|item no|รหัส/i.test(h));
    const colName  = header.findIndex(h => /ชื่อสินค้า|description|รายการ/i.test(h));
    const colQty   = header.findIndex(h => /จำนวน|qty|quantity/i.test(h));
    const colUnit  = header.findIndex(h => /หน่วย|unit/i.test(h));
    const colPrice = header.findIndex(h => /ราคา|price/i.test(h));

    const items = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const code = row[colCode] || '';
      if (!code || !code.match(/^[A-Z]-\d+/)) continue;
      items.push({
        code:  code.trim(),
        name:  colName  >= 0 ? row[colName]  || '' : '',
        qty:   colQty   >= 0 ? toNum(row[colQty])  : 0,
        unit:  colUnit  >= 0 ? row[colUnit]  || '' : '',
        price: colPrice >= 0 ? toNum(row[colPrice]) : 0,
      });
    }
    return items;
  }

  // ===== PARSE EBIK SHEET =====
  function parseEbikSheet(ws, sheetName) {
    const rows = sheetToRows(ws);
    const isReturn = sheetName.includes('คืน') || sheetName.includes('return');
    const headerIdx = findHeaderRow(rows, ['รหัส', 'รายการ', 'ลำดับ']);
    if (headerIdx < 0) return [];

    const header = rows[headerIdx];
    const colCode = header.findIndex(h => /^รหัส/i.test(h.trim()));
    const colName = header.findIndex(h => /รายการ|ชื่อ|description/i.test(h));
    const colQty  = header.findIndex(h => /จำนวน|qty/i.test(h));
    const colUnit = header.findIndex(h => /หน่วย|unit/i.test(h));

    const items = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const code = colCode >= 0 ? row[colCode] || '' : '';
      if (!code || !code.match(/^[A-Z]-\d+/)) continue;
      items.push({
        code:     code.trim(),
        name:     colName >= 0 ? row[colName]  || '' : '',
        qty:      colQty  >= 0 ? toNum(row[colQty]) : 0,
        unit:     colUnit >= 0 ? row[colUnit]  || '' : '',
        isReturn,
      });
    }
    return items;
  }

  // ===== PARSE SUMMARY SHEET =====
  function parseSummarySheet(ws) {
    const rows = sheetToRows(ws);
    const headerIdx = findHeaderRow(rows, ['รหัส', 'รายการ', 'ลำดับ']);
    if (headerIdx < 0) return [];

    const header = rows[headerIdx];
    const colCode = header.findIndex(h => /รหัส/i.test(h.trim()));
    const colName = header.findIndex(h => /รายการ|ชื่อ/i.test(h));
    const colQty  = header.findIndex(h => /จำนวน|qty/i.test(h));
    const colUnit = header.findIndex(h => /หน่วย|unit/i.test(h));

    const items = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const code = colCode >= 0 ? row[colCode] || '' : '';
      if (!code || !code.match(/^[A-Z]-\d+/)) continue;
      items.push({
        code: code.trim(),
        name: colName >= 0 ? row[colName] || '' : '',
        qty:  colQty  >= 0 ? toNum(row[colQty]) : 0,
        unit: colUnit >= 0 ? row[colUnit] || '' : '',
      });
    }
    return items;
  }

  // ===== MAIN PARSE FUNCTION =====
  function parseFile(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const result = { mode: '2doc', quote: [], ebik: [], summary: [], meta: {} };
    const allRows = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const type = detectSheetType(sheetName);
      const rows = sheetToRows(ws);
      allRows.push(...rows);

      if (type === 'quote') {
        result.quote.push(...parseQuoteSheet(ws));
        result.mode = '3doc';
      } else if (type === 'ebik') {
        result.ebik.push(...parseEbikSheet(ws, sheetName));
      } else if (type === 'summary') {
        result.summary.push(...parseSummarySheet(ws));
      }
    }

    result.meta = parseMeta(allRows);
    return result;
  }

  return { parseFile, detectSheetType };
})();
