// Escolha de divisao e pedido de PIN do Modo organizador e dos Relatorios.

import { loadReportData } from '../dados/carregar.js';
import { api } from '../nucleo/api.js';
import { escoposAtivos, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { escapeHtml } from '../nucleo/util.js';
import { renderCardEscopo } from '../ui/comuns.js';

// As 7 divisoes, cada uma com o proprio PIN (o do Regional tambem abre
// qualquer uma das outras, ver verificarPin no Code.gs). Eventos criados
// aqui dentro ficam marcados com a categoria certa e a lista de membros e
// filtrada pra so mostrar quem e daquela divisao.
export function renderDivisoes(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Modo organizador</h1>
      <div class="sub">Escolha a divisão</div>
    </div>
    ${escoposEmOrdemDeExibicao().map(e => renderCardEscopo(e, 'select-divisao', null)).join('')}
  `;
}

export function renderPin(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-divisoes">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Modo organizador</h1>
    </div>
    <div class="card">
      <label>PIN de acesso</label>
      <input type="tel" inputmode="numeric" maxlength="4" class="pin-input" id="pin-field" placeholder="••••" autofocus ${state.pinVerificando ? 'disabled' : ''}>
      ${state.pinErro ? `<div style="color: #C9A29C; font-size: 13px; margin-bottom: 10px;">${escapeHtml(state.pinErro)}</div>` : ''}
      <button class="btn block" data-action="check-pin" ${state.pinVerificando ? 'disabled' : ''}>${state.pinVerificando ? 'Verificando…' : 'Entrar'}</button>
    </div>
  `;
  const field = document.getElementById('pin-field');
  if (field) {
    field.focus();
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkPin(); });
  }
}

// O PIN nunca e comparado no navegador - so o servidor sabe o valor certo.
// A pagina manda o que foi digitado e recebe de volta so um sim/nao.
export async function checkPin() {
  if (state.pinVerificando) return;
  const val = document.getElementById('pin-field').value.trim();
  if (!val) return;
  state.pinVerificando = true;
  state.pinErro = null;
  render();
  try {
    const r = await api('verificarPin', { escopo: state.adminEscopo, pin: val });
    if (r.valido) {
      state.isAdmin = true;
      state.view = 'admin';
      state.adminTab = 'eventos';
    } else {
      state.pinErro = 'PIN incorreto.';
    }
  } catch (e) {
    state.pinErro = 'Não consegui verificar (' + e.message + '). Tente de novo.';
  }
  state.pinVerificando = false;
  render();
}

// Tela "Relatorios" (colar convocacao) - copia de renderDivisoes/renderPin,
// mas escreve em relatorioEscopo/relatorioIsAdmin em vez de
// adminEscopo/isAdmin, para nao interferir numa sessao do Modo organizador
// que porventura esteja aberta ao mesmo tempo.
export function renderRelatorioDivisoes(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Relatórios</h1>
      <div class="sub">Escolha a divisão</div>
    </div>
    ${escoposAtivos().map(e => renderCardEscopo(e, 'select-relatorio-divisao', null)).join('')}
  `;
}

export function renderRelatorioPin(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-relatorio-divisoes">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Relatórios</h1>
    </div>
    <div class="card">
      <label>PIN de acesso</label>
      <input type="tel" inputmode="numeric" maxlength="4" class="pin-input" id="relatorio-pin-field" placeholder="••••" autofocus ${state.relatorioPinVerificando ? 'disabled' : ''}>
      ${state.relatorioPinErro ? `<div style="color: #C9A29C; font-size: 13px; margin-bottom: 10px;">${escapeHtml(state.relatorioPinErro)}</div>` : ''}
      <button class="btn block" data-action="check-relatorio-pin" ${state.relatorioPinVerificando ? 'disabled' : ''}>${state.relatorioPinVerificando ? 'Verificando…' : 'Entrar'}</button>
    </div>
  `;
  const field = document.getElementById('relatorio-pin-field');
  if (field) {
    field.focus();
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkRelatorioPin(); });
  }
}

export async function checkRelatorioPin() {
  if (state.relatorioPinVerificando) return;
  const val = document.getElementById('relatorio-pin-field').value.trim();
  if (!val) return;
  state.relatorioPinVerificando = true;
  state.relatorioPinErro = null;
  render();
  try {
    const r = await api('verificarPin', { escopo: state.relatorioEscopo, pin: val });
    if (r.valido) {
      state.relatorioIsAdmin = true;
      state.view = 'relatorio';
      // A pagina principal depois do PIN e o "Resumo Relatorio" (os 5
      // donuts) - as outras 6 abas ficam a um clique de distancia.
      state.relatorioTab = 'resumo';
      state.relatorioColarStep = 'texto';
      state.relatorioTipoDetalhe = null;
      state.relatorioFiltroDivisao = 'todas';
      state.relatorioFiltroDataInicio = '';
      state.relatorioFiltroDataFim = '';
      render();
      await loadReportData();
    } else {
      state.relatorioPinErro = 'PIN incorreto.';
    }
  } catch (e) {
    state.relatorioPinErro = 'Não consegui verificar (' + e.message + '). Tente de novo.';
  }
  state.relatorioPinVerificando = false;
  render();
}

// Acoes da escolha de divisao e do PIN.
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'go-divisoes': async (id, target, action, e) => {
    state.view = 'admin-divisoes'; return render();
  },
  'select-divisao': async (id, target, action, e) => {
    state.adminEscopo = target.dataset.value;
    state.view = 'admin-pin';
    state.pinErro = null;
    return render();
  },
  'check-pin': async (id, target, action, e) => {
    return checkPin();
  },
  'go-relatorio-divisoes': async (id, target, action, e) => {
    state.view = 'relatorio-divisoes';
    state.relatorioTextoBruto = '';
    state.relatorioParsed = null;
    state.relatorioSalvarErro = null;
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    state.relatorioEditandoEventoId = null;
    state.relatorioTab = 'resumo';
    state.relatorioColarStep = 'texto';
    state.relatorioCategoriaAlvo = null;
    state.relatorioTipoEscolhido = null;
    state.relatorioTipoDetalhe = null;
    state.relatorioFiltroDivisao = 'todas';
    state.relatorioFiltroDataInicio = '';
    state.relatorioFiltroDataFim = '';
    state.relatorioEstatisticasExpandidas = new Set();
    state.relatorioEventosExpandidos = new Set();
    state.relatorioMembroFichaId = null;
    return render();
  },
  'select-relatorio-divisao': async (id, target, action, e) => {
    state.relatorioEscopo = target.dataset.value;
    // Padrao: a categoria alvo comeca igual ao escopo escolhido (Regional ->
    // "Regional", Barra -> "Barra") - so muda se a pessoa clicar num botao
    // de divisao especifica na tela de colar, ver "set-relatorio-categoria".
    state.relatorioCategoriaAlvo = target.dataset.value;
    state.view = 'relatorio-pin';
    state.relatorioPinErro = null;
    return render();
  },
  'check-relatorio-pin': async (id, target, action, e) => {
    return checkRelatorioPin();
  },
};
