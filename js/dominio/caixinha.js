// Caixinha mensal: os meses, o rank de quem esta em dia e os textos pro
// WhatsApp.
//
// Cada mes lancado guarda a lista de quem devia pagar naquele mes, congelada
// (ver salvarCaixinhaMes no Code.gs). Por isso quem entrou no clube depois
// nao aparece devendo mes antigo: ele simplesmente nao esta na lista daquele
// mes. Os dados chegam do Code.gs (lerCaixinha) assim:
// { meses: [{ mes: 'yyyy-mm', membros: [{ id, nome, pagou, valor }] }],
//   saldoInicial, lancamentos }, os meses do mais recente pro mais antigo.
// O saldo inicial e os lancamentos sao do controle financeiro (ver
// dominio/caixinha-financeiro.js).

import { VALOR_CAIXINHA_PADRAO, escopoPorChave } from '../nucleo/config.js';
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

// "R$ 1.234,50" - sempre com centavos, que e como dinheiro se le. Feito a
// mao em vez do estilo 'currency' do navegador, que poe um espaco
// especial entre o R$ e o numero e quebra quem compara texto.
export function formatReais(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const texto = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−R$ ' : 'R$ ') + texto;
}

// O que a pessoa digitou na caixa de valor -> numero. "30", "30,50",
// "1.234,50" e "R$ 30" valem. Vazio e 0 (nao pagou); o que nao e valor, e
// o que passa de `maximo` (erro de digitacao), e null - quem chama avisa
// em vez de gravar errado. O Code.gs confere de novo (valorValido).
export const VALOR_MAXIMO = 10000;
export function lerValor(texto, maximo = VALOR_MAXIMO) {
  let t = String(texto === undefined || texto === null ? '' : texto).replace(/R\$/i, '').replace(/\s/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return n > maximo ? null : n;
}

// Quanto um integrante pagou num mes. Os dados de antes do valor existir
// (so o "pagou") valem o padrao - o Code.gs ja manda assim, isto e so a
// rede pra quem chama com o formato antigo.
export function valorPago(m) {
  if (typeof m.valor === 'number') return m.valor;
  return m.pagou ? VALOR_CAIXINHA_PADRAO : 0;
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
    return { mes: m.mes, pagaram, total: m.membros.length, valor: somaReais(m.membros.map(valorPago)),
      pct: m.membros.length ? Math.round((pagaram / m.membros.length) * 100) : null };
  });

  const linhas = membros.map(m => {
    let devia = 0, pagou = 0, valor = 0;
    const devendo = [];
    meses.forEach(x => {
      const reg = x.membros.find(y => y.id === m.id);
      if (!reg) return;
      devia++;
      if (reg.pagou) { pagou++; valor += valorPago(reg); }
      else devendo.push(x.mes);
    });
    return { ...m, devia, pagou, valor: somaReais([valor]), devendo, pct: devia ? Math.round((pagou / devia) * 100) : null };
  });
  linhas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.pagou - a.pagou || a.nome.localeCompare(b.nome));

  const totalPagou = porMes.reduce((s, m) => s + m.pagaram, 0);
  const totalDevia = porMes.reduce((s, m) => s + m.total, 0);
  return {
    meses: porMes,
    pct: totalDevia ? Math.round((totalPagou / totalDevia) * 100) : null,
    pagamentos: totalPagou,
    cobrancas: totalDevia,
    // O dinheiro do periodo - conta tambem o de quem ja saiu do clube.
    arrecadado: somaReais(porMes.map(m => m.valor)),
    membros: linhas,
    emDia: linhas.filter(m => m.devia > 0 && !m.devendo.length),
    // Quem deve mais meses primeiro.
    devendo: linhas
      .filter(m => m.devendo.length)
      .sort((a, b) => b.devendo.length - a.devendo.length || a.nome.localeCompare(b.nome)),
  };
}

// Soma em reais sem a sujeira da virgula flutuante (0,1 + 0,2).
export function somaReais(valores) {
  return Math.round(valores.reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
}

// Os integrantes de um mes, na ordem hierarquica, com o grau do cadastro.
// Quem ja saiu do clube entra pelo nome que ficou gravado no mes.
function integrantesDoMes(mesLancado, roster, pagou) {
  return ordenarPorHierarquia((mesLancado.membros || []).filter(m => m.pagou === pagou)
    .map(m => roster.find(r => r.id === m.id) || { id: m.id, nome: m.nome }));
}

export function quemNaoPagou(mesLancado, roster) {
  return integrantesDoMes(mesLancado, roster, false);
}

// O relatorio de um mes: quem pagou, quem nao pagou e o %. E o que a imagem
// e o texto do mes mostram - os dois saem daqui pra nunca discordarem.
export function relatorioMesCaixinha(mesLancado, roster) {
  const pagaram = integrantesDoMes(mesLancado, roster, true);
  const naoPagaram = integrantesDoMes(mesLancado, roster, false);
  const total = pagaram.length + naoPagaram.length;
  return { mes: mesLancado.mes, pagaram, naoPagaram, total,
    pct: total ? Math.round((pagaram.length / total) * 100) : null };
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
  if (rank.arrecadado) partes.push(`Arrecadado: *${formatReais(rank.arrecadado)}*`);
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

// O relatorio de um mes pro WhatsApp: ✅ quem pagou e ❌ quem nao pagou,
// os mesmos emojis da confirmacao de presenca. Por decisao do clube
// (18/10/2026), o relatorio do mes leva os nomes dos dois lados - na
// imagem tambem.
export function textoRelatorioMesCaixinha(mesLancado, roster, escopo) {
  const r = relatorioMesCaixinha(mesLancado, roster);
  const partes = [
    '💰 *CAIXINHA* 💰',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · ${nomeDoMes(r.mes)}`,
    '',
    `*${r.pagaram.length} de ${r.total}* pagaram${r.pct === null ? '' : ` (${r.pct}%)`}`,
  ];
  if (r.pagaram.length) partes.push('', `✅ *PAGARAM (${r.pagaram.length})*`, ...r.pagaram.map(m => `✅ ${linhaNome(m)}`));
  if (r.naoPagaram.length) partes.push('', `❌ *NÃO PAGARAM (${r.naoPagaram.length})*`, ...r.naoPagaram.map(m => `❌ ${linhaNome(m)}`));
  return partes.join('\n');
}
