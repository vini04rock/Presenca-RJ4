// Rank de Insights (publico): aba Total e aba Por rodada.

import { agruparMembrosRodadaPorDivisao } from '../dominio/divisoes.js';
import { divisoesSemRegional } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml, formatDataBR } from '../nucleo/util.js';
import { linhaFuncoes } from '../ui/comuns.js';
import { renderDonutChart, renderSparklineTendencia } from '../ui/graficos.js';

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
      ${renderGrupoRodadaPorDivisao('✅ FIZERAM', agruparMembrosRodadaPorDivisao(membros.filter(m => m.fez)), 'fez')}
      ${renderGrupoRodadaPorDivisao('⭕ NÃO FIZERAM', agruparMembrosRodadaPorDivisao(membros.filter(m => !m.fez)), 'naofez')}
    </div>
  `;
}

export function renderRankInsightsConteudo(d) {
  const porChave = chave => d.divisoes.find(x => x.chave === chave);
  const linhaPct = v => v === null || v === undefined ? '—' : v + '%';

  const totalRodadas = d.membros.reduce((soma, m) => soma + m.rodadas, 0);
  const totalConfirmacoes = d.membros.reduce((soma, m) => soma + m.confirmacoes, 0);
  const totalPct = totalRodadas ? Math.round((totalConfirmacoes / totalRodadas) * 100) : null;

  // Donut de 2 fatias (fez/nao fez) - Insight nao tem motivo de falta como
  // os eventos (so Sim/Nao), entao so precisa das 2 cores, nao das 4 do
  // status de presenca.
  const cardTotal = `
    <div class="card donut-card donut-card-total" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px; font-family:'Rye',serif; font-size:17px;">💡 Rank Total de Insights</div>
      ${renderDonutChart([
        { label: 'Fez', value: totalConfirmacoes, cor: 'var(--status-confirmado)' },
        { label: 'Não fez', value: Math.max(0, totalRodadas - totalConfirmacoes), cor: 'var(--status-infracional)' },
      ], totalPct === null ? '—' : totalPct + '%', 'fazem', 150)}
      <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12.5px;">${d.rodadas} ${d.rodadas === 1 ? 'rodada registrada' : 'rodadas registradas'}</div>
      ${renderSparklineTendencia((state.insightRodadasHistorico || []).map(r => ({
        ev: { data: r.data, nome: 'Rodada de ' + formatDataBR(r.data) },
        pct: r.percentual
      })))}
    </div>
  `;

  const blocoDivisoes = `
    <div class="donut-grid" style="margin-bottom:16px;">
      ${divisoesSemRegional().map(e => {
        const item = porChave(e.chave);
        const fez = item ? item.mediaPorRodada : 0;
        const naoFez = Math.max(0, (item ? item.mediaTotalPorRodada : 0) - fez);
        return `
          <div class="card donut-card">
            <div style="font-weight:600; margin-bottom:8px;">${escapeHtml(e.nome)}</div>
            ${renderDonutChart([
              { label: 'Fez', value: fez, cor: 'var(--status-confirmado)' },
              { label: 'Não fez', value: naoFez, cor: 'var(--status-infracional)' },
            ], linhaPct(item && item.percentual), 'fazem', 110)}
            <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">${fez}/${item ? item.mediaTotalPorRodada : 0} fazem, em média, por rodada</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const blocoMembros = divisoesSemRegional().map(e => {
    const membros = d.membros
      .filter(m => m.divisao === e.nome)
      .sort((a, b) => (b.percentual ?? -1) - (a.percentual ?? -1) || a.nome.localeCompare(b.nome));
    const aberto = state.insightRankExpandedDivisoes.has(e.chave);
    return `
      <div class="card" style="padding: 4px 16px;">
        <div class="division-subheader clicavel" data-action="toggle-insight-rank-divisao" data-value="${e.chave}">
          <span>${aberto ? '▾' : '▸'} ${escapeHtml(e.nome.toUpperCase())}</span>
          <span class="division-counts">${membros.length} ${membros.length === 1 ? 'membro' : 'membros'}</span>
        </div>
        <div class="insight-rank-membros" style="display:${aberto ? 'block' : 'none'};">
          ${membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado.</div>' : membros.map(m => `
            <div class="member-row">
              <div class="member-head">
                <div class="member-info">
                  <span class="member-name">${escapeHtml(m.nome)}</span>
                  ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
                </div>
                <span class="status-badge status-confirmado">${linhaPct(m.percentual)}</span>
              </div>
              ${linhaFuncoes(m.funcoes)}
              <div style="color:var(--text-muted); font-size:11.5px; margin-top:3px;">${m.rodadas ? `${m.confirmacoes} de ${m.rodadas} rodadas` : 'Sem rodadas ainda'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  return cardTotal + blocoDivisoes + blocoMembros;
}
