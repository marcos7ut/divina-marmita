# Divina Marmita

Cardápio online com **painel da cozinha em tempo real**, feito para uma marmitaria de bairro.

- **Cliente**: vê o *quadro do dia* ao vivo, pede, recebe a previsão de prazo e acompanha o pedido até chegar. O pedido também vai pelo WhatsApp.
- **Dono**: entra com e-mail e senha, liga/esgota/oculta pratos, recebe pedidos com aviso sonoro, avança cada etapa, imprime a comanda (80 mm) e acompanha faturamento, ticket médio, fila, atrasos e tempo de preparo.
- **Sem servidor para manter**: GitHub Pages + Firebase (plano gratuito).

## Começar

1. **Testar agora (sem configurar nada):**
   ```bash
   npm install && npm run serve
   ```
   Site em `http://localhost:8080` e painel em `http://localhost:8080/painel/` (login de demonstração `demo@divina.local` / `demo1234`). Abra os dois lado a lado.
2. **Colocar no ar:** siga [`docs/SETUP-FIREBASE.md`](docs/SETUP-FIREBASE.md) (20–30 min, com links).

## Qualidade

| Comando | O que garante |
|---|---|
| `npm run check` | CSP sem `unsafe-*`, nenhum `innerHTML`/`eval`/estilo inline, `rel=noopener`, nenhum segredo, regras sem escrita pública |
| `npm test` | 21 testes da lógica (carrinho, cardápio, prazo, pedidos, métricas) |
| `npm run test:rules` | 18 testes das regras do Firestore + o adaptador de produção contra os emuladores |
| `npm run test:e2e` | fluxo completo no navegador (dono muda o cardápio → cliente pede → cozinha avança → cliente acompanha) e teste de XSS |

O CI roda tudo a cada *push*; o deploy só acontece se `check` e `test` passarem.

## Documentação

- [`docs/SETUP-FIREBASE.md`](docs/SETUP-FIREBASE.md) · passo a passo de publicação e proteções
- [`docs/SECURITY.md`](docs/SECURITY.md) · modelo de ameaça, camadas e limites honestos
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · estrutura, modelo de dados e decisões

## Editar o cardápio e os preços

Pratos, preços, descrições e fotos ficam em [`data/menu.json`](data/menu.json) e `assets/img/`. Ligar/desligar no dia a dia é pelo painel, sem tocar em código.
