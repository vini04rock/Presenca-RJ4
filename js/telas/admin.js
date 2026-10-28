// Modo organizador: o esqueleto. Cabecalho, barra de abas e a troca de aba.
//
// O conteudo de cada aba mora num arquivo por secao (admin-eventos.js,
// admin-membros.js, admin-insights.js) - este aqui so sabe QUAL desenhar,
// nunca COMO. Era tudo um arquivo so de 1098 linhas; repartir nao mudou uma
// virgula do que aparece na tela.

import { escopoPorChave, temDoacoesECaixinha } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml } from '../nucleo/util.js';
import { carregarAcoesSociais, carregarCaixinha, carregarDoacoes, carregarEstoqueAdm, carregarFuncoesEspeciais, carregarMovimentos, loadEstatisticas, loadInsightStats, loadReportData } from '../dados/carregar.js';
import { fecharFormFinanceiro, fecharMesCaixinha } from '../fluxos/doacoes-caixinha.js';
import { fecharPainelMovimento } from '../fluxos/movimentos.js';
import { render } from '../nucleo/render.js';
import { renderAdminEventos, renderAdminRelatorio } from './admin-eventos.js';
import { renderAdminMembros, renderAdminPresencas } from './admin-membros.js';
import { renderAdminInsights } from './admin-insights.js';
import { renderAdminDoacoes } from './admin-doacoes.js';
import { renderAdminCaixinha } from './admin-caixinha.js';
import { renderAdminMovimentos } from './admin-movimentos.js';
import { renderAdminEstoqueAdm } from './admin-estoque-adm.js';
import { renderAdminAcoesSociais } from './admin-acoes-sociais.js';
import { fecharCarteirinha } from './admin-carteirinha.js';
import { fecharFuncoesEspeciais, podeDescartar, renderAdminFuncoesEspeciais, tituloFuncaoEspecial } from './admin-funcoes-especiais.js';

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
  doacoes: {
    titulo: 'Doações',
    abas: [
      // No Regional, das Doacoes so o estoque: as duas primeiras sao do 1 kg
      // de cada integrante, que e coisa de divisao (soNasDivisoes).
      { chave: 'doacoes', label: 'Por evento', soNasDivisoes: true },
      { chave: 'doacoes-rank', label: 'Rank', soNasDivisoes: true },
      { chave: 'doacoes-estoque', label: 'Estoque' },
    ],
  },
  caixinha: {
    titulo: 'Caixinha',
    abas: [
      { chave: 'caixinha', label: 'Mês a mês' },
      { chave: 'caixinha-rank', label: 'Rank' },
      { chave: 'caixinha-financeiro', label: 'Controle financeiro' },
    ],
  },
  movimentos: {
    titulo: 'Entrada/Saída',
    abas: [{ chave: 'movimentos', label: 'Entrada/Saída' }],
  },
  // O planejador de Acoes Sociais, nas 7 divisoes (cada uma com o seu).
  acoesSociais: {
    titulo: 'Ações Sociais',
    abas: [
      { chave: 'acoes-sociais', label: 'Agenda do ano' },
      { chave: 'acoes-sociais-ideias', label: 'Banco de ideias' },
      { chave: 'acoes-sociais-textos', label: 'Textos' },
    ],
  },
  // Funcoes especiais, so no Regional: a entrada com os dois cards
  // (Batedores e Caveiras) e, dentro de cada um, as quatro abas. O titulo e o
  // voltar dependem da funcao aberta.
  funcoesEspeciais: {
    titulo: 'Funções especiais',
    abas: [{ chave: 'funcoes-especiais', label: 'Funções especiais' }],
  },
  funcaoEspecial: {
    titulo: () => tituloFuncaoEspecial(),
    voltar: { acao: 'voltar-funcoes-especiais', texto: '‹ Funções especiais' },
    abas: [
      { chave: 'funcoes-eventos', label: 'Eventos' },
      { chave: 'funcoes-encerrados', label: 'Encerrados' },
      { chave: 'funcoes-estatisticas', label: 'Estatísticas' },
      { chave: 'funcoes-individuais', label: 'Individuais' },
      { chave: 'funcoes-relatorio-caveiras', label: 'Relatório', soNaFuncao: 'caveira' },
    ],
  },
  estoqueAdm: {
    titulo: 'Estoque ADM',
    abas: [
      { chave: 'estoque-adm-movimentar', label: 'Movimentar' },
      { chave: 'estoque-adm-estoque', label: 'Estoque' },
      { chave: 'estoque-adm-relatorio', label: 'Relatório' },
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

// As abas da secao que existem na divisao em que se entrou.
function abasVisiveis(secao) {
  return secao.abas.filter(a => !(a.soNasDivisoes && state.adminEscopo === 'regional')
    && !(a.soNaFuncao && state.funcaoEspecial !== a.soNaFuncao));
}

export function renderAdmin(app) {
  const secao = secaoDaAba(state.adminTab);
  const titulo = typeof secao.titulo === 'function' ? secao.titulo() : secao.titulo;
  const voltar = secao.voltar || { acao: 'go-menu-organizador', texto: '‹ Menu' };
  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="${voltar.acao}">${escapeHtml(voltar.texto)}</div>
    <div class="event-header">
      <h1 style="font-size: 20px;">${escapeHtml(titulo)}</h1>
      <div class="count-box">${escapeHtml(escopoPorChave(state.adminEscopo).nome.toUpperCase())}</div>
    </div>
    ${abasVisiveis(secao).length > 1 ? `
      <div class="tabs no-print">
        ${abasVisiveis(secao).map(a => `<div class="tab ${state.adminTab === a.chave ? 'active' : ''}" data-action="admin-tab" data-tab="${a.chave}">${escapeHtml(a.label)}</div>`).join('')}
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
  } else if (state.adminTab.startsWith('doacoes') && temDoacoesECaixinha(state.adminEscopo)) {
    content.innerHTML = renderAdminDoacoes();
  } else if (state.adminTab.startsWith('caixinha') && temDoacoesECaixinha(state.adminEscopo)) {
    content.innerHTML = renderAdminCaixinha();
  } else if (state.adminTab === 'movimentos') {
    content.innerHTML = renderAdminMovimentos();
  } else if (state.adminTab.startsWith('estoque-adm') && state.adminEscopo === 'regional') {
    content.innerHTML = renderAdminEstoqueAdm();
  } else if (state.adminTab.startsWith('acoes-sociais')) {
    content.innerHTML = renderAdminAcoesSociais();
  } else if (state.adminTab.startsWith('funcoes-') && state.adminEscopo === 'regional') {
    content.innerHTML = renderAdminFuncoesEspeciais();
  } else {
    content.innerHTML = renderAdminMembros();
  }
}

// Entra numa aba do organizador, zerando o que estava pela metade na aba
// anterior (um evento sendo editado, um membro pela metade, uma confirmacao
// de exclusao aberta). Usada pela barra de abas e tambem pelo menu do
// organizador, que e por onde se entra em cada secao agora.
export async function abrirAbaOrganizador(aba) {
  // Doacoes e Caixinha buscam da planilha ao ENTRAR na secao, e nao a cada
  // troca de aba dentro dela: "Por evento" e "Rank" sao o mesmo dado visto
  // de dois jeitos, e cada busca custa de 2 a 4 segundos.
  const entrandoNaSecao = state.view !== 'admin' || secaoDaAba(state.adminTab) !== secaoDaAba(aba);
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
  state.doacoesEventoId = null;
  state.doacoesMarcacoes = {};
  state.doacoesMsg = null;
  // O estoque abre no painel, sem formulario nem relatorio aberto.
  state.estoqueMsg = null;
  state.estoqueForm = null;
  state.estoqueRelatorio = false;
  state.estoqueAnularId = null;
  state.estoqueQtdExtrato = 15;
  fecharMesCaixinha();
  state.caixinhaMsg = null;
  fecharFormFinanceiro();
  state.caixinhaFinMsg = null;
  state.caixinhaFinRelatorio = false;
  state.caixinhaFinQtdExtrato = 15;
  fecharPainelMovimento();
  state.movimentosDivisaoAberta = null;
  state.estoqueAdmAnularId = null;
  fecharCarteirinha();
  state.acaoSocialIdeiaForm = null;
  state.acaoSocialAgendaForm = null;
  state.acaoSocialTextoForm = null;
  state.acaoSocialApagarId = null;
  state.acaoSocialCriarEventoId = null;
  state.acoesSociaisMsg = null;
  state.preencherEntradasIds = null;
  state.entradasRascunho = {};
  state.entradasMsg = null;
  fecharFuncoesEspeciais();
  render();
  if (aba === 'encerrados') await loadReportData();
  if (aba === 'presencas') await loadEstatisticas();
  if (aba.startsWith('insights')) await loadInsightStats();
  if (aba.startsWith('doacoes') && entrandoNaSecao) await carregarDoacoes();
  if (aba.startsWith('caixinha') && entrandoNaSecao) await carregarCaixinha();
  // O livro tambem fica velho quando se movimenta alguem no cadastro (o
  // fluxo zera movimentosDados) - por isso busca tambem quando nao ha nada.
  if (aba === 'movimentos' && (entrandoNaSecao || !state.movimentosDados)) await carregarMovimentos();
  if (aba.startsWith('estoque-adm') && entrandoNaSecao) await carregarEstoqueAdm();
  if (aba.startsWith('acoes-sociais') && entrandoNaSecao) await carregarAcoesSociais();
  // Os eventos da funcao: ao entrar nela (pelo card), e nao a cada aba -
  // Eventos, Encerrados e Estatisticas sao o mesmo dado.
  if (aba.startsWith('funcoes-') && aba !== 'funcoes-especiais' && (entrandoNaSecao || !state.funcoesDados)) await carregarFuncoesEspeciais();
}

// A unica acao do esqueleto: trocar de aba. Todas as outras moram no arquivo
// da secao a que pertencem, e o app.js junta os quatro mapas num so.
export const acoes = {
  'admin-tab': async (id, target, action, e) => {
    if (!podeDescartar()) return;
    return abrirAbaOrganizador(target.dataset.tab);
  },
  // Os dois cards das Funcoes especiais (Batedores e Caveiras), e a volta.
  'abrir-funcao-especial': async (id, target, action, e) => {
    state.funcaoEspecial = target.dataset.value;
    state.funcoesDados = null;
    state.funcoesPeriodo = 0;
    return abrirAbaOrganizador('funcoes-eventos');
  },
  'voltar-funcoes-especiais': async (id, target, action, e) => {
    if (!podeDescartar()) return;
    return abrirAbaOrganizador('funcoes-especiais');
  },
};
