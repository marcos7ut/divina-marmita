# Segurança

Este documento explica **o que protege o quê**, o que foi testado e o que ainda depende de você.

## Modelo de ameaça (resumo)

| Quem | Pode | Não pode |
|---|---|---|
| Visitante anônimo | Ler cardápio e ajustes; **criar** um pedido válido; **criar** um cadastro VIP; ler o *próprio* pedido pelo id aleatório | Listar pedidos de outros, ler leads, mudar cardápio, alterar status, apagar nada |
| Qualquer pessoa com conta Firebase | O mesmo que o visitante | Nada a mais: só o UID do dono tem poder |
| Dono (login + UID nas regras) | Tudo do painel | Apagar pedidos (por desenho: histórico fica) |

## Camadas

1. **Regras do Firestore** (`firebase/firestore.rules`): a barreira real. O navegador **não é confiável**, então toda decisão de acesso está no servidor.
   - Pedido: só campos permitidos (`hasOnly`), tipos, tamanhos máximos, `status` obrigatoriamente `novo`, horário dentro de ±10 min do servidor (impede pedido com data falsa), endereço obrigatório na entrega, id do documento = id do conteúdo (128 bits aleatórios), pagamento só entre os 4 valores.
   - Tudo que não está escrito é negado (`match /{document=**}` → `false`).
   - **18 testes automáticos** (dezenas de verificações) rodam contra o emulador oficial (`npm run test:rules`), inclusive o **mesmo código de produção** (`assets/js/data/firebase.js`) falando com Auth + Firestore.
2. **Autenticação**: e-mail e senha do Firebase Auth (senhas com hash e *rate limit* do Google). O hash de senha **não fica mais no código** do site (no protótipo anterior ficava, e qualquer visitante podia ler e tentar quebrar).
3. **Content-Security-Policy** (meta em todas as páginas): só carrega script do próprio site e do `gstatic.com` (SDK do Firebase) / reCAPTCHA; sem `unsafe-inline` nem `unsafe-eval`; `object-src 'none'`; `base-uri 'none'`; `form-action 'none'`. Mesmo que alguém consiga injetar HTML, o navegador não executa.
4. **Sem `innerHTML`**: toda a interface é montada com `createElement`/`textContent` (`assets/js/lib/dom.js`). O teste de ponta a ponta injeta `<img onerror=...>` num pedido e confere que aparece como texto no painel. `npm run check` **falha o build** se alguém introduzir `innerHTML`, `eval`, `style=""` ou `onclick=""`.
5. **Preço vem do catálogo, não do navegador**: o carrinho só guarda `id|tamanho|quantidade` e o total é recalculado de `data/menu.json` (testado: ids falsos e tamanhos inventados são ignorados). O pedido chega no painel como *aviso*; o valor final é confirmado no WhatsApp.
6. **Anti-abuso** (recomendado, guia no `SETUP-FIREBASE.md`): *App Check* com reCAPTCHA v3, chave de API restrita ao seu domínio e alerta de orçamento. O site também impõe 20 s entre pedidos (conveniência, não segurança).
7. **Privacidade**: o painel tem `noindex`, `robots.txt` bloqueia `/painel/`, `Referrer-Policy: no-referrer` no painel. A lista VIP **não é mais enviada a serviços de terceiros** (o protótipo usava `formsubmit.co`).
8. **Cadeia de suprimentos**: SDK do Firebase com **versão fixa** (10.14.1), nenhuma dependência de runtime além dele; dependências de desenvolvimento ficam fora do que vai ao ar (o workflow só publica `index.html`, `painel/`, `assets/`, `data/`).

## O que NÃO dá para garantir só com GitHub Pages

- **Cabeçalhos HTTP** (HSTS, `X-Frame-Options`, `frame-ancestors`): o Pages não permite configurar. O CSP via `<meta>` cobre scripts/estilos/conexões, mas **não** impede que outro site coloque o seu em um `<iframe>` (clickjacking). Para isso, ponha um domínio próprio atrás do Cloudflare (gratuito) e adicione `X-Frame-Options: DENY`.
- **Limite de pedidos por IP**: o Firestore não tem. O App Check reduz muito, mas um atacante humano determinado ainda pode criar pedidos falsos. Mitigação operacional: o painel mostra o pedido, você confirma no WhatsApp antes de produzir; pedido sem confirmação pode ser **cancelado** com um toque.
- **Conteúdo dos itens do pedido**: as regras não conseguem iterar em listas, então validam tamanho e quantidade de itens, mas não o conteúdo de cada um. Por isso o painel trata tudo como texto e o valor é confirmado por fora.

## Se algo der errado

- **Suspeita de senha vazada**: Firebase → Authentication → Usuários → redefinir senha. As sessões antigas expiram.
- **Pedidos falsos em massa**: painel → Ajustes → **pausar pedidos**; Firebase → App Check → impor para Firestore.
- **Trocar o dono**: crie o novo usuário, troque o `OWNER_UID` nas regras e publique.

## Reportar vulnerabilidade

Abra uma *issue* privada (Security → Report a vulnerability) no repositório.
