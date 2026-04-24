/* exporter.js — สร้าง ผลตรวจสอบ.xlsx ด้วย SheetJS */

const Exporter = (() => {

  function fmt(n) {
    if (n === null || n === undefined || n === '') return '';
    return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function exportToExcel(checkerResult, meta) {
    const { mode, rows, summary, totals } = checkerResult;
    const is3doc = mode === '3doc';

    const wb = XLSX.utils.book_new();
    const wsData = [];

    // ===== HEADER ROWS =====
    wsData.push(['บริษัท จตุโชติ เอ็นจิเนียริ่ง จำกัด', '', '', '', '', '', 'วันที่', '', meta.date || '', '']);
    wsData.push(['รหัสงาน', '', meta.jobCode || '', '', '', '', '', '', '', '']);
    wsData.push(['รหัสเครื่องจักร', '', meta.machineCode || '', '', '', '', '', '', '', '']);
    wsData.push(['ผลตรวจสอบรายการอะไหล่', '', '', '', '', '', '', '', '', '']);
    wsData.push(['   แผนกซ่อมบำรุง ขอสรุปผลตรวจสอบรายการเบิกอะไหล่ เพื่อยืนยันความถูกต้องของรายการ ดังต่อไปนี้', '', '', '', '', '', '', '', '', '']);
    wsData.push([
      `   งานโอเวอร์ฮอล บริษัท ${meta.company || ''}  / หน่วยงาน อุดมสุข    เอกสาร ${meta.docId || ''}`,
      '', '', '', '', '', '', '', '', ''
    ]);
    wsData.push([]);
    wsData.push([
      `รวมรหัสสินค้าทั้งหมด ${summary.total} รหัส`, '', '',
      `ครบ ${is3doc ? '3' : '2'} เอกสาร ${summary.pass} รหัส`, '', '',
      `ไม่ครบ ${summary.fail} รหัส`, '', '', ''
    ]);
    wsData.push([]);

    // ===== TABLE HEADER =====
    if (is3doc) {
      wsData.push([
        'ลำดับ', 'รหัสสินค้า', 'ชื่อสินค้า',
        'จำนวน\n(ใบเบิก)', 'จำนวน\n(ใบเสนอราคา)', 'จำนวน\n(ใบสรุป)',
        'หน่วย', 'ราคาต่อหน่วย\n(บาท)', 'ยอดรวม\n(บาท)', 'หมายเหตุ'
      ]);
    } else {
      wsData.push([
        'ลำดับ', 'รหัสสินค้า', 'ชื่อสินค้า',
        'จำนวน\n(ใบเบิก)', 'จำนวน\n(ใบสรุป)',
        'หน่วย', 'หมายเหตุ'
      ]);
    }

    // ===== DATA ROWS =====
    let no = 1;
    for (const row of rows) {
      if (is3doc) {
        wsData.push([
          no++,
          row.code,
          row.name,
          row.ebikQty || '',
          row.quoteQty || '',
          row.summaryQty || '',
          row.unit,
          row.price ? fmt(row.price) : '',
          row.totalPrice ? fmt(row.totalPrice) : '',
          row.status,
        ]);
      } else {
        wsData.push([
          no++,
          row.code,
          row.name,
          row.ebikQty || '',
          row.summaryQty || '',
          row.unit,
          row.status,
        ]);
      }
    }

    // ===== VAT (3doc only) =====
    if (is3doc && totals) {
      wsData.push([]);
      wsData.push(['', '', '', '', '', '', '', 'ยอดรวมก่อน VAT', fmt(totals.beforeVat), '']);
      wsData.push(['', '', '', '', '', '', '', 'VAT 7%', fmt(totals.vat), '']);
      wsData.push(['', '', '', '', '', '', '', 'ยอดสุทธิ', fmt(totals.net), '']);
      wsData.push([]);
    } else {
      wsData.push([]);
    }

    wsData.push(['ผู้ตรวจสอบ : ___________________________', '', '', 'วันที่ตรวจ : ___________________________', '', '', 'ตำแหน่ง : ___________________________', '', '', '']);

    // ===== BUILD SHEET =====
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    if (is3doc) {
      ws['!cols'] = [
        {wch:6},{wch:14},{wch:48},{wch:11},{wch:13},{wch:11},{wch:8},{wch:16},{wch:16},{wch:38}
      ];
    } else {
      ws['!cols'] = [
        {wch:6},{wch:14},{wch:48},{wch:11},{wch:11},{wch:8},{wch:38}
      ];
    }

    // Merge title rows
    ws['!merges'] = [
      {s:{r:3,c:0}, e:{r:3,c:9}},
      {s:{r:4,c:0}, e:{r:4,c:9}},
      {s:{r:5,c:0}, e:{r:5,c:9}},
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'ผลตรวจสอบ');

    const filename = `ผลตรวจสอบ_${meta.docId || 'output'}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  return { exportToExcel };
})();
