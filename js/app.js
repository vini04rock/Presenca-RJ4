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
import { acoes as acoesRelatorios } from './telas/relatorios.js';
import { acoes as acoesAdmin } from './telas/admin.js';
import { acoes as acoesComuns } from './ui/comuns.js';
import { acoes as acoesGraficos } from './ui/graficos.js';
import { acoes as acoesHome } from './telas/home.js';
import { acoes as acoesEvento } from './telas/evento.js';
import { acoes as acoesRank } from './telas/rank.js';
import { acoes as acoesRankinsights } from './telas/rank-insights.js';
import { acoes as acoesPin } from './telas/pin.js';
import { acoes as acoesCalendario } from './telas/calendario.js';

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

// O mapa de acoes: cada area traz as suas, e aqui viram um dicionario so.
// Dois modulos nao podem registrar a mesma acao - a conferencia abaixo
// avisa na hora de carregar, em vez de uma sobrescrever a outra calada.
const ACOES = {};
for (const [area, mapa] of Object.entries({
  acoesRelatorios,
  acoesAdmin,
  acoesComuns,
  acoesGraficos,
  acoesHome,
  acoesEvento,
  acoesRank,
  acoesRankinsights,
  acoesPin,
  acoesCalendario,
})) {
  for (const nome of Object.keys(mapa)) {
    if (ACOES[nome]) throw new Error('Acao repetida em ' + area + ': ' + nome);
    ACOES[nome] = mapa[nome];
  }
}
ACOES['retry-load'] = async (id, target, action, e) => {
    return loadInitial();
};

document.getElementById('app').addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  const tratar = ACOES[action];
  if (!tratar) return;
  return tratar(id, target, action, e);
});

definirRender(render);
loadInitial();
