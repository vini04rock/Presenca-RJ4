// Regras do estoque administrativo do Regional. A quantidade atual vem do
// livro de entradas e saidas; nunca e editada diretamente.

import { formatDataBR, hojeISO } from '../nucleo/util.js';

export const QUANTIDADE_MAXIMA_ESTOQUE_ADM = 100000;

export function quantidadeEstoqueAdm(texto) {
  const t = String(texto || '').replace(/\D/g, '').slice(0, 6);
  const n = Number(t);
  return Number.isInteger(n) && n > 0 && n <= QUANTIDADE_MAXIMA_ESTOQUE_ADM ? n : 0;
}

export function resumoEstoqueAdm(itens) {
  const lista = itens || [];
  return {
    materiais: lista.length,
    unidades: lista.reduce((s, x) => s + (Number(x.quantidade) || 0), 0),
    zerados: lista.filter(x => !Number(x.quantidade)).length,
  };
}

export function textoResumoEstoqueAdm(r) {
  const partes = [
    `${r.materiais} ${r.materiais === 1 ? 'material' : 'materiais'}`,
    `${r.unidades} ${r.unidades === 1 ? 'unidade' : 'unidades'}`,
  ];
  if (r.zerados) partes.push(`${r.zerados} ${r.zerados === 1 ? 'zerado' : 'zerados'}`);
  return partes.join(' · ');
}

export function filtrarMovimentosEstoqueAdm(movimentos, tipo) {
  const lista = movimentos || [];
  return tipo && tipo !== 'todos' ? lista.filter(x => x.tipo === tipo) : lista;
}

// ---------- o relatorio (WhatsApp, PDF e imagem) ----------
// Segue o filtro da aba (Tudo / Entradas / Saidas). O lancamento anulado
// fica de fora: ele continua no historico da tela, mas no relatorio so
// atrapalharia a conta. O saldo de cada material vai sempre junto.

export const ROTULO_FILTRO_ESTOQUE_ADM = { todos: 'Entradas e saídas', entrada: 'Só entradas', saida: 'Só saídas' };

export function relatorioEstoqueAdm(itens, movimentos, tipo, hoje = hojeISO()) {
  const filtro = tipo === 'entrada' || tipo === 'saida' ? tipo : 'todos';
  const lista = filtrarMovimentosEstoqueAdm(movimentos, filtro).filter(m => !m.anulado);
  const soma = t => lista.filter(m => m.tipo === t).reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
  return {
    hoje, filtro,
    rotuloFiltro: ROTULO_FILTRO_ESTOQUE_ADM[filtro],
    itens: itens || [],
    resumo: resumoEstoqueAdm(itens),
    movimentos: lista,
    entrou: soma('entrada'),
    saiu: soma('saida'),
  };
}

// A linha de um lancamento, igual no texto e na imagem:
// "Colete · 10 un · para Barra · obs".
export function detalheMovimentoEstoqueAdm(m) {
  return [
    m.material,
    `${m.quantidade} un`,
    m.tipo === 'saida' && m.destinoNome ? `para ${m.destinoNome}` : '',
    m.observacao || '',
  ].filter(Boolean).join(' · ');
}

export function textoRelatorioEstoqueAdm(r) {
  const partes = [
    '📦 *RELATÓRIO DO ESTOQUE ADM* 📦',
    `*REGIONAL* · ${formatDataBR(r.hoje)} · ${r.rotuloFiltro}`,
    '',
    '*📦 SALDO ATUAL*',
  ];
  if (!r.itens.length) partes.push('Nenhum material cadastrado.');
  r.itens.forEach(x => partes.push(`• *${x.nome}*: ${Number(x.quantidade) ? `${x.quantidade} un` : 'zerado'}`));
  if (r.itens.length) partes.push(`_${textoResumoEstoqueAdm(r.resumo)}_`);
  partes.push('', '*📋 MOVIMENTAÇÕES*');
  if (!r.movimentos.length) partes.push('Nenhuma movimentação.');
  r.movimentos.forEach(m => partes.push(`${m.tipo === 'entrada' ? '🟢' : '🔴'} ${formatDataBR(m.data)} · ${detalheMovimentoEstoqueAdm(m)}`));
  partes.push('');
  if (r.filtro !== 'saida') partes.push(`🟢 Entrou: ${r.entrou} un`);
  if (r.filtro !== 'entrada') partes.push(`🔴 Saiu: ${r.saiu} un`);
  partes.push('', '💀 I.S.S.I');
  return partes.join('\n');
}
