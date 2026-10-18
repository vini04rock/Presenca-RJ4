// Acoes que gravam na planilha nas secoes Doacoes e Caixinha: salvar as
// doacoes de um evento, lancar/corrigir um mes da caixinha, excluir um mes,
// e os lancamentos do controle financeiro (entrada, saida, saldo inicial).
//
// Cada uma grava e busca tudo de novo em seguida, igual ao Insight: o rank
// e as listas sao contas em cima do que a planilha tem, e reler e o jeito
// mais simples de garantir que a tela mostra o que ficou gravado.

import { carregarCaixinha, carregarDoacoes } from '../dados/carregar.js';
import { formatReais, lerValor, nomeDoMes } from '../dominio/caixinha.js';
import { formatKg } from '../dominio/doacoes.js';
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
    const m = state.roster.find(x => x.id === invalido) || state.caixinhaInfo[invalido] || {};
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
    state.caixinhaMsg = { ok: true, texto: `✅ ${nomeDoMes(mes)}: ${r.pagaram} de ${r.total} pagaram${total}.` };
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
}

// Confere o formulario aberto e devolve o que vai pra planilha, ou o texto
// do problema. O Code.gs confere tudo de novo - isto so evita a viagem.
function conferirLancamento(f) {
  if (f.tipo === 'saldoInicial') {
    if (!f.mes) return { erro: 'Escolha o mês.' };
    if (!String(f.valor || '').trim()) return { erro: 'Escreva o valor que havia no caixa (pode ser 0).' };
    const valor = lerValor(f.valor, 1000000);
    if (valor === null) return { erro: 'O valor não está certo. Escreva só o número, como 175 ou 175,50.' };
    return { params: { tipo: 'saldoInicial', mes: f.mes, valor } };
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

const AVISO_SALVO = { saldoInicial: '💼 Saldo inicial salvo', entrada: '🟢 Entrada lançada', saida: '🔴 Saída lançada' };

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
    state.caixinhaFinMsg = { ok: false, texto: /Acao desconhecida/.test(e.message)
      ? 'A planilha ainda está com o Code.gs antigo. Publique a versão nova no Apps Script e tente de novo.'
      : 'Não consegui salvar: ' + e.message + '.' };
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
