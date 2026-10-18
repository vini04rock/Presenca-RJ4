// Controle financeiro da caixinha: o saldo, o que entrou, o que saiu e com
// o que se gastou. As contas e o texto do relatorio de controle.
//
// Tres fontes viram uma lista so de movimentos do caixa:
//   - as mensalidades, somadas direto dos meses lancados no "Mes a mes" -
//     nunca lancadas de novo aqui, pra cada real ter um lugar so;
//   - os lancamentos de entrada (doacao extra, rifa...) e de saida;
//   - o saldo inicial: o ponto de partida, definido uma vez so e travado.
//
// O saldo inicial e "quanto tem na caixinha hoje", no dia em que foi
// definido (saldoInicial.data). O mes dele ja esta dentro do valor - quem
// ja pagou a caixinha deste mes, esse dinheiro ja esta no caixa. Por isso,
// pra nada contar duas vezes (decisao do clube, 18/10/2026):
//   - mensalidades contam do mes SEGUINTE em diante;
//   - entradas e saidas contam do dia SEGUINTE em diante.
// Quem ainda pagar a caixinha daquele mes depois, entra como entrada avulsa.
//
// Os saldos salvos antes disso tem so o mes (sem `data`) e valem do jeito
// antigo: o que havia no COMECO daquele mes, e o mes inteiro conta.
//
// O que ficar de fora fica de fora da conta (e a tela avisa quanto ficou).
// Sem saldo inicial definido, o caixa comeca do zero e tudo conta.

import { CATEGORIA_ENTRADA_CAIXINHA, escopoPorChave } from '../nucleo/config.js';
import { formatDataBR } from '../nucleo/util.js';
import { formatReais, mesISO, nomeDoMes, somaReais, valorPago } from './caixinha.js';
import { nomeDoPeriodo } from './doacoes.js';

export const CATEGORIA_MENSALIDADES = 'Mensalidades';

// Todos os movimentos do caixa, do mais recente pro mais antigo. Cada um:
// { tipo: 'entrada'|'saida', origem: 'mensalidade'|'lancamento', data, mes,
//   categoria, descricao, valor } - a mensalidade traz tambem quantos
// pagaram, e o lancamento o id (pra corrigir ou excluir).
export function movimentosDoCaixa(dados) {
  const corte = corteDoSaldo(dados && dados.saldoInicial);
  const inicio = corte ? corte.inicio : '';
  const todos = [];
  ((dados && dados.meses) || []).forEach(m => {
    const pagos = m.membros.filter(x => x.pagou);
    const valor = somaReais(pagos.map(valorPago));
    if (!valor) return;
    todos.push({ tipo: 'entrada', origem: 'mensalidade', data: m.mes + '-01', mes: m.mes,
      categoria: CATEGORIA_MENSALIDADES, descricao: 'Caixinha de ' + nomeDoMes(m.mes), valor, pagaram: pagos.length });
  });
  ((dados && dados.lancamentos) || []).forEach(l => {
    if (!l.data || !l.valor) return;
    todos.push({ ...l, origem: 'lancamento', mes: l.data.slice(0, 7) });
  });
  // Mesmo dia: a mensalidade (dia 1) depois dos lancamentos daquele dia.
  todos.sort((a, b) => b.data.localeCompare(a.data) || (a.origem === 'mensalidade') - (b.origem === 'mensalidade'));
  const dentro = todos.filter(x => !corte || (x.origem === 'mensalidade' ? x.mes >= corte.mes : x.data >= corte.data));
  return {
    inicio,
    saldoInicial: dados && dados.saldoInicial ? dados.saldoInicial.valor : 0,
    itens: dentro,
    // O que ficou de fora por ser de antes do saldo inicial.
    antesDoInicio: todos.length - dentro.length,
  };
}

// A partir de quando as coisas contam, pelo saldo inicial: o primeiro mes
// de mensalidade, o primeiro dia de lancamento, e o mes em que o caixa
// comeca (o periodo do relatorio nunca comeca antes dele). null = sem
// saldo inicial, tudo conta.
function corteDoSaldo(s) {
  if (!s) return null;
  if (s.data) {
    const [a, m, d] = s.data.split('-').map(Number);
    const amanha = new Date(a, m - 1, d + 1);
    const iso = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
    return { mes: mesSeguinte(s.data.slice(0, 7)), data: iso, inicio: s.data.slice(0, 7) };
  }
  return { mes: s.mes, data: s.mes + '-01', inicio: s.mes };
}

// "definido em 18/10/2026", ou "no começo de Outubro/2026" pro saldo antigo.
export function quandoDoSaldoInicial(s) {
  return s.data ? `definido em ${formatDataBR(s.data)}` : `no começo de ${nomeDoMes(s.mes)}`;
}

const comSinal = x => (x.tipo === 'saida' ? -x.valor : x.valor);

// O periodo do relatorio: 0 = tudo; um numero = os ultimos N meses (contando
// o atual, igual aos ranks); 'yyyy-mm' = so aquele mes; { de, ate } = de um
// mes a outro ('yyyy-mm', os dois inclusos - escolhidos ao contrario, vale
// a ordem certa).
function faixaDoPeriodo(periodo, base) {
  if (typeof periodo === 'string') return { de: periodo, ate: periodo };
  if (periodo && typeof periodo === 'object') {
    const [de, ate] = [periodo.de || '', periodo.ate || ''].sort();
    return { de, ate };
  }
  return { de: periodo ? mesISO(1 - periodo, base) : '', ate: '' };
}

// O periodo na forma { de, ate } que os seletores "De"/"Ate" mostram. Pros
// atalhos (3, 6, 12 meses, tudo), o "ate" e o mes de hoje.
export function mesesDoPeriodoFinanceiro(periodo, base = new Date()) {
  const f = faixaDoPeriodo(periodo, base);
  return { de: f.de, ate: f.ate || mesISO(0, base) };
}

export function rotuloDoPeriodoFinanceiro(periodo) {
  if (typeof periodo === 'string') return nomeDoMes(periodo);
  if (periodo && typeof periodo === 'object') {
    const f = faixaDoPeriodo(periodo);
    return f.de === f.ate ? nomeDoMes(f.de) : `${nomeDoMes(f.de)} a ${nomeDoMes(f.ate)}`;
  }
  return nomeDoPeriodo(periodo);
}

// Um periodo de um mes so - o saldo do fim dele e "o saldo no fim do mes".
export function periodoDeUmMes(periodo) {
  const f = faixaDoPeriodo(periodo);
  return !!f.ate && f.de === f.ate;
}

const mesSeguinte = mes => { const [a, m] = mes.split('-').map(Number); return mesISO(1, new Date(a, m - 1, 1)); };

// Mes a mes do periodo, sem pular mes vazio, com o saldo do fim de cada um
// - e a linha do saldo do grafico. Comeca no primeiro mes do periodo (ou no
// primeiro com movimento, em "tudo") e vai ate o fim dele (ou ate hoje, ou
// ate o ultimo mes com movimento, o que vier depois). No maximo 36 meses.
function serieMensal(de, ate, noPeriodo, saldoAnterior, base) {
  const meses = noPeriodo.map(x => x.mes).sort();
  const primeiro = de || meses[0] || mesISO(0, base);
  const ultimo = ate || [mesISO(0, base), meses[meses.length - 1] || ''].sort().pop();
  const serie = [];
  let saldo = saldoAnterior;
  for (let mes = primeiro; mes <= ultimo && serie.length < 36; mes = mesSeguinte(mes)) {
    const doMes = noPeriodo.filter(x => x.mes === mes);
    const entradas = somaReais(doMes.filter(x => x.tipo !== 'saida').map(x => x.valor));
    const saidas = somaReais(doMes.filter(x => x.tipo === 'saida').map(x => x.valor));
    saldo = somaReais([saldo, entradas, -saidas]);
    serie.push({ mes, entradas, saidas, saldo });
  }
  return serie;
}

// O relatorio de controle de um periodo. Tudo o que a tela, o texto, a
// imagem e o PDF mostram sai daqui, pra nunca discordarem.
export function controleCaixinha(dados, periodo, base = new Date()) {
  const livro = movimentosDoCaixa(dados);
  const faixa = faixaDoPeriodo(periodo, base);
  // O periodo nunca comeca antes do saldo inicial: antes dele nao ha conta.
  const de = livro.inicio && livro.inicio > faixa.de ? livro.inicio : faixa.de;
  const noPeriodo = livro.itens.filter(x => x.mes >= de && (!faixa.ate || x.mes <= faixa.ate));
  const antes = livro.itens.filter(x => x.mes < de);

  const saldoAnterior = somaReais([livro.saldoInicial, ...antes.map(comSinal)]);
  const mensalidades = noPeriodo.filter(x => x.origem === 'mensalidade');
  const outras = noPeriodo.filter(x => x.tipo === 'entrada' && x.origem === 'lancamento');
  const saidas = noPeriodo.filter(x => x.tipo === 'saida');

  const porCategoria = {};
  saidas.forEach(x => {
    const c = porCategoria[x.categoria] = porCategoria[x.categoria] || { categoria: x.categoria, valor: 0, itens: [] };
    c.valor = somaReais([c.valor, x.valor]);
    c.itens.push(x);
  });

  const porMes = {};
  noPeriodo.forEach(x => {
    const m = porMes[x.mes] = porMes[x.mes] || { mes: x.mes, entradas: 0, saidas: 0 };
    if (x.tipo === 'saida') m.saidas = somaReais([m.saidas, x.valor]);
    else m.entradas = somaReais([m.entradas, x.valor]);
  });

  // As saidas de cada mes, do mais antigo pro mais novo, e dentro do mes
  // por dia - a ordem em que se le o detalhamento.
  const saidasPorMes = {};
  saidas.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(x => {
    const m = saidasPorMes[x.mes] = saidasPorMes[x.mes] || { mes: x.mes, total: 0, itens: [] };
    m.total = somaReais([m.total, x.valor]);
    m.itens.push(x);
  });

  const totalMensalidades = somaReais(mensalidades.map(x => x.valor));
  const totalOutras = somaReais(outras.map(x => x.valor));
  const totalSaidas = somaReais(saidas.map(x => x.valor));
  const totalEntradas = somaReais([totalMensalidades, totalOutras]);
  return {
    periodo,
    inicio: livro.inicio,
    temSaldoInicial: !!(dados && dados.saldoInicial),
    saldoInicial: livro.saldoInicial,
    antesDoInicio: livro.antesDoInicio,
    // Um mes escolhido que fica antes do saldo inicial: nada a mostrar.
    periodoAntesDoInicio: !!(faixa.ate && livro.inicio && faixa.ate < livro.inicio),
    saldoAnterior,
    entradas: {
      total: totalEntradas,
      mensalidades: totalMensalidades,
      pagamentos: mensalidades.reduce((s, x) => s + x.pagaram, 0),
      outras: totalOutras,
      outrasItens: outras,
    },
    saidas: {
      total: totalSaidas,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.valor - a.valor || a.categoria.localeCompare(b.categoria)),
    },
    saldoFinal: somaReais([saldoAnterior, totalEntradas, -totalSaidas]),
    // O caixa de hoje, tudo somado - nao depende do periodo.
    saldoAtual: somaReais([livro.saldoInicial, ...livro.itens.map(comSinal)]),
    porMes: Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)),
    serie: (faixa.ate && de > faixa.ate) ? [] : serieMensal(de, faixa.ate, noPeriodo, saldoAnterior, base),
    saidasPorMes: Object.values(saidasPorMes).sort((a, b) => a.mes.localeCompare(b.mes)),
    extrato: noPeriodo,
  };
}

const diaMes = iso => formatDataBR(iso).slice(0, 5);
const linhaLancamento = x => `   ↳ ${diaMes(x.data)}${x.descricao ? ' · ' + x.descricao : ''} · ${formatReais(x.valor)}`;

// O relatorio de controle pro WhatsApp: de onde veio, pra onde foi, e
// quanto sobrou. Cada saida aparece com data e descricao - e o "mostrando
// tudo" do relatorio. Nome de integrante nao entra: isto e do caixa, nao de
// quem pagou (esse e o relatorio do mes).
export function textoControleCaixinha(r, escopo) {
  const partes = [
    '💰 *CAIXINHA · CONTROLE* 💰',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · ${rotuloDoPeriodoFinanceiro(r.periodo)}`,
    '',
    `💼 Saldo no início: *${formatReais(r.saldoAnterior)}*`,
    '',
    `🟢 *ENTRADAS: ${formatReais(r.entradas.total)}*`,
  ];
  if (r.entradas.mensalidades) {
    partes.push(`• ${CATEGORIA_MENSALIDADES}: ${formatReais(r.entradas.mensalidades)} (${r.entradas.pagamentos} ${r.entradas.pagamentos === 1 ? 'pagamento' : 'pagamentos'})`);
  }
  if (r.entradas.outras) {
    partes.push(`• ${CATEGORIA_ENTRADA_CAIXINHA}: ${formatReais(r.entradas.outras)}`);
    r.entradas.outrasItens.slice().reverse().forEach(x => partes.push(linhaLancamento(x)));
  }
  if (!r.entradas.total) partes.push('• Nenhuma entrada');
  partes.push('', `🔴 *SAÍDAS: ${formatReais(r.saidas.total)}*`);
  r.saidas.porCategoria.forEach(c => {
    partes.push(`• ${c.categoria}: ${formatReais(c.valor)}`);
    c.itens.slice().reverse().forEach(x => partes.push(linhaLancamento(x)));
  });
  if (!r.saidas.total) partes.push('• Nenhuma saída');
  partes.push('', `💰 *SALDO: ${formatReais(r.saldoFinal)}*`);
  return partes.join('\n');
}
