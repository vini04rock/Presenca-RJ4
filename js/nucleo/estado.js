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
  newEventSelected: null,
  newEventTipo: null,
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
  copiedEventId: null,
  copiedInsightRodadaId: null,
  // Tela "Criar chamada" (o texto da convocacao pro WhatsApp). Os campos
  // comecam sugeridos pelo evento e viram o que o organizador digitar.
  convocacaoEventoId: null,
  convocacaoCampos: {},
  convocacaoCopiado: false,

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

  // Tela "Relatorios" (colar convocacao). Fica em campos separados dos
  // equivalentes do Modo organizador (adminEscopo, isAdmin) para nao mexer
  // no estado de uma sessao de organizador que porventura esteja aberta.
  relatorioEscopo: null,
  // Qual divisao vai levar o relatorio colado (a categoria do evento
  // criado). So diferente de relatorioEscopo quando o acesso foi pelo PIN
  // Regional - ai a pessoa escolhe entre "Regional" (convocacao com varias
  // divisoes juntas) ou uma divisao especifica (convocacao so daquela
  // divisao, mesmo entrando pelo PIN Regional). Fora do Regional, e sempre
  // igual a relatorioEscopo (nao ha escolha).
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
  // Tipo escolhido na tela de colar (um de TIPOS_EVENTO) - quando marcado,
  // vence o palpite que o parser tenta tirar do titulo do texto colado.
  relatorioTipoEscolhido: null,
  relatorioIsAdmin: false,
  relatorioPinErro: null,
  relatorioPinVerificando: false,
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
  relatorioEventosExpandidos: new Set(),
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
