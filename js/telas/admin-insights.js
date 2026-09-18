// Modo organizador, secao Insights: as abas "Nova rodada", "Ultimas
// rodadas" e "Relatorio completo".
//
// So o Regional chega aqui (ver renderAdmin) - quem faz insight e a base, e
// quem acompanha o numero e o Regional.

import { agruparMembrosRodadaPorDivisao } from '../dominio/divisoes.js';
import { estatisticasInsightsPorPeriodo } from '../dominio/estatisticas.js';
import { divisoesSemRegional } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { dataDoCampoOuAvisar, escapeHtml, formatDataBR } from '../nucleo/util.js';
import { renderRankInsightsConteudo } from '../ui/insights.js';
import { campoData } from '../ui/comuns.js';
import { loadInsightStats } from '../dados/carregar.js';
import { cancelarAjusteInsightRodada, confirmarInsightRodada, excluirInsightRodada, iniciarAjusteInsightRodada, reincluirMembroInsight, removerMembroInsight, salvarAjusteInsightRodada } from '../fluxos/insights.js';
import { copyInsightReportToClipboard } from '../fluxos/relatorio.js';
import { render } from '../nucleo/render.js';

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
    <div class="btn ghost" style="margin-bottom:10px;" data-action="cancelar-ajuste-insight-rodada">‹ Voltar às rodadas</div>
    <div class="alert info" style="margin-bottom:12px;">
      <div class="alert-msg">Ajustando a rodada de ${formatDataBR(r.data)}. Toque num integrante pra trocar entre Fez/Não fez.</div>
    </div>
    <div class="tabs no-print">
      <div class="tab ${state.insightAjusteMostrarAdicionar ? '' : 'active'}" data-action="ajuste-rodada-aba" data-tab="participaram">Quem participou (${membrosAtuais.length})</div>
      <div class="tab ${state.insightAjusteMostrarAdicionar ? 'active' : ''}" data-action="ajuste-rodada-aba" data-tab="adicionar">Adicionar (${candidatos.length})</div>
    </div>
    ${state.insightAjusteMostrarAdicionar ? '' : grupos.map(g => {
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

    ${!state.insightAjusteMostrarAdicionar ? '' : `
    <div class="card" style="padding: 4px 16px; margin-bottom:12px;">
      ${(
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
      )}
    </div>
    `}

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
// Filtro de periodo da aba "Relatorio completo" do Insight - mesmos dois
// campos de data do relatorio de eventos. A diferenca importante esta no
// aviso: o historico so traz as ultimas 30 rodadas (listarInsightRodadas no
// Code.gs), entao um periodo antigo pode enxergar menos do que existe de
// verdade na planilha. Por isso a tela diz quantas rodadas entraram na
// conta, em vez de mostrar um numero que parece completo e nao e.
function renderFiltroPeriodoInsight(filtrado) {
  const inicio = state.insightFiltroDataInicio;
  const fim = state.insightFiltroDataFim;
  const ativo = inicio || fim;
  const texto = ativo
    ? `${inicio ? formatDataBR(inicio) : 'início'} até ${fim ? formatDataBR(fim) : 'hoje'}`
    : 'Desde sempre';
  const n = filtrado ? filtrado.rodadas.length : 0;
  return `
    <div class="card no-print" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">Filtrar por período</div>
      <div class="row-gap">
        ${campoData({ id: 'insight-filtro-data-inicio', rotulo: 'Data inicial', valor: inicio, estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'insight-filtro-data-fim', rotulo: 'Data final', valor: fim, estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <button class="btn secondary block" data-action="aplicar-insight-filtro-periodo" style="margin-top:10px;">Atualizar</button>
      ${ativo ? `
        <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">
          ${n === 0 ? 'Nenhuma rodada nesse período.' : `${n} ${n === 1 ? 'rodada entrou' : 'rodadas entraram'} na conta.`}
          O histórico guarda as 30 rodadas mais recentes.
        </div>
        <div class="btn ghost" data-action="limpar-insight-filtro-periodo" style="margin-top:8px; padding:2px 0; font-size:12px;">Limpar (voltar a mostrar tudo)</div>
      ` : ''}
    </div>
    <div class="print-only" style="margin-bottom:10px; font-size:13px; color:var(--text-muted);">Período: ${escapeHtml(texto)}</div>
  `;
}

export function renderAdminInsights() {
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

  const blocoNovaRodada = `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Marque quem fez o insight nessa rodada e confirme no final. Quem não participa mais, use "Remover da lista".</div>
    </div>
    ${blocoMarcacao}
    ${state.insightMostrarDataCustom ? `
      <div class="card" style="margin-bottom:10px;">
        ${campoData({ id: 'insight-data-field', rotulo: 'Data da rodada', valor: state.insightDataEscolhida, estilo: 'margin-bottom:0;' })}
        <div class="btn ghost" data-action="toggle-insight-data-custom" style="margin-top:8px; padding:2px 0; font-size:12px;">Cancelar (usar data de hoje)</div>
      </div>
    ` : `
      <div class="btn ghost" data-action="toggle-insight-data-custom" style="margin-bottom:10px; padding:2px 0; font-size:12px;">📅 Registrar com outra data (opcional)</div>
    `}
    <button class="btn block" data-action="confirmar-insight-rodada" style="margin-bottom:16px;" ${state.insightSalvando ? 'disabled' : ''}>
      ${state.insightSalvando ? 'Confirmando…' : '✅ Confirmar rodada'}
    </button>
  `;

  // As quatro zonas vinham empilhadas numa rolagem so - marcar a rodada, o
  // historico, quem esta fora e o relatorio completo. Agora sao tres abas
  // (ver SECOES_ORGANIZADOR): "quem esta fora do insight" fica junto da
  // marcacao porque e a mesma tarefa, decidir quem entra na conta.
  if (state.adminTab === 'insights-rodadas') {
    // Ajustar uma rodada acontece AQUI, na aba onde esta o botao, tomando o
    // lugar da lista enquanto dura. Antes o painel de ajuste era desenhado
    // junto com o de criar rodada - o que funcionava quando tudo vivia numa
    // tela so, mas depois da separacao em abas o toque em "Ajustar" nao
    // mostrava nada: a pessoa continuava na aba da lista, e o painel tinha
    // ido parar na aba do lado.
    if (state.insightEditandoRodadaId) return erro + renderAjusteInsightRodada();
    // So o aviso de ajuste aparece aqui; o de rodada nova pertence a outra
    // aba, senao a confirmacao sai longe de onde a acao aconteceu.
    const aviso = state.insightResultado && state.insightResultado.ajuste ? resultado : '';
    return aviso + erro + (historico || '<div class="empty">Nenhuma rodada registrada ainda.</div>');
  }
  if (state.adminTab === 'insights-relatorio') {
    // Sem periodo escolhido, usa o que o servidor ja somou (todas as
    // rodadas que existem). Com periodo, refaz a conta a partir do
    // historico - ver estatisticasInsightsPorPeriodo.
    const inicio = state.insightFiltroDataInicio;
    const fim = state.insightFiltroDataFim;
    const filtrado = inicio || fim
      ? estatisticasInsightsPorPeriodo(d, state.insightRodadasHistorico, inicio, fim)
      : null;
    const dados = filtrado ? filtrado.stats : d;
    const historico = filtrado ? filtrado.rodadas : null;
    return `
      ${renderFiltroPeriodoInsight(filtrado)}
      <div class="print-only" style="margin:10px 0; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
      <button class="btn secondary block no-print" style="margin:0 0 14px;" data-action="imprimir-relatorio">🖨️ Imprimir / Exportar PDF</button>
      ${renderRankInsightsConteudo(dados, historico)}
    `;
  }
  return `
    <div class="no-print">
      ${state.insightResultado && state.insightResultado.ajuste ? '' : resultado}${erro}
      ${blocoNovaRodada}
      ${blocoExcluidos}
    </div>
  `;
}

// Acoes das tres abas de Insights: marcar a rodada, confirmar, ajustar uma
// ja registrada, e quem entra ou sai do insight.
export const acoes = {
  'retry-insight-stats': async (id, target, action, e) => {
    return loadInsightStats();
  },

  'aplicar-insight-filtro-periodo': async (id, target, action, e) => {
    const inicio = dataDoCampoOuAvisar('insight-filtro-data-inicio', 'A data inicial');
    if (inicio === null) return;
    const fim = dataDoCampoOuAvisar('insight-filtro-data-fim', 'A data final');
    if (fim === null) return;
    state.insightFiltroDataInicio = inicio;
    state.insightFiltroDataFim = fim;
    return render();
  },

  'limpar-insight-filtro-periodo': async (id, target, action, e) => {
    state.insightFiltroDataInicio = '';
    state.insightFiltroDataFim = '';
    return render();
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
    // O painel de ajuste so existe nesta aba; garante que e nela que a
    // pessoa esta, mesmo que um dia o botao apareca noutro lugar.
    state.adminTab = 'insights-rodadas';
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

  'ajuste-rodada-aba': async (id, target, action, e) => {
    state.insightAjusteMostrarAdicionar = target.dataset.tab === 'adicionar';
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

  'copy-insight-report': async (id, target, action, e) => {
    const r = (state.insightRodadasHistorico || []).find(x => x.id === id);
    if (r) await copyInsightReportToClipboard(r);
    return;
  },
};
