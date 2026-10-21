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
  `js/`, repartido em 55 módulos.
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
`admin-eventos.js`, `admin-membros.js`, `admin-insights.js` e as demais
seções administrativas. O esqueleto
sabe **qual** aba desenhar, nunca **como**. Cada um exporta as próprias
ações, e o `app.js` junta todos os mapas.

O menu organiza essas seções em três áreas, sem mudar permissões: **ADM**
(Caixinha, Estoque ADM no Regional, Entrada/Saída e Membros), **Operacional** (Relatórios, Relatório
individual, Insights e Eventos) e **Social** (Doações). Depois do PIN, o
mural e os avisos continuam na raiz; tocar numa área abre apenas as
ferramentas dela. Uma área sem nenhuma ferramenta liberada naquele escopo
fica escondida. O PIN continua sendo um só por divisão — essa separação é
visual, não um controle de acesso por cargo.

Dentro de cada área, todo card de seção tem arte própria desde 21/10/2026
(`IMG_SECOES`, em `js/nucleo/imagens.js`, pela aba ou pela ação da seção).
A arte entra inteira, na proporção dela, sem corte. Na maioria, o título e
a descrição já vêm desenhados. Eventos e Insights vieram dos cards antigos
"Eventos" e "Rank de Insights": o texto foi apagado da imagem e o app
escreve o nome e a descrição no lugar. Nas Doações, só a linha da
descrição foi apagada, porque ela muda no Regional ("O estoque do
Regional"). As artes de origem ficam fora do repositório; as daqui foram
recortadas, arredondadas e reduzidas para 1200 px de largura. Seção sem
arte continua com o card de ícone e texto.

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
| `Membros` | id, nome, grau, divisão, funções, **cargo**, situação (afastado), data de ingresso no clube (coluna Entrada), grau a confirmar (quem chegou por transferência) |
| `Eventos` | id, nome, data, horário, endereço, outros, status, categoria, tipo, texto original, **chamada** (JSON) |
| `Presencas` | uma linha por evento × membro, com status e as flags Direto/Destacado/Acompanhado |
| `InsightRodadas` | uma linha por rodada |
| `InsightPresencas` | uma linha por rodada × membro (Sim/Não) |
| `InsightExcluidos` | só quem foi tirado do Insight; sem linha = participa |
| `Responsaveis` | quem assina a chamada, uma linha por divisão e uma pelo Regional |
| `TextosChamada` | Regras do clube e Atenção personalizadas pelo Regional; sem linha = o padrão |
| `Movimentacoes` | o livro de Entrada/Saída: uma linha por entrada, afastamento, retorno, desligamento ou ponta de transferência (com o `De/Para`). Nada é apagado |
| `Doacoes` | uma linha por evento × integrante que levou alimento, com os kg; sem linha = não levou |
| `EstoqueDoacoesItens` | os itens do estoque das doações de cada divisão, com a medida (un, par ou kg); o dos alimentos dos eventos não precisa de linha |
| `EstoqueDoacoesMov` | o livro do estoque das doações: uma linha por entrada (avulsa ou dos eventos), saída (com o destino) ou correção automática; corrigir é anular. Nada é apagado. A aba antiga `EstoqueDoacoes` fica só como backup |
| `EstoqueADMItens` | cadastro dos materiais administrativos do Regional; uma linha por material |
| `EstoqueADMMovimentacoes` | livro permanente de entradas, saídas e anulações do Estoque ADM; o saldo é calculado a partir dele |
| `Caixinha` | uma linha por divisão × mês × integrante que devia pagar, com Sim/Não e o **valor** pago |
| `CaixinhaFinanceiro` | o controle financeiro da caixinha: uma linha por entrada ou saída lançada, e o saldo inicial de cada divisão |

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

**Cada divisão só mexe no que é dela — também no servidor.** O PIN é
conferido duas vezes: contra a divisão em que a pessoa entrou e contra a
divisão **dos dados**. Assim, mesmo montando o endereço do Apps Script à
mão (fora dos botões do app), quem tem o PIN da Barra não lê nem grava
nada do Oeste ou do Regional. Doações, caixinha, estoque e Entrada/Saída
fazem isso desde que nasceram (`podeNaDivisao`); membros, eventos
(inclusive convocação colada e Calendário), o responsável da chamada,
o Insight e o "Gerar relatório na planilha" ganharam a mesma guarda em
19/10/2026 (`guardaDaDivisao`, no `Code.gs`). Insight e o relatório da
planilha são só do Regional. O bloco "isolamento" do
`ferramentas/planilha.mjs` tenta cada ação da Barra contra o Oeste e o
Regional.

Ficam públicas, de propósito, as leituras que a tela inicial usa (lista
de eventos e membros, presenças, ranks, relatório individual) e a
gravação da própria presença — a confirmação é sem PIN.

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

No **Calendário**, desde 19/10/2026, o quadradinho do dia mostra **sempre**
o nome de quem criou o evento ("Regional", "Barra"...), inclusive no
calendário da própria divisão; antes só aparecia o de outra origem, e o
próprio ficava só com o emoji (`nomeDaOrigem`, em `telas/calendario.js`,
nas grades de ver e de editar). Dia com mais de um evento continua com
"2 eventos". O rótulo é de 9px, com as letras um pouco mais juntas, para
"Regional" e "Gardênia" caberem inteiros num celular comum.

O Calendário também sai **em texto pro WhatsApp** ("📋 Copiar pro
WhatsApp", ao lado do "Gerar imagem"; `dominio/calendario-texto.js`): os
mesmos eventos e a mesma ordem da imagem do mês, no formato que o clube já
usava no grupo - "📍 *Dia 07 · Ter*", e embaixo "🍻 Div. Barra: Pub" para
evento de divisão ou o nome em destaque para evento do Regional ("🏍️
*BATE E VOLTA - SERRA*"); mais de um no mesmo dia vira itens com "•". A
caixa **"Relatar dias vazios"** leva do dia 1 ao último, com os sem evento
em branco; desmarcada (o padrão), só os dias com evento. Abaixo do título
"CALENDÁRIO" vai, em negrito e itálico, "Acompanhe aqui tudo que acontece
na sua Regional" (no Regional) ou "... na sua Divisão" (numa divisão).

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

Por isso cada aviso com gente faltando tem o botão **📋 Chamado**, e a tela
do evento, aberta pelo organizador, tem o **📋 Chamado de quem falta (N)**
(até 19/10/2026 era "Cobrar", palavra que o clube achou forte demais). Os
dois copiam para o WhatsApp a lista de quem está ⚠️ Aguardando, em ordem
hierárquica (no regional, um bloco por divisão, na ordem oficial),
terminando com as **Regras do clube**, o mesmo bloco da chamada (prazo da
justificativa e Respaldo RDI): o padrão, ou o que o Regional personalizou.
O texto personalizado é buscado na entrada do menu do organizador
(`carregarTextosChamada`, junto com o responsável); se não chegar, vale o
padrão. A lista e o texto ficam em `quemFalta`/`textoCobranca`
(`dominio/pendencias.js`), com teste no `regras.mjs`.

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

O mural também avisa as **honrarias por tempo de clube**
(`js/dominio/honrarias.js`): medalhas de 3, 6 e 9 anos, calculadas a partir
da coluna Entrada de `Membros`, sem dado novo na planilha. O aviso começa 60
dias antes e fica até 30 dias depois da data. Cada divisão vê os próprios
integrantes; o Regional vê toda a RJ4, com a divisão na linha. Afastados
continuam contando e desligados já não estão no cadastro. Eventos com gente
sem resposta vêm antes; depois vêm medalhas até 30 dias, medalhas entre 31 e
60 dias e eventos em que todos responderam. Quem entrou em 29/02 completa a
honraria em 28/02 nos anos correspondentes. Sem nenhum evento ou honraria, o
mural diz **"Nenhum aviso no momento"**.

> **A armadilha da data vazia:** evento sem data fica de fora do mural de
> propósito. Na comparação de texto `''` é anterior a qualquer data, então
> sem essa guarda ele apareceria sempre. O encerramento automático, abaixo,
> tem a mesma guarda pelo mesmo motivo.

**Obrigatoriedades do mês** — só no menu do organizador do **Regional**,
logo abaixo do mural (`js/dominio/obrigatoriedades.js` +
`js/telas/menu-organizador.js`), criado em 19/10/2026. Todo mês, cada
divisão tem que fazer pelo menos um evento de cada tipo obrigatório:
📊 Reunião, 🍻 Pub, 🏍️ Bate e Volta e 🤝 Ação Social
(`TIPOS_OBRIGATORIOS`, no topo do arquivo de regras: mudou a regra, muda
essa linha). O card lista as divisões que ainda não marcaram algum deles
no **mês atual**, com o que falta; tocar numa abre os 4 tipos, com o
evento que cobre cada um. O **📋 Chamado** copia as pendências pro grupo.

- **Confere as 6 divisões**, na ordem oficial, inclusive as que ainda não
  usam o app: o retrato é o real.
- **Marcado no calendário já conta**, mesmo que ainda não tenha
  acontecido: o que se cobra é a divisão ter planejado.
- **Evento do Regional com a caixa "Evento regional" marcada vale para todas:** um Bate e Volta do Regional no
  mês tira o Bate e Volta da pendência de todas as divisões (decisão do
  clube; o detalhe diz "pelo Regional").
- No formulário de criar/editar evento do Regional, essa caixa começa
  marcada. Desmarcar mantém o evento no Regional e no calendário, mas ele
  não atende à obrigação das divisões. Eventos antigos sem essa opção
  continuam contando. A escolha fica em `chamada.dispensaObrigatoriedade`,
  no JSON já salvo na coluna Chamada; editar a convocação preserva o valor.
  Não exige coluna nova nem alteração do Apps Script.
- **A cor acompanha o mês:** amarelo enquanto há tempo, vermelho nos
  últimos 10 dias (`DIAS_URGENTES`), pra não gritar no dia 1º, quando todo
  mundo ainda "deve" tudo.
- Como o mural, **não some** quando está tudo em dia: diz que está.
- Usa os eventos que o app já tem (`state.events`, de todas as
  divisões): nada novo vem da planilha, e o `Code.gs` não mudou.

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

**Reabrir desfaz a falta** (21/10/2026). Um organizador encerrou eventos
só para ver o relatório e reabriu, e quem não tinha respondido ficou com
falta num evento que ainda nem tinha acontecido. Agora, salvar aberto um
evento feito à mão devolve quem está "Não justificada" para Aguardando
(`desfazerInfracionalAoReabrir`, no `Code.gs`): ali o seletor só tem os 4
status, então essa falta só pode ter vindo de um encerramento. Evento de
convocação colada (com texto original) fica de fora, porque nele a falta
veio do texto.

A aba **Ativos** do organizador mostra só os eventos abertos, do mais
próximo para o mais distante (sem data no fim); o encerrado
fica só em **Encerrados** (do mais recente para o mais antigo, com a
mesma arte do tipo no fundo), que ganhou o **Editar** e o **Reabrir** (o
formulário de edição abre ali mesmo). Encerrar ou reabrir troca o evento
de aba, com um aviso dizendo para onde ele foi.

E para ninguém precisar encerrar para ver o relatório: cada evento ativo
da aba Eventos tem o **📊 Gerar relatório**, um botão só, que busca as
respostas na hora e abre no card o mesmo detalhe da aba Encerrados, com
"⚠️ Ainda não responderam" no lugar da falta, e as três saídas:
**📋 Copiar pro WhatsApp** (o texto sai como "RELATÓRIO PARCIAL", em
`buildReportText`), **📄 Gerar PDF** (a impressão do navegador; com o
relatório aberto, o resto da aba é `no-print` e o papel sai só com aquele
evento) e **🖼️ Gerar imagem** (`imagemResultadoEvento`, que num evento
aberto vira "PARCIAL DO EVENTO", com a fatia cinza de Aguardando em vez de
somar quem não respondeu às faltas).

**Percentual de presença** — só conta evento **encerrado** (um evento aberto
ainda pode mudar), e só conta membro que estava convidado, isto é, que tem
linha em `Presencas`. Assim quem entrou no clube depois não é penalizado por
evento antigo. A % pessoal de um membro só soma eventos da própria divisão
dele; presença em evento regional conta para o Regional e não mistura.

**Relatórios agrupados por divisão** — no Regional, com "Todas as
divisões", a lista de eventos (o "Ver eventos" de cada card e as abas por
tipo) sai em blocos, um por divisão, cada um com quantos eventos e o % do
bloco. Sem isso, dois "Pub" de divisões diferentes ficavam lado a lado sem
dar para saber de quem era cada um. A ordem dos blocos é a oficial do clube
(`escoposNaOrdemOficial`, em `js/nucleo/config.js`), a mesma da lista do
Bonde Regional. Numa divisão só, a lista é a de sempre, sem blocos. Nenhuma
conta mudou, só a forma de mostrar.

**Tipos de evento** — Pub 🍻, Bate e Volta 🏍️, Ação Social 🤝, Reunião 📊.
Cada um com cor e arte próprias.

**Funções** — Sargento de Armas ⚔️, Caveira 💀, Combate Insanos 🥋,
Batedor 🛡️, Comunicação 📷. Acumuláveis, aparecem como selos ao lado do nome.

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

**Relatório individual** — um card do menu do organizador, nas 7 divisões
(`js/telas/relatorio-individual.js`, contas em
`js/dominio/relatorio-individual.js`). Numa divisão lista os integrantes
dela; no Regional, cada divisão é um grupo que abre ao toque. O relatório de
um integrante tem presença na divisão (geral e por tipo), os eventos do
Regional **à parte**, o Insight e o histórico evento a evento, com filtro
de período.

- **Só aparece o que ele podia fazer.** Um tipo de evento só ganha bloco se
  ele foi convocado para pelo menos um evento encerrado daquele tipo; o
  Insight só aparece se ele participa do Insight. "0% em Bate e Volta" para
  quem nunca foi chamado seria uma acusação, não um número.
- **Divisão e Regional não se somam**, pela mesma regra do percentual
  pessoal acima. Para quem é do Regional, os eventos do Regional são os da
  divisão dele, e o bloco à parte não existe.
- **Uma chamada só à planilha** (`relatorioIndividual`, no `Code.gs`), que
  devolve os dados crus; o período é recortado no app. Buscar presença
  evento por evento, como a Ficha dos Relatórios faz, viraria centenas de
  chamadas em alguns meses.
- **Três saídas:** o PDF de um integrante (a impressão do navegador, igual
  aos Relatórios), o texto pro WhatsApp e o **PDF de vários**. O texto leva
  os números e, do histórico, só as faltas não justificadas, que é o que se
  cobra (`textoRelatorioIndividual`). O PDF de vários tem um modo de
  seleção na lista: a caixa da divisão marca todos dela, e cada integrante
  sai completo, numa página nova. Os marcados vêm numa chamada só
  (`relatorioIndividualVarios`), que lê as abas uma vez e monta cada um com
  a mesma função do relatório de um, então os dois nunca discordam.

## Entrada/Saída de integrantes

Criado em 18/10/2026, em todas as divisões e no Regional. Registra quem
entra, quem se afasta e quem sai do clube, e transforma isso em relatório.

**O registro fica no cadastro de Membros.** Ao lado do grau de cada
integrante há **⏸️ Afastamento** (ou **▶️ Retorno**, para quem já está
afastado) e **🚪 Desligamento**. Cada um abre um painel na própria linha,
com a data (hoje, se nada for escrito; nunca no futuro), o motivo
(opcional) e o que vai acontecer, dito antes de confirmar. A **entrada** é
registrada pelo próprio cadastro: o formulário de integrante novo tem
"Data de ingresso", e salvar já anota no livro. Quem foi cadastrado antes
disso não conta como entrada.

**Data de ingresso e tempo de clube** (19/10/2026). A data de ingresso
fica no cadastro (coluna Entrada de `Membros`) e aparece no canto direito
do card, na altura do nome, como "D.A: 12/03/2019" (data de admissão). O
card do cadastro tem três andares: nome, grau, cargo e os emojis das
funções (com a D.A à direita); os botões de movimentação; e Editar e
Remover nas pontas. Na **carteirinha do Relatório
individual** (e no PDF e no texto dele) sai com o tempo de clube: "No
clube desde 12/03/2019 · 7 anos e 7 meses" (`tempoDeClube`/`textoIngresso`,
em `dominio/movimentos.js`; conta meses inteiros).

- Os integrantes novos já nascem com ela. Os antigos ganham pelo
  **Editar** (que agora tem o campo) ou pelo **"🗓️ Preencher datas"**: o
  cadastro avisa quantos estão sem data, e o botão abre uma lista só com
  eles para preencher todos de uma vez (`membrosEntradaSalvar`, que confere
  a divisão de cada um e todas as datas antes de gravar qualquer uma).
- **Preencher a data de quem já era do clube não conta como "entrou"** no
  livro de Entrada/Saída: senão o relatório diria que dezenas entraram de
  uma vez. Só quem já tem a Entrada no livro (cadastrado como integrante
  novo) tem a data de lá corrigida junto (`gravarDataDeIngresso`).
- Um app antigo que salva pelo Editar sem mandar a data não apaga a data
  de ninguém.

O que cada um faz (`registrarMovimento`, no `Code.gs`):

- **Afastamento:** a aba `Membros` ganha "Afastado" na coluna Situação. O
  afastado **sai dos eventos ainda abertos**, para não levar falta não
  justificada no encerramento, e fica fora das **listas novas** enquanto
  durar: evento novo (formulário e Calendário, via `soAtivos` em
  `dominio/movimentos.js`), mês novo da Caixinha e Insight (filtrado no
  próprio `Code.gs`). O histórico de antes não muda.
- **Retorno:** a situação volta a vazia e ele volta às listas novas. Os
  eventos já abertos não recebem ele de volta sozinhos; o organizador
  inclui pelo Editar do evento, se quiser.
- **Desligamento:** sai da aba `Membros` e dos eventos abertos, mas **as
  presenças dos eventos encerrados ficam**. É a diferença para o
  **Remover**, que apaga o histórico e existe só para cadastro feito
  errado. Tirar o desligado da aba `Membros` faz todo o resto do app (mais
  de 30 lugares leem o cadastro) parar de enxergá-lo sem mexer em nenhum
  deles. Ele continua existindo no livro e nas linhas antigas de
  `Presencas`.
- **Remover** (o botão do cadastro) é o oposto: cadastro feito errado, que
  some **de tudo**, como se nunca tivesse existido. Desde 19/10/2026 apaga
  o integrante do cadastro, das presenças, do livro de Entrada/Saída, das
  doações, da caixinha e do Insight (`removerMembro`, no `Code.gs`), e
  pede confirmação na própria linha antes, dizendo isso. Antes ele
  esquecia o livro, e um integrante de teste removido continuava contando
  como "entrou". Para os removidos antes da correção, o livro não conta
  quem **não está no cadastro e nunca teve desligamento** (`lerMovimentos`):
  o desligado também saiu do cadastro, mas tem o Desligamento registrado.
  Essa conferência vale só no livro. Nas doações e na caixinha, quem saiu
  do clube antes do livro existir tem o mesmo jeito de removido, e não
  pode sumir.

**O relatório** é o card **🔄 Entrada/Saída** do menu do organizador
(`telas/admin-movimentos.js`, contas em `dominio/movimentos.js`):

- Numa divisão: quatro números (entraram, afastados agora, desligados e
  transferências — chegaram · saíram), os
  afastados de hoje e a linha do tempo. O período (desde 19/10/2026) é
  **1 mês** (os últimos 30 dias), **Tudo** (o padrão) ou **Por período**,
  de uma data a outra, com "De" ou "Até" em branco valendo sem limite
  daquele lado (`PERIODOS_MOVIMENTOS`/`rotuloPeriodoMovimentos`, em
  `dominio/movimentos.js`). É uma lista própria: Doações e Caixinha
  continuam com 3, 6, 12 meses e tudo. **Entraram, desligados e
  transferências contam no período; afastados contam agora**, porque
  afastamento é um estado e não um acontecimento.
- Os quatro números também viram uma **pizza** (`renderPizza`, em
  `ui/graficos.js`), entre o placar e os botões: no Regional, a soma de
  todas as divisões; numa divisão, só a dela.
- No Regional: o quadro de todas as divisões na ordem oficial, com o total
  da RJ4. Tocar numa divisão abre a linha do tempo dela. O Regional lê o
  livro inteiro; uma divisão lê só o dela (`lerMovimentos`).
- **O motivo só aparece dentro do app.** O texto pro WhatsApp e a imagem
  levam nome e data, nunca o motivo: pode ser assunto pessoal, e o que
  vai pro grupo circula.
- Registrar e ler pedem PIN, e o `Code.gs` confere contra a divisão do
  integrante (`podeNaDivisao`). A Barra não afasta ninguém do Oeste.

**Transferência** (19/10/2026) — o **🔁 Transferência** no card do
integrante, ao lado do Afastamento. Antes, mudar alguém de divisão era
criar outro cadastro e perder o histórico. O painel pede a **Regional**
(RJ4 ou outra), a **Divisão**, a data e o motivo (`transferirMembro`, no
`Code.gs`; a tela em `telas/admin-membros.js`).

- **Na RJ4**, a divisão é escolhida em botões, não escrita: o app precisa do
  nome exato. O cadastro muda de divisão com o **mesmo ID**, então
  presenças, Insight, doações e caixinha continuam dele. O **cargo sai** (era
  da divisão antiga) e o grau fica **⏳ a confirmar** pela divisão nova.
  Sai dos eventos ainda abertos da divisão antiga (os do Regional ficam) e
  **entra como ⚠️ Aguardando** nos abertos da nova, só os com data a partir
  do dia da transferência ou sem data: um evento de ontem ainda não
  encerrado daria falta num evento de antes de ele chegar. Afastado não
  entra em evento nenhum.
- **Para outra regional**, a regional e a divisão são escritas. Sai do
  cadastro e de todos os eventos abertos, como no desligamento, e o
  histórico fica.
- **Quem transfere é a divisão de origem**, com o PIN dela, ou o Regional.
- **No livro são duas linhas**: a saída na divisão de origem e a entrada na
  de destino, com o outro lado na coluna `De/Para`. Para outra regional, só
  a saída. No relatório de cada divisão entra o 🔁 (chegaram · saíram); no
  quadro do Regional, a transferência entre divisões da RJ4 se anula, e o
  total conta só quem foi para outra regional (`saiuDaRJ4`).
- **⏳ Grau a confirmar** (coluna `Grau a Confirmar` de `Membros`): o selo
  aparece no card, com o **✅ Confirmar grau** (grau e, no VI e no V, o
  cargo da divisão nova; `confirmarGrau` confere o PIN contra a divisão
  atual dele), e o mural da divisão avisa. É só lembrete: enquanto isso,
  ele participa de tudo com o grau que veio.
- **O Editar não troca mais a divisão** de quem já está cadastrado — nem o
  app manda, nem o `Code.gs` aceita (`salvarMembro` mantém a da planilha).
  Toda troca passa pela Transferência e fica no livro.
- **O % pessoal** só conta os eventos da divisão em que ele está agora: na
  divisão nova, começa do zero. O histórico da antiga continua no Relatório
  individual, evento a evento.

## Doações e Caixinha

Duas seções do menu do organizador, criadas em 18/10/2026 para dar número
à conversa do clube: quem está bem e onde dá para melhorar. **Só aparecem
nas divisões de `DIVISOES_COM_DOACOES_E_CAIXINHA`** (`js/nucleo/config.js`),
hoje a Barra e o Regional. Replicar para outra divisão é acrescentar a
chave dela ali, e mais nada: telas, planilha e PIN já funcionam para
qualquer uma.

**No Regional as duas têm jeito próprio** (decisão do clube, 19/10/2026):

- **A caixinha do Regional vem das divisões**, não de integrantes: as
  divisões contribuem para ela. A lista de cada mês são as 6 divisões, na
  ordem oficial (`divisoesContribuintes`), cada uma com o valor que
  contribuiu, **sempre digitado**, sem botão de valor padrão. Na planilha,
  a linha guarda a chave da divisão no lugar do ID do integrante, e o
  `Code.gs` só aceita divisão ali. Rank, controle financeiro e relatórios
  são os mesmos, e os textos mudam junto: "contribuíram",
  "Contribuições das divisões", "divisões com tudo em dia"
  (`vocabularioCaixinha`, em `dominio/caixinha.js`, usado pela tela, pelo
  texto e pela imagem). **Cada caixa lança o seu:** marcar que a Barra
  contribuiu não mexe no caixa da Barra, que lança a própria saída.
- **Das Doações, o Regional tem só o estoque:** as abas "Por evento" e
  "Rank" (o 1 kg de cada integrante) são de divisão (`soNasDivisoes`, em
  `telas/admin.js`), e o card do menu abre direto no estoque.

**Doações** (`telas/admin-doacoes.js`, contas em `dominio/doacoes.js`). A
regra do clube é levar 1 kg de alimento em todo evento.

- **Por evento:** os eventos da divisão, ativos e encerrados. Tocar num
  evento abre os convocados (os ✅ primeiro, depois a hierarquia). Um toque
  no nome marca 1 kg, e o − / + ajusta de 1 em 1. Salvar troca as doações
  do evento inteiro, então abrir de novo é corrigir. Evento sem convocado
  mostra a divisão inteira.
- **Rank:** o kg de cada um e o **cumprimento**: dos eventos *encerrados*
  em que a pessoa estava ✅ Confirmada, em quantos ela levou. São dois
  números de propósito. O kg é o lado de quem está bem; o cumprimento é o
  da melhoria, e só cobra de quem foi. Quem faltou já responde pela falta,
  e cobrar a doação de um evento a que ele nem foi seria cobrar duas vezes.
  Doação de quem não estava como Confirmado soma no kg, mas fica fora do
  cumprimento.

**Estoque** (`telas/admin-doacoes-estoque.js`, contas em
`dominio/estoque.js`): a 3ª aba de Doações. É o **estoque do clube**, que
não é de integrante nenhum: alimentos, roupas, cobertores, sapatos e o que
mais vier. Desde 19/10/2026 é um **livro de entradas e saídas**, no molde
do Estoque ADM e do Controle financeiro da Caixinha (antes era um retrato
da quantidade de hoje, sem histórico; o clube começou o livro do zero).

- **O saldo nunca é digitado:** é a soma do livro, que o `Code.gs` devolve
  pronto (`dadosEstoqueDoacoes`), na mesma leitura das Doações.
- **Entra** pelo **🟢 Lançar entrada** (item já cadastrado ou novo, com a
  medida **un**, **par** ou **kg** sugerida pelo nome — `sugerirMedida`;
  quantidade, data e "de onde veio") e, **sozinho, pelos eventos**: o item
  "🥫 Alimentos (dos eventos)" existe em toda divisão (não no Regional), e
  cada vez que as doações de um evento são salvas em "Por evento" o
  `Code.gs` grava no livro só a **diferença** do que o evento já tinha
  posto (`registrarAlimentosDoEvento`). A primeira entrada leva a data do
  evento. Mais kg vira um "acréscimo"; **menos kg, ou o evento removido,
  vira uma linha de correção** (com sinal), que fica no histórico.
- **Sai só pelo 🔴 Lançar saída:** item com saldo (nunca mais do que tem),
  quantidade, data e **pra onde foi** — 🤝 Ação social, 👨‍👩‍👧 Família,
  🏠 Instituição ou 📦 Outro (este pede a descrição) — mais a descrição.
  O destino é o que agrupa a pizza "Para onde foi".
- **Corrigir é anular** (tocar na linha do extrato): a linha fica, riscada,
  e sai do saldo. Uma entrada que já foi usada em saídas não se anula se o
  saldo ficaria negativo. O que veio dos eventos não se anula na mão:
  corrige-se pelas doações do evento.
- **A tela**, no molde do Controle financeiro: botões com os itens no
  topo (as medidas não se somam, então o painel mostra um item por vez;
  o padrão é Alimentos), o saldo atual, Entrou × Saiu com a pizza, as
  barras mês a mês, "De onde veio" (eventos × avulsas) e "Para onde foi",
  todos os itens com o saldo e o extrato do item.
- **O relatório** (📊 Relatório): período de 3, 6 ou 12 meses, tudo, ou de
  um mês a outro; a tabela de todos os itens (início → fim, com entrou,
  correções e saiu — `resumoDaLinha`); o item escolhido com a conta, os
  gráficos e as saídas do período. **As correções ficam numa linha à
  parte**, e não descontadas do "Entrou": início + entrou + correções −
  saiu = fim. Sai em texto pro WhatsApp, PDF e **imagens do mesmo tamanho**
  (`imagensRelatorioEstoque`): o resumo do item com o gráfico Entrou ×
  Saiu × Saldo e a pizza "Para onde foi", a tabela de todos os itens e as
  saídas detalhadas. Nenhum nome de integrante. A 🖼️ imagem do estoque
  (o saldo de hoje de cada item) continua.
- Na planilha: `EstoqueDoacoesItens` (os itens, com a medida) e
  `EstoqueDoacoesMov` (o livro). A aba antiga `EstoqueDoacoes` fica só
  como backup; nada a lê.
- O Remover de integrante apaga as doações dele, mas não mexe no livro:
  é cadastro feito errado, que não deveria ter doação.

**Caixinha** (`telas/admin-caixinha.js`, contas em `dominio/caixinha.js`).
Três abas: Mês a mês, Rank e Controle financeiro. Desde 18/10/2026 guarda
**quanto** cada um pagou, e não só se pagou (antes disso a decisão era
"sem valores em dinheiro no app"; o clube mudou para poder controlar o
caixa).

- **Mês a mês:** uma grade do mês que vem até um ano atrás. Um mês novo
  começa com a divisão inteira na lista e ninguém marcado; um mês já
  lançado abre com o que foi gravado, e salvar corrige em vez de duplicar.
  Dá para tirar alguém da lista daquele mês ou acrescentar, como no
  "Ajustar" do Insight.
- **O valor de cada um:** o toque no nome (ou no **💵 R$ 30**) marca o
  valor padrão, `VALOR_CAIXINHA_PADRAO` em `js/nucleo/config.js` (o
  `Code.gs` tem o mesmo número). Quem pagou outro valor escreve na caixa
  ao lado. Digitar ali **não redesenha a tela**, senão o teclado do
  celular fecharia a cada número: `atualizarValorCaixinha` acerta só o selo
  da linha e o total do mês. Valor que não é valor ("3o", R$ 50 mil) é
  avisado ao salvar, em vez de virar zero calado.
- **Os meses lançados antes do valor** só têm "Pagou: Sim/Não". Um "Sim"
  sem valor vale R$ 30 (decisão do clube); corrigir uma exceção é reabrir
  o mês. A aba `Caixinha` ganhou a coluna **Valor** no fim e continua
  gravando o "Pagou", então nada que já lia a aba mudou.
- **A lista de cada mês fica congelada** na planilha. É isso que impede
  quem entrou no clube depois de aparecer devendo mês antigo: ele não está
  na lista daquele mês.
- **Rank:** % de meses pagos por integrante, os meses que cada um deve,
  quantos pagaram em cada mês (barras), o % da divisão e quanto cada um
  pagou no período (e o total arrecadado).
- **Relatório de cada mês:** cada mês lançado tem 🖼️ Relatório em imagem e
  📋 Relatório pro WhatsApp. Os dois mostram a pizza (ou o "X de Y") e os
  nomes dos dois lados: ✅ quem pagou e ❌ quem não pagou, os emojis da
  confirmação de presença. Saem do mesmo `relatorioMesCaixinha`, então
  nunca discordam. A imagem cresce para baixo quando a lista não cabe.
  Esse é o **relatório de pagamentos**, e de propósito não leva quanto cada
  um pagou: o de dinheiro é o de controle, abaixo.

**Controle financeiro** (`telas/admin-caixinha-financeiro.js`, contas em
`dominio/caixinha-financeiro.js`). O caixa da divisão: o saldo de hoje, o
que entrou, o que saiu e com o que se gastou, no lugar da planilha de
controle que a Barra mantinha à mão.

- **As mensalidades não são lançadas de novo.** Elas entram no caixa
  direto do Mês a mês, uma entrada por mês. Cada real tem um lugar só, e
  corrigir um pagamento é corrigir o mês.
- **Lançamentos:** 🔴 saída (data, uma das categorias de
  `CATEGORIAS_SAIDA_CAIXINHA`, descrição e valor; no Regional sem a
  "Contribuição Caixinha Regional", que é saída das divisões —
  `categoriasSaidaCaixinha`) e 🟢 entrada avulsa
  (doação extra, rifa… numa categoria só, "Outras entradas"). Data em
  branco é hoje, e nunca no futuro. Tocar num lançamento do extrato abre a
  correção, com o excluir.
- **O saldo inicial é o ponto de partida, informado uma vez e travado**
  (decisão do clube, 18/10/2026). Enquanto não existe, um card no topo do
  painel pergunta "quanto tem na caixinha agora?", com uma confirmação
  ("depois trava") antes de gravar. Ele guarda o **dia** em que foi
  definido, e o mês desse dia já está dentro do valor: quem já pagou a
  caixinha daquele mês, o dinheiro já está no caixa. Por isso, para nada
  contar duas vezes, as **mensalidades contam do mês seguinte** e as
  **entradas e saídas do próprio dia** do saldo em diante (até 19/10/2026
  era do dia seguinte; mudou para o gasto lançado logo depois de informar
  o saldo contar) (`corteDoSaldo`, em
  `dominio/caixinha-financeiro.js`). Quem pagar a caixinha daquele mês
  depois entra como entrada avulsa. O que fica de fora fica de fora da
  conta, e a tela diz quanto ficou. Sem saldo inicial, o caixa conta do
  zero.
- **A trava é na planilha também:** o `Code.gs` recusa um segundo saldo
  inicial. Corrigir é só com o **PIN do Regional**, digitado no próprio
  formulário de correção (o da divisão não destrava, e entrar na Barra com
  a chave-mestra não basta, de propósito). A correção muda só o valor; o
  dia continua o mesmo. Saldo salvo antes da trava tem só o mês e vale do
  jeito antigo, "no começo daquele mês", com o mês inteiro contando.
- **Relatório de controle:** período de 3, 6 ou 12 meses, tudo, ou **de
  um mês a outro**, nos seletores De/Até (o "📊 Controle financeiro do
  mês" de cada mês lançado abre direto num mês só). O período é por mês, e
  não por dia, porque a mensalidade é mensal. Saldo no início, + mensalidades, + outras entradas, − saídas por
  categoria (cada lançamento embaixo da sua) e saldo final. Sai em texto
  pro WhatsApp, imagem pro grupo e PDF (a impressão do navegador), todos
  de `controleCaixinha`, então nunca discordam.
- **O relatório em imagem** (`imagensRelatorioCaixinha`, em `ui/imagem.js`)
  tem botão à vista no painel da aba, e são **várias imagens do mesmo
  tamanho**, não uma que cresce (imagem comprida o WhatsApp encolhe até
  ninguém ler). A 1ª é o resumo: saldo no início → no fim, entrou e saiu,
  o gráfico **Entrou × Saiu × Saldo** (barras do mês embaixo, a linha do
  saldo em escala própria na faixa de cima, pra um não cobrir o outro) e a
  pizza "Com o que gastamos" (passando de 6 categorias, as menores viram
  "Outras"). As seguintes detalham **só as saídas**, mês a mês, com dia,
  categoria, descrição e valor; as entradas ficam nos totais (decisão do
  clube). Mês que não cabe continua na página seguinte com "(continua)". A
  prévia mostra todas e compartilha ou baixa as várias de uma vez.
- **Pro grupo vão as despesas e o saldo** (decisão do clube, 18/10/2026),
  mas nunca nome de integrante: isso é do relatório de pagamentos.
- Tudo vem na mesma leitura da Caixinha (`lerCaixinha` devolve os meses,
  o saldo inicial e os lançamentos), e grava pelas ações
  `caixinhaLancamentoSalvar` e `caixinhaLancamentoRemover`, atrás do PIN e
  conferidas contra a divisão da linha gravada: a Barra não corrige um
  lançamento do Oeste dizendo que ele é da Barra.

Regras que valem para as duas:

- **Ler também pede PIN**, ao contrário do Insight: quem deve a caixinha
  não é coisa para qualquer um com a URL ver. E o `Code.gs` confere o PIN
  de novo contra a **divisão dos dados** (`podeNaDivisao`), não só contra a
  de entrada. Assim quem entrou pela Barra não lê nem grava o Oeste, e o
  PIN do Regional continua abrindo tudo. A divisão vai no parâmetro
  `divisao`, e não em `escopo`, porque o `api()` sobrescreve `escopo` com a
  divisão de entrada.
- **As listas mostram os integrantes atuais** da divisão. Quem saiu do
  clube não aparece no rank, mas o que ele doou ou pagou continua somando
  no total da divisão e nos meses. O nome dele fica gravado em cada linha,
  igual em `Presencas`.
- **A imagem pro grupo não leva nome de quem falhou**, a regra de sempre.
  Na de Doações vai o pódio de quem mais levou; na do Rank da Caixinha, só
  os números do grupo. Os nomes de quem não levou ficam no **texto**, que é
  o que serve para cobrar. **A exceção é o relatório de um mês da
  Caixinha**, que mostra quem não pagou também na imagem: decisão do clube,
  em 18/10/2026.
- Os dados são buscados ao **entrar** na seção, não a cada troca de aba:
  "Por evento" e "Rank" são o mesmo dado visto de dois jeitos.
- Remover um evento apaga as doações dele.

## Estoque ADM do Regional

O card **Estoque ADM** aparece somente em Regional → ADM. A seção tem três
abas: **Movimentar**, **Estoque** e **Relatório**. Movimentar abre com dois
cards lado a lado, Entrada e Saída, e mostra apenas o formulário escolhido.

- Entrada recebe material, quantidade, data e observação opcional. Um nome
  já cadastrado é reconhecido mesmo com diferença de acento ou maiúscula.
- Saída exige um material com saldo, quantidade, data e destino: uma divisão
  ou um integrante. O nome do destino fica congelado no histórico.
- O saldo não é editável. Ele é sempre a soma das entradas menos as saídas
  ativas, e o servidor bloqueia retirada acima do disponível.
- Corrigir significa **anular** o lançamento. A linha continua no relatório;
  uma entrada que já sustenta saídas não pode ser anulada se isso deixaria o
  saldo negativo.
- As ações `estoqueAdm`, `estoqueAdmMovimentar` e `estoqueAdmAnular` pedem
  PIN e também exigem `escopo=regional`. A chave-mestra usada dentro de uma
  divisão não abre este estoque.

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

**Escrever**: o botão **📋 Criar chamada**, no card de cada evento da aba
Eventos, monta o texto da chamada para colar no grupo —
`js/dominio/convocacao.js` e a tela `js/telas/convocacao.js`. Fora o
responsável (abaixo), ele não grava nada: só lê o evento e devolve texto.

**O molde é a chamada oficial do clube**, numa versão limpa: um separador
só, acentos certos, "PE 1" com espaço, sem espaço duplo. O primeiro exemplo
oficial foi o do Bonde Regional de Paraíba do Sul (19/09), guardado em
`ferramentas/exemplos/` com o telefone trocado. Onde o app e um exemplo
oficial divergirem, vale o exemplo. A ideia é ir ajustando a cada chamada
nova que aparecer até ficar perfeito.

A tela e o texto são divididos nos mesmos **8 quadros**, na mesma ordem:

| Quadro | O que é | De onde vem |
|---|---|---|
| 1. Tipo de chamada | o tipo no topo (`🤝 AÇÃO SOCIAL 🤝`), a linha do bonde, o subtítulo e a estrada de 🏍️ | tipo e nome do evento |
| 2. Informações | `🎯` destino, `📅 Data: 19/09`, `⏰ Horário: 07:00h` | data do evento; destino e horário sugeridos |
| 3. Roteiro | um bloco por P.E. (nome, endereço, Maps, Concentração/Briefing/Saída), o `🏁 Destino` e o roteiro do bonde | formulário; o roteiro é montado dos P.E. |
| 4. Membros | ver abaixo | cadastro |
| 5. Legenda | 🐯 Esposa, 👨‍👩‍👦 Família, ✅, 🚘 De carro, ⚠️, ❌ Desistência | fixo |
| 6. Regras do clube | prazo e Respaldo RDI | padrão do clube, ou o que o Regional salvou |
| 7. Atenção | checklist da moto e briefing do comboio | padrão do clube, ou o que o Regional salvou |
| 8. Responsável | "Bora rodar!!!!!!", nome - cargo, contato | salvo na planilha |

**Todo evento tem um bonde para chegar até ele**, seja Pub, Reunião, Bate e
Volta ou Ação Social. Por isso não há mais um modelo por tipo, e
"Bonde Regional" não é um tipo de evento: o tipo só muda a primeira linha.
Embaixo dela vem `⚙️ BONDE REGIONAL - RJ4 ⚙️`, ou `⚙️ DIVISÃO BARRA - RJ4 ⚙️`
num evento de divisão.

**O evento já nasce com a chamada.** O formulário de criar e editar
evento tem os mesmos quadros 1 a 3 (tipo e subtítulo; destino, data e
horário; P.E., destino final e roteiro), desenhados pelo mesmo
`js/ui/quadros-chamada.js`. Eles ficam guardados em JSON na coluna
`Chamada` da aba Eventos, e o "Criar chamada" abre com eles. O que for
mudado na tela da chamada volta para o evento pelo botão **💾 Salvar no
evento**. Os campos antigos continuam preenchidos (endereço = destino +
endereço do destino), então relatórios, planilha e tudo o mais que lê o
endereço de uma linha seguem iguais. Evento sem a coluna (os antigos, e os
de convocação colada) continua abrindo a chamada com as sugestões tiradas
do endereço e do "Outros".

> Só o formulário e o "Salvar no evento" mandam a chamada, e vão por POST
> (não cabe numa URL). Encerrar, reabrir e mudar a data pelo Calendário não
> a mandam, e o `Code.gs` mantém a que já estava, do mesmo jeito que faz
> com o texto original.

**O subtítulo aparece nos cards.** O subtítulo do quadro 1 ("Aniversariantes
do mês") vai logo depois do nome do evento, em letra menor, nos cards do
organizador, na tela inicial, na capa do evento e na folha do Calendário
(`subtituloDoEvento`, em `ui/comuns.js`). Evento sem subtítulo fica igual.

**A tela do membro mostra a chamada enxuta.** Num evento com chamada
salva, o cartão de informações vira data e horário, o 🏁 destino com o
endereço e um "Abrir no mapa", e uma linha curta por P.E. com os horários.
As vias e os textos do clube ficam de fora: são da chamada, e no celular
virariam uma parede de texto.

> O formulário de evento guarda cada campo no state enquanto se digita
> (`aoDigitarNoFormulario`). Antes ele só lia os campos na hora de salvar,
> e qualquer redesenho (escolher o tipo, acrescentar um P.E.) apagava o que
> já tinha sido digitado.

**O roteiro do bonde é montado dos P.E.** A pessoa só escreve as vias de
cada trecho, uma por linha; a sequência (`PE 1 → PE 2 → DESTINO`), o
`📍 PE 1 — Saída`, os `🛣️ TRECHO` e o `🏁` o app escreve. As vias ficam
guardadas no próprio P.E. (o trecho que sai dele), então acrescentar ou
remover um P.E. não apaga nem embaralha as vias dos outros. O roteiro só
entra na chamada quando alguma via ou observação foi preenchida, e um
trecho sem via sai como `* (vias)`, à vista.

**Regras do clube e Atenção podem ser personalizadas**, para quando o
clube mudar uma regra. É um texto só para a RJ4 inteira, na aba
`TextosChamada`, e só quem entra pelo Regional vê o botão "✏️ Personalizar";
as divisões usam o mesmo texto. Salvar o texto igual ao padrão (ou pelo
"Voltar ao texto padrão") grava vazio, e vazio quer dizer "use o padrão do
app".

**A lista de membros muda conforme o evento:**

- **Regional (Bonde Regional):** sai **em branco**, com "Colocar NOME e
  GRAU" e um bloco por divisão (5 linhas no Regional, 3 nas outras), e cada
  integrante se coloca no grupo. A ordem dos blocos é a da chamada oficial —
  Regional, Oeste, Recreio, Barra, Curicica, Taquara, Gardênia —, que **não**
  é a do resto do app.
- **Divisão:** os convocados daquela divisão, em `1. Nome (Grau)`, na ordem
  hierárquica. Quem é de fora da divisão não entra.

**O responsável (quadro 8) fica salvo por divisão**, na aba `Responsaveis`
da planilha: uma linha para cada divisão e uma para o Regional, com nome,
cargo e telefone. Toda chamada daquela divisão já abre com ele. Mudou o
telefone? Troca ali e salva. Até alguém salvar, o app sugere o
**Subdiretor** da divisão, ou o **Operacional** no Regional, a partir do
cadastro. Sem ninguém no cargo, sai `(nome)` / `(telefone)` para preencher:
uma mensagem assinada pela pessoa errada é pior que um espaço em branco
visível.

> Ler e salvar o responsável **pedem PIN**, ao contrário das outras
> leituras, porque ele traz telefone. E salvar confere o PIN contra a
> divisão gravada, não só contra a de entrada: quem entrou pela Barra não
> troca o responsável do Regional. O PIN do Regional, chave-mestra, troca o
> de qualquer uma.

> **O teste que protege o formato:** `ferramentas/regras.mjs` gera a
> chamada e passa de volta pelo parser, e também lê a chamada oficial
> preenchida. É isso que garante que, depois do evento, a chamada colada nos
> Relatórios continua virando evento. Foi por isso que o parser aprendeu a
> data sem ano (`📅 Data: 19/09` — o ano é o que deixa a data mais perto de
> hoje), o `⏰ Horário: 07:00h` e o bloco `REGIONAL` da lista.

## As ferramentas de conferência

Em `ferramentas/`, rodam offline e não tocam a planilha. Existem porque o
app não tem teste automatizado de verdade e a alternativa era clicar em tudo
a cada mudança:

| | O que faz |
|---|---|
| `servidor.py` | serve o app local com o cache desligado |
| `estrutura.py` | 7 verificações: imports circulares, hierarquia de camadas, sintaxe, nome sem import, import sobrando, ações sem tratador |
| `regras.mjs` | as regras do clube que, se quebrarem, saem erradas numa convocação sem ninguém perceber |
| `telas.mjs` | desenha as 202 telas e abas com dados falsos; com `--html` grava tudo para comparar antes/depois |
| `planilha.mjs` | roda o `Code.gs` de verdade contra uma planilha de mentira: encerramento automático, PIN, relatório individual, responsável, textos, chamada do evento, doações, caixinha e entrada/saída |

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
- **Os emojis são regra do clube, não enfeite.** Os dos status, dos tipos,
  das funções e da legenda são o padrão interno do Insanos MC, usado nas
  convocações e no grupo. Nada pode removê-los, escondê-los ou trocá-los
  por ícones; melhoria visual entra em volta deles (cor, barra, relevo).
  Pelo mesmo motivo, os títulos com emoji ganham só o relevo de metal, e
  não o ouro recortado no texto, que apagaria o emoji.

## Visual e movimento

Desde 08/10/2026 o app tem uma camada de acabamento: cards de vidro escuro
(a foto de fundo desfocada por trás), botões com relevo e reflexo, e
movimento. Quase tudo está no fim do `css/estilo.css`, a partir de
"ACABAMENTO", e apagar aquele trecho volta ao visual antigo. Regras que
valem antes de mexer:

- **Nunca o atalho `background:` num `:active`, `:hover` ou no `.card`.**
  Os cards de arte recebem a imagem pelo `style` e o tamanho (`cover`) pela
  classe; o atalho zera o tamanho, e a arte aparecia gigante no toque. Use
  `background-color` / `background-image`.
- **O app redesenha a tela inteira a cada toque**, então animação de CSS
  pura rodaria de novo a cada confirmação. Quem decide o que se mexe é o
  `app.js`:
  - `.tela-entrando` só na **troca** de tela (a chave da tela fica em
    `marcarTrocaDeTela`); entra pela direita, ou pela esquerda quando o toque
    foi num "Voltar".
  - `data-anima="chave"` desenha uma vez por tela (rosca, barras, linha,
    carteirinha); `data-conta` faz o número subir de 0 até o valor; o HTML
    já nasce com o valor final.
  - `data-muda="lugar"` + `data-valor` faz o elemento saltar quando o valor
    daquele lugar muda (o selo de status de um integrante). Na primeira vez
    que aparece, só é lembrado.
- **A busca "Ache seu nome" não redesenha**: redesenhar fecharia o teclado
  do celular. Todas as linhas do evento vão para o HTML, inclusive as das
  divisões fechadas, e `aplicarBusca` (`ui/comuns.js`) só liga e desliga
  classes. Ela roda a cada letra e depois de todo redesenho.
- **Fora do `#app`**, porque o `#app` é refeito a cada toque: o aviso
  flutuante (`mostrarAviso`, que todo "copiar" usa) e a pastilha
  "Salvando… / Salvo" (`atualizarPastilhaSalvar`). O **erro** ao salvar
  continua como faixa na tela, de propósito.
- **Pódio dos ranks** (`posicoesDoPodio`): empate divide a medalha, e o
  seguinte fica com a próxima (dois ouros, depois prata). O Rank de
  Presença ordena divisões e integrantes pelo %.
- **Iniciais e carteirinha** usam a cor do grau (`nivelDoGrau`): ouro do I
  ao V, prata no VI, bronze no VII e VIII, neutro no IX e X.
  As mesmas iniciais (`selinhoIniciais`) estão na lista do evento, no
  cadastro de Membros (um card por grau, em ordem hierárquica) e na lista
  do Relatório individual.
- **O Rank de Presença abre calculado**, mas só na primeira vez que a tela
  abre: o resultado fica no state enquanto o app está aberto, e o
  "🔄 Atualizar" busca de novo. Assim cada visita ao app custa no máximo uma
  conta na planilha, a mesma que o antigo botão "Calcular rank" custava.
  Enquanto calcula, mostra o esqueleto em vidro, e as divisões entram em
  cascata (`data-anima`, uma vez por janela).
- **Relatórios**: as 6 abas sempre à vista (3 por linha, rótulo curto com o
  emoji do tipo), período em pílula (`.pilulas-periodo`), títulos dos
  painéis em `.painel-titulo`, e esqueleto da rosca e das listas
  (`esqueletoRosca`/`esqueletoLista`, em `ui/graficos.js`) no lugar do
  "Carregando…".
- Quem pediu "reduzir movimento" no aparelho fica sem animação, e a
  impressão/PDF desliga vidro, sombra e enfeites (`@media print`).
- **Imagens para o grupo** (`ui/imagem.js`): o resultado de um evento
  encerrado (aba Encerrados do organizador), o Rank de Presença, cada rodada
  de Insight (ranking das divisões naquela rodada) e o relatório completo do
  Insight no período (com os destaques: quem mais fez). Nenhuma traz nome de
  quem faltou ou não fez: a imagem circula, e a cobrança é do texto. Desenhadas
  num `<canvas>` com o fundo, o emblema e a Rye. Abrem numa prévia com
  Compartilhar/Baixar, e não direto: o celular só deixa compartilhar
  arquivo logo depois de um toque, e desenhar leva um instante. O título
  diminui com nome longo e a rosca se ajusta ao espaço, para nada se
  sobrepor. Cantos arredondados feitos à mão (`retangulo`), porque o
  `roundRect` não existe antes do iOS 16.
- **📊 Gerar relatório** (21/10/2026): todo relatório com mais de uma
  saída tem um botão só, que abre as opções na própria tela: 📋 WhatsApp,
  📄 PDF e 🖼️ Imagem, as que aquele relatório tiver
  (`botaoGerarRelatorio`, em `ui/comuns.js`; um menu aberto por vez, em
  `state.gerarRelatorioAberto`). Está nos eventos (ativos e encerrados;
  os encerrados ganharam o PDF, que sai só com aquele evento), nas rodadas
  e no relatório completo do Insight, no Relatório individual, na Caixinha
  (cada mês, Rank e Controle financeiro), no Rank de Doações, no relatório
  do Estoque e na Entrada/Saída. Onde há uma saída só (imagem do Rank,
  imagem do estoque, PDF dos Relatórios) o botão continua direto. Ficaram
  de fora o Calendário, que não é relatório, e os chamados e a chamada,
  que são mensagens.
- **Prévia do link** no WhatsApp: as tags `og:` no `index.html` e a
  imagem `img/compartilhar.jpg` (1200×630). O WhatsApp guarda a prévia de
  um link por um tempo, então mudança ali demora a aparecer.
- **Atualizar respostas** no evento (botão e "puxar para baixo"): busca as
  respostas sem travar a lista (`atualizarConfirmacoes`, `fluxos/evento.js`)
  e **não roda com marcação ainda não salva**, que a resposta do servidor
  apagaria da tela. Na tela de evento o `overscroll-behavior` impede o
  Chrome do Android de recarregar a página no mesmo gesto. Atualização
  automática a cada minuto ficou de fora por enquanto: com o clube inteiro
  com o evento aberto, os pedidos simultâneos ao Apps Script podem esbarrar
  no limite dele.
- **Folha do dia** no Calendário, **toque na fatia** da rosca, **linha do
  tempo** no relatório individual, **etapas** presas no topo do formulário
  de evento (atualizadas a cada letra sem redesenhar) e a **saudação** da
  tela inicial.
- **Luz e vida** (fim do `estilo.css`, "LUZ E VIDA"), cada um uma classe
  no `<html>` ligada pelo `app.js` (`ACABAMENTOS`); `?sem=reflexo,brasas`
  no endereço desliga os citados, para comparar:
  - **reflexo**: atravessa uma vez os cards de arte (`.event-card`) quando
    a tela chega, um depois do outro (`.recem-chegada`, 2,6s);
  - **clima**: halo no topo na cor do tipo do evento aberto
    (`atualizarClima`);
  - **brasas**: 16 faíscas subindo no fundo de todas as telas, fora do
    `#app`, criadas uma vez (`atualizarBrasas`);
  - **divisores**: filetes dourados nos rótulos de seção e no rodapé.

  Testados e recusados em 09/10: brilho dourado no toque, e couro,
  costura, moldura e rebites nos cards. Não trazer de volta.

## Antes de subir

Os quatro testes, que rodam offline e não tocam a planilha (ver a seção das
ferramentas, acima):

    py ferramentas/estrutura.py     # imports, camadas, sintaxe, ações
    node ferramentas/regras.mjs     # ordem hierárquica e formato da convocação
    node ferramentas/telas.mjs      # desenha as 202 telas e abas
    node ferramentas/planilha.mjs   # o encerramento automático, no Code.gs

Eles dizem que o app **não quebrou**, não que está bonito: não cobrem
aparência, impressão/PDF, o caminho de rede real nem o resto do `Code.gs` —
o `planilha.mjs` só alcança o encerramento automático, a guarda de PIN, o
relatório individual, o responsável, os textos da chamada, a chamada
guardada no evento, as doações, a caixinha (com os valores e o controle
financeiro), o Estoque ADM e a entrada/saída de integrantes.

Se a mudança mexeu no `Code.gs`, ele precisa ser **republicado à parte** no
Apps Script — não vai junto no `git push`. Confira depois chamando a URL do
Web App com `?action=versao`; o passo a passo está no [LINK.md](LINK.md).

> O app lê e grava na **planilha de produção**. Não existe ambiente de teste
> separado — cuidado ao mexer com eventos reais abertos.

## Próximos passos possíveis

Ideias registradas, nada pedido ainda:

- **Transferência, segunda etapa** (combinada com o clube em 19/10/2026): no
  Relatório individual de quem foi transferido, um bloco a mais com a
  presença na divisão antiga ("Na Barra (até 19/10/2026)"). Hoje esses
  eventos só aparecem no histórico, fora do %.

- **Doações e Caixinha, segunda etapa:** mostrar as duas no Relatório
  individual de cada integrante e nas abas de resumo da planilha; levar
  para as outras divisões (uma chave a mais em
  `DIVISOES_COM_DOACOES_E_CAIXINHA`); e uma visão do Regional com todas as
  divisões juntas (inclusive o caixa de cada uma).

- **Multi-divisão de verdade** (um jogo de abas por divisão na planilha) —
  ver [PLANO-MULTI-DIVISAO.md](PLANO-MULTI-DIVISAO.md). Combinado que fica
  para uma sessão dedicada.
- `js/telas/relatorios.js` é hoje o maior arquivo (593 linhas). É uma tela
  coerente com abas internas; se um dia incomodar, dá para repartir por aba,
  como já foi feito com o organizador.
