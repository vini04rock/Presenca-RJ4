// Tela "Criar chamada": formulário + prévia do texto + copiar.
//
// O app preenche o que sabe (título, data, divisão, lista de integrantes) e
// o organizador completa o que só ele sabe na hora - roteiro, horários,
// telefone. A prévia atualiza enquanto digita.

import { montarConvocacao, camposIniciais } from '../dominio/convocacao.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml } from '../nucleo/util.js';
import { copiarTexto } from '../nucleo/util.js';
import { render } from '../nucleo/render.js';

function eventoAtual() {
  return state.events.find(e => e.id === state.convocacaoEventoId);
}

// Os convocados, resolvidos do cadastro. A ordem hierárquica é aplicada lá
// dentro, por montarConvocacao.
function convocados(ev) {
  return (ev.memberIds || []).map(id => state.roster.find(m => m.id === id)).filter(Boolean);
}

// O texto como está agora, com o que já foi digitado no formulário.
export function textoDaConvocacao() {
  const ev = eventoAtual();
  if (!ev) return '';
  return montarConvocacao(ev, convocados(ev), state.convocacaoCampos);
}

function campoTexto(chave, rotulo, dica) {
  return `
    <div class="field">
      <label>${escapeHtml(rotulo)}</label>
      <input type="text" data-campo="${chave}" placeholder="${escapeHtml(dica || '')}" value="${escapeHtml(state.convocacaoCampos[chave] || '')}">
    </div>
  `;
}

function campoLinhas(chave, rotulo, linhas, dica) {
  return `
    <div class="field">
      <label>${escapeHtml(rotulo)}</label>
      <textarea data-campo="${chave}" rows="${linhas}" placeholder="${escapeHtml(dica || '')}">${escapeHtml(state.convocacaoCampos[chave] || '')}</textarea>
    </div>
  `;
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

  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="fechar-convocacao">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Criar chamada</h1>
      <div class="sub">${escapeHtml(ev.nome)}</div>
    </div>

    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">O título, a data, a divisão e a lista de integrantes o app já preencheu. Complete o resto e toque em Copiar.</div>
    </div>

    <div class="card">
      ${campoTexto('subtitulo', 'Subtítulo (opcional)', 'Ex: Aniversariantes do mês')}
      ${campoLinhas('destino', 'Destino', 4, 'Uma linha por parte do endereço')}
      ${campoTexto('linkMapa', 'Link do mapa', 'https://maps.app.goo.gl/…')}
      <div class="row-gap">
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Destacamento</label>
          <input type="text" data-campo="destacamento" placeholder="18h30" value="${escapeHtml(state.convocacaoCampos.destacamento || '')}">
        </div>
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Briefing</label>
          <input type="text" data-campo="briefing" placeholder="19h15" value="${escapeHtml(state.convocacaoCampos.briefing || '')}">
        </div>
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Início</label>
          <input type="text" data-campo="inicio" placeholder="19h30" value="${escapeHtml(state.convocacaoCampos.inicio || '')}">
        </div>
      </div>
      <div style="height:14px;"></div>
      ${campoLinhas('informacoes', 'Informações (rodapé)', 6, '')}
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
  app.querySelectorAll('[data-campo]').forEach(campo => {
    campo.addEventListener('input', () => {
      state.convocacaoCampos[campo.dataset.campo] = campo.value;
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
    state.convocacaoCampos = camposIniciais(ev, state.roster);
    state.convocacaoCopiado = false;
    state.view = 'convocacao';
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
