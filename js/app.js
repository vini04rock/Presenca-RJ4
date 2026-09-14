// Ponto de entrada: monta o roteador de telas, liga os ouvintes de
// clique/digitacao e faz a primeira carga.

import { carregarRank, carregarRankInsights, loadEstatisticas, loadEventStatus, loadInitial, loadInsightStats, loadReportData, salvarOuAvisar } from './dados/carregar.js';
import { eventosCalendarioVisiveis, membrosElegiveisCalendario, membrosElegiveisEvento, parseTextoOrganizarCalendario } from './dominio/estatisticas.js';
import { gravarAgora, paramsDeEvento, setMemberStatus } from './fila/presenca.js';
import { analisarConvocacao, confirmarEventoParseado, iniciarCorrecaoConvocacao } from './fluxos/convocacao.js';
import { openEvent } from './fluxos/evento.js';
import { cancelarAjusteInsightRodada, confirmarInsightRodada, excluirInsightRodada, iniciarAjusteInsightRodada, reincluirMembroInsight, removerMembroInsight, salvarAjusteInsightRodada } from './fluxos/insights.js';
import { copyInsightReportToClipboard, copyReportToClipboard, exportarRelatorioPdfAdmin, gerarRelatorio } from './fluxos/relatorio.js';
import { apiPost } from './nucleo/api.js';
import { TIPOS_EVENTO_TABS_ORDEM, escopoPorChave } from './nucleo/config.js';
import { genId, getMemberStatus, state } from './nucleo/estado.js';
import { LOGO_SRC } from './nucleo/imagens.js';
import { definirRender } from './nucleo/render.js';
import { escapeHtml } from './nucleo/util.js';
import { renderAdmin } from './telas/admin.js';
import { checkCalendarioPin, renderCalendario, renderCalendarioDivisoes } from './telas/calendario.js';
import { renderConfirmados, renderEvent } from './telas/evento.js';
import { renderHome } from './telas/home.js';
import { checkPin, checkRelatorioPin, renderDivisoes, renderPin, renderRelatorioDivisoes, renderRelatorioPin } from './telas/pin.js';
import { renderRankInsights } from './telas/rank-insights.js';
import { renderRank } from './telas/rank.js';
import { renderRelatorioShell } from './telas/relatorios.js';

function render() {
  const app = document.getElementById('app');
  if (state.loading) {
    app.innerHTML = '<div class="loading">Carregando…</div>';
    return;
  }
  if (state.loadError) {
    app.innerHTML = `
      <div class="crest-wrap">
        <img src="${LOGO_SRC}" alt="Insanos MC Brasil">
      </div>
      <div class="alert">
        <div class="alert-title">Não consegui carregar os dados</div>
        <div class="alert-msg">${escapeHtml(state.loadError)}.<br>Verifique sua conexão e tente de novo.</div>
      </div>
      <button class="btn block" data-action="retry-load">Tentar de novo</button>
    `;
    return;
  }
  if (state.view === 'home') return renderHome(app);
  if (state.view === 'event') return renderEvent(app);
  if (state.view === 'confirmados') return renderConfirmados(app);
  if (state.view === 'rank') return renderRank(app);
  if (state.view === 'rank-insights') return renderRankInsights(app);
  if (state.view === 'admin-divisoes') return renderDivisoes(app);
  if (state.view === 'admin-pin') return renderPin(app);
  if (state.view === 'admin') return renderAdmin(app);
  if (state.view === 'relatorio-divisoes') return renderRelatorioDivisoes(app);
  if (state.view === 'relatorio-pin') return renderRelatorioPin(app);
  if (state.view === 'relatorio') return renderRelatorioShell(app);
  if (state.view === 'calendario-divisoes') return renderCalendarioDivisoes(app);
  if (state.view === 'calendario') return renderCalendario(app);
}

document.getElementById('app').addEventListener('input', (e) => {
  if (e.target.id === 'new-member-nome') {
    state.newMemberNome = e.target.value;
  }
  if (e.target.id === 'relatorio-texto-field') {
    state.relatorioTextoBruto = e.target.value;
  }
  if (e.target.id === 'relatorio-filtro-data-inicio') {
    state.relatorioFiltroDataInicio = e.target.value;
    return render();
  }
  if (e.target.id === 'relatorio-filtro-data-fim') {
    state.relatorioFiltroDataFim = e.target.value;
    return render();
  }
  if (e.target.dataset && e.target.dataset.action === 'resolver-membro') {
    const i = Number(e.target.dataset.index);
    const row = state.relatorioParsed.membrosParsed[i];
    row.membroId = e.target.value || null;
    row.sugestoes = [];
    render();
  }
});

document.getElementById('app').addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === 'retry-load') return loadInitial();
  if (action === 'retry-report') return loadReportData();
  if (action === 'retry-estatisticas') return loadEstatisticas();
  if (action === 'toggle-relatorio-estatisticas-divisao') {
    const chave = target.dataset.value;
    if (state.relatorioEstatisticasExpandidas.has(chave)) state.relatorioEstatisticasExpandidas.delete(chave);
    else state.relatorioEstatisticasExpandidas.add(chave);
    return render();
  }
  if (action === 'abrir-ficha-membro') { state.relatorioMembroFichaId = id; return render(); }
  if (action === 'fechar-ficha-membro') { state.relatorioMembroFichaId = null; return render(); }
  if (action === 'toggle-relatorio-eventos-divisao') {
    const chave = target.dataset.value;
    if (state.relatorioEventosExpandidos.has(chave)) state.relatorioEventosExpandidos.delete(chave);
    else state.relatorioEventosExpandidos.add(chave);
    return render();
  }
  if (action === 'set-relatorio-periodo-tipo') {
    state.relatorioPeriodoPorGrafico[target.dataset.chave] = Number(target.dataset.value);
    return render();
  }
  if (action === 'abrir-relatorio-tipo-detalhe') {
    state.relatorioTipoDetalhe = target.dataset.value;
    return render();
  }
  if (action === 'set-relatorio-filtro-divisao') {
    state.relatorioFiltroDivisao = target.dataset.value;
    state.relatorioTipoDetalhe = null;
    return render();
  }
  if (action === 'limpar-relatorio-filtro-periodo') {
    state.relatorioFiltroDataInicio = '';
    state.relatorioFiltroDataFim = '';
    return render();
  }
  if (action === 'fechar-relatorio-tipo-detalhe') {
    state.relatorioTipoDetalhe = null;
    return render();
  }
  if (action === 'retry-relatorio-eventos') return loadReportData();
  if (action === 'imprimir-relatorio') { window.print(); return; }
  if (action === 'retry-insight-stats') return loadInsightStats();
  if (action === 'retry-save') return gravarAgora();
  if (action === 'gerar-relatorio') return gerarRelatorio();
  if (action === 'exportar-relatorio-pdf-admin') return exportarRelatorioPdfAdmin();
  if (action === 'ask-delete-event') { state.confirmDeleteId = id; return render(); }
  if (action === 'cancel-delete-event') { state.confirmDeleteId = null; return render(); }
  if (action === 'retry-status') return loadEventStatus(state.currentEventId);
  if (action === 'open-event') {
    // Guarda de onde a pessoa veio (Relatorios/Modo organizador/tela
    // inicial) pra "‹ Todos os eventos" voltar pro mesmo lugar, em vez de
    // sempre cair na tela inicial - ver "voltar-do-evento".
    state.eventoVoltarPara = { view: state.view, relatorioTab: state.relatorioTab, adminTab: state.adminTab };
    return openEvent(id);
  }
  if (action === 'go-home') { state.view = 'home'; state.isAdmin = false; state.adminEscopo = null; return render(); }
  if (action === 'voltar-do-evento') {
    const origem = state.eventoVoltarPara;
    if (origem && origem.view === 'relatorio' && state.relatorioIsAdmin) {
      state.view = 'relatorio';
      state.relatorioTab = origem.relatorioTab || 'eventos';
    } else if (origem && origem.view === 'admin' && state.isAdmin) {
      state.view = 'admin';
      state.adminTab = origem.adminTab || 'eventos';
    } else {
      state.view = 'home';
      state.isAdmin = false;
      state.adminEscopo = null;
    }
    return render();
  }
  if (action === 'abrir-home-eventos') { state.homeEventosAberto = true; return render(); }
  if (action === 'fechar-home-eventos') { state.homeEventosAberto = false; state.homeEscopo = null; state.homeTipo = null; return render(); }
  if (action === 'select-home-escopo') { state.homeEscopo = target.dataset.value; state.homeTipo = null; return render(); }
  if (action === 'go-home-escolha') { state.homeEscopo = null; state.homeTipo = null; state.view = 'home'; return render(); }
  if (action === 'select-home-tipo') { state.homeTipo = target.dataset.value; return render(); }
  if (action === 'go-home-tipos') { state.homeTipo = null; return render(); }
  if (action === 'go-rank') { state.view = 'rank'; return render(); }
  if (action === 'calcular-rank') return carregarRank();
  if (action === 'set-rank-janela') {
    state.rankJanela = target.dataset.value;
    // Se ja tinha calculado antes, recalcula na hora pra nova janela -
    // senao so troca a selecao, esperando o toque em "Calcular rank".
    return state.rankData ? carregarRank() : render();
  }
  if (action === 'toggle-rank-divisao') {
    const chave = target.dataset.value;
    if (state.rankExpandedDivisoes.has(chave)) state.rankExpandedDivisoes.delete(chave);
    else state.rankExpandedDivisoes.add(chave);
    return render();
  }
  if (action === 'go-rank-insights') {
    state.view = 'rank-insights';
    return carregarRankInsights();
  }
  if (action === 'toggle-insight-rank-divisao') {
    const chave = target.dataset.value;
    if (state.insightRankExpandedDivisoes.has(chave)) state.insightRankExpandedDivisoes.delete(chave);
    else state.insightRankExpandedDivisoes.add(chave);
    return render();
  }
  if (action === 'set-insight-rank-tab') {
    state.insightRankTab = target.dataset.value;
    return render();
  }
  if (action === 'select-insight-rank-rodada') {
    const id = target.dataset.id;
    state.insightRankRodadaSelecionada = state.insightRankRodadaSelecionada === id ? null : id;
    // Toda vez que a rodada aberta muda, fecha as divisoes que estavam
    // abertas na rodada anterior - senao "Barra" continuaria aberta ao
    // trocar pra outra rodada, sem relacao com o que a pessoa pediu ali.
    state.insightRankRodadaDivisoesExpandidas = new Set();
    return render();
  }
  if (action === 'toggle-insight-rank-rodada-divisao') {
    const chave = target.dataset.value;
    if (state.insightRankRodadaDivisoesExpandidas.has(chave)) state.insightRankRodadaDivisoesExpandidas.delete(chave);
    else state.insightRankRodadaDivisoesExpandidas.add(chave);
    return render();
  }
  if (action === 'go-divisoes') { state.view = 'admin-divisoes'; return render(); }
  if (action === 'select-divisao') {
    state.adminEscopo = target.dataset.value;
    state.view = 'admin-pin';
    state.pinErro = null;
    return render();
  }
  if (action === 'check-pin') return checkPin();
  if (action === 'go-relatorio-divisoes') {
    state.view = 'relatorio-divisoes';
    state.relatorioTextoBruto = '';
    state.relatorioParsed = null;
    state.relatorioSalvarErro = null;
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    state.relatorioEditandoEventoId = null;
    state.relatorioTab = 'resumo';
    state.relatorioColarStep = 'texto';
    state.relatorioCategoriaAlvo = null;
    state.relatorioTipoEscolhido = null;
    state.relatorioTipoDetalhe = null;
    state.relatorioFiltroDivisao = 'todas';
    state.relatorioFiltroDataInicio = '';
    state.relatorioFiltroDataFim = '';
    state.relatorioEstatisticasExpandidas = new Set();
    state.relatorioEventosExpandidos = new Set();
    state.relatorioMembroFichaId = null;
    return render();
  }
  if (action === 'go-calendario-divisoes') {
    state.view = 'calendario-divisoes';
    state.calendarioEscopo = null;
    state.calendarioOrganizarEtapa = null;
    state.calendarioPinErro = null;
    state.calendarioMarcarAviso = null;
    return render();
  }
  if (action === 'select-calendario-escopo') {
    state.calendarioEscopo = target.dataset.value;
    state.view = 'calendario';
    return render();
  }
  if (action === 'calendario-mes-anterior') {
    state.calendarioMes--;
    if (state.calendarioMes < 0) { state.calendarioMes = 11; state.calendarioAno--; }
    return render();
  }
  if (action === 'calendario-mes-seguinte') {
    state.calendarioMes++;
    if (state.calendarioMes > 11) { state.calendarioMes = 0; state.calendarioAno++; }
    return render();
  }
  if (action === 'abrir-calendario-organizar') {
    state.calendarioOrganizarEtapa = 'pin';
    state.calendarioPinErro = null;
    state.calendarioOrganizarTextoValor = '';
    state.calendarioOrganizarTextoErro = null;
    state.calendarioOrganizarErroSalvar = null;
    state.calendarioOrganizarSubTab = 'adicionar';
    state.calendarioEditandoData = null;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  }
  if (action === 'fechar-calendario-organizar') {
    state.calendarioOrganizarEtapa = null;
    state.calendarioOrganizarTextoValor = '';
    state.calendarioOrganizarTextoErro = null;
    state.calendarioOrganizarErroSalvar = null;
    state.calendarioEditandoData = null;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  }
  if (action === 'check-calendario-pin') return checkCalendarioPin();
  if (action === 'marcar-calendario-texto') {
    if (state.calendarioSalvando) return;
    const texto = document.getElementById('calendario-organizar-texto').value;
    if (!texto.trim()) return;
    const { marcacoes, naoReconhecidas } = parseTextoOrganizarCalendario(texto, state.calendarioAno);
    // Tudo ou nada: uma linha so que nao seja reconhecida ja trava a marcacao
    // inteira - sem isso, um typo numa linha fazia o resto entrar quieto e a
    // linha ruim sumir sem ninguem perceber que faltou marcar aquele dia.
    if (naoReconhecidas.length) {
      state.calendarioOrganizarTextoValor = texto;
      state.calendarioOrganizarTextoErro = naoReconhecidas;
      return render();
    }
    // Nao duplica se a mesma data ja tiver um evento criado por esse mesmo
    // escopo (ex: colar o mesmo texto duas vezes sem querer).
    const existentes = new Set(
      eventosCalendarioVisiveis(state.calendarioEscopo)
        .filter(ev => ev.categoria === state.calendarioEscopo)
        .map(ev => ev.data)
    );
    const novos = Object.entries(marcacoes).filter(([data]) => !existentes.has(data));
    const duplicados = Object.keys(marcacoes).length - novos.length;
    if (!novos.length) {
      state.calendarioMarcarAviso = `⚠️ ${duplicados === 1 ? 'Essa data já tinha' : 'Essas datas já tinham'} evento marcado - nada novo foi criado.`;
      state.calendarioOrganizarEtapa = null;
      state.calendarioOrganizarTextoValor = '';
      state.calendarioOrganizarTextoErro = null;
      return render();
    }

    state.calendarioSalvando = true;
    state.calendarioOrganizarErroSalvar = null;
    render();
    try {
      const membroIds = membrosElegiveisCalendario(state.calendarioEscopo).map(m => m.id);
      await apiPost('criarEventosDeCalendario', {
        categoria: state.calendarioEscopo,
        membroIds,
        eventos: novos.map(([data, tipo]) => ({ data, tipo }))
      });
      await loadInitial();
      state.calendarioMarcarAviso = `✅ ${novos.length} ${novos.length === 1 ? 'evento criado' : 'eventos criados'} no calendário.` +
        (duplicados ? ` (${duplicados} ${duplicados === 1 ? 'já existia e foi mantido' : 'já existiam e foram mantidos'} sem duplicar)` : '');
      state.calendarioOrganizarEtapa = null;
      state.calendarioOrganizarTextoValor = '';
      state.calendarioOrganizarTextoErro = null;
    } catch (e) {
      // Mantem o texto colado (senao a pessoa perde tudo e tem que colar de
      // novo) e mostra o erro na propria tela do Adicionar, nao so no aviso
      // do calendario - que so aparece depois de sair desta tela, e sem
      // sucesso a gente nunca sai dela.
      state.calendarioOrganizarTextoValor = texto;
      state.calendarioOrganizarErroSalvar = e.message;
    }
    state.calendarioSalvando = false;
    return render();
  }
  if (action === 'calendario-organizar-subtab') {
    state.calendarioOrganizarSubTab = target.dataset.tab;
    state.calendarioEditandoData = null;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  }
  if (action === 'calendario-editar-selecionar-dia') {
    state.calendarioEditandoData = state.calendarioEditandoData === target.dataset.value ? null : target.dataset.value;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  }
  if (action === 'calendario-editar-abrir-ajuste') {
    state.calendarioAjustandoData = true;
    return render();
  }
  if (action === 'calendario-editar-cancelar-ajuste') {
    state.calendarioAjustandoData = false;
    return render();
  }
  if (action === 'calendario-editar-pedir-exclusao') {
    state.calendarioConfirmandoExclusao = true;
    return render();
  }
  if (action === 'calendario-editar-cancelar-exclusao') {
    state.calendarioConfirmandoExclusao = false;
    return render();
  }
  if (action === 'calendario-editar-excluir') {
    state.events = state.events.filter(ev => ev.id !== id);
    state.calendarioEditandoData = null;
    state.calendarioConfirmandoExclusao = false;
    render();
    await salvarOuAvisar('eventoRemover', { id });
    return;
  }
  if (action === 'calendario-editar-confirmar-data') {
    const novaData = document.getElementById('calendario-editar-data-field').value;
    if (!novaData) return;
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    state.events = state.events.map(e => e.id === id ? { ...e, data: novaData } : e);
    // Pula direto pro mes/ano da nova data, pra ja mostrar o quadrado certo
    // sem precisar navegar manualmente ate lá.
    const [ano, mes] = novaData.split('-').map(Number);
    state.calendarioAno = ano;
    state.calendarioMes = mes - 1;
    state.calendarioEditandoData = novaData;
    state.calendarioAjustandoData = false;
    render();
    await salvarOuAvisar('eventoSalvar', paramsDeEvento({ ...ev, data: novaData }));
    return;
  }
  if (action === 'select-relatorio-divisao') {
    state.relatorioEscopo = target.dataset.value;
    // Padrao: a categoria alvo comeca igual ao escopo escolhido (Regional ->
    // "Regional", Barra -> "Barra") - so muda se a pessoa clicar num botao
    // de divisao especifica na tela de colar, ver "set-relatorio-categoria".
    state.relatorioCategoriaAlvo = target.dataset.value;
    state.view = 'relatorio-pin';
    state.relatorioPinErro = null;
    return render();
  }
  if (action === 'set-relatorio-categoria') {
    state.relatorioCategoriaAlvo = target.dataset.value;
    return render();
  }
  if (action === 'set-revisao-tipo') {
    state.relatorioParsed.evento.tipo = state.relatorioParsed.evento.tipo === target.dataset.value ? '' : target.dataset.value;
    return render();
  }
  if (action === 'set-relatorio-tipo') {
    state.relatorioTipoEscolhido = state.relatorioTipoEscolhido === target.dataset.value ? null : target.dataset.value;
    return render();
  }
  if (action === 'check-relatorio-pin') return checkRelatorioPin();
  if (action === 'relatorio-tab') {
    state.relatorioTab = target.dataset.tab;
    render();
    // Eventos, Resumo e as 4 abas de tipo dependem dos dados por evento -
    // sem isso quem for direto numa dessas abas (sem passar por outra que
    // ja carregou) fica com "Carregando…" pra sempre, ja que nada mais
    // dispara essa busca.
    const precisaReportData = ['eventos', 'resumo', ...TIPOS_EVENTO_TABS_ORDEM].includes(target.dataset.tab);
    if (precisaReportData) await loadReportData();
    return;
  }
  if (action === 'go-relatorio-texto') {
    state.relatorioColarStep = 'texto';
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    return render();
  }
  if (action === 'analisar-convocacao') return analisarConvocacao();
  if (action === 'aceitar-sugestao') {
    const row = state.relatorioParsed.membrosParsed[Number(target.dataset.index)];
    row.membroId = target.dataset.id;
    row.sugestoes = [];
    return render();
  }
  if (action === 'ignorar-membro-parseado') {
    state.relatorioParsed.membrosParsed[Number(target.dataset.index)].ignorado = true;
    return render();
  }
  if (action === 'reincluir-membro-parseado') {
    state.relatorioParsed.membrosParsed[Number(target.dataset.index)].ignorado = false;
    return render();
  }
  if (action === 'confirmar-evento-parseado') return confirmarEventoParseado();
  if (action === 'cancelar-duplicidade-relatorio') { state.relatorioDuplicidadeAviso = null; return render(); }
  if (action === 'confirmar-duplicidade-relatorio') {
    state.relatorioDuplicidadeConfirmada = true;
    return confirmarEventoParseado();
  }
  if (action === 'nova-convocacao') {
    state.relatorioTextoBruto = '';
    state.relatorioParsed = null;
    state.relatorioSalvarErro = null;
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    state.relatorioEditandoEventoId = null;
    state.relatorioColarStep = 'texto';
    return render();
  }
  if (action === 'corrigir-convocacao') return iniciarCorrecaoConvocacao(id);
  if (action === 'toggle-texto-original') {
    if (state.relatorioTextoOriginalExpandido.has(id)) state.relatorioTextoOriginalExpandido.delete(id);
    else state.relatorioTextoOriginalExpandido.add(id);
    return render();
  }
  if (action === 'ignore-click') return;
  if (action === 'cancelar-correcao-convocacao') {
    state.relatorioEditandoEventoId = null;
    state.relatorioCategoriaAlvo = null;
    state.relatorioTipoEscolhido = null;
    state.relatorioTextoBruto = '';
    return render();
  }
  if (action === 'admin-tab') {
    state.adminTab = target.dataset.tab;
    state.newEventSelected = null;
    state.editingEventId = null;
    state.confirmDeleteId = null;
    state.editingMemberId = null;
    state.newMemberNome = '';
    state.newMemberGrau = null;
    state.newMemberFuncoes = new Set();
    state.insightConfirmDeleteRodadaId = null;
    state.insightResultado = null;
    state.insightMostrarExcluidos = false;
    render();
    if (target.dataset.tab === 'relatorio') await loadReportData();
    if (target.dataset.tab === 'presencas') await loadEstatisticas();
    if (target.dataset.tab === 'insights') await loadInsightStats();
    return;
  }
  if (action === 'toggle-insight-marca') {
    state.insightMarcacoes[id] = !state.insightMarcacoes[id];
    return render();
  }
  if (action === 'toggle-insight-divisao-grupo') {
    const chave = target.dataset.value;
    if (state.insightExpandedDivisoes.has(chave)) state.insightExpandedDivisoes.delete(chave);
    else state.insightExpandedDivisoes.add(chave);
    return render();
  }
  if (action === 'confirmar-insight-rodada') return confirmarInsightRodada();
  if (action === 'ajustar-insight-rodada') return iniciarAjusteInsightRodada(target.dataset.id);
  if (action === 'salvar-ajuste-insight-rodada') return salvarAjusteInsightRodada();
  if (action === 'cancelar-ajuste-insight-rodada') return cancelarAjusteInsightRodada();
  if (action === 'ajuste-rodada-remover-membro') {
    const mid = target.dataset.id;
    state.insightAjusteMembroIds = state.insightAjusteMembroIds.filter(x => x !== mid);
    delete state.insightMarcacoes[mid];
    return render();
  }
  if (action === 'ajuste-rodada-adicionar-membro') {
    const mid = target.dataset.id;
    if (!state.insightAjusteMembroIds.includes(mid)) {
      state.insightAjusteMembroIds.push(mid);
      const m = (state.insightStats ? state.insightStats.membros : []).find(x => x.id === mid);
      if (m) state.insightAjusteInfo[mid] = { nome: m.nome, divisao: m.divisao };
      // Comeca como "nao fez" - o organizador toca pra marcar se for o caso,
      // igual a qualquer integrante que ja estivesse na rodada.
      state.insightMarcacoes[mid] = false;
    }
    return render();
  }
  if (action === 'toggle-ajuste-rodada-adicionar') {
    state.insightAjusteMostrarAdicionar = !state.insightAjusteMostrarAdicionar;
    return render();
  }
  if (action === 'toggle-ajuste-rodada-divisao') {
    const chave = target.dataset.value;
    if (state.insightAjusteDivisoesExpandidas.has(chave)) state.insightAjusteDivisoesExpandidas.delete(chave);
    else state.insightAjusteDivisoesExpandidas.add(chave);
    return render();
  }
  if (action === 'toggle-insight-data-custom') {
    state.insightMostrarDataCustom = !state.insightMostrarDataCustom;
    if (!state.insightMostrarDataCustom) state.insightDataEscolhida = '';
    return render();
  }
  if (action === 'ask-delete-insight-rodada') { state.insightConfirmDeleteRodadaId = id; return render(); }
  if (action === 'cancel-delete-insight-rodada') { state.insightConfirmDeleteRodadaId = null; return render(); }
  if (action === 'delete-insight-rodada') return excluirInsightRodada(id);
  if (action === 'insight-remover-membro') return removerMembroInsight(id);
  if (action === 'insight-reincluir-membro') return reincluirMembroInsight(id);
  if (action === 'toggle-insight-excluidos') { state.insightMostrarExcluidos = !state.insightMostrarExcluidos; return render(); }
  if (action === 'toggle-report-event') {
    state.expandedReportEventId = state.expandedReportEventId === id ? null : id;
    return render();
  }
  if (action === 'copy-report') {
    const ev = state.events.find(e => e.id === id);
    if (ev) await copyReportToClipboard(ev);
    return;
  }
  if (action === 'copy-insight-report') {
    const r = (state.insightRodadasHistorico || []).find(x => x.id === id);
    if (r) await copyInsightReportToClipboard(r);
    return;
  }

  if (action === 'toggle-member') {
    state.expandedMemberId = state.expandedMemberId === id ? null : id;
    return render();
  }
  if (action === 'toggle-confirmados') { state.view = 'confirmados'; return render(); }
  if (action === 'close-confirmados') { state.view = 'event'; return render(); }
  if (action === 'toggle-divisao-grupo') {
    const nome = target.dataset.value;
    if (state.expandedDivisoes.has(nome)) state.expandedDivisoes.delete(nome);
    else state.expandedDivisoes.add(nome);
    return render();
  }
  if (action === 'set-status') return setMemberStatus(id, { status: target.dataset.status });
  if (action === 'toggle-direto') {
    const cur = getMemberStatus(id);
    return setMemberStatus(id, { direto: !cur.direto });
  }
  if (action === 'toggle-destacado') {
    const cur = getMemberStatus(id);
    return setMemberStatus(id, { destacado: !cur.destacado });
  }
  if (action === 'toggle-acompanhado') {
    const cur = getMemberStatus(id);
    return setMemberStatus(id, { acompanhado: !cur.acompanhado });
  }

  if (action === 'pick-grau') {
    state.newMemberGrau = state.newMemberGrau === target.dataset.value ? null : target.dataset.value;
    return render();
  }
  if (action === 'toggle-funcao') {
    const chave = target.dataset.value;
    if (state.newMemberFuncoes.has(chave)) state.newMemberFuncoes.delete(chave);
    else state.newMemberFuncoes.add(chave);
    return render();
  }
  if (action === 'add-member') {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    // O membro herda a divisao de onde o organizador entrou - inclusive
    // Regional, que tem os proprios membros (mesa regional).
    const member = {
      id: genId(), nome, grau: state.newMemberGrau || '', divisao: escopoPorChave(state.adminEscopo).nome,
      funcoes: Array.from(state.newMemberFuncoes)
    };
    state.roster = [...state.roster, member];
    state.newMemberGrau = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  }
  if (action === 'edit-member') {
    const m = state.roster.find(x => x.id === id);
    if (!m) return;
    state.editingMemberId = id;
    state.newMemberNome = m.nome;
    state.newMemberGrau = m.grau || null;
    state.newMemberFuncoes = new Set(m.funcoes || []);
    return render();
  }
  if (action === 'cancel-member-edit') {
    state.editingMemberId = null;
    state.newMemberNome = '';
    state.newMemberGrau = null;
    state.newMemberFuncoes = new Set();
    return render();
  }
  if (action === 'save-member-edit') {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    const original = state.roster.find(x => x.id === state.editingMemberId);
    if (!original) return;
    // Divisao nao muda por aqui - so nome, grau e funcoes.
    const member = {
      ...original, nome, grau: state.newMemberGrau || '',
      funcoes: Array.from(state.newMemberFuncoes)
    };
    state.roster = state.roster.map(x => x.id === member.id ? member : x);
    state.editingMemberId = null;
    state.newMemberGrau = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  }
  if (action === 'remove-member') {
    state.roster = state.roster.filter(m => m.id !== id);
    render();
    await salvarOuAvisar('membroRemover', { id });
  }

  if (action === 'start-new-event') {
    state.newEventSelected = new Set(membrosElegiveisEvento().map(m => m.id));
    state.editingEventId = null;
    state.newEventTipo = null;
    return render();
  }
  if (action === 'start-edit-event') {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    state.editingEventId = id;
    state.newEventSelected = new Set(ev.memberIds);
    state.newEventTipo = ev.tipo || null;
    return render();
  }
  if (action === 'cancel-new-event') {
    state.newEventSelected = null;
    state.editingEventId = null;
    state.newEventTipo = null;
    return render();
  }
  if (action === 'marcar-todos-membros' || action === 'desmarcar-todos-membros') {
    // Mexe direto nos checkboxes, sem re-renderizar - o estado deles so e
    // lido de verdade na hora de salvar (ver save-new-event).
    const ligar = action === 'marcar-todos-membros';
    document.querySelectorAll('.new-event-checkbox').forEach(c => { c.checked = ligar; });
    return;
  }
  if (action === 'pick-tipo-evento') {
    state.newEventTipo = state.newEventTipo === target.dataset.value ? null : target.dataset.value;
    return render();
  }
  if (action === 'save-new-event') {
    const nome = document.getElementById('new-event-name').value.trim();
    const data = document.getElementById('new-event-data').value;
    const horario = document.getElementById('new-event-horario').value;
    const endereco = document.getElementById('new-event-endereco').value.trim();
    const outros = document.getElementById('new-event-outros').value.trim();
    const checked = Array.from(document.querySelectorAll('.new-event-checkbox:checked')).map(c => c.dataset.id);
    if (!nome || checked.length === 0) return;
    const evento = {
      id: state.editingEventId || genId(),
      nome, memberIds: checked, data, horario, endereco, outros,
      tipo: state.newEventTipo || '',
      // A categoria vem de qual botao o organizador entrou (Barra ou
      // Regional), nao de uma escolha manual no formulario.
      categoria: state.adminEscopo,
      status: state.editingEventId
        ? (state.events.find(e => e.id === state.editingEventId) || {}).status || 'ativo'
        : 'ativo'
    };
    state.events = state.editingEventId
      ? state.events.map(ev => ev.id === evento.id ? { ...ev, ...evento } : ev)
      : [...state.events, evento];
    state.newEventSelected = null;
    state.editingEventId = null;
    state.newEventTipo = null;
    render();
    await salvarOuAvisar('eventoSalvar', paramsDeEvento(evento));
  }
  if (action === 'toggle-event-status') {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    const novoStatus = ev.status === 'encerrado' ? 'ativo' : 'encerrado';
    state.events = state.events.map(e => e.id === id ? { ...e, status: novoStatus } : e);
    render();
    await salvarOuAvisar('eventoSalvar', paramsDeEvento({ ...ev, status: novoStatus }));
  }
  if (action === 'delete-event') {
    state.events = state.events.filter(ev => ev.id !== id);
    state.confirmDeleteId = null;
    delete state.reportData[id];
    if (state.expandedReportEventId === id) state.expandedReportEventId = null;
    render();
    await salvarOuAvisar('eventoRemover', { id });
  }
});

definirRender(render);
loadInitial();
