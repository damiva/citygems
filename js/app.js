let GEMS_DATABASE = null;
        let FILTERED_GEMS = null;
        let APP_CART = null;

        const OFFSETS = 12;

        // Объект кэширования DOM-узлов
        const DOM = {
            cartBadge: document.getElementById('cart-badge'),
            shapeGrid: document.getElementById('shape-grid'),
            colorSelector: document.getElementById('color-selector'),
            claritySelector: document.getElementById('clarity-selector'),
            labSelector: document.getElementById('lab-selector'),
            caratMin: document.getElementById('carat-min'),
            caratMax: document.getElementById('carat-max'),
            priceMin: document.getElementById('price-min'),
            priceMax: document.getElementById('price-max'),
            resetFilters: document.getElementById('reset-filters'),
            sortSelect: document.getElementById('sort-select'),
            totalCount: document.getElementById('total-count'),
            catalogLoading: document.getElementById('catalog-loading'),
            catalogEmpty: document.getElementById('catalog-empty'),
            gemsGrid: document.getElementById('gems-grid'),
            pagination: document.getElementById('pagination'),
            cartSidebar: document.getElementById('cart-sidebar'),
            cartItemsContainer: document.getElementById('cart-items-container'),
            cartTotal: document.getElementById('cart-total'),
            checkoutBtn: document.getElementById('checkout-btn'),
            checkoutModal: document.getElementById('checkout-modal'),
            gemModal: document.getElementById('gem-modal'),
            toastContainer: document.getElementById('toast-container'),
            viewInfo: document.getElementById('view-info'),
            viewCatalog: document.getElementById('view-catalog'),
            navLogo: document.getElementById('nav-logo'),
            navCatalogBtn: document.getElementById('nav-catalog-btn')
        };

        const filterCriteria = {
            carat: { min: 0.3, max: 10.0 },
            price: { min: 0, max: 10000000 },
            shape: [],
            color: [],
            clarity: [],
            lab: []
        };

        window.addEventListener('hashchange', handleRouting);

        function handleRouting() {
            const hash = window.location.hash;
            if (hash === '#catalog') {
                switchView('catalog');
            } else {
                switchView('info');
                if (hash && hash !== '#') {
                    const targetEl = document.querySelector(hash);
                    if (targetEl) {
                        setTimeout(() => {
                            targetEl.scrollIntoView({ behavior: 'smooth' });
                        }, 80);
                    }
                }
            }
        }

        function switchView(viewName) {
            if (viewName === 'info') {
                DOM.viewInfo.classList.remove('hidden');
                DOM.viewCatalog.classList.add('hidden');
                DOM.navCatalogBtn.classList.remove('text-gold-500', 'border-gold-500');
                DOM.navCatalogBtn.classList.add('text-luxury-dark', 'border-transparent');
            } else if (viewName === 'catalog') {
                DOM.viewInfo.classList.add('hidden');
                DOM.viewCatalog.classList.remove('hidden');
                DOM.navCatalogBtn.classList.add('text-gold-500', 'border-gold-500');
                DOM.navCatalogBtn.classList.remove('text-luxury-dark', 'border-transparent');
            }
        }

        DOM.navLogo.addEventListener('click', () => {
            window.location.hash = '#about';
        });

        function handleLogoError(img) {
            img.classList.add('hidden');
            const fallback = img.parentElement.querySelector('.js-logo-fallback');
            if (fallback) fallback.classList.remove('hidden');
        }

        function handleImageError(imgElement) {
            const template = document.getElementById('gem-placeholder-template');
            const clone = document.importNode(template.content, true);
            const parent = imgElement.parentElement;
            if (parent) {
                parent.replaceChild(clone, imgElement);
            }
        }

        function showToast(message, type = 'success') {
            const template = document.getElementById('toast-template');
            const clone = document.importNode(template.content, true);
            const toast = clone.querySelector('.js-toast-element');
            const icon = clone.querySelector('.js-toast-icon');
            const messageSpan = clone.querySelector('.js-toast-message');

            messageSpan.textContent = message;

            if (type === 'success') {
                toast.classList.add('bg-white', 'border-gold-400', 'text-luxury-dark');
                icon.setAttribute('data-lucide', 'check');
                icon.classList.add('text-gold-500');
            } else {
                toast.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
                icon.setAttribute('data-lucide', 'alert-triangle');
                icon.classList.add('text-red-500');
            }

            DOM.toastContainer.appendChild(toast);
            lucide.createIcons({ node: toast });

            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-y-2');
            });

            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function initDynamicFiltersBounds() {
            const rawCarats = GEMS_DATABASE.raw.carat.row;
            const rawPrices = GEMS_DATABASE.raw.price.row;

            const minCarat = Math.min(...rawCarats);
            const maxCarat = Math.max(...rawCarats);
            const minPrice = Math.min(...rawPrices);
            const maxPrice = Math.max(...rawPrices);

            filterCriteria.carat.min = minCarat;
            filterCriteria.carat.max = maxCarat;
            filterCriteria.price.min = minPrice;
            filterCriteria.price.max = maxPrice;

            DOM.caratMin.value = minCarat.toFixed(1);
            DOM.caratMin.min = minCarat;
            DOM.caratMin.max = maxCarat;
            DOM.caratMax.value = maxCarat.toFixed(1);
            DOM.caratMin.min = minCarat;
            DOM.caratMin.max = maxCarat;

            DOM.priceMin.value = minPrice;
            DOM.priceMin.min = minPrice;
            DOM.priceMin.max = maxPrice;
            DOM.priceMax.value = maxPrice;
            DOM.priceMax.min = minPrice;
            DOM.priceMax.max = maxPrice;

            const sliderCaratMin = document.getElementById('carat-slider-min');
            const sliderCaratMax = document.getElementById('carat-slider-max');
            sliderCaratMin.min = minCarat;
            sliderCaratMin.max = maxCarat;
            sliderCaratMin.step = 0.1;
            sliderCaratMin.value = minCarat;

            sliderCaratMax.min = minCarat;
            sliderCaratMax.max = maxCarat;
            sliderCaratMax.step = 0.1;
            sliderCaratMax.value = maxCarat;

            const sliderPriceMin = document.getElementById('price-slider-min');
            const sliderPriceMax = document.getElementById('price-slider-max');
            sliderPriceMin.min = minPrice;
            sliderPriceMin.max = maxPrice;
            sliderPriceMin.step = 1000;
            sliderPriceMin.value = minPrice;

            sliderPriceMax.min = minPrice;
            sliderPriceMax.max = maxPrice;
            sliderPriceMax.step = 10000;
            sliderPriceMax.value = maxPrice;

            updateLabels('carat', minCarat, maxCarat);
            updateLabels('price', minPrice, maxPrice);

            updateDualSliderUI('carat');
            updateDualSliderUI('price');
        }

        function updateLabels(type, valMin, valMax) {
            if (type === 'carat') {
                document.getElementById('carat-label').textContent = `${parseFloat(valMin).toFixed(1)} - ${parseFloat(valMax).toFixed(1)} ct`;
            } else if (type === 'price') {
                document.getElementById('price-label').textContent = `${(valMin / 1000).toFixed(0)}k - ${(valMax / 1000000).toFixed(1)}M ₽`;
            }
        }

        function updateDualSliderUI(sliderType) {
            const minValInput = document.getElementById(`${sliderType}-min`);
            const maxValInput = document.getElementById(`${sliderType}-max`);
            const sliderMin = document.getElementById(`${sliderType}-slider-min`);
            const sliderMax = document.getElementById(`${sliderType}-slider-max`);
            const track = document.getElementById(`${sliderType}-slider-track`);

            const minVal = parseFloat(minValInput.value);
            const maxVal = parseFloat(maxValInput.value);
            const minBound = parseFloat(sliderMin.min);
            const maxBound = parseFloat(sliderMin.max);

            const pctMin = ((minVal - minBound) / (maxBound - minBound)) * 100;
            const pctMax = ((maxVal - minBound) / (maxBound - minBound)) * 100;

            track.style.left = pctMin + "%";
            track.style.width = (pctMax - pctMin) + "%";

            sliderMin.value = minVal;
            sliderMax.value = maxVal;
        }

        function bindDualSliderListeners(sliderType, minStep, isInt = false) {
            const numMin = document.getElementById(`${sliderType}-min`);
            const numMax = document.getElementById(`${sliderType}-max`);
            const sliderMin = document.getElementById(`${sliderType}-slider-min`);
            const sliderMax = document.getElementById(`${sliderType}-slider-max`);

            const syncFromSliders = () => {
                let valMin = isInt ? parseInt(sliderMin.value) : parseFloat(sliderMin.value);
                let valMax = isInt ? parseInt(sliderMax.value) : parseFloat(sliderMax.value);

                if (valMin > valMax - minStep) {
                    sliderMin.value = valMax - minStep;
                    valMin = valMax - minStep;
                }
                numMin.value = valMin;
                numMax.value = valMax;

                filterCriteria[sliderType].min = valMin;
                filterCriteria[sliderType].max = valMax;

                updateLabels(sliderType, valMin, valMax);
                updateDualSliderUI(sliderType);
                applyFilters();
            };

            const syncFromInputs = () => {
                let valMin = isInt ? parseInt(numMin.value) : parseFloat(numMin.value);
                let valMax = isInt ? parseInt(numMax.value) : parseFloat(numMax.value);

                const minBound = parseFloat(sliderMin.min);
                const maxBound = parseFloat(sliderMin.max);

                if (valMin < minBound) valMin = minBound;
                if (valMax > maxBound) valMax = maxBound;
                if (valMin > valMax - minStep) valMin = valMax - minStep;

                numMin.value = valMin;
                numMax.value = valMax;

                filterCriteria[sliderType].min = valMin;
                filterCriteria[sliderType].max = valMax;

                updateLabels(sliderType, valMin, valMax);
                updateDualSliderUI(sliderType);
                applyFilters();
            };

            sliderMin.addEventListener('input', syncFromSliders);
            sliderMax.addEventListener('input', syncFromSliders);
            numMin.addEventListener('change', syncFromInputs);
            numMax.addEventListener('change', syncFromInputs);
        }

        async function initApp(gems) {
            try {
                GEMS_DATABASE = await gems;

                initDynamicFiltersBounds();
                renderFiltersMarkup();

                const shareUrl = window.location.search || window.location.hash;
                if (shareUrl && (shareUrl.includes('=') || shareUrl.includes('&'))) {
                    try {
                        APP_CART = await Cart.load(shareUrl, baseUri);
                        history.replaceState(null, "", location.pathname);
                        openCart();
                    } catch (e) {
                        console.error('Ошибка импорта корзины:', e);
                        APP_CART = new Cart(GEMS_DATABASE);
                    }
                } else {
                    APP_CART = new Cart(GEMS_DATABASE);
                }

                DOM.catalogLoading.classList.add('hidden');
                
                setupFilterListeners();
                applyFilters();
                updateCartUI();

            } catch (err) {
                console.error("Ошибка загрузки:", err);
                DOM.catalogLoading.innerHTML = `
                    <div class="text-center p-8 bg-red-50 border border-red-100">
                        <i data-lucide="alert-circle" class="w-12 h-12 text-red-500 mx-auto mb-4"></i>
                        <h3 class="luxury-serif text-xl text-red-900 font-bold mb-2">Не удалось загрузить базу бриллиантов</h3>
                        <p class="text-xs text-red-700">${err.message}</p>
                        <button onclick="window.location.reload()" class="mt-4 px-6 py-2 bg-luxury-dark text-white text-[10px] tracking-wider uppercase">Повторить попытку</button>
                    </div>
                `;
                lucide.createIcons();
            }
        }

        function renderFiltersMarkup() {
            const data = GEMS_DATABASE.raw;
            const shapeTemplate = document.getElementById('shape-button-template');

            const shapeFragment = document.createDocumentFragment();
            const shapeMap = data.shape?.map || [];
            
            shapeMap.forEach((shapeName, idx) => {
                const clone = document.importNode(shapeTemplate.content, true);
                const button = clone.querySelector('button');
                const labelSpan = clone.querySelector('.js-shape-label');

                labelSpan.textContent = shapeName.charAt(0).toUpperCase() + shapeName.slice(1);
                
                button.dataset.index = idx;
                button.dataset.name = shapeName;
                button.addEventListener('click', () => toggleShapeSelection(button, idx));

                shapeFragment.appendChild(clone);
            });
            DOM.shapeGrid.innerHTML = '';
            DOM.shapeGrid.appendChild(shapeFragment);

            function createTextFilterButtons(container, mapData, criteriaKey, clickHandler) {
                const template = document.getElementById('filter-button-template');
                const fragment = document.createDocumentFragment();
                mapData.forEach((text, idx) => {
                    const clone = document.importNode(template.content, true);
                    const btn = clone.querySelector('.js-filter-btn');
                    btn.classList.add(`${criteriaKey}-btn`);
                    btn.dataset.index = idx;
                    
                    btn.textContent = (text && text.trim() !== "") ? text : "Нет";
                    btn.addEventListener('click', () => clickHandler(criteriaKey, btn, idx));
                    fragment.appendChild(clone);
                });
                container.innerHTML = '';
                container.appendChild(fragment);
            }

            createTextFilterButtons(DOM.colorSelector, data.color?.map || [], 'color', toggleCriteriaSelection);
            createTextFilterButtons(DOM.claritySelector, data.clarity?.map || [], 'clarity', toggleCriteriaSelection);
            createTextFilterButtons(DOM.labSelector, data.lab?.map || [], 'lab', toggleCriteriaSelection);
        }

        function toggleShapeSelection(element, index) {
            const alreadySelected = filterCriteria.shape.includes(index);
            if (alreadySelected) {
                filterCriteria.shape = filterCriteria.shape.filter(i => i !== index);
                element.className = 'shape-btn flex flex-col items-center justify-center py-2.5 px-1 border border-sand-100 bg-sand-50/50 hover:bg-gold-50 hover:border-gold-300 transition-all text-center rounded-sm text-[9px] font-bold tracking-wider uppercase text-sand-500';
            } else {
                filterCriteria.shape.push(index);
                element.className = 'shape-btn flex flex-col items-center justify-center py-2.5 px-1 border border-gold-500 bg-gold-500 hover:bg-gold-600 transition-all text-center rounded-sm text-[9px] font-bold tracking-wider uppercase text-white';
            }
            applyFilters();
        }

        function toggleCriteriaSelection(criteriaKey, element, index) {
            const alreadySelected = filterCriteria[criteriaKey].includes(index);
            if (alreadySelected) {
                filterCriteria[criteriaKey] = filterCriteria[criteriaKey].filter(i => i !== index);
                element.classList.remove('border-gold-500', 'bg-gold-500', 'text-white');
                element.classList.add('border-sand-100', 'bg-sand-50/50');
            } else {
                filterCriteria[criteriaKey].push(index);
                element.classList.remove('border-sand-100', 'bg-sand-50/50');
                element.classList.add('border-gold-500', 'bg-gold-500', 'text-white');
            }
            applyFilters();
        }

        function setupFilterListeners() {
            bindDualSliderListeners('carat', 0.1, false);
            bindDualSliderListeners('price', 1000, true);

            DOM.resetFilters.addEventListener('click', resetAllFilters);
            DOM.sortSelect.addEventListener('change', applyFilters);
        }

        function resetAllFilters() {
            initDynamicFiltersBounds();
            filterCriteria.shape = [];
            filterCriteria.color = [];
            filterCriteria.clarity = [];
            filterCriteria.lab = [];

            document.querySelectorAll('.shape-btn').forEach(btn => {
                btn.className = 'shape-btn flex flex-col items-center justify-center py-2.5 px-1 border border-sand-100 bg-sand-50/50 hover:bg-gold-50 hover:border-gold-300 transition-all text-center rounded-sm text-[9px] font-bold tracking-wider uppercase text-sand-500';
            });
            document.querySelectorAll('.color-btn, .clarity-btn, .lab-btn').forEach(btn => {
                btn.className = btn.className.replace('border-gold-500 bg-gold-500 text-white', 'border-sand-100 bg-sand-50/50');
            });

            applyFilters();
            showToast('Все фильтры сброшены', 'success');
        }

        function applyFilters() {
            const searchCriteria = {};

            if (filterCriteria.shape.length > 0) searchCriteria.shape = filterCriteria.shape;
            if (filterCriteria.color.length > 0) searchCriteria.color = filterCriteria.color;
            if (filterCriteria.clarity.length > 0) searchCriteria.clarity = filterCriteria.clarity;
            if (filterCriteria.lab.length > 0) searchCriteria.lab = filterCriteria.lab;

            searchCriteria.carat = { min: filterCriteria.carat.min, max: filterCriteria.carat.max };
            searchCriteria.price = { min: filterCriteria.price.min, max: filterCriteria.price.max };

            const sortVal = DOM.sortSelect.value;
            let orderBy = 'price';
            let desc = false;

            if (sortVal === 'price_desc') { orderBy = 'price'; desc = true; }
            else if (sortVal === 'price_asc') { orderBy = 'price'; desc = false; }
            else if (sortVal === 'carat_desc') { orderBy = 'carat'; desc = true; }
            else if (sortVal === 'carat_asc') { orderBy = 'carat'; desc = false; }

            FILTERED_GEMS = GEMS_DATABASE.filter(searchCriteria, orderBy, desc);
            DOM.totalCount.textContent = FILTERED_GEMS.length.toLocaleString('ru-RU');

            renderGemsGrid(0);
        }

        function renderGemsGrid(pageIndex) {
            DOM.gemsGrid.innerHTML = '';

            if (!FILTERED_GEMS || FILTERED_GEMS.length === 0) {
                DOM.catalogEmpty.classList.remove('hidden');
                DOM.pagination.innerHTML = '';
                return;
            }

            DOM.catalogEmpty.classList.add('hidden');
            const gemsPage = FILTERED_GEMS[pageIndex];
            if (!gemsPage) return;

            const cardTemplate = document.getElementById('gem-card-template');
            const gridFragment = document.createDocumentFragment();

            gemsPage.forEach((gem) => {
                const clone = document.importNode(cardTemplate.content, true);
                
                const cardDiv = clone.querySelector('article');
                cardDiv.setAttribute('data-gem-id', gem.id);

                // 1. Изображение камня
                const gemImage = clone.querySelector('.js-gem-image');
                gemImage.src = gem.image;
                gemImage.alt = `Бриллиант ${gem.shape}`;
                
                // 2. Только логотип лаборатории (без подписи) сверху слева
                const labLogo = clone.querySelector('.js-gem-lab-logo');
                const labTextFallback = clone.querySelector('.js-gem-lab-text');
                if (gem.label) {
                    labLogo.src = gem.label;
                    labLogo.classList.remove('hidden');
                } else if (gem.lab && gem.lab.trim() !== "") {
                    labTextFallback.textContent = gem.lab;
                    labTextFallback.classList.remove('hidden');
                } else {
                    labLogo.remove();
                    labTextFallback.remove();
                }

                // 3. Форма огранки сверху справа
                clone.querySelector('.js-gem-shape').textContent = gem.shape;

                // 4. Текст веса (снизу слева) и цена (снизу справа)
                clone.querySelector('.js-gem-title').textContent = `${gem.carat.toFixed(2)} ct`;
                clone.querySelector('.js-gem-price').textContent = `${gem.price.toLocaleString('ru-RU')} ₽`;

                // 5. Характеристики под фото
                clone.querySelector('.js-gem-color').textContent = gem.color;
                clone.querySelector('.js-gem-clarity').textContent = gem.clarity;
                clone.querySelector('.js-gem-cut').textContent = gem.cut;
                clone.querySelector('.js-gem-size').textContent = `${gem.size.toString()} мм`;

                // Рендерим контроллеры добавления / изменения количества
                const rawIdx = findRawIndexById(gem.id);
                const qty = APP_CART.get(rawIdx);
                const controlContainer = clone.querySelector('.js-cart-control-container');
                renderCartControls(controlContainer, gem.id, rawIdx, qty);

                // События деталей
                const gemId = gem.id;
                clone.querySelectorAll('.js-details-trigger').forEach(trigger => {
                    trigger.addEventListener('click', () => openGemModal(gemId));
                });

                gridFragment.appendChild(clone);
            });

            DOM.gemsGrid.appendChild(gridFragment);

            renderPagination(pageIndex);
            lucide.createIcons();
        }

        // Отрисовка контроллера количества товаров с использованием чистых шаблонов
        function renderCartControls(container, gemId, rawIdx, qty) {
            container.innerHTML = '';
            if (qty <= 0) {
                const template = document.getElementById('cart-control-add-template');
                const clone = document.importNode(template.content, true);
                const addBtn = clone.querySelector('.js-add-to-cart');
                addBtn.addEventListener('click', (e) => {
                    addToCartByGemId(e, gemId);
                });
                container.appendChild(clone);
            } else {
                const template = document.getElementById('cart-control-qty-template');
                const clone = document.importNode(template.content, true);
                
                clone.querySelector('.js-qty-value').textContent = qty;
                clone.querySelector('.js-qty-minus').addEventListener('click', (e) => {
                    e.stopPropagation();
                    changeCartQty(rawIdx, qty - 1);
                });
                clone.querySelector('.js-qty-plus').addEventListener('click', (e) => {
                    e.stopPropagation();
                    changeCartQty(rawIdx, qty + 1);
                });
                container.appendChild(clone);
            }
            lucide.createIcons({ node: container });
        }

        // Синхронизация кнопок каталога со шкатулкой при изменении в боковой корзине
        function refreshCatalogCartControls() {
            const cards = DOM.gemsGrid.querySelectorAll('[data-gem-id]');
            cards.forEach(card => {
                const gemId = parseInt(card.getAttribute('data-gem-id'));
                const rawIdx = findRawIndexById(gemId);
                const qty = APP_CART.get(rawIdx);
                const container = card.querySelector('.js-cart-control-container');
                if (container) {
                    renderCartControls(container, gemId, rawIdx, qty);
                }
            });
        }

        function renderPagination(currentPage) {
            DOM.pagination.innerHTML = '';
            const totalPages = FILTERED_GEMS.pages;
            if (totalPages <= 1) return;

            const startPage = Math.max(0, currentPage - 2);
            const endPage = Math.min(totalPages - 1, currentPage + 2);
            const buttonTemplate = document.getElementById('pagination-button-template');
            const pagFragment = document.createDocumentFragment();

            if (currentPage > 0) {
                const prevBtn = document.importNode(buttonTemplate.content, true).querySelector('button');
                prevBtn.className = "p-2 text-sand-400 hover:text-gold-500 transition-colors";
                prevBtn.innerHTML = `<i data-lucide="chevron-left" class="w-4 h-4"></i>`;
                prevBtn.addEventListener('click', () => {
                    renderGemsGrid(currentPage - 1);
                    document.getElementById('collection').scrollIntoView();
                });
                pagFragment.appendChild(prevBtn);
            }

            for (let i = startPage; i <= endPage; i++) {
                const pageClone = document.importNode(buttonTemplate.content, true);
                const pageBtn = pageClone.querySelector('button');
                pageBtn.className = `px-3 py-1 text-xs font-semibold rounded-sm transition-all ${
                    i === currentPage 
                        ? 'bg-gold-500 text-white' 
                        : 'text-sand-500 hover:bg-gold-50 hover:text-gold-600'
                }`;
                pageBtn.textContent = i + 1;
                pageBtn.addEventListener('click', () => {
                    renderGemsGrid(i);
                    document.getElementById('collection').scrollIntoView();
                });
                pagFragment.appendChild(pageClone);
            }

            if (currentPage < totalPages - 1) {
                const nextBtn = document.importNode(buttonTemplate.content, true).querySelector('button');
                nextBtn.className = "p-2 text-sand-400 hover:text-gold-500 transition-colors";
                nextBtn.innerHTML = `<i data-lucide="chevron-right" class="w-4 h-4"></i>`;
                nextBtn.addEventListener('click', () => {
                    renderGemsGrid(currentPage + 1);
                    document.getElementById('collection').scrollIntoView();
                });
                pagFragment.appendChild(nextBtn);
            }

            DOM.pagination.appendChild(pagFragment);
        }

        function findRawIndexById(id) {
            return GEMS_DATABASE.raw.id.row.indexOf(id);
        }

        function getGemById(id) {
            const idx = findRawIndexById(id);
            return idx !== -1 ? GEMS_DATABASE[idx] : null;
        }

        function addToCartByGemId(event, id) {
            if (event) event.stopPropagation();
            const idx = findRawIndexById(id);
            if (idx === -1) return;

            const currentQty = APP_CART.get(idx);
            APP_CART.set(idx, currentQty + 1);

            updateCartUI();
            showToast('Камень добавлен в шкатулку', 'success');
        }

        function updateCartUI() {
            const cartItems = APP_CART.items;
            const totalCount = cartItems.reduce((acc, item) => acc + item.qty, 0);

            if (totalCount > 0) {
                DOM.cartBadge.textContent = totalCount;
                DOM.cartBadge.classList.remove('opacity-0');
                DOM.checkoutBtn.removeAttribute('disabled');
            } else {
                DOM.cartBadge.classList.add('opacity-0');
                DOM.checkoutBtn.setAttribute('disabled', 'true');
            }

            DOM.cartItemsContainer.innerHTML = '';
            if (cartItems.length === 0) {
                const emptyTemplate = document.getElementById('cart-empty-template');
                DOM.cartItemsContainer.appendChild(document.importNode(emptyTemplate.content, true));
                DOM.cartTotal.textContent = "0 ₽";
                
                refreshCatalogCartControls();
                lucide.createIcons();
                return;
            }

            const itemTemplate = document.getElementById('cart-item-template');
            const cartFragment = document.createDocumentFragment();
            let grandTotal = 0;

            cartItems.forEach(item => {
                grandTotal += item.price * item.qty;
                const rawIdx = findRawIndexById(item.id);

                const clone = document.importNode(itemTemplate.content, true);
                
                const cartImage = clone.querySelector('.js-cart-image');
                cartImage.src = item.image;
                cartImage.alt = item.shape;

                clone.querySelector('.js-cart-title').textContent = `${item.carat.toFixed(2)} ct ${item.shape}`;
                clone.querySelector('.js-cart-price').textContent = `${item.price.toLocaleString('ru-RU')} ₽`;
                clone.querySelector('.js-cart-meta').textContent = `Чистота: ${item.clarity} | Цвет: ${item.color}`;
                clone.querySelector('.js-cart-qty').textContent = item.qty;

                clone.querySelector('.js-cart-minus').addEventListener('click', () => changeCartQty(rawIdx, item.qty - 1));
                clone.querySelector('.js-cart-plus').addEventListener('click', () => changeCartQty(rawIdx, item.qty + 1));

                cartFragment.appendChild(clone);
            });

            DOM.cartItemsContainer.appendChild(cartFragment);
            DOM.cartTotal.textContent = `${grandTotal.toLocaleString('ru-RU')} ₽`;
            
            refreshCatalogCartControls();
            lucide.createIcons();
        }

        function changeCartQty(rawIdx, newQty) {
            APP_CART.set(rawIdx, newQty);
            updateCartUI();
        }

        function openGemModal(id) {
            const gem = getGemById(id);
            if (!gem) return;

            document.getElementById('modal-gem-id').textContent = `ID: #${gem.id}`;
            document.getElementById('modal-gem-title').textContent = `Бриллиант ${gem.carat.toFixed(2)} ct`;
            document.getElementById('modal-gem-price').textContent = `${gem.price.toLocaleString('ru-RU')} ₽`;
            
            document.getElementById('modal-gem-shape').textContent = gem.shape.charAt(0).toUpperCase() + gem.shape.slice(1);
            document.getElementById('modal-gem-carat').textContent = `${gem.carat.toFixed(2)} ct`;
            document.getElementById('modal-gem-color').textContent = gem.color;
            document.getElementById('modal-gem-clarity').textContent = gem.clarity;
            document.getElementById('modal-gem-lab').textContent = gem.lab;
            
            const modalLabImg = document.getElementById('modal-gem-label-img');
            if (gem.label) {
                modalLabImg.src = gem.label;
                modalLabImg.classList.remove('hidden');
            } else {
                modalLabImg.classList.add('hidden');
            }

            document.getElementById('modal-gem-symmetry').textContent = gem.simmetry || 'Excellent';
            document.getElementById('modal-gem-sizes').textContent = gem.size.toString();

            const modalGemImg = document.getElementById('modal-gem-image');
            modalGemImg.src = gem.image;
            modalGemImg.alt = `Бриллиант ${gem.shape} ${gem.carat.toFixed(2)} карат`;

            const addBtn = document.getElementById('modal-add-to-cart-btn');
            addBtn.onclick = (e) => {
                addToCartByGemId(e, gem.id);
                closeGemModal();
            };

            DOM.gemModal.classList.remove('hidden');
        }

        function closeGemModal() {
            DOM.gemModal.classList.add('hidden');
        }

        function openCart() { DOM.cartSidebar.classList.remove('translate-x-full'); }
        function closeCart() { DOM.cartSidebar.classList.add('translate-x-full'); }

        document.getElementById('cart-toggle-btn').addEventListener('click', openCart);
        document.getElementById('cart-close-btn').addEventListener('click', closeCart);

        DOM.checkoutBtn.addEventListener('click', () => {
            closeCart();
            DOM.checkoutModal.classList.remove('hidden');
        });

        function closeCheckoutModal() { DOM.checkoutModal.classList.add('hidden'); }

        function handleOrderSubmit(event) {
            event.preventDefault();
            closeCheckoutModal();
            showToast('VIP-заявка успешно отправлена! Консультант свяжется с Вами.', 'success');
            
            APP_CART = new Cart(GEMS_DATABASE, {id: [], qt: []});
            updateCartUI();
        }