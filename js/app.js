class App {
    #storName = "citygems_order";
    db = null;
    cat = [];
    oder = {row: [], qty: []};
    constructor(db, domPrice, domWeight) {
        this.db = db;
        domPrice.min = Math.min(...db.columns.price.rows);
        domPrice.max = Math.max(...db.columns.price.rows);
        domWeight.min = Math.min(...db.columns.weight.rows);
        domWeight.max = Math.max(...db.columns.weight.rows);
        this.cat = db.filter(null, "price");
        
    }
    orderLoad(){
        let o = localStorage.getItem(this.#storName);
        this.order = {row: [], qty: []};
        if (!o) return;
        if (typeof (o = JSON.parse(o) || undefined) == "object" && Array.isArray(o.id) && Array.isArray(o.qt) && o.id.length && o.id.length == o.qt.length) {
            this.db.getIDs(...o.id).forEach((r, i) => {if ((i = o.qt[i]) > 0) {
                this.order.row.push(r);
                this.order.qty.push(i);
            }});
        } else {
            localStorage.removeItem(this.#storName);
        }
    }
    orderSave(){
        const o = {id: [], qt: [], rate: this.db.rate, date: this.db.date};
        this.order.qty.forEach((q, i) => {if (q > 0) {
            o.id.push(this.db.getValue("id", this.oder.row[i]));
            o.qt.push(q);
        }});
        if (o.id.length) localStorage.setItem(this.#storName, JSON.stringify(o));
        else localStorage.removeItem(this.#storName);
    }
}