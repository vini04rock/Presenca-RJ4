// Abrir um evento (descarrega a fila pendente antes de trocar de tela).

import { loadEventStatus } from '../dados/carregar.js';
import { gravarPendentes, pendentes, timerGravacao } from '../fila/presenca.js';
import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { mostrarAviso } from '../nucleo/util.js';
import { render } from '../nucleo/render.js';

export async function openEvent(id) {
  // Descarrega o que ficou pendente do evento anterior antes de trocar.
  if (Object.keys(pendentes).length) {
    clearTimeout(timerGravacao);
    gravarPendentes();
  }
  state.currentEventId = id;
  state.view = 'event';
  state.expandedMemberId = null;
  state.buscaMembro = '';
  state.expandedDivisoes = new Set();
  state.currentStatus = {};
  state.saveState = 'idle';
  render();
  await loadEventStatus(id);
}

// Busca as respostas do evento aberto de novo, sem tirar a lista da tela
// (o loadEventStatus trava a lista enquanto carrega - aqui nao precisa: o
// que esta na tela e dado de verdade). Quem respondeu nesse meio-tempo
// aparece com o selo saltando (data-muda, no app.js).
//
// Nao atualiza com marcacao ainda nao salva: a resposta do servidor nao a
// conhece, e apagaria da tela o que a pessoa acabou de tocar.
export async function atualizarConfirmacoes() {
  const id = state.currentEventId;
  if (!id || state.view !== 'event' || state.atualizandoStatus) return;
  if (Object.keys(pendentes).length || state.saveState === 'saving') {
    return mostrarAviso('Salvando suas marcações — atualize daqui a pouco.');
  }
  state.atualizandoStatus = true;
  render();
  try {
    const r = await api('presencas', { eventoId: id });
    if (state.currentEventId === id && !Object.keys(pendentes).length) {
      state.currentStatus = r.presencas || {};
      state.statusLoaded = true;
      state.statusError = null;
      mostrarAviso('↻ Respostas atualizadas');
    }
  } catch (e) {
    mostrarAviso('Não consegui atualizar. Tente de novo.');
  }
  state.atualizandoStatus = false;
  render();
}
