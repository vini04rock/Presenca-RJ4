// Monta o texto do relatorio pronto para colar no WhatsApp.

import { agruparNomesPorDivisaoParaTexto, agruparStatsPorDivisao } from './divisoes.js';
import { getReportGroups } from './status.js';
import { divisoesSemRegional, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
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

  // Evento ainda aberto sai como parcial: quem nao respondeu ainda pode
  // responder, entao aparece como "ainda nao responderam", nunca como falta.
  const parcial = ev.status !== 'encerrado';

  const lines = [];
  lines.push(parcial ? '📋 RELATÓRIO PARCIAL DE PRESENÇA' : '📋 RELATÓRIO DE PRESENÇA');
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
  if (parcial) {
    lines.push(`⚠️ AINDA NÃO RESPONDERAM (${groups.aguardando.length})`);
    lines.push(...(groups.aguardando.length ? groups.aguardando.map(n => '- ' + n) : ['- Todos responderam']));
    // Evento aberto feito a mao nao tem falta; so a convocacao colada pode ter.
    if (groups.infracional.length) {
      lines.push('');
      lines.push(`⭕ FALTA NÃO JUSTIFICADA (${groups.infracional.length})`);
      lines.push(...groups.infracional.map(n => '- ' + n));
    }
    return lines.join('\n');
  }
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

// O Resumo dos Relatorios pro WhatsApp: a presenca total e a de cada tipo
// (cada um no proprio periodo, como nos cards), quem mais faltou sem
// justificar e o % de cada integrante, por divisao. `d` vem pronto da tela
// (ver dadosDoResumo em telas/relatorios.js):
// { escopo, filtro, datas, total, tipos: [{ tipo, emoji, meses, r }], faltas, mesesLista, membros }.
export function textoResumoRelatorios(d) {
  const periodo = (m) => (m === 1 ? 'último mês' : `últimos ${m} meses`);
  const numeros = (r) => `${r.pct === null ? '—' : r.pct + '%'} (${r.somaConfirmados} de ${r.somaConvidados}) · ${r.eventosNoPeriodo} ${r.eventosNoPeriodo === 1 ? 'evento' : 'eventos'}`;
  const sp = d.total.r.statusPeriodo;
  const linhas = [
    '📋 *RELATÓRIO DE PRESENÇA*',
    `*${d.escopo.toUpperCase()}*${d.filtro ? ' · ' + d.filtro : ''}`,
  ];
  if (d.datas) linhas.push('🗓️ ' + d.datas);
  linhas.push(
    '',
    `🏁 *Presença total* — ${periodo(d.total.meses)}`,
    '📊 ' + numeros(d.total.r),
    `✅ ${sp.confirmado} · ❌ ${sp.justificada} justificadas · ⭕ ${sp.infracional} não justificadas`,
    '',
    '*POR TIPO*',
    ...d.tipos.map(t => `${t.emoji} ${t.tipo} (${periodo(t.meses)}): ${numeros(t.r)}`),
  );
  if (d.faltas.length) {
    linhas.push('', `⭕ *MAIS FALTAS NÃO JUSTIFICADAS* (${periodo(d.mesesLista)})`,
      ...d.faltas.map(f => `- ${f.nome}${d.filtro === 'Todas as divisões' && f.divisao ? ` (${f.divisao})` : ''}: ${f.total}`));
  }
  const grupos = agruparStatsPorDivisao(d.membros.filter(m => m.percentual !== null));
  if (grupos.length) {
    linhas.push('', `*% DE CADA INTEGRANTE* (${periodo(d.mesesLista)})`);
    grupos.forEach(g => {
      linhas.push(`_${g.divisao}_`, ...g.itens.map(m => `- ${m.nome}: ${m.percentual}% (${m.confirmacoes} de ${m.convites})`));
    });
  }
  return linhas.join('\n');
}

// O Relatorio completo do Insight pro WhatsApp: a media, cada divisao e o %
// de cada integrante. `d` e o mesmo objeto da aba e da imagem (o do
// servidor, ou o refeito pro periodo).
export function textoRelatorioInsight(d, rotuloPeriodo) {
  const totalMarcacoes = d.membros.reduce((s, m) => s + m.rodadas, 0);
  const totalFez = d.membros.reduce((s, m) => s + m.confirmacoes, 0);
  const pct = totalMarcacoes ? Math.round((totalFez / totalMarcacoes) * 100) : null;
  const linhas = [
    '💡 *RANK DE INSIGHTS*',
    `${rotuloPeriodo} · ${d.rodadas} ${d.rodadas === 1 ? 'rodada' : 'rodadas'}`,
    '',
    `📊 *Média: ${pct === null ? '—' : pct + '%'}* (${totalFez} de ${totalMarcacoes})`,
    '',
    '*POR DIVISÃO*',
    ...divisoesSemRegional().map(e => {
      const item = d.divisoes.find(x => x.chave === e.chave);
      return `- ${e.nome}: ${item && item.percentual !== null && item.percentual !== undefined ? item.percentual + '%' : '—'}`;
    }),
  ];
  const grupos = agruparStatsPorDivisao(d.membros.filter(m => m.rodadas > 0));
  if (grupos.length) {
    linhas.push('', '*% DE CADA INTEGRANTE*');
    grupos.forEach(g => linhas.push(`_${g.divisao}_`,
      ...g.itens.map(m => `- ${m.nome}: ${m.percentual === null ? '—' : m.percentual + '%'} (${m.confirmacoes} de ${m.rodadas})`)));
  }
  return linhas.join('\n');
}

// O Rank de Presenca pro WhatsApp: o total da RJ4, as divisoes do maior %
// pro menor e o % de cada integrante, por divisao. `d` e o rankPresenca.
export function textoRankPresenca(d, janela) {
  const convites = d.divisoes.reduce((s, x) => s + x.convites, 0);
  const confirmacoes = d.divisoes.reduce((s, x) => s + x.confirmacoes, 0);
  const pct = v => (v === null || v === undefined ? '—' : v + '%');
  const divisoes = escoposEmOrdemDeExibicao()
    .map(e => { const item = d.divisoes.find(x => x.chave === e.chave); return { nome: e.nome, p: item ? item.percentual : null }; })
    .sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
  const linhas = [
    '🏆 *RANK DE PRESENÇA*',
    janela === '6meses' ? 'Últimos 6 meses' : 'Desde sempre',
    '',
    `🏁 *Total Regional RJ4: ${pct(convites ? Math.round((confirmacoes / convites) * 100) : null)}*`,
    '',
    '*DIVISÕES*',
    ...divisoes.map((x, i) => `${i + 1}. ${x.nome}: ${pct(x.p)}`),
  ];
  const grupos = agruparStatsPorDivisao((d.membros || []).filter(m => m.percentual !== null && m.percentual !== undefined));
  if (grupos.length) {
    linhas.push('', '*% DE CADA INTEGRANTE*');
    grupos.forEach(g => linhas.push(`_${g.divisao}_`, ...g.itens.map(m => `- ${m.nome}: ${m.percentual}%`)));
  }
  return linhas.join('\n');
}
