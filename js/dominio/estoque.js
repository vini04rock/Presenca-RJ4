// O Estoque das Doacoes (19/10/2026): um LIVRO de entradas e saidas, no
// molde do Estoque ADM e do Controle financeiro da Caixinha. O saldo de cada
// item nunca e digitado - e a soma do livro, que o Code.gs devolve pronto
// (dadosEstoqueDoacoes). Aqui moram as contas do painel e do relatorio,
// que a tela, o texto e a imagem usam, pra nunca discordarem.
//
// Cada movimento: { id, data, tipo, itemId, item, medida, quantidade,
// origem, destino, descricao, eventoId, anulado }.
//   tipo 'entrada'  - origem 'avulsa' (a mao) ou 'evento' (as doacoes de
//                     "Por evento" entram sozinhas);
//   tipo 'saida'    - com o destino (DESTINOS_SAIDA) e a descricao;
//   tipo 'correcao' - automatica, quando as doacoes de um evento diminuem
//                     ou ele sai: a quantidade ja vem com sinal (-2).
// Anulado nao conta em nada - so aparece no extrato, riscado.
//
// Os itens tem medidas diferentes (un, par, kg), que nao se somam: o
// painel e os graficos mostram UM item por vez (os botoes de item); a
// tabela do relatorio mostra todos, cada um na sua medida.

import { mesISO, nomeDoMes } from './caixinha.js';
import { faixaDoPeriodo } from './caixinha-financeiro.js';
import { escopoPorChave } from '../nucleo/config.js';
import { formatDataBR, hojeISO, normalizarBusca } from '../nucleo/util.js';

// A ordem e a do toque na medida: un -> par -> kg -> un.
export const MEDIDAS = ['un', 'par', 'kg'];
export function proximaMedida(medida) {
  return MEDIDAS[(MEDIDAS.indexOf(medida) + 1) % MEDIDAS.length];
}
export const QUANTIDADE_MAXIMA = 100000;

// O item dos alimentos dos eventos (so nas divisoes): existe sozinho, e as
// doacoes salvas em "Por evento" entram nele.
export const ITEM_ALIMENTOS = 'Alimentos (dos eventos)';

// Pra onde foi uma saida - e o que agrupa a pizza "Para onde foi". A chave
// e o que fica gravado na planilha (DESTINOS_SAIDA_ESTOQUE no Code.gs).
export const DESTINOS_SAIDA = [
  { chave: 'acao_social', emoji: '🤝', label: 'Ação social' },
  { chave: 'familia', emoji: '👨‍👩‍👧', label: 'Família' },
  { chave: 'instituicao', emoji: '🏠', label: 'Instituição' },
  { chave: 'outro', emoji: '📦', label: 'Outro' },
];
export function destinoPorChave(chave) {
  return DESTINOS_SAIDA.find(d => d.chave === chave) || DESTINOS_SAIDA[DESTINOS_SAIDA.length - 1];
}

// O que se conta em pares, e o que se pesa. Quem digitar "Tênis infantil"
// ja ve "par"; quem digitar "Arroz", "kg".
const DE_PAR = /\b(sapato|tenis|chinelo|sandalia|bota|meia)s?\b/;
const DE_KG = /\b(arroz|feijao|acucar|macarrao|farinha|fuba|cafe|sal|alimentos?)\b/;
export function sugerirMedida(nome) {
  const n = normalizarBusca(nome);
  if (DE_PAR.test(n)) return 'par';
  return DE_KG.test(n) ? 'kg' : 'un';
}

// "2,5" - a quantidade no jeito brasileiro (so o kg tem decimal).
export function numeroEstoque(q) {
  return (Number(q) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1, useGrouping: false });
}

// O que se digitou na quantidade -> numero valido pra medida, ou 0. kg
// aceita uma casa decimal (virgula ou ponto); un e par, so inteiro.
export function lerQuantidade(texto, medida) {
  const t = String(texto || '').replace(',', '.').trim();
  if (!t) return 0;
  const n = Number(t);
  if (!isFinite(n) || n <= 0 || n > QUANTIDADE_MAXIMA) return 0;
  if (medida === 'kg') return Math.abs(Math.round(n * 10) / 10 - n) > 1e-9 ? 0 : Math.round(n * 10) / 10;
  return Number.isInteger(n) ? n : 0;
}

// "12 un", "1 par", "6 pares", "2,5 kg".
export function textoQuantidade(quantidade, medida) {
  if (medida === 'par') return `${numeroEstoque(quantidade)} ${Math.abs(quantidade) === 1 ? 'par' : 'pares'}`;
  if (medida === 'kg') return `${numeroEstoque(quantidade)} kg`;
  return `${numeroEstoque(quantidade)} un`;
}

const umaCasa = n => Math.round(n * 10) / 10;

// Quanto o movimento mexe no saldo.
export function sinalDoMovimento(m) {
  if (m.anulado) return 0;
  return m.tipo === 'saida' ? -m.quantidade : m.quantidade;
}

// Um lancamento que da pra anular na tela: entrada avulsa ou saida, ainda
// valendo. O que veio dos eventos se corrige pelas doacoes do evento.
export function podeAnular(m) {
  return !m.anulado && !m.eventoId && m.tipo !== 'correcao';
}

// O titulo de uma linha do extrato.
export function tituloDoMovimento(m) {
  if (m.tipo === 'saida') {
    const d = destinoPorChave(m.destino);
    return `${d.emoji} ${d.label}${m.descricao ? ' · ' + m.descricao : ''}`;
  }
  if (m.tipo === 'correcao') return m.descricao || 'Correção';
  if (m.origem === 'evento') return `🥫 ${m.descricao || 'Evento'}`;
  return m.descricao || 'Entrada avulsa';
}

const mesSeguinte = mes => { const [a, m] = mes.split('-').map(Number); return mesISO(1, new Date(a, m - 1, 1)); };

// O relatorio de um item num periodo (0 = tudo; N = os ultimos N meses;
// 'yyyy-mm'; ou { de, ate } por mes - o mesmo periodo do Controle
// financeiro). Tudo o que o painel, o relatorio, o texto e a imagem mostram
// sai daqui. `tabela` traz todos os itens, cada um na sua medida.
export function relatorioEstoque(dados, itemId, periodo, base = new Date()) {
  const itens = (dados && dados.itens) || [];
  const movimentos = (dados && dados.movimentos) || [];
  const faixa = faixaDoPeriodo(periodo, base);
  const noPeriodo = m => (!faixa.de || m.data.slice(0, 7) >= faixa.de) && (!faixa.ate || m.data.slice(0, 7) <= faixa.ate);
  const antesDoPeriodo = m => faixa.de && m.data.slice(0, 7) < faixa.de;

  const contaDoItem = item => {
    const doItem = movimentos.filter(m => m.itemId === item.id && !m.anulado);
    const periodoItem = doItem.filter(noPeriodo);
    const saldoAnterior = umaCasa(doItem.filter(antesDoPeriodo).reduce((s, m) => s + sinalDoMovimento(m), 0));
    // "Entrou" e o que de fato chegou; as correcoes dos eventos (sempre
    // pra menos) ficam numa conta a parte - senao um mes so com correcao
    // mostraria "entrou −1". Inicio + entrou + correcoes − saiu = fim.
    const soma = tipo => umaCasa(periodoItem.filter(m => m.tipo === tipo).reduce((s, m) => s + m.quantidade, 0));
    const entrou = soma('entrada'), correcoes = soma('correcao'), saiu = soma('saida');
    return { id: item.id, item: item.nome, medida: item.medida, automatico: !!item.automatico,
      saldoAnterior, entrou, correcoes, saiu, saldoFinal: umaCasa(saldoAnterior + entrou + correcoes - saiu), saldoAtual: item.saldo,
      movimentos: periodoItem };
  };

  const tabela = itens.map(contaDoItem);
  const item = itens.find(x => x.id === itemId) || itens[0] || null;
  const r = item ? tabela.find(t => t.id === item.id) : null;

  // De onde veio (eventos x avulsas) e para onde foi (por destino).
  const doPeriodo = r ? r.movimentos : [];
  const deEventos = umaCasa(doPeriodo.filter(m => m.tipo === 'entrada' && m.origem === 'evento').reduce((s, m) => s + m.quantidade, 0));
  const avulsas = umaCasa(doPeriodo.filter(m => m.tipo === 'entrada' && m.origem !== 'evento').reduce((s, m) => s + m.quantidade, 0));
  const porDestino = DESTINOS_SAIDA.map(d => ({ ...d,
    valor: umaCasa(doPeriodo.filter(m => m.tipo === 'saida' && destinoPorChave(m.destino).chave === d.chave).reduce((s, m) => s + m.quantidade, 0)) }))
    .filter(d => d.valor > 0).sort((a, b) => b.valor - a.valor);

  // Mes a mes, sem pular mes vazio, com o saldo do fim de cada um (a linha
  // do grafico). No maximo 36 meses.
  const serie = [];
  if (r) {
    const meses = doPeriodo.map(m => m.data.slice(0, 7)).sort();
    const primeiro = faixa.de || meses[0] || mesISO(0, base);
    const ultimo = faixa.ate || [mesISO(0, base), meses[meses.length - 1] || ''].sort().pop();
    let saldo = r.saldoAnterior;
    for (let mes = primeiro; mes <= ultimo && serie.length < 36; mes = mesSeguinte(mes)) {
      const doMes = doPeriodo.filter(m => m.data.slice(0, 7) === mes);
      const somaMes = tipo => umaCasa(doMes.filter(m => m.tipo === tipo).reduce((s, m) => s + m.quantidade, 0));
      const entradas = somaMes('entrada'), saidas = somaMes('saida');
      saldo = umaCasa(saldo + entradas + somaMes('correcao') - saidas);
      serie.push({ mes, entradas, saidas, saldo });
    }
  }

  // Todas as saidas do periodo (de todos os itens), por mes e por dia - o
  // detalhamento do texto e das imagens.
  const saidasPorMes = {};
  movimentos.filter(m => m.tipo === 'saida' && !m.anulado && noPeriodo(m))
    .slice().sort((a, b) => a.data.localeCompare(b.data))
    .forEach(m => {
      const mes = m.data.slice(0, 7);
      (saidasPorMes[mes] = saidasPorMes[mes] || { mes, itens: [] }).itens.push(m);
    });

  return {
    periodo,
    item: r,
    tabela,
    entradas: { total: r ? r.entrou : 0, eventos: deEventos, avulsas },
    correcoes: r ? r.correcoes : 0,
    saidas: { total: r ? r.saiu : 0, porDestino },
    serie,
    saidasPorMes: Object.values(saidasPorMes).sort((a, b) => a.mes.localeCompare(b.mes)),
    // O extrato do item no periodo, com os anulados (riscados na tela).
    extrato: r ? movimentos.filter(m => m.itemId === r.id && noPeriodo(m)) : [],
  };
}

// "início 6 kg · 🟢 +4 · ↩️ −1 · 🔴 −2,5" - a linha de um item na tabela
// (tela, texto e imagem). A correcao so aparece quando houve.
export function resumoDaLinha(t) {
  return [`início ${textoQuantidade(t.saldoAnterior, t.medida)}`, `🟢 +${numeroEstoque(t.entrou)}`]
    .concat(t.correcoes ? [`↩️ −${numeroEstoque(-t.correcoes)}`] : [])
    .concat([`🔴 −${numeroEstoque(t.saiu)}`]).join(' · ');
}

// O texto pro WhatsApp: cada item com o saldo no inicio e no fim, e o que
// entrou e saiu; depois as saidas, uma por linha, com o destino. Sem nome
// de integrante - so o estoque.
export function textoRelatorioEstoque(r, escopo, rotuloPeriodo) {
  const partes = [
    '📦 *ESTOQUE DE DOAÇÕES* 📦',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · ${rotuloPeriodo}`,
    '',
  ];
  const comMovimento = r.tabela.filter(t => t.saldoAnterior || t.entrou || t.correcoes || t.saiu || t.saldoFinal);
  if (!comMovimento.length) partes.push('Nada no estoque no período.');
  comMovimento.forEach(t => {
    partes.push(`• *${t.item}*: ${textoQuantidade(t.saldoFinal, t.medida)}`);
    partes.push(`   ↳ ${resumoDaLinha(t)}`);
  });
  const nSaidas = r.saidasPorMes.reduce((s, m) => s + m.itens.length, 0);
  partes.push('', `🔴 *SAÍDAS: ${nSaidas}*`);
  if (!nSaidas) partes.push('• Nenhuma saída');
  r.saidasPorMes.forEach(m => {
    partes.push(`_${nomeDoMes(m.mes)}_`);
    m.itens.forEach(x => {
      const d = destinoPorChave(x.destino);
      partes.push(`   ↳ ${formatDataBR(x.data).slice(0, 5)} · ${x.item} ${textoQuantidade(x.quantidade, x.medida)} · ${d.emoji} ${d.label}${x.descricao ? ' · ' + x.descricao : ''}`);
    });
  });
  return partes.join('\n');
}

// O saldo de hoje de cada item, pro grupo - o mesmo da 🖼️ imagem do
// estoque, em texto. itens: [{ item, quantidade, medida }].
export function textoSaldoEstoque(itens, escopo) {
  const partes = [
    '📦 *ESTOQUE DE DOAÇÕES* 📦',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · saldo em ${formatDataBR(hojeISO())}`,
    '',
  ];
  if (!itens.length) partes.push('Nenhum item no estoque.');
  itens.forEach(x => partes.push(`• *${x.item}*: ${textoQuantidade(x.quantidade, x.medida)}`));
  return partes.join('\n');
}
