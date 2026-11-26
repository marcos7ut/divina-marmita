# Passo a passo: colocar no ar (Firebase + GitHub Pages)

Tempo estimado: **20 a 30 minutos**. Custo: **R$ 0** no uso normal de uma marmitaria (o plano gratuito do Firebase aguenta milhares de visitas por dia).

> Até você fazer isso, o site já funciona em **modo demonstração** (dados só no seu navegador).
> Abra `painel/` e entre com `demo@divina.local` / `demo1234` para testar tudo.

---

## Parte 1 · Criar o projeto no Firebase

1. Acesse **https://console.firebase.google.com** e entre com uma conta Google (use a do restaurante).
2. Clique em **Criar um projeto** → nome: `divina-marmita` → pode **desativar o Google Analytics** → **Criar**.
3. No menu da esquerda: **Criação** → **Firestore Database** → **Criar banco de dados**.
   - Local: **`southamerica-east1` (São Paulo)** (mais rápido para o Brasil; não dá para mudar depois).
   - Modo: **Produção** (as regras de segurança entram no passo 6).
4. **Criação** → **Authentication** → **Vamos começar** → aba **Método de login** → **E-mail/senha** → ative a primeira opção → **Salvar**.
5. Ainda em **Authentication** → aba **Usuários** → **Adicionar usuário**: coloque o **e-mail do dono** e uma **senha forte** (12+ caracteres, só você sabe). Depois de criado, **copie o "UID do usuário"** (uma sequência de letras e números).

## Parte 2 · Ligar o site ao Firebase

6. No Firebase: engrenagem ⚙️ → **Configurações do projeto** → role até **Seus aplicativos** → ícone **`</>` (Web)** → apelido `site` → **Não** marque "Firebase Hosting" → **Registrar app**.
7. Vai aparecer um bloco `firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copie esses valores e cole em **`assets/js/config.js`**, no campo `firebase:` (o arquivo tem um exemplo comentado).
   - Isso **não é segredo**: é só o "endereço" do projeto. Quem protege os dados são as regras do passo 8.
8. Abra **`firebase/firestore.rules`**, troque `OWNER_UID` (aparece 1 vez na função `isOwner`) pelo **UID copiado no passo 5**, mantendo as aspas.
9. No Firebase: **Firestore Database** → aba **Regras** → apague tudo → cole o conteúdo do arquivo `firebase/firestore.rules` → **Publicar**.

## Parte 3 · Publicar no GitHub Pages

10. No GitHub, abra o repositório → **Settings** → **Pages** → em **Build and deployment** → **Source: GitHub Actions**.
11. Faça o *commit* das alterações dos passos 7 e 8 na branch `main`. O workflow **"Publicar no GitHub Pages"** roda sozinho (aba **Actions**) e, em ~1 minuto, o endereço aparece em **Settings → Pages**: `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
12. **Autorize o domínio** no Firebase: **Authentication** → **Configurações** → **Domínios autorizados** → **Adicionar domínio** → `SEU-USUARIO.github.io`.

Pronto: o painel fica em `.../painel/`. No celular, abra e use **"Adicionar à tela inicial"**.

---

## Parte 4 · Proteções recomendadas (faça, leva 10 minutos)

Estas são as camadas que impedem abuso. O `docs/SECURITY.md` explica o porquê de cada uma.

### A. Restringir a chave de API ao seu site
1. **https://console.cloud.google.com/apis/credentials** (selecione o projeto `divina-marmita`).
2. Abra a chave **"Browser key"** → **Restrições de aplicativo** → **Sites (referenciadores HTTP)** → adicione:
   `https://SEU-USUARIO.github.io/*`
3. Em **Restrições de API**, deixe só: *Identity Toolkit API*, *Token Service API*, *Cloud Firestore API*. **Salvar**.

### B. App Check (bloqueia robôs e scripts que não são o seu site)
1. Registre o site no **reCAPTCHA v3**: **https://www.google.com/recaptcha/admin/create** → tipo **v3** → domínio `SEU-USUARIO.github.io` → copie a **Chave do site** (a pública) e a **Chave secreta**.
2. Firebase → **App Check** → **Apps** → seu app Web → **reCAPTCHA** → cole a **chave secreta** → **Salvar**.
3. Cole a **chave do site** em `assets/js/config.js` → `appCheckSiteKey`.
4. Teste o site por um dia. Se tudo certo: **App Check → APIs → Cloud Firestore → Impor (Enforce)**.

### C. Impedir que estranhos criem conta
Mesmo que alguém crie uma conta, as regras só dão poder ao seu UID. Ainda assim, feche a porta:
**Authentication → Configurações → Ações do usuário** → desmarque **"Ativar criação (cadastro)"** (se a opção não aparecer, atualize para o *Identity Platform*, é gratuito até 50 mil usuários ativos/mês, e tem a opção em **Configurações**).

### D. Alerta de gastos
**https://console.cloud.google.com/billing/budgets** → **Criar orçamento** → R$ 20 → alertas em 50% e 100%. Assim você é avisado antes de qualquer surpresa.

### E. Conta do dono
Ative a **verificação em duas etapas** na conta Google dona do projeto: **https://myaccount.google.com/security**.

---

## Parte 5 · Conferir se está tudo certo

- [ ] Abri o site e o cardápio carrega.
- [ ] Entrei no `/painel/` com e-mail e senha.
- [ ] Mudei um prato para **Esgotou** e, no site (outra aba), ele ficou riscado na hora.
- [ ] Fiz um pedido de teste e ele apareceu em **Novo** no painel, com aviso sonoro.
- [ ] Avancei o pedido e o cliente viu a etapa mudar no topo do site.
- [ ] Numa janela anônima (sem login) tentei abrir `/painel/` e **não** consegui ver pedidos.

Se algo falhar, o painel mostra a mensagem do problema (por exemplo, "Sem permissão para salvar" = o UID nas regras está errado).

---

## Para desenvolvedores: rodar localmente

```bash
npm install
npm run serve        # http://localhost:8080 (modo demonstração)
npm run check        # verificações de segurança estáticas
npm test             # testes da lógica
npm run test:rules   # regras do Firestore + integração (precisa de Java 11+; baixa os emuladores na 1ª vez)
npx playwright install chromium && npm run test:e2e
```
