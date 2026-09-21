// Monta o texto do relatorio pronto para colar no WhatsApp.

import { agruparNomesPorDivisaoParaTexto } from './divisoes.js';
import { getReportGroups } from './status.js';
import { state } from '../nucleo/estado.js';
import { formatDataBR } from '../nucleo/util.js';

export function buildReportText(ev) {
  const groups = getReportGroups(ev);
  // Familia, trabalho e justificada sao razoes de falta justificada; juntas
  // viram uma unica secao "nao puderam ir", com o motivo ao lado de cada nome.
  const naoPuderamIr = [
    ...groups.familia.map(n => ({ nome: n, motivo: 'Família' })),
    ...groups.trabalho.map(n => ({ nome: n, motivo: 'Trabalho' })),
    ...groups.justificada.map(n => ({ nome: n, motivo: 'Justificada' })),
  ];

  const total = ev.memberIds.length;
  const percentual = total ? Math.round((groups.confirmado.length / total) * 100) : 0;

  const lines = [];
  lines.push('📋 RELATÓRIO DE PRESENÇA');
  lines.push(ev.nome);
  if (ev.data) lines.push('🗓️ ' + formatDataBR(ev.data));
  if (ev.endereco) lines.push('📍 ' + ev.endereco);
  lines.push('');
  lines.push(`📊 ${percentual}% DE PRESENÇA (${groups.confirmado.length} de ${total})`);
  lines.push('');
  lines.push(`✅ CONFIRMARAM (${groups.confirmado.length})`);
  lines.push(...(groups.confirmado.length ? groups.confirmado.map(n => '- ' + n) : ['- Ninguém confirmou']));
  lines.push('');
  lines.push(`❌ NÃO PUDERAM IR (${naoPuderamIr.length})`);
  lines.push(...(naoPuderamIr.length ? naoPuderamIr.map(m => `- ${m.nome} (${m.motivo})`) : ['- Ninguém avisou falta']));
  lines.push('');
  // Sem secao de "Nao responderam": evento encerrado nao tem mais esse
  // status (ver statusEfetivo) - quem nao respondeu ja caiu em Infracional.
  lines.push(`⭕ FALTA NÃO JUSTIFICADA (${groups.infracional.length})`);
  lines.push(...(groups.infracional.length ? groups.infracional.map(n => '- ' + n) : ['- Nenhuma']));
  return lines.join('\n');
}

export function buildInsightReportText(r) {
  // r.membros so traz id/nome/divisao "fotografados" na hora da rodada (ver
  // listarInsightRodadas no Code.gs) - o grau nao fica gravado la, entao
  // busca no cadastro atual (state.roster) pelo id. Se o membro foi excluido
  // depois, fica sem grau (grau vazio), mas o nome continua aparecendo.
  const comGrau = (r.membros || []).map(m => {
    const cadastro = state.roster.find(x => x.id === m.id);
    return { nome: m.nome, divisao: m.divisao, fez: m.fez, grau: cadastro ? cadastro.grau : '' };
  });
  const fizeram = comGrau.filter(m => m.fez);
  const naoFizeram = comGrau.filter(m => !m.fez);
  const lines = [];
  lines.push('💡 RELATÓRIO DE INSIGHT');
  if (r.data) lines.push('🗓️ ' + formatDataBR(r.data));
  lines.push('');
  lines.push(`📊 ${r.percentual === null ? '—' : r.percentual + '%'} FIZERAM (${r.totalSim} de ${r.totalElegiveis})`);
  lines.push('');
  lines.push(`✅ FIZERAM (${fizeram.length})`);
  lines.push(...(fizeram.length ? agruparNomesPorDivisaoParaTexto(fizeram) : ['- Ninguém fez']));
  lines.push('');
  lines.push(`❌ NÃO FIZERAM (${naoFizeram.length})`);
  lines.push(...(naoFizeram.length ? agruparNomesPorDivisaoParaTexto(naoFizeram) : ['- Todos fizeram']));
  return lines.join('\n');
}
