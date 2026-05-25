const Gems = {
  initPromise: null, // Promise для ожидания готовности во внешних скриптах
  Columns: null,     // Колонки данных
  RowsCount: 0,      // Общее количество записей
  Currency: null,    // Информация о курсе валюты
  Date: null,        // Дата обновления каталога
  _uri: "",          // Базовый URL для относительных путей (картинок)

  async _init(url = 'https://citygems.ru/db/gems.json') {
    try {
      const [db, cbr] = await Promise.all([
        fetch(url).then(res => {
          if (!res.ok) throw new Error(`Ошибка загрузки каталога: ${res.status}`);
          return res.json();
        }).catch(err => {
          throw new Error(`Ошибка загрузки каталога: ${err.message}`);
        }),
        fetch('https://www.cbr-xml-daily.ru/daily_json.js')
          .then(res => res.json())
          .then(data => ({ rate: data.Valute.USD.Value, date: data.Date }))
          .catch(err => {
            console.warn('Не удалось загрузить курс ЦБ РФ. Используем базовый курс из каталога.', err);
            return null;
          })
      ]);

      // Проверяем актуальность курса и необходимость пересчета
      const currency = db.Currency;
      if (currency && cbr && cbr.rate && cbr.date > currency.Date) {
        const dif = cbr.rate / currency.Rate;
        const col = db.Columns[currency.Column];
        if (col && !col.Enum && (dif < 0.90 || dif > 1.05)) {
          console.log(`Курс изменился (x${dif.toFixed(2)}). Пересчитываем цены в рублях...`);
          col.Data = col.Data.map(v => Math.round(v * dif / 10) * 10);
          currency.Rate = cbr.rate;
          currency.Date = cbr.date;
        }
      }

      // Сохраняем состояние каталога
      this.Columns = db.Columns;
      this.RowsCount = db.RowsCount;
      this.Currency = currency;
      this.Date = db.Date || null;
      this._uri = url.substring(0, url.lastIndexOf("/") + 1);
      
      console.log(`[Gems] Каталог готов: записей: ${this.RowsCount}, курс: ${this.Currency ? this.Currency.Rate : 'не указан'} руб.`);
      return this;
    } catch (e) {
      console.error('Критическая ошибка при инициализации:', e);
      throw e;
    }
  },

  /**
   * Быстрое получение значения ячейки БЕЗ создания лишних объектов (нужно для фильтрации)
   */
  getValue(colName, rowIndex) {
    const col = this.Columns[colName];
    if (!col || rowIndex < 0 || rowIndex >= this.RowsCount) return null; 
    const rawValue = col.Data[rowIndex];
    return (col.Enum && Array.isArray(col.Enum)) ? col.Enum[rawValue] : rawValue;
  },

  /**
   * Ленивая сборка объекта только для одной строки на основе индекса.
   * Теперь красиво использует getValue для централизованного разрешения Enum.
   */
  getItem(rowIndex) {
    if (rowIndex < 0 || rowIndex >= this.RowsCount) return null;
    const item = { _index: rowIndex };
    Object.keys(this.Columns).forEach(k => {item[k] = this.getValue(k, rowIndex)});
    item.image = item['Форма'] ? `${this._uri}${item['Форма']}.jpg` : "";
    return item;
  },

  /**
   * Поиск и фильтрация по плоским массивам с пагинацией.
   * Объекты собираются только для отфильтрованного подмножества.
   */
  filter(exact = {}, ranges = {}, limit = 20, offset = 0) {
    const results = [];
    let skipped = 0;

    for (let i = 0; i < this.RowsCount; i++) {
      let matches = true;

      // 1. Проверка точных фильтров
      for (const colName in exact) {
        if (this.getValue(colName, i) !== exact[colName]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // 2. Проверка числовых диапазонов
      for (const colName in ranges) {
        const val = this.getValue(colName, i);
        if (typeof val === 'number') {
          const { min, max } = ranges[colName];
          if (min !== undefined && val < min) { matches = false; break; }
          if (max !== undefined && val > max) { matches = false; break; }
        }
      }

      // Если камень прошел все фильтры
      if (matches) {
        if (skipped < offset) {
          skipped++;
          continue;
        }
        results.push(this.getItem(i));
        if (results.length >= limit) break; 
      }
    }
    return results;
  },

  /**
   * Получить готовый список вариантов (Enum) для построения фильтров в UI.
   */
  getEnum(colName) {
    const col = this.Columns?.[colName];
    return (col && Array.isArray(col.Enum)) ? col.Enum : null;
  }
};

// Автоматический запуск при чтении скрипта
Gems.initPromise = Gems._init();

// Делаем объект глобально доступным
if (typeof window !== 'undefined') {
  window.Gems = Gems;
}