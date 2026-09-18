// Modo organizador: o esqueleto. Cabecalho, barra de abas e a troca de aba.
//
// O conteudo de cada aba mora num arquivo por secao (admin-eventos.js,
// admin-membros.js, admin-insights.js) - este aqui so sabe QUAL desenhar,
// nunca COMO. Era tudo um arquivo so de 1098 linhas; repartir nao mudou uma
// virgula do que aparece na tela.

import { escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml } from '../nucleo/util.js';
import { loadEstatisticas, loadInsightStats, loadReportData } from '../dados/carregar.js';
import { render } from '../nucleo/render.js';
import { renderAdminEventos, renderAdminRelatorio } from './admin-eventos.js';
import { renderAdminMembros, renderAdminPresencas } from './admin-membros.js';
import { renderAdminInsights } from './admin-insights.js';

// As secoes do organizador. Cada card do menu abre uma secao, e a barra de
// abas mostra so as abas daquela secao - antes era uma barra unica com as
// cinco abas, e os quatro cards do menu levavam todos a mesma tela, so
// mudando qual aba vinha marcada. Agora sao telas separadas, o que da espaco
// pra cada uma crescer sem espremer a barra.
//
// A ordem aqui e a ordem das abas na tela. Secao de uma aba so (Insights)
// nao desenha barra nenhuma - uma aba sozinha marcada nao informa nada.
export const SECOES_ORGANIZADOR = {
  eventos: {
    titulo: 'Eventos',
    abas: [
      { chave: 'eventos', label: 'Ativos' },
      { chave: 'encerrados', label: 'Encerrados' },
    ],
  },
  membros: {
    titulo: 'Membros',
    abas: [
      { chave: 'membros', label: 'Cadastro' },
      { chave: 'presencas', label: 'Presenças' },
    ],
  },
  insights: {
    titulo: 'Insights',
    abas: [
      { chave: 'insights', label: 'Nova rodada' },
      { chave: 'insights-rodadas', label: 'Últimas rodadas' },
      { chave: 'insights-relatorio', label: 'Relatório completo' },
    ],
  },
};

// De qual secao e uma aba. Evita guardar "em que secao estou" no state:
// cada aba pertence a exatamente uma, entao da pra descobrir a partir de
// state.adminTab, que ja existe.
export function secaoDaAba(aba) {
  const chave = Object.keys(SECOES_ORGANIZADOR)
    .find(k => SECOES_ORGANIZADOR[k].abas.some(a => a.chave === aba));
  return SECOES_ORGANIZADOR[chave] || SECOES_ORGANIZADOR.eventos;
}

export function renderAdmin(app) {
  const secao = secaoDaAba(state.adminTab);
  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="go-menu-organizador">‹ Menu</div>
    <div class="event-header">
      <h1 style="font-size: 20px;">${escapeHtml(secao.titulo)}</h1>
      <div class="count-box">${escapeHtml(escopoPorChave(state.adminEscopo).nome.toUpperCase())}</div>
    </div>
    ${secao.abas.length > 1 ? `
      <div class="tabs no-print">
        ${secao.abas.map(a => `<div class="tab ${state.adminTab === a.chave ? 'active' : ''}" data-action="admin-tab" data-tab="${a.chave}">${escapeHtml(a.label)}</div>`).join('')}
      </div>
    ` : ''}
    <div id="admin-content"></div>
  `;
  const content = document.getElementById('admin-content');
  if (state.adminTab === 'eventos') {
    content.innerHTML = renderAdminEventos();
  } else if (state.adminTab === 'encerrados') {
    content.innerHTML = renderAdminRelatorio();
  } else if (state.adminTab === 'presencas') {
    content.innerHTML = renderAdminPresencas();
  } else if (state.adminTab.startsWith('insights') && state.adminEscopo === 'regional') {
    content.innerHTML = renderAdminInsights();
  } else {
    content.innerHTML = renderAdminMembros();
  }
}

// Entra numa aba do organizador, zerando o que estava pela metade na aba
// anterior (um evento sendo editado, um membro pela metade, uma confirmacao
// de exclusao aberta). Usada pela barra de abas e tambem pelo menu do
// organizador, que e por onde se entra em cada secao agora.
export async function abrirAbaOrganizador(aba) {
  state.adminTab = aba;
  state.view = 'admin';
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
  if (aba === 'encerrados') await loadReportData();
  if (aba === 'presencas') await loadEstatisticas();
  if (aba.startsWith('insights')) await loadInsightStats();
}

// A unica acao do esqueleto: trocar de aba. Todas as outras moram no arquivo
// da secao a que pertencem, e o app.js junta os quatro mapas num so.
export const acoes = {
  'admin-tab': async (id, target, action, e) => {
    return abrirAbaOrganizador(target.dataset.tab);
  },
};
