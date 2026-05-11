let db = [], filtered = [], currentIndex = 0, rate = 105, view = 'list', isRendering = false;

const parse = (v) => parseFloat(String(v || '').replace(',', '.')) || 0;

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    document.getElementById('theme-label').innerText = document.body.classList.contains('light-theme') ? 'Светлая тема' : 'Тёмная тема';
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
    // Подгрузка форм из конфига
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

    document.getElementById('counter').innerHTML = `Найдено: <span style="color:var(--text-main)">${filtered.length.toLocaleString()}</span>`;
    renderNextPage(true);
}

function setView(v) {
    view = v;
    document.getElementById('v-list').classList.toggle('active-btn', v === 'list');
    document.getElementById('v-grid').classList.toggle('active-btn', v === 'grid');
    document.getElementById('catalog').className = (v === 'grid') ? 'view-grid' : 'view-list';
    renderNextPage(true);
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
        
        if (view === 'list') {
            html += `
            <div class="diamond-card p-5 flex flex-col md:flex-row items-center gap-8">
                <div class="w-24 h-24 bg-black/10 relative flex-shrink-0">
                    <div class="absolute top-0 left-0 bg-stone-800 text-[8px] text-white px-2 py-0.5 z-10 font-bold uppercase">${d.lab}</div>
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
                        <div>Cut/Sym: ${d.cut}/${d.sym}</div>
                        <div>Pol: ${d.pol}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-bold mb-2" style="color:var(--text-main)">${priceStr} ₽</div>
                        <button onclick="contact('${d.id}')" class="text-[9px] border border-stone-800 px-5 py-2 uppercase tracking-widest hover:bg-white hover:text-black transition-all" style="color:var(--text-main)">Запросить</button>
                    </div>
                </div>
            </div>`;
        } else {
            html += `
            <div class="diamond-card p-6 flex flex-col">
                <div class="aspect-square bg-black/10 mb-5 relative overflow-hidden">
                    <div class="absolute top-3 left-3 bg-stone-800 text-[8px] text-white px-2 py-1 z-10 font-bold uppercase">${d.lab}</div>
                    <video src="${video}" autoplay loop muted playsinline class="w-full h-full object-contain p-4"></video>
                </div>
                <div class="flex justify-between items-baseline mb-4">
                    <span class="text-2xl font-light" style="color:var(--text-main)">${d.ct} ct</span>
                    <span class="text-lg font-bold" style="color:var(--text-main)">${priceStr} ₽</span>
                </div>
                <div class="text-[10px] uppercase tracking-widest opacity-60 pb-3 mb-4 border-b" style="border-color: var(--border)">
                    ${DIAMOND_CONFIG.s[d.sh] || d.sh} • ${d.col} • ${d.cla}
                </div>
                <div class="grid grid-cols-2 gap-2 text-[9px] uppercase tracking-widest opacity-50 mb-6">
                    <span>Cut: ${d.cut}</span><span>Sym: ${d.sym}</span>
                    <span>Pol: ${d.pol}</span><span>${d.s1}x${d.s2}mm</span>
                </div>
                <button onclick="contact('${d.id}')" class="w-full py-4 border border-stone-800 text-[9px] uppercase tracking-widest hover:bg-white hover:text-black transition-all" style="color:var(--text-main)">Запросить</button>
            </div>`;
        }
    });
    
    cont.insertAdjacentHTML('beforeend', html);
    currentIndex += page.length;
    document.getElementById('more-box').classList.toggle('hidden', currentIndex >= filtered.length);
    isRendering = false;
}

function contact(id) { 
    const tg = `https://t.me/${atob(DIAMOND_CONFIG.c.t)}`;
    window.open(tg + "?text=" + encodeURIComponent("Здравствуйте! Меня заинтересовал бриллиант #" + id), "_blank");
}

init();