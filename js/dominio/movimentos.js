// Entrada/Saida de integrantes: o livro de movimentacoes (aba
// Movimentacoes, ver registrarMovimento no Code.gs) virado em relatorio.
//
// Tres numeros por divisao, e eles nao sao do mesmo tipo de proposito:
//   - entraram e desligados: quantos aconteceram NO PERIODO escolhido;
//   - afastados: quantos estao afastados AGORA (o cadastro diz), porque
//     afastamento e um estado, nao um acontecimento - quem se afastou ha um
//     ano e continua afastado ainda conta.
//
// O motivo de cada movimentacao so aparece dentro do app. O texto e a
// imagem pro grupo levam nome e data, nunca o motivo: pode ser assunto
// pessoal (saude, familia), e o que vai pro grupo circula.

import { escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { dataCorteMeses, formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';
import { nomeDoPeriodo } from './doacoes.js';

export const TIPOS_MOVIMENTO = {
  entrada: { emoji: '🟢', label: 'Entrada' },
  afastamento: { emoji: '⏸️', label: 'Afastamento' },
  retorno: { emoji: '▶️', label: 'Retorno' },
  desligamento: { emoji: '🚪', label: 'Desligamento' },
};

export function estaAfastado(m) { return !!m && m.situacao === 'afastado'; }

// Os que entram nas listas NOVAS (evento, caixinha): afastado fica de fora
// enquanto durar. O historico dele continua onde estava.
export function soAtivos(membros) { return membros.filter(m => !estaAfastado(m)); }

// As movimentacoes da janela, do mais recente pro mais antigo.
export function movimentosDoPeriodo(movimentos, meses) {
  const corte = meses ? dataCorteMeses(meses) : null;
  return (movimentos || [])
    .filter(m => !corte || (m.data && m.data >= corte))
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
    afastadosAgora: ordenarPorHierarquia(roster.filter(m => m.divisao === nomeDivisao && estaAfastado(m))),
    linhaDoTempo,
  };
}

// O quadro do Regional: uma linha por divisao, na ordem oficial do clube,
// e o total da RJ4.
export function quadroRegional(movimentos, roster, meses) {
  const linhas = escoposNaOrdemOficial().map(e => {
    const r = resumoMovimentos(movimentos, roster, e.chave, meses);
    return { e, entradas: r.entradas.length, afastados: r.afastadosAgora.length, desligamentos: r.desligamentos.length };
  });
  const soma = campo => linhas.reduce((s, l) => s + l[campo], 0);
  return { linhas, total: { entradas: soma('entradas'), afastados: soma('afastados'), desligamentos: soma('desligamentos') } };
}

const comGrau = m => `${m.nome}${m.grau ? ` (${m.grau})` : ''}`;
const quandoFoi = m => (m.data ? ` — ${formatDataBR(m.data)}` : '');

// O texto da divisao pro grupo. Sem motivo (ver o topo do arquivo).
export function textoMovimentos(r, meses) {
  const partes = [
    '🔄 *ENTRADA E SAÍDA DE INTEGRANTES* 🔄',
    `*${escopoPorChave(r.chave).nome.toUpperCase()}* · ${nomeDoPeriodo(meses)}`,
    '',
    `🟢 Entraram: *${r.entradas.length}*`,
    `⏸️ Afastados agora: *${r.afastadosAgora.length}*`,
    `🚪 Desligados: *${r.desligamentos.length}*`,
  ];
  if (r.entradas.length) partes.push('', '🟢 *ENTRARAM*', ...r.entradas.map(m => `🟢 ${comGrau(m)}${quandoFoi(m)}`));
  if (r.afastadosAgora.length) {
    partes.push('', '⏸️ *AFASTADOS*', ...r.afastadosAgora.map(m => `⏸️ ${comGrau(m)}${m.situacaoDesde ? ` — desde ${formatDataBR(m.situacaoDesde)}` : ''}`));
  }
  if (r.desligamentos.length) partes.push('', '🚪 *DESLIGADOS*', ...r.desligamentos.map(m => `🚪 ${comGrau(m)}${quandoFoi(m)}`));
  return partes.join('\n');
}

// O quadro do Regional pro grupo: so os numeros de cada divisao.
export function textoQuadroRegional(q, meses) {
  return [
    '🔄 *ENTRADA E SAÍDA — RJ4* 🔄',
    nomeDoPeriodo(meses),
    '',
    ...q.linhas.map(l => `*${l.e.nome}*: 🟢 ${l.entradas} · ⏸️ ${l.afastados} · 🚪 ${l.desligamentos}`),
    '',
    `*TOTAL RJ4*: 🟢 ${q.total.entradas} entraram · ⏸️ ${q.total.afastados} afastados · 🚪 ${q.total.desligamentos} desligados`,
  ].join('\n');
}
