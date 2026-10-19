// Registrar afastamento, retorno ou desligamento de um integrante, pelo
// painel que abre na linha dele no cadastro de membros.
//
// Diferente do resto do cadastro (que grava otimista e so avisa se der
// errado), aqui a tela espera a planilha confirmar: desligar tira a pessoa
// do cadastro, e um "sumiu e voltou" por erro de rede seria pior que um
// segundo de espera.

import { TIPOS_MOVIMENTO } from '../dominio/movimentos.js';
import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { dataISOdeBR, hojeISO, mostrarAviso } from '../nucleo/util.js';

export function fecharPainelMovimento() {
  state.movMembroId = null;
  state.movTipo = null;
  state.movData = '';
  state.movMotivo = '';
  state.movErro = null;
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
  state.movSalvando = true;
  state.movErro = null;
  render();
  try {
    await api('membroMovimentar', { membroId, tipo, data, motivo: (state.movMotivo || '').trim() });
    aplicarNaMemoria(membroId, tipo, data);
    const m = state.roster.find(x => x.id === membroId);
    mostrarAviso(`${TIPOS_MOVIMENTO[tipo].emoji} ${TIPOS_MOVIMENTO[tipo].label} registrado${m ? ` — ${m.nome}` : ''}`);
    fecharPainelMovimento();
    // O livro na memoria ficou velho; a secao Entrada/Saida busca de novo.
    state.movimentosDados = null;
  } catch (e) {
    state.movErro = 'Não consegui registrar: ' + e.message + '.';
  }
  state.movSalvando = false;
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
