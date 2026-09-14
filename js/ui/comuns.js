// Pedacos de tela reaproveitados: cards, linhas de membro, ficha, selos.

import { agruparPorDivisao, agruparStatsPorDivisao, contagemGrupo } from '../dominio/divisoes.js';
import { historicoMembro } from '../dominio/estatisticas.js';
import { COR_DIVISAO, COR_TODOS_EVENTOS, STATUS, STATUS_PICKER_KEYS, funcaoPorChave } from '../nucleo/config.js';
import { getMemberStatus, state } from '../nucleo/estado.js';
import { IMG_DIVISAO, IMG_REGIONAL } from '../nucleo/imagens.js';
import { escapeHtml, formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';
import { renderDonutChart, renderSparklineTendencia, segmentosDonutStatus } from './graficos.js';
import { loadEventStatus } from '../dados/carregar.js';
import { gravarAgora, setMemberStatus } from '../fila/presenca.js';
import { render } from '../nucleo/render.js';

// Card de divisao reaproveitado nas 3 telas que listam divisoes - Regional
// ganha a arte tematica (nome ja desenhado nela, entao o texto do card fica
// escondido, so a seta e, quando fizer sentido, um contador por cima); as
// demais divisoes continuam so com nome (+ contador opcional) em texto.
// contagemTexto: string pronta ("N eventos ativos") ou null/vazio pra nao
// mostrar nada.
export function renderCardEscopo(e, dataAction, contagemTexto) {
  const isRegional = e.chave === 'regional';
  // Divisao usa uma unica arte generica (so tem o rotulo "DIVISÃO" desenhado,
  // com espaco em branco embaixo) pra todas as divisoes de uma vez - por
  // isso, diferente do Regional, o nome de cada uma continua em HTML por
  // cima (a imagem nao tem como saber qual divisao e).
  const estiloFundo = isRegional
    ? `background-image:url('${IMG_REGIONAL}'); background-size:cover; background-position:center; border-left:3px solid ${COR_TODOS_EVENTOS};`
    : `background-image:url('${IMG_DIVISAO}'); background-size:cover; background-position:center; border-left:3px solid ${COR_DIVISAO};`;
  const conteudo = isRegional
    ? (contagemTexto ? `<div class="event-date-badge">${escapeHtml(contagemTexto)}</div><div></div>` : '<div></div>')
    : `<div><div class="name">${escapeHtml(e.nome)}</div>${contagemTexto ? `<div class="meta">${escapeHtml(contagemTexto)}</div>` : ''}</div>`;
  return `
    <div class="card event-card ${isRegional ? 'card-regional-home' : 'card-divisao-home'}" style="${estiloFundo}" data-action="${dataAction}" data-value="${e.chave}">
      ${conteudo}
      <div class="arrow">›</div>
    </div>
  `;
}

// Clicavel: abre/fecha a lista de nomes daquela divisao. A contagem e a %
// aparecem sempre, mesmo fechado - só os nomes ficam escondidos ate abrir.
function renderSubtituloDivisao(nome, membros, aberto) {
  const c = contagemGrupo(membros);
  const pct = membros.length ? Math.round((c.confirmado / membros.length) * 100) : 0;
  return `
    <div class="division-subheader clicavel" data-action="toggle-divisao-grupo" data-value="${escapeHtml(nome)}">
      <span>${aberto ? '▾' : '▸'} ${escapeHtml(nome.toUpperCase())}</span>
      <span class="division-counts">
        ✅ ${c.confirmado} &nbsp; ⚠️ ${c.aguardando} &nbsp; ❌ ${c.faltam} &nbsp;·&nbsp; <b>${pct}%</b>
      </span>
    </div>
  `;
}

// Eventos de divisao: lista unica, ordenada por hierarquia. Eventos
// regionais: agrupados por divisao (cada grupo com o proprio subtitulo,
// contagem ao vivo e numeracao reiniciando do 01) - os nomes so aparecem na
// divisao que a pessoa abrir, pra nao rolar por todo mundo ate achar o
// proprio nome.
export function renderListaMembros(ev, members) {
  if (ev.categoria === 'regional') {
    return agruparPorDivisao(members).map(grupo => {
      const aberto = state.expandedDivisoes.has(grupo.divisao);
      return `
        ${renderSubtituloDivisao(grupo.divisao, grupo.membros, aberto)}
        ${aberto ? grupo.membros.map((m, i) => renderMemberRow(m, i)).join('') : ''}
      `;
    }).join('');
  }
  return ordenarPorHierarquia(members).map((m, i) => renderMemberRow(m, i)).join('');
}

export function renderConfirmadoRow(m, i) {
  const st = getMemberStatus(m.id);
  return `
    <div class="member-row">
      <div class="member-info-wrap">
        <div class="member-info">
          <span class="member-num">${String(i + 1).padStart(2, '0')}.</span>
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
          ${st.direto ? '<span title="Direto">🚀</span>' : ''}
          ${st.destacado ? '<span title="Voluntário destacado">🚧</span>' : ''}
          ${st.acompanhado ? '<span title="Acompanhado">🐯</span>' : ''}
        </div>
        ${linhaFuncoes(m.funcoes)}
        <div class="confirmado-divisao">${escapeHtml(m.divisao || '—')}</div>
      </div>
    </div>
  `;
}

// Enquanto a leitura nao confirma, a lista aparece esmaecida e nao aceita
// toque: o que esta na tela ainda nao e o dado real da planilha.
export function renderStatusBanner() {
  if (state.statusError) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar as confirmações</div>
        <div class="alert-msg">${escapeHtml(state.statusError)}.<br>A lista abaixo não é a de verdade, por isso está bloqueada.</div>
        <button class="btn secondary block" data-action="retry-status" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (!state.statusLoaded) {
    return '<div class="alert info"><div class="alert-msg">Carregando as confirmações…</div></div>';
  }
  if (state.saveState === 'saving') {
    return '<div class="alert info"><div class="alert-msg">Salvando… pode continuar marcando.</div></div>';
  }
  if (state.saveState === 'saved') {
    return '<div class="alert ok"><div class="alert-msg">✅ Salvo na planilha</div></div>';
  }
  if (state.saveState === 'error') {
    return `
      <div class="alert">
        <div class="alert-title">Ainda não salvou</div>
        <div class="alert-msg">Suas marcações estão na tela, mas não chegaram na planilha.<br>Não feche antes de salvar.</div>
        <button class="btn secondary block" data-action="retry-save" style="margin-top:10px;">Tentar salvar de novo</button>
      </div>
    `;
  }
  return '';
}

function renderMemberRow(m, i) {
  const st = getMemberStatus(m.id);
  const s = STATUS[st.status];
  const isOpen = state.expandedMemberId === m.id;
  const travado = !state.statusLoaded;
  return `
    <div class="member-row${travado ? ' travado' : ''}">
      <div class="member-head" ${travado ? '' : `data-action="toggle-member" data-id="${m.id}"`}>
        <div class="member-info-wrap">
        <div class="member-info">
          <span class="member-num">${String(i + 1).padStart(2, '0')}.</span>
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
          ${st.direto ? '<span title="Direto">🚀</span>' : ''}
          ${st.destacado ? '<span title="Voluntário destacado">🚧</span>' : ''}
          ${st.acompanhado ? '<span title="Acompanhado">🐯</span>' : ''}
        </div>
        ${linhaFuncoes(m.funcoes)}
        </div>
        <span class="status-badge status-${st.status}">${s.emoji} ${s.label}</span>
      </div>
      <div class="picker ${isOpen ? 'open' : ''}">
        <div class="picker-group">
          ${STATUS_PICKER_KEYS.map(key => [key, STATUS[key]]).map(([key, val]) => `
            <button class="picker-btn ${st.status === key ? 'active' : ''}" data-action="set-status" data-id="${m.id}" data-status="${key}">
              ${val.emoji} ${val.label}
            </button>
          `).join('')}
        </div>
        <div class="toggle-row">
          <button class="toggle-chip ${st.direto ? 'active' : ''}" data-action="toggle-direto" data-id="${m.id}">🚀 Direto</button>
          <button class="toggle-chip ${st.destacado ? 'active' : ''}" data-action="toggle-destacado" data-id="${m.id}">🚧 Destacado</button>
          <button class="toggle-chip ${st.acompanhado ? 'active' : ''}" data-action="toggle-acompanhado" data-id="${m.id}">🐯 Acompanhado</button>
        </div>
      </div>
    </div>
  `;
}

export function renderFichaMembro(membroId) {
  const m = state.roster.find(x => x.id === membroId);
  if (!m) return '<div class="empty">Membro não encontrado.</div>';

  const { itens, convites, confirmacoes, justificadas, infracionais } = historicoMembro(membroId);
  const percentual = convites ? Math.round((confirmacoes / convites) * 100) : null;
  // renderSparklineTendencia espera ordem cronologica (mais antigo primeiro) -
  // itens ja vem invertido (mais recente primeiro) pra lista embaixo, entao
  // desfaz so pra montar a linha.
  const itensSparkline = itens.slice().reverse()
    .filter(it => it.pctAcumulado !== null)
    .map(it => ({ ev: it.ev, pct: it.pctAcumulado }));

  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-family:'Rye',serif; font-size:19px; color:var(--white-strong);">${escapeHtml(m.nome)}${m.grau ? ` <span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-top:4px;">${escapeHtml(m.divisao || '—')}</div>
      ${linhaFuncoes(m.funcoes)}
      ${renderDonutChart(segmentosDonutStatus({ confirmado: confirmacoes, justificada: justificadas, infracional: infracionais }), percentual === null ? '—' : percentual + '%', 'presença', 130)}
      <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">${convites} ${convites === 1 ? 'evento' : 'eventos'} no histórico</div>
      ${itensSparkline.length > 1 ? renderSparklineTendencia(itensSparkline) : ''}
    </div>
    <div class="card">
      <div style="font-weight:600; margin-bottom:6px;">Histórico evento a evento</div>
      ${!itens.length ? '<div class="empty">Nenhum evento encerrado ainda.</div>' : itens.map(it => {
        const s = STATUS[it.status] || STATUS.aguardando;
        return `
          <div class="member-row">
            <div class="member-head">
              <div class="member-info-wrap">
                <span class="member-name">${escapeHtml(it.ev.nome)}</span>
                <div style="color:var(--text-muted); font-size:11.5px;">${it.ev.data ? formatDataBR(it.ev.data) : '—'}</div>
              </div>
              <span class="status-badge status-${it.status || 'aguardando'}">${s.emoji} ${s.label}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Uma linha de "% de cada integrante" - nome + grau (herdado do cadastro,
// mesmo selo usado no resto do app) + selos de funcao, pra nao ficar so uma
// lista nua de nomes.
function renderLinhaEstatisticaMembro(m) {
  const nomeComGrau = `${escapeHtml(m.nome)}${m.grau ? ` <span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}`;
  if (m.percentual === null) {
    return `
      <div class="card presenca-row" data-action="abrir-ficha-membro" data-id="${m.id}">
        <div class="presenca-info">
          <div class="presenca-nome">${nomeComGrau}</div>
          ${linhaFuncoes(m.funcoes)}
        </div>
        <div class="presenca-sem-dados">Sem eventos ainda</div>
      </div>
    `;
  }
  return `
    <div class="card presenca-row" data-action="abrir-ficha-membro" data-id="${m.id}">
      <div class="presenca-info">
        <div class="presenca-nome">${nomeComGrau}</div>
        ${linhaFuncoes(m.funcoes)}
        <div class="presenca-contagem">${m.confirmacoes} de ${m.convites} eventos</div>
      </div>
      <div class="presenca-pct-wrap">
        <div class="presenca-barra"><div class="presenca-barra-fill" style="width:${m.percentual}%"></div></div>
        <div class="presenca-pct">${m.percentual}%</div>
      </div>
    </div>
  `;
}

// "% de cada integrante" agrupada por divisao, com cabecalho recolhivel
// (mesmo padrao visual de renderSubtituloDivisao/Rank de Insights) - sem
// isso, o Regional com "Todas as divisões" vira uma lista sem fim de nomes
// soltos, dificil de achar alguem.
export function renderListaEstatisticasPorDivisao(lista) {
  const grupos = agruparStatsPorDivisao(lista);
  return grupos.map(grupo => {
    const aberto = state.relatorioEstatisticasExpandidas.has(grupo.divisao);
    return `
      <div class="division-subheader clicavel" data-action="toggle-relatorio-estatisticas-divisao" data-value="${escapeHtml(grupo.divisao)}">
        <span>${aberto ? '▾' : '▸'} ${escapeHtml(grupo.divisao.toUpperCase())}</span>
        <span class="division-counts">${grupo.itens.length} ${grupo.itens.length === 1 ? 'membro' : 'membros'}</span>
      </div>
      ${aberto ? grupo.itens.map(renderLinhaEstatisticaMembro).join('') : ''}
    `;
  }).join('');
}

// Selos compactos de funcao, usados na lista de Membros (aba do organizador).
export function selosFuncoes(funcoes) {
  if (!funcoes || !funcoes.length) return '';
  return funcoes.map(chave => {
    const f = funcaoPorChave(chave);
    return f ? `<span class="grade-box" title="${escapeHtml(f.label)}">${f.selo}</span>` : '';
  }).join(' ');
}

// Linha propria de funcao, so com os selos - usada na lista de participantes
// de um evento, numa linha separada do nome e dos status de confirmacao
// (Direto/Destacado/Acompanhado), para nao virar uma sopa de emoji dificil de
// distinguir o que e o que. O significado de cada selo fica na legenda, no
// rodape da tela do evento - mesmo padrao dos outros emojis do app.
export function linhaFuncoes(funcoes) {
  if (!funcoes || !funcoes.length) return '';
  const itens = funcoes.map(chave => {
    const f = funcaoPorChave(chave);
    return f ? `<span class="funcao-item" title="${escapeHtml(f.label)}">${f.selo}</span>` : '';
  }).filter(Boolean).join('');
  return itens ? `<div class="member-funcoes">${itens}</div>` : '';
}

// ---------- ACTIONS ----------

// Acoes dos pedacos de tela reaproveitados (status, ficha, expandir).
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'toggle-relatorio-estatisticas-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.relatorioEstatisticasExpandidas.has(chave)) state.relatorioEstatisticasExpandidas.delete(chave);
    else state.relatorioEstatisticasExpandidas.add(chave);
    return render();
  },
  'abrir-ficha-membro': async (id, target, action, e) => {
    state.relatorioMembroFichaId = id; return render();
  },
  'retry-save': async (id, target, action, e) => {
    return gravarAgora();
  },
  'retry-status': async (id, target, action, e) => {
    return loadEventStatus(state.currentEventId);
  },
  'toggle-member': async (id, target, action, e) => {
    state.expandedMemberId = state.expandedMemberId === id ? null : id;
    return render();
  },
  'toggle-divisao-grupo': async (id, target, action, e) => {
    const nome = target.dataset.value;
    if (state.expandedDivisoes.has(nome)) state.expandedDivisoes.delete(nome);
    else state.expandedDivisoes.add(nome);
    return render();
  },
  'set-status': async (id, target, action, e) => {
    return setMemberStatus(id, { status: target.dataset.status });
  },
  'toggle-direto': async (id, target, action, e) => {
    const cur = getMemberStatus(id);
    return setMemberStatus(id, { direto: !cur.direto });
  },
  'toggle-destacado': async (id, target, action, e) => {
    const cur = getMemberStatus(id);
    return setMemberStatus(id, { destacado: !cur.destacado });
  },
  'toggle-acompanhado': async (id, target, action, e) => {
    const cur = getMemberStatus(id);
    return setMemberStatus(id, { acompanhado: !cur.acompanhado });
  },
};
