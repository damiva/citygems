const Gems = {
  initPromise: null, // Promise для ожидания готовности во внешних скриптах
  Columns: null,     // Колонки данных
  RowsCount: 0,      // Общее количество записей
  Currency: null,    // Информация о курсе валюты
  Date: null,        // Дата обновления каталога
  _uri: "",          // Базовый URL для относительных путей (картинок)
  _ext: "png",       // Внутреннее расширение для всех файлов изображений (форм и сертификатов)

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
      
      // Определяем базовый путь (папку) для картинок на основе URL каталога
      this._uri = url.substring(0, url.lastIndexOf("/") + 1);
      
      console.log(`[Gems] Каталог готов: записей: ${this.RowsCount}, курс: ${this.Currency ? this.Currency.Rate : 'не указан'} руб.`);
      return this;
    } catch (e) {
      console.error('Критическая ошибка при инициализации:', e);
      throw e;
    }
  },

  /**
   * Быстрое получение значения ячейки БЕЗ создания лишних объектов
   */
  getValue(colName, rowIndex) {
    const col = this.Columns[colName];
    if (!col || rowIndex < 0 || rowIndex >= this.RowsCount) return null; 
    const rawValue = col.Data[rowIndex];
    return (col.Enum && Array.isArray(col.Enum)) ? col.Enum[rawValue] : rawValue;
  },

  /**
   * Ленивая сборка объекта только для одной строки на основе индекса.
   */
  getItem(rowIndex) {
    if (rowIndex < 0 || rowIndex >= this.RowsCount) return null;
    const item = { _index: rowIndex };
    Object.keys(this.Columns).forEach(k => {item[k] = this.getValue(k, rowIndex)});
    item.lab = item['Сертификат'] ? `${this._uri}${item['Сертификат']}.${this._ext}` : '';
    item.image = item['Форма'] ? `${this._uri}${item['Форма']}.${this._ext}` : '';
    return item;
  },

  /**
   * Мощный и быстрый метод фильтрации, поддерживающий мультивыбор и глобальную сортировку цен.
   * @param {Object} exact - Критерии точного совпадения. Значением может быть строка ИЛИ массив строк для мультивыбора.
   * @param {Object} ranges - Числовые диапазоны { 'Цена': {min, max} }
   * @param {string} sortBy - Тип сортировки: 'price_asc' (возрастание цены) или 'price_desc' (убывание цены)
   * @param {number} limit - Количество элементов на страницу
   * @param {number} offset - Смещение пагинации
   * @returns {Object} { items: Array, total: number } - массив объектов страницы и общее количество совпадений
   */
  filter(exact = {}, ranges = {}, sortBy = 'price_asc', limit = 20, offset = 0) {
    const matchingIndices = [];

    // 1. Фильтруем все индексы строк по плоским массивам в памяти
    for (let i = 0; i < this.RowsCount; i++) {
      let matches = true;

      // Проверка точных совпадений (поддерживает мультивыбор)
      for (const colName in exact) {
        const filterVal = exact[colName];
        if (filterVal === undefined || filterVal === null || filterVal === '') continue;

        const gemVal = this.getValue(colName, i);

        if (Array.isArray(filterVal)) {
          // Если передан массив (мультивыбор), значение камня должно быть в этом массиве
          if (filterVal.length > 0 && !filterVal.includes(gemVal)) {
            matches = false;
            break;
          }
        } else {
          // Иначе проверяем классическое одиночное совпадение
          if (gemVal !== filterVal) {
            matches = false;
            break;
          }
        }
      }
      if (!matches) continue;

      // Проверка числовых диапазонов
      for (const colName in ranges) {
        const val = this.getValue(colName, i);
        if (typeof val === 'number') {
          const { min, max } = ranges[colName];
          if (min !== undefined && val < min) { matches = false; break; }
          if (max !== undefined && val > max) { matches = false; break; }
        }
      }

      if (matches) {
        matchingIndices.push(i);
      }
    }

    // 2. Сортируем отфильтрованные индексы по цене
    const priceCol = this.Columns['Цена'];
    if (priceCol && Array.isArray(priceCol.Data)) {
      if (sortBy === 'price_asc') {
        matchingIndices.sort((a, b) => priceCol.Data[a] - priceCol.Data[b]);
      } else if (sortBy === 'price_desc') {
        matchingIndices.sort((a, b) => priceCol.Data[b] - priceCol.Data[a]);
      }
    }

    // 3. Срезаем массив под пагинацию и превращаем в полноценные JS-объекты только нужные строки
    const sliced = matchingIndices.slice(offset, offset + limit);
    const items = sliced.map(idx => this.getItem(idx));

    return {
      items,
      total: matchingIndices.length
    };
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