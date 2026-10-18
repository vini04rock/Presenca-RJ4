// Controle financeiro da caixinha: o saldo, o que entrou, o que saiu e com
// o que se gastou. As contas e o texto do relatorio de controle.
//
// Tres fontes viram uma lista so de movimentos do caixa:
//   - as mensalidades, somadas direto dos meses lancados no "Mes a mes" -
//     nunca lancadas de novo aqui, pra cada real ter um lugar so;
//   - os lancamentos de entrada (doacao extra, rifa...) e de saida;
//   - o saldo inicial: quanto havia no caixa no COMECO de um mes.
//
// O saldo inicial e de um mes, e nao de um dia, de proposito: a mensalidade
// e mensal, e um saldo "de 15/10" deixaria em aberto se o que foi pago em
// outubro ja estava dentro dele ou nao - e dai a conta dobra. Tudo do mes
// do saldo inicial em diante soma em cima dele; o que for de antes fica de
// fora da conta (e a tela avisa quanto ficou).
//
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
  const inicio = dados && dados.saldoInicial ? dados.saldoInicial.mes : '';
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
  const dentro = todos.filter(x => !inicio || x.mes >= inicio);
  return {
    inicio,
    saldoInicial: dados && dados.saldoInicial ? dados.saldoInicial.valor : 0,
    itens: dentro,
    // O que ficou de fora por ser de antes do saldo inicial.
    antesDoInicio: todos.length - dentro.length,
  };
}

const comSinal = x => (x.tipo === 'saida' ? -x.valor : x.valor);

// O periodo do relatorio: 0 = tudo; um numero = os ultimos N meses (contando
// o atual, igual aos ranks); 'yyyy-mm' = so aquele mes.
function faixaDoPeriodo(periodo, base) {
  if (typeof periodo === 'string') return { de: periodo, ate: periodo };
  return { de: periodo ? mesISO(1 - periodo, base) : '', ate: '' };
}

export function rotuloDoPeriodoFinanceiro(periodo) {
  return typeof periodo === 'string' ? nomeDoMes(periodo) : nomeDoPeriodo(periodo);
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
    // O livro de hoje, tudo somado - nao depende do periodo.
    saldoAtual: somaReais([livro.saldoInicial, ...livro.itens.map(comSinal)]),
    porMes: Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)),
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
