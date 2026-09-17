// Modo organizador: abas Eventos, Membros, Presencas, Insights e Relatorio.

import { agruparMembrosRodadaPorDivisao } from '../dominio/divisoes.js';
import { eventosDoEscopo, membrosDoEscopo, membrosElegiveisEvento } from '../dominio/estatisticas.js';
import { computeCounts, getReportGroups } from '../dominio/status.js';
import { FUNCOES, GRAUS, cargosDoGrau, TIPOS_EVENTO, corTipoEvento, divisoesSemRegional, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { TIPO_HOME_IMAGEM } from '../nucleo/imagens.js';
import { escapeHtml, formatDataBR, formatDataCurta, hexParaRgba } from '../nucleo/util.js';
import { renderRankInsightsConteudo } from '../ui/insights.js';
import { selosFuncoes } from '../ui/comuns.js';
import { renderDonutChart, segmentosDonutStatus } from '../ui/graficos.js';
import { loadEstatisticas, loadInsightStats, loadReportData, salvarOuAvisar } from '../dados/carregar.js';
import { paramsDeEvento } from '../fila/presenca.js';
import { cancelarAjusteInsightRodada, confirmarInsightRodada, excluirInsightRodada, iniciarAjusteInsightRodada, reincluirMembroInsight, removerMembroInsight, salvarAjusteInsightRodada } from '../fluxos/insights.js';
import { copyInsightReportToClipboard, copyReportToClipboard, exportarRelatorioPdfAdmin, gerarRelatorio } from '../fluxos/relatorio.js';
import { render } from '../nucleo/render.js';

// A data do evento como pastilha no canto superior direito do card - a
// mesma .event-date-badge que a lista de eventos da tela inicial ja usa, pra
// nao inventar um segundo jeito de mostrar data. Fundo solido, entao ela se
// le por cima da arte do card.
//
// "no-fluxo" e pra quando o canto ja esta ocupado (o +/- da aba Relatorio):
// ali a pastilha entra na propria linha, ao lado do sinal.
function dataDoCard(ev, noFluxo) {
  if (!ev.data) return '';
  return `<div class="event-date-badge${noFluxo ? ' no-fluxo' : ''}">${formatDataCurta(ev.data)}</div>`;
}

function renderAdminPresencas() {
  if (state.estatisticasError) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar</div>
        <div class="alert-msg">${escapeHtml(state.estatisticasError)}.</div>
        <button class="btn secondary block" data-action="retry-estatisticas" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (state.estatisticasLoading || !state.estatisticas) {
    return '<div class="alert info"><div class="alert-msg">Calculando presença de cada membro…</div></div>';
  }
  if (!state.estatisticas.length) {
    return '<div class="empty">Nenhum membro cadastrado ainda.</div>';
  }

  // Quem nunca teve evento encerrado (percentual null) fica no fim, sem
  // competir com quem ja tem historico de verdade.
  const lista = [...state.estatisticas].sort((a, b) => {
    if (a.percentual === null && b.percentual === null) return a.nome.localeCompare(b.nome);
    if (a.percentual === null) return 1;
    if (b.percentual === null) return -1;
    return b.percentual - a.percentual || a.nome.localeCompare(b.nome);
  });

  return `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Percentual de presença nos eventos já encerrados de ${escapeHtml(escopoPorChave(state.adminEscopo).nome)}. Quem entrou depois de um evento não é contado nele.</div>
    </div>
    ${lista.map(m => {
      if (m.percentual === null) {
        return `
          <div class="card presenca-row">
            <div class="presenca-nome">${escapeHtml(m.nome)}</div>
            <div class="presenca-sem-dados">Sem eventos encerrados ainda</div>
          </div>
        `;
      }
      return `
        <div class="card presenca-row">
          <div class="presenca-info">
            <div class="presenca-nome">${escapeHtml(m.nome)}</div>
            <div class="presenca-contagem">${m.confirmacoes} de ${m.convites} eventos</div>
          </div>
          <div class="presenca-pct-wrap">
            <div class="presenca-barra"><div class="presenca-barra-fill" style="width:${m.percentual}%"></div></div>
            <div class="presenca-pct">${m.percentual}%</div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// Painel de ajuste de uma rodada ja registrada (ver iniciarAjusteInsightRodada) -
// troca de lugar com o bloco de "marcar rodada nova" enquanto uma rodada
// esta sendo corrigida. Usa os proprios membros daquela rodada (r.membros),
// nao a lista atual de elegiveis, e reaproveita agruparMembrosRodadaPorDivisao
// (mesma funcao da aba publica "Por rodada") pra agrupar por divisao.
// membros atuais da edicao vem de insightAjusteMembroIds/insightAjusteInfo
// (a "lista de trabalho"), nao mais direto de r.membros - ela muda conforme
// o organizador remove/adiciona gente antes de salvar (ver
// iniciarAjusteInsightRodada/ajuste-rodada-remover-membro/-adicionar-membro).
function renderAjusteInsightRodada() {
  const r = (state.insightRodadasHistorico || []).find(x => x.id === state.insightEditandoRodadaId);
  if (!r) return '';
  const membrosAtuais = state.insightAjusteMembroIds.map(id => ({
    id,
    nome: (state.insightAjusteInfo[id] || {}).nome || '(sem nome)',
    divisao: (state.insightAjusteInfo[id] || {}).divisao || ''
  }));
  const grupos = agruparMembrosRodadaPorDivisao(membrosAtuais);
  // So quem esta elegivel pro insight hoje pode ser adicionado - nao da pra
  // oferecer alguem que ja saiu do clube, por exemplo.
  const candidatos = (state.insightStats ? state.insightStats.membros : [])
    .filter(m => !state.insightAjusteMembroIds.includes(m.id));
  const gruposCandidatos = agruparMembrosRodadaPorDivisao(candidatos);

  return `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Ajustando a rodada de ${formatDataBR(r.data)}. Toque num integrante pra trocar entre Fez/Não fez, ou remova/adicione quem participou.</div>
    </div>
    ${grupos.map(g => {
      const aberto = state.insightAjusteDivisoesExpandidas.has(g.e.chave);
      return `
      <div class="card" style="padding: 4px 16px; margin-bottom:12px;">
        <div class="division-subheader clicavel" data-action="toggle-ajuste-rodada-divisao" data-value="${g.e.chave}">
          <span>${aberto ? '▾' : '▸'} ${escapeHtml(g.e.nome.toUpperCase())}</span>
          <span class="division-counts">${g.membros.length}</span>
        </div>
        ${aberto ? g.membros.map(m => {
          const marcado = !!state.insightMarcacoes[m.id];
          return `
            <div class="member-row">
              <div class="member-head" data-action="toggle-insight-marca" data-id="${m.id}">
                <span class="member-name">${escapeHtml(m.nome)}</span>
                <span class="status-badge ${marcado ? 'status-confirmado' : 'status-nao-fez'}">${marcado ? '✅ Fez' : '⬜ Não fez'}</span>
              </div>
              <button class="btn ghost" data-action="ajuste-rodada-remover-membro" data-id="${m.id}" style="margin-top:6px; padding:4px 10px; font-size:11px;">Remover desta rodada</button>
            </div>
          `;
        }).join('') : ''}
      </div>
    `;
    }).join('')}

    <div class="card" style="padding: 4px 16px; margin-bottom:12px;">
      <div class="division-subheader clicavel" data-action="toggle-ajuste-rodada-adicionar">
        <span>${state.insightAjusteMostrarAdicionar ? '▾' : '▸'} Adicionar integrante que faltou nesta rodada</span>
      </div>
      ${state.insightAjusteMostrarAdicionar ? (
        gruposCandidatos.length === 0
          ? '<div class="empty">Todo mundo elegível já está nesta rodada.</div>'
          : gruposCandidatos.map(g => `
              <div style="margin-bottom:8px;">
                <div style="font-weight:600; font-size:12.5px; color:var(--text-muted); margin:8px 0 4px;">${escapeHtml(g.e.nome)}</div>
                ${g.membros.map(m => `
                  <div class="member-row">
                    <div class="member-head" style="cursor:default;">
                      <span class="member-name">${escapeHtml(m.nome)}</span>
                      <button class="btn ghost" data-action="ajuste-rodada-adicionar-membro" data-id="${m.id}" style="padding:4px 10px; font-size:11px;">+ Adicionar</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `).join('')
      ) : ''}
    </div>

    <div class="row-gap" style="margin-bottom:16px;">
      <button class="btn block" data-action="salvar-ajuste-insight-rodada" ${state.insightSalvando ? 'disabled' : ''}>
        ${state.insightSalvando ? 'Salvando…' : '✅ Salvar ajuste'}
      </button>
      <button class="btn secondary block" data-action="cancelar-ajuste-insight-rodada" ${state.insightSalvando ? 'disabled' : ''}>Cancelar</button>
    </div>
  `;
}

// Aba Insights - so aparece dentro do Regional (ver renderAdmin). Lista de
// marcacao agrupada por divisao, ordenada pelo % historico de cada um
// (maior primeiro), com o cabecalho de cada divisao mostrando a media de
// participantes por rodada. Confirmar grava tudo em lote no servidor e
// zera as marcacoes pra proxima rodada.
function renderAdminInsights() {
  if (state.insightStatsError) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar</div>
        <div class="alert-msg">${escapeHtml(state.insightStatsError)}.</div>
        <button class="btn secondary block" data-action="retry-insight-stats" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (state.insightStatsLoading || !state.insightStats) {
    return '<div class="alert info"><div class="alert-msg">Carregando dados do insight…</div></div>';
  }

  const d = state.insightStats;
  const porChave = chave => d.divisoes.find(x => x.chave === chave);

  const resultado = state.insightResultado ? `
    <div class="alert ok" style="margin-bottom:16px;">
      <div class="alert-msg">✅ Rodada ${state.insightResultado.ajuste ? 'ajustada' : 'registrada'}: ${state.insightResultado.totalSim}/${state.insightResultado.totalElegiveis} fizeram o insight (${state.insightResultado.percentual}%)</div>
    </div>
  ` : '';

  const erro = state.insightErro ? `
    <div class="alert" style="margin-bottom:16px;">
      <div class="alert-title">Algo deu errado</div>
      <div class="alert-msg">${escapeHtml(state.insightErro)}.</div>
    </div>
  ` : '';

  const blocoMarcacao = divisoesSemRegional().map(e => {
    const item = porChave(e.chave);
    const membros = d.membros
      .filter(m => m.divisao === e.nome)
      .sort((a, b) => (b.percentual ?? -1) - (a.percentual ?? -1) || a.nome.localeCompare(b.nome));
    const aberto = state.insightExpandedDivisoes.has(e.chave);
    return `
      <div class="card" style="padding: 4px 16px; margin-bottom:12px;">
        <div class="division-subheader clicavel" data-action="toggle-insight-divisao-grupo" data-value="${e.chave}">
          <span>${aberto ? '▾' : '▸'} ${escapeHtml(e.nome.toUpperCase())}</span>
          <span class="division-counts">${item ? item.mediaPorRodada : 0}/${item ? item.mediaTotalPorRodada : 0} por rodada &nbsp;·&nbsp; <b>${item && item.percentual !== null ? item.percentual + '%' : '—'}</b></span>
        </div>
        ${aberto ? (membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado.</div>' : membros.map(m => {
          const marcado = !!state.insightMarcacoes[m.id];
          return `
            <div class="member-row">
              <div class="member-head" data-action="toggle-insight-marca" data-id="${m.id}">
                <div class="member-info-wrap">
                  <span class="member-name">${escapeHtml(m.nome)}</span>
                  <div style="color:var(--text-muted); font-size:11.5px; margin-top:2px;">${m.rodadas ? `${m.percentual}% (${m.confirmacoes} de ${m.rodadas} rodadas)` : 'Sem rodadas ainda'}</div>
                </div>
                <span class="status-badge ${marcado ? 'status-confirmado' : 'status-nao-fez'}">${marcado ? '✅ Fez' : '⬜ Não fez'}</span>
              </div>
              <button class="btn ghost" data-action="insight-remover-membro" data-id="${m.id}" style="margin-top:6px; padding:4px 10px; font-size:11px;">Remover da lista</button>
            </div>
          `;
        }).join('')) : ''}
      </div>
    `;
  }).join('');

  const historico = (state.insightRodadasHistorico || []).length === 0 ? '' : `
    <div class="card" style="padding: 4px 16px; margin-top:8px; margin-bottom:16px;">
      <div class="division-subheader" style="padding-top:12px;"><span>ÚLTIMAS RODADAS</span></div>
      ${state.insightRodadasHistorico.map(r => `
        <div class="member-row">
          <div class="member-head" style="cursor:default;">
            <div>
              <span class="member-name">${formatDataBR(r.data)}</span>
              <div style="color:var(--text-muted); font-size:11.5px; margin-top:2px;">${r.totalSim}/${r.totalElegiveis} fizeram · ${r.percentual}%</div>
            </div>
            ${state.insightConfirmDeleteRodadaId === r.id ? `
              <span class="row-gap">
                <button class="btn danger" style="padding:6px 10px; font-size:12px;" data-action="delete-insight-rodada" data-id="${r.id}">Excluir</button>
                <button class="btn secondary" style="padding:6px 10px; font-size:12px;" data-action="cancel-delete-insight-rodada">Cancelar</button>
              </span>
            ` : `
              <span class="row-gap">
                <button class="btn ghost" style="padding:6px 10px; font-size:12px;" data-action="copy-insight-report" data-id="${r.id}">${state.copiedInsightRodadaId === r.id ? 'Copiado ✓' : '📋 Copiar relatório'}</button>
                <button class="btn ghost" style="padding:6px 10px; font-size:12px;" data-action="ajustar-insight-rodada" data-id="${r.id}">✏️ Ajustar</button>
                <button class="btn ghost" style="padding:6px 10px; font-size:12px;" data-action="ask-delete-insight-rodada" data-id="${r.id}">Excluir</button>
              </span>
            `}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const excluidos = d.excluidos || [];
  const blocoExcluidos = `
    <div class="card" style="padding: 4px 16px; margin-bottom:16px;">
      <div class="division-subheader clicavel" data-action="toggle-insight-excluidos">
        <span>${state.insightMostrarExcluidos ? '▾' : '▸'} FORA DO INSIGHT</span>
        <span class="division-counts">${excluidos.length}</span>
      </div>
      ${state.insightMostrarExcluidos ? (excluidos.length === 0 ? '<div class="empty">Ninguém foi removido.</div>' : excluidos.map(m => `
        <div class="member-row">
          <div class="member-head">
            <div>
              <span class="member-name">${escapeHtml(m.nome)}</span>
              <div style="color:var(--text-muted); font-size:11.5px; margin-top:2px;">${escapeHtml(m.divisao || '—')}</div>
            </div>
            <button class="btn ghost" style="padding:6px 10px; font-size:12px;" data-action="insight-reincluir-membro" data-id="${m.id}">Voltar a participar</button>
          </div>
        </div>
      `).join('')) : ''}
    </div>
  `;

  const blocoNovaRodada = state.insightEditandoRodadaId ? renderAjusteInsightRodada() : `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Marque quem fez o insight nessa rodada e confirme no final. Quem não participa mais, use "Remover da lista".</div>
    </div>
    ${blocoMarcacao}
    ${state.insightMostrarDataCustom ? `
      <div class="card" style="margin-bottom:10px;">
        <div class="field" style="margin-bottom:0;">
          <label>Data da rodada</label>
          <input type="date" id="insight-data-field" value="${escapeHtml(state.insightDataEscolhida)}">
          <div class="date-hint">D · M · A</div>
        </div>
        <div class="btn ghost" data-action="toggle-insight-data-custom" style="margin-top:8px; padding:2px 0; font-size:12px;">Cancelar (usar data de hoje)</div>
      </div>
    ` : `
      <div class="btn ghost" data-action="toggle-insight-data-custom" style="margin-bottom:10px; padding:2px 0; font-size:12px;">📅 Registrar com outra data (opcional)</div>
    `}
    <button class="btn block" data-action="confirmar-insight-rodada" style="margin-bottom:16px;" ${state.insightSalvando ? 'disabled' : ''}>
      ${state.insightSalvando ? 'Confirmando…' : '✅ Confirmar rodada'}
    </button>
  `;

  return `
    <div class="no-print">
      ${resultado}${erro}
      ${blocoNovaRodada}
      ${historico}
      ${blocoExcluidos}
    </div>
    <div class="division-subheader" style="margin-top:8px;"><span>📊 RELATÓRIO COMPLETO</span></div>
    <div class="print-only" style="margin:10px 0; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
    <button class="btn secondary block no-print" style="margin:10px 0 14px;" data-action="imprimir-relatorio">🖨️ Imprimir / Exportar PDF</button>
    ${renderRankInsightsConteudo(d)}
  `;
}

function renderAdminRelatorio() {
  const encerrados = eventosDoEscopo().filter(e => e.status === 'encerrado');
  if (encerrados.length === 0) {
    return '<div class="empty">Nenhum evento encerrado ainda.<br>Os relatórios aparecem aqui depois que você encerrar um evento.</div>';
  }
  const aviso = state.reportError ? `
    <div class="alert">
      <div class="alert-title">Alguns relatórios não carregaram</div>
      <div class="alert-msg">${escapeHtml(state.reportError)}.<br>Os eventos marcados com — estão incompletos, não copie esses.</div>
      <button class="btn secondary block" data-action="retry-report" style="margin-top:10px;">Tentar de novo</button>
    </div>
  ` : '';

  return aviso + encerrados.map(ev => {
    const carregado = ev.id in state.reportData;
    const counts = computeCounts(ev);
    const total = ev.memberIds.length;
    const isOpen = state.expandedReportEventId === ev.id;
    const n = (v) => carregado ? v : '—';
    const percentual = carregado && total ? Math.round((counts.confirmado / total) * 100) : null;
    return `
      <div class="card">
        <div class="member-head" ${carregado ? `data-action="toggle-report-event" data-id="${ev.id}"` : ''}>
          <div>
            <div style="font-family:'Rye',serif; font-size:17px; color:var(--white-strong);">${escapeHtml(ev.nome)}</div>
            <div style="color:var(--text-muted); font-size:12px; margin-top:5px;">${total} membros aptos${percentual !== null ? ` · <b style="color:var(--white-strong);">${percentual}% de presença</b>` : ''}</div>
          </div>
          ${dataDoCard(ev, true)}
          <span style="color:var(--text-muted); font-size:19px;">${carregado ? (isOpen ? '−' : '+') : ''}</span>
        </div>
        <div class="count-grid">
          <div class="count-box-report">✅ Confirmados <b>${n(counts.confirmado)}</b></div>
          <div class="count-box-report">❌ Falta justificada <b>${n(counts.familia + counts.trabalho + counts.justificada)}</b></div>
          <div class="count-box-report">⭕ Falta infracional <b>${n(counts.infracional)}</b></div>
        </div>
        ${carregado ? `<button class="btn secondary block" data-action="copy-report" data-id="${ev.id}" style="margin-top:10px;">${state.copiedEventId === ev.id ? 'Copiado ✓' : '📋 Copiar relatório'}</button>` : ''}
        ${isOpen && carregado ? renderReportDetail(ev) : ''}
        ${renderExcluirEvento(ev)}
      </div>
    `;
  }).join('');
}

// Excluir so aparece aqui, na aba Relatorio, onde so entram eventos ja
// encerrados - e em dois toques. Na aba Eventos ficava ao lado de Editar, com
// risco de apagar um evento ativo por engano.
function renderExcluirEvento(ev) {
  if (state.confirmDeleteId !== ev.id) {
    return `
      <button class="btn ghost block" data-action="ask-delete-event" data-id="${ev.id}" style="margin-top:8px;">
        Excluir evento
      </button>
    `;
  }
  return `
    <div class="alert" style="margin-top:10px;">
      <div class="alert-title">Excluir "${escapeHtml(ev.nome)}"?</div>
      <div class="alert-msg">Apaga o evento e as confirmações de todos os membros. Não dá para desfazer.</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn danger" data-action="delete-event" data-id="${ev.id}">Sim, excluir</button>
        <button class="btn secondary" data-action="cancel-delete-event">Cancelar</button>
      </div>
    </div>
  `;
}

function renderReportDetail(ev) {
  const groups = getReportGroups(ev);
  const counts = computeCounts(ev);
  const section = (label, emoji, list) => list.length ? `
    <div style="margin-top:10px;">
      <div style="font-size:11px; color:var(--text-muted); letter-spacing:0.03em; margin-bottom:4px;">${emoji} ${label.toUpperCase()}</div>
      <div style="font-size:13.5px; color:var(--text); line-height:1.6;">${list.map(escapeHtml).join(', ')}</div>
    </div>
  ` : '';
  // Familia, trabalho e justificada sao razoes de falta justificada - juntas
  // numa unica secao, com o motivo ao lado do nome (mesmo agrupamento de
  // buildReportText, pro texto copiado bater com o que aparece aqui). Sem
  // secao de "Nao responderam": evento encerrado nao tem mais esse status
  // (ver statusEfetivo) - quem nao respondeu ja caiu em Infracional.
  const faltaJustificada = [
    ...groups.familia.map(n => `${n} (Família)`),
    ...groups.trabalho.map(n => `${n} (Trabalho)`),
    ...groups.justificada.map(n => `${n} (Justificada)`),
  ];
  // Donut so aqui no detalhe expandido (nao no card recolhido) - senao toda
  // a lista de eventos encerrados ficaria mais alta a toa, so pra mostrar um
  // grafico que a maioria vai abrir so de vez em quando.
  const donut = renderDonutChart(segmentosDonutStatus({
    confirmado: counts.confirmado,
    justificada: counts.familia + counts.trabalho + counts.justificada,
    infracional: counts.infracional
  }), ev.memberIds.length ? Math.round((counts.confirmado / ev.memberIds.length) * 100) + '%' : '—', 'presença', 130);
  return `
    <div style="border-top:1px solid var(--line); margin-top:12px; padding-top:12px;">
      ${donut}
      ${section('Confirmados', '✅', groups.confirmado)}
      ${section('Falta - Justificada', '❌', faltaJustificada)}
      ${section('Falta - Infracional', '⭕', groups.infracional)}
    </div>
  `;
}

export function renderAdmin(app) {
  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="go-divisoes">‹ Trocar divisão</div>
    <div class="event-header">
      <h1 style="font-size: 20px;">Organizador</h1>
      <div class="count-box">${escapeHtml(escopoPorChave(state.adminEscopo).nome.toUpperCase())}</div>
    </div>
    <div class="tabs no-print">
      <div class="tab ${state.adminTab === 'eventos' ? 'active' : ''}" data-action="admin-tab" data-tab="eventos">Eventos</div>
      <div class="tab ${state.adminTab === 'membros' ? 'active' : ''}" data-action="admin-tab" data-tab="membros">Membros</div>
      <div class="tab ${state.adminTab === 'relatorio' ? 'active' : ''}" data-action="admin-tab" data-tab="relatorio">Relatório</div>
      <div class="tab ${state.adminTab === 'presencas' ? 'active' : ''}" data-action="admin-tab" data-tab="presencas">Presenças</div>
      ${state.adminEscopo === 'regional' ? `
        <div class="tab ${state.adminTab === 'insights' ? 'active' : ''}" data-action="admin-tab" data-tab="insights">Insights</div>
      ` : ''}
    </div>
    <div id="admin-content"></div>
  `;
  const content = document.getElementById('admin-content');
  if (state.adminTab === 'eventos') {
    content.innerHTML = renderAdminEventos();
  } else if (state.adminTab === 'relatorio') {
    content.innerHTML = renderAdminRelatorio();
  } else if (state.adminTab === 'presencas') {
    content.innerHTML = renderAdminPresencas();
  } else if (state.adminTab === 'insights' && state.adminEscopo === 'regional') {
    content.innerHTML = renderAdminInsights();
  } else {
    content.innerHTML = renderAdminMembros();
  }
}

// Mesmos campos de data da tela "Relatorios" (relatorioFiltroDataInicio/Fim) -
// escolher o periodo aqui e ali e a mesma coisa, entao reaproveita os
// proprios inputs (mesmos IDs, o listener global de 'input' ja trata os
// dois). Disponivel pra qualquer divisao, nao so Regional - diferente de
// "Gerar relatorio na planilha" (que cobre a planilha inteira, so faz
// sentido do Regional), o PDF e por divisao mesmo.
function renderExportarPdfAdmin() {
  const ativo = state.relatorioFiltroDataInicio || state.relatorioFiltroDataFim;
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:600; margin-bottom:8px;">Exportar relatório em PDF</div>
      <div class="row-gap">
        <div class="field" style="margin-bottom:0; flex:1;">
          <label>Data inicial</label>
          <input type="date" id="relatorio-filtro-data-inicio" value="${state.relatorioFiltroDataInicio}">
        </div>
        <div class="field" style="margin-bottom:0; flex:1;">
          <label>Data final</label>
          <input type="date" id="relatorio-filtro-data-fim" value="${state.relatorioFiltroDataFim}">
        </div>
      </div>
      <div style="color:var(--text-muted); font-size:12px; margin:6px 0 10px;">Deixe em branco pra incluir desde sempre.</div>
      ${ativo ? `<div class="btn ghost" data-action="limpar-relatorio-filtro-periodo" style="margin-bottom:10px; padding:2px 0; font-size:12px;">Limpar período</div>` : ''}
      <button class="btn secondary block" data-action="exportar-relatorio-pdf-admin" ${state.exportandoPdfAdmin ? 'disabled' : ''}>
        ${state.exportandoPdfAdmin ? 'Preparando PDF…' : '🖨️ Exportar para PDF'}
      </button>
    </div>
  `;
}

function renderAdminEventos() {
  if (state.newEventSelected !== null) {
    return renderEventForm();
  }
  const rel = state.relatorioState;
  const eventos = eventosDoEscopo();
  // A planilha inteira (aba Relatorio) cobre todas as divisoes juntas, entao
  // so faz sentido regenerar ela de dentro do Regional - quem enxerga o
  // quadro geral. Cada divisao usa o "Copiar relatorio" (por evento, na aba
  // Relatorio do organizador), que continua disponivel pra todo mundo.
  const podeGerarPlanilha = state.adminEscopo === 'regional';
  return `
    <button class="btn block" data-action="start-new-event" style="margin-bottom: 10px;">+ Criar evento</button>
    ${podeGerarPlanilha ? `
      <button class="btn secondary block on-photo" data-action="gerar-relatorio" style="margin-bottom: 6px;" ${rel === 'gerando' ? 'disabled' : ''}>
        ${rel === 'gerando' ? 'Gerando na planilha…' : '📊 Gerar relatório na planilha'}
      </button>
      ${rel === 'ok' ? '<div class="alert ok" style="margin-bottom:16px;"><div class="alert-msg">✅ Relatório atualizado na aba <b>Relatorio</b> da planilha.</div></div>' : ''}
      ${rel === 'erro' ? `<div class="alert" style="margin-bottom:16px;"><div class="alert-title">Não consegui gerar</div><div class="alert-msg">${escapeHtml(state.relatorioErro || '')}.</div></div>` : ''}
    ` : ''}
    ${renderExportarPdfAdmin()}
    ${eventos.length === 0 ? '<div class="empty">Nenhum evento criado ainda.</div>' : eventos.map(ev => {
      const memberCount = ev.memberIds.length;
      // Mesma arte/cor por tipo dos cards de evento dos Relatorios - aqui e
      // so background inline (sem as classes tipo-*) porque esse card e so
      // ".card" (empilha titulo + botoes por baixo), nao ".event-card"
      // (linha unica com flex/space-between), entao as regras CSS
      // acopladas a .event-card.tipo-* nao serviriam pra esse layout.
      const cor = corTipoEvento(ev.tipo);
      const imagemFundo = TIPO_HOME_IMAGEM[ev.tipo];
      const estiloFundo = !ev.tipo ? '' : imagemFundo
        ? `background-image:url('${imagemFundo}'); background-size:cover; background-position:center; border-left:3px solid ${cor};`
        : `background:${hexParaRgba(cor, 0.14)}; border-left:3px solid ${cor};`;
      return `
        <div class="card" style="${estiloFundo}">
          ${dataDoCard(ev)}
          <div style="display:flex; align-items:center; gap:14px;">
            ${ev.tipo ? `<div class="tipo-home-icone" style="border-color:${cor}; flex-shrink:0;">${emojiTipoEvento(ev.tipo)}</div>` : ''}
            <div style="min-width:0;">
              <div style="font-family:'Rye',serif; font-size:17px; color: var(--white-strong);">${escapeHtml(ev.nome)}</div>
              <div style="color:var(--text-muted); font-size:12px; margin-top:5px;">${memberCount} membros · ${ev.status === 'encerrado' ? 'Encerrado' : 'Ativo'}</div>
            </div>
          </div>
          <div class="row-gap" style="margin-top:12px;">
            <button class="btn secondary" data-action="start-edit-event" data-id="${ev.id}">Editar</button>
            <button class="btn secondary" data-action="toggle-event-status" data-id="${ev.id}">${ev.status === 'encerrado' ? 'Reabrir' : 'Encerrar'}</button>
            <button class="btn secondary" data-action="abrir-convocacao" data-id="${ev.id}">📋 Criar chamada <span style="opacity:.6; font-size:11px;">(testes)</span></button>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderEventForm() {
  const selected = state.newEventSelected;
  const isEditing = !!state.editingEventId;
  const existing = isEditing ? state.events.find(e => e.id === state.editingEventId) : null;
  const elegiveis = membrosElegiveisEvento();
  return `
    <div class="card">
      <div class="field">
        <label>Nome do evento</label>
        <input type="text" id="new-event-name" placeholder="Ex: Pub Mensal - 09SET26" value="${existing ? escapeHtml(existing.nome) : ''}">
      </div>
      <label>Tipo de evento (opcional)</label>
      <div class="chip-grid wide" style="margin-bottom: 14px;">
        ${TIPOS_EVENTO.map(t => `<button class="chip-option ${state.newEventTipo === t ? 'active' : ''}" data-action="pick-tipo-evento" data-value="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
      </div>
      <div class="row-gap" style="margin-bottom: 0;">
        <div class="field" style="flex: 1; min-width: 130px;">
          <label>Data</label>
          <input type="date" id="new-event-data" value="${existing && existing.data ? existing.data : ''}">
          <div class="date-hint">D · M · A</div>
        </div>
        <div class="field" style="flex: 1; min-width: 100px;">
          <label>Horário</label>
          <input type="time" id="new-event-horario" value="${existing && existing.horario ? existing.horario : ''}">
        </div>
      </div>
      <div class="field">
        <label>Endereço</label>
        <input type="text" id="new-event-endereco" placeholder="Ex: Av. Olegário Maciel, 101 - Barra da Tijuca" value="${existing && existing.endereco ? escapeHtml(existing.endereco) : ''}">
      </div>
      <div class="field">
        <label>Outros (opcional)</label>
        <textarea id="new-event-outros" rows="2" placeholder="Ex: link do mapa, horário de destacamento, observações">${existing && existing.outros ? escapeHtml(existing.outros) : ''}</textarea>
      </div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:8px;">
        <label style="margin-bottom:0;">Quem participa</label>
        ${elegiveis.length > 0 ? `
          <div>
            <span class="btn ghost" style="padding:0;" data-action="marcar-todos-membros">Marcar todos</span>
            <span style="color:var(--text-muted);"> · </span>
            <span class="btn ghost" style="padding:0;" data-action="desmarcar-todos-membros">Desmarcar todos</span>
          </div>
        ` : ''}
      </div>
      <div style="max-height: 260px; overflow-y: auto; margin: 5px 0 12px;">
        ${elegiveis.length === 0 ? '<div class="empty">Cadastre membros primeiro, na aba Membros.</div>' : elegiveis.map(m => `
          <div class="checkbox-row">
            <input type="checkbox" id="chk-${m.id}" data-id="${m.id}" class="new-event-checkbox" ${selected.has(m.id) ? 'checked' : ''}>
            <label for="chk-${m.id}" style="margin:0; font-size:14.5px; color:var(--text);">${escapeHtml(m.nome)}${m.grau ? ' (' + escapeHtml(m.grau) + ')' : ''}</label>
          </div>
        `).join('')}
      </div>
      <div class="row-gap">
        <button class="btn" data-action="save-new-event">${isEditing ? 'Salvar alterações' : 'Criar evento'}</button>
        <button class="btn secondary" data-action="cancel-new-event">Cancelar</button>
      </div>
    </div>
  `;
}

// Os chips de cargo so existem nos graus que tem cargo (VI e V). Devolve
// string vazia nos outros - sem deixar linha em branco no meio do
// formulario, por isso a montagem aqui fora em vez de um ternario solto no
// meio do template.
function blocoCargo() {
  const lista = cargosDoGrau(state.newMemberGrau);
  if (lista.length) {
    return `<label>Cargo (grau ${escapeHtml(state.newMemberGrau)})</label>
      <div class="chip-grid wide">
        ${lista.map(c => `<button class="chip-option ${state.newMemberCargo === c ? 'active' : ''}" data-action="pick-cargo" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
      `;
  }
  // Grau sem cargo (ou nenhum grau escolhido ainda): mostra o rotulo assim
  // mesmo, explicando. Antes essa parte simplesmente sumia, e nao havia como
  // descobrir que existe cargo sem antes acertar o grau por acaso.
  return `<label>Cargo</label>
      <div class="info-line" style="color:var(--text-muted); margin-bottom:14px;">
        Só os graus <strong>VI</strong> e <strong>V</strong> têm cargo. Escolha um deles acima para marcar.
      </div>
      `;
}

function renderAdminMembros() {
  const membros = membrosDoEscopo();
  const editando = !!state.editingMemberId;
  return `
    <div class="card">
      ${editando ? '<label style="display:block; margin-bottom:8px; color:var(--text-muted); font-size:12px;">Editando membro</label>' : ''}
      <div class="field">
        <label>Nome</label>
        <input type="text" id="new-member-nome" placeholder="Ex: Costa" value="${escapeHtml(state.newMemberNome)}">
      </div>
      <label>Grau (opcional)</label>
      <div class="chip-grid">
        ${GRAUS.map(g => `<button class="chip-option ${state.newMemberGrau === g ? 'active' : ''}" data-action="pick-grau" data-value="${g}">${g}</button>`).join('')}
      </div>
      ${blocoCargo()}<label>Função (opcional, pode marcar mais de uma)</label>
      <div class="row-gap" style="margin-bottom: 14px;">
        ${FUNCOES.map(f => `<button class="toggle-chip ${state.newMemberFuncoes.has(f.chave) ? 'active' : ''}" data-action="toggle-funcao" data-value="${f.chave}" style="flex: none; padding: 8px 12px;">${f.selo} ${escapeHtml(f.label)}</button>`).join('')}
      </div>
      ${editando ? `
        <div class="row-gap">
          <button class="btn" data-action="save-member-edit">Salvar alterações</button>
          <button class="btn secondary" data-action="cancel-member-edit">Cancelar</button>
        </div>
      ` : `<button class="btn block" data-action="add-member">+ Adicionar membro</button>`}
    </div>
    ${membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado ainda.</div>' : membros.map(m => `
      <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 16px;">
        <div>
          <div style="font-weight:500; font-size:15px;">${escapeHtml(m.nome)} ${selosFuncoes(m.funcoes)}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${[m.grau, m.cargo, m.divisao].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</div>
        </div>
        <div class="row-gap" style="margin-bottom:0;">
          <button class="btn ghost" data-action="edit-member" data-id="${m.id}">Editar</button>
          <button class="btn ghost" data-action="remove-member" data-id="${m.id}">Remover</button>
        </div>
      </div>
    `).join('')}
  `;
}

// Acoes do Modo organizador (eventos, membros, insights, relatorio).
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'retry-estatisticas': async (id, target, action, e) => {
    return loadEstatisticas();
  },
  'retry-insight-stats': async (id, target, action, e) => {
    return loadInsightStats();
  },
  'gerar-relatorio': async (id, target, action, e) => {
    return gerarRelatorio();
  },
  'exportar-relatorio-pdf-admin': async (id, target, action, e) => {
    return exportarRelatorioPdfAdmin();
  },
  'ask-delete-event': async (id, target, action, e) => {
    state.confirmDeleteId = id; return render();
  },
  'cancel-delete-event': async (id, target, action, e) => {
    state.confirmDeleteId = null; return render();
  },
  'admin-tab': async (id, target, action, e) => {
    state.adminTab = target.dataset.tab;
    state.newEventSelected = null;
    state.editingEventId = null;
    state.confirmDeleteId = null;
    state.editingMemberId = null;
    state.newMemberNome = '';
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.insightConfirmDeleteRodadaId = null;
    state.insightResultado = null;
    state.insightMostrarExcluidos = false;
    render();
    if (target.dataset.tab === 'relatorio') await loadReportData();
    if (target.dataset.tab === 'presencas') await loadEstatisticas();
    if (target.dataset.tab === 'insights') await loadInsightStats();
    return;
  },
  'toggle-insight-marca': async (id, target, action, e) => {
    state.insightMarcacoes[id] = !state.insightMarcacoes[id];
    return render();
  },
  'toggle-insight-divisao-grupo': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.insightExpandedDivisoes.has(chave)) state.insightExpandedDivisoes.delete(chave);
    else state.insightExpandedDivisoes.add(chave);
    return render();
  },
  'confirmar-insight-rodada': async (id, target, action, e) => {
    return confirmarInsightRodada();
  },
  'ajustar-insight-rodada': async (id, target, action, e) => {
    return iniciarAjusteInsightRodada(target.dataset.id);
  },
  'salvar-ajuste-insight-rodada': async (id, target, action, e) => {
    return salvarAjusteInsightRodada();
  },
  'cancelar-ajuste-insight-rodada': async (id, target, action, e) => {
    return cancelarAjusteInsightRodada();
  },
  'ajuste-rodada-remover-membro': async (id, target, action, e) => {
    const mid = target.dataset.id;
    state.insightAjusteMembroIds = state.insightAjusteMembroIds.filter(x => x !== mid);
    delete state.insightMarcacoes[mid];
    return render();
  },
  'ajuste-rodada-adicionar-membro': async (id, target, action, e) => {
    const mid = target.dataset.id;
    if (!state.insightAjusteMembroIds.includes(mid)) {
      state.insightAjusteMembroIds.push(mid);
      const m = (state.insightStats ? state.insightStats.membros : []).find(x => x.id === mid);
      if (m) state.insightAjusteInfo[mid] = { nome: m.nome, divisao: m.divisao };
      // Comeca como "nao fez" - o organizador toca pra marcar se for o caso,
      // igual a qualquer integrante que ja estivesse na rodada.
      state.insightMarcacoes[mid] = false;
    }
    return render();
  },
  'toggle-ajuste-rodada-adicionar': async (id, target, action, e) => {
    state.insightAjusteMostrarAdicionar = !state.insightAjusteMostrarAdicionar;
    return render();
  },
  'toggle-ajuste-rodada-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.insightAjusteDivisoesExpandidas.has(chave)) state.insightAjusteDivisoesExpandidas.delete(chave);
    else state.insightAjusteDivisoesExpandidas.add(chave);
    return render();
  },
  'toggle-insight-data-custom': async (id, target, action, e) => {
    state.insightMostrarDataCustom = !state.insightMostrarDataCustom;
    if (!state.insightMostrarDataCustom) state.insightDataEscolhida = '';
    return render();
  },
  'ask-delete-insight-rodada': async (id, target, action, e) => {
    state.insightConfirmDeleteRodadaId = id; return render();
  },
  'cancel-delete-insight-rodada': async (id, target, action, e) => {
    state.insightConfirmDeleteRodadaId = null; return render();
  },
  'delete-insight-rodada': async (id, target, action, e) => {
    return excluirInsightRodada(id);
  },
  'insight-remover-membro': async (id, target, action, e) => {
    return removerMembroInsight(id);
  },
  'insight-reincluir-membro': async (id, target, action, e) => {
    return reincluirMembroInsight(id);
  },
  'toggle-insight-excluidos': async (id, target, action, e) => {
    state.insightMostrarExcluidos = !state.insightMostrarExcluidos; return render();
  },
  'toggle-report-event': async (id, target, action, e) => {
    state.expandedReportEventId = state.expandedReportEventId === id ? null : id;
    return render();
  },
  'copy-report': async (id, target, action, e) => {
    const ev = state.events.find(e => e.id === id);
    if (ev) await copyReportToClipboard(ev);
    return;
  },
  'copy-insight-report': async (id, target, action, e) => {
    const r = (state.insightRodadasHistorico || []).find(x => x.id === id);
    if (r) await copyInsightReportToClipboard(r);
    return;
  },
  'pick-grau': async (id, target, action, e) => {
    state.newMemberGrau = state.newMemberGrau === target.dataset.value ? null : target.dataset.value;
    // Cargo pertence a um grau - trocar de grau derruba o que estava marcado,
    // senao sobraria um "Diretor" (grau VI) preso num membro grau X.
    state.newMemberCargo = null;
    return render();
  },
  'pick-cargo': async (id, target, action, e) => {
    state.newMemberCargo = state.newMemberCargo === target.dataset.value ? null : target.dataset.value;
    return render();
  },
  'toggle-funcao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.newMemberFuncoes.has(chave)) state.newMemberFuncoes.delete(chave);
    else state.newMemberFuncoes.add(chave);
    return render();
  },
  'add-member': async (id, target, action, e) => {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    // O membro herda a divisao de onde o organizador entrou - inclusive
    // Regional, que tem os proprios membros (mesa regional).
    const member = {
      id: genId(), nome, grau: state.newMemberGrau || '', divisao: escopoPorChave(state.adminEscopo).nome,
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || ''
    };
    state.roster = [...state.roster, member];
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  },
  'edit-member': async (id, target, action, e) => {
    const m = state.roster.find(x => x.id === id);
    if (!m) return;
    state.editingMemberId = id;
    state.newMemberNome = m.nome;
    state.newMemberGrau = m.grau || null;
    state.newMemberCargo = m.cargo || null;
    state.newMemberFuncoes = new Set(m.funcoes || []);
    return render();
  },
  'cancel-member-edit': async (id, target, action, e) => {
    state.editingMemberId = null;
    state.newMemberNome = '';
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    return render();
  },
  'save-member-edit': async (id, target, action, e) => {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    const original = state.roster.find(x => x.id === state.editingMemberId);
    if (!original) return;
    // Divisao nao muda por aqui - so nome, grau e funcoes.
    const member = {
      ...original, nome, grau: state.newMemberGrau || '',
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || ''
    };
    state.roster = state.roster.map(x => x.id === member.id ? member : x);
    state.editingMemberId = null;
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  },
  'remove-member': async (id, target, action, e) => {
    state.roster = state.roster.filter(m => m.id !== id);
    render();
    await salvarOuAvisar('membroRemover', { id });
  },
  'start-new-event': async (id, target, action, e) => {
    state.newEventSelected = new Set(membrosElegiveisEvento().map(m => m.id));
    state.editingEventId = null;
    state.newEventTipo = null;
    return render();
  },
  'start-edit-event': async (id, target, action, e) => {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    state.editingEventId = id;
    state.newEventSelected = new Set(ev.memberIds);
    state.newEventTipo = ev.tipo || null;
    return render();
  },
  'cancel-new-event': async (id, target, action, e) => {
    state.newEventSelected = null;
    state.editingEventId = null;
    state.newEventTipo = null;
    return render();
  },
  'marcar-todos-membros': async (id, target, action, e) => {
    // Mexe direto nos checkboxes, sem re-renderizar - o estado deles so e
    // lido de verdade na hora de salvar (ver save-new-event).
    const ligar = action === 'marcar-todos-membros';
    document.querySelectorAll('.new-event-checkbox').forEach(c => { c.checked = ligar; });
    return;
  },
  'pick-tipo-evento': async (id, target, action, e) => {
    state.newEventTipo = state.newEventTipo === target.dataset.value ? null : target.dataset.value;
    return render();
  },
  'save-new-event': async (id, target, action, e) => {
    const nome = document.getElementById('new-event-name').value.trim();
    const data = document.getElementById('new-event-data').value;
    const horario = document.getElementById('new-event-horario').value;
    const endereco = document.getElementById('new-event-endereco').value.trim();
    const outros = document.getElementById('new-event-outros').value.trim();
    const checked = Array.from(document.querySelectorAll('.new-event-checkbox:checked')).map(c => c.dataset.id);
    if (!nome || checked.length === 0) return;
    const evento = {
      id: state.editingEventId || genId(),
      nome, memberIds: checked, data, horario, endereco, outros,
      tipo: state.newEventTipo || '',
      // A categoria vem de qual botao o organizador entrou (Barra ou
      // Regional), nao de uma escolha manual no formulario.
      categoria: state.adminEscopo,
      status: state.editingEventId
        ? (state.events.find(e => e.id === state.editingEventId) || {}).status || 'ativo'
        : 'ativo'
    };
    state.events = state.editingEventId
      ? state.events.map(ev => ev.id === evento.id ? { ...ev, ...evento } : ev)
      : [...state.events, evento];
    state.newEventSelected = null;
    state.editingEventId = null;
    state.newEventTipo = null;
    render();
    await salvarOuAvisar('eventoSalvar', paramsDeEvento(evento));
  },
  'toggle-event-status': async (id, target, action, e) => {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    const novoStatus = ev.status === 'encerrado' ? 'ativo' : 'encerrado';
    state.events = state.events.map(e => e.id === id ? { ...e, status: novoStatus } : e);
    render();
    await salvarOuAvisar('eventoSalvar', paramsDeEvento({ ...ev, status: novoStatus }));
  },
  'delete-event': async (id, target, action, e) => {
    state.events = state.events.filter(ev => ev.id !== id);
    state.confirmDeleteId = null;
    delete state.reportData[id];
    if (state.expandedReportEventId === id) state.expandedReportEventId = null;
    render();
    await salvarOuAvisar('eventoRemover', { id });
  },
};
acoes['desmarcar-todos-membros'] = acoes['marcar-todos-membros'];
