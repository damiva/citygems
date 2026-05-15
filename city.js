export const City = {
    code: {t: "ZmFuY3lkaWFtcw==", n: "Nzk4NTc3NzY2NTU=", m: "aXJpbmE="},
    items: 20, // Позиций на странице

    // Курс
    rate: {
        val: 95.0,
        ds: 20588 // 15.05.2026
    },
    add: 2.5,

    // Утилита для получения текущего DSE
    todayDS: () => Math.floor(Date.now() / 86400000),

    // Функция пересчета и форматирования
    rubGet(usd) { return Math.round(usd * (this.rate.val + this.add)) },
    rubStr(val) { return val.toLocaleString('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 0}) },

    // Генерация ссылки (Base36)
    genLink(wishlist, gemsDS) {
        const rateInt = Math.round((this.rate.val + this.add) * 100);
        const meta = [ this.rate.ds.toString(36), rateInt.toString(36), gemsDS.toString(36) ].join('.');
        const items = wishlist.map(i => `${Number(i.re).toString(36)}_${i.qty.toString(36)}`).join('-');
        return `${window.location.origin}/list.html?${meta}-${items}`;
    },

    // ДЕШИФРОВКА ссылки (Base36)
    parseLink(token) {
        try {
            const [meta, ...items] = token.split('-');
            const [rateDS, rate, gemsDS] = meta.split('.').map(v => parseInt(v, 36) || 0);
            return {rateDS, gemsDS, rate: rate / 100, items: items.map(i => {
                const [re, qty] = i.split('_').map(v => parseInt(v, 36));
                return {re, qty};
            })};
        } catch (e) {
            console.error("Ошибка парсинга ссылки", e);
            return null;
        }
    },

    name() { return atob(this.code.n) },
    mail() { return atob(this.code.m) + "@citygems.ru" },
    tele() { return atob(this.code.t) },

    // Логика актуализации курса
    async updateRate() {
        const today = this.todayDS();
        const api = "https://www.cbr-xml-daily.ru/daily_json.js";
        const key = "citygems_rate";

        let cached = null;
        try {
            cached = JSON.parse(localStorage.getItem(key));
        } catch (e) {}

        if (cached && cached.ds === today) {
            this.rate = cached;
            return this.rate.val;
        }

        try {
            const res = await fetch(api);
            if (!res.ok) throw new Error();
            
            const data = await res.json();
            const newVal = data.Valute.USD.Value;

            this.rate = { val: newVal, ds: today };
            localStorage.setItem(key, JSON.stringify(this.rate));
            
        } catch (e) {
            if (cached && cached.ds > this.rate.ds) {
                this.rate = cached;
            }
        }

        return this.rate.val;
    }
};