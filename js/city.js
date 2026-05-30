class City {
    #g = false;
    #k = "citygems_me";
    constructor() {}
    static async _init() {
        const c = new City();
        await c.check(true);
        return c;
    }
    async _sha(str) {
        const bs = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
        let b = "";
        for (let i = 0; i < bs.byteLength; i++) {
            b += String.fromCharCode(bs[i]);
        }
        return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    async check(quite) {
        if (!this.#g) {
            let p = localStorage.getItem(this.#k);
            if (!p && !quite) {
                p = prompt("Введите пароль доступа:");
            }
            if (p) {
                const h = await this._sha(p);
                const e = await fetch(`/db/${h}`, { method: "HEAD" }).then(r => !r.ok).catch(e => e.message);
                if (typeof e === "string") {
                    if (!quite) alert(`Ошибка авторизации: ${e}`);
                    else console.warn(`Ошибка авторизации: ${e}`);
                } else if (e) {
                    localStorage.removeItem(this.#k);
                    if (!quite) alert("Неверный пароль!");
                } else {
                    localStorage.setItem(this.#k, p);
                    this.#g = true;
                }
            }
        }
        return this.#g;
    }
    get isAuthorized() { return this.#g }
}

window.cityPromise = City._init();