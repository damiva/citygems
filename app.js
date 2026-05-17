import { gems as initDB } from './gems.js';

const YANDEX_FORM_BASE = "https://forms.yandex.ru/u/65b2bc4cd046881234567890/";

document.addEventListener('DOMContentLoaded', async () => {
    const statusMsg = document.getElementById('status-msg');
    const filtersSection = document.getElementById('filters-section');
    const catalogContainer = document.getElementById('catalog-container');
    const paginationSection = document.getElementById('pagination-section');
    
    const filterSh = document.getElementById('filter-sh');
    const filterCol = document.getElementById('filter-col');
    const filterCtMin = document.getElementById('filter-ct-min');
    const filterCtMax = document.getElementById('filter-ct-max');
    const filterValMin = document.getElementById('filter-val-min');
    const filterValMax = document.getElementById('filter-val-max');

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageInfo = document.getElementById('page-info');

    // Инициализация базы данных
    const db = await initDB();
    if (!db) {
        statusMsg.textContent = "Не удалось загрузить каталог. Пожалуйста, обновите страницу позже.";
        return;
    }

    statusMsg.classList.add('hidden');
    filtersSection.classList.remove('hidden');

    let currentMatches = [];
    let currentPage = 1;
    const itemsPerPage = db.limit || 20;

    // Заполнение фильтров
    if (db.gems.filters) {
        db.gems.filters.sh?.forEach(sh => {
            const label = db.shapes.title(sh) || sh;
            filterSh.insertAdjacentHTML('beforeend', `<option value="${sh}">${label}</option>`);
        });

        db.gems.filters.col?.forEach(col => {
            filterCol.insertAdjacentHTML('beforeend', `<option value="${col}">${col}</option>`);
        });

        if (db.gems.filters.ct) {
            filterCtMin.placeholder = `от ${db.gems.filters.ct.min}`;
            filterCtMax.placeholder = `до ${db.gems.filters.ct.max}`;
        }
        if (db.gems.filters.val) {
            filterValMin.placeholder = `от ${db.gems.filters.val.min}`;
            filterValMax.placeholder = `до ${db.gems.filters.val.max}`;
        }
    }

    // ОПТИМИЗИРОВАННЫЙ РЕНДЕР
    function renderPage() {
        if (currentMatches.length === 0) {
            catalogContainer.innerHTML = '<div class="no-results">Камни с указанными параметрами не найдены.</div>';
            paginationSection.classList.add('hidden');
            return;
        }

        paginationSection.classList.remove('hidden');
        const totalPages = Math.ceil(currentMatches.length / itemsPerPage);
        
        if (currentPage > totalPages) currentPage = totalPages || 1;

        const start = (currentPage - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, currentMatches.length);
        
        // Оптимизация: собираем всё в одну большую строку в оперативной памяти
        let htmlBuffer = '';
        
        for (let i = start; i < end; i++) {
            const rowIndex = currentMatches[i];
            const gem = db.gems.row(rowIndex);
            if (!gem) continue;

            const shapeTitle = db.shapes.title(gem.sh) || gem.sh;
            const shapeImg = db.shapes.image(gem.sh) || 'db/default.svg';
            const formattedPrice = gem.val ? gem.val.toLocaleString('ru-RU') + ' ₽' : 'По запросу';
            
            const orderUrl = `${YANDEX_FORM_BASE}?sh=${encodeURIComponent(gem.sh)}&ct=${gem.ct}&col=${encodeURIComponent(gem.col)}&cla=${encodeURIComponent(gem.cla)}&val=${gem.val}`;

            htmlBuffer += `
                <div class="gem-card">
                    <div class="gem-image-wrapper">
                        <img src="${shapeImg}" alt="${shapeTitle}" class="gem-shape-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'50\\' height=\\'50\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23666\\' stroke-width=\\'1\\'><path d=\\'M6 3h12l4 6-10 12L2 9z\\'/></svg>'">
                    </div>
                    <div class="gem-info">
                        <div class="gem-title">${shapeTitle} ${gem.ct.toFixed(2)} ct</div>
                        <div class="gem-specs">
                            <span>Цвет: <strong>${gem.col}</strong></span>
                            <span>Чистота: <strong>${gem.cla}</strong></span>
                            <span>Огранка: <strong>${gem.cut || '—'}</strong></span>
                            <span>Лаборатория: <strong>${gem.lab || 'GIA'}</strong></span>
                        </div>
                        <div class="gem-price-box">
                            <span class="gem-price">${formattedPrice}</span>
                            <a href="${orderUrl}" target="_blank" class="order-btn">Заказать</a>
                        </div>
                    </div>
                </div>
            `;
        }

        // Рендерим на страницу ОДНИМ действием. Браузер скажет спасибо.
        catalogContainer.innerHTML = htmlBuffer;

        pageInfo.textContent = `Страница ${currentPage} из ${totalPages}`;
        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages || totalPages === 0;
    }

    // Функция фильтрации
    function applyFilters() {
        const query = {};

        if (filterSh.value) query.sh = filterSh.value;
        if (filterCol.value) query.col = filterCol.value;

        const ctMin = parseFloat(filterCtMin.value);
        const ctMax = parseFloat(filterCtMax.value);
        if (!isNaN(ctMin) || !isNaN(ctMax)) {
            query.ct = {};
            if (!isNaN(ctMin)) query.ct.min = ctMin;
            if (!isNaN(ctMax)) query.ct.max = ctMax;
        }

        const valMin = parseFloat(filterValMin.value);
        const valMax = parseFloat(filterValMax.value);
        if (!isNaN(valMin) || !isNaN(valMax)) {
            query.val = {};
            if (!isNaN(valMin)) query.val.min = valMin;
            if (!isNaN(valMax)) query.val.max = valMax;
        }

        currentMatches = db.gems.find(query);
        currentPage = 1; 
        renderPage();
    }

    // ПАТТЕРН DEBOUNCE (Задержка выполнения для инпутов ввода)
    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    const debouncedApplyFilters = debounce(applyFilters, 300);

    // Привязка событий: выпадающие списки бьют сразу, инпуты — через дебаунс
    filterSh.addEventListener('change', applyFilters);
    filterCol.addEventListener('change', applyFilters);
    
    [filterCtMin, filterCtMax, filterValMin, filterValMax].forEach(el => {
        el.addEventListener('input', debouncedApplyFilters);
    });

    // Пагинация
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    btnNext.addEventListener('click', () => {
        const totalPages = Math.ceil(currentMatches.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Стартовый запуск
    applyFilters();
});