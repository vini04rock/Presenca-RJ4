// Acoes que gravam na planilha nas secoes Doacoes e Caixinha: salvar as
// doacoes de um evento, lancar/corrigir um mes da caixinha e excluir um mes.
//
// Cada uma grava e busca tudo de novo em seguida, igual ao Insight: o rank
// e as listas sao contas em cima do que a planilha tem, e reler e o jeito
// mais simples de garantir que a tela mostra o que ficou gravado.

import { carregarCaixinha, carregarDoacoes } from '../dados/carregar.js';
import { nomeDoMes } from '../dominio/caixinha.js';
import { formatKg } from '../dominio/doacoes.js';
import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { mostrarAviso } from '../nucleo/util.js';

export async function salvarDoacoes() {
  const eventoId = state.doacoesEventoId;
  if (!eventoId) return;
  state.doacoesSalvando = true;
  render();
  try {
    const r = await api('doacoesSalvar', { eventoId, kgs: JSON.stringify(state.doacoesMarcacoes) });
    const ev = ((state.doacoesDados && state.doacoesDados.eventos) || []).find(e => e.id === eventoId);
    state.doacoesMsg = { ok: true, texto: `✅ ${ev ? ev.nome : 'Evento'}: ${r.doadores} ${r.doadores === 1 ? 'integrante levou' : 'integrantes levaram'} ${formatKg(r.totalKg)}.` };
    state.doacoesEventoId = null;
    state.doacoesMarcacoes = {};
    mostrarAviso('🥫 Doações salvas');
    state.doacoesSalvando = false;
    return carregarDoacoes();
  } catch (e) {
    // A marcacao fica na tela: a pessoa tenta de novo sem refazer nada.
    state.doacoesMsg = { ok: false, texto: 'Não consegui salvar: ' + e.message + '.' };
  }
  state.doacoesSalvando = false;
  render();
}

export async function salvarCaixinha() {
  const mes = state.caixinhaMes;
  if (!mes) return;
  // A mesma trava do Code.gs (salvarCaixinhaMes): sem ninguem na lista, o mes
  // nao tem o que guardar.
  if (!state.caixinhaMembroIds.length) {
    state.caixinhaMsg = { ok: false, texto: 'O mês precisa ter pelo menos 1 integrante na lista.' };
    return render();
  }
  state.caixinhaSalvando = true;
  render();
  try {
    const marcacoes = {};
    state.caixinhaMembroIds.forEach(id => { if (state.caixinhaMarcacoes[id]) marcacoes[id] = true; });
    const r = await api('caixinhaSalvar', {
      divisao: state.adminEscopo, mes,
      membroIds: state.caixinhaMembroIds.join(','),
      marcacoes: JSON.stringify(marcacoes),
    });
    state.caixinhaMsg = { ok: true, texto: `✅ ${nomeDoMes(mes)}: ${r.pagaram} de ${r.total} pagaram.` };
    fecharMesCaixinha();
    mostrarAviso('💰 Caixinha salva');
    state.caixinhaSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    state.caixinhaMsg = { ok: false, texto: 'Não consegui salvar: ' + e.message + '.' };
  }
  state.caixinhaSalvando = false;
  render();
}

export async function removerMesCaixinha() {
  const mes = state.caixinhaMes;
  if (!mes) return;
  state.caixinhaSalvando = true;
  render();
  try {
    await api('caixinhaRemover', { divisao: state.adminEscopo, mes });
    state.caixinhaMsg = { ok: true, texto: `🗑️ ${nomeDoMes(mes)} excluído.` };
    fecharMesCaixinha();
    state.caixinhaSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    state.caixinhaMsg = { ok: false, texto: 'Não consegui excluir: ' + e.message + '.' };
  }
  state.caixinhaSalvando = false;
  render();
}

export function fecharMesCaixinha() {
  state.caixinhaMes = null;
  state.caixinhaMembroIds = [];
  state.caixinhaMarcacoes = {};
  state.caixinhaInfo = {};
  state.caixinhaMostrarAdicionar = false;
  state.caixinhaConfirmarRemover = false;
}
