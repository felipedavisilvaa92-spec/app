# Controlador de Estoque — SPEC

App de controle de estoque para e-commerce de roupas. UI toda em português (pt-BR). **Sem login.**
**100% frontend / estático**: pensado para hospedar só a pasta `frontend/` na Vercel. Não usa o backend Python nem o MongoDB — todos os dados ficam no **LocalStorage** do navegador (chave `controlador-estoque:v1`). A pasta `backend/` continua no repositório, mas o app não usa mais.

## O que faz
- Catálogo fixo (`frontend/src/lib/catalog.ts`): **Camiseta** (P/M/G/GG × 12 cores: cinza, roxo, amarelo, azul royal, azul marinho, preta, branca, caqui, marrom, rosa, off white, vermelha), **Regata** (P/M/G/GG × marrom, preta, bege, branca) e **Short** (P/M/G/GG × branca, preta, azul marinho) = **76 variantes**. Id da variante determinístico: `produto:cor:tamanho` (ex.: `camiseta:cinza:P`).
- **/estoque**: matriz cor × tamanho por produto, filtros, botões +/− que abrem o dialog "Nova Movimentação" (entrada/saída). Saída maior que o estoque é bloqueada.
- **/pedidos** (Montagem de Pedidos): comprador, separador, nº automático #001+ e data/hora; itens do catálogo com checkbox de separação; finalizar abate do estoque **só os itens marcados** (tudo ou nada; erro se faltar estoque) e registra saídas com nota "Pedido #00X · comprador"; cancelar é lógico (status "cancelado", some da lista, número continua reservado); "Imprimir Pedido" na montagem e no histórico (`@media print`: some .screen-only, mostra só .print-only com nº, data, nomes, itens e linha de assinatura).
- **/historico**: movimentações com filtro por tipo.
- **/** (Painel): total de peças, variantes zeradas, baixo estoque (1–3), mais vendidos (top 5), movimentações recentes, botão **Exportar Excel** (gerado no navegador com `write-excel-file`, abas Estoque/Histórico).
- **Backup** (botão no header, em todas as páginas): **Exportar Backup** baixa `backup-estoque-<data>.json`; **Importar Backup** lê o arquivo, valida (`app: "controlador-estoque"`, version 1), mostra resumo (peças, movimentações, pedidos) e só substitui os dados depois da confirmação. Mostra a data do último backup exportado.

## Camada de dados (frontend)
- `src/lib/localdb.ts`: estado `{ version: 1, created_at, quantities{variantId: n}, updated_at{variantId: iso}, movements[], orders[], last_backup_at }` + `handle(method, path, body)`, que atende as mesmas "rotas" do antigo backend: GET /catalog, /stock, /movements?kind&item_id&limit, /dashboard, /orders; POST /movements, /orders, /orders/{id}/items, /orders/{id}/finalize; PATCH /orders/{id}/items/{row}; DELETE /orders/{id}/items/{row}, /orders/{id}. Os erros usam `ApiError(status, {detail})` (400/404/422) como no FastAPI.
- `src/lib/api.ts`: apiGet/apiPost/... encaminham para `handle()` (nenhuma requisição de rede).
- `src/lib/backup.ts`, `src/lib/excel.ts`, `src/components/BackupMenu.tsx`.
- Tipos TS em `src/lib/types.ts`.

## Deploy
- `frontend/vercel.json`: framework vite, `yarn build`, saída `dist`, rewrite SPA para /index.html. Na Vercel, defina **Root Directory = frontend**.

## Dados iniciais
- Começa vazio (todas as quantidades 0), por escolha do usuário. Não há seed.

## Credenciais
- Nenhuma — o app não tem login.
