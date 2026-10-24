
"use strict";

/* =====================================================
   KAAMPILOT PRO
   Local business workspace — products, orders, marketing,
   profit calculator, JSON backup and CSV exports.
   Existing storage key preserved: kaampilot_data_v1
===================================================== */

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "kaampilot_data_v1";
const LOW_STOCK_LIMIT = 5;

let data = { products: [], orders: [] };
let toastTimerIds = new Set();
let confirmCallback = null;
let lastFocusedElement = null;

const PAGE_TITLES = {
  dashboard: "Dashboard",
  products: "Products",
  orders: "Orders",
  marketing: "Marketing Studio",
  profit: "Profit Calculator"
};

/* ---------- Helpers ---------- */

function makeId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  const number = toNumber(value);
  return "Rs " + new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2
  }).format(number);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function todayISO() {
  return new Date().toISOString();
}

function orderStatus(order) {
  const status = String(order.status || "Pending").toLowerCase();
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function getProduct(productId) {
  return data.products.find((product) => product.id === productId);
}

function getOrderProductName(order) {
  const product = getProduct(order.productId);
  return order.productName || product?.name || "Deleted product";
}

function orderTotal(order) {
  if (Number.isFinite(Number(order.total)) && order.total !== "") {
    return toNumber(order.total);
  }
  return toNumber(order.price) * toNumber(order.quantity);
}

function orderCost(order) {
  if (Number.isFinite(Number(order.costTotal)) && order.costTotal !== "") {
    return toNumber(order.costTotal);
  }
  return toNumber(order.costPrice, 0) * toNumber(order.quantity);
}

function getCompletedOrders() {
  return data.orders.filter((order) => orderStatus(order) === "Completed");
}

function getPendingOrders() {
  return data.orders.filter((order) => orderStatus(order) === "Pending");
}

/* ---------- Storage ---------- */

function normaliseData(saved) {
  if (!saved || typeof saved !== "object") {
    throw new Error("Invalid saved data.");
  }

  if (!Array.isArray(saved.products) || !Array.isArray(saved.orders)) {
    throw new Error("Products or orders are missing.");
  }

  const products = saved.products.map((product) => {
    if (!product || typeof product !== "object") {
      throw new Error("Invalid product record.");
    }

    const id = String(product.id ?? makeId());
    const name = String(product.name ?? "").trim();
    const cost = toNumber(product.costPrice ?? product.cost, 0);
    const price = toNumber(product.price ?? product.sellingPrice, 0);
    const stock = toNumber(product.stock ?? product.quantity, 0);

    if (!name || cost < 0 || price < 0 || stock < 0) {
      throw new Error("A product contains invalid values.");
    }

    return {
      ...product,
      id,
      name,
      category: String(product.category ?? "General").trim() || "General",
      costPrice: cost,
      price,
      stock
    };
  });

  const orders = saved.orders.map((order) => {
    if (!order || typeof order !== "object") {
      throw new Error("Invalid order record.");
    }

    const customer = String(order.customer ?? order.customerName ?? "").trim();
    const quantity = toNumber(order.quantity, 1);
    const price = toNumber(order.price ?? order.sellingPrice, 0);

    if (quantity < 0 || price < 0) {
      throw new Error("An order contains invalid values.");
    }

    const status = orderStatus(order);
    const productId = order.productId ?? order.product_id ?? null;
    const linkedProduct = products.find((product) => product.id === productId);

    return {
      ...order,
      id: String(order.id ?? makeId()),
      customer: customer || "Customer",
      productId,
      productName: String(
        order.productName ?? linkedProduct?.name ?? "Product"
      ),
      quantity,
      price,
      total: Number.isFinite(Number(order.total))
        ? Number(order.total)
        : price * quantity,
      costPrice: toNumber(
        order.costPrice ?? linkedProduct?.costPrice,
        0
      ),
      costTotal: Number.isFinite(Number(order.costTotal))
        ? Number(order.costTotal)
        : toNumber(order.costPrice ?? linkedProduct?.costPrice) * quantity,
      status,
      date: order.date ?? order.createdAt ?? todayISO()
    };
  });

  return { products, orders };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw === null) {
    data = { products: [], orders: [] };
    return;
  }

  try {
    data = normaliseData(JSON.parse(raw));
  } catch (error) {
    console.error("KaamPilot could not read its saved data:", error);
    alert(
      "KaamPilot ka saved data read nahi ho saka. " +
      "Data ko overwrite nahi kiya gaya. Browser data clear na karein."
    );
    data = { products: [], orders: [] };
    window.__kaampilotStorageError = true;
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.__kaampilotStorageError = false;
    return true;
  } catch (error) {
    console.error("KaamPilot could not save data:", error);
    toast(
      "Data save nahi ho saka. Browser storage full ho sakti hai.",
      "error"
    );
    return false;
  }
}

/* ---------- Toast notifications ---------- */

function toast(message, type = "success") {
  const region = $("toast-region");
  if (!region) {
    console.log(message);
    return;
  }

  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.setAttribute("role", "status");
  item.textContent = message;
  region.appendChild(item);

  const timer = window.setTimeout(() => {
    item.remove();
    toastTimerIds.delete(timer);
  }, 3600);

  toastTimerIds.add(timer);
}

/* ---------- Navigation ---------- */

function showPage(pageName) {
  if (!PAGE_TITLES[pageName]) return;

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageName);
  });

  document.querySelectorAll(".nav-link").forEach((button) => {
    const active = button.dataset.page === pageName;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  $("page-title").textContent = PAGE_TITLES[pageName];
  $("sidebar")?.classList.remove("open");
  window.location.hash = pageName;
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });

  $("mobile-menu")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    const sidebar = $("sidebar");
    const menu = $("mobile-menu");
    if (
      sidebar?.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menu?.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }
  });

  window.addEventListener("hashchange", () => {
    const page = window.location.hash.slice(1);
    if (PAGE_TITLES[page]) showPage(page);
  });
}

/* ---------- Dialogs ---------- */

function openModal(id) {
  const modal = $(id);
  if (!modal) return;

  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = "hidden";

  const focusable = modal.querySelector(
    "input:not([type=hidden]), select, textarea, button"
  );
  focusable?.focus();
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;

  modal.hidden = true;

  if (!document.querySelector(".modal-backdrop:not([hidden])")) {
    document.body.style.overflow = "";
    lastFocusedElement?.focus?.();
  }
}

function setupModalControls() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-backdrop:not([hidden])").forEach((modal) => {
        closeModal(modal.id);
      });
    }
  });
}

function askConfirm(title, message, callback, confirmLabel = "Confirm") {
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  $("confirm-action-btn").textContent = confirmLabel;
  confirmCallback = callback;
  openModal("confirm-modal");
}

/* ---------- Product management ---------- */

function openProductForm(product = null) {
  $("product-form").reset();
  $("product-id").value = product?.id ?? "";
  $("product-name").value = product?.name ?? "";
  $("product-category").value = product?.category ?? "";
  $("product-cost").value = product?.costPrice ?? "";
  $("product-price").value = product?.price ?? "";
  $("product-stock").value = product?.stock ?? "";

  $("product-modal-title").textContent = product ? "Edit product" : "Add product";
  $("save-product-btn").textContent = product ? "Save changes" : "Save product";

  openModal("product-modal");
}

function saveProduct(event) {
  event.preventDefault();

  const id = $("product-id").value;
  const name = $("product-name").value.trim();
  const category = $("product-category").value.trim() || "General";
  const costPrice = Number($("product-cost").value);
  const price = Number($("product-price").value);
  const stock = Number($("product-stock").value);

  if (!name) return toast("Product name is required.", "error");
  if (![costPrice, price, stock].every(Number.isFinite)) {
    return toast("Please enter valid numbers.", "error");
  }
  if (costPrice < 0 || price < 0 || stock < 0 || !Number.isInteger(stock)) {
    return toast("Prices must be non-negative and stock must be a whole number.", "error");
  }

  const duplicate = data.products.find(
    (product) =>
      product.name.toLowerCase() === name.toLowerCase() &&
      product.id !== id
  );

  if (duplicate) {
    return toast("A product with this name already exists.", "warning");
  }

  if (id) {
    const index = data.products.findIndex((product) => product.id === id);
    if (index < 0) return toast("Product not found.", "error");

    data.products[index] = {
      ...data.products[index],
      name,
      category,
      costPrice,
      price,
      stock
    };
  } else {
    data.products.unshift({
      id: makeId(),
      name,
      category,
      costPrice,
      price,
      stock,
      createdAt: todayISO()
    });
  }

  if (!saveData()) return;

  closeModal("product-modal");
  renderAll();
  toast(id ? "Product updated successfully." : "Product added successfully.");
}

function deleteProduct(productId) {
  const product = getProduct(productId);
  if (!product) return;

  const linkedOrders = data.orders.filter(
    (order) => order.productId === productId &&
      orderStatus(order) !== "Cancelled"
  );

  if (linkedOrders.length) {
    return toast(
      "This product has active or completed orders. Keep it for accurate records.",
      "warning"
    );
  }

  askConfirm(
    "Delete product?",
    `Delete "${product.name}" from your catalog? This cannot be undone.`,
    () => {
      data.products = data.products.filter((item) => item.id !== productId);
      if (!saveData()) return;
      renderAll();
      toast("Product deleted.");
    },
    "Delete product"
  );
}

function renderProducts() {
  const query = ($("product-search")?.value ?? "").trim().toLowerCase();
  const categoryFilter = $("product-category-filter")?.value ?? "All";

  const categories = [...new Set(
    data.products.map((product) => product.category || "General")
  )].sort((a, b) => a.localeCompare(b));

  const categorySelect = $("product-category-filter");
  if (categorySelect) {
    const oldValue = categoryFilter;
    categorySelect.innerHTML =
      '<option value="All">All categories</option>' +
      categories.map((category) =>
        `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
      ).join("");

    categorySelect.value = categories.includes(oldValue) ? oldValue : "All";
  }

  const selectedCategory = categorySelect?.value ?? "All";

  const filtered = data.products.filter((product) => {
    const matchesQuery =
      product.name.toLowerCase().includes(query) ||
      String(product.category).toLowerCase().includes(query);
    const matchesCategory =
      selectedCategory === "All" || product.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  $("products-count").textContent =
    `${filtered.length} product${filtered.length === 1 ? "" : "s"}`;

  const body = $("products-body");
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">${
      data.products.length
        ? "No products match your search."
        : "No products yet. Add your first product to get started."
    }</div></td></tr>`;
  } else {
    body.innerHTML = filtered.map((product) => {
      const low = product.stock <= LOW_STOCK_LIMIT;
      const initial = escapeHTML(product.name.charAt(0).toUpperCase());

      return `
        <tr>
          <td>
            <div class="product-cell">
              <span class="product-avatar">${initial}</span>
              <span>
                <strong>${escapeHTML(product.name)}</strong>
                <small>ID: ${escapeHTML(String(product.id).slice(0, 8))}</small>
              </span>
            </div>
          </td>
          <td>${escapeHTML(product.category)}</td>
          <td>${money(product.costPrice)}</td>
          <td>${money(product.price)}</td>
          <td><span class="${low ? "stock-low" : "stock-good"}">${product.stock}</span></td>
          <td>
            <div class="row-actions">
              <button class="action-btn" data-edit-product="${escapeHTML(product.id)}" type="button">Edit</button>
              <button class="action-btn delete" data-delete-product="${escapeHTML(product.id)}" type="button">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  $("products-footer").textContent =
    `${data.products.length} products in inventory · Low-stock threshold: ${LOW_STOCK_LIMIT} units`;

  renderOrderProductOptions();
}

function setupProductControls() {
  $("product-form").addEventListener("submit", saveProduct);
  $("product-search").addEventListener("input", renderProducts);
  $("product-category-filter").addEventListener("change", renderProducts);

  $("quick-add").addEventListener("click", () => openProductForm());
  $("add-product-btn").addEventListener("click", () => openProductForm());

  document.querySelectorAll('[data-action="add-product"]').forEach((button) => {
    button.addEventListener("click", () => openProductForm());
  });

  $("products-body").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-product]");
    const deleteButton = event.target.closest("[data-delete-product]");

    if (editButton) {
      openProductForm(getProduct(editButton.dataset.editProduct));
    }
    if (deleteButton) {
      deleteProduct(deleteButton.dataset.deleteProduct);
    }
  });
}

/* ---------- Order management ---------- */

function renderOrderProductOptions() {
  const select = $("order-product");
  if (!select) return;

  const oldValue = select.value;
  select.innerHTML =
    '<option value="">Select a product</option>' +
    data.products.map((product) => `
      <option value="${escapeHTML(product.id)}" ${product.stock <= 0 ? "disabled" : ""}>
        ${escapeHTML(product.name)} · Stock ${product.stock} · ${money(product.price)}
      </option>
    `).join("");

  if (data.products.some((product) => product.id === oldValue && product.stock > 0)) {
    select.value = oldValue;
  }

  updateOrderPrice();
}

function updateOrderPrice() {
  const product = getProduct($("order-product").value);
  const quantity = Math.max(1, Number($("order-quantity").value) || 1);

  if (!product) {
    $("order-stock-hint").textContent = "Select a product to check stock.";
    return;
  }

  $("order-price").value = product.price;
  $("order-stock-hint").textContent =
    `${product.stock} units available. ` +
    (quantity > product.stock
      ? "Requested quantity exceeds available stock."
      : "Quantity is within available stock.");
}

function openOrderForm() {
  if (!data.products.some((product) => product.stock > 0)) {
    toast("Add a product with available stock before creating an order.", "warning");
    showPage("products");
    return;
  }

  $("order-form").reset();
  $("order-quantity").value = "1";
  renderOrderProductOptions();
  updateOrderPrice();
  openModal("order-modal");
}

function saveOrder(event) {
  event.preventDefault();

  const customer = $("order-customer").value.trim();
  const productId = $("order-product").value;
  const product = getProduct(productId);
  const quantity = Number($("order-quantity").value);
  const price = Number($("order-price").value);
  const notes = $("order-notes").value.trim();

  if (!customer) return toast("Customer name is required.", "error");
  if (!product) return toast("Select a valid product.", "error");
  if (!Number.isInteger(quantity) || quantity < 1) {
    return toast("Quantity must be a whole number greater than zero.", "error");
  }
  if (!Number.isFinite(price) || price < 0) {
    return toast("Enter a valid selling price.", "error");
  }
  if (quantity > product.stock) {
    return toast(`Only ${product.stock} units are available.`, "error");
  }

  const previousStock = product.stock;
  product.stock -= quantity;

  const order = {
    id: makeId(),
    customer,
    productId: product.id,
    productName: product.name,
    quantity,
    price,
    total: price * quantity,
    costPrice: product.costPrice,
    costTotal: product.costPrice * quantity,
    notes,
    status: "Pending",
    date: todayISO()
  };

  data.orders.unshift(order);

  if (!saveData()) {
    product.stock = previousStock;
    data.orders = data.orders.filter((item) => item.id !== order.id);
    return;
  }

  closeModal("order-modal");
  renderAll();
  toast("Order created. Stock has been reserved.");
}

function completeOrder(orderId) {
  const order = data.orders.find((item) => item.id === orderId);
  if (!order || orderStatus(order) !== "Pending") return;

  askConfirm(
    "Complete order?",
    `Mark order for ${order.customer} as completed? This will count its revenue and estimated profit.`,
    () => {
      order.status = "Completed";
      order.completedAt = todayISO();

      if (!saveData()) {
        order.status = "Pending";
        delete order.completedAt;
        return;
      }

      renderAll();
      toast("Order marked as completed.");
    },
    "Complete order"
  );
}

function cancelOrder(orderId) {
  const order = data.orders.find((item) => item.id === orderId);
  if (!order || orderStatus(order) !== "Pending") return;

  askConfirm(
    "Cancel order?",
    `Cancel the order for ${order.customer}? Its reserved stock will be returned.`,
    () => {
      const product = getProduct(order.productId);
      const previousStock = product?.stock;

      if (product) product.stock += order.quantity;
      order.status = "Cancelled";
      order.cancelledAt = todayISO();

      if (!saveData()) {
        order.status = "Pending";
        delete order.cancelledAt;
        if (product) product.stock = previousStock;
        return;
      }

      renderAll();
      toast("Order cancelled and stock restored.");
    },
    "Cancel order"
  );
}

function renderOrders() {
  const query = ($("order-search")?.value ?? "").trim().toLowerCase();
  const filter = $("order-filter")?.value ?? "All";

  const filtered = data.orders.filter((order) => {
    const status = orderStatus(order);
    const matchesStatus = filter === "All" || status === filter;
    const searchable = [
      order.id,
      order.customer,
      getOrderProductName(order),
      order.notes
    ].join(" ").toLowerCase();

    return matchesStatus && searchable.includes(query);
  });

  $("orders-count").textContent =
    `${filtered.length} order${filtered.length === 1 ? "" : "s"}`;

  const body = $("orders-body");
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state">${
      data.orders.length
        ? "No orders match these filters."
        : "No orders yet. Create your first order to start tracking sales."
    }</div></td></tr>`;
  } else {
    body.innerHTML = filtered.map((order) => {
      const status = orderStatus(order);
      const statusClass = status.toLowerCase();
      const canManage = status === "Pending";

      return `
        <tr>
          <td><strong>#${escapeHTML(String(order.id).slice(0, 8))}</strong></td>
          <td>${escapeHTML(order.customer)}</td>
          <td>${escapeHTML(getOrderProductName(order))}</td>
          <td>${order.quantity}</td>
          <td>${money(orderTotal(order))}</td>
          <td>${formatDate(order.date)}</td>
          <td><span class="status-badge status-${statusClass}">${status}</span></td>
          <td>
            <div class="row-actions">
              ${canManage ? `
                <button class="action-btn" data-complete-order="${escapeHTML(order.id)}" type="button">Complete</button>
                <button class="action-btn delete" data-cancel-order="${escapeHTML(order.id)}" type="button">Cancel</button>
              ` : `<span class="muted">—</span>`}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  $("orders-footer").textContent =
    `${data.orders.length} total orders · ${getPendingOrders().length} pending · ${getCompletedOrders().length} completed`;
}

function renderRecentOrders() {
  const body = $("recent-orders-body");
  const recent = [...data.orders]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (!recent.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state">Your latest orders will appear here.</div></td></tr>`;
    return;
  }

  body.innerHTML = recent.map((order) => {
    const status = orderStatus(order);
    return `
      <tr>
        <td><strong>#${escapeHTML(String(order.id).slice(0, 8))}</strong></td>
        <td>${escapeHTML(order.customer)}</td>
        <td>${formatDate(order.date)}</td>
        <td>${money(orderTotal(order))}</td>
        <td><span class="status-badge status-${status.toLowerCase()}">${status}</span></td>
      </tr>`;
  }).join("");
}

function setupOrderControls() {
  $("order-form").addEventListener("submit", saveOrder);
  $("order-product").addEventListener("change", updateOrderPrice);
  $("order-quantity").addEventListener("input", updateOrderPrice);

  $("add-order-btn").addEventListener("click", openOrderForm);

  document.querySelectorAll('[data-action="add-order"]').forEach((button) => {
    button.addEventListener("click", openOrderForm);
  });

  $("orders-body").addEventListener("click", (event) => {
    const complete = event.target.closest("[data-complete-order]");
    const cancel = event.target.closest("[data-cancel-order]");

    if (complete) completeOrder(complete.dataset.completeOrder);
    if (cancel) cancelOrder(cancel.dataset.cancelOrder);
  });

  $("order-search").addEventListener("input", renderOrders);
  $("order-filter").addEventListener("change", renderOrders);
}

/* ---------- Dashboard ---------- */

function renderDashboard() {
  const completed = getCompletedOrders();
  const pending = getPendingOrders();

  const revenue = completed.reduce((sum, order) => sum + orderTotal(order), 0);
  const estimatedProfit = completed.reduce(
    (sum, order) => sum + orderTotal(order) - orderCost(order),
    0
  );
  const lowStock = data.products.filter(
    (product) => product.stock <= LOW_STOCK_LIMIT
  );

  $("stat-products").textContent = data.products.length;
  $("stat-orders").textContent = data.orders.length;
  $("stat-pending").textContent = pending.length;
  $("stat-revenue").textContent = money(revenue);
  $("stat-profit").textContent = money(estimatedProfit);
  $("stat-low-stock").textContent = lowStock.length;
  $("today-label").textContent = new Date().toLocaleDateString("en-PK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  $("donut-total").textContent = data.orders.length;
  $("legend-pending").textContent = pending.length;
  $("legend-completed").textContent = completed.length;
  $("legend-cancelled").textContent =
    data.orders.filter((order) => orderStatus(order) === "Cancelled").length;

  const cancelled = data.orders.filter(
    (order) => orderStatus(order) === "Cancelled"
  ).length;
  const total = data.orders.length;

  const pendingDeg = total ? pending.length / total * 360 : 0;
  const completedDeg = total ? completed.length / total * 360 : 0;
  const cancelledDeg = total ? cancelled / total * 360 : 0;

  $("order-donut").style.background = total
    ? `conic-gradient(
        #fbbf24 0deg ${pendingDeg}deg,
        #34d399 ${pendingDeg}deg ${pendingDeg + completedDeg}deg,
        #64748b ${pendingDeg + completedDeg}deg 360deg
      )`
    : "conic-gradient(#263954 0deg 360deg)";

  const stockWatch = $("stock-watch");
  if (!lowStock.length) {
    stockWatch.innerHTML = `
      <div class="empty-state">
        All products have more than ${LOW_STOCK_LIMIT} units in stock.
      </div>`;
  } else {
    stockWatch.innerHTML = lowStock
      .slice()
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 6)
      .map((product) => `
        <div class="stock-item">
          <div>
            <strong>${escapeHTML(product.name)}</strong>
            <small>${escapeHTML(product.category)}</small>
          </div>
          <span class="stock-count ${product.stock > 0 ? "" : ""}">
            ${product.stock} left
          </span>
        </div>
      `).join("");
  }

  renderRecentOrders();
}

/* ---------- Marketing Studio ---------- */

function generateMarketingCopy(event) {
  event.preventDefault();

  const product = $("marketing-product").value.trim();
  const benefit = $("marketing-benefit").value.trim();
  const platform = $("marketing-platform").value;
  const language = $("marketing-language").value;

  if (!product) return toast("Enter a product name first.", "error");

  let text = "";

  if (language === "Roman Urdu") {
    const intro = platform === "WhatsApp"
      ? "Assalam-o-alaikum! 👋"
      : "✨ Aap ke liye khaas peshkash!";

    text = `${intro}\n\n${product} ab aap ke liye available hai!`;
    if (benefit) text += `\n\n${benefit}`;
    text += "\n\nMazeed maloomat ya order ke liye humein message karein. 💬";

    if (platform === "Instagram") {
      text += "\n\n#SmallBusiness #Shopping #Pakistan";
    } else if (platform === "Facebook") {
      text += "\n\nApni pasand aur sawalat comments mein share karein!";
    }
  } else if (language === "Simple Urdu") {
    text = `السلام علیکم!\n\n${product} اب آپ کے لیے دستیاب ہے۔`;
    if (benefit) text += `\n\n${benefit}`;
    text += "\n\nمزید معلومات یا آرڈر کے لیے ہم سے رابطہ کریں۔";

    if (platform === "Instagram") {
      text += "\n\n#SmallBusiness #Shopping #Pakistan";
    }
  } else {
    text = platform === "WhatsApp"
      ? `Hello! 👋\n\nIntroducing ${product}.`
      : `✨ Meet ${product}!\n\n`;

    if (benefit) text += `\n${benefit}\n`;
    text += "\nInterested? Message us to learn more or place an order.";

    if (platform === "Instagram") {
      text += "\n\n#SmallBusiness #NewArrival #ShopLocal";
    } else if (platform === "Facebook") {
      text += "\n\nHave questions? Leave a comment or send us a message.";
    }
  }

  $("marketing-output").value = text;
  toast("Marketing draft generated. Review it before publishing.");
}

async function copyMarketing() {
  const output = $("marketing-output").value;
  if (!output.trim()) return toast("Generate or write some text first.", "warning");

  try {
    await navigator.clipboard.writeText(output);
    toast("Marketing text copied.");
  } catch {
    $("marketing-output").focus();
    $("marketing-output").select();
    const copied = document.execCommand("copy");
    toast(
      copied ? "Marketing text copied." : "Select the text and copy it manually.",
      copied ? "success" : "warning"
    );
  }
}

function downloadMarketing() {
  const output = $("marketing-output").value;
  if (!output.trim()) return toast("There is no marketing text to download.", "warning");

  downloadFile(
    "kaampilot-marketing-draft.txt",
    output,
    "text/plain;charset=utf-8;"
  );
}

function setupMarketing() {
  $("marketing-form").addEventListener("submit", generateMarketingCopy);
  $("copy-marketing").addEventListener("click", copyMarketing);
  $("download-marketing").addEventListener("click", downloadMarketing);
}

/* ---------- Profit calculator ---------- */

function calculateProfit(event) {
  if (event) event.preventDefault();

  const price = Number($("calc-price").value);
  const cost = Number($("calc-cost").value);
  const quantity = Number($("calc-quantity").value);
  const expenses = Number($("calc-expenses").value);

  if (![price, cost, quantity, expenses].every(Number.isFinite)) {
    return toast("Enter valid numbers in all calculator fields.", "error");
  }

  if (price < 0 || cost < 0 || expenses < 0 ||
      !Number.isInteger(quantity) || quantity < 1) {
    return toast("Prices and expenses cannot be negative. Quantity must be a positive whole number.", "error");
  }

  const revenue = price * quantity;
  const productCost = cost * quantity;
  const profit = revenue - productCost - expenses;
  const margin = revenue > 0 ? profit / revenue * 100 : 0;
  const perUnit = profit / quantity;

  $("calc-result-profit").textContent = money(profit);
  $("calc-result-revenue").textContent = money(revenue);
  $("calc-result-cost").textContent = money(productCost);
  $("calc-result-expenses").textContent = money(expenses);
  $("calc-result-margin").textContent = `${margin.toFixed(2)}%`;
  $("calc-result-unit").textContent = money(perUnit);

  $("calc-result-profit").style.color =
    profit < 0 ? "#f87171" : "#6ee7b7";

  $("calc-result-note").textContent = profit < 0
    ? "This calculation shows a loss with the values entered."
    : "Estimate before taxes or any unlisted costs.";
}

function setupProfitCalculator() {
  $("profit-form").addEventListener("submit", calculateProfit);
  ["calc-price", "calc-cost", "calc-quantity", "calc-expenses"].forEach((id) => {
    $(id).addEventListener("input", () => calculateProfit());
  });
}

/* ---------- File downloads, JSON backup and CSV ---------- */

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportBackup() {
  if (window.__kaampilotStorageError) {
    return toast("Storage error detected. No backup was generated from empty fallback data.", "error");
  }

  const backup = {
    app: "KaamPilot",
    version: 1,
    exportedAt: todayISO(),
    data
  };

  downloadFile(
    `kaampilot-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8;"
  );

  toast("JSON backup downloaded.");
}

function restoreBackup(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const candidate = parsed?.data ?? parsed;
      const restored = normaliseData(candidate);

      askConfirm(
        "Restore backup?",
        `This backup contains ${restored.products.length} products and ${restored.orders.length} orders. Restoring replaces the current workspace data.`,
        () => {
          // Export the current state before replacing it.
          downloadFile(
            `kaampilot-before-restore-${Date.now()}.json`,
            JSON.stringify({ app: "KaamPilot", version: 1, data }, null, 2),
            "application/json;charset=utf-8;"
          );

          const previous = data;
          data = restored;

          if (!saveData()) {
            data = previous;
            return;
          }

          renderAll();
          toast("Backup restored successfully.");
        },
        "Restore backup"
      );
    } catch (error) {
      console.error(error);
      toast("Invalid backup. Your current data was not changed.", "error");
    }
  };

  reader.onerror = () => toast("The selected file could not be read.", "error");
  reader.readAsText(file);
}

function csvCell(value) {
  let text = String(value ?? "");

  // Reduce the risk of CSV formula injection when opened in spreadsheets.
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;

  return `"${text.replace(/"/g, '""')}"`;
}

function exportCSV(filename, rows) {
  if (!rows.length) return toast("There are no records to export.", "warning");

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))
  ].join("\r\n");

  downloadFile(filename, "\uFEFF" + csv, "text/csv;charset=utf-8;");
  toast(`${filename} downloaded.`);
}

function exportProducts() {
  exportCSV("kaampilot-products.csv", data.products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    costPrice: product.costPrice,
    sellingPrice: product.price,
    stock: product.stock
  })));
}

function exportOrders() {
  exportCSV("kaampilot-orders.csv", data.orders.map((order) => ({
    id: order.id,
    customer: order.customer,
    product: getOrderProductName(order),
    quantity: order.quantity,
    unitPrice: order.price,
    total: orderTotal(order),
    status: orderStatus(order),
    date: order.date,
    notes: order.notes ?? ""
  })));
}

function setupFileControls() {
  $("export-backup").addEventListener("click", exportBackup);
  $("export-products").addEventListener("click", exportProducts);
  $("export-orders").addEventListener("click", exportOrders);

  $("import-backup-trigger").addEventListener("click", () => {
    $("import-backup-file").click();
  });

  $("import-backup-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) restoreBackup(file);
  });
}

/* ---------- Confirmation actions ---------- */

function setupConfirmation() {
  $("confirm-action-btn").addEventListener("click", () => {
    const callback = confirmCallback;
    confirmCallback = null;
    closeModal("confirm-modal");

    if (typeof callback === "function") callback();
  });
}

/* ---------- Render all ---------- */

function renderAll() {
  renderDashboard();
  renderProducts();
  renderOrders();
}

/* ---------- Initialize ---------- */

function initKaamPilot() {
  loadData();

  setupNavigation();
  setupModalControls();
  setupProductControls();
  setupOrderControls();
  setupMarketing();
  setupProfitCalculator();
  setupFileControls();
  setupConfirmation();

  $("quick-add").addEventListener("click", () => {
    // Product modal handler is already registered by setupProductControls.
  });

  renderAll();
  calculateProfit();

  const hashPage = window.location.hash.slice(1);
  showPage(PAGE_TITLES[hashPage] ? hashPage : "dashboard");

  if (window.__kaampilotStorageError) {
    toast("Saved data could not be read. Do not clear browser storage.", "error");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initKaamPilot, { once: true });
} else {
  initKaamPilot();
}
