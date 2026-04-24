/* app.js — controller หลัก: upload → parse → check → render */

(() => {
  // ===== STATE =====
  let currentResult = null;
  let currentMeta   = null;

  // ===== ELEMENTS =====
  const uploadSection  = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const dropZone       = document.getElementById('drop-zone');
  const fileInput      = document.getElementById('file-input');
  const uploadError    = document.getElementById('upload-error');
  const warningBox     = document.getElementById('warning-box');

  // ===== UPLOAD EVENTS =====
  document.getElementById('btn-select').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
  });

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  });

  // ===== HANDLE FILES (รองรับหลายไฟล์) =====
  function handleFiles(files) {
    const xlsxFiles = Array.from(files).filter(f => f.name.endsWith('.xlsx'));
    if (xlsxFiles.length === 0) {
      showError('กรุณาเลือกไฟล์ .xlsx เท่านั้น');
      return;
    }
    showLoading();

    // อ่านทุกไฟล์ด้วย FileReader แบบ parallel
    const promises = xlsxFiles.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve({ name: file.name, buffer: e.target.result });
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    }));

    Promise.all(promises).then(results => {
      try {
        // parse ทุกไฟล์แล้ว merge
        const merged = { mode: '2doc', quote: [], ebik: [], summary: [], meta: {} };
        for (const { name, buffer } of results) {
          const parsed = Parser.parseFile(buffer);
          merged.ebik.push(...parsed.ebik);
          merged.summary.push(...parsed.summary);
          merged.quote.push(...parsed.quote);
          if (parsed.mode === '3doc') merged.mode = '3doc';
          // ใช้ meta จากไฟล์แรกที่มีข้อมูล
          if (!merged.meta.docId && parsed.meta.docId) merged.meta = parsed.meta;
        }

        if (merged.ebik.length === 0 && merged.summary.length === 0 && merged.quote.length === 0) {
          showUpload();
          showError('ไม่พบข้อมูลในไฟล์ — กรุณาตรวจสอบว่า sheet มีชื่อถูกต้อง (ใบเบิก / ใบเสนอราคา / ใบสรุป)');
          return;
        }

        const result = Checker.checkConsistency(merged);
        PriceDB.updateFromRows(result.rows);  // บันทึกราคาใหม่ที่ยังไม่รู้จัก
        currentResult = result;
        currentMeta   = merged.meta;

        // fallback: ใช้ชื่อไฟล์แรก
        if (!currentMeta.filename) {
          currentMeta.filename = xlsxFiles[0].name.replace('.xlsx', '');
        }
        if (!currentMeta.docId) {
          for (const f of xlsxFiles) {
            const m = f.name.match(/Q[A-Z]{2}\d{8}/);
            if (m) { currentMeta.docId = m[0]; break; }
          }
        }

        renderResults(result, currentMeta);
      } catch (err) {
        showUpload();
        showError('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
        console.error(err);
      }
    }).catch(err => {
      showUpload();
      showError('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
    });
  }

  // ===== RENDER RESULTS =====
  function renderResults(result, meta) {
    const { mode, rows, summary, totals } = result;
    const is3doc = mode === '3doc';

    // Doc info
    document.getElementById('doc-info').innerHTML =
      `<strong>${meta.docId || meta.filename || 'ไม่ระบุ'}</strong>` +
      (meta.company    ? `  |  ${meta.company}` : '') +
      (meta.machineCode ? `  |  TC: ${meta.machineCode}` : '') +
      (meta.date        ? `  |  วันที่ ${meta.date}` : '');

    // Mode badge
    const badge = document.getElementById('mode-badge');
    badge.textContent = is3doc ? '📄 3 ใบ (มีใบเสนอราคา)' : '📄 2 ใบ (ไม่มีใบเสนอราคา)';
    badge.className = is3doc ? 'mode-3doc' : 'mode-2doc';

    // Summary bar
    document.getElementById('summary-bar').innerHTML = `
      <div class="summary-card total">
        <div class="sc-num">${summary.total}</div>
        <div class="sc-label">รหัสทั้งหมด</div>
      </div>
      <div class="summary-card pass">
        <div class="sc-num">${summary.pass}</div>
        <div class="sc-label">✓ ผ่าน (ครบ ${is3doc ? '3' : '2'} เอกสาร)</div>
      </div>
      <div class="summary-card fail">
        <div class="sc-num">${summary.fail}</div>
        <div class="sc-label">❌ ไม่ผ่าน</div>
      </div>
    `;

    // Warnings (typo codes)
    const warnings = Checker.findSuspiciousCodes(rows);
    if (warnings.length > 0) {
      warningBox.innerHTML = '⚠️ <strong>พบรหัสที่น่าสงสัย:</strong><br>' + warnings.join('<br>');
      warningBox.hidden = false;
    } else {
      warningBox.hidden = true;
    }

    // Table headers
    const thead = document.getElementById('result-thead');
    if (is3doc) {
      thead.innerHTML = `<tr>
        <th class="col-no">ลำดับ</th>
        <th class="col-code">รหัสสินค้า</th>
        <th class="col-name">ชื่อสินค้า</th>
        <th class="col-qty">จำนวน<br>(ใบเบิก)</th>
        <th class="col-qty">จำนวน<br>(ใบเสนอราคา)</th>
        <th class="col-qty">จำนวน<br>(ใบสรุป)</th>
        <th>หน่วย</th>
        <th class="col-price">ราคา/หน่วย<br>(บาท)</th>
        <th class="col-total">ยอดรวม<br>(บาท)</th>
        <th class="col-note">หมายเหตุ</th>
      </tr>`;
    } else {
      thead.innerHTML = `<tr>
        <th class="col-no">ลำดับ</th>
        <th class="col-code">รหัสสินค้า</th>
        <th class="col-name">ชื่อสินค้า</th>
        <th class="col-qty">จำนวน<br>(ใบเบิก)</th>
        <th class="col-qty">จำนวน<br>(ใบสรุป)</th>
        <th>หน่วย</th>
        <th class="col-price">ราคา/หน่วย<br>(บาท)</th>
        <th class="col-total">ยอดรวม<br>(บาท)</th>
        <th class="col-note">หมายเหตุ</th>
      </tr>`;
    }

    // Table body
    const tbody = document.getElementById('result-tbody');
    let no = 1;
    tbody.innerHTML = rows.map(row => {
      if (is3doc) {
        return `<tr class="${row.rowClass}" data-status="${row.status === '✓' ? 'pass' : 'fail'}">
          <td class="col-no">${no++}</td>
          <td class="col-code">${esc(row.code)}</td>
          <td class="col-name">${esc(row.name)}</td>
          <td class="col-qty">${row.ebikQty || ''}</td>
          <td class="col-qty">${row.quoteQty || ''}</td>
          <td class="col-qty">${row.summaryQty || ''}</td>
          <td>${esc(row.unit)}</td>
          <td class="col-price">${row.price ? fmtNum(row.price) : ''}</td>
          <td class="col-total">${row.totalPrice ? fmtNum(row.totalPrice) : ''}</td>
          <td class="col-note">${esc(row.status)}</td>
        </tr>`;
      } else {
        return `<tr class="${row.rowClass}" data-status="${row.status === '✓' ? 'pass' : 'fail'}">
          <td class="col-no">${no++}</td>
          <td class="col-code">${esc(row.code)}</td>
          <td class="col-name">${esc(row.name)}</td>
          <td class="col-qty">${row.ebikQty || ''}</td>
          <td class="col-qty">${row.summaryQty || ''}</td>
          <td>${esc(row.unit)}</td>
          <td class="col-price">${row.price ? fmtNum(row.price) : ''}</td>
          <td class="col-total">${row.totalPrice ? fmtNum(row.totalPrice) : ''}</td>
          <td class="col-note">${esc(row.status)}</td>
        </tr>`;
      }
    }).join('');

    // Table footer (VAT) — 3doc only
    const tfoot = document.getElementById('result-tfoot');
    if (is3doc && totals) {
      const span = 7;
      tfoot.innerHTML = `
        <tr class="row-vat"><td colspan="${span}"></td><td>ยอดรวมก่อน VAT</td><td>${fmtNum(totals.beforeVat)}</td><td></td></tr>
        <tr class="row-vat"><td colspan="${span}"></td><td>VAT 7%</td><td>${fmtNum(totals.vat)}</td><td></td></tr>
        <tr class="row-vat"><td colspan="${span}"></td><td>ยอดสุทธิ</td><td>${fmtNum(totals.net)}</td><td></td></tr>
      `;
    } else {
      tfoot.innerHTML = '';
    }

    // Signature row (print only)
    document.getElementById('signature-row').innerHTML = `
      <span>ผู้ตรวจสอบ : ___________________________</span>
      <span>วันที่ตรวจ : ___________________________</span>
      <span>ตำแหน่ง : ___________________________</span>
    `;

    // Print header
    const ph = document.getElementById('print-header');
    ph.hidden = false;
    ph.innerHTML = `
      <h2>ผลตรวจสอบรายการอะไหล่</h2>
      <div class="ph-meta">บริษัท จตุโชติ เอ็นจิเนียริ่ง จำกัด  |  รหัสงาน: ${meta.jobCode || '-'}  |  เครื่องจักร: ${meta.machineCode || '-'}  |  วันที่: ${meta.date || '-'}</div>
      <div class="ph-meta">งานโอเวอร์ฮอล บริษัท ${meta.company || '-'}  /  เอกสาร ${meta.docId || '-'}</div>
      <div class="ph-summary">รวม ${summary.total} รหัส  |  ✓ ผ่าน ${summary.pass} รหัส  |  ❌ ไม่ผ่าน ${summary.fail} รหัส</div>
    `;

    showResults();
  }

  // ===== FILTER + SEARCH =====
  let activeFilter = 'all';
  let searchQuery  = '';

  function applyFilterSearch() {
    document.querySelectorAll('#result-tbody tr').forEach(tr => {
      const statusOk = activeFilter === 'all' || tr.dataset.status === activeFilter;
      const q = searchQuery.toLowerCase();
      const textOk = !q || tr.textContent.toLowerCase().includes(q);
      tr.classList.toggle('row-hidden', !(statusOk && textOk));
    });
  }

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilterSearch();
    });
  });

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    applyFilterSearch();
  });

  // ===== PRICE DB MODAL =====
  const modal = document.getElementById('pricedb-modal');

  function renderPriceDB(filter = '') {
    const q = filter.toLowerCase();
    const all = PriceDB.getAll().filter(r =>
      !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
    document.getElementById('modal-stats').textContent =
      `รหัสทั้งหมด ${PriceDB.count()} รายการ  |  แสดง ${all.length} รายการ`;
    document.getElementById('pricedb-tbody').innerHTML = all.map(r => `
      <tr>
        <td><strong>${esc(r.code)}</strong></td>
        <td>${esc(r.name)}</td>
        <td style="text-align:right">${fmtNum(r.price)}</td>
        <td>${r.isDefault ? '<span class="badge-default">ตั้งต้น</span>' : '<span class="badge-custom">กำหนดเอง</span>'}</td>
        <td>
          <button class="btn-edit-price" data-code="${esc(r.code)}" data-price="${r.price}" data-name="${esc(r.name)}">แก้ไข</button>
          ${!r.isDefault ? `<button class="btn-del-price" data-code="${esc(r.code)}">ลบ</button>` : ''}
        </td>
      </tr>
    `).join('');

    // bind edit/delete
    document.querySelectorAll('.btn-edit-price').forEach(btn => {
      btn.addEventListener('click', () => {
        const code  = btn.dataset.code;
        const price = parseFloat(prompt(`แก้ไขราคา "${code}" (บาท/หน่วย):`, btn.dataset.price));
        if (!isNaN(price) && price >= 0) {
          PriceDB.set(code, price, btn.dataset.name);
          renderPriceDB(document.getElementById('modal-search').value);
        }
      });
    });
    document.querySelectorAll('.btn-del-price').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(`ลบรหัส "${btn.dataset.code}" ออกจากฐานราคา?`)) {
          PriceDB.remove(btn.dataset.code);
          renderPriceDB(document.getElementById('modal-search').value);
        }
      });
    });
  }

  document.getElementById('btn-pricedb').addEventListener('click', () => {
    modal.hidden = false;
    document.getElementById('modal-search').value = '';
    document.getElementById('modal-add-form').hidden = true;
    renderPriceDB();
  });
  document.getElementById('btn-modal-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

  document.getElementById('modal-search').addEventListener('input', e => renderPriceDB(e.target.value));

  document.getElementById('btn-add-price').addEventListener('click', () => {
    document.getElementById('modal-add-form').hidden = false;
    document.getElementById('add-code').focus();
  });
  document.getElementById('btn-cancel-add').addEventListener('click', () => {
    document.getElementById('modal-add-form').hidden = true;
  });
  document.getElementById('btn-confirm-add').addEventListener('click', () => {
    const code  = document.getElementById('add-code').value.trim().toUpperCase();
    const name  = document.getElementById('add-name').value.trim();
    const price = parseFloat(document.getElementById('add-price').value);
    if (!code || isNaN(price) || price < 0) { alert('กรุณากรอกรหัสและราคาให้ถูกต้อง'); return; }
    PriceDB.set(code, price, name);
    document.getElementById('add-code').value = '';
    document.getElementById('add-name').value = '';
    document.getElementById('add-price').value = '';
    document.getElementById('modal-add-form').hidden = true;
    renderPriceDB(document.getElementById('modal-search').value);
  });

  // ===== EXPORT =====
  document.getElementById('btn-export').addEventListener('click', () => {
    if (currentResult && currentMeta) {
      Exporter.exportToExcel(currentResult, currentMeta);
    }
  });

  // ===== PRINT =====
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // ===== RESET =====
  document.getElementById('btn-reset').addEventListener('click', () => {
    fileInput.value = '';
    currentResult = null;
    currentMeta   = null;
    warningBox.hidden = true;
    showUpload();
  });

  // ===== STATE HELPERS =====
  function showUpload() {
    uploadSection.hidden  = false;
    loadingSection.hidden = true;
    resultsSection.hidden = true;
  }
  function showLoading() {
    uploadSection.hidden  = true;
    loadingSection.hidden = false;
    resultsSection.hidden = true;
    uploadError.hidden    = true;
  }
  function showResults() {
    uploadSection.hidden  = true;
    loadingSection.hidden = true;
    resultsSection.hidden = false;
  }
  function showError(msg) {
    uploadError.textContent = msg;
    uploadError.hidden = false;
  }

  // ===== UTILS =====
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtNum(n) {
    return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

})();
