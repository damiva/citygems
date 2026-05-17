export async function gems() {
    const parse = s => s && parseFloat(s.replace(',', '.')) || 0;
    
    // 1. Загрузка ресурсов
    let [cbr, gems, shapes] = await Promise.all([
        fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(r => r.json()).then(d => d?.Valute?.USD?.Value).catch(() => null),
        fetch('db/gems.csv', { cache: 'default' }).then(r => r.text().split(/\r?\n/)).catch(() => []),
        fetch('db/shapes.json', { cache: 'default' }).then(r => r.json()).catch(() => ({})) // result is: {<sh>: {txt: "...", img: "..."}}
    ]);

    // Безопасный сдвиг первой строки (защита от пустого файла)
    let rate = gems.shift()?.trim() || "";
    if (!rate) return null;

    let dse = Date.now() / 86400000;
    let sep = rate.startsWith('rate;') ? ';' : rate.startsWith('rate\t') ? '\t' : ',';

    rate = rate.split(sep);
    rate = { val: cbr || parse(rate[1]) || 1, add: parse(rate[2]), dse: cbr && dse || 0 };
    
    // Итоговый множитель для цен
    let mult = rate.val + rate.add;
    let ns = []; 

    // 2. Сборка метаструктуры
    if ( gems.length > 2 ) {
        cbr = {
            dse: {re: 3, lab: 0, sh: 1, ct: 3, col: 0, cla: 0, cut: 0, pol: 0, sym: 0, s1: 2, s2: 2, s3: 2, val: 3}, 
            ttl: {}, idx: {}, cat: {}
        };
        
        gems.shift().split(sep).forEach((k, i) => {
            k = k.trim();
            if ( typeof cbr.dse[k] == 'number' ) {
                cbr.idx[k] = i;
                cbr.cat[k] = [];
            }
        });

        ns = Object.keys(cbr.dse).filter(k => {
            if ( typeof cbr.idx[k] == 'number') return true;
            if ( cbr.dse[k] & 1 ) {
                console.error("gems.csv error: required column " + k + " is not found");
                gems = [];
            }
            return false;
        });
    }

    // 3. Парсинг данных каталога
    if ( gems.length > 1 && ns.length ) {
        let ruHeaders = gems[0].split(sep);
        ns.forEach(k => cbr.ttl[k] = (ruHeaders[cbr.idx[k]] || k).trim() );
        
        gems.slice(1).forEach(r => {
            let o = {};
            r = r.split(sep);
            if (r.length < ns.length) return; 

            ns.forEach(k => {
                if ( o ) {
                    const t = cbr.dse[k];
                    let raw = (r[cbr.idx[k]] || "").trim(); 
                    
                    if ( t > 1 ) {
                        o[k] = parse(raw);
                        // Если это колонка цены (val), умножаем на рублевый курс + надбавку
                        if (k === 'val' && mult !== 1) o[k] = Math.round(o[k] * mult);
                    } else {
                        // Оставляем строки в оригинальном виде (никакого toUpperCase)
                        o[k] = raw;
                    }
                    
                    if ( !o[k] && (t & 1) ) o = null; 
                }
            });
            if ( o ) ns.forEach(k => cbr.cat[k].push(o[k]));
        });

        const unique = arr => arr ? [...new Set(arr)].filter(Boolean).sort() : [];
        const prices = cbr.cat.val || [];
        const weights = cbr.cat.ct || [];
        
        cbr.filters = {
            sh: unique(cbr.cat.sh),
            col: unique(cbr.cat.col),
            ct: {min: weights.length ? Math.min(...weights) : 0, max: weights.length ? Math.max(...weights) : 0},
            val: {min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0}
        };
    }

    // Защита, если файла нет или он пустой
    if (typeof cbr !== 'object' || !cbr.cat) cbr = { cat: {}, ttl: {}, filters: {} };
    cbr.dse = dse;

    // Твои функции row и find возвращены на место!
    cbr.row = function(i) {
        if (i < 0 || i >= (this.cat.val?.length || 0)) return null;
        let res = {};
        Object.keys(this.cat).forEach(k => res[k] = this.cat[k][i]);
        return res;
    };

    cbr.find = function(query = {}) {
        let keys = Object.keys(query).filter(k => this.cat[k]);
        let len = this.cat.val?.length || 0;
        let matches = [];

        for (let i = 0; i < len; i++) {
            let ok = true;
            for (let k of keys) {
                let val = query[k];
                let current = this.cat[k][i];
                
                if (typeof val === 'string') {
                    // Строгое соответствие без смены регистра
                    if (current !== val) { ok = false; break; }
                } else if (typeof val === 'object' && val !== null) {
                    if (val.min !== undefined && current < val.min) { ok = false; break; }
                    if (val.max !== undefined && current > val.max) { ok = false; break; }
                }
            }
            if (ok) matches.push(i);
        }
        return matches;
    };

    // Методы shapes ровно в том виде, в котором ты их написал
    shapes.image = function(s) { return (s = this[s]) && (s = s.img) ? "/db/" + s : "" };
    shapes.title = function(s) { return (s = this[s]) && s.txt || "" };

    gems = cbr;
    return {
        rate,
        shapes,
        gems,
        limit: 20 // show items per page
    };
}