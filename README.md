# Gestão Financeira CRM — DuoFuturo

Sistema web de **gestão financeira + CRM** para negócios de mentoria, cursos e serviços.
Reúne funil de vendas (Kanban), pós-venda (CX), controle financeiro (receitas, despesas,
parcelas e cobranças), integração com WhatsApp, automações e um agente de IA consultor.

![Dashboard Financeiro](docs/images/dashboard.png)

---

## 📑 Índice

- [Funcionalidades](#-funcionalidades)
- [Stack](#-stack)
- [Arquitetura](#-arquitetura)
- [Estrutura de pastas](#-estrutura-de-pastas)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação e desenvolvimento](#-instalação-e-desenvolvimento)
- [Variáveis de ambiente](#-variáveis-de-ambiente)
- [Build e deploy](#-build-e-deploy)
- [Identidade visual](#-identidade-visual)
- [Tutoriais guiados](#-tutoriais-guiados)
- [Convenções](#-convenções)

---

## ✨ Funcionalidades

### CRM — Funil de Vendas (Kanban)
Quadro Kanban por estágios: cadastre, importe (CSV/Excel) e mova leads. Dispare mensagens
em massa por **WhatsApp** ou **e-mail**, traga contatos direto do WhatsApp e configure os
estágios do funil. Regra de duplicidade **por funil** (o mesmo lead pode existir em funis
diferentes, mas não duplicado no mesmo funil).

![CRM Funil de Vendas](docs/images/crm-funil.png)

### Dashboard do CRM
Visão analítica: leads ativos, valor em pipeline, taxa de conversão, tempo médio de
fechamento, follow-ups e gráfico de funil estágio a estágio.

![Dashboard CRM](docs/images/crm-dashboard.png)

### CRM CX (pós-venda)
Funil de Customer Experience para onboarding, acompanhamento e retenção de clientes.

### Clientes
Cadastro completo de clientes, com envio de e-mail individual ou em massa.

![Clientes](docs/images/clientes.png)

### Financeiro — Receitas, Despesas e Parcelas
Lançamento à vista ou parcelado (parcelas criadas automaticamente), filtros avançados e
importação de despesas via **Open Finance** (Pluggy). A tela de Parcelas centraliza a
**cobrança** por e-mail e WhatsApp.

![Receitas](docs/images/receitas.png)
![Parcelas](docs/images/parcelas.png)

### WhatsApp da Empresa
Conexão de WhatsApp por usuário (via QR Code), com status em tempo real e reconexão.

![WhatsApp](docs/images/whatsapp.png)

### Agente IA — "Sexta-feira"
Assistente de IA que responde dúvidas sobre o sistema e sobre os números do negócio,
também disponível no WhatsApp.

![Agente IA](docs/images/agente-ia.png)

### Outros módulos
- **Sessões** — agenda de mentorias/coaching (calendário e lista).
- **Automações** — disparos agendados, follow-ups e agente IA por estágio.
- **Configuração de E-mail** — credenciais SMTP (Brevo) para cobranças.
- **Administração** — gestão de usuários e permissões (RBAC).
- **Tutoriais guiados** — passo a passo interativo em cada tela.

---

## 🧱 Stack

| Camada | Tecnologias |
|--------|-------------|
| **Frontend** | React 19 · Vite 7 · TypeScript · Tailwind CSS 3 · React Query · React Router · lucide-react · driver.js |
| **Backend (API)** | Node.js · Express · TypeScript · PostgreSQL (`pg`) · JWT · Anthropic SDK |
| **Infra** | PM2 (cluster) · Nginx · Open Finance (Pluggy) · Baileys (WhatsApp) · Brevo (SMTP) |

---

## 🏗 Arquitetura

| Item | Valor |
|------|-------|
| API (porta) | `4100` |
| PM2 (API) | `gestao-financeira-api` (cluster, 3 instâncias) |
| PM2 (auxiliar) | `notificacao-service` (fork) |
| Banco de dados | PostgreSQL — `gestao_financeira` |
| Frontend (Nginx) | `/gestao/` → `frontend/dist/` |
| API (Nginx) | `/api/gestao/` → `localhost:4100/api/` |
| Domínios | `duofuturo.mooo.com`, `duofuturo.tech` (e `www`), `gestao.duofuturo.tech` |

> O frontend é um SPA estático servido pelo Nginx a partir de `frontend/dist/`.
> A API roda em cluster no PM2 e expõe os endpoints sob `/api`.

---

## 📁 Estrutura de pastas

```
gestao_financeira/
├── api/                  # Backend (Express + TypeScript)
│   └── src/
│       ├── config/       # database, env, jwt
│       ├── middlewares/  # auth, rbac
│       └── modules/      # auth, clientes, despesas, receitas, crm, whatsapp, agente-ia...
├── frontend/             # SPA (React + Vite + Tailwind)
│   └── src/
│       ├── components/   # ui/, layout/, crm/, tour/...
│       ├── pages/        # dashboard, crm, clientes, receitas, despesas, parcelas...
│       ├── tour/         # tutoriais guiados (driver.js)
│       └── api/          # clientes HTTP
├── notificacao-service/  # serviço auxiliar de notificações
├── docs/                 # documentação e imagens
└── README.md
```

---

## ✅ Pré-requisitos

- **Node.js** 18+ e **npm**
- **PostgreSQL** 14+
- (Opcional) **PM2** para produção e **Nginx** como proxy reverso

---

## 🚀 Instalação e desenvolvimento

```bash
# API
cd api
npm install
npm run dev          # tsx watch (hot reload) na porta 4100

# Frontend (em outro terminal)
cd frontend
npm install
npm run dev          # Vite dev server
```

> Crie os arquivos `.env` em `api/`, `frontend/` e `notificacao-service/` antes de subir
> (veja a seção abaixo). Eles **não** são versionados.

---

## 🔐 Variáveis de ambiente

Os valores ficam em arquivos `.env` (ignorados pelo git). Principais chaves:

**`api/.env`**
```
DATABASE_URL=postgresql://usuario:senha@localhost:5432/gestao_financeira
JWT_ACCESS_SECRET=...        # mínimo 64 caracteres
JWT_REFRESH_SECRET=...       # mínimo 64 caracteres
PLUGGY_CLIENT_ID=...         # Open Finance (despesas)
PLUGGY_CLIENT_SECRET=...
PLUGGY_SANDBOX=false
CORS_ORIGINS=["https://duofuturo.tech"]
ANTHROPIC_API_KEY=...        # Agente IA
```

**`frontend/.env`**
```
VITE_API_URL=/api/gestao
```

> ⚠️ Nunca commite `.env`, chaves ou `ecosystem.config.js` (config do PM2 com segredos).
> O `.gitignore` já bloqueia esses arquivos, além de `uploads/`, `backups/` e `dist/`.

---

## 📦 Build e deploy

```bash
# API
cd api
npm run build
pm2 restart gestao-financeira-api      # reinicia as instâncias do cluster

# Frontend
cd frontend
npm run build                          # gera frontend/dist/ (servido pelo Nginx)
```

> Após alterar a config do banco, reinicie também o `notificacao-service`.
> Sempre rode `nginx -t` antes de `systemctl reload nginx`, e `pm2 save` após mudanças de processo.

---

## 🎨 Identidade visual

Paleta oficial **DuoFuturo** — *"Navy domina, dourado pontua"*:

| Token | Hex | Uso |
|-------|-----|-----|
| Navy | `#13264C` | Cor primária (texto, fundos, CTAs) |
| Dourado | `#D2B773` | Destaque/acento (usar com parcimônia) |
| Creme | `#E5DDD1` | Superfícies neutras |
| Esmeralda | `#10b981` | Sucesso |

O design segue componentes reutilizáveis em `frontend/src/components/ui/` (ex.: `MetricCard`,
`Card`, `Button`, `Header`) e tokens Tailwind (`primary`, `gold`, `cream`).

---

## 🧭 Tutoriais guiados

Cada tela tem um **tutorial interativo** (driver.js) que explica suas funcionalidades. Ele:

- abre automaticamente na **1ª visita** de cada página (uma vez, fica salvo);
- pode ser reaberto pelo botão **"?"** no cabeçalho da página;
- respeita as permissões do usuário (RBAC).

Definições em `frontend/src/tour/` (`steps.ts`, `TourContext`, `TourHelpButton`).

---

## 📐 Convenções

- **Builds:** `npm run build` dentro da pasta do frontend/api.
- **Restart da API:** `pm2 restart gestao-financeira-api` após build da API.
- **Segredos:** JWT mínimo 64 caracteres; nunca versionar `.env`/credenciais.
- **RBAC:** papéis `admin`/`usuario` (e `master`/`super_admin`) com permissões distintas.

---

<sub>© DuoFuturo — uso interno.</sub>
