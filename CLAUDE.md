# Gestão Financeira CRM — Claude Code

## Infra

| Item | Valor |
|------|-------|
| API porta | 4100 |
| PM2 name | `gestao-financeira-api` (cluster, 3 instâncias) |
| PM2 name | `notificacao-service` (fork, serviço auxiliar) |
| DB name | `gestao_financeira` |
| DB user | `gestao_financeira_user` |
| Nginx frontend | `/gestao/` → `frontend/dist/` |
| Nginx API | `/api/gestao/` → `localhost:4100/api/` |
| Domínios | `duofuturo.mooo.com`, `duofuturo.tech` (e www), `gestao.duofuturo.tech` — todos servem `/gestao` (configs em `sites-available/duofuturo-mooo`, `duofuturo-tech`, `gestao-duofuturo-tech`) |
| Identidade | Azul Navy + Dourado + **Esmeralda `#10b981`** |

## Estrutura

```
api/src/
├── config/         # database.ts, env.ts, jwt.ts
├── middlewares/    # auth.middleware.ts, rbac.middleware.ts
└── modules/
    ├── auth/       # Login, registro, JWT
    ├── clientes/   # CRUD clientes
    ├── despesas/   # Lançamentos de despesa
    ├── receitas/   # Lançamentos de receita
    ├── sessoes/    # Controle de sessões ativas
    └── usuarios/  # Gestão de usuários (admin)
```

## Deploy

```bash
# API
cd /var/www/apps/gestao_financeira/api
npm run build
pm2 restart gestao-financeira-api

# Frontend
cd /var/www/apps/gestao_financeira/frontend
npm run build
```

## Observações

- Módulos `integracoes` e `relatorios` foram removidos (ver git log)
- `notificacao-service` roda em paralelo — reiniciar junto se alterar config do banco
- Campo `empresa` na tabela usuarios — VIEW com campos calculados ativa
- RBAC implementado: roles admin/usuario com permissões distintas
