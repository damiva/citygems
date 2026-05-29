/**
 * Главный контроллер интерфейса интернет-магазина CityGems.
 * Динамически настраивает фильтры и сортировку на основе структуры HTML и метаданных БД,
 * исключая любой хардкод состояния. Полностью очищен от HTML-строк.
 */

let gems = null;
let cart = null;
let currentPagenator = null;
let catalogInitialized = false;

// Динамическое состояние фильтрации. Заполняется свойствами на лету при сканировании DOM.
const filterState = {};

// Текущее состояние сортировки
const sortState = {
    column: "price",
    desc: false
};

document.addEventListener("DOMContentLoaded", () => {
    // Единый SPA-роутер на основе switch-case
    const handleRoute = () => {
        let id = "about";
        const hash = location.hash;
        
        switch (hash) {
            case "#catalog":
                id = "catalog";
                tryInitCatalog();
                break;
            case "#cart":
            case "#order":
                id = "cart";
                renderCartList();
                break;
        }
        
        // Переключаем видимость секций
        document.querySelectorAll("main > section").forEach(s => {
            s.classList.toggle("hidden", s.id !== id);
        });
    };
    
    window.addEventListener("hashchange", handleRoute);
    
    // Ожидание готовности базы данных gems.js
    window.gemsPromise.then(d => {
        gems = d;
        
        // Инициализируем корзину
        cart = new Cart(gems);
        
        // Переопределяем метод сохранения и изменения корзины для реактивного обновления интерфейса
        const originalSet = cart.set;
        cart.set = function(itemIndex, qty) {
            originalSet.call(cart, itemIndex, qty);
            updateCartBadge();
            if (location.hash === "#catalog") renderCatalog();
            if (location.hash === "#cart" || location.hash === "#order") renderCartList();
        };

        // Навешиваем сброс фильтров на кнопку сброса в шапке фильтров
        const resetAllBtn = document.querySelector("#catalog aside h2 button");
        if (resetAllBtn) {
            resetAllBtn.addEventListener("click", () => {
                if (!catalogInitialized) return;
                resetFiltersToDefault();
            });
        }

        updateCartBadge();
        handleRoute();
    }).catch(e => {
        console.error(e);
        const catalogSec = document.getElementById("catalog");
        const cartSec = document.getElementById("cart");
        const tempError = document.getElementById("empty-placeholder");
        
        if (tempError && (catalogSec || cartSec)) {
            const renderError = (container) => {
                if (!container) return;
                container.innerHTML = "";
                const clone = tempError.content.cloneNode(true);
                clone.querySelector(".empty-text").textContent = `Ошибка загрузки: ${e.message}`;
                container.appendChild(clone);
            };
            renderError(catalogSec);
            renderError(cartSec);
        }
    });
});

/**
 * Ленивая инициализация каталога при первом переходе на вкладку
 */
function tryInitCatalog() {
    if (catalogInitialized || !gems) return;

    setupSortUI();     // Настраиваем сортировку из HTML, используя titles базы
    setupFiltersUI();  // Сканируем HTML, динамически создаем filterState и привязываем события
    renderCatalog();   // Первичная отрисовка товаров

    catalogInitialized = true;
}

/**
 * Читает и настраивает сортировку из <select id="filter-sort">, используя titles из базы
 */
function setupSortUI() {
    const sortSelect = document.getElementById("filter-sort");
    if (!sortSelect) return;

    Array.from(sortSelect.options).forEach(opt => {
        const col = opt.value;
        const isDesc = opt.getAttribute("data-desc") === "true";
        
        // Получаем красивое русское название колонки из базы gems
        const colTitle = gems.titles?.[col] || gems.columns?.[col]?.title || (col === "price" ? "цене" : "весу");
        opt.textContent = `${isDesc ? "↓" : "↑"} По ${colTitle.toLowerCase()}`;
    });

    // Обработчик изменения сортировки
    sortSelect.addEventListener("change", () => {
        const selectedOpt = sortSelect.options[sortSelect.selectedIndex];
        sortState.column = selectedOpt.value;
        sortState.desc = selectedOpt.getAttribute("data-desc") === "true";
        renderCatalog();
    });
}

/**
 * Сканирует предзаданные в HTML фильтры, динамически инициализирует filterState и вешает события
 */
function setupFiltersUI() {
    // Очищаем filterState перед инициализацией
    for (const key in filterState) {
        delete filterState[key];
    }

    // 1. Диапазонные фильтры (Range)
    setupRangeFilter("weight", "weight", 0.01, v => v.toFixed(2));
    setupRangeFilter("price", "price", 1000, v => Math.round(v).toLocaleString('ru-RU'));

    // 2. Фильтры множественного выбора (Sets)
    setupSetFilter("form", "shape");
    setupSetFilter("color", "color");
    setupSetFilter("clarity", "clarity");
    setupSetFilter("lab", "lab");
}

/**
 * Универсальный декоратор для Range-фильтров
 */
function setupRangeFilter(stateKey, htmlIdSuffix, step, formatter) {
    const filterLi = document.getElementById(`filter-${htmlIdSuffix}`);
    const tempRange = document.getElementById("filter-range");
    if (!filterLi || !tempRange) return;

    // Берем экстремумы из БД
    const colRows = gems.columns[stateKey].rows;
    const minVal = Math.min(...colRows);
    const maxVal = Math.max(...colRows);

    filterState[stateKey] = { min: minVal, max: maxVal };

    const labelTitle = gems.titles?.[stateKey] || gems.columns?.[stateKey]?.title || stateKey;

    filterLi.innerHTML = "";
    const clone = tempRange.content.cloneNode(true);

    clone.querySelector(".filter-label").textContent = labelTitle;
    const valDisplay = clone.querySelector(".filter-values");
    valDisplay.textContent = `${formatter(minVal)} — ${formatter(maxVal)}`;

    const inputs = clone.querySelectorAll("input");
    inputs.forEach((inp, idx) => {
        inp.min = minVal;
        inp.max = maxVal;
        inp.step = step;
        inp.value = idx === 0 ? minVal : maxVal;

        inp.addEventListener("input", () => {
            const v1 = parseFloat(inputs[0].value);
            const v2 = parseFloat(inputs[1].value);
            filterState[stateKey].min = Math.min(v1, v2);
            filterState[stateKey].max = Math.max(v1, v2);
            valDisplay.textContent = `${formatter(filterState[stateKey].min)} — ${formatter(filterState[stateKey].max)}`;
            renderCatalog();
        });
    });

    filterLi.appendChild(clone);
}

/**
 * Универсальный декоратор для Set-фильтров (множественный выбор тегами)
 */
function setupSetFilter(stateKey, htmlIdSuffix) {
    const filterLi = document.getElementById(`filter-${htmlIdSuffix}`);
    const tempSet = document.getElementById("filter-set");
    const tempTag = document.getElementById("filter-tag-btn");
    if (!filterLi || !tempSet || !tempTag) return;

    const enumValues = gems.getEnum(stateKey);
    if (!enumValues) return;

    filterState[stateKey] = [];

    const labelTitle = gems.titles?.[stateKey] || gems.columns?.[stateKey]?.title || stateKey;

    filterLi.innerHTML = "";
    const setClone = tempSet.content.cloneNode(true);

    setClone.querySelector(".filter-label").textContent = labelTitle;
    const localResetBtn = setClone.querySelector(".filter-reset-btn");
    const tagsDiv = setClone.querySelector(".tags");

    enumValues.forEach((val, idx) => {
        if (!val) return;
        const tagClone = tempTag.content.cloneNode(true);
        const btn = tagClone.querySelector(".tag-btn");
        btn.textContent = val;

        btn.addEventListener("click", () => {
            btn.classList.toggle("active");
            const active = btn.classList.contains("active");
            const pos = filterState[stateKey].indexOf(idx);

            if (active && pos === -1) {
                filterState[stateKey].push(idx);
            } else if (!active && pos !== -1) {
                filterState[stateKey].splice(pos, 1);
            }

            localResetBtn.style.display = filterState[stateKey].length > 0 ? "inline-block" : "none";
            renderCatalog();
        });

        tagsDiv.appendChild(tagClone);
    });

    localResetBtn.addEventListener("click", () => {
        filterState[stateKey] = [];
        tagsDiv.querySelectorAll(".tag-btn").forEach(btn => btn.classList.remove("active"));
        localResetBtn.style.display = "none";
        renderCatalog();
    });

    filterLi.appendChild(setClone);
}

/**
 * Сбрасывает все фильтры и перерисовывает интерфейс
 */
function resetFiltersToDefault() {
    setupFiltersUI();
    renderCatalog();
}

/**
 * Высокопроизводительный рендеринг каталога
 */
function renderCatalog() {
    const list = document.getElementById("catalog-list");
    const countBadge = document.getElementById("res-count");
    if (!list) return;

    currentPagenator = gems.filter(filterState, sortState.column, sortState.desc);
    const items = currentPagenator.get(1);

    if (countBadge) countBadge.textContent = currentPagenator.rows.length;
    list.innerHTML = "";

    if (!items.length) {
        const tempEmpty = document.getElementById("empty-placeholder");
        if (tempEmpty) {
            const clone = tempEmpty.content.cloneNode(true);
            clone.querySelector(".empty-text").textContent = "Бриллиантов с такими характеристиками сейчас нет в наличии.";
            list.appendChild(clone);
        }
        return;
    }

    const temp = document.getElementById("catalog-card");
    items.forEach(item => {
        const clone = temp.content.cloneNode(true);
        
        clone.querySelector(".card-title").textContent = item.form || "Бриллиант";
        clone.querySelector(".card-weight").textContent = `${item.weight} ct`;
        clone.querySelector(".card-color").textContent = `Цвет: ${item.color}`;
        clone.querySelector(".card-clarity").textContent = `Чистота: ${item.clarity}`;
        clone.querySelector(".card-price").textContent = `${Math.round(item.price).toLocaleString()} ₽`;
        
        const img = clone.querySelector(".card-img");
        img.src = item.image;
        img.onerror = () => { img.src = "placeholder.png"; };

        const buyBtn = clone.querySelector(".card-btn-buy");
        const inCartQty = cart.get(item.id);
        
        if (inCartQty > 0) {
            clone.querySelector(".card-badge-status").style.display = "block";
            buyBtn.textContent = `В корзине (${inCartQty})`;
            buyBtn.classList.add("active");
        }

        buyBtn.onclick = (e) => {
            e.stopPropagation();
            cart.set(item._index, inCartQty + 1);
        };

        list.appendChild(clone);
    });
}

/**
 * Рендеринг корзины в магазине
 */
function renderCartList() {
    const list = document.getElementById("cart-list");
    const summaryPanel = document.getElementById("cart-summary");
    if (!list) return;

    const items = cart.list;
    list.innerHTML = "";

    // Управление видимостью панели итогов через нативный класс hidden
    if (!items.length) {
        const tempEmpty = document.getElementById("empty-placeholder");
        if (tempEmpty) {
            const clone = tempEmpty.content.cloneNode(true);
            clone.querySelector(".empty-text").textContent = "Ваша корзина пуста";
            list.appendChild(clone);
        }
        if (summaryPanel) summaryPanel.classList.add("hidden");
        return;
    }

    if (summaryPanel) {
        summaryPanel.classList.remove("hidden");
    }

    let totalPrice = 0;
    const temp = document.getElementById("order-card");

    items.forEach(item => {
        const clone = temp.content.cloneNode(true);
        const itemTotal = item.price * item.qty;
        totalPrice += itemTotal;

        clone.querySelector(".order-title").textContent = item.form || "Бриллиант";
        clone.querySelector(".order-meta").textContent = `${item.weight} ct | Цвет: ${item.color} | Чистота: ${item.clarity} | ${item.lab}`;
        clone.querySelector(".order-price").textContent = `${Math.round(itemTotal).toLocaleString()} ₽`;
        clone.querySelector(".qty-val").textContent = item.qty;

        const img = clone.querySelector(".order-img");
        img.src = item.image;
        img.onerror = () => { img.src = "placeholder.png"; };

        clone.querySelector(".qty-btn.inc").onclick = () => cart.set(item._index, item.qty + 1);
        clone.querySelector(".qty-btn.dec").onclick = () => cart.set(item._index, item.qty - 1);
        clone.querySelector(".order-remove").onclick = () => cart.set(item._index, 0);

        list.appendChild(clone);
    });

    // Наполняем уже существующую в HTML панель итогов
    const totalQtyEl = document.getElementById("cart-total-qty");
    const totalPriceEl = document.getElementById("cart-total-price");
    const shareBtn = document.getElementById("share-cart-btn");

    if (totalQtyEl) totalQtyEl.textContent = cart.count;
    if (totalPriceEl) totalPriceEl.textContent = `${Math.round(totalPrice).toLocaleString()} ₽`;
    
    if (shareBtn) {
        // Убираем старые слушатели перед добавлением нового
        shareBtn.replaceWith(shareBtn.cloneNode(true));
        document.getElementById("share-cart-btn").addEventListener("click", openCheckoutModal);
    }
}

/**
 * Запуск модального окна оформления (шеринг ссылки в мессенджеры)
 */
function openCheckoutModal() {
    if (!cart || !cart.count) return;
    const dialog = document.getElementById("checkout-dialog");
    if (!dialog) return;

    // 1. Ссылка на заказ (через hash # для совместимости с твоим decode)
    const orderUrl = `${window.location.origin}/order.html#${cart.shareText}`;    
    
    // 2. Подготовка текстов (Markdown для ТГ, обычный текст для почты)
    const msgTg = `Здравствуйте! [Мой заказ](${orderUrl})`;
    const msgEmail = `Здравствуйте! Мой заказ: ${orderUrl}`;

    // 3. Прямые протокольные ссылки
    // Используем tg://resolve для обхода блокировок t.me
    const tgLink = `tg://resolve?domain=citygems&text=${encodeURIComponent(msgTg)}`;
    const mailLink = `mailto:order@citygems.ru?subject=Заказ%20CityGems&body=${encodeURIComponent(msgEmail)}`;

    // 4. Обновляем кнопки в интерфейсе
    const btnTg = dialog.querySelector(".checkout-tg-btn");
    const btnMail = dialog.querySelector(".checkout-mail-btn");
    if (btnTg) btnTg.href = tgLink;
    if (btnMail) btnMail.href = mailLink;

    // 5. Обновляем QR-коды и их кликабельность
    // Для этого в HTML добавим id или классы qr-tg-img/link и qr-mail-img/link
    updateQr(dialog, ".qr-tg", tgLink);
    updateQr(dialog, ".qr-mail", mailLink);

    dialog.showModal();
}

// Вспомогательная функция для обновления QR
function updateQr(container, prefix, link) {
    const img = container.querySelector(`${prefix}-img`);
    const anchor = container.querySelector(`${prefix}-link`);
    if (img) {
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(link)}`;
    }
    if (anchor) anchor.href = link;
}

/**
 * Обновление счетчика корзины в шапке
 */
function updateCartBadge() {
    const badge = document.getElementById("cart-count");
    if (badge) {
        const count = cart.count;
        badge.textContent = count > 0 ? count : "";
    }
}