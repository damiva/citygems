let db = [], filtered = [], currentIndex = 0, rate = 105, view = 'list', isRendering = false;

const parse = (v) => parseFloat(String(v || '').replace(',', '.')) || 0;

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeButton(isLight);
}

function updateThemeButton(isLight) {
    document.getElementById('theme-label').innerText = isLight ? 'Тёмная тема' : 'Светлая тема';
}

function syncRange(type, side) {
    const rMin = document.getElementById(`r-min-${type}`), rMax = document.getElementById(`r-max-${type}`);
    const iMin = document.getElementById(`i-min-${type}`), iMax = document.getElementById(`i-max-${type}`);
    const valLabel = document.getElementById(`val-${type}`);
    
    // Предотвращение перехлеста
    if (side === 'min' && +rMin.value >= +rMax.value) rMin.value = rMax.value - (+rMin.step || 0.01);
    if (side === 'max' && +rMax.value <= +rMin.value) rMax.value = +rMin.value + (+rMin.step || 0.01);

    // Управление видимостью (тот, что трогаем — всегда сверху)
    rMin.style.zIndex = (side === 'min') ? "30" : "20";
    rMax.style.zIndex = (side === 'max') ? "30" : "20";

    iMin.value = rMin.value;
    iMax.value = rMax.value;
    
    // Обновляем текстовую метку
    valLabel.innerText = `${rMin.value} — ${rMax.value}`;
    applyFilters();
}

function syncInput(type) {
    const rMin = document.getElementById(`r-min-${type}`), rMax = document.getElementById(`r-max-${type}`);
    const iMin = document.getElementById(`i-min-${type}`), iMax = document.getElementById(`i-max-${type}`);
    rMin.value = iMin.value;
    rMax.value = iMax.value;
    document.getElementById(`val-${type}`).innerText = `${rMin.value} — ${rMax.value}`;
    applyFilters();
}

async function init() {
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme || savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateThemeButton(true);
    } else {
        document.body.classList.remove('light-theme');
        updateThemeButton(false);
    }    // Подгрузка форм из конфига
    const shapeSel = document.getElementById('f-shape');
    shapeSel.innerHTML = '<option value="">Все формы</option>';
    Object.entries(DIAMOND_CONFIG.s).forEach(([k, v]) => shapeSel.innerHTML += `<option value="${k}">${v}</option>`);

    // Курс валют
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        rate = data.rates.RUB + (DIAMOND_CONFIG.r || 0);
    } catch(e) { console.warn("Курс ЦБ недоступен, используем default"); }

    // Загрузка CSV
    const resp = await fetch('diamonds_lab.csv?v=' + Date.now());
    const text = await resp.text();
    db = text.split('\n').slice(1).map(line => {
        const v = line.split(';');
        if (v.length < 12) return null;
        return {
            id: v[0], lab: v[1], sh: v[2], ct: parse(v[3]), col: v[4], cla: v[5],
            cut: v[6], sym: v[7], pol: v[8], s1: v[9], s2: v[10], s3: v[11],
            price: Math.ceil(parse(v[12]) * rate)
        };
    }).filter(x => x);

    // Настройка слайдеров под данные
    const setupR = (type) => {
        const vals = db.map(x => type === 'w' ? x.ct : x.price);
        const min = Math.min(...vals), max = Math.max(...vals);
        ['r-min-', 'r-max-', 'i-min-', 'i-max-'].forEach(id => {
            const el = document.getElementById(id + type);
            el.min = min; el.max = max;
        });
        document.getElementById('r-min-'+type).value = document.getElementById('i-min-'+type).value = min;
        document.getElementById('r-max-'+type).value = document.getElementById('i-max-'+type).value = max;
        document.getElementById(`val-${type}`).innerText = `${min} — ${max}`;
    };
    setupR('w'); setupR('p');

    applyFilters();
}

function applyFilters() {
    const shape = document.getElementById('f-shape').value;
    const minW = parse(document.getElementById('i-min-w').value), maxW = parse(document.getElementById('i-max-w').value);
    const minP = parse(document.getElementById('i-min-p').value), maxP = parse(document.getElementById('i-max-p').value);
    const sort = document.getElementById('sort-order').value;

    filtered = db.filter(x => 
        (!shape || x.sh === shape) && 
        (x.ct >= minW && x.ct <= maxW) && 
        (x.price >= minP && x.price <= maxP)
    );

    if (sort === 'p-asc') filtered.sort((a,b) => a.price - b.price);
    else if (sort === 'p-desc') filtered.sort((a,b) => b.price - a.price);
    else if (sort === 'w-asc') filtered.sort((a,b) => a.ct - b.ct);
    else if (sort === 'w-desc') filtered.sort((a,b) => b.ct - a.ct);

    document.getElementById('counter').innerHTML = `Найдено: <span style="color:var(--text-main)">${filtered.length.toLocaleString()}</span> из <span style="opacity:0.5">${db.length.toLocaleString()}</span>`;
    renderNextPage(true);
}

function setView(v) {
    view = v;
    document.getElementById('v-list').classList.toggle('active-btn', v === 'list');
    document.getElementById('v-grid').classList.toggle('active-btn', v === 'grid');
    document.getElementById('catalog').className = (v === 'grid') ? 'view-grid' : 'view-list';
    renderNextPage(true);
}

// Инициализация избранного из локальной памяти
let wishlist = JSON.parse(localStorage.getItem('citygems_wishlist') || '[]');

// Функция добавления/удаления
function toggleWish(id) {
    const idx = wishlist.findIndex(item => item.id === id);
    if (idx > -1) {
        wishlist.splice(idx, 1);
    } else {
        const diamond = db.find(d => d.id === id);
        wishlist.push({ ...diamond, qty: 1 });
    }
    saveWish();
    renderNextPage(true); // Перерисовываем, чтобы обновить сердечки
}

function saveWish() {
    localStorage.setItem('citygems_wishlist', JSON.stringify(wishlist));
    document.getElementById('wish-count').innerText = wishlist.length;
}

// Изменение количества
function updateQty(id, delta) {
    const item = wishlist.find(i => i.id === id);
    if (item) {
        item.qty = Math.max(1, item.qty + delta);
        saveWish();
        renderWishlistModal();
    }
}

// Рендеринг модального окна
function renderWishlistModal() {
    const cont = document.getElementById('wishlist-items');
    let html = '';
    let total = 0;

    if (wishlist.length === 0) {
        html = '<div class="text-center opacity-40 py-10 italic">Ваш список пуст</div>';
    } else {
        wishlist.forEach(item => {
            const sum = item.price * item.qty;
            total += sum;
            html += `
            <div class="flex items-center gap-4 py-3 border-b border-white/5">
                <div class="flex-1">
                    <div class="text-[11px] uppercase tracking-widest" style="color:var(--text-main)">${item.sh} ${item.ct} CT</div>
                    <div class="text-[10px] opacity-50">${item.price.toLocaleString()} ₽/шт</div>
                </div>
                <div class="qty-ctrl">
                    <button class="qty-btn" onclick="updateQty('${item.id}', -1)">−</button>
                    <span class="text-xs w-4 text-center">${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty('${item.id}', 1)">+</button>
                </div>
                <div class="text-xs font-bold w-24 text-right" style="color:var(--text-main)">${sum.toLocaleString()} ₽</div>
                <button onclick="toggleWish('${item.id}'); renderWishlistModal();" class="text-[10px] opacity-30 hover:opacity-100 ml-2">✕</button>
            </div>`;
        });
    }
    cont.innerHTML = html;
    document.getElementById('wish-total').innerText = `Итого: ${total.toLocaleString()} ₽`;
}

function openWishlist() {
    renderWishlistModal();
    document.getElementById('wishlist-modal').classList.remove('hidden');
}

function closeWishlist() {
    document.getElementById('wishlist-modal').classList.add('hidden');
}

function renderNextPage(reset = false) {
    if (isRendering) return;
    isRendering = true;
    const cont = document.getElementById('catalog');
    if (reset) { cont.innerHTML = ''; currentIndex = 0; }
    
    const page = filtered.slice(currentIndex, currentIndex + (DIAMOND_CONFIG.n || 20));
    let html = '';
    
    page.forEach(d => {
        const video = `${DIAMOND_CONFIG.i.p}${d.sh}${DIAMOND_CONFIG.i.e}`;
        const priceStr = d.price.toLocaleString('ru-RU');
        const labBadge = `<div class="absolute top-0 left-0 bg-stone-800 text-[8px] text-white px-2 py-0.5 z-10 font-bold uppercase flex items-center"><span class="verified-icon"></span>${d.lab}</div>`;
        const inWish = wishlist.some(i => i.id === d.id);
        const wishBtn = `
            <button onclick="toggleWish('${d.id}')" class="wish-toggle ${inWish ? 'active' : ''}">
                <svg viewBox="0 0 24 24" fill="${inWish ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </button>
        `;
        if (view === 'list') {
            html += `
            <div class="diamond-card p-5 flex flex-col md:flex-row items-center gap-8">
                <div class="w-24 h-24 bg-black/10 relative flex-shrink-0">
                    ${labBadge}
                    <video src="${video}" autoplay loop muted playsinline class="w-full h-full object-contain"></video>
                </div>
                <div class="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-6 items-center">
                    <div>
                        <div class="serif italic text-xl leading-tight" style="color:var(--text-main)">${DIAMOND_CONFIG.s[d.sh] || d.sh}</div>
                        <div class="text-2xl font-light tracking-tighter" style="color:var(--text-main)">${d.ct} CT</div>
                    </div>
                    <div class="text-[10px] uppercase tracking-widest opacity-70">
                        <div>Цвет: <span style="color:var(--text-main)">${d.col}</span></div>
                        <div>Чистота: <span style="color:var(--text-main)">${d.cla}</span></div>
                    </div>
                    <div class="text-[10px] uppercase tracking-widest opacity-70">
                        <div>Огранка: <span style="color:var(--text-main)">${d.cut}</span></div>
                        <div>Сим/Пол: <span style="color:var(--text-main)">${d.sym}/${d.pol}</span></div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-bold mb-2" style="color:var(--text-main)">${priceStr} ₽</div>
                        ${wishBtn}
                    </div>
                </div>
            </div>`;
        } else {
            html += `
            <div class="diamond-card p-6 flex flex-col">
                <div class="aspect-square bg-black/10 mb-5 relative overflow-hidden">
                    ${labBadge.replace('top-0 left-0', 'top-3 left-3')}
                    <video src="${video}" autoplay loop muted playsinline class="w-full h-full object-contain p-4"></video>
                </div>
                <div class="flex justify-between items-baseline mb-4">
                    <span class="text-2xl font-light" style="color:var(--text-main)">${d.ct} ct</span>
                    <span class="text-lg font-bold" style="color:var(--text-main)">${priceStr} ₽</span>
                </div>
                <div class="text-[10px] uppercase tracking-widest opacity-60 pb-3 mb-4 border-b" style="border-color: var(--border)">
                    ${DIAMOND_CONFIG.s[d.sh] || d.sh} • <span style="color:var(--text-main)">${d.col}</span> • <span style="color:var(--text-main)">${d.cla}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[9px] uppercase tracking-widest opacity-50 mb-6">
                    <span>Огр: <span style="color:var(--text-main)">${d.cut}</span></span>
                    <span>Сим: <span style="color:var(--text-main)">${d.sym}</span></span>
                    <span>Пол: <span style="color:var(--text-main)">${d.pol}</span></span>
                    <span>${d.s1}x${d.s2}мм</span>
                </div>
                ${wishBtn}
            </div>`;
        }
    });
    
    cont.insertAdjacentHTML('beforeend', html);
    currentIndex += page.length;
    document.getElementById('more-box').classList.toggle('hidden', currentIndex >= filtered.length);
    isRendering = false;
}

// Функция отправки менеджеру
function sendWishlist() {
    if (wishlist.length === 0) return;
    let text = "Здравствуйте! Хочу уточнить наличие по списку:\n\n";
    wishlist.forEach(i => {
        text += `— ${i.sh} ${i.ct}ct (${i.col}/${i.cla}), ${i.qty} шт. (ID: ${i.id})\n`;
    });
    const tg = `https://t.me/${atob(DIAMOND_CONFIG.c.t)}`;
    window.open(tg + "?text=" + encodeURIComponent(text), "_blank");
}

init();