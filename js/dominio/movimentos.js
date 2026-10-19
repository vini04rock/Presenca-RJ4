// Entrada/Saida de integrantes: o livro de movimentacoes (aba
// Movimentacoes, ver registrarMovimento no Code.gs) virado em relatorio.
//
// Tres numeros por divisao, e eles nao sao do mesmo tipo de proposito:
//   - entraram e desligados: quantos aconteceram NO PERIODO escolhido;
//   - afastados: quantos estao afastados AGORA (o cadastro diz), porque
//     afastamento e um estado, nao um acontecimento - quem se afastou ha um
//     ano e continua afastado ainda conta.
// E as transferencias (19/10/2026), tambem no periodo: quem chegou de outra
// divisao e quem saiu pra outra divisao ou regional. No total da RJ4, a
// transferencia entre duas divisoes da RJ4 se anula (saiu de uma, chegou na
// outra) - so conta quem foi pra outra regional.
//
// O motivo de cada movimentacao so aparece dentro do app. O texto e a
// imagem pro grupo levam nome e data, nunca o motivo: pode ser assunto
// pessoal (saude, familia), e o que vai pro grupo circula.

import { escopoPorChave, escoposEmOrdemDeExibicao, escoposNaOrdemOficial } from '../nucleo/config.js';
import { dataCorteMeses, formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';
import { nomeDoPeriodo } from './doacoes.js';

export const TIPOS_MOVIMENTO = {
  entrada: { emoji: '🟢', label: 'Entrada' },
  afastamento: { emoji: '⏸️', label: 'Afastamento' },
  retorno: { emoji: '▶️', label: 'Retorno' },
  desligamento: { emoji: '🚪', label: 'Desligamento' },
  // As duas pontas de uma transferencia (ver transferirMembro no Code.gs).
  transferenciaSaida: { emoji: '🔁', label: 'Transferido' },
  transferenciaEntrada: { emoji: '🔁', label: 'Chegou por transferência' },
};

// "Transferido para Oeste - RJ4" / "Veio de Barra - RJ4": a linha do tempo.
export function rotuloMovimento(m) {
  if (m.tipo === 'transferenciaSaida') return `Transferido para ${m.dePara || '?'}`;
  if (m.tipo === 'transferenciaEntrada') return `Veio de ${m.dePara || '?'}`;
  return TIPOS_MOVIMENTO[m.tipo].label;
}

// A saida que deixou a RJ4: o destino nao e uma das divisoes daqui.
export function saiuDaRJ4(m) {
  return m.tipo === 'transferenciaSaida' && !escoposEmOrdemDeExibicao().some(e => e.nome === m.dePara);
}

export function estaAfastado(m) { return !!m && m.situacao === 'afastado'; }

// Os que entram nas listas NOVAS (evento, caixinha): afastado fica de fora
// enquanto durar. O historico dele continua onde estava.
export function soAtivos(membros) { return membros.filter(m => !estaAfastado(m)); }

// ---- data de ingresso e tempo de clube --------------------------------
// A data de entrada no clube fica no cadastro (coluna Entrada de Membros).
// Os integrantes novos ja nascem com ela; os antigos ganham pelo Editar ou
// pelo "Preencher datas" do cadastro - e isso NAO conta como entrada no
// livro acima (eles ja eram do clube).

// Quanto tempo de clube, contando meses inteiros: "3 anos e 2 meses",
// "1 ano", "8 meses", "menos de 1 mês". Vazio sem data.
export function tempoDeClube(entradaISO, base = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(entradaISO || ''));
  if (!m) return '';
  let meses = (base.getFullYear() - Number(m[1])) * 12 + (base.getMonth() + 1 - Number(m[2]));
  if (base.getDate() < Number(m[3])) meses--;
  if (meses < 1) return 'menos de 1 mês';
  const anos = Math.floor(meses / 12), resto = meses % 12;
  const txtAnos = anos ? `${anos} ${anos === 1 ? 'ano' : 'anos'}` : '';
  const txtMeses = resto ? `${resto} ${resto === 1 ? 'mês' : 'meses'}` : '';
  return [txtAnos, txtMeses].filter(Boolean).join(' e ');
}

// "No clube desde 12/03/2019 · 3 anos e 2 meses" - a linha da carteirinha
// e do texto do relatorio individual.
export function textoIngresso(entradaISO, base = new Date()) {
  if (!entradaISO) return 'Data de ingresso não informada';
  return `No clube desde ${formatDataBR(entradaISO)} · ${tempoDeClube(entradaISO, base)}`;
}

// Os integrantes sem data de ingresso, na ordem hierarquica.
export function semDataDeIngresso(membros) {
  return ordenarPorHierarquia(membros.filter(m => !m.entrada));
}

// As movimentacoes da janela, do mais recente pro mais antigo.
// O periodo do Entrada/Saida (19/10/2026): 0 = tudo; um numero = os
// ultimos N meses (o "1 mes" e o ultimo mes, de hoje pra tras); { de, ate }
// = o "Por periodo", datas 'yyyy-mm-dd' com os dois dias inclusos - vazio
// de um lado = sem limite daquele lado.
export const PERIODOS_MOVIMENTOS = [1, 0];

export function rotuloPeriodoMovimentos(periodo) {
  if (periodo && typeof periodo === 'object') {
    const { de, ate } = periodo;
    if (de && ate) return `De ${formatDataBR(de)} a ${formatDataBR(ate)}`;
    if (de) return `Desde ${formatDataBR(de)}`;
    if (ate) return `Até ${formatDataBR(ate)}`;
    return nomeDoPeriodo(0);
  }
  return nomeDoPeriodo(periodo);
}

export function movimentosDoPeriodo(movimentos, periodo) {
  const porDatas = periodo && typeof periodo === 'object';
  const de = porDatas ? periodo.de || '' : (periodo ? dataCorteMeses(periodo) : '');
  const ate = porDatas ? periodo.ate || '' : '';
  return (movimentos || [])
    .filter(m => (!de || (m.data && m.data >= de)) && (!ate || (m.data && m.data <= ate)))
    .slice()
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

// O relatorio de uma divisao (ou do proprio Regional, que tambem tem
// integrantes). `roster` e o cadastro atual, de onde saem os afastados.
export function resumoMovimentos(movimentos, roster, chave, meses) {
  const nomeDivisao = escopoPorChave(chave).nome;
  const linhaDoTempo = movimentosDoPeriodo((movimentos || []).filter(m => m.divisao === chave), meses);
  const doTipo = tipo => linhaDoTempo.filter(m => m.tipo === tipo);
  return {
    chave,
    entradas: doTipo('entrada'),
    afastamentos: doTipo('afastamento'),
    retornos: doTipo('retorno'),
    desligamentos: doTipo('desligamento'),
    chegaram: doTipo('transferenciaEntrada'),
    sairam: doTipo('transferenciaSaida'),
    afastadosAgora: ordenarPorHierarquia(roster.filter(m => m.divisao === nomeDivisao && estaAfastado(m))),
    linhaDoTempo,
  };
}

// O quadro do Regional: uma linha por divisao, na ordem oficial do clube,
// e o total da RJ4.
export function quadroRegional(movimentos, roster, meses) {
  const linhas = escoposNaOrdemOficial().map(e => {
    const r = resumoMovimentos(movimentos, roster, e.chave, meses);
    return { e, entradas: r.entradas.length, afastados: r.afastadosAgora.length, desligamentos: r.desligamentos.length,
      chegaram: r.chegaram.length, sairam: r.sairam.length, sairamDaRJ4: r.sairam.filter(saiuDaRJ4).length };
  });
  const soma = campo => linhas.reduce((s, l) => s + l[campo], 0);
  return { linhas, total: { entradas: soma('entradas'), afastados: soma('afastados'), desligamentos: soma('desligamentos'),
    sairamDaRJ4: soma('sairamDaRJ4') } };
}

const comGrau = m => `${m.nome}${m.grau ? ` (${m.grau})` : ''}`;
const quandoFoi = m => (m.data ? ` — ${formatDataBR(m.data)}` : '');

// O texto da divisao pro grupo. Sem motivo (ver o topo do arquivo).
export function textoMovimentos(r, meses) {
  const partes = [
    '🔄 *ENTRADA E SAÍDA DE INTEGRANTES* 🔄',
    `*${escopoPorChave(r.chave).nome.toUpperCase()}* · ${rotuloPeriodoMovimentos(meses)}`,
    '',
    `🟢 Entraram: *${r.entradas.length}*`,
    `⏸️ Afastados agora: *${r.afastadosAgora.length}*`,
    `🚪 Desligados: *${r.desligamentos.length}*`,
    `🔁 Transferências: *${r.chegaram.length}* ${r.chegaram.length === 1 ? 'chegou' : 'chegaram'} · *${r.sairam.length}* ${r.sairam.length === 1 ? 'saiu' : 'saíram'}`,
  ];
  if (r.entradas.length) partes.push('', '🟢 *ENTRARAM*', ...r.entradas.map(m => `🟢 ${comGrau(m)}${quandoFoi(m)}`));
  if (r.afastadosAgora.length) {
    partes.push('', '⏸️ *AFASTADOS*', ...r.afastadosAgora.map(m => `⏸️ ${comGrau(m)}${m.situacaoDesde ? ` — desde ${formatDataBR(m.situacaoDesde)}` : ''}`));
  }
  if (r.desligamentos.length) partes.push('', '🚪 *DESLIGADOS*', ...r.desligamentos.map(m => `🚪 ${comGrau(m)}${quandoFoi(m)}`));
  if (r.chegaram.length) partes.push('', '🔁 *CHEGARAM POR TRANSFERÊNCIA*', ...r.chegaram.map(m => `🔁 ${comGrau(m)} — veio de ${m.dePara}${quandoFoi(m)}`));
  if (r.sairam.length) partes.push('', '🔁 *SAÍRAM POR TRANSFERÊNCIA*', ...r.sairam.map(m => `🔁 ${comGrau(m)} — para ${m.dePara}${quandoFoi(m)}`));
  return partes.join('\n');
}

// O quadro do Regional pro grupo: so os numeros de cada divisao.
export function textoQuadroRegional(q, meses) {
  return [
    '🔄 *ENTRADA E SAÍDA — RJ4* 🔄',
    rotuloPeriodoMovimentos(meses),
    '',
    ...q.linhas.map(l => `*${l.e.nome}*: 🟢 ${l.entradas} · ⏸️ ${l.afastados} · 🚪 ${l.desligamentos} · 🔁 +${l.chegaram} −${l.sairam}`),
    '',
    `*TOTAL RJ4*: 🟢 ${q.total.entradas} entraram · ⏸️ ${q.total.afastados} afastados · 🚪 ${q.total.desligamentos} desligados · 🔁 ${q.total.sairamDaRJ4} para outra regional`,
  ].join('\n');
}
