// Acoes que gravam na planilha nas secoes Doacoes e Caixinha: salvar as
// doacoes de um evento, lancar/corrigir um mes da caixinha, excluir um mes,
// os lancamentos do controle financeiro (entrada, saida, saldo inicial) e
// os do estoque das doacoes (entrada, saida, anular).
//
// Cada uma grava e busca tudo de novo em seguida, igual ao Insight: o rank
// e as listas sao contas em cima do que a planilha tem, e reler e o jeito
// mais simples de garantir que a tela mostra o que ficou gravado.

import { carregarCaixinha, carregarDoacoes } from '../dados/carregar.js';
import { divisoesContribuintes, formatReais, lerValor, nomeDoMes, vocabularioCaixinha } from '../dominio/caixinha.js';
import { formatKg } from '../dominio/doacoes.js';
import { lerQuantidade, textoQuantidade } from '../dominio/estoque.js';
import { api } from '../nucleo/api.js';
import { CATEGORIA_ENTRADA_CAIXINHA } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { dataISOdeBR, hojeISO, mostrarAviso } from '../nucleo/util.js';

export async function salvarDoacoes() {
  const eventoId = state.doacoesEventoId;
  if (!eventoId) return;
  state.doacoesSalvando = true;
  render();
  try {
    const r = await api('doacoesSalvar', { eventoId, kgs: JSON.stringify(state.doacoesMarcacoes) });
    const ev = ((state.doacoesDados && state.doacoesDados.eventos) || []).find(e => e.id === eventoId);
    state.doacoesMsg = { ok: true, texto: `✅ ${ev ? ev.nome : 'Evento'}: ${r.doadores} ${r.doadores === 1 ? 'integrante levou' : 'integrantes levaram'} ${formatKg(r.totalKg)}.` };
    state.doacoesEventoId = null;
    state.doacoesMarcacoes = {};
    mostrarAviso('🥫 Doações salvas');
    state.doacoesSalvando = false;
    return carregarDoacoes();
  } catch (e) {
    // A marcacao fica na tela: a pessoa tenta de novo sem refazer nada.
    state.doacoesMsg = { ok: false, texto: 'Não consegui salvar: ' + e.message + '.' };
  }
  state.doacoesSalvando = false;
  render();
}

export async function salvarCaixinha() {
  const mes = state.caixinhaMes;
  if (!mes) return;
  // A mesma trava do Code.gs (salvarCaixinhaMes): sem ninguem na lista, o mes
  // nao tem o que guardar.
  if (!state.caixinhaMembroIds.length) {
    state.caixinhaMsg = { ok: false, texto: 'O mês precisa ter pelo menos 1 integrante na lista.' };
    return render();
  }
  // Valor que nao e valor ("3o", "50000"): avisa quem, em vez de gravar 0.
  const invalido = state.caixinhaMembroIds.find(id => state.caixinhaValores[id] === null);
  if (invalido) {
    const m = state.roster.find(x => x.id === invalido) || divisoesContribuintes().find(x => x.id === invalido) || state.caixinhaInfo[invalido] || {};
    state.caixinhaMsg = { ok: false, texto: `O valor de ${m.nome || 'um integrante'} não está certo. Escreva só o número, como 30 ou 35,50.` };
    return render();
  }
  state.caixinhaSalvando = true;
  render();
  try {
    const valores = {};
    const marcacoes = {};
    state.caixinhaMembroIds.forEach(id => {
      if (state.caixinhaValores[id] > 0) { valores[id] = state.caixinhaValores[id]; marcacoes[id] = true; }
    });
    // As marcacoes vao junto de proposito: o Code.gs de antes dos valores so
    // entende elas, e sem elas gravaria todo mundo como "nao pagou". O novo
    // usa os valores e ignora as marcacoes. Assim publicar o site antes do
    // Code.gs nao estraga nenhum mes.
    const r = await api('caixinhaSalvar', {
      divisao: state.adminEscopo, mes,
      membroIds: state.caixinhaMembroIds.join(','),
      valores: JSON.stringify(valores),
      marcacoes: JSON.stringify(marcacoes),
    });
    const total = r.totalValor === undefined ? '' : ` · ${formatReais(r.totalValor)}`;
    state.caixinhaMsg = { ok: true, texto: `✅ ${nomeDoMes(mes)}: ${r.pagaram} de ${r.total} ${vocabularioCaixinha(state.adminEscopo).pagaram}${total}.` };
    fecharMesCaixinha();
    mostrarAviso('💰 Caixinha salva');
    state.caixinhaSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    state.caixinhaMsg = { ok: false, texto: 'Não consegui salvar: ' + e.message + '.' };
  }
  state.caixinhaSalvando = false;
  render();
}

export async function removerMesCaixinha() {
  const mes = state.caixinhaMes;
  if (!mes) return;
  state.caixinhaSalvando = true;
  render();
  try {
    await api('caixinhaRemover', { divisao: state.adminEscopo, mes });
    state.caixinhaMsg = { ok: true, texto: `🗑️ ${nomeDoMes(mes)} excluído.` };
    fecharMesCaixinha();
    state.caixinhaSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    state.caixinhaMsg = { ok: false, texto: 'Não consegui excluir: ' + e.message + '.' };
  }
  state.caixinhaSalvando = false;
  render();
}

export function fecharMesCaixinha() {
  state.caixinhaMes = null;
  state.caixinhaMembroIds = [];
  state.caixinhaValores = {};
  state.caixinhaValoresTexto = {};
  state.caixinhaInfo = {};
  state.caixinhaMostrarAdicionar = false;
  state.caixinhaConfirmarRemover = false;
}

// ---------- controle financeiro ----------

export function fecharFormFinanceiro() {
  state.caixinhaFinForm = null;
  state.caixinhaFinConfirmarRemover = null;
  state.caixinhaFinConfirmarSaldo = false;
}

// Confere o formulario aberto e devolve o que vai pra planilha, ou o texto
// do problema. O Code.gs confere tudo de novo - isto so evita a viagem.
// O valor do saldo inicial, como foi digitado. Pode ser zero, mas nao
// vazio: em branco nao e "zero", e "esqueci".
export function conferirSaldoInicial(texto) {
  if (!String(texto || '').trim()) return { erro: 'Escreva quanto tem na caixinha (pode ser 0).' };
  const valor = lerValor(texto, 1000000);
  if (valor === null) return { erro: 'O valor não está certo. Escreva só o número, como 175 ou 175,50.' };
  return { valor };
}

function conferirLancamento(f) {
  // Com o formulario aberto, o saldo inicial e sempre CORRECAO - definir
  // pela primeira vez e o card do painel (definirSaldoInicial).
  if (f.tipo === 'saldoInicial') {
    const c = conferirSaldoInicial(f.valor);
    if (c.erro) return c;
    if (!String(f.pinRegional || '').trim()) return { erro: 'Digite o PIN do Regional: só ele corrige o saldo inicial.' };
    return { params: { tipo: 'saldoInicial', valor: c.valor, pinRegional: String(f.pinRegional).trim() } };
  }
  const valor = lerValor(f.valor);
  if (!valor) return { erro: 'Escreva o valor, como 30 ou 120,50.' };
  const bruto = String(f.data || '').trim();
  const data = bruto ? dataISOdeBR(bruto) : hojeISO();
  if (!data) return { erro: `"${bruto}" não é uma data. Escreva no formato dia/mês/ano, como 21/09/2026.` };
  if (data > hojeISO()) return { erro: 'A data não pode ser no futuro.' };
  const categoria = f.tipo === 'entrada' ? CATEGORIA_ENTRADA_CAIXINHA : f.categoria;
  if (!categoria) return { erro: 'Escolha a categoria da saída.' };
  return { params: { tipo: f.tipo, id: f.id || '', data, categoria, descricao: String(f.descricao || '').trim(), valor } };
}

const AVISO_SALVO = { saldoInicial: '🔒 Saldo inicial corrigido', entrada: '🟢 Entrada lançada', saida: '🔴 Saída lançada' };

// O Code.gs de antes do saldo travado pede o mes do saldo ("Mes invalido"),
// e o de antes do controle financeiro nem conhece a acao. Nos dois casos o
// que falta e republicar - diz isso, em vez do erro cru.
function textoDoErro(e, verbo) {
  if (/Acao desconhecida|Mes invalido/.test(e.message)) {
    return 'A planilha ainda está com o Code.gs antigo. Publique a versão nova no Apps Script e tente de novo.';
  }
  return `Não consegui ${verbo}: ${e.message}.`;
}

// Define o saldo inicial pela primeira vez, pelo card do painel - depois de
// confirmado, trava (ver salvarLancamentoCaixinha no Code.gs).
export async function definirSaldoInicial() {
  const c = conferirSaldoInicial(state.caixinhaFinSaldoTexto);
  if (c.erro) {
    state.caixinhaFinConfirmarSaldo = false;
    state.caixinhaFinMsg = { ok: false, texto: c.erro };
    return render();
  }
  state.caixinhaFinSalvando = true;
  state.caixinhaFinMsg = null;
  render();
  try {
    await api('caixinhaLancamentoSalvar', { divisao: state.adminEscopo, tipo: 'saldoInicial', valor: c.valor });
    mostrarAviso('🔒 Saldo inicial salvo e travado');
    state.caixinhaFinSaldoTexto = '';
    state.caixinhaFinConfirmarSaldo = false;
    state.caixinhaFinSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    state.caixinhaFinConfirmarSaldo = false;
    state.caixinhaFinMsg = { ok: false, texto: textoDoErro(e, 'salvar') };
  }
  state.caixinhaFinSalvando = false;
  render();
}

export async function salvarLancamentoFinanceiro() {
  const f = state.caixinhaFinForm;
  if (!f) return;
  const c = conferirLancamento(f);
  if (c.erro) {
    state.caixinhaFinMsg = { ok: false, texto: c.erro };
    return render();
  }
  state.caixinhaFinSalvando = true;
  state.caixinhaFinMsg = null;
  render();
  try {
    await api('caixinhaLancamentoSalvar', { divisao: state.adminEscopo, ...c.params });
    mostrarAviso(f.id ? '✏️ Lançamento corrigido' : AVISO_SALVO[f.tipo]);
    fecharFormFinanceiro();
    state.caixinhaFinSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    // O formulario fica aberto como estava: a pessoa tenta de novo.
    state.caixinhaFinMsg = { ok: false, texto: textoDoErro(e, 'salvar') };
  }
  state.caixinhaFinSalvando = false;
  render();
}

export async function removerLancamentoFinanceiro(id) {
  if (!id) return;
  state.caixinhaFinSalvando = true;
  render();
  try {
    await api('caixinhaLancamentoRemover', { divisao: state.adminEscopo, id });
    mostrarAviso('🗑️ Lançamento excluído');
    fecharFormFinanceiro();
    state.caixinhaFinSalvando = false;
    return carregarCaixinha();
  } catch (e) {
    state.caixinhaFinMsg = { ok: false, texto: 'Não consegui excluir: ' + e.message + '.' };
  }
  state.caixinhaFinSalvando = false;
  render();
}

// ---------- o estoque das doacoes (o livro) ----------

// O formulario de entrada ou saida da aba Estoque (state.estoqueForm):
// confere aqui o que da pra conferir, grava, e o Code.gs devolve o estoque
// inteiro de novo - a tela troca o que tinha pelo que voltou.
export async function lancarNoEstoque() {
  const f = state.estoqueForm;
  if (!f) return;
  const bruto = String(f.data || '').trim();
  const data = bruto ? dataISOdeBR(bruto) : hojeISO();
  const erro = msg => { state.estoqueMsg = { ok: false, texto: msg }; return render(); };
  if (!data) return erro(`"${bruto}" não é uma data válida - escreva como 18/10/2026.`);
  if (data > hojeISO()) return erro('A data não pode ser no futuro.');
  const itens = (state.doacoesDados && state.doacoesDados.estoque && state.doacoesDados.estoque.itens) || [];
  const novo = f.itemId === 'novo';
  const item = novo ? null : itens.find(x => x.id === f.itemId);
  if (!novo && !item) return erro('Escolha o item.');
  if (novo && !String(f.itemNome || '').trim()) return erro('Escreva o nome do item novo.');
  const medida = novo ? f.medida : item.medida;
  const quantidade = lerQuantidade(f.quantidade, medida);
  if (!quantidade) return erro(medida === 'kg' ? 'Escreva a quantidade em kg (até uma casa decimal, ex.: 2,5).' : 'Escreva a quantidade (número inteiro).');
  if (f.tipo === 'saida') {
    if (quantidade > item.saldo + 1e-9) return erro(`Só tem ${textoQuantidade(item.saldo, item.medida)} de ${item.nome}.`);
    if (!f.destino) return erro('Escolha pra onde foi.');
    if (f.destino === 'outro' && !String(f.descricao || '').trim()) return erro('Escreva pra onde foi.');
  }
  state.estoqueSalvando = true;
  state.estoqueMsg = null;
  render();
  try {
    const r = await api('estoqueDoacoesMovimentar', {
      divisao: state.adminEscopo, tipo: f.tipo, data, quantidade,
      ...(novo ? { itemNome: f.itemNome.trim(), medida } : { itemId: item.id }),
      ...(f.tipo === 'saida' ? { destino: f.destino } : {}),
      descricao: String(f.descricao || '').trim(),
    });
    state.doacoesDados = { ...state.doacoesDados, estoque: r.estoque };
    const nome = novo ? f.itemNome.trim() : item.nome;
    mostrarAviso(`${f.tipo === 'saida' ? '🔴 Saída' : '🟢 Entrada'} lançada — ${nome}`);
    // O painel passa a mostrar o item que acabou de mexer.
    const doItem = r.estoque.itens.find(x => x.nome === nome);
    if (doItem) state.estoqueItemId = doItem.id;
    state.estoqueForm = null;
    state.estoqueMsg = null;
  } catch (e) {
    state.estoqueMsg = { ok: false, texto: textoDoErro(e, 'lançar') };
  }
  state.estoqueSalvando = false;
  render();
}

// Anular uma entrada avulsa ou uma saida: a linha fica no extrato, riscada.
export async function anularNoEstoque(id) {
  state.estoqueSalvando = true;
  state.estoqueMsg = null;
  render();
  try {
    const r = await api('estoqueDoacoesAnular', { divisao: state.adminEscopo, id });
    state.doacoesDados = { ...state.doacoesDados, estoque: r.estoque };
    mostrarAviso('↩️ Lançamento anulado');
    state.estoqueAnularId = null;
  } catch (e) {
    state.estoqueMsg = { ok: false, texto: textoDoErro(e, 'anular') };
  }
  state.estoqueSalvando = false;
  render();
}
