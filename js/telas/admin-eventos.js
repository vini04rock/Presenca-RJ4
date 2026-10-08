// Modo organizador, secao Eventos: as abas "Ativos" e "Encerrados".
//
// As duas mostram evento, so que em momentos diferentes da vida dele: em
// Ativos ele ainda esta sendo montado e convocado; em Encerrados ele ja
// virou numero. Ficam juntas porque compartilham o card, a pastilha de data
// e a exclusao.

import { eventosDoEscopo, membrosElegiveisEvento } from '../dominio/estatisticas.js';
import { computeCounts, getReportGroups } from '../dominio/status.js';
import { corTipoEvento, emojiTipoEvento, escoposAtivos } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { TIPO_HOME_IMAGEM } from '../nucleo/imagens.js';
import { dataDoCampoOuAvisar, escapeHtml, formatDataBR, formatDataCurta, hexParaRgba, pastilhaQuando } from '../nucleo/util.js';
import { camposDoEvento, chamadaParaGuardar, enderecoDoEvento, peVazio } from '../dominio/convocacao.js';
import { campoData, seloConfirmados } from '../ui/comuns.js';
import { caixa, guardarDigitado, quadro, quadroRoteiro, quadroTipo } from '../ui/quadros-chamada.js';
import { renderDonutChart, segmentosDonutStatus } from '../ui/graficos.js';
import { salvarOuAvisar } from '../dados/carregar.js';
import { paramsDeEvento } from '../fila/presenca.js';
import { copyReportToClipboard, exportarRelatorioPdfAdmin, gerarRelatorio } from '../fluxos/relatorio.js';
import { render } from '../nucleo/render.js';
import { imagemResultadoEvento, mostrarPreviaImagem } from '../ui/imagem.js';

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
              <div class="meta-card-evento">
                ${pastilhaQuando(ev)}
                ${seloConfirmados(ev)}
                <span>${memberCount} membros${ev.status === 'encerrado' ? '' : ' · Ativo'}</span>
              </div>
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

// O formulario de criar/editar evento tem os mesmos quadros 1 a 3 da
// chamada (ui/quadros-chamada.js): o evento ja nasce com o que a chamada
// precisa, e o "Criar chamada" abre praticamente pronto.
//
// Nada aqui e lido do campo na hora de salvar - tudo vai pro state enquanto
// se digita (ver aoDigitarNoFormulario), porque a tela redesenha ao escolher
// o tipo ou mexer nos P.E.
function renderEventForm() {
  const selected = state.newEventSelected;
  const isEditing = !!state.editingEventId;
  const f = state.newEventForm || {};
  const ch = state.newEventChamada || camposDoEvento({});
  const elegiveis = membrosElegiveisEvento();
  const campoF = (chave, extra) => `data-evf="${chave}" ${extra || ''}`;
  return `
    <div class="etapas-form" id="etapas-form">${etapasDoFormulario()}</div>
    <div class="card">
      <div class="field" style="margin-bottom:0;">
        <label>Nome do evento</label>
        <input type="text" id="new-event-name" ${campoF('nome')} placeholder="Ex: Pub Mensal - 09SET26" value="${escapeHtml(f.nome || '')}">
      </div>
    </div>

    ${quadroTipo({ campos: ch, attr: 'data-evc', categoria: state.adminEscopo, tipo: state.newEventTipo, acaoTipo: 'pick-tipo-evento' })}

    ${quadro(2, 'Informações', `
      ${caixa({ rotulo: 'Destino', valor: ch.destino, atributos: 'data-evc="destino"', dica: 'Ex: Bandas Bar - Paraíba do Sul' })}
      <div class="row-gap" style="margin-bottom: 0;">
        <div class="field" style="flex: 1; min-width: 130px; margin-bottom:0;">
          <label>Data</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="new-event-data" ${campoF('data')} placeholder="dd/mm/aaaa" autocomplete="off" value="${escapeHtml(f.data || '')}">
        </div>
        <div class="field" style="flex: 1; min-width: 100px; margin-bottom:0;">
          <label>Horário</label>
          <input type="time" id="new-event-horario" ${campoF('horario')} value="${escapeHtml(f.horario || '')}">
        </div>
      </div>
    `)}

    ${quadroRoteiro({ campos: ch, attr: 'data-evc', acaoAdicionarPe: 'adicionar-evento-pe', acaoRemoverPe: 'remover-evento-pe' })}

    <div class="card">
      <div class="field">
        <label>Observações para os membros (opcional)</label>
        <textarea id="new-event-outros" ${campoF('outros')} rows="2" placeholder="Ex: levar colete, traje do clube">${escapeHtml(f.outros || '')}</textarea>
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

// Chamado pelo ouvinte de digitacao do app.js. Guarda no state o que foi
// digitado no formulario de evento; devolve true se o campo era dele.
export function aoDigitarNoFormulario(el) {
  if (!state.newEventForm || !el.dataset) return false;
  if (el.dataset.evf) { state.newEventForm[el.dataset.evf] = el.value; return true; }
  if (el.classList && el.classList.contains('new-event-checkbox')) {
    if (el.checked) state.newEventSelected.add(el.dataset.id);
    else state.newEventSelected.delete(el.dataset.id);
    return true;
  }
  return guardarDigitado(state.newEventChamada, el, 'evc');
}

// O progresso do formulario, preso no topo enquanto se rola: cada etapa
// ganha um ✓ quando tem o minimo. So mostra - nada aqui impede de salvar
// (os campos obrigatorios continuam conferidos no "Salvar").
function etapasDoFormulario() {
  const f = state.newEventForm || {};
  const ch = state.newEventChamada || {};
  const etapas = [
    ['Nome', !!String(f.nome || '').trim()],
    ['Tipo', !!state.newEventTipo],
    ['Informações', !!String(ch.destino || '').trim() && String(f.data || '').length === 10 && !!f.horario],
    ['Roteiro', (ch.pes || []).some(pe => String(pe.nome || '').trim())],
    ['Membros', !!(state.newEventSelected && state.newEventSelected.size)],
  ];
  const prontas = etapas.filter(([, ok]) => ok).length;
  return `
    <div class="etapas-barra"><i style="width:${Math.round((prontas / etapas.length) * 100)}%"></i></div>
    <div class="etapas-lista">
      ${etapas.map(([nome, ok], i) => `<span class="etapa${ok ? ' feita' : ''}"><b>${ok ? '✓' : i + 1}</b>${nome}</span>`).join('')}
    </div>
  `;
}

// Chamada a cada letra digitada no formulario (ver app.js): troca so o
// quadro de etapas, sem redesenhar a tela - redesenhar fecharia o teclado.
export function atualizarEtapasDoFormulario(raiz) {
  const el = raiz.querySelector('#etapas-form');
  if (el) el.innerHTML = etapasDoFormulario();
}

// Abre o formulario: vazio pra evento novo, ou com o que o evento ja tem.
function abrirFormulario(ev) {
  state.newEventForm = {
    nome: ev ? ev.nome || '' : '',
    data: ev && ev.data ? formatDataBR(ev.data) : '',
    horario: ev ? ev.horario || '' : '',
    outros: ev ? ev.outros || '' : '',
  };
  const ch = camposDoEvento(ev || {});
  // No evento o subtitulo em branco ja quer dizer "o nome do evento" - nao
  // precisa vir preenchido com ele, senao renomear o evento deixaria o
  // subtitulo com o nome antigo.
  if (ev && (!ev.chamada || !String(ev.chamada.subtitulo || '').trim())) ch.subtitulo = '';
  state.newEventChamada = ch;
}

function fecharFormulario() {
  state.newEventSelected = null;
  state.editingEventId = null;
  state.newEventTipo = null;
  state.newEventForm = null;
  state.newEventChamada = null;
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
        ${carregado ? `
          <div class="row-gap" style="margin-top:10px;">
            <button class="btn secondary" style="flex:1;" data-action="copy-report" data-id="${ev.id}">${state.copiedEventId === ev.id ? 'Copiado ✓' : '📋 Copiar relatório'}</button>
            <button class="btn secondary" style="flex:1;" data-action="imagem-resultado" data-id="${ev.id}">🖼️ Imagem do resultado</button>
          </div>
        ` : ''}
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
  // A imagem pra postar no grupo (ui/imagem.js), com previa antes.
  'imagem-resultado': async (id, target, action, e) => {
    const ev = state.events.find(x => x.id === id);
    if (!ev || !state.reportData[ev.id]) return;
    const nome = 'resultado-' + String(ev.nome).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
    return mostrarPreviaImagem(() => imagemResultadoEvento(ev, computeCounts(ev)), nome);
  },
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
    abrirFormulario(null);
    return render();
  },

  'start-edit-event': async (id, target, action, e) => {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    state.editingEventId = id;
    state.newEventSelected = new Set(ev.memberIds);
    state.newEventTipo = ev.tipo || null;
    abrirFormulario(ev);
    return render();
  },

  'cancel-new-event': async (id, target, action, e) => {
    fecharFormulario();
    return render();
  },

  'adicionar-evento-pe': async (id, target, action, e) => {
    state.newEventChamada.pes = [...(state.newEventChamada.pes || []), peVazio()];
    return render();
  },

  'remover-evento-pe': async (id, target, action, e) => {
    const i = Number(target.dataset.value);
    state.newEventChamada.pes = (state.newEventChamada.pes || []).filter((_, j) => j !== i);
    return render();
  },

  'marcar-todos-membros': async (id, target, action, e) => {
    // Mexe direto nos checkboxes, sem re-renderizar, e guarda no state -
    // a tela pode redesenhar depois (ao mexer num P.E.) e precisa lembrar.
    const ligar = action === 'marcar-todos-membros';
    state.newEventSelected = new Set(ligar ? membrosElegiveisEvento().map(m => m.id) : []);
    document.querySelectorAll('.new-event-checkbox').forEach(c => { c.checked = ligar; });
    return;
  },

  'pick-tipo-evento': async (id, target, action, e) => {
    state.newEventTipo = state.newEventTipo === target.dataset.value ? null : target.dataset.value;
    return render();
  },

  'save-new-event': async (id, target, action, e) => {
    const f = state.newEventForm || {};
    const nome = String(f.nome || '').trim();
    const data = dataDoCampoOuAvisar('new-event-data', 'A data do evento');
    if (data === null) return;
    const checked = [...(state.newEventSelected || [])];
    if (!nome || checked.length === 0) return;
    const chamada = chamadaParaGuardar(state.newEventChamada);
    const evento = {
      id: state.editingEventId || genId(),
      nome, memberIds: checked, data,
      horario: f.horario || '',
      // O endereco "de uma linha" que o resto do app le continua existindo:
      // e o destino da chamada, nome + endereco.
      endereco: enderecoDoEvento(chamada),
      outros: String(f.outros || '').trim(),
      tipo: state.newEventTipo || '',
      // A categoria vem de qual botao o organizador entrou (Barra ou
      // Regional), nao de uma escolha manual no formulario.
      categoria: state.adminEscopo,
      status: state.editingEventId
        ? (state.events.find(e => e.id === state.editingEventId) || {}).status || 'ativo'
        : 'ativo',
      chamada,
    };
    state.events = state.editingEventId
      ? state.events.map(ev => ev.id === evento.id ? { ...ev, ...evento } : ev)
      : [...state.events, evento];
    fecharFormulario();
    render();
    // POST: com os P.E. e as vias, a chamada nao cabe numa URL.
    await salvarOuAvisar('eventoSalvar', { ...paramsDeEvento(evento), chamada }, { post: true });
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
