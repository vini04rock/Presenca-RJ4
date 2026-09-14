// Gravacao otimista: a tela responde na hora e a gravacao corre agrupada por fora.

import { api, apiBeacon } from '../nucleo/api.js';
import { getMemberStatus, state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';

// A tela responde na hora e a gravacao corre por fora. Toques seguidos
// (status, depois Direto, depois Destacado) sao agrupados numa gravacao so.
const ESPERA_AGRUPAR = 600;
export let timerGravacao = null;
let gravacaoEmCurso = false;
// Cada pendencia guarda um membro so, com o proprio eventId. Antes o app
// mandava a lista inteira de volta, e quem gravasse por ultimo apagava a
// confirmacao de quem tinha gravado antes.
export let pendentes = {};

function chavePendencia(eventId, memberId) { return eventId + '|' + memberId; }

export function setMemberStatus(memberId, patch) {
  // Sem a leitura confirmada, state.currentStatus pode estar vazio por falha de
  // rede, e a tela mostraria um estado que nao e o real.
  if (!state.statusLoaded) return;

  const atualizado = { ...getMemberStatus(memberId), ...patch };
  state.currentStatus = { ...state.currentStatus, [memberId]: atualizado };
  state.saveSeq++;
  state.saveState = 'saving';
  pendentes[chavePendencia(state.currentEventId, memberId)] = {
    eventoId: state.currentEventId,
    membroId: memberId,
    dados: atualizado
  };
  render();

  clearTimeout(timerGravacao);
  timerGravacao = setTimeout(gravarPendentes, ESPERA_AGRUPAR);
}

// Os parametros trafegam pela URL, entao a lista de participantes vai como
// texto separado por virgula e so os campos que o backend usa sao enviados.
export function paramsDeEvento(ev) {
  return {
    id: ev.id,
    nome: ev.nome,
    data: ev.data || '',
    horario: ev.horario || '',
    endereco: ev.endereco || '',
    outros: ev.outros || '',
    status: ev.status || 'ativo',
    categoria: ev.categoria || 'barra',
    tipo: ev.tipo || '',
    membroIds: (ev.memberIds || []).join(',')
  };
}

function paramsDePresenca(p) {
  return {
    eventoId: p.eventoId,
    membroId: p.membroId,
    status: p.dados.status || 'aguardando',
    direto: !!p.dados.direto,
    destacado: !!p.dados.destacado,
    acompanhado: !!p.dados.acompanhado
  };
}

export async function gravarPendentes() {
  if (gravacaoEmCurso) {
    clearTimeout(timerGravacao);
    timerGravacao = setTimeout(gravarPendentes, ESPERA_AGRUPAR);
    return;
  }
  const chaves = Object.keys(pendentes);
  if (!chaves.length) return;

  gravacaoEmCurso = true;
  const falhou = [];
  try {
    for (const chave of chaves) {
      const p = pendentes[chave];
      try {
        await api('presenca', paramsDePresenca(p));
        // So sai da fila se a mesma marcacao ainda estiver pendente: se o
        // membro mexeu de novo enquanto gravava, a nova versao fica.
        if (pendentes[chave] === p) delete pendentes[chave];
      } catch (e) {
        falhou.push(chave);
      }
    }
  } finally {
    gravacaoEmCurso = false;
  }

  state.saveState = falhou.length ? 'error' : 'saved';
  render();
  if (!falhou.length) {
    const seq = state.saveSeq;
    setTimeout(() => {
      if (seq === state.saveSeq && state.saveState === 'saved') {
        state.saveState = 'idle';
        render();
      }
    }, 2000);
  }
}

export function gravarAgora() {
  if (!Object.keys(pendentes).length) return;
  clearTimeout(timerGravacao);
  state.saveState = 'saving';
  render();
  gravarPendentes();
}

// Se a pagina for fechada com gravacao pendente, entrega pelo beacon.
window.addEventListener('pagehide', () => {
  Object.keys(pendentes).forEach(chave => {
    apiBeacon('presenca', paramsDePresenca(pendentes[chave]));
  });
});
