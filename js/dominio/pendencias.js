// O que esta esperando acao do organizador.
//
// Por enquanto so uma pendencia: evento chegando com gente que ainda nao
// respondeu. A ideia e crescer daqui (cadastro incompleto, evento sem tipo,
// Insight parado), mas cada uma so entra se valer o espaco - painel de
// alerta cheio demais e painel que ninguem le.

import { state } from '../nucleo/estado.js';
import { diasAte, hojeISO } from '../nucleo/util.js';

// Quantos dias antes o evento comeca a aparecer no aviso. O evento se
// encerra sozinho na virada do dia dele, entao esta janela e a ultima
// chance de cobrar quem falta - depois disso quem nao respondeu vira falta
// infracional (ver statusEfetivo em dominio/status.js).
export const JANELA_DIAS = 2;

// Eventos ativos da divisao que acontecem de hoje ate JANELA_DIAS a frente,
// do mais proximo pro mais distante. Evento sem data fica de fora: sem ela
// nao da pra saber se esta perto, e a comparacao de texto trataria '' como
// anterior a qualquer data.
export function eventosProximos(escopo, dias = JANELA_DIAS) {
  const hoje = hojeISO();
  return state.events
    .filter(ev => ev.status !== 'encerrado'
      && ev.categoria === escopo
      && /^\d{4}-\d{2}-\d{2}$/.test(ev.data || '')
      && ev.data >= hoje)
    .map(ev => ({ ev, dias: diasAte(ev.data) }))
    .filter(x => x.dias !== null && x.dias <= dias)
    .sort((a, b) => a.ev.data.localeCompare(b.ev.data)
      || (a.ev.horario || '').localeCompare(b.ev.horario || ''));
}

// Quantos dos convocados ainda nao responderam.
//
// Devolve null enquanto as presencas daquele evento nao chegaram - quem
// desenha usa isso pra dizer "carregando" em vez de mostrar um numero
// errado (sem os dados, TODO mundo pareceria nao ter respondido).
export function semResposta(ev) {
  const presencas = state.reportData[ev.id];
  if (!presencas) return null;
  const total = (ev.memberIds || []).length;
  const faltam = (ev.memberIds || []).filter(id => {
    const p = presencas[id];
    return !p || !p.status || p.status === 'aguardando';
  }).length;
  return { faltam, total };
}
