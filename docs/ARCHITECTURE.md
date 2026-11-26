# Arquitetura

Site 100% estático (GitHub Pages) + Firebase (Auth e Firestore). **Sem etapa de build**: ES Modules direto no navegador.

```
index.html            site do cliente
painel/index.html     painel da cozinha (noindex)
data/menu.json        catálogo: pratos, preços, categorias, plano padrão da semana
assets/js/
  lib/                lógica PURA (sem DOM), toda testada em Node
    cart.js           carrinho, totais, mínimo, taxa
    menuState.js      plano da semana × edição do dia → ativo | esgotado | oculto
    eta.js            previsão de prazo a partir da fila
    validate.js       monta/valida pedido e lead (preço sempre do catálogo)
    stats.js          métricas do dia (faturamento, ticket, preparo médio, top pratos…)
    status.js         máquina de estados do pedido
  data/
    store.js          escolhe o armazenamento
    firebase.js       Auth + Firestore (produção)
    local.js          localStorage + BroadcastChannel (demonstração/testes)
  site/               telas do cliente (menu, carrinho, rastreio, reserva, VIP)
  painel/             telas da cozinha (login, quadro de pedidos, cardápio, ajustes)
firebase/             regras e índices do Firestore
tests/                lógica · regras+integração (emuladores) · ponta a ponta (Playwright)
```

## Modelo de dados (Firestore)

| Caminho | Quem escreve | Conteúdo |
|---|---|---|
| `config/menu` | dono | `{ day: 'AAAA-MM-DD', on: [ids], out: [ids] }` — vale só no dia em que foi salvo |
| `config/plan` | dono | `{ dias: { 1: [ids], … } }` — cardápio padrão de cada dia |
| `config/ops` | dono | `{ aberto, base, porPedido, cozinheiros, deslocamento, fila }` — prazo e pausa |
| `orders/{id}` | cliente (criar) · dono (status) | pedido; `ts` guarda a hora de cada etapa |
| `leads/{id}` | cliente (criar) · dono (ler) | cadastro VIP |

## Decisões que valem explicar

- **O cardápio "expira" sozinho à meia-noite.** `config/menu.day` guarda o dia; se não for hoje, vale o plano da semana. O dono nunca precisa "resetar" nada, e esquecer um prato ligado não vaza para o dia seguinte. (O bug do protótipo original: dependia de uma API que só existe dentro do Claude, por isso nada salvava fora dele.)
- **Três estados, não dois.** *Esgotou* é diferente de *Oculto*: o prato continua na vitrine, riscado, e o cliente entende que "foi hoje, volta outro dia".
- **Prazo calculado, não chutado.** `preparo = base + (fila ÷ cozinheiros) × minutos por pedido`; entrega soma o deslocamento. O painel publica `fila` em `config/ops`; o site usa para mostrar a faixa ao cliente. O dono ajusta os 4 números em **Ajustes**.
- **Rastreio sem login.** O id do pedido (128 bits) é o segredo: `get` é público, `list` é do dono.
- **Mesma interface para dois armazenamentos** (`store`): permite demonstrar o produto sem Firebase e testar o fluxo inteiro em CI sem rede.
