// Calendario do mes e a tela Organizar (marcar/editar eventos).

import { construirGradeCalendario, eventosCalendarioVisiveis, marcacoesVisiveisCalendario } from '../dominio/estatisticas.js';
import { api } from '../nucleo/api.js';
import { DIAS_SEMANA_LETRA, NOMES_MESES, TIPOS_EVENTO, corTipoEvento, emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { escapeHtml, hexParaRgba } from '../nucleo/util.js';
import { renderCardEscopo } from '../ui/comuns.js';

// Tela "Calendario" - escolhe a divisao/regional (sem PIN, igual Eventos),
// depois mostra a grade do mes daquele escopo. Por enquanto so mostra os
// dias - o que cada dia vai destacar (eventos, etc.) fica pra depois.
export function renderCalendarioDivisoes(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Calendário</h1>
      <div class="sub">Escolha a divisão</div>
    </div>
    ${escoposEmOrdemDeExibicao().map(e => renderCardEscopo(e, 'select-calendario-escopo', null)).join('')}
  `;
}

export function renderCalendario(app) {
  if (state.calendarioOrganizarEtapa === 'pin') return renderCalendarioOrganizarPin(app);
  if (state.calendarioOrganizarEtapa === 'texto') return renderCalendarioOrganizarTexto(app);

  const hoje = new Date();
  if (state.calendarioAno === null) state.calendarioAno = hoje.getFullYear();
  if (state.calendarioMes === null) state.calendarioMes = hoje.getMonth();

  const escopo = escopoPorChave(state.calendarioEscopo);
  const celulas = construirGradeCalendario(state.calendarioAno, state.calendarioMes);
  const ehHoje = (dia) => dia === hoje.getDate() && state.calendarioMes === hoje.getMonth() && state.calendarioAno === hoje.getFullYear();
  const marcacoesEscopo = marcacoesVisiveisCalendario(state.calendarioEscopo);

  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-calendario-divisoes">‹ Trocar divisão</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Calendário</h1>
      <div class="sub">${escapeHtml(escopo.nome)}</div>
    </div>
    ${state.calendarioMarcarAviso ? `
      <div class="alert" style="margin-bottom:14px;">
        <div class="alert-msg" style="white-space:pre-wrap;">${escapeHtml(state.calendarioMarcarAviso)}</div>
      </div>
    ` : ''}
    <div class="card calendario-card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="calendario-mes-anterior">‹</button>
        <div class="calendario-titulo">${NOMES_MESES[state.calendarioMes]} de ${state.calendarioAno}</div>
        <button class="btn ghost" data-action="calendario-mes-seguinte">›</button>
      </div>
      <div class="calendario-grade">
        ${DIAS_SEMANA_LETRA.map(l => `<div class="calendario-dia-semana">${l}</div>`).join('')}
        ${celulas.map(dia => {
          if (dia === null) return '<div class="calendario-dia calendario-dia-vazio"></div>';
          const dataIso = `${state.calendarioAno}-${String(state.calendarioMes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const marcacao = marcacoesEscopo[dataIso];
          const tipo = marcacao && marcacao.tipo;
          const estilo = tipo ? `border-color:${corTipoEvento(tipo)}; background:${hexParaRgba(corTipoEvento(tipo), 0.18)};` : '';
          // Mostra de onde o evento veio sempre que a origem for diferente
          // de quem esta olhando - no Regional, aparece o nome da divisao
          // (ex: "Barra"); numa divisao, um evento vindo do Regional
          // aparece com "Regional" embaixo. O proprio evento da divisao,
          // visto por ela mesma, nao precisa de rotulo nenhum.
          const nomeOrigem = tipo && marcacao.origem !== state.calendarioEscopo
            ? (marcacao.origem === 'regional' ? 'Regional' : escopoPorChave(marcacao.origem).nome.split(' - ')[0])
            : '';
          return `
            <div class="calendario-dia${ehHoje(dia) ? ' calendario-dia-hoje' : ''}" style="${estilo}" title="${tipo ? escapeHtml(tipo + (nomeOrigem ? ' - ' + nomeOrigem : '')) : ''}">
              <span class="calendario-dia-numero">${dia}</span>
              ${tipo ? `<span class="calendario-dia-emoji">${emojiTipoEvento(tipo)}</span>` : ''}
              ${nomeOrigem ? `<span class="calendario-dia-origem">${escapeHtml(nomeOrigem)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
      <div class="calendario-legenda">
        ${TIPOS_EVENTO.map(t => `
          <div class="calendario-legenda-item">
            <span class="calendario-legenda-emoji">${emojiTipoEvento(t)}</span>
            <span>${escapeHtml(t)}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <button class="btn secondary block" style="margin-top:14px;" data-action="abrir-calendario-organizar">🗂️ Organizar</button>
  `;
}

function renderCalendarioOrganizarPin(app) {
  const escopo = escopoPorChave(state.calendarioEscopo);
  app.innerHTML = `
    <div class="back-link on-photo" data-action="fechar-calendario-organizar">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Organizar</h1>
      <div class="sub">${escapeHtml(escopo.nome)}</div>
    </div>
    <div class="card">
      <label>PIN de acesso</label>
      <input type="tel" inputmode="numeric" maxlength="4" class="pin-input" id="calendario-pin-field" placeholder="••••" autofocus ${state.calendarioPinVerificando ? 'disabled' : ''}>
      ${state.calendarioPinErro ? `<div style="color: #C9A29C; font-size: 13px; margin-bottom: 10px;">${escapeHtml(state.calendarioPinErro)}</div>` : ''}
      <button class="btn block" data-action="check-calendario-pin" ${state.calendarioPinVerificando ? 'disabled' : ''}>${state.calendarioPinVerificando ? 'Verificando…' : 'Entrar'}</button>
    </div>
  `;
  const field = document.getElementById('calendario-pin-field');
  if (field) {
    field.focus();
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkCalendarioPin(); });
  }
}

// Cola uma lista de "DD/MM - Tipo" (um evento por linha) e marca cada data
// no calendario do ano em exibicao (state.calendarioAno) - so em memoria por
// enquanto, sem criar evento de verdade nenhum (ver marcarCalendarioDeTexto).
function renderCalendarioOrganizarTexto(app) {
  const escopo = escopoPorChave(state.calendarioEscopo);
  app.innerHTML = `
    <div class="back-link on-photo" data-action="fechar-calendario-organizar">‹ Voltar ao calendário</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Organizar</h1>
      <div class="sub">${escapeHtml(escopo.nome)}</div>
    </div>
    <div class="tabs" style="margin-bottom:14px;">
      <div class="tab ${state.calendarioOrganizarSubTab === 'adicionar' ? 'active' : ''}" data-action="calendario-organizar-subtab" data-tab="adicionar">Adicionar</div>
      <div class="tab ${state.calendarioOrganizarSubTab === 'editar' ? 'active' : ''}" data-action="calendario-organizar-subtab" data-tab="editar">Editar / Remover</div>
    </div>
    ${state.calendarioOrganizarSubTab === 'editar' ? conteudoCalendarioOrganizarEditar() : conteudoCalendarioOrganizarAdicionar()}
  `;
}

function conteudoCalendarioOrganizarAdicionar() {
  const erro = state.calendarioOrganizarTextoErro;
  return `
    <div class="card">
      <div style="font-weight:600; margin-bottom:8px;">Adicionar evento</div>
      <div class="alert info" style="margin-bottom:12px;">
        <div class="alert-msg">Cole uma linha por evento, com a data e o tipo. Aceita com ou sem separador entre os dois. Exemplos:<br>01/09 - Pub<br>05/09 Ação Social<br>15/09Bate e Volta</div>
      </div>
      ${erro ? `
        <div class="alert" style="margin-bottom:12px;">
          <div class="alert-title">Não reconheci ${erro.length === 1 ? 'esta linha' : 'estas linhas'}</div>
          <div class="alert-msg">Corrija abaixo e tente marcar de novo - nenhum evento foi marcado ainda.<br>${erro.map(l => '- ' + escapeHtml(l)).join('<br>')}</div>
        </div>
      ` : ''}
      ${state.calendarioOrganizarErroSalvar ? `
        <div class="alert" style="margin-bottom:12px;">
          <div class="alert-title">Não consegui salvar</div>
          <div class="alert-msg">${escapeHtml(state.calendarioOrganizarErroSalvar)}.<br>Nenhum evento foi criado - o texto continua aqui embaixo, tente de novo.</div>
        </div>
      ` : ''}
      <textarea id="calendario-organizar-texto" rows="8" placeholder="01/09 - Pub&#10;15/09 - Bate e Volta&#10;20/09 - Ação Social&#10;30/09 - Reunião">${escapeHtml(state.calendarioOrganizarTextoValor)}</textarea>
      <button class="btn block" style="margin-top:10px;" data-action="marcar-calendario-texto" ${state.calendarioSalvando ? 'disabled' : ''}>${state.calendarioSalvando ? 'Salvando…' : 'Marcar no calendário'}</button>
    </div>
  `;
}

// Calendario replicado, so com os eventos que a propria divisao/regional
// criou (categoria === o proprio escopo, sem o merge de
// eventosCalendarioVisiveis/marcacoesVisiveisCalendario) - so da pra
// editar/excluir o que essa mesma divisao criou, igual so da pra ver isso
// na tela normal do calendario; um evento do Regional nao pode ser editado
// a partir de uma divisao, e vice-versa.
function conteudoCalendarioOrganizarEditar() {
  const hoje = new Date();
  if (state.calendarioAno === null) state.calendarioAno = hoje.getFullYear();
  if (state.calendarioMes === null) state.calendarioMes = hoje.getMonth();

  const celulas = construirGradeCalendario(state.calendarioAno, state.calendarioMes);
  // O Regional enxerga e edita/exclui QUALQUER evento (o proprio + o de
  // qualquer divisao) - o PIN Regional ja e chave-mestra no resto do app
  // (verificarPin), entao faz sentido valer aqui tambem. Uma divisao so
  // edita/exclui o que ela propria criou (categoria === o proprio escopo) -
  // nunca um evento do Regional nem de outra divisao.
  const marcacoesProprias = {};
  (state.calendarioEscopo === 'regional'
    ? eventosCalendarioVisiveis('regional')
    : eventosCalendarioVisiveis(state.calendarioEscopo).filter(ev => ev.categoria === state.calendarioEscopo)
  ).forEach(ev => { marcacoesProprias[ev.data] = ev; });
  const ehHoje = (dia) => dia === hoje.getDate() && state.calendarioMes === hoje.getMonth() && state.calendarioAno === hoje.getFullYear();
  const dataSelecionada = state.calendarioEditandoData;
  const eventoSelecionado = dataSelecionada ? marcacoesProprias[dataSelecionada] : null;

  return `
    <div class="card calendario-card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="calendario-mes-anterior">‹</button>
        <div class="calendario-titulo">${NOMES_MESES[state.calendarioMes]} de ${state.calendarioAno}</div>
        <button class="btn ghost" data-action="calendario-mes-seguinte">›</button>
      </div>
      <div class="calendario-grade">
        ${DIAS_SEMANA_LETRA.map(l => `<div class="calendario-dia-semana">${l}</div>`).join('')}
        ${celulas.map(dia => {
          if (dia === null) return '<div class="calendario-dia calendario-dia-vazio"></div>';
          const dataIso = `${state.calendarioAno}-${String(state.calendarioMes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const evento = marcacoesProprias[dataIso];
          const tipo = evento && evento.tipo;
          const estilo = tipo ? `border-color:${corTipoEvento(tipo)}; background:${hexParaRgba(corTipoEvento(tipo), 0.18)};` : '';
          const classes = ['calendario-dia'];
          if (ehHoje(dia)) classes.push('calendario-dia-hoje');
          if (tipo) classes.push('calendario-dia-clicavel');
          if (dataIso === dataSelecionada) classes.push('calendario-dia-selecionado');
          // So aparece no Regional (unico escopo que edita evento de outra
          // origem) - pra saber de qual divisao e o evento antes de tocar.
          const nomeOrigem = tipo && evento.categoria !== state.calendarioEscopo
            ? (evento.categoria === 'regional' ? 'Regional' : escopoPorChave(evento.categoria).nome.split(' - ')[0])
            : '';
          return `
            <div class="${classes.join(' ')}" style="${estilo}" ${tipo ? `data-action="calendario-editar-selecionar-dia" data-value="${dataIso}"` : ''} title="${tipo ? escapeHtml(tipo + (nomeOrigem ? ' - ' + nomeOrigem : '')) : ''}">
              <span class="calendario-dia-numero">${dia}</span>
              ${tipo ? `<span class="calendario-dia-emoji">${emojiTipoEvento(tipo)}</span>` : ''}
              ${nomeOrigem ? `<span class="calendario-dia-origem">${escapeHtml(nomeOrigem)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ${eventoSelecionado ? renderCalendarioEditorPainel(eventoSelecionado) : `
      <div class="empty" style="margin-top:10px;">Toque num dia marcado pra ajustar a data ou remover.</div>
    `}
  `;
}

function renderCalendarioEditorPainel(evento) {
  const [ano, mes, dia] = evento.data.split('-');
  const tipo = evento.tipo;
  // So o Regional edita evento de outra origem - mostra de qual divisao e,
  // pra nao confundir "excluir o evento errado" com um evento parecido da
  // propria divisao.
  const origemTexto = evento.categoria !== state.calendarioEscopo
    ? ` (${evento.categoria === 'regional' ? 'Regional' : escopoPorChave(evento.categoria).nome.split(' - ')[0]})`
    : '';
  const titulo = `${emojiTipoEvento(tipo)} ${escapeHtml(tipo)} - ${dia}/${mes}/${ano}${escapeHtml(origemTexto)}`;
  if (state.calendarioAjustandoData) {
    return `
      <div class="card" style="margin-top:12px;">
        <div style="font-weight:600; margin-bottom:8px;">${titulo}</div>
        <label>Nova data</label>
        <input type="date" id="calendario-editar-data-field" value="${evento.data}">
        <div class="row-gap" style="margin-top:10px;">
          <button class="btn block" data-action="calendario-editar-confirmar-data" data-id="${evento.id}">Confirmar</button>
          <button class="btn secondary" data-action="calendario-editar-cancelar-ajuste">Cancelar</button>
        </div>
      </div>
    `;
  }
  if (state.calendarioConfirmandoExclusao) {
    return `
      <div class="alert" style="margin-top:12px;">
        <div class="alert-title">Excluir ${escapeHtml(tipo)} de ${dia}/${mes}/${ano}${escapeHtml(origemTexto)}?</div>
        <div class="alert-msg">Apaga o evento e as confirmações de todos os membros. Não dá para desfazer.</div>
        <div class="row-gap" style="margin-top:10px;">
          <button class="btn danger" data-action="calendario-editar-excluir" data-id="${evento.id}">Sim, excluir</button>
          <button class="btn secondary" data-action="calendario-editar-cancelar-exclusao">Cancelar</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="card" style="margin-top:12px;">
      <div style="font-weight:600; margin-bottom:8px;">${titulo}</div>
      <div class="row-gap">
        <button class="btn secondary" data-action="calendario-editar-abrir-ajuste">📅 Ajustar data</button>
        <button class="btn danger" data-action="calendario-editar-pedir-exclusao">🗑️ Excluir</button>
      </div>
    </div>
  `;
}

export async function checkCalendarioPin() {
  if (state.calendarioPinVerificando) return;
  const val = document.getElementById('calendario-pin-field').value.trim();
  if (!val) return;
  state.calendarioPinVerificando = true;
  state.calendarioPinErro = null;
  render();
  try {
    const r = await api('verificarPin', { escopo: state.calendarioEscopo, pin: val });
    if (r.valido) {
      state.calendarioOrganizarEtapa = 'texto';
    } else {
      state.calendarioPinErro = 'PIN incorreto.';
    }
  } catch (e) {
    state.calendarioPinErro = 'Não consegui verificar (' + e.message + '). Tente de novo.';
  }
  state.calendarioPinVerificando = false;
  render();
}
