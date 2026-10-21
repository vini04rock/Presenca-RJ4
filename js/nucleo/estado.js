// O estado da tela inteira, num objeto so, e a leitura de status de um membro.

export let state = {
  view: 'home',
  // Se ja entrou no card "Eventos" da tela inicial - false = mostra so o
  // card (tela raiz), sem listar as 7 divisoes de cara.
  homeEventosAberto: false,
  // Chave de ESCOPOS ('barra', 'regional', ...) - qual escopo o membro esta
  // vendo na tela inicial. null = ainda na tela de escolha.
  homeEscopo: null,
  // Um valor de TIPOS_EVENTO, ou 'todos' - qual tipo de evento esta
  // filtrado dentro do escopo escolhido. null = ainda na tela de escolha.
  homeTipo: null,
  roster: [],
  events: [],
  currentEventId: null,
  // De onde a pessoa clicou pra abrir o evento (ver acao "open-event") -
  // usado pelo back-link "‹ Todos os eventos" da tela de evento, pra voltar
  // pro mesmo lugar em vez de sempre cair na tela inicial.
  eventoVoltarPara: null,
  currentStatus: {},
  isAdmin: false,
  adminTab: 'eventos',
  expandedMemberId: null,
  // O que esta digitado na busca "Ache seu nome" da tela de evento. Filtra
  // a lista sem redesenhar (ver aplicarBusca, em ui/comuns.js).
  buscaMembro: '',
  // O painel de status que ACABOU de abrir - so nesse redesenho ele entra
  // deslizando; nos seguintes (cada toque redesenha) ele ja esta aberto.
  pickerAbrindo: null,
  // "Puxar pra atualizar" / "Atualizar respostas" na tela de evento: busca
  // as respostas de novo sem tirar a lista da tela.
  atualizandoStatus: false,
  // Calendario: o dia tocado, cuja "folha" sobe de baixo com o evento dele.
  // calendarioDiaAbrindo marca o redesenho em que ela acabou de abrir (so
  // nesse ela entra deslizando - igual o pickerAbrindo).
  calendarioDiaAberto: null,
  // O "Relatar dias vazios" do Copiar pro WhatsApp do Calendario: com ele,
  // o texto vai do dia 1 ao ultimo, com os sem evento em branco.
  calendarioDiasVazios: false,
  calendarioDiaAbrindo: false,
  // Quais divisoes estao abertas na lista de um evento regional - comeca
  // vazio (tudo fechado), so mostra os nomes da divisao que a pessoa clicar.
  expandedDivisoes: new Set(),
  loading: true,
  loadError: null,
  statusLoaded: false,
  statusError: null,
  saveState: 'idle',
  saveSeq: 0,
  saving: false,
  pinErro: null,
  pinVerificando: false,
  // A credencial do organizador, depois que o PIN foi conferido: o escopo
  // que ele abriu e o valor digitado. Fica so na memoria da aba - recarregar
  // a pagina perde, igual ja acontecia com isAdmin.
  //
  // Ela existe porque o Code.gs passou a EXIGIR PIN nas acoes de escrita
  // (ver ACOES_PROTEGIDAS la e em nucleo/api.js). Antes o valor digitado era
  // jogado fora assim que a tela trocava: servia so pra decidir o que
  // desenhar. Agora viaja junto com cada gravacao, anexado pelo api() - a
  // pessoa continua digitando UMA vez, na entrada.
  //
  // Guarda o escopo junto porque ha dois caminhos de PIN com escopos
  // diferentes: o Modo organizador (adminEscopo) e o Organizar do Calendario
  // (calendarioEscopo). O par precisa bater pra planilha aceitar.
  pinAtual: null,
  newEventSelected: null,
  newEventTipo: null,
  // Formulario de criar/editar evento. Tudo o que e digitado vai pra ca na
  // hora (ver aoDigitarNoFormulario em telas/admin-eventos.js): a tela
  // redesenha ao escolher o tipo ou mexer nos P.E., e sem isso o que ja
  // tinha sido digitado sumia.
  //   newEventForm: { nome, data (dd/mm/aaaa), horario (HH:MM), outros }
  //   newEventChamada: os quadros 1 a 3 da chamada (ver camposDoEvento)
  newEventForm: null,
  newEventChamada: null,
  // Chave de ESCOPOS - qual botao o organizador escolheu na tela de
  // divisoes. Decide a categoria de todo evento criado, a divisao de todo
  // membro cadastrado, e filtra o que aparece nas abas Eventos, Membros e
  // Relatorio do organizador.
  adminEscopo: null,
  editingEventId: null,
  reportData: {},
  reportError: null,
  relatorioState: 'idle',
  relatorioErro: null,
  confirmDeleteId: null,
  estatisticas: null,
  estatisticasLoading: false,
  estatisticasError: null,
  expandedReportEventId: null,
  // Relatorio parcial de um evento ativo (aba Eventos): o id do evento cujas
  // respostas estao sendo buscadas, e o erro se a busca falhar.
  relatorioParcialCarregando: null,
  // Qual "📊 Gerar relatorio" esta aberto (ui/comuns.js, botaoGerarRelatorio).
  gerarRelatorioAberto: null,
  relatorioParcialErro: null,
  copiedEventId: null,
  copiedInsightRodadaId: null,
  // Tela "Criar chamada" (o texto da convocacao pro WhatsApp). Os campos
  // comecam sugeridos pelo evento e viram o que o organizador digitar.
  convocacaoEventoId: null,
  // Os quadros 1 a 3 (ver camposIniciais em dominio/convocacao.js), com a
  // lista de P.E. em convocacaoCampos.pes.
  convocacaoCampos: {},
  convocacaoCopiado: false,
  // Quadro 8: { nome, cargo, telefone }. Comeca com a sugestao do cadastro e
  // e trocado pelo que estiver salvo na planilha para a divisao do evento.
  convocacaoResponsavel: {},
  // 'carregando' | 'pronto' | 'erro' - a busca do responsavel salvo.
  convocacaoRespEstado: 'pronto',
  convocacaoRespSalvando: false,
  convocacaoRespMsg: null,
  // Quadros 6 e 7: { regras, atencao } salvos pelo Regional (vazio = padrao),
  // qual deles esta aberto para edicao e o texto da caixa enquanto isso.
  convocacaoTextos: {},
  // Os mesmos textos personalizados (Regras do clube / Atencao), guardados
  // pra fora da tela da chamada: a mensagem de "cobrar quem falta" termina
  // com as Regras. null = ainda nao chegaram (vale o padrao).
  textosChamada: null,
  convocacaoTextoEditando: null,
  convocacaoTextoRascunho: '',
  convocacaoTextoSalvando: false,
  // { chave, texto } - o aviso de salvo/erro, embaixo do quadro certo.
  convocacaoTextoMsg: null,
  // "Salvar no evento", embaixo da previa.
  convocacaoEventoSalvando: false,
  convocacaoEventoMsg: null,

  // Relatorio individual (Modo organizador). Sem integrante escolhido, a
  // tela mostra a lista de nomes; com um, o relatorio dele. O periodo vale
  // pra qualquer integrante que se abra, ate alguem limpar.
  relIndMembroId: null,
  relIndDados: null,
  relIndCarregando: false,
  relIndErro: null,
  // So no Regional: quais divisoes estao abertas mostrando os nomes.
  relIndDivisoesAbertas: new Set(),
  relIndFiltroInicio: '',
  relIndFiltroFim: '',
  relIndCopiado: false,
  // "Exportar varios em PDF": o modo de selecao da lista, quem esta marcado,
  // e os relatorios ja buscados (null = ainda na selecao; uma lista = a
  // folha de impressao aberta).
  relIndSelecionando: false,
  relIndMarcados: new Set(),
  relIndVarios: null,
  relIndVariosCarregando: false,
  relIndVariosErro: null,

  newMemberGrau: null,
  // So aparece quando o grau escolhido tem cargo (VI ou V) - ver CARGOS.
  newMemberCargo: null,
  newMemberFuncoes: new Set(),
  editingMemberId: null,
  rankData: null,
  rankJanela: 'sempre',
  rankLoading: false,
  rankError: null,
  rankExpandedDivisoes: new Set(),
  newMemberNome: '',

  // Rank de Insights (publico, tela inicial).
  insightRankData: null,
  insightRankLoading: false,
  insightRankError: null,
  insightRankExpandedDivisoes: new Set(),
  // Aba ativa ('total' | 'porRodada') e, na aba "Por rodada", qual rodada
  // esta expandida mostrando o proprio grafico (null = nenhuma).
  insightRankTab: 'total',
  insightRankRodadaSelecionada: null,
  // Dentro do detalhe de uma rodada (aba "Por rodada"), quais divisoes estao
  // abertas mostrando os nomes - chave 'fez-<divisao>' ou 'naofez-<divisao>'.
  // Zerado sempre que a rodada selecionada muda (ver select-insight-rank-rodada).
  insightRankRodadaDivisoesExpandidas: new Set(),

  // Aba Insights, dentro do organizador Regional.
  insightStats: null,
  insightStatsLoading: false,
  insightStatsError: null,
  insightRodadasHistorico: null,
  insightMarcacoes: {},
  // ID da rodada ja registrada que esta sendo corrigida (ver "Ajustar" na
  // lista de ultimas rodadas) - null = modo normal (marcando uma rodada
  // nova). Enquanto preenchido, insightMarcacoes guarda a marcacao dessa
  // rodada especifica, nao a de uma rodada nova.
  insightEditandoRodadaId: null,
  // Lista de trabalho de quem esta na rodada em ajuste (comeca igual a
  // r.membros, mas o organizador pode tirar/adicionar gente antes de
  // salvar) + nome/divisao de cada um pra exibir sem precisar consultar o
  // roster atual (um removido do clube ainda pode aparecer numa rodada
  // antiga). Ver iniciarAjusteInsightRodada.
  insightAjusteMembroIds: [],
  insightAjusteInfo: {},
  insightAjusteMostrarAdicionar: false,
  // Cada divisao comeca fechada dentro do ajuste - so mostra os integrantes
  // depois de tocar no nome dela, pra nao poluir a tela com todo mundo de
  // uma vez so.
  insightAjusteDivisoesExpandidas: new Set(),
  // Data opcional pra registrar uma rodada atrasada (ver "Registrar com
  // outra data" abaixo do "Confirmar rodada") - vazio usa o dia de hoje,
  // igual sempre foi.
  insightMostrarDataCustom: false,
  insightDataEscolhida: '',
  insightExpandedDivisoes: new Set(),
  insightSalvando: false,
  insightErro: null,
  insightResultado: null,
  insightConfirmDeleteRodadaId: null,
  insightMostrarExcluidos: false,

  // Secao Doacoes do organizador (so nas divisoes de temDoacoesECaixinha).
  // doacoesDados e o que o Code.gs devolve (lerDoacoes), de uma divisao -
  // doacoesDadosEscopo diz qual, pra nao mostrar a Barra dentro do Oeste.
  doacoesDados: null,
  doacoesDadosEscopo: null,
  doacoesCarregando: false,
  doacoesErro: null,
  // O evento aberto pra marcar quem levou, e a marcacao ainda nao salva:
  // { idMembro: kg }. Sem kg (ou 0) = nao levou.
  doacoesEventoId: null,
  doacoesMarcacoes: {},
  doacoesSalvando: false,
  // { ok, texto } - o aviso depois de salvar, na lista de eventos.
  doacoesMsg: null,
  // Quantos encerrados aparecem na lista (cresce no "Mostrar mais antigos").
  doacoesQtdEncerrados: 8,
  // Janela do rank, em meses (0 = desde sempre). Ver PERIODOS.
  doacoesPeriodo: 3,
  // Aba "Estoque" de Doacoes: o livro de entradas e saidas (ver
  // dominio/estoque.js). estoqueItemId: o item que o painel mostra (null =
  // o primeiro). estoqueForm: a entrada ou saida sendo lancada
  //   { tipo, itemId ('novo' = item novo), itemNome, medida, quantidade,
  //     data, destino, descricao }.
  // estoqueRelatorio/estoquePeriodo: o relatorio aberto e o periodo dele
  // (o mesmo formato do Controle financeiro). estoqueAnularId: o lancamento
  // com a confirmacao do "Anular" aberta.
  estoqueItemId: null,
  estoqueForm: null,
  estoqueSalvando: false,
  estoqueMsg: null,
  estoqueRelatorio: false,
  estoquePeriodo: 0,
  estoqueAnularId: null,
  estoqueQtdExtrato: 15,

  // Estoque ADM, exclusivo do Regional. O saldo e calculado no backend a
  // partir do livro de entradas/saidas; o formulario guarda uma movimentacao
  // por vez e o relatorio pode filtrar o tipo.
  // Acoes Sociais (o planejador de cada divisao): o que o Code.gs devolve
  // (lerAcoesSociais) e de qual divisao, o formulario de ideia aberto e o
  // "apagar?" em confirmacao.
  acoesSociaisDados: null,
  acoesSociaisDadosEscopo: null,
  acoesSociaisCarregando: false,
  acoesSociaisErro: null,
  acoesSociaisSalvando: false,
  acoesSociaisMsg: null,
  acaoSocialIdeiaForm: null,
  acaoSocialApagarId: null,
  // A agenda: o ano na tela (null = o que anoInicialDaAgenda escolher), o
  // mes aberto, o formulario da acao do mes, o "Criar evento" em
  // confirmacao e a legenda aberta. E o formulario dos textos prontos.
  acoesSociaisAno: null,
  acaoSocialMesAberto: null,
  acaoSocialAgendaForm: null,
  acaoSocialCriarEventoId: null,
  acoesSociaisLegenda: false,
  acaoSocialTextoForm: null,
  acaoSocialRascunhoConfirmar: false,
  estoqueAdmDados: null,
  estoqueAdmCarregando: false,
  estoqueAdmErro: null,
  estoqueAdmForm: null,
  estoqueAdmSalvando: false,
  estoqueAdmMsg: null,
  estoqueAdmFiltroTipo: 'todos',
  estoqueAdmAnularId: null,

  // Secao Caixinha do organizador. Mesma ideia: os meses lancados da
  // divisao (e o controle financeiro dela, que vem junto), e o mes aberto
  // pra lancar ou corrigir.
  caixinhaDados: null,
  caixinhaDadosEscopo: null,
  caixinhaCarregando: false,
  caixinhaErro: null,
  // 'yyyy-mm' do mes aberto. A lista de quem devia pagar (caixinhaMembroIds)
  // comeca com a divisao inteira num mes novo, ou com a lista gravada num
  // mes ja lancado; caixinhaInfo guarda nome/grau de quem ja saiu do clube.
  caixinhaMes: null,
  caixinhaMembroIds: [],
  // { idMembro: reais } de quem pagou no mes aberto. 0 ou sem chave = nao
  // pagou; null = o que foi digitado nao e um valor (salvar avisa).
  caixinhaValores: {},
  // O texto de cada caixa de "outro valor", como foi digitado - a tela
  // redesenha a cada toque, e sem isto o "35," pela metade virava "35".
  caixinhaValoresTexto: {},
  caixinhaInfo: {},
  caixinhaMostrarAdicionar: false,
  caixinhaConfirmarRemover: false,
  caixinhaSalvando: false,
  caixinhaMsg: null,
  caixinhaPeriodo: 6,
  // Aba "Controle financeiro". caixinhaFinForm e o formulario aberto:
  // { tipo: 'entrada'|'saida', id?, data, categoria, descricao, valor } ou
  // { tipo: 'saldoInicial', mes, valor } - os campos como foram digitados.
  // null = nenhum aberto.
  caixinhaFinForm: null,
  // O card de definir o saldo inicial (so aparece enquanto nao ha um): o
  // valor como foi digitado, e se a confirmacao "depois trava" esta aberta.
  caixinhaFinSaldoTexto: '',
  caixinhaFinConfirmarSaldo: false,
  caixinhaFinSalvando: false,
  caixinhaFinMsg: null,
  // O id do lancamento com a confirmacao de exclusao aberta.
  caixinhaFinConfirmarRemover: null,
  // Quantos itens do extrato aparecem (cresce no "Mostrar mais").
  caixinhaFinQtdExtrato: 15,
  // O relatorio de controle aberto, e o periodo dele: 0 = tudo, N = os
  // ultimos N meses, 'yyyy-mm' = um mes so.
  caixinhaFinRelatorio: false,
  caixinhaFinPeriodo: 0,

  // Cadastro de membros: a data de entrada de um integrante novo (como foi
  // digitada, dd/mm/aaaa) e o painel de afastamento/retorno/desligamento
  // aberto numa linha. movTipo: 'afastamento' | 'retorno' | 'desligamento'.
  newMemberEntrada: '',
  movMembroId: null,
  movTipo: null,
  movData: '',
  movMotivo: '',
  movSalvando: false,
  movErro: null,
  // A transferencia (movTipo 'transferencia'): a chave da divisao da RJ4
  // escolhida, ou "outra regional" com a regional e a divisao escritas.
  movDestino: null,
  movForaDaRJ4: false,
  movRegionalDestino: '',
  movDivisaoDestino: '',
  // O "Confirmar grau" de quem chegou transferido, aberto numa linha: o grau
  // e o cargo escolhidos (comecam com os que ele tem).
  grauMembroId: null,
  grauEscolhido: null,
  cargoEscolhido: null,
  grauSalvando: false,
  grauErro: null,
  // O integrante com a confirmacao do "Remover" aberta na linha dele.
  removerMembroId: null,
  // "Preencher datas" do cadastro: os ids da lista (quem estava sem data de
  // ingresso quando abriu; null = fechado), o que foi digitado em cada um
  // (dd/mm/aaaa) e o aviso depois de salvar.
  preencherEntradasIds: null,
  entradasRascunho: {},
  entradasSalvando: false,
  entradasMsg: null,
  // A divisao aberta no card de obrigatoriedades do mes (menu do organizador
  // do Regional), com o detalhe dos tipos; null = nenhuma.
  obrigatoriedadeAberta: null,
  // null = painel inicial do organizador; 'adm' | 'operacional' | 'social'
  // = submenu com as ferramentas daquela area. E so organizacao visual:
  // o PIN e as permissoes continuam sendo os da divisao escolhida.
  organizadorArea: null,

  // Secao Entrada/Saida do organizador: o livro de movimentacoes da divisao
  // (ou de todas, no Regional) e o periodo. No Regional, a divisao aberta
  // mostra a linha do tempo dela; null = o quadro de todas.
  movimentosDados: null,
  movimentosDadosEscopo: null,
  movimentosCarregando: false,
  movimentosErro: null,
  // 0 = tudo (o padrao), 1 = o ultimo mes, { de, ate } = o "Por periodo".
  movimentosPeriodo: 0,
  movimentosDivisaoAberta: null,

  // Tela "Calendario" - divisao/regional escolhida e o mes/ano exibido
  // (null = usa o mes atual, preenchido na primeira renderizacao). Sem PIN,
  // igual a tela de Eventos.
  calendarioEscopo: null,
  calendarioAno: null,
  calendarioMes: null,
  // "Organizar" (colar uma lista de datas + tipo pra marcar no calendario) -
  // pedido de PIN da propria divisao/regional escolhida, igual Modo
  // organizador/Relatorios. etapa: null (so calendario) | 'pin' | 'texto'.
  calendarioOrganizarEtapa: null,
  calendarioPinErro: null,
  calendarioPinVerificando: false,
  // Os dias marcados no calendario sao eventos de verdade (ver
  // eventosCalendarioVisiveis) - nao existe mais um mapa em memoria
  // separado, state.events (ja carregado pro resto do app) e a fonte.
  calendarioMarcarAviso: null,
  calendarioSalvando: false,
  // Trava de tudo-ou-nada: se sobrar linha nao reconhecida, nao marca nada
  // e devolve o texto tal como foi colado (calendarioOrganizarTextoValor)
  // junto com a lista do que precisa corrigir, pra pessoa editar em cima do
  // que ja tinha colado em vez de perder tudo e ter que colar de novo.
  calendarioOrganizarTextoValor: '',
  calendarioOrganizarTextoErro: null,
  // Erro de rede/planilha ao tentar criar os eventos (diferente do erro de
  // reconhecimento acima) - mostrado na propria tela do Adicionar.
  calendarioOrganizarErroSalvar: null,
  // Sub-abas dentro da etapa 'texto' do Organizar: 'adicionar' (colar texto,
  // igual ja existia) ou 'editar' (calendario replicado, so com o que essa
  // divisao/regional marcou por conta propria - so da pra editar o que a
  // propria divisao criou, igual so da pra ver o que ela propria criou).
  calendarioOrganizarSubTab: 'adicionar',
  calendarioEditandoData: null,       // dataIso do dia selecionado no grid de edicao
  calendarioAjustandoData: false,     // true = mostra o campo de nova data
  calendarioConfirmandoExclusao: false,

  // Tela "Relatorios" (colar convocacao). A divisao e o "ja passou pelo
  // PIN" sao os mesmos do Modo organizador (adminEscopo, isAdmin) - os
  // Relatorios sao uma secao dentro dele, nao ha como estar numa divisao
  // aqui e noutra la. Os campos adminEscopo/isAdmin, que
  // duplicavam esses dois de quando os Relatorios eram um card separado na
  // tela inicial com PIN proprio, deixaram de existir.
  //
  // Qual divisao vai levar o relatorio colado (a categoria do evento
  // criado). So diferente de adminEscopo quando o acesso foi pelo PIN
  // Regional - ai a pessoa escolhe entre "Regional" (convocacao com varias
  // divisoes juntas) ou uma divisao especifica (convocacao so daquela
  // divisao, mesmo entrando pelo PIN Regional). Fora do Regional, e sempre
  // igual a adminEscopo (nao ha escolha).
  relatorioCategoriaAlvo: null,
  // Filtro de divisao do painel de Relatorios, so relevante quando o acesso
  // e pelo PIN Regional - 'todas' agrega tudo, uma chave especifica ('regional'
  // inclusive) restringe eventos/membros so aquela categoria. Ver
  // eventosDoRelatorioEscopo()/membrosVisiveisRelatorio().
  relatorioFiltroDivisao: 'todas',
  // Filtro de periodo (data inicial/final, 'yyyy-mm-dd') do painel de
  // Relatorios - vazio nos dois = sem filtro (desde sempre). Diferente do
  // seletor "1/3/6/12 meses" de cada donut (relatorioPeriodoPorGrafico, uma
  // janela relativa que sempre termina hoje), este e um intervalo fixo
  // escolhido a mao, pra tirar um relatorio de um mes especifico por
  // exemplo. Ver eventosDoRelatorioEscopo().
  relatorioFiltroDataInicio: '',
  relatorioFiltroDataFim: '',
  // "Exportar para PDF" de dentro do Modo organizador (aba Eventos) - so
  // trava o botao enquanto pula pra tela de Relatorios e carrega os dados,
  // ver exportarRelatorioPdfAdmin().
exportandoPdfAdmin: false,
  // Filtro de periodo da aba "Relatorio completo" do Insight. Separado do
  // relatorioFiltroData* (que e dos eventos) de proposito: sao dois
  // relatorios diferentes, e mexer num nao pode mudar o outro.
  insightFiltroDataInicio: '',
  insightFiltroDataFim: '',
  // Tipo escolhido na tela de colar (um de TIPOS_EVENTO) - quando marcado,
  // vence o palpite que o parser tenta tirar do titulo do texto colado.
  relatorioTipoEscolhido: null,
  // Qual aba do painel de Relatorios esta ativa: 'colar' | 'eventos' | 'presenca'.
  relatorioTab: 'resumo',
  // Dentro da aba "Colar", em qual passo do fluxo colar->revisar->resultado
  // a pessoa esta.
  relatorioColarStep: 'texto',
  relatorioTextoBruto: '',
  // Id do evento sendo corrigido (colar convocacao de novo por cima de um
  // evento ja existente, em vez de criar outro) - null quando o fluxo de
  // colar e pra um evento novo. Ver iniciarCorrecaoConvocacao.
  relatorioEditandoEventoId: null,
  // Guarda o resultado do parser: { evento: {...}, membrosParsed: [...], avisos: [...] }.
  // Cada item de membrosParsed carrega seu proprio membroId/ignorado/sugestoes,
  // editados direto pela tela de revisao (sem precisar de um mapa separado).
  relatorioParsed: null,
  relatorioSalvando: false,
  relatorioSalvarErro: null,
  relatorioSalvoEventoId: null,
  // Evento(s) ja existentes na mesma data/divisao, achados ao clicar em
  // "Confirmar" - so um aviso, nao bloqueia (ver eventosPossivelmenteDuplicados).
  relatorioDuplicidadeAviso: null,
  relatorioDuplicidadeConfirmada: false,
  // Quais divisoes estao abertas na lista "% de cada integrante" (comeca
  // tudo fechado - senao o Regional com "Todas as divisões" vira uma
  // lista sem fim de nomes de cara).
  relatorioEstatisticasExpandidas: new Set(),
  // Id do membro cuja "Ficha" esta aberta (historico evento a evento) -
  // aberta a partir de qualquer lista de "% de cada integrante" no
  // Resumo Relatorio ou nas abas fixas por tipo. null = nenhuma aberta,
  // mostra a aba normal.
  relatorioMembroFichaId: null,
  // Mesma ideia, para a aba Eventos agrupada por divisao (Regional +
  // "Todas as divisões").
  // Quais eventos tem o "Ver texto original" (ver renderCardEvento) aberto.
  relatorioTextoOriginalExpandido: new Set(),
  // Janela (em meses) de cada donut do painel de Presenca - uma chave por
  // grafico ('total' + um por TIPOS_EVENTO), cada um navega o proprio
  // periodo independente dos outros.
  relatorioPeriodoPorGrafico: { total: 3, 'Pub': 3, 'Bate e Volta': 3, 'Ação Social': 3, 'Reunião': 3 },
  // null = mostra o painel de donuts; um tipo (ou 'total') escolhido =
  // mostra o grafico de barras + tabela so dos eventos daquele grupo.
  relatorioTipoDetalhe: null,
};

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getMemberStatus(memberId) {
  return state.currentStatus[memberId] || { status: 'aguardando', direto: false, destacado: false, acompanhado: false };
}
