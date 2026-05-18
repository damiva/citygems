import { gems as initDB } from './gems.js';

// Ссылка на форму сбора вишлистов в Яндекс.Формах
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
    const logoZone = document.getElementById('logo-zone');

    // --- Логика мобильного меню (Бургер) ---
    const menuToggle = document.getElementById('menu-toggle');
    const navAndControls = document.getElementById('nav-and-controls');
    if (menuToggle && navAndControls) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            menuToggle.classList.toggle('active');
            navAndControls.classList.toggle('active');
        });
        navAndControls.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                navAndControls.classList.remove('active');
            });
        });
        document.addEventListener('click', (e) => {
            if (!navAndControls.contains(e.target) && !menuToggle.contains(e.target)) {
                menuToggle.classList.remove('active');
                navAndControls.classList.remove('active');
            }
        });
    }

    // Состояние приложения
    let currentMatches = [];
    let currentPage = 1;
    let currentView = localStorage.getItem('gems-view') || 'grid';
    let wishlist = JSON.parse(localStorage.getItem('gems-wishlist')) || [];
    
    // МИГРАЦИЯ ДАННЫХ: переход от массива индексов [1, 2] к массиву объектов [{id: 1, count: 1}]
    if (wishlist.length > 0 && typeof wishlist[0] === 'number') {
        wishlist = wishlist.map(id => ({ id, count: 1 }));
    }
    
    let currentTab = 'catalog';

    // Загрузка оптимизированного ядра базы данных (gems.js)
    const db = await initDB();
    if (!db || !db.gems) {
        statusMsg.innerHTML = `
            <div style="text-align:center; padding: 40px; font-family: serif; color:#d4af37;">
                <h2>Не удалось развернуть каталог CityGems</h2>
                <p style="color:#8a929e; font-size:10pt; margin-top:10px;">Проверьте целостность файла /db/gems.csv и сетевые доступы.</p>
            </div>`;
        return;
    }

    const catalog = db.gems;

    statusMsg.classList.add('hidden');
    if (appWrapper) appWrapper.classList.remove('hidden');

    const itemsPerPage = db.limit || 20;

    // Восстановление и инициализация темы из хранилища (без перезаписи SVG структуры)
    const savedTheme = localStorage.getItem('gems-theme');
    const isLightInitial = savedTheme === 'light';
    if (isLightInitial) {
        document.documentElement.classList.add('light-theme');
    } else {
        document.documentElement.classList.remove('light-theme');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isLight = document.documentElement.classList.toggle('light-theme');
            localStorage.setItem('gems-theme', isLight ? 'light' : 'dark');
        });
    }

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

    // Изменение/применение CSS классов отображения сетки или списка
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

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.currentTarget.getAttribute('data-tab'));
        });
    });

    if (logoZone) {
        logoZone.addEventListener('click', () => {
            switchTab('about');
        });
    }

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

    if (catalog.filters) {
        catalog.filters.sh?.forEach(sh => {
            const text = db.shapes[sh]?.txt || sh;
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

    // Генерация HTML-разметки карточки лота
    function makeCardHtml(rowIndex) {
        const gem = catalog.row(rowIndex);
        if (!gem) return '';

        const shapeTitle = db.shapes[gem.sh]?.txt || gem.sh;
        const shapeImg = db.shapes[gem.sh]?.img ? db.shapes[gem.sh].img : '';
        const formattedPrice = gem.val ? gem.val.toLocaleString('ru-RU') + ' ₽' : 'По запросу';
        
        const wishlistItem = wishlist.find(item => item.id === rowIndex);
        const isSaved = !!wishlistItem;
        const count = wishlistItem ? wishlistItem.count : 1;
        
        // Форматирование габаритов s1 x s2 x s3
        const formattedSize = (gem.s1 && gem.s2 && gem.s3) ? `${gem.s1.toFixed(2)} × ${gem.s2.toFixed(2)} × ${gem.s3.toFixed(2)} мм` : '—';

        // Панель управления количеством и кнопка удаления (только для вкладки Избранного)
        const wishlistControlsHtml = (currentTab === 'wishlist') ? `
            <div class="wishlist-qty-container" style="display: flex; align-items: center; gap: 10px; margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
                <span class="spec-label" style="font-size: 11px; color: var(--text-secondary, #8a929e);">Кол-во:</span>
                <div class="qty-controls" style="display: flex; align-items: center; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden; background: rgba(0,0,0,0.15);">
                    <button class="qty-btn btn-minus" data-index="${rowIndex}" style="background: none; border: none; color: var(--text-primary); padding: 4px 10px; cursor: pointer; font-weight: bold; font-size: 14px;">-</button>
                    <input type="number" class="qty-input" data-index="${rowIndex}" value="${count}" min="1" style="width: 35px; text-align: center; background: none; border: none; color: var(--text-primary); font-size: 13px; font-weight: bold; -moz-appearance: textfield; padding: 0;">
                    <button class="qty-btn btn-plus" data-index="${rowIndex}" style="background: none; border: none; color: var(--text-primary); padding: 4px 10px; cursor: pointer; font-weight: bold; font-size: 14px;">+</button>
                </div>
                <button class="remove-wishlist-item-btn" data-index="${rowIndex}" style="background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 12px; margin-left: auto; display: flex; align-items: center; gap: 4px; font-weight: 500;">
                    🗑️ Удалить
                </button>
            </div>
        ` : '';

        return `
            <div class="gem-card-premium ${currentView === 'list' ? 'card-row' : ''}" data-index="${rowIndex}" style="position: relative;">
                <div class="gem-lab-badge" style="position: absolute; top: 12px; left: 12px; background: rgba(0, 0, 0, 0.75); color: #d4af37; padding: 3px 8px; font-size: 11px; font-weight: 600; border-radius: 4px; letter-spacing: 0.5px; z-index: 2; border: 1px solid rgba(212, 175, 55, 0.4); font-family: sans-serif;">
                    ${gem.lab || 'GIA'}
                </div>
                <button class="wishlist-btn ${isSaved ? 'in-wishlist' : ''}" aria-label="В коллекцию">
                    <svg viewBox="0 0 24 24" class="heart-icon">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>
                <div class="gem-image-wrapper">
                    ${shapeImg ? `
                        <img src="${shapeImg}" alt="${shapeTitle}" class="gem-shape-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23666\\' stroke-width=\\'1\\'><path d=\\'M6 3h12l4 6-10 12L2 9z\\'/></svg>';">
                    ` : `
                        <div class="gem-placeholder-icon" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;color:var(--text-secondary);">💎</div>
                    `}
                </div>
                <div class="gem-details">
                    <div class="gem-main-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px; margin-bottom: 10px;">
                        <h3 class="gem-title-text" style="margin: 0; font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${shapeTitle}</h3>
                        <span class="gem-price-tag" style="margin-left: auto; white-space: nowrap; font-size: 14px; font-weight: 700; color: #d4af37;">${gem.ct.toFixed(2)} Ct &middot; ${formattedPrice}</span>
                    </div>
                    <div class="gem-specifications-grid">
                        <div class="spec-item"><span class="spec-label">Цвет</span><span class="spec-val">${gem.col}</span></div>
                        <div class="spec-item"><span class="spec-label">Чистота</span><span class="spec-val">${gem.cla}</span></div>
                        <div class="spec-item"><span class="spec-label">Огранка</span><span class="spec-val">${gem.cut || '—'}</span></div>
                        <div class="spec-item"><span class="spec-label">Размер</span><span class="spec-val">${formattedSize}</span></div>
                    </div>
                    ${wishlistControlsHtml}
                </div>
            </div>
        `;
    }

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
        wishlist.forEach(item => {
            htmlBuffer += makeCardHtml(item.id);
        });
        
        wishlistContainer.innerHTML = htmlBuffer;
        bindWishlistInteractions();
    }

    function bindWishlistInteractions() {
        // Логика нажатия на "Сердечко" на любой вкладке
        document.querySelectorAll('.wishlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = e.currentTarget.closest('[data-index]');
                const index = parseInt(card.getAttribute('data-index'), 10);
                
                const position = wishlist.findIndex(item => item.id === index);
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
                    wishlist.push({ id: index, count: 1 });
                    e.currentTarget.classList.add('in-wishlist');
                }
                
                localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
                updateWishlistBadges();
            });
        });

        // События изменения количества и полного удаления только внутри Вишлиста
        if (currentTab === 'wishlist') {
            document.querySelectorAll('.qty-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                    const isPlus = e.currentTarget.classList.contains('btn-plus');
                    const item = wishlist.find(item => item.id === index);
                    if (item) {
                        if (isPlus) {
                            item.count++;
                        } else if (item.count > 1) {
                            item.count--;
                        }
                        const input = e.currentTarget.parentElement.querySelector('.qty-input');
                        if (input) input.value = item.count;
                        localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
                    }
                });
            });

            document.querySelectorAll('.qty-input').forEach(input => {
                input.addEventListener('change', (e) => {
                    const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                    let val = parseInt(e.currentTarget.value, 10);
                    if (isNaN(val) || val < 1) val = 1;
                    e.currentTarget.value = val;
                    const item = wishlist.find(item => item.id === index);
                    if (item) {
                        item.count = val;
                        localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
                    }
                });
            });

            document.querySelectorAll('.remove-wishlist-item-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                    const position = wishlist.findIndex(item => item.id === index);
                    if (position > -1) {
                        wishlist.splice(position, 1);
                        localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
                        renderWishlistTab();
                        updateWishlistBadges();
                    }
                });
            });
        }
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

    // Сборка данных для формы с учетом измененного количества лотов
    const submitWishlistBtn = document.getElementById('submit-wishlist-form-btn');
    if (submitWishlistBtn) {
        submitWishlistBtn.addEventListener('click', () => {
            if (wishlist.length === 0) return;

            let descriptionString = "Запрос статуса наличия для партии бриллиантов:\n\n";
            
            wishlist.forEach((item, i) => {
                const gem = catalog.row(item.id);
                if (gem) {
                    const shTitle = db.shapes[gem.sh]?.txt || gem.sh;
                    descriptionString += `Лот #${i + 1}: ${shTitle} | ${gem.ct.toFixed(2)}ct | Цвет: ${gem.col} | Чистота: ${gem.cla} | Огранка: ${gem.cut || '—'} | Количество: ${item.count} | Цена: ${gem.val ? gem.val.toLocaleString('ru-RU') + ' ₽' : 'По запросу'}\n`;
                }
            });

            const paramName = "text"; 
            const finalFormUrl = `${YANDEX_FORM_WISHLIST_BASE}?${paramName}=${encodeURIComponent(descriptionString)}`;
            window.open(finalFormUrl, '_blank');
        });
    }

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
        
        if (counterTotal) {
            const totalGemsCount = catalog.cat.val ? catalog.cat.val.length : 0;
            counterTotal.innerHTML = `Найдено: <strong>${currentMatches.length.toLocaleString('ru-RU')}</strong> из ${totalGemsCount.toLocaleString('ru-RU')}`;
        }
        
        currentPage = 1; 
        renderPage();
    }

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
    switchTab('about'); // По умолчанию открывать вкладку "О нас" при старте
});