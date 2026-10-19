// Registrar afastamento, retorno, desligamento ou transferencia de um
// integrante, pelo painel que abre na linha dele no cadastro de membros, e
// o "Confirmar grau" de quem chegou transferido.
//
// Diferente do resto do cadastro (que grava otimista e so avisa se der
// errado), aqui a tela espera a planilha confirmar: desligar tira a pessoa
// do cadastro, e um "sumiu e voltou" por erro de rede seria pior que um
// segundo de espera.

import { TIPOS_MOVIMENTO, estaAfastado } from '../dominio/movimentos.js';
import { api } from '../nucleo/api.js';
import { cargosDoGrau, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { dataISOdeBR, hojeISO, mostrarAviso } from '../nucleo/util.js';

export function fecharPainelMovimento() {
  state.movMembroId = null;
  state.movTipo = null;
  state.movData = '';
  state.movMotivo = '';
  state.movErro = null;
  // Os campos da transferencia: a divisao da RJ4 escolhida, ou "outra
  // regional" com a regional e a divisao escritas.
  state.movDestino = null;
  state.movForaDaRJ4 = false;
  state.movRegionalDestino = '';
  state.movDivisaoDestino = '';
  // O "Confirmar grau" tambem mora na linha.
  state.grauMembroId = null;
  // A confirmacao do Remover mora na mesma linha: abrir um fecha o outro.
  state.removerMembroId = null;
}

export async function confirmarMovimento() {
  const membroId = state.movMembroId, tipo = state.movTipo;
  if (!membroId || !tipo) return;
  // Vazio = hoje. Preenchido, tem que ser uma data de verdade.
  const bruto = (state.movData || '').trim();
  const data = bruto ? dataISOdeBR(bruto) : hojeISO();
  if (!data) {
    state.movErro = `"${bruto}" não é uma data válida - escreva como 18/10/2026`;
    return render();
  }
  if (data > hojeISO()) {
    state.movErro = 'A data não pode ser no futuro.';
    return render();
  }
  const params = { membroId, tipo, data, motivo: (state.movMotivo || '').trim() };
  if (tipo === 'transferencia') {
    const destino = destinoDaTransferencia();
    if (destino.erro) {
      state.movErro = destino.erro;
      return render();
    }
    Object.assign(params, destino.params);
  }
  const nome = (state.roster.find(x => x.id === membroId) || {}).nome;
  state.movSalvando = true;
  state.movErro = null;
  render();
  try {
    await api('membroMovimentar', params);
    if (tipo === 'transferencia') {
      transferirNaMemoria(membroId, params, data);
      mostrarAviso(`🔁 ${nome || 'Integrante'} transferido para ${params.destino ? escopoPorChave(params.destino).nome : `${params.regionalDestino} · ${params.divisaoDestino}`}`);
    } else {
      aplicarNaMemoria(membroId, tipo, data);
      mostrarAviso(`${TIPOS_MOVIMENTO[tipo].emoji} ${TIPOS_MOVIMENTO[tipo].label} registrado${nome ? ` — ${nome}` : ''}`);
    }
    fecharPainelMovimento();
    // O livro na memoria ficou velho; a secao Entrada/Saida busca de novo.
    state.movimentosDados = null;
  } catch (e) {
    state.movErro = 'Não consegui registrar: ' + e.message + '.';
  }
  state.movSalvando = false;
  render();
}

// O destino escolhido no painel: uma divisao da RJ4 (botoes) ou outra
// regional (regional e divisao escritas, as duas obrigatorias).
function destinoDaTransferencia() {
  if (!state.movForaDaRJ4) {
    if (!state.movDestino) return { erro: 'Escolha a divisão de destino.' };
    return { params: { destino: state.movDestino } };
  }
  const regional = (state.movRegionalDestino || '').trim();
  const divisao = (state.movDivisaoDestino || '').trim();
  if (!regional) return { erro: 'Escreva a regional de destino.' };
  if (regional.replace(/\s/g, '').toUpperCase() === 'RJ4') return { erro: 'Para a RJ4, toque em "RJ4" e escolha a divisão na lista.' };
  if (!divisao) return { erro: 'Escreva a divisão de destino.' };
  return { params: { regionalDestino: regional, divisaoDestino: divisao } };
}

// A transferencia na memoria do app, igual ao que o Code.gs fez
// (transferirMembro): dentro da RJ4, muda a divisao, apaga o cargo, marca o
// grau a confirmar, tira dos eventos abertos da divisao antiga e poe nos
// abertos da nova (do dia em diante); pra fora, sai do cadastro e de todos
// os eventos abertos.
function transferirNaMemoria(membroId, params, data) {
  const m = state.roster.find(x => x.id === membroId);
  if (!m) return;
  const origem = (escoposEmOrdemDeExibicao().find(e => e.nome === m.divisao) || {}).chave;
  const abertos = ev => ev.status !== 'encerrado';
  if (!params.destino) {
    state.events = state.events.map(ev => abertos(ev) && (ev.memberIds || []).includes(membroId)
      ? { ...ev, memberIds: ev.memberIds.filter(id => id !== membroId) } : ev);
    state.roster = state.roster.filter(x => x.id !== membroId);
    return;
  }
  const destino = params.destino;
  state.events = state.events.map(ev => {
    if (!abertos(ev)) return ev;
    const ids = ev.memberIds || [];
    if (origem !== 'regional' && ev.categoria === origem && ids.includes(membroId)) return { ...ev, memberIds: ids.filter(id => id !== membroId) };
    if (ev.categoria === destino && !estaAfastado(m) && (!ev.data || ev.data >= data) && !ids.includes(membroId)) return { ...ev, memberIds: [...ids, membroId] };
    return ev;
  });
  state.roster = state.roster.map(x => x.id !== membroId ? x
    : { ...x, divisao: escopoPorChave(destino).nome, cargo: '', grauPendente: true });
}

// O "Confirmar grau" de quem chegou por transferencia: grava o grau (e o
// cargo, nos graus VI e V) e tira o lembrete. Espera a planilha, como as
// movimentacoes.
export async function confirmarGrauDoMembro() {
  const membroId = state.grauMembroId;
  if (!membroId) return;
  const grau = state.grauEscolhido || '';
  const cargo = cargosDoGrau(grau).includes(state.cargoEscolhido) ? state.cargoEscolhido : '';
  state.grauSalvando = true;
  state.grauErro = null;
  render();
  try {
    await api('membroConfirmarGrau', { membroId, grau, cargo });
    state.roster = state.roster.map(x => x.id !== membroId ? x : { ...x, grau, cargo, grauPendente: false });
    const m = state.roster.find(x => x.id === membroId);
    mostrarAviso(`✅ Grau confirmado${m ? ` — ${m.nome}` : ''}`);
    state.grauMembroId = null;
  } catch (e) {
    state.grauErro = 'Não consegui confirmar: ' + e.message + '.';
  }
  state.grauSalvando = false;
  render();
}

// O mesmo que o Code.gs fez, na memoria do app, pra tela nao precisar
// recarregar tudo: a situacao no cadastro e, no afastamento e no
// desligamento, a saida dos eventos ainda abertos.
function aplicarNaMemoria(membroId, tipo, data) {
  if (tipo === 'afastamento' || tipo === 'desligamento') {
    state.events = state.events.map(ev => ev.status === 'encerrado' || !(ev.memberIds || []).includes(membroId)
      ? ev
      : { ...ev, memberIds: ev.memberIds.filter(id => id !== membroId) });
  }
  if (tipo === 'desligamento') {
    state.roster = state.roster.filter(m => m.id !== membroId);
    return;
  }
  state.roster = state.roster.map(m => m.id !== membroId ? m : {
    ...m,
    situacao: tipo === 'afastamento' ? 'afastado' : '',
    situacaoDesde: tipo === 'afastamento' ? data : '',
  });
}

// O "Preencher datas" do cadastro: grava de uma vez as datas de ingresso
// escritas na lista (state.entradasRascunho, como foram digitadas). Em
// branco fica sem data. Uma data errada para tudo antes de ir pra planilha.
export async function salvarDatasDeIngresso() {
  const datas = {};
  for (const id of state.preencherEntradasIds || []) {
    const bruto = String(state.entradasRascunho[id] || '').trim();
    if (!bruto) continue;
    const iso = dataISOdeBR(bruto);
    const m = state.roster.find(x => x.id === id) || { nome: 'um integrante' };
    if (!iso) {
      state.entradasMsg = { ok: false, texto: `A data de ${m.nome} ("${bruto}") não é uma data válida - escreva como 12/03/2019.` };
      return render();
    }
    if (iso > hojeISO()) {
      state.entradasMsg = { ok: false, texto: `A data de ${m.nome} não pode ser no futuro.` };
      return render();
    }
    datas[id] = iso;
  }
  if (!Object.keys(datas).length) {
    state.entradasMsg = { ok: false, texto: 'Nenhuma data escrita ainda.' };
    return render();
  }
  state.entradasSalvando = true;
  state.entradasMsg = null;
  render();
  try {
    const r = await api('membrosEntradaSalvar', { datas: JSON.stringify(datas) });
    state.roster = state.roster.map(m => (datas[m.id] ? { ...m, entrada: datas[m.id] } : m));
    state.preencherEntradasIds = null;
    state.entradasRascunho = {};
    state.entradasMsg = { ok: true, texto: `✅ ${r.salvos} ${r.salvos === 1 ? 'data de ingresso salva' : 'datas de ingresso salvas'}.`
      + (r.recusados ? ` ${r.recusados} de outra divisão ficaram de fora.` : '') };
    mostrarAviso('🗓️ Datas salvas');
  } catch (e) {
    // A lista fica como estava: a pessoa tenta de novo.
    state.entradasMsg = { ok: false, texto: /Acao desconhecida/.test(e.message)
      ? 'A planilha ainda está com o Code.gs antigo. Publique a versão nova no Apps Script e tente de novo.'
      : 'Não consegui salvar: ' + e.message + '.' };
  }
  state.entradasSalvando = false;
  render();
}
