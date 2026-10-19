// Modo organizador, secao Doacoes: as abas "Por evento" (marcar quem levou
// alimento em cada evento), "Rank" (quem mais levou e quem foi e nao
// levou) e "Estoque" (o que o clube tem guardado, em
// admin-doacoes-estoque.js). As contas moram em dominio/doacoes.js.
//
// So aparece nas divisoes de temDoacoesECaixinha (ver config.js).

import { carregarDoacoes } from '../dados/carregar.js';
import { PERIODOS, dataDoEvento, formatKg, membrosParaMarcar, nomeDoPeriodo, rankDoacoes, rotuloPilula, somaKg, textoDoacoes } from '../dominio/doacoes.js';
import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { soAtivos } from '../dominio/movimentos.js';
import { salvarDoacoes } from '../fluxos/doacoes-caixinha.js';
import { corTipoEvento, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, formatDataCurta, hexParaRgba } from '../nucleo/util.js';
import { linhaFuncoes, medalha, posicoesDoPodio, selinhoIniciais } from '../ui/comuns.js';
import { esqueletoLista, renderDonutChart, renderSparklineTendencia } from '../ui/graficos.js';
import { imagemDoacoes, mostrarPreviaImagem } from '../ui/imagem.js';
import { renderEstoque } from './admin-doacoes-estoque.js';

// Os dados na memoria sao de uma divisao so; dentro de outra, e como se
// nao houvesse nada (a busca ja esta a caminho).
function dados() {
  return state.doacoesDadosEscopo === state.adminEscopo ? state.doacoesDados : null;
}

function eventoAberto() {
  const d = dados();
  return d ? d.eventos.find(e => e.id === state.doacoesEventoId) : null;
}

function aviso() {
  const m = state.doacoesMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

// ---------- aba "Por evento" ----------

function cardEvento(ev) {
  const cor = corTipoEvento(ev.tipo);
  const kg = somaKg(ev.doacoes);
  const doadores = Object.keys(ev.doacoes).length;
  const levaram = ev.confirmados.filter(id => ev.doacoes[id]).length;
  const resumo = doadores
    ? `🥫 <b style="color:var(--white-strong);">${formatKg(kg)}</b> · ${doadores} ${doadores === 1 ? 'levou' : 'levaram'}`
    : 'Nenhuma doação marcada';
  // Do lado da regra: dos ✅ do evento, quantos levaram. So faz sentido
  // depois que o evento acontece.
  const regra = ev.status === 'encerrado' && ev.confirmados.length
    ? ` · ${levaram} de ${ev.confirmados.length} confirmados`
    : '';
  return `
    <div class="card event-card doacao-evento" style="background-color:${ev.tipo ? hexParaRgba(cor, 0.12) : ''}; border-left:3px solid ${cor};" data-action="abrir-doacoes-evento" data-id="${ev.id}">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        ${ev.tipo ? `<div class="tipo-home-icone" style="border-color:${cor}; flex-shrink:0;">${emojiTipoEvento(ev.tipo)}</div>` : ''}
        <div style="min-width:0;">
          <div class="name">${escapeHtml(ev.nome)}</div>
          <div class="meta">${ev.data ? escapeHtml(formatDataCurta(ev.data)) + ' · ' : ''}${resumo}${regra}</div>
        </div>
      </div>
      <div class="arrow">›</div>
    </div>
  `;
}

function listaEventos(d) {
  const ordenados = d.eventos.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const ativos = ordenados.filter(e => e.status !== 'encerrado');
  const encerrados = ordenados.filter(e => e.status === 'encerrado');
  const visiveis = encerrados.slice(0, state.doacoesQtdEncerrados);
  if (!ordenados.length) return '<div class="empty">Nenhum evento desta divisão ainda.<br>Os eventos aparecem aqui assim que forem criados.</div>';
  return `
    <div class="alert info" style="margin-bottom:14px;">
      <div class="alert-msg">Toque num evento pra marcar quem levou alimento. A regra do clube é 1 kg em todo evento.</div>
    </div>
    ${ativos.length ? `<div class="rotulo-secao">Ativos</div>${ativos.map(cardEvento).join('')}` : ''}
    ${encerrados.length ? `<div class="rotulo-secao">Encerrados</div>${visiveis.map(cardEvento).join('')}` : ''}
    ${encerrados.length > visiveis.length ? `
      <button class="btn ghost block" data-action="doacoes-mais-eventos" style="margin-bottom:16px;">Mostrar mais antigos (${encerrados.length - visiveis.length})</button>
    ` : ''}
  `;
}

// Um integrante na marcacao: o toque no nome marca 1 kg (a regra) ou
// desmarca; o − e o + ajustam quando alguem levou mais.
function linhaMarcar(m, ev) {
  const kg = state.doacoesMarcacoes[m.id] || 0;
  const confirmado = ev.confirmados.includes(m.id);
  return `
    <div class="member-row">
      <div class="member-head" data-action="doacao-alternar" data-id="${m.id}">
        <div class="member-info">
          ${selinhoIniciais(m)}
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
          ${confirmado ? '<span title="Confirmado no evento">✅</span>' : ''}
        </div>
        ${kg ? `
          <div class="kg-controle">
            <button class="kg-botao" data-action="doacao-menos" data-id="${m.id}" aria-label="Menos 1 kg">−</button>
            <span class="kg-valor" data-muda="kg:${m.id}" data-valor="${kg}">${formatKg(kg)}</span>
            <button class="kg-botao" data-action="doacao-mais" data-id="${m.id}" aria-label="Mais 1 kg">+</button>
          </div>
        ` : '<span class="status-badge status-nao-fez">🥫 Marcar</span>'}
      </div>
    </div>
  `;
}

function painelMarcar(ev) {
  const membros = membrosParaMarcar(ev, soAtivos(membrosDoEscopo()), state.roster);
  const kgs = Object.values(state.doacoesMarcacoes).filter(Boolean);
  const total = kgs.reduce((s, k) => s + k, 0);
  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-doacoes-evento">‹ Voltar aos eventos</div>
    <div class="card" style="border-left:3px solid ${corTipoEvento(ev.tipo)};">
      <div class="nome-evento-card">${ev.tipo ? emojiTipoEvento(ev.tipo) + ' ' : ''}${escapeHtml(ev.nome)}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-top:5px;">${escapeHtml(dataDoEvento(ev))}${ev.status === 'encerrado' ? ' · encerrado' : ' · ativo'}</div>
      <div class="doacao-total"><b>${formatKg(total)}</b> · ${kgs.length} ${kgs.length === 1 ? 'integrante levou' : 'integrantes levaram'}</div>
    </div>
    ${state.doacoesMsg && !state.doacoesMsg.ok ? aviso() : ''}
    <div class="alert info" style="margin-bottom:12px;">
      <div class="alert-msg">Toque no nome pra marcar 1 kg. Se alguém levou mais, use o +. Os ✅ confirmaram presença no evento.</div>
    </div>
    <div class="card" style="padding: 4px 16px;">
      ${membros.length ? membros.map(m => linhaMarcar(m, ev)).join('') : '<div class="empty">Ninguém convocado neste evento.</div>'}
    </div>
    <div class="row-gap" style="margin-bottom:16px;">
      <button class="btn block" data-action="salvar-doacoes" ${state.doacoesSalvando ? 'disabled' : ''}>${state.doacoesSalvando ? 'Salvando…' : '✅ Salvar doações'}</button>
      <button class="btn secondary block" data-action="fechar-doacoes-evento" ${state.doacoesSalvando ? 'disabled' : ''}>Cancelar</button>
    </div>
  `;
}

// ---------- aba "Rank" ----------

function pilulas() {
  return `
    <div class="pilulas-periodo no-print">
      ${PERIODOS.map(m => `<button class="pilula ${state.doacoesPeriodo === m ? 'active' : ''}" data-action="doacoes-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
    </div>
  `;
}

function renderRank(d) {
  const r = rankDoacoes(d, membrosDoEscopo(), state.doacoesPeriodo);
  const naoLevaram = r.presencas - r.presencasComDoacao;
  const doaram = r.membros.filter(m => m.kg > 0);
  const lugares = posicoesDoPodio(r.membros.map(m => m.kg > 0 ? m.kg : null));

  const cardTotal = `
    <div class="card donut-card donut-card-total" style="margin-bottom:14px;">
      <div class="painel-titulo">🥫 Doações de alimento</div>
      ${pilulas()}
      ${renderDonutChart([
        { label: 'Foram e levaram', value: r.presencasComDoacao, cor: 'var(--status-confirmado)' },
        { label: 'Foram e não levaram', value: naoLevaram, cor: 'var(--status-infracional)' },
      ], r.cumprimento === null ? '—' : r.cumprimento + '%', 'cumprimento', 150)}
      <div class="doacao-total" style="text-align:center;"><b>${formatKg(r.totalKg)}</b> arrecadados em ${r.eventosComDoacao} ${r.eventosComDoacao === 1 ? 'evento' : 'eventos'}</div>
      <div class="info-line" style="padding:2px 0 0; color:var(--text-muted); font-size:12px; text-align:center;">Cumprimento: dos que foram aos eventos encerrados, quantos levaram alimento.</div>
      ${renderSparklineTendencia(r.porEvento.map(x => ({ ev: x.ev, pct: x.pct })))}
      <div class="row-gap no-print" style="margin-top:12px;">
        <button class="btn secondary" style="flex:1;" data-action="copiar-texto-doacoes">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-doacoes">🖼️ Imagem pro grupo</button>
      </div>
    </div>
  `;

  const lista = `
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>🏆 QUEM MAIS LEVOU</span><span class="division-counts">${doaram.length} de ${r.membros.length}</span></div>
      ${r.membros.length === 0 ? '<div class="empty">Nenhum integrante cadastrado nesta divisão.</div>' : r.membros.map((m, i) => `
        <div class="member-row${lugares[i] ? ' podio podio-' + lugares[i] : ''}">
          <div class="member-head" style="cursor:default;">
            <div class="member-info">
              ${medalha(lugares[i])}${selinhoIniciais(m)}
              <span class="member-name">${escapeHtml(m.nome)}</span>
              ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
            </div>
            <span class="status-badge ${m.kg ? 'status-confirmado' : 'status-nao-fez'}">${formatKg(m.kg)}</span>
          </div>
          ${linhaFuncoes(m.funcoes)}
          <div class="doacao-detalhe">${m.foi
            ? `Levou em ${m.levouQuandoFoi} de ${m.foi} ${m.foi === 1 ? 'evento' : 'eventos'} em que foi · <b class="${m.cumprimento === 100 ? 'cumpre' : 'falta-cumprir'}">${m.cumprimento}%</b>`
            : 'Não foi a nenhum evento encerrado no período'}</div>
        </div>
      `).join('')}
    </div>
  `;

  const melhorar = r.melhorar.length ? `
    <div class="card" style="padding: 4px 16px; margin-top:14px;">
      <div class="division-subheader"><span>📌 FORAM E NÃO LEVARAM</span><span class="division-counts">${r.melhorar.length}</span></div>
      ${r.melhorar.map(m => `
        <div class="member-row">
          <div class="member-head" style="cursor:default;">
            <div class="member-info">
              ${selinhoIniciais(m)}
              <span class="member-name">${escapeHtml(m.nome)}</span>
              ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
            </div>
            <span class="status-badge status-nao-fez">${m.foi - m.levouQuandoFoi} sem levar</span>
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  return cardTotal + lista + melhorar;
}

export function renderAdminDoacoes() {
  if (state.doacoesErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar as doações</div>
        <div class="alert-msg">${escapeHtml(state.doacoesErro)}.</div>
        <button class="btn secondary block" data-action="retry-doacoes" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  const d = dados();
  if (!d) return `<div class="card">${esqueletoLista(5)}</div>`;

  if (state.adminTab === 'doacoes-rank') return renderRank(d);
  // No Regional, das Doacoes so existe o estoque.
  if (state.adminTab === 'doacoes-estoque' || state.adminEscopo === 'regional') return renderEstoque();
  const ev = eventoAberto();
  if (ev) return painelMarcar(ev);
  return aviso() + listaEventos(d);
}

// Acoes das duas abas.
export const acoes = {
  'retry-doacoes': async (id, target, action, e) => {
    return carregarDoacoes();
  },
  'abrir-doacoes-evento': async (id, target, action, e) => {
    const d = dados();
    const ev = d && d.eventos.find(x => x.id === id);
    if (!ev) return;
    state.doacoesEventoId = id;
    // Comeca com o que ja estava gravado - abrir de novo e corrigir.
    state.doacoesMarcacoes = { ...ev.doacoes };
    state.doacoesMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'fechar-doacoes-evento': async (id, target, action, e) => {
    state.doacoesEventoId = null;
    state.doacoesMarcacoes = {};
    state.doacoesMsg = null;
    return render();
  },
  // O toque no nome: sem nada, marca a regra (1 kg); com qualquer coisa,
  // desmarca. O − e o + ficam dentro da mesma linha e tem acao propria.
  'doacao-alternar': async (id, target, action, e) => {
    state.doacoesMarcacoes[id] = state.doacoesMarcacoes[id] ? 0 : 1;
    return render();
  },
  'doacao-mais': async (id, target, action, e) => {
    state.doacoesMarcacoes[id] = Math.min(100, (state.doacoesMarcacoes[id] || 0) + 1);
    return render();
  },
  // Abaixo de 1 kg desmarca - o − nunca deixa um "0 kg" marcado na tela.
  'doacao-menos': async (id, target, action, e) => {
    const atual = state.doacoesMarcacoes[id] || 0;
    state.doacoesMarcacoes[id] = atual > 1 ? atual - 1 : 0;
    return render();
  },
  'salvar-doacoes': async (id, target, action, e) => {
    return salvarDoacoes();
  },
  'doacoes-mais-eventos': async (id, target, action, e) => {
    state.doacoesQtdEncerrados += 10;
    return render();
  },
  'doacoes-periodo': async (id, target, action, e) => {
    state.doacoesPeriodo = Number(target.dataset.value);
    return render();
  },
  'copiar-texto-doacoes': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const r = rankDoacoes(d, membrosDoEscopo(), state.doacoesPeriodo);
    return copiarTexto(textoDoacoes(r, state.adminEscopo, state.doacoesPeriodo));
  },
  'imagem-doacoes': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const r = rankDoacoes(d, membrosDoEscopo(), state.doacoesPeriodo);
    return mostrarPreviaImagem(() => imagemDoacoes(r, escopoPorChave(state.adminEscopo).nome, nomeDoPeriodo(state.doacoesPeriodo)), 'doacoes.png');
  },
};
