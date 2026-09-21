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
  rodadas de Insight, ver percentuais e **gerar o texto da convocação** para
  colar no grupo. A primeira tela é um menu, com o **mural de avisos** no
  topo.
- **Relatórios (PIN)** — os painéis de análise e o fluxo de colar uma
  convocação do WhatsApp para virar evento.

## Stack

- HTML + CSS + JavaScript puro, em **módulos ES nativos**. Sem framework,
  sem build step, sem dependências além das fontes do Google.
- `index.html` é só o esqueleto; o visual em `css/estilo.css`; o código em
  `js/`, repartido em 37 módulos.
- Hospedado no GitHub Pages (estático). Todo `git push` atualiza o site.
- Backend: planilha do Google Sheets via Apps Script publicado como Web App.
  A URL fica em `API_URL`, em `js/nucleo/api.js`.
- Como usa `import`/`export`, **precisa de um servidor para rodar local**:
  `py ferramentas/servidor.py 8765`. Abrir por `file://` não funciona.
  Use esse servidor, e não o `python -m http.server` direto — ele desliga o
  cache. Sem isso o navegador mistura arquivos novos com antigos e uma
  mudança pode simplesmente não aparecer, sem erro nenhum.

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

O Modo organizador é a exceção ao "uma tela por arquivo", porque é grande
demais para uma: `js/telas/admin.js` ficou só com o esqueleto (cabeçalho,
barra de abas, troca de aba), e cada seção tem o próprio arquivo —
`admin-eventos.js`, `admin-membros.js` e `admin-insights.js`. O esqueleto
sabe **qual** aba desenhar, nunca **como**. Cada um exporta as próprias
ações, e o `app.js` junta os quatro mapas.

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
| `Membros` | id, nome, grau, divisão, funções, **cargo** |
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
⭕ Não justificada).

> **Regra-chave:** ao encerrar um evento, quem ficou em "Aguardando" vira
> **"Não justificada"**. Não responder à convocação é falta igual à falta sem
> justificativa — decisão do clube. Isso vale tanto na planilha
> (`converterAguardandoParaInfracionalAoEncerrar`) quanto na tela
> (`statusEfetivo`).

> **O nome mudou, o dado nao.** Ate 21/09/2026 esse status se chamava
> **"Infracional"**, e o nome saiu por ser ofensivo demais para o que
> descreve. Trocou so o que a pessoa le. Nao mudaram, de proposito:
>
> - **`STATUS_ROTULO.infracional`, que continua gravando `'Infracional'`
>   na planilha.** `statusParaChave` compara o texto exato, entao renomear
>   ali faria todo registro ja salvo cair silenciosamente em "Aguardando" —
>   perda de historico sem nenhum erro na tela.
> - A **chave interna** `infracional`, os nomes de funcao
>   (`rankingFaltasInfracionais`) e a variavel de cor CSS
>   (`--status-infracional`). Ninguem ve, e renomear so espalharia risco.
>
> O parser reconhece **as duas palavras** (`js/dominio/parser.js`): as
> convocacoes antigas continuam no grupo do WhatsApp e ainda sao recoladas
> pelo "Corrigir". E la a ordem dos testes importa — `"nao justificad"`
> tem que ser checado **antes** de `"justificad"`, senao toda falta nao
> justificada seria lida como justificada, que e o oposto.

**Mural de avisos** — o contrapeso dessa regra, no topo do menu do
organizador (`js/dominio/pendencias.js` + `js/telas/menu-organizador.js`).
Mostra os eventos ativos da divisão que acontecem de hoje até dois dias à
frente (`JANELA_DIAS`), dizendo quantos convocados ainda não responderam.
Existe justamente porque não responder vira falta não justificada: a janela
é a última chance de cobrar quem falta, e sem ela a pessoa levaria a falta
sem nunca ter sido cutucada.

Três decisões que valem lembrar antes de mexer nele:

- **O mural tem sempre a mesma altura**, vazio ou cheio — duas linhas. É um
  quadro fixo na parede, e os avisos é que vão e vêm; assim as seções
  abaixo nunca dançam na tela quando um evento entra ou sai. Passando de
  dois avisos, rola por dentro. Por isso a altura da linha é fixa no CSS, e
  não `min-height`: a altura do mural é uma conta em cima dela.
- **Vazio, ele diz "Nada nos próximos 2 dias"** em vez de sumir. Sumir era
  ambíguo — não dava para saber se era "nada para ver" ou "ainda
  carregando".
- **As presenças dos eventos do mural são buscadas a cada entrada no menu**,
  não guardadas: o número muda a cada integrante que responde, e mostrar
  valor velho seria pior que não mostrar. Até chegarem, o aviso diz que
  está vendo — sem os dados, todo mundo pareceria não ter respondido.

> **A armadilha da data vazia:** evento sem data fica de fora do mural de
> propósito. Na comparação de texto `''` é anterior a qualquer data, então
> sem essa guarda ele apareceria sempre. O encerramento automático, abaixo,
> tem a mesma guarda pelo mesmo motivo.

**Encerramento automático** — o outro lado da regra. Todo evento cuja data
já passou é encerrado sozinho, e encerrar converte quem ficou "Aguardando"
em "Não justificada". É o que torna a regra justa: o prazo passa a valer sempre,
não só quando alguém lembra de apertar "Encerrar".

Quem faz isso é o **`Code.gs`**, por um gatilho de tempo, de madrugada
(`encerrarEventosVencidos`) — **não o app**. Duas razões: a tela inicial é
pública, sem PIN, então "encerrar quando alguém abre o app" seria o
navegador de qualquer visitante gravando na planilha; e o evento só
encerraria quando alguém aparecesse, o que num fim de semana parado deixaria
todo mundo "Aguardando" sem virar falta.

- **A virada é no dia seguinte ao do evento.** Um evento de hoje fica aberto
  o dia inteiro, porque quem está lá ainda confirma pelo celular.
- **Evento sem data nunca é encerrado** — a mesma armadilha acima, só que
  aqui o estrago seria pior: encerrar dá falta a quem não respondeu.
- Ele reusa `converterAguardandoParaInfracionalAoEncerrar`, a mesma função do
  botão "Encerrar" do app. Regra escrita duas vezes vira duas regras
  diferentes no dia em que uma delas mudar.
- Ligar o gatilho é rodar `instalarGatilhoDeEncerramento` **uma vez** — está
  no menu "Confirmacao MC" da planilha, junto com um "encerrar agora" para
  forçar uma passada sem esperar a madrugada.

> Como é a única parte do projeto que roda sozinha e escreve na planilha de
> produção, é a única do `Code.gs` com teste: `ferramentas/planilha.mjs`.

**Percentual de presença** — só conta evento **encerrado** (um evento aberto
ainda pode mudar), e só conta membro que estava convidado, isto é, que tem
linha em `Presencas`. Assim quem entrou no clube depois não é penalizado por
evento antigo. A % pessoal de um membro só soma eventos da própria divisão
dele; presença em evento regional conta para o Regional e não mistura.

**Tipos de evento** — Pub 🍻, Bate e Volta 🏍️, Ação Social 🏥, Reunião 📊.
Cada um com cor e arte próprias.

**Funções** — Sargento de Armas ⚔️, Caveira 💀, Combate Insanos 🥋,
Batedor 🛡️. Acumuláveis, aparecem como selos ao lado do nome.

**Graus** — I a X. Atenção: o **mais alto na hierarquia é o de número
menor** — VI vem antes de VIII, que vem antes de X.

**Cargos** — só existem nos graus **VI** e **V**, os "graus de cargo", em que
vários integrantes dividem o mesmo grau ocupando funções diferentes. A lista
fica em `CARGOS`, em `js/nucleo/config.js`, **já na ordem hierárquica**:

| Grau | Cargos, do mais alto para o mais baixo |
|---|---|
| VI | Diretor › Subdiretor › Social › ADM › Sgt de Armas de Divisão |
| V | Diretor Regional › Operacional › Social Regional › ADM Regional › Comunicação |

Não confundir com as **funções** acima: função é atribuição operacional,
acumulável e sem hierarquia; cargo é um só por pessoa e tem ordem.

> **A ordem das listas** (`ordenarPorHierarquia`, em `js/nucleo/util.js`) é:
> grau, depois cargo, depois nome. Nos graus VIII, IX e X a ordem de verdade
> no clube é a **antiguidade**, que o app não guarda — ficou combinado usar
> ordem alfabética ali. Se um dia isso incomodar, a saída é guardar a
> antiguidade no cadastro.

**Insight** — rodadas registradas algumas vezes por semana, só com membros
de divisão (o Regional fica de fora: quem faz insight é a base). Por padrão
todo membro participa; quem for removido entra em `InsightExcluidos`.

## A convocação: o app lê e escreve

Este é um ciclo fechado que vale entender junto, porque as duas pontas usam
o mesmo formato.

**Ler** (existe há mais tempo): a tela Relatórios aceita uma convocação
colada do WhatsApp e transforma em evento — `parseConvocacaoTexto`, em
`js/dominio/parser.js`. Ele casa os nomes com o cadastro por semelhança
(distância de Levenshtein), então "Fabio Big" bate com "FÁBIO BIG".

Depois de colado, dá para **recolar por cima** ("Corrigir", que conserta uma
convocação lida errada sem apagar e refazer o evento) e **ver o texto
original**. Os dois ficam na aba **Encerrados do organizador**, não nos
Relatórios — a aba Eventos de lá mostrava quase a mesma lista e saiu, mas os
dois botões só existiam nela, então vieram junto antes da remoção.
"Corrigir" só aparece nas divisões que acessam Relatórios, porque é para lá
que ele leva; "ver o texto original" é só leitura e vale em qualquer uma.

**Escrever** (novo): o botão **📋 Criar chamada**, no card de cada evento da
aba Eventos, monta o texto da convocação para colar no grupo —
`js/dominio/convocacao.js` e a tela `js/telas/convocacao.js`. Ele não grava
nada; só lê o evento e devolve texto.

O texto tem três origens, e a separação é proposital:

| Origem | O quê |
|---|---|
| **Fixo** | faixa, seções, legendas, prazo, Respaldo RDI, ATENÇÃO/BRIEFING |
| **Do app** | título, data no formato do clube (`09SET26`) com o dia da semana, divisão, lista numerada na ordem hierárquica |
| **Do formulário** | roteiro, pontos de encontro, horários, telefone — o que só o organizador sabe na hora |

**O app não tenta adivinhar o que não sabe.** Roteiro e pontos de encontro
mudam a cada evento e não cabem no modelo de dados (um evento tem um lugar e
um horário); então são campo livre, e a prévia atualiza enquanto se digita.

Dois modelos, escolhidos pelo tipo do evento: **Simples** (Pub, Reunião,
Ação Social) e **Bate e Volta**, que troca `🎯 DESTINO 🎯` por
`🫂 CONCENTRAÇÃO 🫂` + `🧭 ROTEIRO 🧭`, usa "Legenda" no lugar de
"Participação" e ganha os blocos de ATENÇÃO e BRIEFING — é estrada, então
entra o checklist da moto e as regras do comboio.

**Quem assina o rodapé** é o **Subdiretor** da divisão, ou o **Operacional**
no Regional. Não é o cargo mais alto — é quem responde pela convocação. Sem
ninguém cadastrado no cargo, sai `(nome)` / `(cargo)` para preencher: uma
mensagem que vai para o clube inteiro assinada pela pessoa errada é pior que
um espaço em branco visível. O **telefone o app não guarda**, então entra à
mão toda vez.

> **O teste que protege o formato:** `ferramentas/regras.mjs` gera a
> convocação e passa de volta pelo parser. Se o texto continua sendo
> reconhecido — mesma data, mesmo tipo, mesmos integrantes na mesma ordem —
> o formato está fiel. Foi esse teste que descobriu que o parser só parava a
> lista em "Participação" e, numa convocação de Bate e Volta (que fecha com
> "Legenda"), lia o contato do rodapé como se fosse mais um integrante.

## As ferramentas de conferência

Em `ferramentas/`, rodam offline e não tocam a planilha. Existem porque o
app não tem teste automatizado de verdade e a alternativa era clicar em tudo
a cada mudança:

| | O que faz |
|---|---|
| `servidor.py` | serve o app local com o cache desligado |
| `estrutura.py` | 7 verificações: imports circulares, hierarquia de camadas, sintaxe, nome sem import, import sobrando, ações sem tratador |
| `regras.mjs` | as regras do clube que, se quebrarem, saem erradas numa convocação sem ninguém perceber |
| `telas.mjs` | desenha as 68 telas e abas com dados falsos; com `--html` grava tudo para comparar antes/depois |
| `planilha.mjs` | roda o `Code.gs` de verdade contra uma planilha de mentira; hoje cobre o encerramento automático |

O `--html` do `telas.mjs` é a rede de proteção mais útil: captura o HTML de
todas as telas, você mexe, captura de novo e compara. Diferença que aparecer
ali é mudança de verdade. Foi assim que a reorganização em módulos foi feita
sem quebrar nada. Detalhes em [ferramentas/README.md](ferramentas/README.md).

## Identidade visual

- Base preto e branco, do clube, com cor usada **só onde carrega
  significado**: status (verde confirmado, amarelo justificada, vermelho
  não justificada), tipo de evento e divisão. Os status também se distinguem por
  forma e peso, não só por cor.
- Fonte de destaque: **Rye** — entalhada, remete ao emblema do clube.
- Fonte de corpo: **IBM Plex Sans**.
- O crest e as artes dos cards ficam em `img/` (já foram base64 dentro do
  HTML; saíram na reorganização, que derrubou o `index.html` de 1,1 MB para
  16 linhas).

## Antes de subir

Os três testes, que rodam offline e não tocam a planilha (ver a seção das
ferramentas, acima):

    py ferramentas/estrutura.py     # imports, camadas, sintaxe, ações
    node ferramentas/regras.mjs     # ordem hierárquica e formato da convocação
    node ferramentas/telas.mjs      # desenha as 68 telas e abas
    node ferramentas/planilha.mjs   # o encerramento automático, no Code.gs

Eles dizem que o app **não quebrou**, não que está bonito: não cobrem
aparência, impressão/PDF, o caminho de rede real nem o resto do `Code.gs` —
o `planilha.mjs` só alcança o encerramento automático.

Se a mudança mexeu no `Code.gs`, ele precisa ser **republicado à parte** no
Apps Script — não vai junto no `git push`. Confira depois chamando a URL do
Web App com `?action=versao`; o passo a passo está no [LINK.md](LINK.md).

> O app lê e grava na **planilha de produção**. Não existe ambiente de teste
> separado — cuidado ao mexer com eventos reais abertos.

## Próximos passos possíveis

Ideias registradas, nada pedido ainda:

- **Multi-divisão de verdade** (um jogo de abas por divisão na planilha) —
  ver [PLANO-MULTI-DIVISAO.md](PLANO-MULTI-DIVISAO.md). Combinado que fica
  para uma sessão dedicada.
- `js/telas/relatorios.js` é hoje o maior arquivo (593 linhas). É uma tela
  coerente com abas internas; se um dia incomodar, dá para repartir por aba,
  como já foi feito com o organizador.
