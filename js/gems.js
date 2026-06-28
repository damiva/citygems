class GemSize {
    constructor(l, w, d) { this.l = l; this.w = w; this.d = d; }
    valueOf() { return [this.l, this.w, this.d]; }
    toString() { return `${this.l} × ${this.w} × ${this.d}`; }
    toLocaleString(locale, options) { 
        const opt = options || { minimumFractionDigits: 2, maximumFractionDigits: 2 };
        return `${this.l.toLocaleString(locale, opt)} × ${this.w.toLocaleString(locale, opt)} × ${this.d.toLocaleString(locale, opt)}`; 
    }
}

class Gems {
    constructor(gems, uri) {
        this.length = gems.price?.row?.length || 0;
        this.raw = gems;
        this.uri = uri;
        const shapes = gems.shape?.map || [];
        const labs = gems.lab?.map || [];
        const cuts = gems.cut?.map || [];
        const colors = gems.color?.map || [];
        const clarities = gems.clarity?.map || [];
        const simmetries = gems.simmetry?.map || [];
        this._gemPrototype = Object.create(null, {
            size:  { get() { return new GemSize(this.sizeL, this.sizeW, this.sizeD); } },
            image: { get() { return this._shapeStr ? uri + "img/" + this._shapeStr + ".png" : ""; } },
            label: { get() { return this._labStr ? uri + "lab/" + this._labStr + ".png" : ""; } },
            art:   { get() { return this.id.toString(36); } }
        });
        return new Proxy(this, {
            get(target, prop) {
                const i = Number(prop);
                if (isNaN(i)) return target[prop] || gems[prop];
                if (i < 0 || i >= target.length) return undefined;
                const item = Object.create(target._gemPrototype);
                
                item.id = gems.id.row[i];
                item.carat = gems.carat.row[i];
                item.price = gems.price.row[i];
                item.sizeL = gems.sizeL.row[i];
                item.sizeW = gems.sizeW.row[i];
                item.sizeD = gems.sizeD.row[i];
                
                item._shapeStr = shapes[gems.shape.row[i]] || "";
                item._labStr = labs[gems.lab.row[i]] || "";
                
                item.shape = item._shapeStr;
                item.lab = item._labStr;
                item.cut = cuts[gems.cut.row[i]] || "";
                item.color = colors[gems.color.row[i]] || "";
                item.clarity = clarities[gems.clarity.row[i]] || "";
                item.simmetry = simmetries[gems.simmetry.row[i]] || "";

                return item;
            }
        });
    }

    static async load(uri = "db/", rate, date) {
        const storeKey = "citygems_rate";
        let fileDate = null;
        
        const prom = fetch(uri + "gems.json").then(d => {
                if (d.ok) {
                    const lastMod = d.headers.get("Last-Modified");
                    if (lastMod) fileDate = new Date(lastMod);
                    return d.json();
                }
                throw new Error(d.statusText);
            }).catch(e => { throw new Error(`Не удалось загрузить каталог: ${e.message}`) });

        let cbr = null;
        if (!rate) {
            cbr = await fetch("https://www.cbr-xml-daily.ru/daily_json.js")
                .then(d => d.ok ? d.json() : Promise.reject(d.statusText))
                .then(d => d.Valute?.USD?.Value ? { rate: d.Valute.USD.Value, date: d.Date || "" } : null)
                .catch(e => {
                    console.warn("Не удалось загрузить курсы валют ЦБ РФ:", e);
                    return null;
                });

            const loc = JSON.parse(localStorage.getItem(storeKey) || "{}");
            rate = cbr?.rate || 0;
            date = cbr?.date || null;
            
            if (!rate && !loc.rate) throw new Error("Нет доступного курса валюты!");
            
            if (!rate) {
                rate = loc.rate;
                date = loc.date;
            } else if (loc.rate) {
                const dif = rate / loc.rate;
                if (dif > 0.95 && dif < 1.05) {
                    rate = loc.rate;
                    date = loc.date;
                } else {
                    localStorage.setItem(storeKey, JSON.stringify(cbr));
                }
            } else {
                localStorage.setItem(storeKey, JSON.stringify(cbr));
            }
        }

        const gems = await prom;
        
        if (gems.price && Array.isArray(gems.price.row)) {
            for (let i = 0; i < gems.price.row.length; i++) {
                gems.price.row[i] = Math.round(gems.price.row[i] * rate / 10) * 10;
            }
        }
        
        gems.date = fileDate;
        gems.rate = { val: rate, date: date ? new Date(date) : new Date() };
        
        return new Gems(gems, uri);
    }

    filter(criteria, orderBy, desc = false) {
        const result = [];
        const total = this.length;
        const data = this.raw;
        
        // Поиск совпадений по сырым массивам чисел (работает мгновенно)
        for (let i = 0; i < total; i++) {
            let ok = true;
            for (const [k, r] of Object.entries(criteria)) {
                if (data[k]) {
                    const v = data[k].row[i];
                    if (typeof r === 'number' && r !== null) {
                        ok = v === r;
                    } else if (Array.isArray(r)) {
                        ok = r.includes(v);
                    } else if (r && typeof r.min === 'number' && typeof r.max === 'number') {
                        ok = v >= r.min && v <= r.max;
                    }
                    if (!ok) break;
                }
            }
            if (ok) result.push(i);
        }
        
        if (orderBy && data[orderBy] && result.length > 1) {
            const sortColumn = data[orderBy];
            if (Array.isArray(sortColumn.map)) {
                // Если колонка категориальная, сортируем по реальным строкам из словаря
                const map = sortColumn.map;
                if (desc) result.sort((a, b) => map[sortColumn.row[b]].localeCompare(map[sortColumn.row[a]]));
                else result.sort((a, b) => map[sortColumn.row[a]].localeCompare(map[sortColumn.row[b]]));
            } else {
                // Если колонка числовая
                const row = sortColumn.row;
                if (desc) result.sort((a, b) => row[b] - row[a]);
                else result.sort((a, b) => row[a] - row[b]);
            }
        }
        
        return new Proxy({
            _indices: result,
            _gems: this,
            _cache: {},
            offset: 12, 
            page: 0,
            get length(){ return this._indices.length; },
            get pages()  { return Math.max(1, Math.ceil(this._indices.length / this.offset)); }
        }, {
            get(target, prop) {
                const i = Number(prop);
                if (isNaN(i)) return target[prop];
                if (i < 0 || i >= target.pages) return undefined;
                target.page = i;
                if (target._cache[i]) return target._cache[i];
                const start = i * target.offset;
                const p = target._indices.slice(start, start + target.offset).map(idx => target._gems[idx]);
                target._cache[i] = p;
                return p;
            }
        });
    }
}

class Cart {
    #storKey = 'citygems_cart';
    #nosave = false;

    constructor(gems, rawCart) {
        this.gems = gems;
        this.#nosave = !!rawCart;
        this._load(rawCart);
    }

    _load(raw) {
        this.map = new Map();
        let loc = raw;
        if (!loc && !(loc = localStorage.getItem(this.#storKey))) return;
        if (typeof loc === 'string') {
            try { loc = JSON.parse(loc) || null; } catch { loc = null; }
        }
        if (loc && Array.isArray(loc.id) && Array.isArray(loc.qt)) {
            const ids = new Map();
            const row = this.gems.raw.id.row;
            loc.id.forEach((id, i) => { if (loc.qt[i] > 0) ids.set(id, loc.qt[i]); });
            for (let i = 0; i < row.length; i++) {
                const id = row[i];
                if (ids.has(id)) {
                    this.map.set(i, ids.get(id));
                    ids.delete(id);
                    if (!ids.size) break;
                }
            }
        } else if (!raw) {
            localStorage.removeItem(this.#storKey);
        }
    }

    _save(nosave) {
        const c = { id: [], qt: [] };
        const ids = this.gems.raw.id.row;
        if (this.map?.size) {
            for (const [i, q] of this.map.entries()) {
                if (q > 0 && ids[i] !== undefined) {
                    c.id.push(ids[i]);
                    c.qt.push(q);
                }
            }
        }
        if (nosave) return c;       
        if (c.id.length) localStorage.setItem(this.#storKey, JSON.stringify(c));
        else localStorage.removeItem(this.#storKey);
    }

    set(i, q) {
        if (!this.map) this._load();
        if (isNaN(q) || q < 1) this.map.delete(i);
        else this.map.set(i, q);
        if (!this.#nosave) this._save();
    }

    get(i) { 
        if (!this.map) this._load();
        return this.map.get(i) || 0; 
    }

    get items() {
        if (!this.map) this._load();
        const items = [];
        for (const [i, q] of this.map.entries()) {
            const item = this.gems[i];
            if (item && q > 0) {
                item.qty = q;
                items.push(item);
            } else {
                this.map.delete(i);
            }
        }
        return items;
    }

    get uri() {
        const c = this._save(true);
        if (!c.id.length) return "";
        
        const datePart = Math.round((this.gems.raw.date || new Date()) / 86400000).toString(36);
        const ratePart = Math.round(this.gems.raw.rate.val * 100).toString(36);
        let u = `${datePart}=${ratePart}`;
        
        for (let i = 0; i < c.id.length; i++) {
            u += `&${c.id[i].toString(36)}=${c.qt[i].toString(36)}`;
        }
        return u;
    }

    static async load(shareUrl, baseUri = "db/") {
        const queryString = shareUrl.includes('?') ? shareUrl.substring(shareUrl.indexOf('?') + 1) : shareUrl;
        const params = queryString.split("&");
        const header = params.shift().split("=");
        
        const dateMs = parseInt(header[0], 36) * 86400000;
        const rateVal = parseInt(header[1], 36) / 100;
        
        const c = { id: [], qt: [] };
        params.forEach(p => {
            const pair = p.split("=");
            if (pair.length === 2) {
                const id = parseInt(pair[0], 36);
                const qt = parseInt(pair[1], 36);
                if (!isNaN(id) && !isNaN(qt) && qt > 0) {
                    c.id.push(id);
                    c.qt.push(qt);
                }
            }
        });
        
        const cleanUri = shareUrl.includes('/') ? shareUrl.substring(0, shareUrl.lastIndexOf('/') + 1) + baseUri : baseUri;
        const gems = await Gems.load(cleanUri, rateVal, dateMs);
        return new Cart(gems, c);
    }
}

class QRCode {
    #m = "";
    #t = "";
    constructor(img, type, stg){
        const u = type && typeof type == "string" && {t: "tg://resolve", m: "max://write", w: "whatsapp://send"}[type.toLowerCase()] || "";
        this.img = typeof img == "object" && img.src !== undefined && img || undefined;
        this.stg = typeof stg == "object" && stg || {};
        this.#m = u ? `${u}?phone=${parseInt(this.#t, 36)}` : `mailto:${atob(this.#m)}?subject=${window.location.host}`;
        this.#t = u ? "&text=" : "&body=";
    }
    set(order) {
        let u = this.#m;
        if(order) u += this.#t + encodeURIComponent(`Мой заказ: ${window.location.origin}/order.html?${order}`);
        if(this.img) {
            this.stg.data = u;
            this.img.src = this.constructor.get(this.stg);
        }
        return u;
    }
    static get(stg) {return `https://api.qrserver.com/v1/create-qr-code/?${new URLSearchParams(stg).toString()}`}
}
