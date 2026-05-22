import gemsCatalogPromise from './gems.js';

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

    // Кэшируем шаблон один раз, чтобы не искать его в DOM при рендере каждой карточки
    const cardTemplate = document.getElementById('gem-card-template');

    // Состояние приложения
    let currentMatches = [];
    let currentPage = 1;
    let currentView = localStorage.getItem('gems-view') || 'grid';
    let wishlist = JSON.parse(localStorage.getItem('gems-wishlist')) || [];
    
    // МИГРАЦИЯ ДАННЫХ
    if (wishlist.length > 0 && typeof wishlist[0] === 'number') {
        wishlist = wishlist.map(id => ({ id, count: 1 }));
    }
    
    let currentTab = 'catalog';

    // Загрузка через Promise экспорт по умолчанию
    const db = await gemsCatalogPromise;
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

    // Инициализация темы
    if (localStorage.getItem('gems-theme') === 'light') {
        document.documentElement.classList.add('light-theme');
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
        logoZone.addEventListener('click', () => switchTab('about'));
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

    function createCardElement(rowIndex, wishlistItem) {
        const gem = catalog.row(rowIndex);
        if (!gem || !cardTemplate) return null;

        const clone = cardTemplate.content.cloneNode(true);
        const cardNode = clone.querySelector('.gem-card-premium');
        
        if (currentView === 'list') cardNode.classList.add('card-row');
        cardNode.setAttribute('data-index', rowIndex);

        cardNode.querySelector('[data-field="lab"]').textContent = gem.lab || 'GIA';
        cardNode.querySelector('[data-field="title"]').textContent = db.shapes[gem.sh]?.txt || gem.sh;
        
        const formattedPrice = gem.val ? gem.val.toLocaleString('ru-RU') + ' ₽' : 'По запросу';
        cardNode.querySelector('[data-field="price"]').textContent = `${gem.ct.toFixed(2)} Ct · ${formattedPrice}`;
        
        cardNode.querySelector('[data-field="color"]').textContent = gem.col;
        cardNode.querySelector('[data-field="clarity"]').textContent = gem.cla;
        cardNode.querySelector('[data-field="cut"]').textContent = gem.cut || '—';
        
        const formattedSize = (gem.s1 && gem.s2 && gem.s3) ? `${gem.s1.toFixed(2)} × ${gem.s2.toFixed(2)} × ${gem.s3.toFixed(2)} мм` : '—';
        cardNode.querySelector('[data-field="size"]').textContent = formattedSize;

        const wishlistBtn = cardNode.querySelector('.wishlist-btn');
        if (wishlistItem) wishlistBtn.classList.add('in-wishlist');

        const imgWrapper = cardNode.querySelector('.gem-image-wrapper');
        const shapeImgUrl = db.shapes[gem.sh]?.img;
        if (shapeImgUrl) {
            const imgEl = document.createElement('img');
            imgEl.src = shapeImgUrl;
            imgEl.alt = db.shapes[gem.sh]?.txt || gem.sh;
            imgEl.className = 'gem-shape-img';
            imgEl.loading = 'lazy';
            imgEl.onerror = () => {
                imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="1"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>';
            };
            imgWrapper.appendChild(imgEl);
        } else {
            const placeholderEl = document.createElement('div');
            placeholderEl.className = 'gem-placeholder-icon';
            placeholderEl.textContent = '💎';
            imgWrapper.appendChild(placeholderEl);
        }

        if (currentTab === 'wishlist' && wishlistItem) {
            const qtyContainer = cardNode.querySelector('[data-field="qty-container"]');
            qtyContainer.classList.remove('hidden');
            
            const qtyInput = qtyContainer.querySelector('[data-action="input"]');
            qtyInput.setAttribute('data-index', rowIndex);
            qtyInput.value = wishlistItem.count;
            
            qtyContainer.querySelector('[data-action="minus"]').setAttribute('data-index', rowIndex);
            qtyContainer.querySelector('[data-action="plus"]').setAttribute('data-index', rowIndex);
            qtyContainer.querySelector('[data-action="delete"]').setAttribute('data-index', rowIndex);
        }

        return clone;
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
        const wishlistMap = new Map(wishlist.map(item => [item.id, item]));
        
        catalogContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = start; i < end; i++) {
            const rowIndex = currentMatches[i];
            const cardElement = createCardElement(rowIndex, wishlistMap.get(rowIndex));
            if (cardElement) fragment.appendChild(cardElement);
        }
        catalogContainer.appendChild(fragment);

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

        wishlistContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        wishlist.forEach(item => {
            const cardElement = createCardElement(item.id, item);
            if (cardElement) fragment.appendChild(cardElement);
        });
        
        wishlistContainer.appendChild(fragment);
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

            window.open(`${YANDEX_FORM_WISHLIST_BASE}?text=${encodeURIComponent(descriptionString)}`, '_blank');
        });
    }

    // ДЕЛЕГИРОВАНИЕ СОБЫТИЙ КЛИКА
    appWrapper.addEventListener('click', (e) => {
        const wishlistBtn = e.target.closest('.wishlist-btn');
        if (wishlistBtn) {
            e.stopPropagation();
            const card = wishlistBtn.closest('[data-index]');
            if (!card) return;

            const index = parseInt(card.getAttribute('data-index'), 10);
            const position = wishlist.findIndex(item => item.id === index);

            if (position > -1) {
                wishlist.splice(position, 1);
                wishlistBtn.classList.remove('in-wishlist');
                if (currentTab === 'wishlist') renderWishlistTab(); 
            } else {
                wishlist.push({ id: index, count: 1 });
                wishlistBtn.classList.add('in-wishlist');
            }
            
            localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
            updateWishlistBadges();
            return;
        }

        const qtyBtn = e.target.closest('.qty-btn');
        if (qtyBtn) {
            const index = parseInt(qtyBtn.getAttribute('data-index'), 10);
            const item = wishlist.find(item => item.id === index);
            if (item) {
                const action = qtyBtn.getAttribute('data-action');
                item.count += (action === 'plus') ? 1 : -1;
                if (item.count < 1) item.count = 1; 
                
                const input = qtyBtn.closest('.qty-controls').querySelector('.qty-input');
                if (input) input.value = item.count;
                localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
            }
            return;
        }

        const removeBtn = e.target.closest('.remove-wishlist-item-btn');
        if (removeBtn) {
            const index = parseInt(removeBtn.getAttribute('data-index'), 10);
            const position = wishlist.findIndex(item => item.id === index);
            if (position > -1) {
                wishlist.splice(position, 1);
                localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
                renderWishlistTab();
                updateWishlistBadges();
            }
            return;
        }
    });

    appWrapper.addEventListener('change', (e) => {
        const qtyInput = e.target.closest('.qty-input');
        if (qtyInput) {
            const index = parseInt(qtyInput.getAttribute('data-index'), 10);
            let val = parseInt(qtyInput.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            qtyInput.value = val;
            const item = wishlist.find(item => item.id === index);
            if (item) {
                item.count = val;
                localStorage.setItem('gems-wishlist', JSON.stringify(wishlist));
            }
        }
    });

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
            counterTotal.innerHTML = `Найдено: <strong>${currentMatches.length.toLocaleString('ru-RU')}</strong>`;
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
    switchTab('about'); 
});