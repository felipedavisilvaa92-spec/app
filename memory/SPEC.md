# Controlador de Estoque — SPEC

App de controle de estoque para e-commerce de roupas. UI toda em português (pt-BR). **Sem autenticação** — acesso direto, sem login.

## O que faz
- Catálogo fixo (backend/lib/catalog.py): **Camiseta** (P/M/G/GG × 12 cores: cinza, roxo, amarelo, azul royal, azul marinho, preta, branca, caqui, marrom, rosa, off white, vermelha), **Regata** (P/M/G/GG × 4 cores: marrom, preta, bege, branca) e **Short** (P/M/G/GG × 3 cores: branca, preta, azul marinho) = **76 variantes**.
- **/estoque**: matriz cor × tamanho por produto, quantidade por variante, filtros (produto, cor, tamanho, busca por cor) e botões rápidos +/− que abrem o dialog "Nova Movimentação".
- **Movimentações**: `entrada` (compra) e `saída` (venda) por variante com observação opcional. Saída nunca pode exceder o estoque — validação no frontend e no backend (HTTP 400, detail "Quantidade de saída maior que o estoque disponível").
- **/historico**: histórico completo com filtro por tipo (todas/entradas/saídas).
- **/** (Painel): total de peças, variantes zeradas, baixo estoque (1–3 peças), mais vendidos (top 5 saídas agregadas por variante) e movimentações recentes.
- Sem preços/valores — apenas quantidades (pedido do usuário). Sem alertas configuráveis de reposição.

## Dados (Mongo, DB "app")
- `stock_items`: { id (uuid string), product_type, size, color, quantity, created_at, updated_at } — índice único `variant_lookup` (product_type, color, size) + `id` único.
- `movements`: { id (uuid string), item_id, kind, product_type, size, color, quantity, note, created_at } — índices id único, created_at desc, (kind, created_at).
- Seed: `cd /app/backend && python seed.py` — idempotente, cria as variantes do catálogo (76) com quantidade 0. Re-executado após reduzir as cores das regatas: variantes de regata fora do catálogo foram removidas do estoque (histórico de movimentações preservado).

## API (todas sob /api)
- GET /catalog — catálogo fixo (3 produtos com cores/tamanhos)
- GET /stock — 76 variantes ordenadas por produto/ordem-de-catálogo
- GET /movements?kind=&item_id=&limit= — histórico (mais recente primeiro)
- POST /movements { item_id, kind: entrada|saida, quantity>0, note? } → registra movimento e atualiza estoque atomicamente
- GET /dashboard — { total_pieces, zero_stock, low_stock, top_sold[5] }
- GET /export — planilha .xlsx para backup (abas "Estoque" e "Histórico"), baixada pelo botão "Exportar Excel" no painel
- GET /status, POST /status — endpoint do template (não usado pela UI)

## Frontend
- Rotas: `/` (Dashboard), `/estoque` (matriz + dialog), `/historico`. Layout com header glass e navegação (nav-painel/nav-estoque/nav-historico).
- Tipos TS em `src/lib/types.ts` espelham `backend/models/stock.py` (Pydantic) manualmente.
- Paleta de cores das roupas em `src/lib/colors.ts` (swatches + nomes pt-BR).

## Credenciais
- Nenhuma — o app não tem login. Ver memory/test_credentials.md.
