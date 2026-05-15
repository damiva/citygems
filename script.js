import { City } from './city.js';
import { Gems } from '/data/gems.js';

// Глобальные переменные состояния
let db = [], filtered = [], currentIndex = 0, view = 'list', isRendering = false;
let wishlist = JSON.parse(localStorage.getItem('citygems_wishlist') || '[]');

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Применяем сохраненную тему (по умолчанию темная)
    if (localStorage.getItem('citygems_theme') === 'light') {
        document.body.classList.add('light-theme');
    }

    // Обновляем курс доллара из API (через city.js)
    await City.updateRate();

    // Подгружаем данные из gems.js
    db = Gems.db;
    
    // Первичная фильтрация и обновление счетчика корзины
    applyFilters();
    updateWishBadge();

    // Обработка бесконечного скролла
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
            renderNextPage();
        }
    });
}

// --- 2. НАВИГАЦИЯ И ДИНАМИЧЕСКИЙ КОНТЕНТ ---
async function loadPageContent(pageId, fileName) {
    const container = document.getElementById(pageId);
    if (!container) return;
    try {
        const response = await fetch(fileName);
        if (response.ok) {
            container.innerHTML = await response.text();
            // Дешифровка скрытых контактов (atob)
            container.querySelectorAll('[data-text], [data-link]').forEach(el => {
                if (el.dataset.text) el.innerHTML = decodeURIComponent(escape(atob(el.dataset.text)));
                if (el.dataset.link) el.href = decodeURIComponent(escape(atob(el.dataset.link)));
            });
        }
    } catch (err) { console.error("Load error:", err); }
}

function navigate(pageId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');
    
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`button[onclick="navigate('${pageId}')"]`)?.classList.add('active');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 3. ФИЛЬТРАЦИЯ ---
function applyFilters() {
    const q = document.getElementById('search')?.value.toLowerCase() || '';
    const shape = document.getElementById('f-shape')?.value || 'ALL';
    
    const minW = parseFloat(document.getElementById('i-min-weight')?.value) || 0;
    const maxW = parseFloat(document.getElementById('i-max-weight')?.value) || 99;
    const minP = parseFloat(document.getElementById('i-min-price')?.value) || 0;
    const maxP = parseFloat(document.getElementById('i-max-price')?.value) || 99999999;

    filtered = db.filter(d => {
        const price = City.rubGet(d.val);
        const matchSearch = !q || d.re.toString().includes(q) || d.col.toLowerCase().includes(q) || d.cla.toLowerCase().includes(q);
        const matchShape = shape === 'ALL' || d.sh === shape;
        const matchWeight = d.ct >= minW && d.ct <= maxW;
        const matchPrice = price >= minP && price <= maxP;
        return matchSearch && matchShape && matchWeight && matchPrice;
    });

    const sort = document.getElementById('sort-select')?.value || 'price-asc';
    filtered.sort((a, b) => {
        if (sort === 'price-asc') return a.val - b.val;
        if (sort === 'price-desc') return b.val - a.val;
        if (sort === 'weight-desc') return b.ct - a.ct;
        return 0;
    });

    renderNextPage(true);
}

// --- 4. ОТРИСОВКА КАТАЛОГА ---
function renderNextPage(reset = false) {
    if (isRendering) return;
    if (reset) {
        currentIndex = 0;
        document.getElementById('catalog').innerHTML = '';
    }
    
    const page = filtered.slice(currentIndex, currentIndex + City.items);
    if (page.length === 0) {
        if (reset) document.getElementById('catalog').innerHTML = '<div class="col-span-full py-20 text-center opacity-40">Ничего не найдено</div>';
        document.getElementById('more-box')?.classList.add('hidden');
        return;
    }

    isRendering = true;
    const cont = document.getElementById('catalog');
    const t = Gems.titles;
    let html = '';

    page.forEach(d => {
        const shape = Gems.shapes[d.sh] || { ru: d.sh };
        const priceStr = City.rubStr(City.rubGet(d.val));
        const inWish = wishlist.some(i => i.re === d.re);
        const dims = `${d.s1} x ${d.s2} x ${d.s3} мм`;
        
        const wishBtn = `
            <button onclick="toggleWish(${d.re})" class="wish-toggle ${inWish ? 'active' : ''}" title="В избранное">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="${inWish ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </button>`;

        if (view === 'list') {
            html += `
            <div class="list-item group">
                <div class="w-16 h-16 bg-black/5 overflow-hidden">
                    <img src="/data/img/${d.re}.jpg" onerror="this.style.opacity=0" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold uppercase tracking-wider">${d.ct} CT ${shape.ru}</span>
                        <span class="text-[10px] opacity-40">${d.re}</span>
                    </div>
                    <div class="text-[10px] opacity-60 uppercase">${d.col} / ${d.cla} • ${d.cut} • ${d.lab}</div>
                </div>
                <div class="text-right mr-4">
                    <div class="font-bold text-sm">${priceStr}</div>
                    <div class="text-[9px] opacity-40">${dims}</div>
                </div>
                ${wishBtn}
            </div>`;
        } else {
            html += `
            <div class="diamond-card p-6 flex flex-col">
                <div class="aspect-square bg-black/10 mb-5 relative overflow-hidden">
                    <img src="/data/img/${d.re}.jpg" onerror="this.style.opacity=0" class="w-full h-full object-cover hover:scale-110 transition-transform duration-500">
                </div>
                <div class="flex justify-between items-baseline mb-4">
                    <span class="text-2xl font-light">${d.ct} ct</span>
                    <span class="text-lg font-bold">${priceStr}</span>
                </div>
                <div class="text-[10px] uppercase opacity-60 pb-3 mb-4 border-b border-white/10">
                    ${shape.ru} • ${d.col} • ${d.cla}
                </div>
                <div class="grid grid-cols-2 gap-2 text-[9px] uppercase opacity-50 mb-6">
                    <span>${t.cut || 'Огр'}: <span>${d.cut}</span></span>
                    <span>${t.pol || 'Пол'}: <span>${d.pol}</span></span>
                    <span class="col-span-2 text-center mt-2 border-t border-dotted border-white/20 pt-2">${dims}</span>
                </div>
                ${wishBtn}
            </div>`;
        }
    });

    cont.insertAdjacentHTML('beforeend', html);
    currentIndex += page.length;
    document.getElementById('more-box')?.classList.toggle('hidden', currentIndex >= filtered.length);
    isRendering = false;
}

// --- 5. ТЕМА И ИНТЕРФЕЙС ---
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('citygems_theme', isLight ? 'light' : 'dark');
}

function setView(v) {
    view = v;
    document.getElementById('catalog').className = (v === 'grid' ? 'view-grid' : 'view-list');
    document.querySelectorAll('.view-btn').forEach(b => b.style.opacity = b.dataset.view === v ? '1' : '0.4');
    renderNextPage(true);
}

function syncRange(type, edge) {
    const rMin = document.getElementById(`r-min-${type}`), rMax = document.getElementById(`r-max-${type}`);
    const iMin = document.getElementById(`i-min-${type}`), iMax = document.getElementById(`i-max-${type}`);
    if (parseFloat(rMin.value) > parseFloat(rMax.value)) {
        if (edge === 'min') rMin.value = rMax.value; else rMax.value = rMin.value;
    }
    iMin.value = rMin.value; iMax.value = rMax.value;
    applyFilters();
}

function syncInput(type) {
    const rMin = document.getElementById(`r-min-${type}`), rMax = document.getElementById(`r-max-${type}`);
    const iMin = document.getElementById(`i-min-${type}`), iMax = document.getElementById(`i-max-${type}`);
    rMin.value = iMin.value; rMax.value = iMax.value;
    applyFilters();
}

// --- 6. ИЗБРАННОЕ (WISHLIST) ---
function toggleWish(re) {
    const idx = wishlist.findIndex(i => i.re === re);
    if (idx > -1) wishlist.splice(idx, 1);
    else wishlist.push({ re, qty: 1 });
    
    localStorage.setItem('citygems_wishlist', JSON.stringify(wishlist));
    updateWishBadge();
    
    document.querySelectorAll(`.wish-toggle`).forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(re)) {
            const inWish = wishlist.some(i => i.re === re);
            btn.classList.toggle('active', inWish);
            const svg = btn.querySelector('svg');
            if (svg) svg.setAttribute('fill', inWish ? 'currentColor' : 'none');
        }
    });
}

function updateWishBadge() {
    const badge = document.getElementById('wish-count');
    if (badge) {
        badge.innerText = wishlist.length;
        badge.classList.toggle('hidden', wishlist.length === 0);
    }
}

function updateQty(re, delta) {
    const item = wishlist.find(i => i.re === re);
    if (item) {
        item.qty = Math.max(1, item.qty + delta);
        localStorage.setItem('citygems_wishlist', JSON.stringify(wishlist));
        renderWishlistModal();
    }
}

function clearWishlist() {
    if (!confirm('Очистить список избранного?')) return;
    wishlist = [];
    localStorage.removeItem('citygems_wishlist');
    updateWishBadge();
    closeWishlist();
    renderNextPage(true);
}

function openWishlist() {
    renderWishlistModal();
    document.getElementById('wishlist-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeWishlist() {
    document.getElementById('wishlist-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function renderWishlistModal() {
    const cont = document.getElementById('wish-items');
    if (!cont) return;
    if (wishlist.length === 0) {
        cont.innerHTML = '<div class="text-center opacity-50 py-10">Список пуст</div>';
        return;
    }
    let html = '';
    wishlist.forEach(item => {
        const d = db.find(x => x.re === item.re);
        if (!d) return;
        html += `
            <div class="flex items-center gap-4 border-b border-white/5 py-4">
                <img src="/data/img/${d.re}.jpg" class="w-12 h-12 object-cover bg-white/5">
                <div class="flex-1 min-w-0">
                    <div class="text-[10px] uppercase font-bold truncate">${d.ct} CT ${d.sh}</div>
                    <div class="text-[9px] opacity-50">${d.col} / ${d.cla}</div>
                </div>
                <div class="qty-ctrl flex items-center gap-2">
                    <button class="qty-btn" onclick="updateQty(${d.re}, -1)">-</button>
                    <span class="text-xs w-4 text-center">${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty(${d.re}, 1)">+</button>
                </div>
                <div class="text-xs font-bold w-20 text-right">${City.rubStr(City.rubGet(d.val) * item.qty)}</div>
            </div>`;
    });
    cont.innerHTML = html;
}

async function sendWishlist() {
    const link = City.genLink(wishlist, Gems.ds);
    const text = `Добрый день! Мой выбор на CityGems:\n${link}`;
    window.open(`https://wa.me/${City.tele()}?text=${encodeURIComponent(text)}`, '_blank');
}

// --- 7. ЭКСПОРТ В WINDOW (для работы onclick в HTML) ---
// ВАЖНО: Этот блок должен быть строго в конце файла
Object.assign(window, {
    navigate, toggleTheme, syncRange, syncInput, applyFilters, setView, 
    toggleWish, clearWishlist, updateQty, openWishlist, closeWishlist, 
    sendWishlist, renderNextPage, renderWishlistModal
});