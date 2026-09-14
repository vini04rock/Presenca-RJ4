// Tela de um evento e a lista de confirmados.

import { FUNCOES } from '../nucleo/config.js';
import { getMemberStatus, state } from '../nucleo/estado.js';
import { escapeHtml, formatDataBR, linkify, ordenarPorHierarquia } from '../nucleo/util.js';
import { renderHome } from './home.js';
import { renderConfirmadoRow, renderListaMembros, renderStatusBanner } from '../ui/comuns.js';

// Tela cheia (nao um painel dentro do evento) com quem ja confirmou -
// mesmo visual da lista de membros (numero, nome, grau, selos de
// funcao/direto/destacado/acompanhado), mais a divisao embaixo, que so faz
// sentido aparecer aqui (na lista principal ja da pra ver pelo agrupamento).
export function renderConfirmados(app) {
  const ev = state.events.find(e => e.id === state.currentEventId);
  if (!ev) { state.view = 'home'; return renderHome(app); }
  const members = ev.memberIds
    .map(id => state.roster.find(m => m.id === id))
    .filter(Boolean);
  const confirmados = ordenarPorHierarquia(members.filter(m => getMemberStatus(m.id).status === 'confirmado'));

  app.innerHTML = `
    <div class="back-link on-photo" data-action="close-confirmados">‹ ${escapeHtml(ev.nome)}</div>
    <div class="event-header">
      <h1>✅ Confirmados</h1>
      <div class="count-box">${confirmados.length}/${members.length} CONFIRMADOS</div>
    </div>
    <div class="card" style="padding: 4px 16px;">
      ${confirmados.length === 0 ? '<div class="empty">Ninguém confirmou ainda.</div>' : confirmados.map((m, i) => renderConfirmadoRow(m, i)).join('')}
    </div>
  `;
}

export function renderEvent(app) {
  const ev = state.events.find(e => e.id === state.currentEventId);
  if (!ev) { state.view = 'home'; return renderHome(app); }
  const members = ev.memberIds
    .map(id => state.roster.find(m => m.id === id))
    .filter(Boolean);

  const hasInfo = ev.data || ev.horario || ev.endereco || ev.outros;
  const confirmados = members.filter(m => getMemberStatus(m.id).status === 'confirmado');

  app.innerHTML = `
    <div class="back-link on-photo" data-action="voltar-do-evento">‹ Todos os eventos</div>
    <div class="event-header">
      <h1>${escapeHtml(ev.nome)}</h1>
      <div class="event-header-row">
        <div class="count-box">${members.length} MEMBROS</div>
        <button class="confirm-toggle-btn" data-action="toggle-confirmados">
          ✅ ${confirmados.length}/${members.length}
        </button>
      </div>
    </div>
    ${hasInfo ? `
      <div class="card" style="margin-bottom: 16px;">
        ${ev.data ? `<div class="info-line">🗓️ ${formatDataBR(ev.data)}</div>` : ''}
        ${ev.horario ? `<div class="info-line">⏰ ${escapeHtml(ev.horario)}</div>` : ''}
        ${ev.endereco ? `<div class="info-line">📍 ${linkify(ev.endereco)}</div>` : ''}
        ${ev.outros ? `<div class="info-line" style="white-space: pre-wrap;">ℹ️ ${linkify(ev.outros)}</div>` : ''}
      </div>
    ` : ''}
    ${renderStatusBanner()}
    <div class="card" style="padding: 4px 16px;">
      ${members.length === 0 ? '<div class="empty">Nenhum membro nesse evento.</div>' : renderListaMembros(ev, members)}
    </div>
    <div class="legend">
      ⚠️ Aguardando confirmação &nbsp; ✅ Presença confirmada<br>
      ❌ Falta (Família) &nbsp; ❌ Falta (Trabalho)<br>
      🚀 Direto (vai por conta própria) &nbsp; 🚧 Voluntário destacado<br>
      🐯 Acompanhado<br>
      ${FUNCOES.map(f => `${f.selo} ${escapeHtml(f.label)}`).join(' &nbsp; ')}
    </div>
  `;
}
