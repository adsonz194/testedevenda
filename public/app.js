const state = {
  products: [],
  cart: new Map(),
  orders: [],
  socket: null,
  reconnectAttempt: 0,
  reconnectTimer: null
};

const elements = {
  productGrid: document.querySelector("#product-grid"),
  cartItems: document.querySelector("#cart-items"),
  cartCount: document.querySelector("#cart-count"),
  cartTotal: document.querySelector("#cart-total"),
  orderForm: document.querySelector("#order-form"),
  customer: document.querySelector("#customer"),
  checkoutButton: document.querySelector("#checkout-button"),
  connectionStatus: document.querySelector("#connection-status"),
  statusText: document.querySelector(".status-text"),
  recentOrders: document.querySelector("#recent-orders"),
  metricProducts: document.querySelector("#metric-products"),
  metricStock: document.querySelector("#metric-stock"),
  metricOrders: document.querySelector("#metric-orders"),
  toastRegion: document.querySelector("#toast-region")
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const formatMoney = (cents) => currency.format(cents / 100);

function setConnectionStatus(status, text) {
  elements.connectionStatus.className = `connection-status is-${status}`;
  elements.statusText.textContent = text;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);

  setTimeout(() => toast.remove(), 4200);
}

function productById(productId) {
  return state.products.find((product) => product.id === productId);
}

function normalizeCart() {
  for (const [productId, quantity] of state.cart) {
    const product = productById(productId);

    if (!product || product.stock === 0) {
      state.cart.delete(productId);
    } else if (quantity > product.stock) {
      state.cart.set(productId, product.stock);
    }
  }
}

function renderMetrics() {
  elements.metricProducts.textContent = state.products.length;
  elements.metricStock.textContent = state.products.reduce((sum, product) => sum + product.stock, 0);
  elements.metricOrders.textContent = state.orders.length;
}

function renderProducts() {
  if (state.products.length === 0) {
    elements.productGrid.innerHTML = '<div class="loading-card">Nenhum produto disponível.</div>';
    renderMetrics();
    return;
  }

  elements.productGrid.innerHTML = state.products.map((product) => `
    <article class="product-card">
      <span class="product-icon" aria-hidden="true">${product.emoji}</span>
      <h3>${product.name}</h3>
      <p class="product-description">${product.description}</p>
      <div class="product-footer">
        <div class="price-block">
          <strong>${formatMoney(product.price)}</strong>
          <small>${product.stock > 0 ? `${product.stock} em estoque` : "Sem estoque"}</small>
        </div>
        <button
          class="add-button"
          type="button"
          data-add="${product.id}"
          aria-label="Adicionar ${product.name}"
          ${product.stock === 0 ? "disabled" : ""}
        >+</button>
      </div>
    </article>
  `).join("");

  renderMetrics();
}

function cartDetails() {
  return [...state.cart.entries()].map(([productId, quantity]) => ({
    product: productById(productId),
    quantity
  })).filter((item) => item.product);
}

function renderCart() {
  normalizeCart();
  const items = cartDetails();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  elements.cartCount.textContent = itemCount;
  elements.cartTotal.textContent = formatMoney(total);
  elements.checkoutButton.disabled = items.length === 0;

  if (items.length === 0) {
    elements.cartItems.innerHTML = `
      <div class="empty-cart">
        <span>🛒</span>
        <p>Seu carrinho está vazio.</p>
        <small>Adicione um produto para começar.</small>
      </div>
    `;
    return;
  }

  elements.cartItems.innerHTML = items.map(({ product, quantity }) => `
    <article class="cart-row">
      <div>
        <h3>${product.name}</h3>
        <small>${formatMoney(product.price * quantity)}</small>
      </div>
      <div class="quantity-controls" aria-label="Quantidade de ${product.name}">
        <button type="button" data-decrease="${product.id}" aria-label="Diminuir quantidade">−</button>
        <span>${quantity}</span>
        <button type="button" data-increase="${product.id}" aria-label="Aumentar quantidade">+</button>
      </div>
    </article>
  `).join("");
}

function renderOrders() {
  const visibleOrders = state.orders.slice(0, 6);

  elements.metricOrders.textContent = state.orders.length;

  if (visibleOrders.length === 0) {
    elements.recentOrders.innerHTML = '<p class="empty-message">As novas vendas aparecerão aqui.</p>';
    return;
  }

  elements.recentOrders.innerHTML = visibleOrders.map((order) => {
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const date = new Date(order.createdAt);

    return `
      <article class="order-row">
        <div>
          <strong>${order.customer}</strong>
          <small>${itemCount} ${itemCount === 1 ? "item" : "itens"}</small>
        </div>
        <time datetime="${order.createdAt}">${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
        <span class="order-total">${formatMoney(order.total)}</span>
      </article>
    `;
  }).join("");
}

function addToCart(productId) {
  const product = productById(productId);

  if (!product) return;

  const current = state.cart.get(productId) ?? 0;

  if (current >= product.stock) {
    showToast(`O estoque de ${product.name} chegou ao limite.`, "error");
    return;
  }

  state.cart.set(productId, current + 1);
  renderCart();
}

elements.productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

elements.cartItems.addEventListener("click", (event) => {
  const decreaseButton = event.target.closest("[data-decrease]");
  const increaseButton = event.target.closest("[data-increase]");

  if (decreaseButton) {
    const productId = decreaseButton.dataset.decrease;
    const nextQuantity = (state.cart.get(productId) ?? 1) - 1;

    if (nextQuantity <= 0) state.cart.delete(productId);
    else state.cart.set(productId, nextQuantity);

    renderCart();
  }

  if (increaseButton) addToCart(increaseButton.dataset.increase);
});

elements.orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const items = cartDetails();

  if (items.length === 0) return;

  elements.checkoutButton.disabled = true;
  elements.checkoutButton.firstChild.textContent = "Processando… ";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: elements.customer.value,
        items: items.map(({ product, quantity }) => ({ productId: product.id, quantity }))
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível finalizar a venda.");
    }

    state.cart.clear();
    elements.orderForm.reset();
    renderCart();
    showToast(`Venda de ${formatMoney(result.total)} finalizada com sucesso.`);
  } catch (error) {
    showToast(error.message, "error");
    await loadProducts();
  } finally {
    elements.checkoutButton.firstChild.textContent = "Finalizar venda ";
    elements.checkoutButton.disabled = state.cart.size === 0;
  }
});

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error();

    state.products = await response.json();
    normalizeCart();
    renderProducts();
    renderCart();
  } catch {
    showToast("Não foi possível carregar os produtos.", "error");
  }
}

function addOrder(order) {
  if (!state.orders.some((candidate) => candidate.id === order.id)) {
    state.orders.unshift(order);
    state.orders = state.orders.slice(0, 20);
    renderOrders();
  }
}

function handleSocketMessage(event) {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (message.type === "connection.ready") {
    state.products = message.data.products;
    state.orders = message.data.recentOrders;
    normalizeCart();
    renderProducts();
    renderCart();
    renderOrders();
  }

  if (message.type === "catalog.updated") {
    state.products = message.data.products;
    normalizeCart();
    renderProducts();
    renderCart();
  }

  if (message.type === "order.created") {
    addOrder(message.data.order);
  }

  if (message.type === "server.shutdown") {
    setConnectionStatus("connecting", "Servidor reiniciando…");
  }
}

function connectWebSocket() {
  clearTimeout(state.reconnectTimer);
  setConnectionStatus("connecting", "Conectando…");

  const socketUrl = new URL("/ws", window.location.href);
  socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  state.socket = new WebSocket(socketUrl);

  state.socket.addEventListener("open", () => {
    state.reconnectAttempt = 0;
    setConnectionStatus("online", "Tempo real ativo");
  });

  state.socket.addEventListener("message", handleSocketMessage);

  state.socket.addEventListener("close", () => {
    setConnectionStatus("offline", "Reconectando…");
    const delay = Math.min(1000 * (2 ** state.reconnectAttempt), 15_000);
    state.reconnectAttempt += 1;
    state.reconnectTimer = setTimeout(connectWebSocket, delay);
  });

  state.socket.addEventListener("error", () => {
    state.socket.close();
  });
}

loadProducts();
renderCart();
renderOrders();
connectWebSocket();
