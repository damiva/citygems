/**
   * Внутренний метод загрузки каталога и проверки актуальности курса (Параллельный)
   */
  async _load(url) {
    try {
      console.time('[GemsCatalog] Время загрузки сети');

      // Запускаем оба запроса одновременно
      const [catalogResponse, cbrResponse] = await Promise.all([
        fetch(url).then(res => res.json()),
        fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(res => res.json()).catch(err => {
          console.error('[GemsCatalog] Не удалось загрузить курс ЦБ, используем базовый:', err);
          return null; // Если ЦБ упал, возвращаем null, чтобы не ломать загрузку каталога
        })
      ]);

      console.timeEnd('[GemsCatalog] Время загрузки сети');

      // Раскладываем данные каталога
      this.rawColumns = catalogResponse;
      this.rate = catalogResponse.rate;
      this.rateDate = catalogResponse.date;
      
      const firstKey = Object.keys(catalogResponse).find(key => Array.isArray(catalogResponse[key]));
      this.itemsCount = firstKey ? catalogResponse[firstKey].length : 0;

      // Если курс ЦБ успешно получен, проверяем необходимость пересчета
      if (cbrResponse) {
        this._recalculateIfRequired(cbrResponse);
      }

      console.log(`[GemsCatalog] Инициализация успешна. Записей: ${this.itemsCount}. Курс: ${this.rate} руб.`);
      return this; 
    } catch (error) {
      console.error('[GemsCatalog] Критическая ошибка при инициализации:', error);
      throw error;
    }
  }

  /**
   * Внутренний метод: проверка и пересчет (уже без async, так как данные на руках)
   */
  _recalculateIfRequired(cbrData) {
    const currentUsdRate = cbrData.Valute?.USD?.Value;
    if (!currentUsdRate || !this.rate) return;

    const ratio = currentUsdRate / this.rate;

    // Условие: вырос на 5% или упал на 10%
    if (ratio >= 1.05 || ratio <= 0.90) {
      console.warn(`[GemsCatalog] Курс изменился: ${this.rate} -> ${currentUsdRate}. Пересчет цен...`);
      
      const priceKey = this.rawColumns.price ? 'price' : (this.rawColumns.price_rub ? 'price_rub' : null);

      if (priceKey && Array.isArray(this.rawColumns[priceKey])) {
        // Быстрый пересчет массива цен в памяти
        this.rawColumns[priceKey] = this.rawColumns[priceKey].map(oldPrice => Math.round(oldPrice * ratio));
        this.rate = currentUsdRate;
        this.rateDate = cbrData.Date;
      }
    } else {
      console.log(`[GemsCatalog] Изменение курса незначительно (${((ratio - 1) * 100).toFixed(2)}%). Пересчет не нужен.`);
    }
  }