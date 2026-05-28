/**
 * Класс для эффективной работы с Column-oriented базой данных драгоценных камней.
 * Оптимизирован под обработку массивов данных свыше 20 000 записей.
 */
class Gems {
  // Пути к папкам с сертификатами (lab) и изображениями огранок (img)
  #uri = { lab: "lab", img: "img" };
  
  /**
   * Конструктор инициализирует базу и автоматически пересчитывает цены по курсу ЦБ РФ.
   * @param {Object} db - Исходный JSON-объект базы данных.
   * @param {string} uri - Базовый URL-адрес каталога.
   * @param {number} [rate] - Текущий курс доллара от ЦБ РФ.
   * @param {string} [date] - Дата обновления курса ЦБ РФ.
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
        // Если курс изменился более чем на 5%, пересчитываем столбец цен
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

  /**
   * Статический метод для асинхронной загрузки базы данных и актуального курса валют.
   * @param {string} url - Ссылка на JSON-файл каталога.
   * @returns {Promise<Gems>} Возвращает готовый и заполненный экземпляр класса Gems.
   */
  static async load(url) {
    try {
      const [db, br] = await Promise.all([
        fetch(url).then(d => d.ok ? d.json() : Promise.reject(new Error(`Статус ${d.status}`))).catch(e => { 
          throw new Error(`Ошибка загрузки каталога: ${e.message}`);
        }),
        fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(d => d.ok ? d.json() : {}).catch(e => {
          console.warn("Ошибка загрузки курсов ЦБ РФ:", e);
          return {};
        })
      ]);

      const uri = url.substring(0, url.lastIndexOf("/") + 1);
      return new Gems(db, uri, br?.Valute?.USD?.Value, br?.Date);
    } catch (e) {
      console.error("[Gems] error:", e.message);
      throw e;
    }
  }

  /**
   * Внутренний приватный метод получения сырого или расшифрованного значения ячейки.
   * @private
   */
  #val(col, row, raw) {
    return (!(col = this.columns?.[col]) || (row = col.rows[row]) === null) ? null : (raw || !col.enum) ? row : col.enum[row];
  }

  /**
   * Возвращает понятное человеческое название (заголовок) указанной колонки.
   * @param {string} col - Название колонки (например, 'price', 'form').
   * @returns {string} Русский или английский заголовок колонки.
   */
  getTitle(col) {
    return this.columns[col]?.title || "";
  }

  /**
   * Возвращает справочник (массив перечислений/enum) для указанной колонки.
   * @param {string} col - Название колонки.
   * @returns {Array|null} Массив текстовых значений или null, если колонка числовая.
   */
  getEnum(col) { 
    return (col = this.columns?.[col]) && col.enum || null; 
  }

  /**
   * Быстрое получение значения конкретной ячейки по имени колонки и индексу строки.
   * @param {string} col - Название колонки.
   * @param {number} row - Порядковый индекс строки (от 0 до rowsCount).
   * @param {boolean} [raw=false] - Если true, вернет ID из enum вместо текста.
   * @returns {*} Значение ячейки (число, строка или null).
   */
  getValue(col, row, raw) { 
    return (row < 0 || row >= this.rowsCount) ? null : this.#val(col, row, raw);
  }

  /**
   * Собирает полноценный "тяжёлый" объект товара (камня) со всеми свойствами и путями к изображениям.
   * @param {number} row - Порядковый индекс строки.
   * @returns {Object|null} Объект камня со свойством `_index`, ссылками `labLogo` и `image`.
   */
  getItem(row) {
    if (row < 0 || row >= this.rowsCount) return null;
    const i = { _index: row };
    for (const c in this.columns) i[c] = this.#val(c, row);
    
    // Автоматическая сборка путей к картинкам
    i.labLogo = i.lab ? `${this.#uri.lab}/${i.lab}.png` : "";
    i.image = i.form ? `${this.#uri.img}/${encodeURIComponent(i.form)}.png` : "";
    return i;
  }

  /**
   * Массово превращает переданный список индексов строк в массив полноценных объектов товаров.
   * @param {Array<number>} rows - Массив индексов строк (например, результат фильтрации).
   * @returns {Array<Object>} Массив готовых объектов камней.
   */
  getItems(rows) { 
    return rows.map(r => this.getItem(r)); 
  }

  /**
   * Находит порядковые индексы строк в базе по их текстовым или числовым ID.
   * @param {...(string|number)} ids - Перечень искомых уникальных идентификаторов.
   * @returns {Array<number>|null} Массив найденных индексов строк.
   */
  getIDs(...ids) {
    const rows = this.columns?.id?.rows;
    if (!rows) return null;
    const idSet = new Set(ids); 
    const is = [];
    for (let i = 0; i < rows.length; i++) {
      if (idSet.has(rows[i])) {
        is.push(i);
        idSet.delete(rows[i]);
        if (idSet.size == 0) break;
      }
    }
    return is;
  }

  /**
   * Высокопроизводительный фильтр базы данных. Сканирует колонки и сопоставляет условия.
   * @param {Object} filterColumns - Объект с фильтрами вида: `{ имяКолонки: значение | [значения] | {min, max} }`
   * @param {string} [sortBy] - Имя колонки, по которой нужно отсортировать результат.
   * @param {boolean} [desc=false] - Сортировка по убыванию (true) или возрастанию (false).
   * @returns {Array<number>} Массив индексов строк, прошедших условия фильтрации.
   */
  filter(filterColumns, sortBy, desc) {
    const matches = [];
    const activeFilters = [];
    
    // Предварительная компиляция условий для исключения проверок типов внутри главного цикла
    for (const colName in filterColumns) {
      const targetVal = filterColumns[colName];
      const colRows = this.columns[colName]?.rows;
      if (!colRows) continue;
      
      if (typeof targetVal === 'number') {
        activeFilters.push({ data: colRows, check: (val) => val === targetVal });
      } else if (Array.isArray(targetVal)) {
        const targetSet = new Set(targetVal); 
        activeFilters.push({ data: colRows, check: (val) => targetSet.has(val) });
      } else if (targetVal && (typeof targetVal === 'object')) {
        const min = typeof targetVal.min === 'number' ? targetVal.min : -Infinity;
        const max = typeof targetVal.max === 'number' ? targetVal.max : Infinity;
        activeFilters.push({ data: colRows, check: (val) => val >= min && val <= max });
      }
    }
    
    const filtersCount = activeFilters.length;
    
    // Быстрый линейный перебор строк
    for (let i = 0; i < this.rowsCount; i++) {
      let isMatch = true;
      for (let f = 0; f < filtersCount; f++) {
        const filter = activeFilters[f];
        const cellVal = filter.data[i];
        if (typeof cellVal !== 'number' || !filter.check(cellVal)) {
          isMatch = false;
          break; 
        }
      }
      if (isMatch) matches.push(i);
    }
    
    // Эффективная сортировка индексов по срезу данных указанной колонки
    if (sortBy && matches.length > 1) {
      const sortData = this.columns[sortBy]?.rows;
      if (sortData) {
        if (desc) matches.sort((a, b) => sortData[b] - sortData[a]);
        else matches.sort((a, b) => sortData[a] - sortData[b]);
      }
    }
    return matches;
  }

  /**
   * Хелпер пагинации. Нарезает массив индексов и собирает объекты только для текущей страницы.
   * Исключает повторные пересчеты тяжелых фильтров при переключении страниц.
   * @param {Array<number>} filteredIndexes - Полный массив индексов, возвращенный методом `filter()`.
   * @param {number} [page=1] - Номер запрашиваемой страницы (начиная с 1).
   * @param {number} [pageSize=20] - Количество элементов на странице.
   * @returns {Object} Объект с массивом готовых элементов `items` и метаданными страниц (`totalPages`, `totalCount`).
   */
  getPage(filteredIndexes, page = 1, pageSize = 20) {
    if (!Array.isArray(filteredIndexes)) return { items: [], totalPages: 0, totalCount: 0 };

    const totalCount = filteredIndexes.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    
    const pageIndexes = filteredIndexes.slice(start, end);
    
    return {
      items: this.getItems(pageIndexes), 
      totalCount,
      totalPages,
      currentPage
    };
  }
}

// Инициализация глобального процесса загрузки базы данных
window.gemsPromise = Gems.load("https://citygems.ru/db/gems.json");
