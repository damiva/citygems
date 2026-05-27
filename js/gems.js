class Gems {
  #uri = {lab: "lab", img: "img"};
  
  constructor(db, uri, rate, date) {
    Object.assign(this, db);
    uri = uri || "";
    this.#uri.lab = uri + this.#uri.lab;
    this.#uri.img = uri + this.#uri.img;
    
    if (rate && date) {
      const cleanDate = date.split("T")[0];
      if (!this.date || cleanDate > this.date) {
        const d = rate / (this.rate || 1);
        const c = db.priceColumn && db.columns[db.priceColumn] || null;
        
        if (c && !c.enum && Array.isArray(c.data) && (d < 0.90 || d > 1.05)) {
          for (let i = 0; i < c.data.length; i++) {
            c.data[i] = Math.round(c.data[i] * d / 10) * 10;
          }
          this.rate = rate;
          this.date = cleanDate;
        }
      }
    }
  }

  static async load(url) {
    try {
      const [db, br] = await Promise.all([
        // Исправлено: добавлена валидация статуса ответа сервера d.ok
        fetch(url).then(d => d.ok ? d.json() : Promise.reject(new Error(`Статус ${d.status}`))).catch(e => { 
          throw new Error(`Ошибка загрузки каталога: ${e.message}`);
        }),
        // Исправлено: возвращаем пустой объект {}, чтобы br?.Valute не падал в случае ошибки сети
        fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(d => d.ok ? d.json() : {}).catch(e => {
          console.warn("Ошибка загрузки курсов ЦБ РФ:", e);
          return {};
        })
      ]);

      // Исправлено: корректный поиск последнего слэша для формирования базового пути
      const uri = url.substring(0, url.lastIndexOf("/") + 1);
      return new Gems(db, uri, br?.Valute?.USD?.Value, br?.Date);
    } catch (e) {
      console.error("[Gems] error:", e.message);
      throw e;
    }
  }

  // Приватный метод скрыт от внешнего кода сайта
  #val(col, row, raw) {
    return (!(col = this.columns?.[col]) || (row = col.data[row]) === null) ? null : (raw || !col.enum) ? row : col.enum[row];
  }

  getValue(col, row, raw) { 
    return (row < 0 || row >= this.rowsCount) ? null : this.#val(col, row, raw);
  }

  getItem(row) {
    if (row < 0 || row >= this.rowsCount) return null;
    const i = { _index: row };
    for (const c in this.columns) i[c] = this.#val(c, row);
    
    if (i.lab = i['Сертификат'] || "") i.lab = `${this.#uri.lab}/${i.lab}.png`;
    if (i.image = i['Форма'] || "") i.image = `${this.#uri.img}/${encodeURIComponent(i.image)}.png`;
    return i;
  }

  getItems(rows) { 
    return rows.map(r => this.getItem(r)); 
  }

  getEnum(col) { 
    return (col = this.columns?.[col]) && col.enum || null; 
  }

  getIDs(...ids) {
    const data = this.idColumn && this.columns[this.idColumn]?.data || null;
    if (!data) return null;
    const idSet = new Set(ids); // Используем уникальное имя, чтобы не затирать аргумент
    const is = [];
    for (let i = 0; i < data.length; i++) {
      if (idSet.has(data[i])) {
        is.push(i);
        idSet.delete(data[i]);
        if (idSet.size == 0) break;
      }
    }
    return is;
  }

  filter(filterColumns, sortBy, desc) {
    const matches = [];
    const activeFilters = [];
    
    for (const colName in filterColumns) {
      const targetVal = filterColumns[colName];
      const colData = this.columns[colName]?.data;
      if (!colData) continue;
      
      if (typeof targetVal === 'number') {
        activeFilters.push({ data: colData, check: (val) => val === targetVal });
      } else if (Array.isArray(targetVal)) {
        const targetSet = new Set(targetVal); 
        activeFilters.push({ data: colData, check: (val) => targetSet.has(val) });
      } else if (targetVal && (typeof targetVal === 'object')) {
        const min = typeof targetVal.min === 'number' ? targetVal.min : -Infinity;
        const max = typeof targetVal.max === 'number' ? targetVal.max : Infinity;
        activeFilters.push({ data: colData, check: (val) => val >= min && val <= max });
      }
    }
    
    const filtersCount = activeFilters.length;
    
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
    
    if (sortBy && matches.length > 1) {
      const sortData = this.columns[sortBy]?.data;
      if (sortData) {
        if (desc) matches.sort((a, b) => sortData[b] - sortData[a]);
        else matches.sort((a, b) => sortData[a] - sortData[b]);
      }
    }
    return matches;
  }
}

// Инициализация глобального промиса
window.gemsPromise = Gems.load("https://citygems.ru/db/gems.json");
