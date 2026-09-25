// O bloco do Rank de Insights (donut total, donuts por divisao e a lista
// de integrantes). Vive aqui, e nao dentro de uma tela, porque aparece em
// dois lugares: no Rank de Insights publico e na aba Insights do Modo
// organizador. Enquanto estava dentro de telas/rank-insights.js, mexer
// naquela tela mudava a do organizador sem avisar.

import { numerosInsightDivisao } from '../dominio/estatisticas.js';
import { divisoesSemRegional } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml, formatDataBR } from '../nucleo/util.js';
import { linhaFuncoes } from './comuns.js';
import { renderDonutChart, renderSparklineTendencia } from './graficos.js';

// Media por rodada, com no maximo uma casa: "0,4", "7", "8,1". Inteiro sai
// sem casa nenhuma - "7,0" seria ruido.
export function formatMedia(n) {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

// "historico" e a lista de rodadas do grafico de tendencia. O Rank publico
// nao filtra nada e nem passa o parametro (usa o state, como sempre); a aba
// "Relatorio completo" do organizador passa so as rodadas do periodo
// escolhido, pra linha do tempo bater com os numeros ao lado dela.
export function renderRankInsightsConteudo(d, historico) {
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
      ${renderSparklineTendencia((historico || state.insightRodadasHistorico || []).map(r => ({
        ev: { data: r.data, nome: 'Rodada de ' + formatDataBR(r.data) },
        pct: r.percentual
      })))}
    </div>
  `;

  const blocoDivisoes = `
    <div class="donut-grid" style="margin-bottom:16px;">
      ${divisoesSemRegional().map(e => {
        const item = porChave(e.chave);
        const n = numerosInsightDivisao(item, d.rodadas);
        return `
          <div class="card donut-card">
            <div style="font-weight:600; margin-bottom:8px;">${escapeHtml(e.nome)}</div>
            ${renderDonutChart([
              { label: 'Fez', value: n.fez, cor: 'var(--status-confirmado)' },
              { label: 'Não fez', value: n.naoFez, cor: 'var(--status-infracional)' },
            ], linhaPct(item && item.percentual), 'fazem', 110)}
            <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">${formatMedia(n.mediaFez)} de ${formatMedia(n.mediaTotal)} fazem, em média, por rodada</div>
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
