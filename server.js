const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const express = require("express");
const { WebSocket, WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const products = [
  { id: "cafe", name: "Café especial", description: "Pacote de 500 g, torra média", price: 3290, stock: 12, emoji: "☕" },
  { id: "caneca", name: "Caneca térmica", description: "Aço inox, capacidade de 350 ml", price: 5990, stock: 8, emoji: "🥤" },
  { id: "filtro", name: "Filtro reutilizável", description: "Tamanho 02, tecido lavável", price: 2450, stock: 15, emoji: "♻️" },
  { id: "moedor", name: "Moedor manual", description: "Mós de cerâmica com ajuste", price: 8990, stock: 5, emoji: "⚙️" }
];

const orders = [];

const publicProduct = ({ id, name, description, price, stock, emoji }) => ({
  id,
  name,
  description,
  price,
  stock,
  emoji
});

const productSnapshot = () => products.map(publicProduct);

app.get("/health", (_request, response) => {
  response.json({ status: "ok", websocketClients: wss.clients.size });
});

app.get("/api/products", (_request, response) => {
  response.json(productSnapshot());
});

app.get("/api/orders", (_request, response) => {
  response.json(orders.slice(-20).reverse());
});

app.post("/api/orders", (request, response) => {
  const customer = String(request.body?.customer ?? "").trim();
  const requestedItems = request.body?.items;

  if (customer.length < 2 || customer.length > 80) {
    return response.status(400).json({ error: "Informe um nome de cliente válido." });
  }

  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    return response.status(400).json({ error: "Adicione pelo menos um produto ao pedido." });
  }

  const quantities = new Map();

  for (const item of requestedItems) {
    const productId = String(item?.productId ?? "");
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return response.status(400).json({ error: "Uma quantidade do pedido é inválida." });
    }

    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }

  const items = [];

  for (const [productId, quantity] of quantities) {
    const product = products.find((candidate) => candidate.id === productId);

    if (!product) {
      return response.status(400).json({ error: "Um dos produtos não existe." });
    }

    if (product.stock < quantity) {
      return response.status(409).json({
        error: `Estoque insuficiente para ${product.name}. Disponível: ${product.stock}.`
      });
    }

    items.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      subtotal: product.price * quantity
    });
  }

  for (const item of items) {
    const product = products.find((candidate) => candidate.id === item.productId);
    product.stock -= item.quantity;
  }

  const order = {
    id: crypto.randomUUID(),
    customer,
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    createdAt: new Date().toISOString()
  };

  orders.push(order);
  broadcast("order.created", { order });
  broadcast("catalog.updated", { products: productSnapshot() });

  return response.status(201).json(order);
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Rota não encontrada." });
});

const wss = new WebSocketServer({ server, path: "/ws" });

function send(socket, type, data = {}) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data, sentAt: new Date().toISOString() }));
  }
}

function broadcast(type, data) {
  for (const client of wss.clients) {
    send(client, type, data);
  }
}

wss.on("connection", (socket) => {
  socket.isAlive = true;

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      if (message.type === "ping") {
        send(socket, "pong");
      }
    } catch {
      send(socket, "error", { message: "Mensagem WebSocket inválida." });
    }
  });

  send(socket, "connection.ready", {
    clientId: crypto.randomUUID(),
    products: productSnapshot(),
    recentOrders: orders.slice(-5).reverse()
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }

    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);

server.on("close", () => clearInterval(heartbeat));

const port = Number(process.env.PORT) || 3000;

server.listen(port, "0.0.0.0", () => {
  console.log(`Loja disponível em http://0.0.0.0:${port}`);
  console.log(`WebSocket disponível em ws://0.0.0.0:${port}/ws`);
});

process.on("SIGTERM", () => {
  broadcast("server.shutdown", { reconnect: true });

  for (const socket of wss.clients) {
    socket.close(1012, "Servidor reiniciando");
  }

  server.close(() => process.exit(0));

  setTimeout(() => process.exit(1), 10_000).unref();
});
