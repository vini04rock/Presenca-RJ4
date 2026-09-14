# Confirmação de Presença — Insanos MC Barra RJ4

## O que é
App de página única (sem build, sem dependências além de fontes do Google Fonts) para substituir a listagem de confirmação de presença via WhatsApp do motoclube. Membros abrem um link, tocam no próprio nome, marcam status de presença. Organizador tem um modo protegido por PIN pra criar/editar eventos, cadastrar membros e ver relatórios.

## Stack
- HTML + CSS + JavaScript puro (vanilla), em módulos ES nativos: `index.html`
  é só o esqueleto, o visual vive em `css/estilo.css` e o código em `js/`.
- Sem framework, sem build step. Fácil de editar diretamente.
- Os módulos são hierárquicos: `nucleo` (config, estado, api, util) não
  depende de ninguém, e cada camada acima só enxerga as de baixo —
  `dados` → `dominio` → `fila` → `ui` → `telas`/`fluxos` → `app.js`.
  Não há import circular, então mexer numa tela não alcança o núcleo.
- Como usa `import`/`export`, precisa de um servidor para rodar local
  (`python -m http.server 8000`) — abrir o arquivo por `file://` não funciona.
- Hospedado no GitHub Pages (estático).
- Fonte de dados: **não usa localStorage nem window.storage** — usa uma planilha do Google Sheets como backend, via um Apps Script publicado como Web App (URL fixa salva na constante `API_URL`, em `js/nucleo/api.js`).

## Por que Google Sheets em vez de storage nativo
O app foi inicialmente feito pra rodar como Artifact publicado da Claude (claude.ai), usando `window.storage`. Migramos pra fora da Claude por 2 motivos:
1. `window.storage` exige que cada usuário tenha conta Claude logada — inviável pra membros do clube.
2. Artifacts da Claude rodam num sandbox com CSP que bloqueia `fetch()`/chamadas externas — então nem dava pra usar um backend externo de dentro da Claude.
Por isso o app roda fora da Claude (GitHub Pages) e conversa livremente com o Google Apps Script.

## Como o armazenamento funciona
- `storageGet(key)`: usa uma técnica JSONP (cria uma tag `<script>` dinâmica) pra contornar CORS, já que não controlamos os headers de resposta do Apps Script.
- `storageSet(key, value)`: usa `fetch()` com `mode: 'no-cors'` e `Content-Type: text/plain` (evita preflight). É "fire-and-forget" — não lemos a resposta.
- O Apps Script (`Code.gs`, vive na planilha do Google, não neste repositório) guarda tudo numa aba chamada "KV": cada linha é `[chave, valor-json-em-texto]`.

### Chaves usadas
- `mc-roster` → array de membros `{id, nome, grau, divisao}`
- `mc-events` → array de eventos `{id, nome, memberIds[], status, data, horario, endereco, outros, createdAt}`
- `mc-status-<eventId>` → objeto `{memberId: {status, direto, destacado, acompanhado}}`

## Identidade visual
- Preto e branco (cores do clube), sem paleta colorida — status são diferenciados por forma/peso (contorno tracejado, preenchido, riscado, borda dupla), não por cor.
- Fonte de destaque: "Rye" (Google Fonts) — estilo entalhado, remete ao emblema do clube.
- Fonte de corpo: "IBM Plex Sans".
- Crest do clube (Insanos MC Brasil) embutido como base64 no HTML, no topo da tela inicial.

## Funcionalidades já prontas
- Tela inicial: lista de eventos ativos + crest + acesso ao modo organizador (PIN: `0987`, constante `PIN` no código).
- Tela de evento: dados do evento (data/horário/endereço/outros, se preenchidos) + lista de membros com status tocável (⚠️ Aguardando, ✅ Confirmado, ❌ Família, ❌ Trabalho) e badges extras (🚀 Direto, 🚧 Destacado, 🐯 Acompanhado).
- Modo organizador: abas Eventos (criar/editar/encerrar/excluir, com campos de data/horário/endereço/outros), Membros (cadastro com grau e divisão pré-definidos como chips) e Relatório.
- Graus disponíveis: I a X. Divisões disponíveis: Barra - RJ4, Recreio - RJ4, Gardênia - RJ4, Leste - RJ4 (fixos no código, em `GRAUS` e `DIVISOES`).
- Categoria de evento (`divisao` ou `regional`), gravada de verdade na planilha — não é filtro por nome. O Modo organizador tem os botões "Barra - RJ4" e "Regional RJ4" (mesmo PIN por enquanto); a categoria do evento vem automaticamente de qual um o organizador escolheu. Evento regional aparecendo dentro de uma tela de divisão fica rotulado como tal, pra não confundir com um evento próprio.
- **Calendário** (novo item no menu principal, `renderCalendarioDivisoes` → `renderCalendario`): mês em grade, eventos marcados persistem de verdade na planilha (deixou de ser só marcação visual). Dentro do Calendário, o Regional enxerga e pode editar/excluir evento de **qualquer** divisão (não só o que ele mesmo criou) — mesmo critério de chave-mestra que o PIN Regional já tem no resto do app; uma divisão comum só mexe no que ela mesma criou.
- **Relatório** com 3 categorias de falta: confirmado / justificada (família, trabalho) / infracional (círculo explícito ou quem não respondeu). Tem também uma **ficha do membro** (histórico evento a evento) que mostra o status de cada rodada.
- Relatório de rodada com gráfico de tendência (sparkline), data retroativa, painel de "mais faltas infracionais", exportação/impressão em PDF.

## Próximos passos possíveis (não pedidos ainda, só ideias soltas do dono do projeto)
- Multi-divisão de verdade (abas separadas por divisão na planilha, PIN por divisão) — ver [PLANO-MULTI-DIVISAO.md](PLANO-MULTI-DIVISAO.md). Combinado que fica pra uma sessão dedicada, não é pra implementar ainda.
