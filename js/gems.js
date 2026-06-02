/**
 * @typedef {Object} GemColumn
 * @description Описание структуры отдельной колонки базы данных драгоценных камней.
 * @property {string} title - Красивое отображаемое название колонки (например, "Вес", "Цвет")
 * @property {string} type - Тип данных в колонке ("id", "enum", "number", "money", "string")
 * @property {string} [unit] - Единица измерения (например, "ct", "₽", "$")
 * @property {string[]} [map] - Массив соответствий для типов "enum"
 * @property {Array<any>} rows - Массив сырых плоских данных для каждой строки таблицы
 */

/**
 * @typedef {Object} GemsSchema
 * @description Описание колонок, которые будут присутствовать в каталоге драгоценных камней:
 * @property {GemColumn} id - Уникальный номер камня (тип: "id")
 * @property {GemColumn} lab - Лаборатория, выдавшая сертификат (GIA, IGI, HRD) (тип: "enum")
 * @property {GemColumn} shape - Форма огранки камня (Круг, Овал, Груша...) (тип: "enum")
 * @property {GemColumn} weight - Вес камня в каратах (тип: "number", unit: "ct")
 * @property {GemColumn} color - Категория цвета камня (D, E, F...) (тип: "enum")
 * @property {GemColumn} clarity - Категория чистоты камня (IF, VVS1, VS2...) (тип: "enum")
 * @property {GemColumn} cut - Качество огранки (ID, EX, VG...) (тип: "enum")
 * @property {GemColumn} polish - Качество полировки (EX, VG...) (тип: "enum")
 * @property {GemColumn} simmetry - Качество симметрии (EX, VG...) (тип: "enum")
 * @property {GemColumn} size1 - Физическая длина камня в мм (тип: "number")
 * @property {GemColumn} size2 - Физическая ширина камня в мм (тип: "number")
 * @property {GemColumn} size3 - Физическая глубина камня в мм (тип: "number")
 * @property {GemColumn} price - Базовая стоимость камня в долларах США (тип: "money", unit: "$")
 */

/**
 * Gems — Высокопроизводительная колоночная база данных драгоценных камней.
 * Оптимизирована для работы в браузере с тысячами строк. Минимизирует потребление памяти,
 * лениво форматирует данные "на лету" с помощью единого статического Proxy.
 */
class Gems {
  #uri = { lab: "lab", img: "img" };
  rate = { val: 1, date: null };

  // Единый статический обработчик для всех колонок базы данных (вызывает ленивые вычисления)
  static #column = {
    get(target, prop) {
      const i = Number(prop);
      if (isNaN(i))
        return target[prop];
      if (typeof target.get == "function")
        return target.get(i);
      if (target.type === "enum")
        return target.map ? target.map[target.rows[i]] : target.rows[i];
      if (target.type === "money" && target.rate)
        return Math.round(target.rows[i] * target.rate.val / 10) * 10;
      return target.rows[i];
    }
  };

  // Единый статический обработчик для сборки полноценного объекта камня на лету по индексу строки
  static #item = {
    get(target, prop) {
      const i = Number(prop);
      if (isNaN(i)) return Reflect.get(target, prop);      
      let o = { _index: i };
      for (const k in target) {
        if (target[k]?.type) {
          const v = target[k][i];
          if (v !== undefined && v !== null) o[k] = v;
        }
      }
      return o;
    }
  };

  /**
   * @param {Object} db - Сырой объект базы данных из JSON
   * @param {string} [uri] - Базовый URL-адрес для относительных путей картинок
   */
  constructor(db, uri) {
    if (uri) {
      this.#uri.lab = uri + this.#uri.lab;
      this.#uri.img = uri + this.#uri.img;
    }
    this.length = db.id.rows.length;    
    this.rate.val = db.rate || 1;
    this.rate.date = db.date ? new Date(db.date) : new Date();
    if (db.size1 && !db.sizes) {
      db.sizes = {
        title: "Размеры", 
        type: "string", 
        unit: db.size1.unit,
        rows: ["size1", "size2", "size3"].map(k => db[k]?.rows || null).filter(v => v),
        get: function(i) { 
          return this.rows.map(r => r[i].toLocaleString("ru-RU", {minimumFractionDigits: 2, maximumFractionDigits: 2})).join(" × ");
        } 
      };
    }
    for (const k in db) {
      if (db[k]?.type) {
        switch (db[k].type) {
          case "money":
            db[k].rate = this.rate;
            db[k].unit = "₽";
          case "number":
            db[k].isNum = true;
            break;
          case "id":
            db[k].map = new Map();
            for (let i = 0; i < this.length; i++) db[k].map.set(db[k].rows[i], i);
            db[k].indexOf = function(id) { return this.map.has(id) ? this.map.get(id) : -1 };
        }
        this[k] = new Proxy(db[k], Gems.#column);
      }
    }
    return new Proxy(this, Gems.#item);
  }

  /**
   * Асинхронный загрузчик базы с автоматическим получением актуального курса ЦБ РФ.
   */
  static async loadGems(url, rate, date) {
    const uri = url.slice(0, url.lastIndexOf("/") + 1);
    const gemsPromise = fetch(url).then(d => {
      if (d.ok) return d.json();
      else throw new Error(`Get gems error: ${d.status} ${d.statusText}`);
    });
    if (rate) {
      const db = await gemsPromise;
      db.rate = rate;
      db.date = date || new Date().toISOString().split('T')[0];
      return new Gems(db, uri);
    }
    const [db, cb] = await Promise.all([
      gemsPromise,
      fetch("https://www.cbr-xml-daily.ru/daily_json.js").then(d => {
        if (d.ok) return d.json();
        else throw new Error(d.statusText);
      }).then(d => {
        if (d.Valute?.USD?.Value) return {rate: d.Valute.USD.Value, date: d.Date || ""};
        else throw new Error("unknown structure of data received");
      }).catch(e => {
        console.warn("Get CB RF rates error:", e);
        return null;
      })
    ]);
    const sk = "citygems_rate";
    const ls = JSON.parse(localStorage.getItem(sk) || "null");
    if (ls && ls.rate) {
      db.rate = ls.rate;
      db.date = ls.date;
    }
    if (cb && cb.rate && (!db.rate || (cb.d = cb.rate / db.rate) < 0.90 || cb.d > 1.05)) {
      db.rate = cb.rate;
      db.date = cb.date;
    }
    if (!db.rate) throw new Error("There is no available rates for prices!");
    if (!ls || ls.rate != db.rate) localStorage.setItem(sk, JSON.stringify({rate: db.rate, date: db.date || undefined}));
    return new Gems(db, uri);
  }

  /**
   * Быстрая фильтрация и сортировка на уровне индексов строк.
   */
  filter(setCols, sortBy = "price", desc = false) {
    let result = Array.from(this.id.rows.keys());
    if (setCols && Object.keys(setCols).length > 0) {
      result = result.filter(i => {
        for (const [colKey, rule] of Object.entries(setCols)) {
          const col = this[colKey];
          if (!col) continue;
          const val = col[i];
          if (Array.isArray(rule)) {
            if (!rule.includes(val)) return false;
          } else if (typeof rule === 'object' && rule !== null) {
            if (rule.min !== undefined && val < rule.min) return false;
            if (rule.max !== undefined && val > rule.max) return false;
          } else {
            if (val !== rule) return false;
          }
        }
        return true;
      });
    }
    const sortCol = this[sortBy];
    if (sortCol) {
      result.sort((a, b) => {
        const valA = sortCol[a];
        const valB = sortCol[b];
        return desc ? valB - valA : valA - valB;
      });
    }
    return new Pagenator(this, result);
  }
}

/**
 * Pagenator — Класс постраничной разбивки данных.
 */
class Pagenator {
  static #page = {
    get(target, prop) {
      const p = Number(prop);
      if (isNaN(p)) return target[prop];
      target.page = Math.max(1, Math.min(target.pages, p));
      const start = (target.page - 1) * target.offset;
      return target.indices.slice(start, start + target.offset).map(i => target.gems[i]);
    }
  };
  constructor(gems, indices) {
    this.gems = gems;
    this.indices = indices || [];
    this.offset = 12;
    this.page = 1;
    return new Proxy(this, Pagenator.#page);
  }
  get total() { return this.indices.length; }
  get pages() { return Math.ceil(this.total / this.offset); }
  get items()  { return this.indices; }
  get next()  { return this[this.page + 1]; }
  get prev()  { return this[this.page - 1]; }
}

/**
 * Cart — Реактивный контроллер корзины покупок.
 */
class Cart {
  #storKey = "citygems_cart";
  #map = new Map();

  constructor(gems, arg = null) {
    this.gems = gems;    
    if (typeof arg === "string") {
      this.#storKey = null;
      const ord = Cart.parseURL(arg);
      this.gems.rate = {val: ord?.rate || 1, date: new Date(ord?.date || null)};
      if (ord?.items) ord.items.forEach(i => this.#map.set(i.id, i.qt));
    } else {
      this.onChange = arg;
      this._load();
    }
  }

  _save() {
    if (!this.#storKey) return;
    if (this.#map.size < 1) {
      localStorage.removeItem(this.#storKey);
    } else {
      const rawData = {
        id: Array.from(this.#map.keys()),
        qt: Array.from(this.#map.values()),
      };
      localStorage.setItem(this.#storKey, JSON.stringify(rawData));
    }
    if (typeof this.onChange === "function") this.onChange(this.count);
  }

  _load() {
    if (!this.#storKey) return;
    const dataStr = localStorage.getItem(this.#storKey);
    this.#map.clear();
    if (!dataStr) return;

    try {
      const parsed = JSON.parse(dataStr);
      if (parsed?.id && Array.isArray(parsed.id)) {
        parsed.id.forEach((id, index) => {
          if (this.gems.id.indexOf(id) >= 0) {
            this.#map.set(id, parsed.qt[index] || 1);
          }
        });
        if (this.#map.size !== parsed.id.length) this._save();
      }
    } catch (e) {
      localStorage.removeItem(this.#storKey);
    }
  }

  set(rowIndex, qty = 1) {
    const id = this.gems.id[rowIndex];
    if (!id) return;
    if (qty > 0) {
      this.#map.set(id, qty);
    } else {
      this.#map.delete(id);
    }
    this._save();
  }

  clear() {
    this.#map.clear();
    this._save();
  }  

  get(id) { return this.#map.get(id) || 0; }

  get items() {
    const r = [];
    for (const [id, qty] of this.#map.entries()) {
      const rowIdx = this.gems.id.indexOf(id);
      if (rowIdx >= 0) {
        const i = this.gems[rowIdx];
        i.qty = qty;
        r.push(i);
      }
    }
    return r;
  }
  get count() { return this.#map.size; }

  get uri() {
    const ts = this.gems.date instanceof Date ? this.gems.date.getTime() : (this.gems.date ? new Date(this.gems.date).getTime() : Date.now());
    const ds = Math.floor(ts / 86400000) - 20600;
    const ps = new URLSearchParams({ [`on${ds}`]: this.gems.rate });
    for (const [id, qt] of this.#map) ps.append(id, qt);
    return ps.toString();
  }
  
  static parseURL(urlStr) {
    const r = { date: null, rate: 0, items: [] };
    const query = urlStr.includes('?') ? urlStr.split('?')[1] : urlStr;
    const params = new URLSearchParams(query);
    for (const [k, v] of params.entries()) {
      if (k.startsWith("on")) {
        const dayOffset = parseInt(k.substring(2)) || 0;
        r.date = new Date((dayOffset + 20600) * 86400000);
        r.rate = parseFloat(v);
      } else {
        r.items.push({ id: parseInt(k), qt: parseInt(v) || 1 });
      }
    }
    return r;
  }

  /**
   * Экспорт содержимого корзины в csv (что б в Excel: bom = true, что б в русский Excel: ru = true).
   */
  toCSV(bom, ru) {
    const cols = ["id", "lab", "shape", "weight", "color", "clarity", "cut", "polish", "simmetry", "sizes", "price"];
    const sep = ru ? ";" : ",";
    const ln = bom === undefined ? "\n" : "\r\n";
    const val = (v, sizes) => {
      if (v === undefined || v === null) return '';
      return ru && !isNaN(v) && v !== '' ? v.toString().replace('.', ',') : sizes && !ru ? v.toString().replaceAll(',', '.') : v;
    };
    let sum = 0, qts = 0;
    let csv = Array("п/п", ...cols.map(k => this.gems[k]?.title || k), "Кол-во", "Сумма").join(sep) + ln;
    cols.push("qty");
    csv += this.items.map((i, n) => {
      const p = i.qty * Number(i.price || 0);
      sum += p;
      qts += i.qty;
      return Array(n + 1, ...cols.map(k => val(i[k], k == "sizes")), val(p)).join(sep);
    }).join(ln);
    csv += `${ln}${sep.repeat(cols.length - 1)}Итого:${sep}${val(qts)}${sep}${val(sum)}${ln}`;
    if (bom === undefined) return csv;
    if (bom) csv = "\uFEFF" + csv;
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' }); // Исправлен баг с массивом [csv]
  }
}