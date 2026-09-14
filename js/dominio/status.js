// As regras de status de presenca (inclusive Aguardando virar Infracional).

import { state } from '../nucleo/estado.js';

// Nao responder a convocacao e falta igual a uma falta sem justificativa
// (decisao do clube) - so faz sentido continuar "Aguardando" enquanto o
// evento ainda esta aberto (a pessoa ainda pode responder). O Code.gs ja
// converte isso na planilha ao encerrar (converterAguardandoParaInfracionalAoEncerrar),
// mas essa funcao e chamada aqui tambem, na leitura, como rede de seguranca
// pra eventos que ja estavam encerrados antes dessa regra existir - sem
// isso eles ficariam eternamente mostrando "Aguardando" ate alguem rodar a
// migracao manual na planilha (migrarAguardandoDeEventosJaEncerrados).
export function statusEfetivo(ev, statusBruto) {
  return (ev.status === 'encerrado' && statusBruto === 'aguardando') ? 'infracional' : statusBruto;
}

export function computeCounts(ev) {
  const statusData = state.reportData[ev.id] || {};
  const counts = { confirmado: 0, familia: 0, trabalho: 0, aguardando: 0, justificada: 0, infracional: 0 };
  ev.memberIds.forEach(mid => {
    const s = statusEfetivo(ev, (statusData[mid] && statusData[mid].status) || 'aguardando');
    if (counts[s] !== undefined) counts[s]++; else counts.aguardando++;
  });
  return counts;
}

export function getReportGroups(ev) {
  const statusData = state.reportData[ev.id] || {};
  const groups = { confirmado: [], familia: [], trabalho: [], aguardando: [], justificada: [], infracional: [] };
  ev.memberIds.forEach(mid => {
    const m = state.roster.find(r => r.id === mid);
    if (!m) return;
    const s = statusEfetivo(ev, (statusData[mid] && statusData[mid].status) || 'aguardando');
    (groups[s] || groups.aguardando).push(m.nome);
  });
  return groups;
}
