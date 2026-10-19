// Estoque de materiais do Regional: movimentar, consultar saldo e ver o
// livro de entradas/saidas. O saldo nunca e digitado: entrada soma, saida
// subtrai, e anulamento preserva o historico.

import { api } from '../nucleo/api.js';
import { escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { dataDoCampoOuAvisar, escapeHtml, formatDataBR, hojeISO, ordenarPorHierarquia } from '../nucleo/util.js';
import { filtrarMovimentosEstoqueAdm, quantidadeEstoqueAdm, resumoEstoqueAdm, textoResumoEstoqueAdm } from '../dominio/estoque-adm.js';

function dados() { return state.estoqueAdmDados || { itens: [], movimentos: [] }; }

function novoForm(tipo) {
  const itens = dados().itens || [];
  return {
    tipo,
    materialId: tipo === 'entrada' && !itens.length ? 'novo' : (itens[0] && itens[0].id) || '',
    materialNome: '', quantidade: '', data: formatDataBR(hojeISO()),
    destinoTipo: 'divisao', destinoId: 'regional', observacao: '',
  };
}

function aviso() {
  const m = state.estoqueAdmMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

function estadoCarregamento() {
  if (state.estoqueAdmCarregando) return '<div class="loading">Carregando estoque…</div>';
  if (state.estoqueAdmErro) return `<div class="alert"><div class="alert-msg">${escapeHtml(state.estoqueAdmErro)}.</div></div>`;
  return '';
}

function opcoesMateriais(soDisponiveis, escolhido) {
  const itens = dados().itens.filter(x => !soDisponiveis || Number(x.quantidade) > 0);
  return itens.map(x => `<option value="${escapeHtml(x.id)}" ${x.id === escolhido ? 'selected' : ''}>${escapeHtml(x.nome)}${soDisponiveis ? ` — ${x.quantidade} disponível` : ''}</option>`).join('');
}

function seletorMaterial(f) {
  const entrada = f.tipo === 'entrada';
  const disponiveis = dados().itens.filter(x => Number(x.quantidade) > 0);
  if (!entrada && !disponiveis.length) return '<div class="empty">Não há material disponível para retirar.</div>';
  return `
    <div class="field">
      <label>Material</label>
      <select data-estoque-adm="materialId">
        ${opcoesMateriais(!entrada, f.materialId)}
        ${entrada ? `<option value="novo" ${f.materialId === 'novo' ? 'selected' : ''}>+ Cadastrar novo material</option>` : ''}
      </select>
    </div>
    ${entrada && f.materialId === 'novo' ? `
      <div class="field"><label>Nome do novo material</label><input type="text" maxlength="60" data-estoque-adm="materialNome" value="${escapeHtml(f.materialNome)}" placeholder="Ex.: Colete, cone, rádio"></div>
    ` : ''}
  `;
}

function opcoesIntegrantes(escolhido) {
  const grupos = {};
  ordenarPorHierarquia(state.roster).forEach(m => {
    const divisao = m.divisao || 'Sem divisão';
    (grupos[divisao] = grupos[divisao] || []).push(m);
  });
  return Object.keys(grupos).sort().map(divisao => `
    <optgroup label="${escapeHtml(divisao)}">
      ${grupos[divisao].map(m => `<option value="${escapeHtml(m.id)}" ${m.id === escolhido ? 'selected' : ''}>${escapeHtml(m.nome)}${m.grau ? ` (${escapeHtml(m.grau)})` : ''}</option>`).join('')}
    </optgroup>
  `).join('');
}

function destinoSaida(f) {
  const integrantes = ordenarPorHierarquia(state.roster);
  if (f.destinoTipo === 'membro' && !integrantes.some(m => m.id === f.destinoId)) f.destinoId = integrantes[0] ? integrantes[0].id : '';
  const divisoes = escoposEmOrdemDeExibicao().filter(e => e.chave !== 'regional');
  if (f.destinoTipo === 'divisao' && !divisoes.some(e => e.chave === f.destinoId)) f.destinoId = divisoes[0] ? divisoes[0].chave : '';
  return `
    <label>Destino</label>
    <div class="estoque-adm-destinos">
      <button class="chip-option ${f.destinoTipo === 'divisao' ? 'active' : ''}" data-action="estoque-adm-destino" data-value="divisao">Divisão</button>
      <button class="chip-option ${f.destinoTipo === 'membro' ? 'active' : ''}" data-action="estoque-adm-destino" data-value="membro">Integrante</button>
    </div>
    <div class="field">
      <label>${f.destinoTipo === 'divisao' ? 'Qual divisão recebeu?' : 'Qual integrante recebeu?'}</label>
      <select data-estoque-adm="destinoId">
        ${f.destinoTipo === 'divisao'
          ? divisoes.map(e => `<option value="${e.chave}" ${e.chave === f.destinoId ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')
          : opcoesIntegrantes(f.destinoId)}
      </select>
    </div>
  `;
}

function formularioMovimento() {
  const f = state.estoqueAdmForm;
  if (!f) return '<div class="empty">Escolha Entrada ou Saída.</div>';
  const semSaida = f.tipo === 'saida' && !dados().itens.some(x => Number(x.quantidade) > 0);
  return `
    <div class="card estoque-adm-form ${f.tipo}">
      <div class="painel-titulo">${f.tipo === 'entrada' ? '🟢 Registrar entrada' : '🔴 Registrar saída'}</div>
      ${seletorMaterial(f)}
      ${semSaida ? '' : `
        <div class="row-gap">
          <div class="field" style="flex:1;"><label>Quantidade</label><input type="text" inputmode="numeric" maxlength="6" data-estoque-adm="quantidade" value="${escapeHtml(f.quantidade)}" placeholder="0"></div>
          <div class="field" style="flex:1;"><label>Data</label><input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="estoque-adm-data" data-estoque-adm="data" value="${escapeHtml(f.data)}" placeholder="dd/mm/aaaa"></div>
        </div>
        ${f.tipo === 'saida' ? destinoSaida(f) : ''}
        <div class="field"><label>Observação (opcional)</label><textarea rows="2" maxlength="200" data-estoque-adm="observacao" placeholder="Ex.: recebido em doação, entregue para evento…">${escapeHtml(f.observacao)}</textarea></div>
        <button class="btn block" data-action="estoque-adm-confirmar" ${state.estoqueAdmSalvando ? 'disabled' : ''}>${state.estoqueAdmSalvando ? 'Salvando…' : f.tipo === 'entrada' ? 'Confirmar entrada' : 'Confirmar saída'}</button>
      `}
    </div>
  `;
}

function renderMovimentar() {
  const f = state.estoqueAdmForm;
  return `
    ${aviso()}
    <div class="estoque-adm-escolhas">
      <button class="card estoque-adm-escolha entrada ${f && f.tipo === 'entrada' ? 'ativa' : ''}" data-action="estoque-adm-tipo" data-value="entrada"><b>🟢 Entrada</b><span>Material recebido</span></button>
      <button class="card estoque-adm-escolha saida ${f && f.tipo === 'saida' ? 'ativa' : ''}" data-action="estoque-adm-tipo" data-value="saida"><b>🔴 Saída</b><span>Material entregue</span></button>
    </div>
    ${formularioMovimento()}
  `;
}

function renderEstoqueAtual() {
  const itens = dados().itens;
  const resumo = resumoEstoqueAdm(itens);
  return `
    ${aviso()}
    <div class="card"><div class="painel-titulo">📦 Estoque atual</div><div class="fin-explica">O saldo é calculado pelas entradas e saídas registradas.</div><div class="doacao-total">${escapeHtml(textoResumoEstoqueAdm(resumo))}</div></div>
    ${itens.length ? `<div class="estoque-lista">${itens.map(x => `
      <div class="card estoque-card${Number(x.quantidade) ? '' : ' acabou'}">
        <div class="estoque-adm-item"><b>${escapeHtml(x.nome)}</b><strong>${x.quantidade} un</strong></div>
        ${Number(x.quantidade) ? '' : '<div class="estoque-acabou-texto">zerado</div>'}
      </div>`).join('')}</div>` : '<div class="empty">Nenhum material cadastrado ainda.</div>'}
  `;
}

function linhaMovimento(m) {
  const entrada = m.tipo === 'entrada';
  const confirmando = state.estoqueAdmAnularId === m.id;
  const destino = !entrada && m.destinoNome ? ` · para ${escapeHtml(m.destinoNome)}` : '';
  return `
    <div class="card estoque-adm-movimento ${entrada ? 'entrada' : 'saida'}${m.anulado ? ' anulado' : ''}">
      <div class="estoque-adm-mov-topo"><b>${entrada ? '🟢 Entrada' : '🔴 Saída'} · ${m.quantidade} un</b><span>${escapeHtml(formatDataBR(m.data))}</span></div>
      <div class="name">${escapeHtml(m.material)}</div>
      <div class="meta">${entrada ? 'Recebido no estoque' : 'Retirado do estoque'}${destino}${m.observacao ? ` · ${escapeHtml(m.observacao)}` : ''}</div>
      ${m.anulado ? '<div class="estoque-adm-anulado">Lançamento anulado</div>' : confirmando ? `
        <div class="alert" style="margin:10px 0 0;"><div class="alert-msg">Anular este lançamento? O saldo será recalculado e o registro continuará no histórico.</div><div class="row-gap" style="margin-top:8px;"><button class="btn danger" data-action="estoque-adm-anular-confirmar" data-id="${escapeHtml(m.id)}">Anular</button><button class="btn secondary" data-action="estoque-adm-anular-cancelar">Cancelar</button></div></div>
      ` : `<button class="btn ghost" style="padding:4px 0; margin-top:6px; font-size:11px;" data-action="estoque-adm-anular-pedir" data-id="${escapeHtml(m.id)}">Corrigir: anular lançamento</button>`}
    </div>
  `;
}

function renderRelatorio() {
  const lista = filtrarMovimentosEstoqueAdm(dados().movimentos, state.estoqueAdmFiltroTipo);
  return `
    ${aviso()}
    <div class="fin-categorias" style="margin-bottom:12px;">
      ${[['todos','Tudo'],['entrada','🟢 Entradas'],['saida','🔴 Saídas']].map(([chave, nome]) => `<button class="pilula ${state.estoqueAdmFiltroTipo === chave ? 'active' : ''}" data-action="estoque-adm-filtro" data-value="${chave}">${nome}</button>`).join('')}
    </div>
    ${lista.length ? lista.map(linhaMovimento).join('') : '<div class="empty">Nenhuma movimentação neste filtro.</div>'}
  `;
}

export function renderAdminEstoqueAdm() {
  const carregando = estadoCarregamento();
  if (carregando) return carregando;
  if (state.adminTab === 'estoque-adm-estoque') return renderEstoqueAtual();
  if (state.adminTab === 'estoque-adm-relatorio') return renderRelatorio();
  return renderMovimentar();
}

export function atualizarCampoEstoqueAdm(el) {
  const chave = el.dataset && el.dataset.estoqueAdm;
  const f = state.estoqueAdmForm;
  if (!chave || !f) return false;
  let valor = el.value;
  if (chave === 'quantidade') {
    valor = valor.replace(/\D/g, '').slice(0, 6);
    el.value = valor;
  }
  f[chave] = valor;
  return true;
}

export const acoes = {
  'estoque-adm-tipo': async (id, target, action, e) => {
    state.estoqueAdmForm = novoForm(target.dataset.value);
    state.estoqueAdmMsg = null;
    return render();
  },
  'estoque-adm-destino': async (id, target, action, e) => {
    state.estoqueAdmForm.destinoTipo = target.dataset.value;
    state.estoqueAdmForm.destinoId = target.dataset.value === 'divisao'
      ? ((escoposEmOrdemDeExibicao().find(e => e.chave !== 'regional') || {}).chave || '')
      : ((ordenarPorHierarquia(state.roster)[0] || {}).id || '');
    return render();
  },
  'estoque-adm-confirmar': async (id, target, action, e) => {
    const f = state.estoqueAdmForm;
    if (!f || state.estoqueAdmSalvando) return;
    const quantidade = quantidadeEstoqueAdm(f.quantidade);
    if (!quantidade) { state.estoqueAdmMsg = { ok:false, texto:'Informe uma quantidade maior que zero.' }; return render(); }
    const data = dataDoCampoOuAvisar('estoque-adm-data', 'A data da movimentação');
    if (data === null) return;
    if (data > hojeISO()) { state.estoqueAdmMsg = { ok:false, texto:'A data não pode ser no futuro.' }; return render(); }
    if (f.tipo === 'entrada' && f.materialId === 'novo' && !String(f.materialNome).trim()) { state.estoqueAdmMsg = { ok:false, texto:'Escreva o nome do novo material.' }; return render(); }
    if (!f.materialId) { state.estoqueAdmMsg = { ok:false, texto:'Escolha o material.' }; return render(); }
    if (f.tipo === 'saida' && !f.destinoId) { state.estoqueAdmMsg = { ok:false, texto:'Escolha quem recebeu o material.' }; return render(); }
    state.estoqueAdmSalvando = true; state.estoqueAdmMsg = null; render();
    try {
      const r = await api('estoqueAdmMovimentar', {
        tipo:f.tipo, materialId:f.materialId === 'novo' ? '' : f.materialId,
        materialNome:f.materialId === 'novo' ? String(f.materialNome).trim() : '',
        quantidade, data, destinoTipo:f.tipo === 'saida' ? f.destinoTipo : '',
        destinoId:f.tipo === 'saida' ? f.destinoId : '', observacao:String(f.observacao || '').trim(),
      });
      state.estoqueAdmDados = { itens:r.itens || [], movimentos:r.movimentos || [] };
      state.estoqueAdmForm = null;
      state.estoqueAdmMsg = { ok:true, texto:`${f.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada com sucesso.` };
    } catch (e) { state.estoqueAdmMsg = { ok:false, texto:e.message }; }
    state.estoqueAdmSalvando = false; render();
  },
  'estoque-adm-filtro': async (id, target, action, e) => { state.estoqueAdmFiltroTipo = target.dataset.value; return render(); },
  'estoque-adm-anular-pedir': async (id, target, action, e) => { state.estoqueAdmAnularId = id; return render(); },
  'estoque-adm-anular-cancelar': async (id, target, action, e) => { state.estoqueAdmAnularId = null; return render(); },
  'estoque-adm-anular-confirmar': async (id, target, action, e) => {
    if (state.estoqueAdmSalvando) return;
    state.estoqueAdmSalvando = true; state.estoqueAdmMsg = null; render();
    try {
      const r = await api('estoqueAdmAnular', { id });
      state.estoqueAdmDados = { itens:r.itens || [], movimentos:r.movimentos || [] };
      state.estoqueAdmMsg = { ok:true, texto:'Lançamento anulado e estoque recalculado.' };
      state.estoqueAdmAnularId = null;
    } catch (e) { state.estoqueAdmMsg = { ok:false, texto:e.message }; }
    state.estoqueAdmSalvando = false; render();
  },
};
