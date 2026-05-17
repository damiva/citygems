import { gems as initDB } from './gems.js';

// Премиальная ссылка на форму сбора вишлистов в Яндекс.Формах
const YANDEX_FORM_WISHLIST_BASE = "https://forms.yandex.ru/u/65b2bc4cd046881234567890/";

document.addEventListener('DOMContentLoaded', async () => {
    // Получение ключевых элементов разметки
    const statusMsg = document.getElementById('status-msg');
    const appWrapper = document.getElementById('app-wrapper');
    const catalogContainer = document.getElementById('catalog-container');
    const paginationSection = document.getElementById('pagination-section');
    const counterTotal = document.getElementById('counter-total');
    
    const filterSh = document.getElementById('filter-sh');
    const filterCol = document.getElementById('filter-col');
    const filterCtMin = document.getElementById('filter-ct-min');
    const filterCtMax = document.getElementById('filter-ct-max');
    const filterValMin = document.getElementById('filter-val-min');
    const filterValMax = document.getElementById('filter-val-max');
    const clearFiltersLink = document.getElementById('clear-filters-link');

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageInfo = document.getElementById('page-info');
    
    const themeToggle = document.getElementById('theme-toggle');
    const viewGridBtn = document.getElementById('view-grid');
    const viewListBtn = document.getElementById('view-list');
    
    const navLinks = document.querySelectorAll('.nav-link');
    const tabSections = document.querySelectorAll('.tab-section');

    // Состояние приложения
    let currentMatches = [];
    let currentPage = 1;
    let currentView = localStorage.getItem('gems-view') || 'grid';
    let wishlist = JSON.parse(localStorage.getItem('gems-wishlist')) || [];
    let currentTab = 'catalog';

    // Загрузка оптимизированного ядра базы данных (gems.js)
    const db = await initDB();
    if (!db || !db.catalog) {
        statusMsg.innerHTML = `
            <div style="text-align:center; padding: 40px; font-family: serif; color:#d4af37;">
                <h2>Не удалось развернуть каталог CityGems</h2>
                <p style="color:#8a929e; font-size:10pt; margin-top:10px;">Проверьте целостность файла /db/gems.csv и сетевые доступы.</p>
            </div>`;
        return;
    }

    const catalog = db.catalog;

    // Успешная инициализация — отображение основного контейнера сайта
    statusMsg.classList.add('hidden');
    if (appWrapper) appWrapper.classList.remove('hidden');

    const itemsPerPage = db.limit || 20;

    // Восстановление темы из хранилища
    if (localStorage.getItem('gems-theme') === 'light') {
        document.documentElement.classList.add('light-theme');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('light-theme');
            localStorage.setItem('gems-theme', document.documentElement.classList.contains('light-theme') ? 'light' : 'dark');
        });
    }

    // Инициализация режимов отображения (Сетка / Список)
    applyViewSettings();

    [viewGridBtn, viewListBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            currentView = e.currentTarget.id === 'view-grid' ? 'grid' : 'list';
            localStorage.setItem('gems-view', currentView);
            applyViewSettings();
            renderPage();
        });
    });

    function applyViewSettings() {
        if (currentView === 'grid') {
            viewGridBtn?.classList.add('active');
            viewListBtn?.classList.remove('active');
            catalogContainer?.classList.replace('list-view', 'grid-view');
        } else {
            viewListBtn?.classList.add('active');
            viewGridBtn?.classList.remove('active');
            catalogContainer?.classList.replace('grid-view', 'list-view');
        }
    }

    // Навигационная система по вкладкам
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.currentTarget.getAttribute('data-tab'));
        });
    });

    function switchTab(tabId) {
        currentTab = tabId;
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-tab') === tabId));
        tabSections.forEach(s => s.classList.toggle('hidden', s.id !== `tab-${tabId}`));
        
        if (tabId === 'catalog') {
            applyFilters();
        } else if (tabId === 'wishlist') {
            renderWishlistTab();
        }
    }

    // Наполнение селекторов фильтров уникальными значениями из метаструктуры
    if (catalog.filters) {
        catalog.filters.sh?.forEach(sh => {
            const text = db.shapes.title(sh) || sh;
            filterSh?.insertAdjacentHTML('beforeend', `<option value="${sh}">${text}</option>`);
        });

        catalog.filters.col?.forEach(col => {
            filterCol?.insertAdjacentHTML('beforeend', `<option value="${col}">${col}</option>`);
        });

        if (catalog.filters.ct) {
            if (filterCtMin) filterCtMin.placeholder = `от ${catalog.filters.ct.min}`;
            if (filterCtMax) filterCtMax.placeholder = `до ${catalog.filters.ct.max}`;
        }
        if (catalog.filters.val) {
            if (filterValMin) filterValMin.placeholder = `от ${catalog.filters.val.min.toLocaleString('ru-RU')}`;
            if (filterValMax) filterValMax.placeholder = `до ${catalog.filters.val.max.toLocaleString('ru-RU')}`;
        }
    }

    // Высокооптимизированный строковый генератор разметки карточек
    function makeCardHtml(rowIndex) {
        const gem = catalog.row(rowIndex);
        if (!gem) return '';

        const shapeTitle = db.shapes.title(gem.sh) || gem.sh;
        const shapeImg = db.shapes.image(gem.sh) || 'db/default.svg';
        const formattedPrice = gem.val ? gem.val.toLocaleString('ru-RU') + ' ₽' : 'По запросу';
        const isSaved = wishlist.includes(rowIndex);
        
        // Прямой резерв отдельного лота
        const directOrderUrl = `${YANDEX_FORM_WISHLIST_BASE}?sh=${encodeURIComponent(gem.sh)}&ct=${gem.ct}&col=${encodeURIComponent(gem.col)}&cla=${encodeURIComponent(gem.cla)}&val=${gem.val}`;

        return `
            <div class="gem-card-premium ${currentView === 'list' ? 'card-row' : ''}" data-index="${rowIndex}">
                <button class="wishlist-btn ${isSaved ? 'in-wishlist' : ''}" aria-label="В коллекцию">
                    <svg viewBox="0 0 24 24" class="heart-icon">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>
                <div class="gem-image-wrapper">
                    <img src="${shapeImg}" alt="${shapeTitle}" class="gem-shape-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23666\\' stroke-width=\\'1\\'><path d=\\'M6 3h12l4 6-10 12L2 9z\\'/></svg>'">
                </div>
                <div class="gem-details">
                    <div class="gem-main-info">
                        <h3 class="gem-title-text">${shapeTitle} &middot; ${gem.ct.toFixed(2)} Ct</h3>
                        <span class="gem-price-tag">${formattedPrice}</span>
                    </div>
                    <div class="gem-specifications-grid">
                        <div class="spec-item"><span class="spec-label">Цвет</span><span class="spec-val">${gem.col}</span></div>
                        <div class="spec-item"><span class="spec-label">Чистота</span><span class="spec-val">${gem.cla}</span></div>
                        <div class="spec-item"><span class="spec-label">Огранка</span><span class="spec-val">${gem.cut || '—'}</span></div>
                        <div class="spec-item"><span class="spec-label">Экспертиза</span><span class="spec-val">${gem.lab || 'GIA'}</span></div>
                    </div>
                    <div class="gem-actions">
                        <a href="${directOrderUrl}" target="_blank" class="premium-order-btn">Резерв лота</a>
                    </div>
                </div>
            </div>
        `;
    }

    // Рендеринг основного каталога
    function renderPage() {
        if (currentTab !== 'catalog') return;

        if (currentMatches.length === 0) {
            catalogContainer.innerHTML = `
                <div class="empty-state-lux">
                    <p>Лоты с запрашиваемыми параметрами временно отсутствуют в основном хранилище.</p>
                    <button id="reset-all-filters" class="text-link-btn">Сбросить параметры поиска</button>
                </div>`;
            paginationSection?.classList.add('hidden');
            document.getElementById('reset-all-filters')?.addEventListener('click', clearFiltersAction);
            return;
        }

        paginationSection?.classList.remove('hidden');
        const totalPages = Math.ceil(currentMatches.length / itemsPerPage);
        if (currentPage > totalPages) currentPage = totalPages || 1;

        const start = (currentPage - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, currentMatches.length);
        
        let htmlBuffer = '';
        for (let i = start; i < end; i++) {
            htmlBuffer += makeCardHtml(currentMatches[i]);
        }

        catalogContainer.innerHTML = htmlBuffer;
        bindWishlistInteractions();

        if (pageInfo) pageInfo.textContent = `${currentPage} / ${totalPages}`;
        if (btnPrev) btnPrev.disabled = currentPage === 1;
        if (btnNext) btnNext.disabled = currentPage === totalPages || totalPages === 0;
    }

    // Рендеринг и управление вкладкой Избранного
    function renderWishlistTab() {
        const wishlistContainer = document.getElementById('wishlist-container');
        const actionPanel = document.getElementById('wishlist-action-panel');
        const panelCount = document.getElementById('wishlist-panel-count');
        
        if (!wishlistContainer) return;

        if (wishlist.length === 0) {
            wishlistContainer.innerHTML = `
                <div class="empty-state-lux">
                    <p>Ваша коллекция избранного пуста.</p>
                    <button class="premium-action-btn" id="nav-to-catalog">Вернуться к каталогу</button>
                </div>`;
            actionPanel?.classList.add('hidden');
            document.getElementById('nav-to-catalog')?.addEventListener('click', () => switchTab('catalog'));
            return;
        }

        actionPanel?.classList.remove('hidden');
        if (panelCount) panelCount.textContent = wishlist.length;

        let htmlBuffer = '';
        wishlist.forEach(idx => {
            htmlBuffer += makeCardHtml(idx);
        });
        
        wishlistContainer.innerHTML = htmlBuffer;
        bindWishlistInteractions();
    }

    // Слушатель кликов по сердечкам
    function bindWishlistInteractions() {
        document.querySelectorAll('.wishlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = e.currentTarget.closest('[data-index]');
                const index = parseInt(card.getAttribute('data-index'), 10);
                
                const position = wishlist.indexOf(index);
                if (position > -1) {
                    wishlist.splice(position, 1);
                    e.currentTarget.classList.remove('in-wishlist');
                    if (currentTab === 'wishlist') {
                        card.remove();
                        if (wishlist.length === 0) renderWishlistTab();
                        else {
                            const panelCount = document.getElementById('wishlist-panel-count');
                            if (panelCount) panelCount.textContent = wishlist.length;
                        }
                    }
                } else {
                    wishlist.push(index);
                    e.currentTarget.classList.add('in-wishlist');
                }
                
                localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
                updateWishlistBadges();
            });
        });
    }

    function updateWishlistBadges() {
        const badges = document.querySelectorAll('.wishlist-count-badge');
        badges.forEach(badge => {
            if (wishlist.length > 0) {
                badge.textContent = wishlist.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        });
    }

    // МАГИЯ ГРУППОВОЙ ОТПРАВКИ WISHLIST В ЯНДЕКС.ФОРМЫ
    const submitWishlistBtn = document.getElementById('submit-wishlist-form-btn');
    if (submitWishlistBtn) {
        submitWishlistBtn.addEventListener('click', () => {
            if (wishlist.length === 0) return;

            let descriptionString = "Запрос статуса наличия для партии бриллиантов:\\n\\n";
            
            wishlist.forEach((rowIndex, i) => {
                const gem = catalog.row(rowIndex);
                if (gem) {
                    const shTitle = db.shapes.title(gem.sh) || gem.sh;
                    descriptionString += `Лот #${i + 1}: ${shTitle} | ${gem.ct.toFixed(2)}ct | Цвет: ${gem.col} | Чистота: ${gem.cla} | Огранка: ${gem.cut || '—'} | Цена: ${gem.val ? gem.val.toLocaleString('ru-RU') + ' ₽' : 'По запросу'}\\n`;
                }
            });

            // "text" — замените на внутренний ID большого текстового поля в вашей Яндекс.Форме
            const paramName = "text"; 
            const finalFormUrl = `${YANDEX_FORM_WISHLIST_BASE}?${paramName}=${encodeURIComponent(descriptionString)}`;

            window.open(finalFormUrl, '_blank');
        });
    }

    // Поисковая фильтрация
    function applyFilters() {
        const query = {};

        if (filterSh?.value) query.sh = filterSh.value;
        if (filterCol?.value) query.col = filterCol.value;

        const ctMin = parseFloat(filterCtMin?.value);
        const ctMax = parseFloat(filterCtMax?.value);
        if (!isNaN(ctMin) || !isNaN(ctMax)) {
            query.ct = {};
            if (!isNaN(ctMin)) query.ct.min = ctMin;
            if (!isNaN(ctMax)) query.ct.max = ctMax;
        }

        const valMin = parseFloat(filterValMin?.value);
        const valMax = parseFloat(filterValMax?.value);
        if (!isNaN(valMin) || !isNaN(valMax)) {
            query.val = {};
            if (!isNaN(valMin)) query.val.min = valMin;
            if (!isNaN(valMax)) query.val.max = valMax;
        }

        currentMatches = catalog.find(query);
        if (counterTotal) counterTotal.textContent = currentMatches.length.toLocaleString('ru-RU');
        currentPage = 1; 
        renderPage();
    }

    // Debounce для инпутов
    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    const debouncedApplyFilters = debounce(applyFilters, 250);

    filterSh?.addEventListener('change', applyFilters);
    filterCol?.addEventListener('change', applyFilters);
    
    [filterCtMin, filterCtMax, filterValMin, filterValMax].forEach(el => {
        el?.addEventListener('input', debouncedApplyFilters);
    });

    function clearFiltersAction() {
        [filterSh, filterCol, filterCtMin, filterCtMax, filterValMin, filterValMax].forEach(el => {
            if (el) el.value = '';
        });
        applyFilters();
    }

    clearFiltersLink?.addEventListener('click', (e) => {
        e.preventDefault();
        clearFiltersAction();
    });

    // Навигация
    btnPrev?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    btnNext?.addEventListener('click', () => {
        const totalPages = Math.ceil(currentMatches.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    updateWishlistBadges();
    applyFilters();
});