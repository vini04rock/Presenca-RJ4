// Rank de Insights (publico): aba Total e aba Por rodada.

import { agruparMembrosRodadaPorDivisao } from '../dominio/divisoes.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml, formatDataBR } from '../nucleo/util.js';
import { renderDonutChart } from '../ui/graficos.js';
import { renderRankInsightsConteudo } from '../ui/insights.js';
import { carregarRankInsights } from '../dados/carregar.js';
import { render } from '../nucleo/render.js';

export function renderRankInsights(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home-escolha">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 21px;">💡 Rank de Insights</h1>
    </div>
    ${state.insightRankError ? `
      <div class="alert">
        <div class="alert-title">Não consegui calcular</div>
        <div class="alert-msg">${escapeHtml(state.insightRankError)}.</div>
        <button class="btn secondary block" data-action="go-rank-insights" style="margin-top:10px;">Tentar de novo</button>
      </div>
    ` : ''}
    ${state.insightRankLoading ? '<div class="alert info"><div class="alert-msg">Calculando…</div></div>' : ''}
    ${!state.insightRankLoading && state.insightRankData ? `
      <div class="chip-grid wide" style="margin-bottom:14px;">
        <button class="chip-option ${state.insightRankTab === 'total' ? 'active' : ''}" data-action="set-insight-rank-tab" data-value="total">Rank total</button>
        <button class="chip-option ${state.insightRankTab === 'porRodada' ? 'active' : ''}" data-action="set-insight-rank-tab" data-value="porRodada">Por rodada</button>
      </div>
      ${state.insightRankTab === 'porRodada' ? renderRankInsightsPorRodada() : renderRankInsightsConteudo(state.insightRankData)}
    ` : ''}
  `;
}

// Aba "Por rodada": lista todas as rodadas carregadas (ver carregarRankInsights,
// ate 30) e, ao tocar numa, expande o grafico so daquela rodada logo abaixo
// dela - mesmo donut fez/nao-fez do consolidado, so que recalculado so com
// os membros daquela rodada (r.membros), em vez da soma de todas.
function renderRankInsightsPorRodada() {
  const rodadas = state.insightRodadasHistorico || [];
  if (!rodadas.length) {
    return `<div class="card"><div class="empty">Nenhuma rodada registrada ainda.</div></div>`;
  }

  return rodadas.map(r => {
    const selecionada = state.insightRankRodadaSelecionada === r.id;
    return `
      <div class="card" style="padding: 4px 16px; margin-bottom:10px;">
        <div class="division-subheader clicavel" data-action="select-insight-rank-rodada" data-id="${r.id}">
          <span>${selecionada ? '▾' : '▸'} ${formatDataBR(r.data)}</span>
          <span class="division-counts">${r.totalSim}/${r.totalElegiveis} · ${r.percentual === null ? '—' : r.percentual + '%'}</span>
        </div>
        ${selecionada ? renderRodadaDetalhe(r) : ''}
      </div>
    `;
  }).join('');
}

// grupoChave: 'fez' ou 'naofez' - so pra distinguir a chave de expandido de
// uma mesma divisao entre os dois blocos (uma pessoa pode querer ver quem
// fez na Barra sem abrir tambem quem nao fez na Barra).
function renderGrupoRodadaPorDivisao(titulo, grupos, grupoChave) {
  if (!grupos.length) return `<div class="info-line" style="color:var(--text-muted); margin-top:10px;">${escapeHtml(titulo)}: ninguém.</div>`;
  return `
    <div style="margin-top:10px;">
      <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(titulo)}</div>
      ${grupos.map(g => {
        const chaveExpandido = grupoChave + '-' + g.e.chave;
        const aberto = state.insightRankRodadaDivisoesExpandidas.has(chaveExpandido);
        return `
          <div style="margin-bottom:4px;">
            <div class="division-subheader clicavel" data-action="toggle-insight-rank-rodada-divisao" data-value="${chaveExpandido}">
              <span>${aberto ? '▾' : '▸'} ${escapeHtml(g.e.nome)}</span>
              <span class="division-counts">${g.membros.length}</span>
            </div>
            ${aberto ? `<div class="info-line" style="white-space:pre-wrap;">${g.membros.map(m => '- ' + escapeHtml(m.nome)).join('\n')}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Um donut por divisao que participou da rodada - o mesmo formato da aba
// "Rank total", so que contando apenas os membros daquela rodada, nao a
// media de todas. Antes esta aba tinha so o donut do total: dava pra ver
// que 60% fizeram, mas nao QUAL divisao puxou pra baixo.
//
// Divisao que nao entrou na rodada nao aparece (agruparMembrosRodadaPorDivisao
// ja corta as vazias) - um donut zerado diria "0% fizeram", que e diferente
// de "nao participou".
function donutsDivisoesDaRodada(membros) {
  const grupos = agruparMembrosRodadaPorDivisao(membros);
  if (!grupos.length) return '';
  return `
    <div class="donut-grid" style="margin-top:14px;">
      ${grupos.map(g => {
        const fez = g.membros.filter(m => m.fez).length;
        const total = g.membros.length;
        const pct = total ? Math.round((fez / total) * 100) : null;
        return `
          <div class="card donut-card">
            <div style="font-weight:600; margin-bottom:8px;">${escapeHtml(g.e.nome)}</div>
            ${renderDonutChart([
              { label: 'Fez', value: fez, cor: 'var(--status-confirmado)' },
              { label: 'Não fez', value: total - fez, cor: 'var(--status-infracional)' },
            ], pct === null ? '—' : pct + '%', 'fazem', 110)}
            <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">${fez} de ${total} ${total === 1 ? 'fez' : 'fizeram'}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderRodadaDetalhe(r) {
  const membros = r.membros || [];
  const fez = membros.filter(m => m.fez).length;
  const naoFez = membros.length - fez;

  return `
    <div style="padding: 8px 0 14px;">
      ${renderDonutChart([
        { label: 'Fez', value: fez, cor: 'var(--status-confirmado)' },
        { label: 'Não fez', value: naoFez, cor: 'var(--status-infracional)' },
      ], r.percentual === null ? '—' : r.percentual + '%', 'fazem', 130)}
      ${donutsDivisoesDaRodada(membros)}
      ${renderGrupoRodadaPorDivisao('✅ FIZERAM', agruparMembrosRodadaPorDivisao(membros.filter(m => m.fez)), 'fez')}
      ${renderGrupoRodadaPorDivisao('⭕ NÃO FIZERAM', agruparMembrosRodadaPorDivisao(membros.filter(m => !m.fez)), 'naofez')}
    </div>
  `;
}

// Acoes do Rank de Insights.
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'go-rank-insights': async (id, target, action, e) => {
    state.view = 'rank-insights';
    return carregarRankInsights();
  },
  'toggle-insight-rank-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.insightRankExpandedDivisoes.has(chave)) state.insightRankExpandedDivisoes.delete(chave);
    else state.insightRankExpandedDivisoes.add(chave);
    return render();
  },
  'set-insight-rank-tab': async (id, target, action, e) => {
    state.insightRankTab = target.dataset.value;
    return render();
  },
  'select-insight-rank-rodada': async (id, target, action, e) => {
    // (o "const id = target.dataset.id" que existia aqui saiu: o id ja chega
    //  como parametro, com exatamente esse mesmo valor)
    state.insightRankRodadaSelecionada = state.insightRankRodadaSelecionada === id ? null : id;
    // Toda vez que a rodada aberta muda, fecha as divisoes que estavam
    // abertas na rodada anterior - senao "Barra" continuaria aberta ao
    // trocar pra outra rodada, sem relacao com o que a pessoa pediu ali.
    state.insightRankRodadaDivisoesExpandidas = new Set();
    return render();
  },
  'toggle-insight-rank-rodada-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.insightRankRodadaDivisoesExpandidas.has(chave)) state.insightRankRodadaDivisoesExpandidas.delete(chave);
    else state.insightRankRodadaDivisoesExpandidas.add(chave);
    return render();
  },
};
