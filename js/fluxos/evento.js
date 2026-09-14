// Abrir um evento (descarrega a fila pendente antes de trocar de tela).

import { loadEventStatus } from '../dados/carregar.js';
import { gravarPendentes, pendentes, timerGravacao } from '../fila/presenca.js';
import { state } from '../nucleo/estado.js';
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
  state.expandedDivisoes = new Set();
  state.currentStatus = {};
  state.saveState = 'idle';
  render();
  await loadEventStatus(id);
}
