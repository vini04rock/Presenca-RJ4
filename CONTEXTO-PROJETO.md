# Confirmação de Presença — Insanos MC RJ4

Contexto e decisões de arquitetura do projeto. O passo a passo de como rodar
e publicar está no [README.md](README.md); os links e PINs, no
[LINK.md](LINK.md).

## O que é

App de página única para substituir a lista de confirmação de presença no
WhatsApp. Membros abrem um link, tocam no próprio nome e marcam o status.
Além disso, o app guarda o histórico: cada evento encerrado vira número nos
relatórios, e cada integrante tem uma ficha com a própria caminhada.

Três modos de entrada, todos no mesmo link:

- **Público, sem PIN** — confirmar presença, ver o Calendário, o Rank de
  Presença e o Rank de Insights.
- **Modo organizador (PIN)** — criar eventos, cadastrar membros, registrar
  rodadas de Insight, ver percentuais.
- **Relatórios (PIN)** — os painéis de análise e o fluxo de colar uma
  convocação do WhatsApp para virar evento.

## Stack

- HTML + CSS + JavaScript puro, em **módulos ES nativos**. Sem framework,
  sem build step, sem dependências além das fontes do Google.
- `index.html` é só o esqueleto; o visual em `css/estilo.css`; o código em
  `js/`, repartido em 30 módulos.
- Hospedado no GitHub Pages (estático). Todo `git push` atualiza o site.
- Backend: planilha do Google Sheets via Apps Script publicado como Web App.
  A URL fica em `API_URL`, em `js/nucleo/api.js`.
- Como usa `import`/`export`, **precisa de um servidor para rodar local**
  (`python -m http.server 8000`) — abrir por `file://` não funciona.

### A hierarquia dos módulos

Cada camada só pode depender das de baixo. É isso que impede que mexer numa
tela alcance o resto do app.

```
app.js                    roteador de telas + ouvintes de clique/digitação
  ↓
telas/ · fluxos/          uma tela por arquivo; as ações de cada uma
  ↓
ui/                       pedaços reaproveitados (cards, listas) e gráficos
  ↓
fila/                     gravação otimista de presença
  ↓
dominio/                  as regras: status, parser, estatísticas, texto
  ↓
dados/                    carrega da planilha para o estado; confere PIN
  ↓
nucleo/                   config, estado, api, util, imagens, render
```

Não há import circular. Duas consequências práticas: a ação de uma tela mora
no mesmo arquivo que a tela (mexer no Calendário é abrir
`js/telas/calendario.js` e mais nada), e `ferramentas/estrutura.py` consegue
provar que a hierarquia continua de pé.

O `render()` em `js/nucleo/render.js` é só um interruptor de 4 linhas: o
roteador de verdade vive no `app.js`, que é quem conhece as telas, e se
registra com `definirRender()` na partida. Sem esse desvio haveria ciclo —
o roteador conhece as telas, e as telas pedem redesenho.

## Como os dados vão e voltam

Não controlamos os cabeçalhos de resposta do Apps Script, então o CORS
normal não funciona. Daí três caminhos, todos em `js/nucleo/api.js`:

- **`api(acao, params)`** — leitura e gravação comuns. Usa **JSONP** (injeta
  uma tag `<script>`), com 20s de limite e 2 retentativas.
- **`apiPost(acao, params)`** — para payloads grandes (convocação colada,
  calendário em lote), que não cabem numa URL. `fetch` POST **sem**
  `Content-Type` de propósito: assim o navegador trata como requisição
  simples e não dispara o preflight `OPTIONS`, que o Apps Script não
  responde.
- **`apiBeacon(acao, params)`** — rede de segurança no `pagehide`: se a aba
  for fechada com gravação pendente, o navegador entrega mesmo assim.

**A gravação de presença é otimista.** A tela responde na hora, e a gravação
corre por fora, agrupando toques seguidos em 600ms (`js/fila/presenca.js`).
Cada membro grava na própria linha da planilha, então duas pessoas
confirmando ao mesmo tempo não se sobrescrevem.

## Por que Google Sheets, e não armazenamento no navegador

Histórico da decisão, que ainda explica o formato de hoje.

O app nasceu como Artifact publicado da Claude (claude.ai), usando
`window.storage`. Saiu de lá por dois motivos:

1. `window.storage` exigia que cada usuário tivesse conta Claude logada —
   inviável para os integrantes do clube.
2. Artifacts rodam num sandbox com CSP que bloqueia chamadas externas —
   então nem dava para usar um backend próprio de dentro da Claude.

Por isso o app roda fora (GitHub Pages) e conversa livremente com o Apps
Script. O JSONP acima é herança direta disso: é o jeito de contornar o CORS
sem controlar o servidor.

## Onde os dados ficam, na planilha

**Dados de verdade** — uma linha por registro, legíveis e editáveis à mão:

| Aba | O que guarda |
|---|---|
| `Membros` | id, nome, grau, divisão, funções |
| `Eventos` | id, nome, data, horário, endereço, outros, status, categoria, tipo, texto original |
| `Presencas` | uma linha por evento × membro, com status e as flags Direto/Destacado/Acompanhado |
| `InsightRodadas` | uma linha por rodada |
| `InsightPresencas` | uma linha por rodada × membro (Sim/Não) |
| `InsightExcluidos` | só quem foi tirado do Insight; sem linha = participa |

**Abas geradas do zero** a cada "Gerar relatório na planilha" (botão que só
aparece dentro do organizador Regional). Editar nelas não tem efeito:
`Relatorio`, `Regional RJ4`, `Insight RJ4`, `Calendário` e uma aba por
divisão.

`KV` é o formato antigo (uma linha `[chave, valor-json]`), mantido apenas
como backup da migração inicial. **Nada lê dela hoje.**

## PIN

Os PINs **não ficam no código do navegador** — quem souber olhar o
código-fonte não acha nada. Cada uma das 7 divisões tem o seu, guardado nas
Propriedades do Script do Apps Script. O app manda o que a pessoa digitou e
recebe de volta só um sim/não (`verificarPin` no `Code.gs`).

O PIN do **Regional é chave-mestra**: abre qualquer divisão.

Trocar um PIN é editar a propriedade correspondente na planilha, sem mexer
em código nem publicar nada. Os valores em uso estão no [LINK.md](LINK.md).

## Os conceitos que sustentam o app

**Escopo / divisão** — a coisa mais central. 7 chaves em `js/nucleo/config.js`:
`barra`, `oeste`, `recreio`, `curicica`, `taquara`, `gardenia` e `regional`.
Define a categoria de todo evento criado, a divisão de todo membro
cadastrado, e filtra tudo que aparece. Acrescentar uma divisão é um item a
mais nessa lista, mais o PIN dela nas Propriedades do Script.

A categoria do evento é um **campo de verdade** na planilha, não filtro por
nome. Evento regional que aparece dentro de uma tela de divisão fica
rotulado como tal, para não se confundir com um evento próprio.

**Status** — os 4 do seletor manual (⚠️ Aguardando, ✅ Confirmado, ❌ Família,
❌ Trabalho) e mais 2 que só nascem da convocação colada (❌ Justificada,
⭕ Infracional).

> **Regra-chave:** ao encerrar um evento, quem ficou em "Aguardando" vira
> **"Infracional"**. Não responder à convocação é falta igual à falta sem
> justificativa — decisão do clube. Isso vale tanto na planilha
> (`converterAguardandoParaInfracionalAoEncerrar`) quanto na tela
> (`statusEfetivo`).

**Percentual de presença** — só conta evento **encerrado** (um evento aberto
ainda pode mudar), e só conta membro que estava convidado, isto é, que tem
linha em `Presencas`. Assim quem entrou no clube depois não é penalizado por
evento antigo. A % pessoal de um membro só soma eventos da própria divisão
dele; presença em evento regional conta para o Regional e não mistura.

**Tipos de evento** — Pub 🍻, Bate e Volta 🏍️, Ação Social 🏥, Reunião 📊.
Cada um com cor e arte próprias.

**Funções** — Sargento de Armas ⚔️, Caveira 💀, Combate Insanos 🥋,
Batedor 🛡️. Acumuláveis, aparecem como selos ao lado do nome.

**Graus** — I a X.

**Insight** — rodadas registradas algumas vezes por semana, só com membros
de divisão (o Regional fica de fora: quem faz insight é a base). Por padrão
todo membro participa; quem for removido entra em `InsightExcluidos`.

## Identidade visual

- Base preto e branco, do clube, com cor usada **só onde carrega
  significado**: status (verde confirmado, amarelo justificada, vermelho
  infracional), tipo de evento e divisão. Os status também se distinguem por
  forma e peso, não só por cor.
- Fonte de destaque: **Rye** — entalhada, remete ao emblema do clube.
- Fonte de corpo: **IBM Plex Sans**.
- O crest e as artes dos cards ficam em `img/` (já foram base64 dentro do
  HTML; saíram na reorganização, que derrubou o `index.html` de 1,1 MB para
  16 linhas).

## Antes de subir

Dois testes offline, que não tocam a planilha:

    py ferramentas/estrutura.py     # imports, camadas, sintaxe, ações
    node ferramentas/telas.mjs      # desenha as 45 telas e abas

Eles dizem que o app **não quebrou**, não que está bonito: não cobrem
aparência, impressão/PDF, o caminho de rede real nem o `Code.gs`. Detalhes
em [ferramentas/README.md](ferramentas/README.md).

> O app lê e grava na **planilha de produção**. Não existe ambiente de teste
> separado — cuidado ao mexer com eventos reais abertos.

## Próximos passos possíveis

Ideias registradas, nada pedido ainda:

- **Multi-divisão de verdade** (um jogo de abas por divisão na planilha) —
  ver [PLANO-MULTI-DIVISAO.md](PLANO-MULTI-DIVISAO.md). Combinado que fica
  para uma sessão dedicada.
- `js/telas/admin.js` e `js/telas/relatorios.js` são os dois maiores
  arquivos. Cada um é uma tela coerente com abas internas; se um dia
  incomodarem, dá para repartir por aba.
