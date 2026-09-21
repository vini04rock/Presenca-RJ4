// Modo organizador, secao Eventos: as abas "Ativos" e "Encerrados".
//
// As duas mostram evento, so que em momentos diferentes da vida dele: em
// Ativos ele ainda esta sendo montado e convocado; em Encerrados ele ja
// virou numero. Ficam juntas porque compartilham o card, a pastilha de data
// e a exclusao.

import { eventosDoEscopo, membrosElegiveisEvento } from '../dominio/estatisticas.js';
import { computeCounts, getReportGroups } from '../dominio/status.js';
import { TIPOS_EVENTO, corTipoEvento, emojiTipoEvento, escoposAtivos } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { TIPO_HOME_IMAGEM } from '../nucleo/imagens.js';
import { dataDoCampoOuAvisar, escapeHtml, formatDataBR, formatDataCurta, hexParaRgba } from '../nucleo/util.js';
import { campoData } from '../ui/comuns.js';
import { renderDonutChart, segmentosDonutStatus } from '../ui/graficos.js';
import { salvarOuAvisar } from '../dados/carregar.js';
import { paramsDeEvento } from '../fila/presenca.js';
import { copyReportToClipboard, exportarRelatorioPdfAdmin, gerarRelatorio } from '../fluxos/relatorio.js';
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

// Mesmos campos de data da tela "Relatorios" (relatorioFiltroDataInicio/Fim) -
// escolher o periodo aqui e ali e a mesma coisa, entao reaproveita os
// proprios inputs (mesmos IDs). O botao "Exportar para PDF" faz as vezes
// do "Atualizar" das outras telas: le as duas datas na hora do toque. Disponivel pra qualquer divisao, nao so Regional - diferente de
// "Gerar relatorio na planilha" (que cobre a planilha inteira, so faz
// sentido do Regional), o PDF e por divisao mesmo.
function renderExportarPdfAdmin() {
  const ativo = state.relatorioFiltroDataInicio || state.relatorioFiltroDataFim;
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:600; margin-bottom:8px;">Exportar relatório em PDF</div>
      <div class="row-gap">
        ${campoData({ id: 'relatorio-filtro-data-inicio', rotulo: 'Data inicial', valor: state.relatorioFiltroDataInicio, estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'relatorio-filtro-data-fim', rotulo: 'Data final', valor: state.relatorioFiltroDataFim, estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <div style="color:var(--text-muted); font-size:12px; margin:6px 0 10px;">Deixe em branco pra incluir desde sempre.</div>
      ${ativo ? `<div class="btn ghost" data-action="limpar-relatorio-filtro-periodo" style="margin-bottom:10px; padding:2px 0; font-size:12px;">Limpar período</div>` : ''}
      <button class="btn secondary block" data-action="exportar-relatorio-pdf-admin" ${state.exportandoPdfAdmin ? 'disabled' : ''}>
        ${state.exportandoPdfAdmin ? 'Preparando PDF…' : '🖨️ Exportar para PDF'}
      </button>
    </div>
  `;
}

export function renderAdminEventos() {
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
              <div class="nome-evento-card">${escapeHtml(ev.nome)}</div>
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
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="new-event-data" placeholder="dd/mm/aaaa" autocomplete="off" value="${existing && existing.data ? formatDataBR(existing.data) : ''}">
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

// "Corrigir" e "Ver texto original" viviam na aba Eventos dos Relatorios,
// que mostrava quase a mesma lista que esta aqui. A aba de la saiu; estes
// dois vieram junto, porque eram o unico caminho pra consertar uma
// convocacao colada errada (recolar por cima, sem apagar o evento) e pra
// reler o texto que deu origem a ele.
//
// So aparecem em evento que nasceu de convocacao colada - evento criado na
// mao nao tem textoOriginal.
//
// "Ver texto original" e so leitura e vale pra qualquer divisao. Ja
// "Corrigir" joga a pessoa na tela de Relatorios (aba Enviar), que segue
// restrita a Regional e Barra - entao ele so aparece onde essa tela existe,
// senao o botao levaria a um lugar que aquela divisao nao acessa.
function blocoConvocacaoOriginal(ev) {
  if (!ev.textoOriginal) return '';
  const aberto = state.relatorioTextoOriginalExpandido.has(ev.id);
  const podeCorrigir = escoposAtivos().some(e => e.chave === state.adminEscopo);
  return `
    <div style="margin-top:10px; display:flex; gap:14px; flex-wrap:wrap;">
      ${podeCorrigir ? `<div class="btn ghost" style="padding:2px 0; font-size:12px;" data-action="corrigir-convocacao" data-id="${ev.id}">✏️ Corrigir</div>` : ''}
      <div class="btn ghost" style="padding:2px 0; font-size:12px;" data-action="toggle-texto-original" data-id="${ev.id}">${aberto ? '📄 Esconder texto original' : '📄 Ver texto original'}</div>
    </div>
    ${aberto ? `<pre class="texto-original-pre" data-action="ignore-click">${escapeHtml(ev.textoOriginal)}</pre>` : ''}
  `;
}

export function renderAdminRelatorio() {
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
          <div style="min-width:0;">
            <div class="nome-evento-card">${escapeHtml(ev.nome)}</div>
            <div style="color:var(--text-muted); font-size:12px; margin-top:5px;">${total} membros aptos${percentual !== null ? ` · <b style="color:var(--white-strong);">${percentual}% de presença</b>` : ''}</div>
          </div>
          ${dataDoCard(ev, true)}
          <span style="color:var(--text-muted); font-size:19px;">${carregado ? (isOpen ? '−' : '+') : ''}</span>
        </div>
        <div class="count-grid">
          <div class="count-box-report">✅ Confirmados <b>${n(counts.confirmado)}</b></div>
          <div class="count-box-report">❌ Falta justificada <b>${n(counts.familia + counts.trabalho + counts.justificada)}</b></div>
          <div class="count-box-report">⭕ Falta não justificada <b>${n(counts.infracional)}</b></div>
        </div>
        ${carregado ? `<button class="btn secondary block" data-action="copy-report" data-id="${ev.id}" style="margin-top:10px;">${state.copiedEventId === ev.id ? 'Copiado ✓' : '📋 Copiar relatório'}</button>` : ''}
        ${blocoConvocacaoOriginal(ev)}
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
      ${section('Falta - Não justificada', '⭕', groups.infracional)}
    </div>
  `;
}

// Acoes das abas Ativos e Encerrados: criar, editar, encerrar, excluir e
// copiar relatorio. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'gerar-relatorio': async (id, target, action, e) => {
    return gerarRelatorio();
  },

  'exportar-relatorio-pdf-admin': async (id, target, action, e) => {
    const inicioPdf = dataDoCampoOuAvisar('relatorio-filtro-data-inicio', 'A data inicial');
    if (inicioPdf === null) return;
    const fimPdf = dataDoCampoOuAvisar('relatorio-filtro-data-fim', 'A data final');
    if (fimPdf === null) return;
    state.relatorioFiltroDataInicio = inicioPdf;
    state.relatorioFiltroDataFim = fimPdf;
    return exportarRelatorioPdfAdmin();
  },

  'ask-delete-event': async (id, target, action, e) => {
    state.confirmDeleteId = id; return render();
  },

  'cancel-delete-event': async (id, target, action, e) => {
    state.confirmDeleteId = null; return render();
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
    const data = dataDoCampoOuAvisar('new-event-data', 'A data do evento');
    if (data === null) return;
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

  'toggle-report-event': async (id, target, action, e) => {
    state.expandedReportEventId = state.expandedReportEventId === id ? null : id;
    return render();
  },

  'copy-report': async (id, target, action, e) => {
    const ev = state.events.find(e => e.id === id);
    if (ev) await copyReportToClipboard(ev);
    return;
  },
};

acoes['desmarcar-todos-membros'] = acoes['marcar-todos-membros'];
