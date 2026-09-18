// Carrega da planilha para o state e redesenha. Nao decide nada de tela.

import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { emLotes } from '../nucleo/util.js';

// Usado nas telas do organizador, onde quem grava e uma pessoa so e um aviso
// direto resolve.
export async function salvarOuAvisar(action, params) {
  try {
    return await api(action, params);
  } catch (e) {
    alert('Não consegui salvar na planilha.\n\n' + e.message + '.\n\nVerifique sua conexão e tente de novo.');
    await loadInitial();
    return null;
  }
}

export async function loadInitial() {
  state.loading = true;
  state.loadError = null;
  render();
  try {
    const r = await api('dados');
    state.roster = r.membros || [];
    state.events = r.eventos || [];
  } catch (e) {
    state.loadError = e.message;
  }
  state.loading = false;
  render();
}

export async function loadEventStatus(eventId) {
  state.statusLoaded = false;
  state.statusError = null;
  render();
  try {
    const r = await api('presencas', { eventoId: eventId });
    if (state.currentEventId !== eventId) return;
    state.currentStatus = r.presencas || {};
    state.statusLoaded = true;
  } catch (e) {
    if (state.currentEventId !== eventId) return;
    state.statusError = e.message;
  }
  render();
}

// Publico, sem PIN - so calcula quando a pessoa pede (botao). Duas janelas:
// desde sempre ou ultimos 6 meses (as outras janelas, 1/3/12 meses, ficam
// so na planilha - ver PLANO-MULTI-DIVISAO.md). Mostra a % de cada divisao
// lado a lado, e a % de cada membro, agrupada por divisao e escondida ate
// abrir - mesmo padrao usado no evento regional.
export async function carregarRank() {
  state.rankLoading = true;
  state.rankError = null;
  render();
  try {
    const r = await api('rankPresenca', { janela: state.rankJanela });
    state.rankData = r.rank;
  } catch (e) {
    state.rankError = e.message;
  }
  state.rankLoading = false;
  render();
}

// Rank de Insights - publico, sem PIN, carrega sozinho ao abrir a tela (nao
// tem botao "calcular" como o Rank de Presenca, porque insightEstatisticas
// e leve o bastante pra nao precisar esperar o toque).
export async function carregarRankInsights() {
  state.insightRankLoading = true;
  state.insightRankError = null;
  state.insightRankTab = 'total';
  state.insightRankRodadaSelecionada = null;
  state.insightRankRodadaDivisoesExpandidas = new Set();
  render();
  try {
    const [stats, hist] = await Promise.all([
      api('insightEstatisticas'),
      api('insightRodadas'),
    ]);
    state.insightRankData = stats;
    // Ultimas rodadas (mesma acao usada pela lista "ULTIMAS RODADAS" do Modo
    // organizador) - so pra desenhar a tendencia no card "Rank Total de
    // Insights" (ver renderSparklineTendencia), nao precisa da lista de
    // membros de cada rodada aqui, so data+percentual.
    state.insightRodadasHistorico = hist.rodadas || [];
  } catch (e) {
    state.insightRankError = e.message;
  }
  state.insightRankLoading = false;
  render();
}

// Presencas de eventos que ainda VAO acontecer, pro aviso do menu do
// organizador. Diferente de loadReportData, que so busca o que falta e
// guarda pra sempre: aqui busca sempre de novo, porque o numero muda a cada
// integrante que responde e mostrar um numero velho seria pior que nao
// mostrar nada. Sao um ou dois eventos na janela, entao e barato.
//
// Falha de um evento nao apaga o que ja havia: sem presencas, quem desenha
// mostra "carregando", nao um numero errado.
export async function loadPresencasProximas(eventos) {
  if (!eventos.length) return;
  const results = await emLotes(eventos, 5, e => api('presencas', { eventoId: e.id }));
  eventos.forEach((e, i) => {
    if (results[i].status === 'fulfilled') state.reportData[e.id] = results[i].value.presencas || {};
  });
  render();
}

export async function loadReportData() {
  const encerrados = state.events.filter(e => e.status === 'encerrado');
  const missing = encerrados.filter(e => !(e.id in state.reportData));
  state.reportError = null;
  if (missing.length) {
    const results = await emLotes(missing, 5, e => api('presencas', { eventoId: e.id }));
    missing.forEach((e, i) => {
      // Um evento sem dado fica de fora de propósito: melhor mostrar traço do
      // que um relatorio dizendo que ninguem confirmou.
      if (results[i].status === 'fulfilled') state.reportData[e.id] = results[i].value.presencas || {};
      else state.reportError = results[i].reason.message;
    });
  }
  render();
}

// Sempre recarrega ao entrar na aba: e um numero que muda a cada evento
// encerrado, diferente do relatorio por evento que so busca o que falta.
export async function loadEstatisticas() {
  state.estatisticasLoading = true;
  state.estatisticasError = null;
  render();
  try {
    const r = await api('estatisticas', { categoria: state.adminEscopo });
    state.estatisticas = r.membros || [];
  } catch (e) {
    state.estatisticasError = e.message;
  }
  state.estatisticasLoading = false;
  render();
}

// Carrega as estatisticas (% de cada um + medias por divisao) e o historico
// curto de rodadas juntos. As marcacoes comecam tudo zerado (ninguem fez) -
// o administrador so marca quem fez, que costuma ser menos toque que marcar
// todo mundo e desmarcar quem faltou.
export async function loadInsightStats() {
  state.insightStatsLoading = true;
  state.insightStatsError = null;
  render();
  try {
    const [stats, hist] = await Promise.all([
      api('insightEstatisticas'),
      api('insightRodadas'),
    ]);
    state.insightStats = stats;
    state.insightRodadasHistorico = hist.rodadas || [];
    state.insightMarcacoes = {};
    stats.membros.forEach(m => { state.insightMarcacoes[m.id] = false; });
  } catch (e) {
    state.insightStatsError = e.message;
  }
  state.insightStatsLoading = false;
  render();
}
