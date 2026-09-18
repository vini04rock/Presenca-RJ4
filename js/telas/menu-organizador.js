// Menu do Modo organizador: a tela que aparece logo depois do PIN.
//
// Antes o PIN caia direto na aba "Eventos" e as outras secoes viviam so na
// barra de abas la de dentro - e os Relatorios, que pedem o mesmo PIN,
// moravam num card separado na tela inicial, obrigando a digitar o PIN de
// novo. Aqui todas as secoes ficam no mesmo lugar, atras de um PIN so.
//
// A barra de abas continua existindo dentro do organizador: quem ja esta
// em Eventos troca pra Membros sem passar por aqui. Este menu e a porta de
// entrada, nao o unico caminho.

import { eventosProximos, semResposta } from '../dominio/pendencias.js';
import { loadPresencasProximas } from '../dados/carregar.js';
import { escopoPorChave, escoposAtivos } from '../nucleo/config.js';
import { diaDaSemana, formatDataBR } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml } from '../nucleo/util.js';
import { render } from '../nucleo/render.js';
import { abrirAbaOrganizador } from './admin.js';
import { entrarNosRelatorios } from './relatorios.js';

// Cada secao: o rotulo, a explicacao de uma linha, o icone e a cor da
// tarja. Quase todas abrem uma aba do organizador ("aba"); os Relatorios
// sao uma area propria e trazem a propria acao ("acao"). "visivel", quando
// existe, decide se a secao aparece na divisao em que se entrou.
const SECOES = [
  // Cada card leva a PRIMEIRA aba da secao; as outras ficam na barra de
  // abas la dentro (ver SECOES_ORGANIZADOR em admin.js).
  { aba: 'eventos', nome: 'Eventos', desc: 'Criar, editar, encerrar e ver os encerrados', icone: '🏍️', cor: '#E0B23C' },
  { aba: 'membros', nome: 'Membros', desc: 'Cadastro, grau, cargo, funções e presenças', icone: '👥', cor: '#4C86D9' },
  // Insight e rodada do Regional - nao existe no nivel da divisao.
  { aba: 'insights', nome: 'Insights', desc: 'Rodadas de Insight', icone: '💡', cor: '#B57EDC', visivel: () => state.adminEscopo === 'regional' },
  // Os Relatorios seguem so no Regional e na Barra - decisao do clube, que
  // mora em escoposAtivos() para nao ficar repetida aqui. Como a divisao e
  // o PIN ja vieram do organizador, nao ha PIN de novo.
  { acao: 'abrir-relatorios-organizador', nome: 'Relatórios', desc: 'Resumo, colar convocação e painéis por tipo', icone: '📋', cor: '#5FA0C4',
    visivel: () => escoposAtivos().some(e => e.chave === state.adminEscopo) },
];

function secoesVisiveis() {
  return SECOES.filter(s => !s.visivel || s.visivel());
}

function cardSecao(s) {
  const gatilho = s.acao ? `data-action="${s.acao}"` : `data-action="abrir-secao-organizador" data-tab="${s.aba}"`;
  return `
    <div class="card event-card menu-org-card" style="border-left:3px solid ${s.cor};" ${gatilho}>
      <div class="menu-org-linha">
        <div class="menu-org-icone" style="border-color:${s.cor};">${s.icone}</div>
        <div>
          <div class="name">${escapeHtml(s.nome)}</div>
          <div class="meta">${escapeHtml(s.desc)}</div>
        </div>
      </div>
      <div class="arrow">›</div>
    </div>
  `;
}

// "e hoje" / "e amanha" / "faltam 3 dias" - o numero cru ("0 dias") nao diz
// nada de imediato pra quem bate o olho.
function quando(dias) {
  if (dias === 0) return 'é hoje';
  if (dias === 1) return 'é amanhã';
  return `faltam ${dias} dias`;
}

// Aviso no topo: evento chegando e quantos ainda nao responderam. Some
// sozinho quando nao ha evento na janela - o menu volta a ser so os cards.
//
// Quem ja respondeu tudo tambem aparece, so que como lembrete tranquilo
// (sem o ⚠️): saber que o evento e amanha e util mesmo sem ter o que cobrar.
function avisoEventosProximos() {
  return eventosProximos(state.adminEscopo).map(({ ev, dias }) => {
    const r = semResposta(ev);
    const pendente = r && r.faltam > 0;
    const cor = pendente ? '#D9573C' : '#4CAF6E';
    const icone = pendente ? '⚠️' : '📅';
    const linha = [diaDaSemana(ev.data), formatDataBR(ev.data), quando(dias)]
      .filter(Boolean).join(' · ');
    const contagem = r === null
      ? 'vendo quem já respondeu…'
      : (pendente ? `${r.faltam} de ${r.total} ainda não responderam` : 'todos responderam');
    return `
      <div class="card event-card menu-org-card" style="border-left:3px solid ${cor};" data-action="open-event" data-id="${ev.id}">
        <div class="menu-org-linha">
          <div class="menu-org-icone" style="border-color:${cor};">${icone}</div>
          <div>
            <div class="name">${escapeHtml(ev.nome)}</div>
            <div class="meta">${escapeHtml(linha)}</div>
            <div class="meta" style="color:${pendente ? cor : 'var(--text-muted)'};">${escapeHtml(contagem)}</div>
          </div>
        </div>
        <div class="arrow">›</div>
      </div>
    `;
  }).join('');
}

// Entrar no menu: desenha na hora e busca as presencas dos eventos proximos
// em seguida, sem travar a tela - ate elas chegarem o aviso diz que esta
// vendo. Quem chama e o PIN (primeira entrada) e o "‹ Menu" de dentro das
// secoes, porque o numero muda enquanto a pessoa trabalha.
export async function entrarNoMenuOrganizador() {
  state.view = 'admin-menu';
  render();
  return loadPresencasProximas(eventosProximos(state.adminEscopo).map(x => x.ev));
}

export function renderMenuOrganizador(app) {
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-divisoes">‹ Trocar divisão</div>
    <div class="event-header">
      <h1 style="font-size: 20px;">Organizador</h1>
      <div class="count-box">${escapeHtml(escopoPorChave(state.adminEscopo).nome.toUpperCase())}</div>
    </div>
    ${avisoEventosProximos()}
    ${secoesVisiveis().map(cardSecao).join('')}
  `;
}

// Acoes do menu do organizador.
export const acoes = {
  'go-menu-organizador': async (id, target, action, e) => {
    return entrarNoMenuOrganizador();
  },
  'abrir-secao-organizador': async (id, target, action, e) => {
    return abrirAbaOrganizador(target.dataset.tab);
  },
  // Os Relatorios rodam com o proprio conjunto de campos no state
  // (relatorio*), separado do organizador (admin*). Aqui so passamos a
  // divisao que ja foi escolhida e liberada pelo PIN la atras.
  'abrir-relatorios-organizador': async (id, target, action, e) => {
    return entrarNosRelatorios();
  },
};
