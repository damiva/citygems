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
    // Пересчет цен, если курс в базе устарел
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

  /** Статический метод для загрузки базы и данных ЦБ РФ */
  static async load(url) {
    try {
      const [db, br] = await Promise.all([
        fetch(url).then(d => d.ok ? d.json() : Promise.reject(new Error(`Ошибка ${d.status}`))),
        fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(d => d.ok ? d.json() : {}).catch(() => ({}))
      ]);
      const uri = url.substring(0, url.lastIndexOf("/") + 1);
      return new Gems(db, uri, br?.Valute?.USD?.Value, br?.Date);
    } catch (e) {
      throw new Error(`Ошибка загрузки: ${e.message}`);
    }
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

  /** Находит индексы строк по списку ID */
  getIDs(...ids) {
    const rows = this.columns?.id?.rows;
    if (!rows) return [];
    const idSet = new Set(ids);
    const result = [];
    for (let i = 0; i < rows.length; i++) {
      if (idSet.has(rows[i])) { result.push(i); idSet.delete(rows[i]); }
    }
    return result;
  }

  /** Массовое получение объектов по списку индексов */
  getItems(rows) { return rows.map(r => this.getItem(r)); }

  /**
   * Высокопроизводительный фильтр.
   * @param {Object} filterColumns - Объект настроек фильтрации:
   * - { weight: 1.5 } : Точное совпадение (вес строго 1.5).
   * - { form: [0, 2] } : Множественный выбор (индексы из enum, например Круг ИЛИ Принцесса).
   * - { price: { min: 100, max: 500 } } : Диапазон значений (от и до включительно).
   * @param {string} [sortBy] - Имя колонки для сортировки.
   * @param {boolean} [desc=false] - true для сортировки по убыванию.
   * @returns {Pagenator} Объект для управления постраничным выводом.
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
    return new Pagenator(this, matches); // Возвращаем пагинатор
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
    const currentPage = Math.max(1, Math.min(this.pages, page));
    const start = (currentPage - 1) * this.offset;
    return this._db.getItems(this.rows.slice(start, start + this.offset));
  }
}

/**
 * Cart — управление корзиной с привязкой к ID товаров и LocalStorage.
 */
class Cart {
  #key = "citygems_cart";
  constructor(db) {
    this._db = db;
    this.items = new Map(); // Храним как ID -> Количество
    this._load();
  }
  _save() {
    localStorage.setItem(this.#key, JSON.stringify(Array.from(this.items.entries())));
  }
  _load() {
    try {
      const raw = localStorage.getItem(this.#key);
      if (raw) this.items = new Map(JSON.parse(raw));
    } catch (e) { this.items = new Map(); }
  }
  /** Добавляет товар или обновляет его количество. При qty=0 удаляет */
  set(itemIndex, qty = 1) {
    const id = this._db.columns.id.rows[itemIndex];
    if (qty > 0) this.items.set(id, qty);
    else this.items.delete(id);
    this._save();
  }
  /** Возвращает список полных объектов товаров в корзине */
  list() {
    const ids = Array.from(this.items.keys());
    const rowIndexes = this._db.getIDs(...ids);
    return rowIndexes.map(idx => {
      const item = this._db.getItem(idx);
      item.qty = this.items.get(item.id);
      return item;
    });
  }
  get count() { return this.items.size; }
}

window.gemsPromise = Gems.load("https://citygems.ru/db/gems.json");