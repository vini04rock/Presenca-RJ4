// Acoes das rodadas de Insight: registrar, ajustar, excluir, remover membro.

import { loadInsightStats } from '../dados/carregar.js';
import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { dataISOdeBR, valorDoCampo } from '../nucleo/util.js';

export async function confirmarInsightRodada() {
  // Le o campo antes de travar o botao - so existe no DOM se "Registrar com
  // outra data" estiver aberto (ver blocoMarcacao); vazio = usa hoje, igual
  // sempre foi (nao muda nada pra quem nunca mexe nesse campo).
  const bruto = valorDoCampo('insight-data-field').trim();
  const dataEscolhida = bruto ? dataISOdeBR(bruto) : '';
  if (bruto && !dataEscolhida) {
    state.insightErro = `"${bruto}" não é uma data válida - escreva como 21/09/2026`;
    return render();
  }
  state.insightSalvando = true;
  state.insightErro = null;
  render();
  try {
    const params = { marcacoes: JSON.stringify(state.insightMarcacoes) };
    if (dataEscolhida) params.data = dataEscolhida;
    const r = await api('insightSalvar', params);
    state.insightResultado = { percentual: r.percentual, totalSim: r.totalSim, totalElegiveis: r.totalElegiveis };
    state.insightMostrarDataCustom = false;
    state.insightDataEscolhida = '';
    await loadInsightStats();
  } catch (e) {
    state.insightErro = e.message;
  }
  state.insightSalvando = false;
  render();
}

// Abre o modo de ajuste pra uma rodada ja registrada: reaproveita
// insightMarcacoes (mesmo campo usado pra marcar uma rodada nova), so que
// pre-preenchido com o "Fez"/"Nao" que a rodada ja tinha, em vez de comecar
// tudo zerado.
export function iniciarAjusteInsightRodada(id) {
  const r = (state.insightRodadasHistorico || []).find(x => x.id === id);
  if (!r) return;
  state.insightEditandoRodadaId = id;
  state.insightMarcacoes = {};
  state.insightAjusteInfo = {};
  (r.membros || []).forEach(m => {
    state.insightMarcacoes[m.id] = m.fez;
    state.insightAjusteInfo[m.id] = { nome: m.nome, divisao: m.divisao };
  });
  state.insightAjusteMembroIds = (r.membros || []).map(m => m.id);
  state.insightAjusteMostrarAdicionar = false;
  state.insightAjusteDivisoesExpandidas = new Set();
  state.insightResultado = null;
  state.insightErro = null;
  render();
}

export function cancelarAjusteInsightRodada() {
  state.insightEditandoRodadaId = null;
  state.insightAjusteMembroIds = [];
  state.insightAjusteInfo = {};
  state.insightAjusteMostrarAdicionar = false;
  state.insightAjusteDivisoesExpandidas = new Set();
  state.insightMarcacoes = {};
  (state.insightStats ? state.insightStats.membros : []).forEach(m => { state.insightMarcacoes[m.id] = false; });
  render();
}

export async function salvarAjusteInsightRodada() {
  // Mesma trava do Code.gs (ajustarInsightRodada) - checa aqui tambem pra
  // nem gastar uma ida ao servidor com um ajuste que ia falhar de qualquer
  // jeito.
  if (!state.insightAjusteMembroIds.length) {
    state.insightErro = 'A rodada precisa ficar com pelo menos 1 integrante.';
    return render();
  }
  const id = state.insightEditandoRodadaId;
  state.insightSalvando = true;
  state.insightErro = null;
  render();
  try {
    const r = await api('insightRodadaAjustar', {
      id,
      marcacoes: JSON.stringify(state.insightMarcacoes),
      membroIds: state.insightAjusteMembroIds.join(',')
    });
    state.insightResultado = { ajuste: true, percentual: r.percentual, totalSim: r.totalSim, totalElegiveis: r.totalElegiveis };
    state.insightEditandoRodadaId = null;
    state.insightAjusteMembroIds = [];
    state.insightAjusteInfo = {};
    state.insightAjusteMostrarAdicionar = false;
    state.insightAjusteDivisoesExpandidas = new Set();
    await loadInsightStats();
  } catch (e) {
    state.insightErro = e.message;
  }
  state.insightSalvando = false;
  render();
}

export async function excluirInsightRodada(id) {
  state.insightConfirmDeleteRodadaId = null;
  try {
    await api('insightRodadaRemover', { id });
    await loadInsightStats();
  } catch (e) {
    state.insightErro = e.message;
    render();
  }
}

export async function removerMembroInsight(id) {
  try {
    await api('insightMembroRemover', { id });
    await loadInsightStats();
  } catch (e) {
    state.insightErro = e.message;
    render();
  }
}

export async function reincluirMembroInsight(id) {
  try {
    await api('insightMembroReincluir', { id });
    await loadInsightStats();
  } catch (e) {
    state.insightErro = e.message;
    render();
  }
}
