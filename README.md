# Venda Fácil

Aplicativo simples de vendas com catálogo, carrinho, baixa de estoque e atualização em tempo real via WebSocket. O projeto usa Node.js, Express e `ws`, sem framework no frontend.

## Funcionalidades

- catálogo responsivo de produtos;
- carrinho com controle de quantidade;
- criação e validação de pedidos;
- baixa de estoque no servidor;
- atualização simultânea de estoque e vendas em todas as telas;
- reconexão automática do WebSocket;
- heartbeat para remover conexões inativas;
- endpoint de saúde para o Render.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Acesse [http://localhost:3000](http://localhost:3000). Abra duas abas para observar a atualização em tempo real após uma venda.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Endpoints

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/health` | Verifica a saúde do serviço |
| `GET` | `/api/products` | Lista produtos e estoque atual |
| `GET` | `/api/orders` | Lista os 20 pedidos mais recentes |
| `POST` | `/api/orders` | Cria um pedido e atualiza o estoque |
| WebSocket | `/ws` | Entrega eventos em tempo real |

Exemplo de pedido:

```json
{
  "customer": "Maria Silva",
  "items": [
    { "productId": "cafe", "quantity": 2 }
  ]
}
```

O contrato completo das mensagens está em [WEBSOCKET.md](./WEBSOCKET.md).

## Deploy no Render

O arquivo `render.yaml` já configura um Web Service. No painel do Render:

1. escolha **New > Blueprint**;
2. conecte este repositório do GitHub;
3. confirme o serviço `testedevenda`;
4. aguarde o build e acesse a URL criada pelo Render.

O servidor usa `process.env.PORT`, escuta em `0.0.0.0` e compartilha a mesma porta entre HTTP e WebSocket. No navegador, o endereço muda automaticamente de `ws://` para `wss://` quando o site está em HTTPS.

## Persistência

Este é um exemplo simples: produtos, estoque e pedidos ficam em memória. Reiniciar ou publicar uma nova versão do serviço restaura os dados iniciais. Para produção, substitua os arrays por PostgreSQL e, ao usar várias instâncias, distribua eventos com Redis/Render Key Value.
