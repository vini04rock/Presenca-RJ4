// Tela "Criar chamada": escolha do modelo, formulário, prévia e copiar.
//
// Os campos vêm da definição do modelo (MODELOS, em dominio/convocacao.js),
// não escritos aqui um a um - acrescentar um campo é mexer só lá.

import { MODELOS, camposIniciais, modeloPadrao, montarConvocacao } from '../dominio/convocacao.js';
import { state } from '../nucleo/estado.js';
import { copiarTexto, escapeHtml } from '../nucleo/util.js';
import { render } from '../nucleo/render.js';

function eventoAtual() {
  return state.events.find(e => e.id === state.convocacaoEventoId);
}

// Os convocados, resolvidos do cadastro. A ordem hierárquica é aplicada
// dentro de montarConvocacao.
function convocados(ev) {
  return (ev.memberIds || []).map(id => state.roster.find(m => m.id === id)).filter(Boolean);
}

// O texto como está agora, com o que já foi digitado no formulário.
export function textoDaConvocacao() {
  const ev = eventoAtual();
  if (!ev) return '';
  return montarConvocacao(ev, convocados(ev), state.convocacaoCampos, state.convocacaoModelo);
}

function campo(def) {
  const valor = escapeHtml(state.convocacaoCampos[def.chave] || '');
  const dica = escapeHtml(def.dica || '');
  if (def.linhas > 1) {
    return `
      <div class="field">
        <label>${escapeHtml(def.rotulo)}</label>
        <textarea data-campo="${def.chave}" rows="${def.linhas}" placeholder="${dica}">${valor}</textarea>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>${escapeHtml(def.rotulo)}</label>
      <input type="text" data-campo="${def.chave}" placeholder="${dica}" value="${valor}">
    </div>
  `;
}

// Os campos marcados como "curto" (só horário) ficam lado a lado, pra não
// ocupar três linhas inteiras com três palavras.
function formulario(modelo) {
  const defs = MODELOS[modelo].campos;
  const fora = [];
  for (let i = 0; i < defs.length; i++) {
    if (!defs[i].curto) { fora.push(campo(defs[i])); continue; }
    const grupo = [];
    while (i < defs.length && defs[i].curto) grupo.push(defs[i++]);
    i--;
    fora.push(`<div class="row-gap">${grupo.map(d => `
      <div class="field" style="flex:1; margin-bottom:0;">
        <label>${escapeHtml(d.rotulo)}</label>
        <input type="text" data-campo="${d.chave}" placeholder="${escapeHtml(d.dica || '')}" value="${escapeHtml(state.convocacaoCampos[d.chave] || '')}">
      </div>`).join('')}</div><div style="height:14px;"></div>`);
  }
  return fora.join('');
}

export function renderConvocacao(app) {
  const ev = eventoAtual();
  // Evento apagado enquanto a tela estava aberta: volta pro organizador em
  // vez de mostrar tela vazia.
  if (!ev) {
    state.view = 'admin';
    state.adminTab = 'eventos';
    return render();
  }
  const modelo = state.convocacaoModelo || modeloPadrao(ev);

  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="fechar-convocacao">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Criar chamada</h1>
      <div class="sub">${escapeHtml(ev.nome)}</div>
    </div>

    <div class="card">
      <div style="font-weight:600; margin-bottom:8px;">Modelo</div>
      <div class="chip-grid wide">
        ${Object.keys(MODELOS).map(k => `
          <button class="chip-option ${modelo === k ? 'active' : ''}" data-action="set-convocacao-modelo" data-value="${k}">${escapeHtml(MODELOS[k].nome)}</button>
        `).join('')}
      </div>
      <div class="info-line" style="color:var(--text-muted); margin-top:6px;">${escapeHtml(MODELOS[modelo].para)}</div>
    </div>

    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">O título, a data, a divisão e a lista de integrantes o app já preencheu. Complete o resto e toque em Copiar.</div>
    </div>

    <div class="card">
      ${formulario(modelo)}
    </div>

    <div class="card">
      <div style="font-weight:600; margin-bottom:8px;">Prévia</div>
      <pre id="convocacao-previa" class="convocacao-previa">${escapeHtml(textoDaConvocacao())}</pre>
    </div>

    <button class="btn block" data-action="copiar-convocacao">
      ${state.convocacaoCopiado ? '✓ Copiado!' : '📋 Copiar chamada'}
    </button>
  `;

  // A prévia é atualizada na mão, sem redesenhar a tela: um render() a cada
  // tecla faria o cursor pular pro fim do campo e perder o foco.
  app.querySelectorAll('[data-campo]').forEach(el => {
    el.addEventListener('input', () => {
      state.convocacaoCampos[el.dataset.campo] = el.value;
      const previa = document.getElementById('convocacao-previa');
      if (previa) previa.textContent = textoDaConvocacao();
    });
  });
}

// Ações da tela "Criar chamada".
export const acoes = {
  'abrir-convocacao': async (id, target, action, e) => {
    const ev = state.events.find(x => x.id === id);
    if (!ev) return;
    state.convocacaoEventoId = id;
    state.convocacaoModelo = modeloPadrao(ev);
    state.convocacaoCampos = camposIniciais(ev, state.roster, state.convocacaoModelo);
    state.convocacaoCopiado = false;
    state.view = 'convocacao';
    return render();
  },
  'set-convocacao-modelo': async (id, target, action, e) => {
    const ev = eventoAtual();
    if (!ev) return;
    state.convocacaoModelo = target.dataset.value;
    // Os campos mudam de um modelo pro outro, então recomeçam sugeridos.
    // O que a pessoa tinha digitado no modelo anterior se perde - por isso
    // a escolha fica no topo, antes de qualquer campo.
    state.convocacaoCampos = camposIniciais(ev, state.roster, state.convocacaoModelo);
    return render();
  },
  'fechar-convocacao': async (id, target, action, e) => {
    state.view = 'admin';
    state.adminTab = 'eventos';
    state.convocacaoEventoId = null;
    return render();
  },
  'copiar-convocacao': async (id, target, action, e) => {
    const ok = await copiarTexto(textoDaConvocacao());
    if (!ok) return;
    state.convocacaoCopiado = true;
    render();
    setTimeout(() => {
      state.convocacaoCopiado = false;
      render();
    }, 1600);
  },
};
