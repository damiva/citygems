import { City } from './city.js';
import { Gems } from '/data/gems.js';

let db = [], filtered = [], currentIndex = 0, view = 'list', isRendering = false;
let wishlist = JSON.parse(localStorage.getItem('citygems_wishlist') || '[]');

// Экспорт в window (оставляем как есть для работы onclick в HTML)
Object.assign(window, {
    navigate, toggleTheme, syncRange, syncInput, applyFilters, setView, 
    toggleWish, clearWishlist, updateQty, openWishlist, closeWishlist, 
    sendWishlist, renderNextPage, renderWishlistModal
});

// --- 1. ЗАГРУЗКА ---
async function loadPageContent(pageId, fileName) {
    const container = document.getElementById(pageId);
    if (!container) return;
    try {
        const response = await fetch(fileName);
        if (response.ok) {
            container.innerHTML = await response.text();
            // Вызываем дешифрацию (atob) для контактов
            const selector = '[data-text], [data-link]';
            container.querySelectorAll(selector).forEach(el => {
                if (el.dataset.text) el.innerHTML = decodeURIComponent(escape(atob(el.dataset.text)));
                if (el.dataset.link) el.href = decodeURIComponent(escape(atob(el.dataset.link)));
            });
        }
    } catch (err) { console.error("Load error:", err); }
}

function navigate(pageId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(pageId)?.classList.remove('hidden');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`button[onclick="navigate('${pageId}')"]`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 2. ИНИЦИАЛИЗАЦИЯ И РАСЧЕТЫ ---
async function init() {
    await City.updateRate(); // Обновляем курс

    // Подгружаем контент SPA
    await loadPageContent('home-content', 'about.html');
    await loadPageContent('contacts-content', 'contacts.html');
    navigate('page-home');

    // Настройка селекта форм
    const shapeSel = document.getElementById('f-shape');
    if (shapeSel && Gems.shapes) {
        shapeSel.innerHTML = '<option value="">Все формы</option>';
        Object.entries(Gems.shapes).forEach(([k, v]) => {
            shapeSel.innerHTML += `<option value="${k}">${v.n}</option>`;
        });
    }

    // ТРАНСФОРМАЦИЯ БД: Пересчитываем USD (val) в RUB один раз
    db = Gems.db.map(d => {
        d.val = City.rubGet(d.val); 
        return d;
    });

    // Настройка слайдеров (теперь они работают с уже готовым d.val)
    const setupR = (type) => {
        const vals = db.map(x => type === 'w' ? x.ct : x.val);
        const min = Math.min(...vals), max = Math.max(...vals);
        ['r-min-', 'r-max-', 'i-min-', 'i-max-'].forEach(id => {
            const el = document.getElementById(id + type);
            if(el) { el.min = min; el.max = max; el.step = type === 'w' ? 0.01 : 1000; }
        });
        document.getElementById('r-min-'+type).value = min;
        document.getElementById('r-max-'+type).value = max;
        syncRange(type, 'min'); 
    };
    if(db.length > 0) { setupR('w'); setupR('p'); }

    applyFilters();
}

function applyFilters() {
    const shape = document.getElementById('f-shape').value;
    const minW = parseFloat(document.getElementById('i-min-w').value);
    const maxW = parseFloat(document.getElementById('i-max-w').value);
    const minP = parseFloat(document.getElementById('i-min-p').value);
    const maxP = parseFloat(document.getElementById('i-max-p').value);
    const sort = document.getElementById('sort-order').value;

    filtered = db.filter(x => 
        (!shape || x.sh === shape) && 
        (x.ct >= minW && x.ct <= maxW) && 
        (x.val >= minP && x.val <= maxP)
    );

    const sortMap = {
        'p-asc': (a,b) => a.val - b.val,
        'p-desc': (a,b) => b.val - a.val,
        'w-asc': (a,b) => a.ct - b.ct,
        'w-desc': (a,b) => b.ct - a.ct
    };
    if (sortMap[sort]) filtered.sort(sortMap[sort]);

    const updateDate = new Date(Gems.ds * 86400000).toLocaleDateString('ru-RU');
    document.getElementById('counter').innerHTML = `
        Найдено: <span style="color:var(--text-main)">${filtered.length}</span>
        <div style="font-size: 8px; opacity: 0.4; margin-top: 4px;">КАТАЛОГ ОТ: ${updateDate}</div>
    `;
    renderNextPage(true);
}

// --- 3. РЕНДЕРИНГ ---
function renderNextPage(reset = false) {
    if (isRendering) return;
    isRendering = true;
    const cont = document.getElementById('catalog');
    if (reset) { cont.innerHTML = ''; currentIndex = 0; }
    
    const page = filtered.slice(currentIndex, currentIndex + City.items);
    const t = Gems.titles || {}; // Маппинг русских названий из gems.js
    let html = '';
    
    page.forEach(d => {
        const priceStr = City.rubStr(d.val); // Используем готовую функцию форматирования
        const shapeName = Gems.shapes[d.sh]?.n || d.sh;
        const dims = `${d.s1} x ${d.s2} x ${d.s3} мм`;
        const inWish = wishlist.some(i => i.re === d.re);
        
        const wishBtn = `
            <button onclick="event.stopPropagation(); toggleWish('${d.re}')" 
                    class="wish-toggle ${inWish ? 'active' : ''}">
                <svg viewBox="0 0 24 24" fill="${inWish ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </button>`;

        if (view === 'list') {
            html += `
            <div class="diamond-card p-5 flex flex-col md:flex-row items-center gap-8">
                <div class="w-24 h-24 bg-black/10 relative">
                    <div class="absolute top-0 left-0 bg-stone-800 text-[8px] text-white px-2 py-0.5 z-10 uppercase"><span class="verified-icon"></span>${d.lab}</div>
                    <img src="/data/img/${d.re}.jpg" onerror="this.style.opacity=0" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-6 items-center">
                    <div>
                        <div class="serif italic text-xl">${shapeName}</div>
                        <div class="text-2xl font-light">${d.ct} CT</div>
                    </div>
                    <div class="text-[10px] uppercase opacity-70">
                        <div>${t.col || 'Цвет'}: <span>${d.col}</span></div>
                        <div>${t.cla || 'Чистота'}: <span>${d.cla}</span></div>
                    </div>
                    <div class="text-[10px] uppercase opacity-70">
                        <div>${t.cut || 'Огр'}: <span>${d.cut}</span></div>
                        <div>Размеры: <span>${dims}</span></div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-bold mb-2">${priceStr}</div>
                        ${wishBtn}
                    </div>
                </div>
            </div>`;
        } else {
            // Сетка (Grid)
            html += `
            <div class="diamond-card p-6 flex flex-col">
                <div class="aspect-square bg-black/10 mb-5 relative">
                    <img src="/data/img/${d.re}.jpg" onerror="this.style.opacity=0" class="w-full h-full object-cover">
                </div>
                <div class="flex justify-between items-baseline mb-4">
                    <span class="text-2xl font-light">${d.ct} ct</span>
                    <span class="text-lg font-bold">${priceStr}</span>
                </div>
                <div class="text-[10px] uppercase opacity-60 pb-3 mb-4 border-b border-white/10">
                    ${shapeName} • ${d.col} • ${d.cla}
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
    document.getElementById('more-box').classList.toggle('hidden', currentIndex >= filtered.length);
    isRendering = false;
}

// ... (остальные функции: toggleWish, sendWishlist и т.д. остаются без изменений, но используют d.re вместо d.id)

init();