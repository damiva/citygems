const gemsCatalog = {
    limit: 20,
    rate: null,
    shapes: {},
    gems: null,

    row(i) {
        if (!this.gems || i < 0 || i >= (this.gems.cat.val?.length || 0)) return null;
        let res = {};
        Object.keys(this.gems.cat).forEach(k => res[k] = this.gems.cat[k][i]);
        return res;
    },

    find(query = {}) {
        if (!this.gems) return [];
        let keys = Object.keys(query).filter(k => this.gems.cat[k]);
        let len = this.gems.cat.val?.length || 0;
        let matches = [];
        
        for (let i = 0; i < len; i++) {
            let ok = true;
            for (let k of keys) {
                let val = query[k];
                let current = this.gems.cat[k][i];                
                if (typeof val === 'string') {
                    if (val !== '' && current !== val) { ok = false; break; }
                } else if (typeof val === 'object' && val !== null) {
                    if (val.min !== undefined && current < val.min) { ok = false; break; }
                    if (val.max !== undefined && current > val.max) { ok = false; break; }
                }
            }
            if (ok) matches.push(i);
        }
        return matches;
    },

    async load() {
        const parse = s => s && parseFloat(s.replace(',', '.')) || 0;
        
        let [cbr, csvText, shapesJson] = await Promise.all([
            fetch('https://www.cbr-xml-daily.ru/daily_json.js').then(r => r.json()).then(d => d?.Valute?.USD?.Value).catch(() => null),
            fetch('db/gems.csv', { cache: 'default' }).then(r => r.text()).catch(() => ''),
            fetch('db/shapes.json', { cache: 'default' }).then(r => r.json()).catch(() => ({}))
        ]);

        this.shapes = shapesJson;

        let lines = csvText ? csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
        if (!lines.length) {
            this.gems = null;
            return this;
        }

        let rateLine = lines.shift() || "";
        let sep = rateLine.startsWith('rate;') ? ';' : rateLine.startsWith('rate\t') ? '\t' : ',';
        let rateParts = rateLine.split(sep);
        let dse = Date.now() / 86400000;

        this.rate = { 
            val: cbr || parse(rateParts[1]) || 1, 
            add: parse(rateParts[2]), 
            dse: cbr && dse || 0 
        };
        
        let mult = this.rate.val + this.rate.add;
        let ns = []; 

        if (lines.length > 2) {
            this.gems = {
                dse: {re: 3, lab: 0, sh: 1, ct: 3, col: 0, cla: 0, cut: 0, pol: 0, sym: 0, s1: 2, s2: 2, s3: 2, val: 3}, 
                idx: {}, 
                cat: {}
            };
            
            lines.shift().split(sep).forEach((k, i) => {
                k = k.trim();
                if (typeof this.gems.dse[k] === 'number') {
                    this.gems.idx[k] = i;
                    this.gems.cat[k] = [];
                }
            });

            ns = Object.keys(this.gems.dse).filter(k => typeof this.gems.idx[k] === 'number');
        }

        if (lines.length > 1 && ns.length) {
            const setSh = new Set();
            const setCol = new Set();        
            
            lines.slice(1).forEach(r => {
                let o = {};
                r = r.split(sep);
                if (r.length < ns.length) return; 

                ns.forEach(k => {
                    if (o) {
                        const t = this.gems.dse[k];
                        let raw = (r[this.gems.idx[k]] || "").trim(); 
                        if (t > 1) {
                            o[k] = parse(raw);
                            if (k === 'val' && mult !== 1) o[k] = Math.round(o[k] * mult);
                        } else {
                            o[k] = raw;
                        }  
                        if (!o[k] && (t & 1)) o = null;
                    }
                });
                if (o) {
                    ns.forEach(k => this.gems.cat[k].push(o[k]));
                    if (o.sh) setSh.add(o.sh);
                    if (o.col) setCol.add(o.col);
                }
            });

            const prices = this.gems.cat.val || [];
            const weights = this.gems.cat.ct || [];
            
            let minCt = weights[0] || 0, maxCt = weights[0] || 0;
            for (let i = 1; i < weights.length; i++) {
                if (weights[i] < minCt) minCt = weights[i];
                if (weights[i] > maxCt) maxCt = weights[i];
            }

            let minVal = prices[0] || 0, maxVal = prices[0] || 0;
            for (let i = 1; i < prices.length; i++) {
                if (prices[i] < minVal) minVal = prices[i];
                if (prices[i] > maxVal) maxVal = prices[i];
            }

            this.gems.filters = {
                sh: [...setSh].filter(Boolean).sort(),
                col: [...setCol].filter(Boolean).sort(),
                ct: { min: minCt, max: maxCt },
                val: { min: minVal, max: maxVal }
            };
            this.gems.dse = dse;
        } else {
            this.gems = null;
        }

        return this;
    }
};
const gemsCatalogPromise = gemsCatalog.load();
export default gemsCatalogPromise;