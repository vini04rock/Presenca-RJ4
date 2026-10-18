// Caixinha mensal: os meses, o rank de quem esta em dia e os textos pro
// WhatsApp.
//
// Cada mes lancado guarda a lista de quem devia pagar naquele mes, congelada
// (ver salvarCaixinhaMes no Code.gs). Por isso quem entrou no clube depois
// nao aparece devendo mes antigo: ele simplesmente nao esta na lista daquele
// mes. Os dados chegam do Code.gs (lerCaixinha) assim:
// { meses: [{ mes: 'yyyy-mm', membros: [{ id, nome, pagou }] }] }, do mais
// recente pro mais antigo.

import { escopoPorChave } from '../nucleo/config.js';
import { ordenarPorHierarquia } from '../nucleo/util.js';
import { nomeDoPeriodo } from './doacoes.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// 'yyyy-mm' do mes de uma data (hoje, se nada vier), andando `deslocamento`
// meses pra tras ou pra frente.
export function mesISO(deslocamento = 0, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth() + deslocamento, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "Outubro/2026"
export function nomeDoMes(mes) {
  const [a, m] = String(mes || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a}` : String(mes || '');
}

// "out/26" - pros graficos, onde nao cabe o nome inteiro.
export function nomeCurtoDoMes(mes) {
  const [a, m] = String(mes || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES_CURTOS[i]}/${String(a).slice(2)}` : String(mes || '');
}

// Os meses que dao pra lancar: do mes que vem (quem paga adiantado) ate um
// ano pra tras, do mais recente pro mais antigo. Um mes ja lancado continua
// na lista - escolher ele abre a correcao, nao um lancamento novo.
export function mesesParaEscolher(base = new Date()) {
  return Array.from({ length: 14 }, (_, i) => mesISO(1 - i, base));
}

// Os meses lancados dentro da janela. A janela conta o mes atual: "3 meses"
// em outubro sao agosto, setembro e outubro.
export function mesesDoPeriodo(meses, janela, base = new Date()) {
  const corte = janela ? mesISO(1 - janela, base) : '';
  return (meses || []).filter(m => !corte || m.mes >= corte);
}

// O rank no periodo. `membros` sao os integrantes ATUAIS da divisao - quem
// saiu do clube nao aparece devendo, mas os meses dele continuam somando no
// % de cada mes e no da divisao.
export function rankCaixinha(dados, membros, janela, base = new Date()) {
  const meses = mesesDoPeriodo(dados && dados.meses, janela, base);

  const porMes = meses.map(m => {
    const pagaram = m.membros.filter(x => x.pagou).length;
    return { mes: m.mes, pagaram, total: m.membros.length,
      pct: m.membros.length ? Math.round((pagaram / m.membros.length) * 100) : null };
  });

  const linhas = membros.map(m => {
    let devia = 0, pagou = 0;
    const devendo = [];
    meses.forEach(x => {
      const reg = x.membros.find(y => y.id === m.id);
      if (!reg) return;
      devia++;
      if (reg.pagou) pagou++;
      else devendo.push(x.mes);
    });
    return { ...m, devia, pagou, devendo, pct: devia ? Math.round((pagou / devia) * 100) : null };
  });
  linhas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.pagou - a.pagou || a.nome.localeCompare(b.nome));

  const totalPagou = porMes.reduce((s, m) => s + m.pagaram, 0);
  const totalDevia = porMes.reduce((s, m) => s + m.total, 0);
  return {
    meses: porMes,
    pct: totalDevia ? Math.round((totalPagou / totalDevia) * 100) : null,
    pagamentos: totalPagou,
    cobrancas: totalDevia,
    membros: linhas,
    emDia: linhas.filter(m => m.devia > 0 && !m.devendo.length),
    // Quem deve mais meses primeiro.
    devendo: linhas
      .filter(m => m.devendo.length)
      .sort((a, b) => b.devendo.length - a.devendo.length || a.nome.localeCompare(b.nome)),
  };
}

// Quem deve um mes, na ordem hierarquica, com o grau do cadastro. Quem ja
// saiu do clube entra pelo nome que ficou gravado no mes.
export function quemNaoPagou(mesLancado, roster) {
  const faltam = (mesLancado.membros || []).filter(m => !m.pagou)
    .map(m => roster.find(r => r.id === m.id) || { id: m.id, nome: m.nome });
  return ordenarPorHierarquia(faltam);
}

const linhaNome = m => `${m.nome}${m.grau ? ` (${m.grau})` : ''}`;
const listaDeMeses = l => l.map(nomeCurtoDoMes).join(', ');

// O panorama do periodo pro grupo: o % da divisao, quem esta em dia e quem
// esta devendo (com quais meses).
export function textoCaixinha(rank, escopo, janela) {
  const partes = [
    '💰 *CAIXINHA* 💰',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · ${nomeDoPeriodo(janela)}`,
    '',
  ];
  if (rank.pct !== null) partes.push(`Em dia: *${rank.pct}%* dos pagamentos (${rank.pagamentos} de ${rank.cobrancas})`);
  rank.meses.slice().reverse().forEach(m => partes.push(`• ${nomeDoMes(m.mes)}: ${m.pagaram} de ${m.total} pagaram`));
  if (rank.emDia.length) {
    partes.push('', '✅ *EM DIA*');
    ordenarPorHierarquia(rank.emDia).forEach((m, i) => partes.push(`${i + 1}. ${linhaNome(m)}`));
  }
  if (rank.devendo.length) {
    partes.push('', '⚠️ *PENDENTES*');
    rank.devendo.forEach((m, i) => partes.push(`${i + 1}. ${linhaNome(m)} — ${listaDeMeses(m.devendo)}`));
  }
  return partes.join('\n');
}

// A cobranca de um mes so, no mesmo espirito do "📋 Cobrar" dos eventos.
export function textoCobrancaCaixinha(mesLancado, roster, escopo) {
  const faltam = quemNaoPagou(mesLancado, roster);
  return [
    '💰 *CAIXINHA — FALTA PAGAR* 💰',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · ${nomeDoMes(mesLancado.mes)}`,
    '',
    ...faltam.map((m, i) => `${i + 1}. ${linhaNome(m)}`),
  ].join('\n');
}
