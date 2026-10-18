// Modo organizador, secao Entrada/Saida: quem entrou, quem esta afastado e
// quem saiu. Numa divisao, o relatorio dela; no Regional, o quadro de todas
// as divisoes, e cada uma abre a propria linha do tempo. As contas moram em
// dominio/movimentos.js; o registro, no cadastro de membros.

import { carregarMovimentos } from '../dados/carregar.js';
import { PERIODOS, nomeDoPeriodo, rotuloPilula } from '../dominio/doacoes.js';
import { TIPOS_MOVIMENTO, quadroRegional, resumoMovimentos, textoMovimentos, textoQuadroRegional } from '../dominio/movimentos.js';
import { escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, formatDataBR } from '../nucleo/util.js';
import { selinhoIniciais } from '../ui/comuns.js';
import { esqueletoLista, renderPizza } from '../ui/graficos.js';
import { imagemMovimentos, imagemQuadroMovimentos, mostrarPreviaImagem } from '../ui/imagem.js';

function dados() {
  return state.movimentosDadosEscopo === state.adminEscopo ? state.movimentosDados : null;
}

// Qual relatorio de divisao esta na tela: a propria divisao, ou a que o
// Regional abriu no quadro. null = o quadro do Regional.
function chaveAberta() {
  if (state.adminEscopo !== 'regional') return state.adminEscopo;
  return state.movimentosDivisaoAberta;
}

function pilulas() {
  return `
    <div class="pilulas-periodo no-print">
      ${PERIODOS.map(m => `<button class="pilula ${state.movimentosPeriodo === m ? 'active' : ''}" data-action="movimentos-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
    </div>
  `;
}

// A pizza dos tres numeros, entre o placar e os botoes. Mesmas cores do
// placar e das imagens: verde entrou, amarelo afastado, vermelho desligado.
function pizzaMovimentos(entradas, afastados, desligamentos) {
  return renderPizza([
    { label: 'Entraram', value: entradas, cor: 'var(--status-confirmado)' },
    { label: 'Afastados agora', value: afastados, cor: '#E0B24D' },
    { label: 'Desligados', value: desligamentos, cor: 'var(--status-infracional)' },
  ], 130, 'Nada no período');
}

// Os tres numeros lado a lado.
function placar(entradas, afastados, desligamentos) {
  return `
    <div class="mov-placar" data-anima="placar:${entradas},${afastados},${desligamentos}">
      <div class="mov-placar-item mov-entrada"><b data-conta="${entradas}">${entradas}</b><span>🟢 Entraram</span></div>
      <div class="mov-placar-item mov-afastamento"><b data-conta="${afastados}">${afastados}</b><span>⏸️ Afastados agora</span></div>
      <div class="mov-placar-item mov-desligamento"><b data-conta="${desligamentos}">${desligamentos}</b><span>🚪 Desligados</span></div>
    </div>
  `;
}

function linhaMovimento(m) {
  const t = TIPOS_MOVIMENTO[m.tipo];
  return `
    <div class="member-row mov-linha mov-${m.tipo}">
      <div class="member-head" style="cursor:default;">
        <div class="member-info">
          <span class="mov-emoji" aria-hidden="true">${t.emoji}</span>
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        </div>
        <span class="mov-data">${m.data ? escapeHtml(formatDataBR(m.data)) : '—'}</span>
      </div>
      <div class="mov-tipo">${escapeHtml(t.label)}${m.motivo ? ` · <span class="mov-motivo">${escapeHtml(m.motivo)}</span>` : ''}</div>
    </div>
  `;
}

function relatorioDivisao(movimentos, chave) {
  const r = resumoMovimentos(movimentos, state.roster, chave, state.movimentosPeriodo);
  const voltar = state.adminEscopo === 'regional'
    ? '<div class="btn ghost" style="margin-bottom:10px;" data-action="voltar-quadro-movimentos">‹ Todas as divisões</div>'
    : '';
  return `
    ${voltar}
    <div class="card">
      <div class="painel-titulo">🔄 ${escapeHtml(escopoPorChave(chave).nome)}</div>
      ${pilulas()}
      ${placar(r.entradas.length, r.afastadosAgora.length, r.desligamentos.length)}
      ${pizzaMovimentos(r.entradas.length, r.afastadosAgora.length, r.desligamentos.length)}
      <div class="info-line" style="padding:10px 0 0; color:var(--text-muted); font-size:12px;">Entraram e desligados: no período. Afastados: quem está afastado hoje.</div>
      <div class="row-gap no-print" style="margin-top:12px;">
        <button class="btn secondary" style="flex:1;" data-action="copiar-texto-movimentos" data-value="${chave}">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-movimentos" data-value="${chave}">🖼️ Imagem pro grupo</button>
      </div>
      <div class="info-line" style="padding:6px 0 0; color:var(--text-muted); font-size:11.5px;">O motivo não vai no texto nem na imagem.</div>
    </div>
    ${r.afastadosAgora.length ? `
      <div class="card" style="padding: 4px 16px;">
        <div class="division-subheader"><span>⏸️ AFASTADOS AGORA</span><span class="division-counts">${r.afastadosAgora.length}</span></div>
        ${r.afastadosAgora.map(m => `
          <div class="member-row">
            <div class="member-head" style="cursor:default;">
              <div class="member-info">
                ${selinhoIniciais(m)}
                <span class="member-name">${escapeHtml(m.nome)}</span>
                ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
              </div>
              <span class="mov-data">${m.situacaoDesde ? 'desde ' + escapeHtml(formatDataBR(m.situacaoDesde)) : ''}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>LINHA DO TEMPO</span><span class="division-counts">${r.linhaDoTempo.length}</span></div>
      ${r.linhaDoTempo.length
        ? r.linhaDoTempo.map(linhaMovimento).join('')
        : `<div class="empty">Nenhuma movimentação ${state.movimentosPeriodo ? 'nesse período' : 'registrada ainda'}.<br>Afastamento e desligamento se registram no cadastro de Membros.</div>`}
    </div>
  `;
}

function quadro(movimentos) {
  const q = quadroRegional(movimentos, state.roster, state.movimentosPeriodo);
  return `
    <div class="card">
      <div class="painel-titulo">🔄 Entrada e saída — RJ4</div>
      ${pilulas()}
      ${placar(q.total.entradas, q.total.afastados, q.total.desligamentos)}
      ${pizzaMovimentos(q.total.entradas, q.total.afastados, q.total.desligamentos)}
      <div class="info-line" style="padding:10px 0 0; color:var(--text-muted); font-size:12px;">A soma de todas as divisões. Toque numa divisão abaixo pra ver só a dela.</div>
      <div class="row-gap no-print" style="margin-top:12px;">
        <button class="btn secondary" style="flex:1;" data-action="copiar-quadro-movimentos">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-quadro-movimentos">🖼️ Imagem pro grupo</button>
      </div>
    </div>
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>POR DIVISÃO</span><span class="division-counts">🟢 · ⏸️ · 🚪</span></div>
      ${q.linhas.map(l => `
        <div class="member-row mov-quadro-linha" data-action="abrir-movimentos-divisao" data-value="${l.e.chave}">
          <div class="member-head">
            <span class="member-name">${escapeHtml(l.e.nome)}</span>
            <span class="mov-quadro-numeros">
              <span class="mov-num mov-entrada${l.entradas ? '' : ' zero'}">🟢 ${l.entradas}</span>
              <span class="mov-num mov-afastamento${l.afastados ? '' : ' zero'}">⏸️ ${l.afastados}</span>
              <span class="mov-num mov-desligamento${l.desligamentos ? '' : ' zero'}">🚪 ${l.desligamentos}</span>
              <span class="arrow">›</span>
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderAdminMovimentos() {
  if (state.movimentosErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar o Entrada/Saída</div>
        <div class="alert-msg">${escapeHtml(state.movimentosErro)}.</div>
        <button class="btn secondary block" data-action="retry-movimentos" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  const d = dados();
  if (!d) return `<div class="card">${esqueletoLista(5)}</div>`;
  const chave = chaveAberta();
  return chave ? relatorioDivisao(d, chave) : quadro(d);
}

export const acoes = {
  'retry-movimentos': async (id, target, action, e) => {
    return carregarMovimentos();
  },
  'movimentos-periodo': async (id, target, action, e) => {
    state.movimentosPeriodo = Number(target.dataset.value);
    return render();
  },
  'abrir-movimentos-divisao': async (id, target, action, e) => {
    state.movimentosDivisaoAberta = target.dataset.value;
    window.scrollTo(0, 0);
    return render();
  },
  'voltar-quadro-movimentos': async (id, target, action, e) => {
    state.movimentosDivisaoAberta = null;
    return render();
  },
  'copiar-texto-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const r = resumoMovimentos(d, state.roster, target.dataset.value, state.movimentosPeriodo);
    return copiarTexto(textoMovimentos(r, state.movimentosPeriodo));
  },
  'imagem-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const chave = target.dataset.value;
    const r = resumoMovimentos(d, state.roster, chave, state.movimentosPeriodo);
    return mostrarPreviaImagem(() => imagemMovimentos(r, escopoPorChave(chave).nome, nomeDoPeriodo(state.movimentosPeriodo)), `entrada-saida-${chave}.png`);
  },
  'copiar-quadro-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    return copiarTexto(textoQuadroRegional(quadroRegional(d, state.roster, state.movimentosPeriodo), state.movimentosPeriodo));
  },
  'imagem-quadro-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const q = quadroRegional(d, state.roster, state.movimentosPeriodo);
    return mostrarPreviaImagem(() => imagemQuadroMovimentos(q, nomeDoPeriodo(state.movimentosPeriodo)), 'entrada-saida-rj4.png');
  },
};
