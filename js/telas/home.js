// Tela inicial e a navegacao ate a lista de eventos.

import { COR_TODOS_EVENTOS, TIPOS_EVENTO, TIPO_HOME_TAGLINE, classeTipoEvento, corTipoEvento, emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { IMG_CALENDARIO_HOME, IMG_HOME_EVENTOS, IMG_MODO_ORGANIZADOR, IMG_RANK_INSIGHTS, IMG_RANK_PRESENCA, IMG_RELATORIOS_HOME, LOGO_SRC, TIPO_HOME_IMAGEM } from '../nucleo/imagens.js';
import { diaDaSemana, escapeHtml, formatDataCurta, hexParaRgba } from '../nucleo/util.js';
import { renderCardEscopo } from '../ui/comuns.js';
import { openEvent } from '../fluxos/evento.js';
import { render } from '../nucleo/render.js';

export function renderHome(app) {
  if (!state.homeEventosAberto) return renderHomeInicio(app);
  if (!state.homeEscopo) return renderHomeEscolha(app);
  if (!state.homeTipo) return renderHomeTipos(app);
  return renderHomeEventos(app);
}

// Tela raiz do app: so o essencial (rank + um unico botao "Eventos"), pra
// nao poluir a primeira tela com as 7 divisoes de cara. Quem quiser ver
// eventos entra no card "Eventos", que abre a lista de divisoes de sempre
// (renderHomeEscolha).
// O evento ativo mais proximo, de qualquer divisao. So entra evento com
// data marcada e que ainda nao passou - mostrar um evento de ontem como
// "proximo" seria pior que nao mostrar nada.
//
// Hoje olha as 7 divisoes juntas: o app nao sabe de qual divisao e quem
// esta olhando. Quando souber, da pra filtrar - ver a nota guardada sobre
// a versao completa deste card.
function proximoEvento() {
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return state.events
    .filter(ev => ev.status !== 'encerrado' && /^\d{4}-\d{2}-\d{2}$/.test(ev.data || '') && ev.data >= hojeIso)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || ''))[0];
}

// Card no topo da tela inicial, com atalho direto pro evento. Sem ele, quem
// abre o app pra confirmar presenca passa por 4 toques (Eventos -> divisao
// -> tipo -> evento) antes de chegar la.
function renderProximoEvento() {
  const ev = proximoEvento();
  if (!ev) return '';
  const cor = corTipoEvento(ev.tipo);
  const imagemFundo = TIPO_HOME_IMAGEM[ev.tipo];
  const estiloFundo = imagemFundo
    ? `background-image:url('${imagemFundo}'); background-size:cover; background-position:center; border-left:3px solid ${cor};`
    : '';
  const dataCurta = formatDataCurta(ev.data);
  const detalhe = [diaDaSemana(ev.data), ev.horario, escopoPorChave(ev.categoria).nome]
    .filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <div class="rotulo-secao">Próximo evento</div>
    <div class="card event-card event-card-compacto ${imagemFundo ? '' : classeTipoEvento(ev.tipo)}" style="${estiloFundo}" data-action="open-event" data-id="${ev.id}">
      ${dataCurta ? `<div class="event-date-badge">${dataCurta}</div>` : ''}
      <div>
        <div class="name">${escapeHtml(ev.nome)}${ev.tipo ? ' ' + emojiTipoEvento(ev.tipo) : ''}</div>
        <div class="meta">${detalhe}</div>
      </div>
      <div class="arrow">›</div>
    </div>
  `;
}

function renderHomeInicio(app) {
  app.innerHTML = `
    <div class="crest-wrap">
      <img src="${LOGO_SRC}" alt="Insanos MC Brasil">
      <h1>Confirmação de Presença</h1>
      <div class="sub">RJ4</div>
    </div>
    <div class="ring-divider"></div>
    ${renderProximoEvento()}
    <div class="row-gap" style="margin-bottom:12px;">
      <div class="card event-card card-rank-home card-rank-presenca-home" style="background-image:url('${IMG_RANK_PRESENCA}');" data-action="go-rank">
        <div></div>
        <div class="arrow">›</div>
      </div>
      <div class="card event-card card-rank-home card-rank-insights-home" style="background-image:url('${IMG_RANK_INSIGHTS}');" data-action="go-rank-insights">
        <div></div>
        <div class="arrow">›</div>
      </div>
    </div>
    <div class="card event-card card-eventos-home" style="background-image:url('${IMG_HOME_EVENTOS}');" data-action="abrir-home-eventos">
      <div></div>
      <div class="arrow">›</div>
    </div>
    <div class="card event-card card-eventos-home" style="background-image:url('${IMG_CALENDARIO_HOME}'); border-left:3px solid #5FA0C4;" data-action="go-calendario-divisoes">
      <div></div>
      <div class="arrow">›</div>
    </div>
    <div class="row-gap" style="margin-bottom:12px;">
      <div class="card event-card card-admin-home card-organizador-home" style="background-image:url('${IMG_MODO_ORGANIZADOR}');" data-action="go-divisoes">
        <div></div>
        <div class="arrow">›</div>
      </div>
      <div class="card event-card card-admin-home card-relatorios-home" style="background-image:url('${IMG_RELATORIOS_HOME}');" data-action="go-relatorio-divisoes">
        <div></div>
        <div class="arrow">›</div>
      </div>
    </div>
    <div class="footer-admin">
      <div class="brand-tag">Desenvolvido por: Almeida - Adm. Barra - RJ4</div>
    </div>
  `;
}

// Primeiro passo dentro de "Eventos": escolher a divisao, antes de ver
// qualquer evento. Cada card mostra quantos eventos ativos tem naquele
// escopo.
function renderHomeEscolha(app) {
  const contarAtivos = (chave) =>
    state.events.filter(ev => ev.categoria === chave && ev.status !== 'encerrado').length;
  app.innerHTML = `
    <div class="back-link on-photo" data-action="fechar-home-eventos">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Eventos</h1>
      <div class="sub">Escolha a divisão</div>
    </div>
    ${escoposEmOrdemDeExibicao().map(e => {
      const n = contarAtivos(e.chave);
      return renderCardEscopo(e, 'select-home-escopo', n + ' ' + (n === 1 ? 'evento ativo' : 'eventos ativos'));
    }).join('')}
  `;
}

function renderHomeTipos(app) {
  const nomeEscopo = escopoPorChave(state.homeEscopo).nome;
  const contar = (tipo) => state.events.filter(ev =>
    ev.categoria === state.homeEscopo && ev.status !== 'encerrado' &&
    (tipo === 'todos' || ev.tipo === tipo)).length;
  const opcoes = [{ valor: 'todos', label: 'Todos os eventos', emoji: '📋' }]
    .concat(TIPOS_EVENTO.map(t => ({ valor: t, label: t, emoji: emojiTipoEvento(t) })));

  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home-escolha">‹ Trocar divisão</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 21px;">${escapeHtml(nomeEscopo)}</h1>
      <div class="sub">Escolha o tipo de evento</div>
    </div>
    ${opcoes.map(o => {
      const n = contar(o.valor);
      const cor = o.valor === 'todos' ? COR_TODOS_EVENTOS : corTipoEvento(o.valor);
      const imagem = TIPO_HOME_IMAGEM[o.valor];
      const classe = o.valor === 'todos' ? '' : classeTipoEvento(o.valor);
      const estiloFundo = imagem
        ? `background-image:url('${imagem}'); background-size:cover; background-position:center; border-left:3px solid ${cor};`
        : (o.valor === 'todos' ? `background:${hexParaRgba(cor, 0.14)}; border-left:3px solid ${cor};` : '');
      const tagline = TIPO_HOME_TAGLINE[o.valor] || '';
      return `
        <div class="card event-card tipo-home-card ${classe}" style="${estiloFundo}" data-action="select-home-tipo" data-value="${escapeHtml(o.valor)}">
          <div style="display:flex; align-items:center; gap:14px; min-width:0;">
            <div class="tipo-home-icone" style="border-color:${cor}; background:rgba(10,10,10,0.55);">${o.emoji}</div>
            <div style="min-width:0;">
              <div class="name">${escapeHtml(o.label)}</div>
              <div class="meta">${n} ${n === 1 ? 'evento ativo' : 'eventos ativos'}</div>
              ${tagline ? `
                <div class="tipo-home-tagline" style="color:${cor};">
                  <span class="tipo-home-linha" style="background:${cor};"></span>${escapeHtml(tagline.toUpperCase())}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="arrow">›</div>
        </div>
      `;
    }).join('')}
  `;
}

// Terceiro passo: a lista de eventos ativos do escopo + tipo escolhidos -
// e a mesma tela de sempre, so que filtrada duas vezes.
function renderHomeEventos(app) {
  const nomeEscopo = escopoPorChave(state.homeEscopo).nome;
  const tipoLabel = state.homeTipo === 'todos' ? 'Todos os eventos' : state.homeTipo;
  const activeEvents = state.events.filter(ev =>
    ev.categoria === state.homeEscopo && ev.status !== 'encerrado' &&
    (state.homeTipo === 'todos' || ev.tipo === state.homeTipo));
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home-tipos">‹ Trocar tipo</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 21px;">${escapeHtml(nomeEscopo)}</h1>
      <div class="sub">${escapeHtml(tipoLabel)}</div>
    </div>
    ${activeEvents.length === 0 ? `
      <div class="empty">
        Nenhum evento ativo no momento.<br>
        ${state.roster.length === 0 ? 'Abra o modo organizador pra cadastrar membros e criar o primeiro evento.' : 'Abra o modo organizador pra criar um evento.'}
      </div>
    ` : activeEvents.map(ev => {
      const memberCount = ev.memberIds.length;
      const dataCurta = formatDataCurta(ev.data);
      const cor = corTipoEvento(ev.tipo);
      const imagemFundo = TIPO_HOME_IMAGEM[ev.tipo];
      const estiloFundo = imagemFundo
        ? `background-image:url('${imagemFundo}'); background-size:cover; background-position:center; border-left:3px solid ${cor};`
        : '';
      return `
        <div class="card event-card ${imagemFundo ? '' : classeTipoEvento(ev.tipo)}" style="${estiloFundo}" data-action="open-event" data-id="${ev.id}">
          ${dataCurta ? `<div class="event-date-badge">${dataCurta}</div>` : ''}
          <div>
            <div class="name">${escapeHtml(ev.nome)}${ev.tipo ? ' ' + emojiTipoEvento(ev.tipo) : ''}</div>
            <div class="meta">${memberCount} ${memberCount === 1 ? 'membro' : 'membros'}</div>
          </div>
          <div class="arrow">›</div>
        </div>
      `;
    }).join('')}
  `;
}

// Acoes da tela inicial e da navegacao ate a lista de eventos.
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'open-event': async (id, target, action, e) => {
    // Guarda de onde a pessoa veio (Relatorios/Modo organizador/tela
    // inicial) pra "‹ Todos os eventos" voltar pro mesmo lugar, em vez de
    // sempre cair na tela inicial - ver "voltar-do-evento".
    state.eventoVoltarPara = { view: state.view, relatorioTab: state.relatorioTab, adminTab: state.adminTab };
    return openEvent(id);
  },
  'go-home': async (id, target, action, e) => {
    state.view = 'home'; state.isAdmin = false; state.adminEscopo = null; return render();
  },
  'abrir-home-eventos': async (id, target, action, e) => {
    state.homeEventosAberto = true; return render();
  },
  'fechar-home-eventos': async (id, target, action, e) => {
    state.homeEventosAberto = false; state.homeEscopo = null; state.homeTipo = null; return render();
  },
  'select-home-escopo': async (id, target, action, e) => {
    state.homeEscopo = target.dataset.value; state.homeTipo = null; return render();
  },
  'go-home-escolha': async (id, target, action, e) => {
    state.homeEscopo = null; state.homeTipo = null; state.view = 'home'; return render();
  },
  'select-home-tipo': async (id, target, action, e) => {
    state.homeTipo = target.dataset.value; return render();
  },
  'go-home-tipos': async (id, target, action, e) => {
    state.homeTipo = null; return render();
  },
};
