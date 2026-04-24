/* priceDB.js — ฐานข้อมูลราคาต่อหน่วย พร้อม localStorage cache */

const PriceDB = (() => {
  const STORAGE_KEY = 'zento_price_db';

  const DEFAULT_PRICES = {
    'A-1003': 1000,   'A-1110': 4650,   'A-1244': 680,    'A-1290': 1200,
    'A-1295': 1250,   'A-1296': 1500,   'A-1335': 2500,   'A-1487': 850,
    'A-1489': 380,    'A-1491': 850,    'A-1819': 650,    'A-1894': 180,
    'A-4135': 450,    'E-1028': 400,    'E-1057': 1850,   'E-1085': 380,
    'E-1127': 2850,   'E-1148': 1250,   'E-1185': 380,    'E-1251': 1250,
    'E-1313': 850,    'E-1315': 1850,   'E-1377': 1250,   'E-1378': 1800,
    'E-1382': 550,    'E-1383': 230,    'E-1411': 850,    'E-1456': 480,
    'E-1568': 530,    'E-1900': 1800,   'E-1990': 6800,   'E-1991': 1800,
    'E-2011': 1250,   'E-2013': 1850,   'E-2146': 2500,   'E-2195': 380,
    'E-2198': 1780,   'E-2234': 280,    'E-2238': 450,    'E-2307': 80,
    'E-2321': 850,    'E-2395': 850,    'E-2412': 1800,   'E-2437': 500,
    'E-2496': 18000,  'E-2651': 100,    'E-2652': 180,    'E-2653': 240,
    'E-2795': 680,    'E-2818': 580,    'E-2849': 8500,   'E-3009': 1880,
    'E-3048': 380,    'E-3219': 750,    'E-3222': 1850,   'E-3332': 140,
    'E-3465': 3500,   'E-3565': 580,    'E-3579': 18800,  'E-3604': 1800,
    'E-3759': 710,    'E-3842': 180,    'E-3860': 3800,   'E-3910': 1580,
    'E-3981': 13000,  'E-4020': 24000,  'E-4031': 1800,   'E-4137': 450,
    'E-4138': 350,    'E-4140': 250,    'E-4187': 250,    'E-4259': 2850,
    'E-4321': 1300,   'E-5067': 5800,   'E-5071': 380,    'E-5095': 9000,
    'E-5123': 1050,   'E-5127': 2850,   'E-5261': 490,    'E-5338': 1250,
    'E-5356': 80,     'E-5420': 3200,   'E-5481': 180,    'E-5832': 12900,
    'E-5843': 880,    'E-5892': 4400,   'E-5901': 25800,  'E-5992': 21500,
    'E-5993': 28800,
  };

  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  // ดึงราคา: custom ก่อน ถ้าไม่มีใช้ default
  function get(code) {
    const custom = loadCustom();
    if (custom[code] != null) return custom[code];
    if (DEFAULT_PRICES[code] != null) return DEFAULT_PRICES[code];
    return null;
  }

  // บันทึกราคาใหม่ที่ยังไม่เคยรู้จัก (ไม่ overwrite ของเดิม)
  function updateFromRows(rows) {
    const custom = loadCustom();
    let changed = false;
    for (const row of rows) {
      if (!row.code || !row.price || row.price <= 0) continue;
      if (DEFAULT_PRICES[row.code] != null) continue; // มีใน default แล้ว ไม่ต้องบันทึก
      if (custom[row.code] != null) continue;         // มีใน custom แล้ว ไม่ overwrite
      custom[row.code] = row.price;
      changed = true;
    }
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }

  // ดึงทั้งหมด: { code, price, name, isDefault }
  function getAll() {
    const custom = loadCustom();
    const result = [];
    for (const [code, price] of Object.entries(DEFAULT_PRICES)) {
      result.push({ code, price, name: custom[code + '_name'] || '', isDefault: true });
    }
    for (const [key, val] of Object.entries(custom)) {
      if (key.endsWith('_name')) continue;
      if (DEFAULT_PRICES[key] != null) continue;
      result.push({ code: key, price: val, name: custom[key + '_name'] || '', isDefault: false });
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }

  // เพิ่ม/แก้ไขราคา (custom เท่านั้น สำหรับ default ก็อนุญาต overwrite ผ่าน modal)
  function set(code, price, name) {
    const custom = loadCustom();
    custom[code] = price;
    if (name) custom[code + '_name'] = name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }

  // ลบ custom entry
  function remove(code) {
    const custom = loadCustom();
    delete custom[code];
    delete custom[code + '_name'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }

  function isDefault(code) { return DEFAULT_PRICES[code] != null; }

  function count() {
    return getAll().length;
  }

  return { get, set, remove, getAll, isDefault, updateFromRows, count };
})();
