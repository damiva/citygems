/**
 * Gems — основной класс для управления каталогом.
 * Использует поколоночное хранение (column-oriented) для мгновенной обработки тысяч записей.
 */
class Gems {
  #uri = { lab: "lab", img: "img" };
  
  /**
   * @param {Object} db - Данные из JSON.
   * @param {string} uri - Базовый путь к медиа-файлам.
   * @param {number} [rate] - Актуальный курс USD.
   * @param {string} [date] - Дата курса.
   */
  constructor(db, uri, rate, date) {
    Object.assign(this, db);
    if (uri) {
      this.#uri.lab = uri + this.#uri.lab;
      this.#uri.img = uri + this.#uri.img;
    }
    if (rate && date) {
      const cleanDate = date.split("T")[0];
      if (!this.date || cleanDate > this.date) {
        const d = rate / (this.rate || 1);
        const c = this.columns?.price;
        if (c && !c.enum && Array.isArray(c.rows) && (d < 0.90 || d > 1.05)) {
          for (let i = 0; i < this.rowsCount; i++) {
            c.rows[i] = Math.round(c.rows[i] * d / 10) * 10;
          }
          this.rate = rate;
          this.date = cleanDate;
        }
      }
    }
  }

  /** Статический метод для параллельной загрузки базы и данных ЦБ РФ */
  static async _load(url) {
    try {
      const [db, br] = await Promise.all([
        fetch(url).then(d => d.ok ? d.json() : Promise.reject(new Error(`Ошибка ${d.status}`))),
        fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(d => d.ok ? d.json() : {}).catch(() => ({}))
      ]);
      const uri = url.substring(0, url.lastIndexOf("/") + 1);
      return new Gems(db, uri, br?.Valute?.USD?.Value, br?.Date);
    } catch (e) {
      throw new Error(`Ошибка загрузки каталога: ${e.message}`);
    }
  }

  /** Получить значение конкретного столбца и строки */
  getValue(col, row) {
    return this.columns?.[col]?.rows?.[row] ?? null;
  }

  /** Возвращает массив названий для колонок-перечислений (например, формы огранки) */
  getEnum(col) { return (this.columns?.[col])?.enum || null; }

  /** Собирает объект товара со всеми свойствами и путями к фото по индексу строки */
  getItem(row) {
    if (row < 0 || row >= this.rowsCount) return null;
    const i = { _index: row };
    for (const c in this.columns) {
      const col = this.columns[c];
      const val = col.rows[row];
      i[c] = (val === null || !col.enum) ? val : col.enum[val];
    }
    i.labLogo = i.lab ? `${this.#uri.lab}/${i.lab}.png` : "";
    i.image = i.form ? `${this.#uri.img}/${encodeURIComponent(i.form)}.png` : "";
    return i;
  }

  /** * Находит индексы строк по списку ID.
   * Гарантирует сохранение порядка элементов и длины выходного массива.
   * Если ID не найден, возвращает -1 на его позиции.
   */
  getIDs(...ids) {
    const rows = this.columns?.id?.rows;
    if (!rows || ids.length === 0) return ids.map(() => -1);
    const idToRowMap = new Map();
    for (let i = 0; i < rows.length; i++) {
      idToRowMap.set(rows[i], i);
    }
    return ids.map(id => idToRowMap.has(id) ? idToRowMap.get(id) : -1);
  }

  /** Массовое получение объектов по списку индексов */
  getItems(rows) { 
    return rows.map(r => this.getItem(r)).filter(item => item !== null); 
  }

  /**
   * Высокопроизводительный фильтр.
   * @param {Object} filterColumns - Объект настроек фильтрации.
   * @param {string} [sortBy] - Имя колонки для сортировки.
   * @param {boolean} [desc=false] - true для сортировки по убыванию.
   */
  filter(filterColumns, sortBy, desc) {
    const matches = [];
    const activeFilters = [];
    for (const colName in filterColumns) {
      const targetVal = filterColumns[colName];
      const colRows = this.columns[colName]?.rows;
      if (!colRows) continue;
      if (typeof targetVal === 'number') activeFilters.push({ data: colRows, check: (v) => v === targetVal });
      else if (Array.isArray(targetVal)) {
        const set = new Set(targetVal);
        activeFilters.push({ data: colRows, check: (v) => set.has(v) });
      } else if (targetVal && typeof targetVal === 'object') {
        const min = targetVal.min ?? -Infinity, max = targetVal.max ?? Infinity;
        activeFilters.push({ data: colRows, check: (v) => v >= min && v <= max });
      }
    }
    for (let i = 0; i < this.rowsCount; i++) {
      let isMatch = true;
      for (let f = 0; f < activeFilters.length; f++) {
        if (!activeFilters[f].check(activeFilters[f].data[i])) { isMatch = false; break; }
      }
      if (isMatch) matches.push(i);
    }
    if (sortBy && this.columns[sortBy]) {
      const d = this.columns[sortBy].rows;
      matches.sort((a, b) => desc ? d[b] - d[a] : d[a] - d[b]);
    }
    return new Pagenator(this, matches);
  }
}

/**
 * Pagenator — управляет нарезкой результатов фильтрации на страницы.
 */
class Pagenator {
  constructor(db, rows) {
    this._db = db;
    this.rows = rows || [];
    this.offset = 12; // Количество товаров на странице
    this.pages = Math.ceil(this.rows.length / this.offset);
  }
  /** Возвращает объекты товаров для указанной страницы */
  get(page = 1) {
    const total = this.rows.length;
    if (total === 0) return [];
    const currentPage = Math.max(1, Math.min(this.pages, Number(page) || 1));
    const start = (currentPage - 1) * this.offset;
    return this._db.getItems(this.rows.slice(start, start + this.offset));
  }
}

/**
 * Cart — управление корзиной с привязкой к ID товаров и LocalStorage.
 */
class Cart {
  #storKey = "citygems_cart";
  #orderURL = "/order.html"
  
  /**
   * @param {Gems} db - Экземпляр базы данных
   * @param {Function} [onChange] - Функция обратного вызова, вызывается при любом изменении корзины
   */
  constructor(db, onChange = null) {
    this._db = db;
    this.onChange = onChange; // Сохраняем коллбэк
    this.items = new Map();
    this._load();
  }

  _save() {
    if (this.items.size < 1) {
      localStorage.removeItem(this.#storKey);
    } else {
      const rawData = {
        id: Array.from(this.items.keys()),
        qt: Array.from(this.items.values()),
        rt: this._db.rate,
        dt: this._db.date
      };
      localStorage.setItem(this.#storKey, JSON.stringify(rawData));
    }
  }

  _load() {
    let dataStr = localStorage.getItem(this.#storKey);
    this.items.clear();
    if (!dataStr) return;
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed && Array.isArray(parsed.id) && Array.isArray(parsed.qt) && parsed.id.length === parsed.qt.length) {
        const activeIndexes = this._db.getIDs(...parsed.id);        
        parsed.id.forEach((id, index) => {
          const dbIndex = activeIndexes[index];
          if (dbIndex !== -1) {
            this.items.set(id, parsed.qt[index]);
          }
        });
        this._save();
      } else {
        localStorage.removeItem(this.#storKey);
      }
    } catch (e) {
      localStorage.removeItem(this.#storKey);
    }
  }

  /** Добавляет товар или обновляет его количество. При qty=0 удаляет */
  set(itemIndex, qty = 1) {
    const id = this._db.columns.id.rows[itemIndex];
    if (!id) return;
    if (qty > 0) {
      this.items.set(id, qty);
    } else {
      this.items.delete(id);
    }
    this._save();
    if (typeof this.onChange === "function") {
      this.onChange(this.count);
    }
  }

  /** Получить количество конкретного товара в корзине */
  get(id) { return this.items.get(id) || 0 }
  
  /** Возвращает список полных объектов товаров в корзине (теперь как геттер) */
  get list() {
    const ids = Array.from(this.items.keys());
    const rowIndexes = this._db.getIDs(...ids).filter(idx => idx !== -1);
    return rowIndexes.map(idx => {
      const item = this._db.getItem(idx);
      item.qty = this.items.get(item.id);
      return item;
    });
  }

  /** Возвращает общее количество уникальных позиций в корзине */
  get count() { return this.items.size; }

  /** генерирование URL заказа */
  get toURL() {
    let q = [`on${Math.floor((this._db.date ? new Date(this._db.date).getTime() : Date.now()) / 86400000) - 20600}=${this._db.rate}`];
    for (const [id, qt] of this.items.entries()) q.push(`${id}=${qt}`);
    return `${this.#orderURL}?${q.join("&")}`;
  }
  
  /** декодирование URL заказа */
  static parseURL(url){
    const r = {date: "", rate: 0, ids: [], qts: []};
    const u = new URL(url);
    for (const [k, v] of u.searchParams.entries())
      if (k.indexOf("on") === 0) {
        r.date = new Date(((k && parseInt(k) || 0) + 20600) * 86400000).toISOString().split("T")[0];
        r.rate = parseFloat(v);
      } else {
        r.ids.push(parseInt(k) || 0);
        r.qts.push(parseInt(v) || 0);
      }
    return r;
  }
}

window.gemsPromise = Gems._load("https://citygems.ru/db/gems.json");