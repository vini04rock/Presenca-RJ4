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
import { alertasHonrarias, textoPrazoHonraria } from '../dominio/honrarias.js';
import { carregarAniversarios, carregarTextosChamada, loadPresencasProximas } from '../dados/carregar.js';
import { aniversariosProximos } from '../dominio/carteirinha.js';
import { escopoPorChave, escoposAtivos, temDoacoesECaixinha } from '../nucleo/config.js';
import { TIPOS_OBRIGATORIOS, obrigatoriedadesDoMes, rotuloTipo, textoCobrancaObrigatoriedades, textoDiasRestantes, textoEventoMarcado, textoFaltam } from '../dominio/obrigatoriedades.js';
import { copiarTexto, diaDaSemana, formatDataBR, hojeISO, quando } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { IMG_AREAS, IMG_SECOES } from '../nucleo/imagens.js';
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
  { area: 'operacional', aba: 'eventos', nome: 'Eventos', desc: 'Criar, editar, encerrar e ver os encerrados', icone: '🏍️', cor: '#E0B23C' },
  { area: 'adm', aba: 'membros', nome: 'Membros', desc: 'Cadastro, grau, cargo, funções e presenças', icone: '👥', cor: '#4C86D9' },
  // Em todas as 7 divisoes: cada uma ve os proprios integrantes, e o
  // Regional escolhe a divisao antes do nome.
  { area: 'operacional', acao: 'abrir-relatorio-individual', nome: 'Relatório individual', desc: 'Presença e Insight de cada integrante', icone: '📄', cor: '#D4A24C' },
  // Insight e rodada do Regional - nao existe no nivel da divisao.
  { area: 'operacional', aba: 'insights', nome: 'Insights', desc: 'Rodadas de Insight', icone: '💡', cor: '#B57EDC', visivel: () => state.adminEscopo === 'regional' },
  // Doacoes e Caixinha so nas divisoes liberadas - decisao que mora em
  // temDoacoesECaixinha(), pra replicar pras outras num lugar so.
  // No Regional as duas tem jeito proprio: das Doacoes so o estoque, e a
  // Caixinha vem das divisoes - "noRegional" troca a aba de entrada e a
  // explicacao.
  { area: 'social', aba: 'doacoes', nome: 'Doações', desc: 'Alimento de cada evento, o rank e o estoque', icone: '🥫', cor: '#4CAF6E',
    noRegional: { aba: 'doacoes-estoque', desc: 'O estoque do Regional' },
    visivel: () => temDoacoesECaixinha(state.adminEscopo) },
  // O planejador de Acoes Sociais: nas 7 divisoes, cada uma com o seu.
  { area: 'social', aba: 'acoes-sociais', nome: 'Ações Sociais', desc: 'Agenda do ano, banco de ideias e textos', icone: '🤝', cor: '#4CAF6E' },
  { area: 'adm', aba: 'caixinha', nome: 'Caixinha', desc: 'Quem pagou, quanto entrou e saiu, e o saldo do caixa', icone: '💰', cor: '#C9A227',
    noRegional: { desc: 'O que cada divisão contribuiu, entradas, saídas e o saldo' },
    visivel: () => temDoacoesECaixinha(state.adminEscopo) },
  { area: 'adm', aba: 'estoque-adm-movimentar', nome: 'Estoque ADM', desc: 'Materiais, entradas, saídas e histórico', icone: '📦', cor: '#C47A3D',
    visivel: () => state.adminEscopo === 'regional' },
  // Nas 7: cada divisao ve o proprio livro, e o Regional o quadro de todas.
  { area: 'adm', aba: 'movimentos', nome: 'Entrada/Saída', desc: 'Quem entrou, quem está afastado e quem saiu', icone: '🔄', cor: '#8FA3B8' },
  // Os Relatorios seguem so no Regional e na Barra - decisao do clube, que
  // mora em escoposAtivos() para nao ficar repetida aqui. Como a divisao e
  // o PIN ja vieram do organizador, nao ha PIN de novo.
  { area: 'operacional', acao: 'abrir-relatorios-organizador', nome: 'Relatórios', desc: 'Resumo, colar convocação e painéis por tipo', icone: '📋', cor: '#5FA0C4',
    visivel: () => escoposAtivos().some(e => e.chave === state.adminEscopo) },
];

const AREAS = [
  { chave: 'adm', nome: 'ADM', desc: 'Membros, caixinha e movimentações', icone: '🗂️', cor: '#4C86D9' },
  { chave: 'operacional', nome: 'Operacional', desc: 'Eventos, relatórios e Insights', icone: '🏍️', cor: '#E0B23C' },
  { chave: 'social', nome: 'Social', desc: 'Doações, estoque e ações sociais', icone: '🤝', cor: '#4CAF6E' },
];
const ORDEM_POR_AREA = {
  adm: ['caixinha', 'estoque-adm-movimentar', 'movimentos', 'membros'],
  operacional: ['abrir-relatorios-organizador', 'abrir-relatorio-individual', 'insights', 'eventos'],
  social: ['doacoes', 'acoes-sociais'],
};

function secoesVisiveis(area) {
  const lista = SECOES.filter(s => (!area || s.area === area) && (!s.visivel || s.visivel()));
  if (!area) return lista;
  const ordem = ORDEM_POR_AREA[area] || [];
  return lista.sort((a, b) => ordem.indexOf(a.acao || a.aba) - ordem.indexOf(b.acao || b.aba));
}

function areasVisiveis() {
  return AREAS.filter(a => secoesVisiveis(a.chave).length);
}

// Cada area tem a propria arte (20/10/2026). Uma area nova sem arte cai no
// card de sempre, com icone e texto.
function cardArea(area) {
  if (IMG_AREAS[area.chave]) {
    // A arte ja traz titulo, descricao, icone e seta - o card e so ela.
    return `
      <div class="card event-card menu-org-area menu-org-area-arte" role="button" aria-label="${escapeHtml(area.nome + ' - ' + area.desc)}"
           style="background-image:url('${IMG_AREAS[area.chave]}');" data-action="abrir-area-organizador" data-value="${area.chave}"></div>
    `;
  }
  return `
    <div class="card event-card menu-org-card menu-org-area" style="border-left:3px solid ${area.cor};" data-action="abrir-area-organizador" data-value="${area.chave}">
      <div class="menu-org-linha">
        <div class="menu-org-icone" style="border-color:${area.cor};">${area.icone}</div>
        <div><div class="name">${escapeHtml(area.nome)}</div><div class="meta">${escapeHtml(area.desc)}</div></div>
      </div>
      <div class="arrow">›</div>
    </div>
  `;
}

function cardSecao(secao) {
  const s = state.adminEscopo === 'regional' && secao.noRegional ? { ...secao, ...secao.noRegional } : secao;
  const gatilho = s.acao ? `data-action="${s.acao}"` : `data-action="abrir-secao-organizador" data-tab="${s.aba}"`;
  // Com arte: o card e a arte inteira (sem corte). O emoji da secao fica de
  // fora - a arte ja tem o proprio icone. A chave e a da secao original:
  // no Regional o "noRegional" troca a aba (Doacoes abre no estoque).
  const arte = IMG_SECOES[secao.aba || secao.acao];
  if (arte) {
    let texto = '';
    if (arte.texto) {
      texto = `
        <div class="menu-org-secao-texto" style="left:${arte.texto[0]}%; width:${arte.texto[1]}%;">
          <div class="menu-org-secao-nome" style="color:${arte.cores[0]};">${escapeHtml(s.nome)}</div>
          <div class="menu-org-secao-desc" style="color:${arte.cores[1]};">${escapeHtml(s.desc)}</div>
        </div>`;
    } else if (arte.desc) {
      texto = `
        <div class="menu-org-secao-desc menu-org-secao-so-desc" style="left:${arte.desc[0]}%; top:${arte.desc[1]}%; width:${arte.desc[2]}%; color:${arte.cores[1]};">${escapeHtml(s.desc)}</div>`;
    }
    return `
      <div class="card event-card menu-org-card menu-org-secao-arte" role="button" aria-label="${escapeHtml(s.nome + ' - ' + s.desc)}" ${gatilho}
           style="background-image:url('${arte.src}'); aspect-ratio:${arte.largura} / ${arte.altura};">${texto}
      </div>
    `;
  }
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

// Um aviso do mural: o evento que esta chegando e quantos ainda nao
// responderam. Uma linha, nao um card - na janela de 2 dias e comum ter
// dois eventos seguidos, e como cards soltos eles empurravam as secoes pra
// fora da tela e disputavam atencao com elas.
//
// Quem ja respondeu tudo tambem aparece, so que como lembrete tranquilo
// (📅 verde, sem o ⚠️): saber que o evento e amanha e util mesmo sem ter o
// que cobrar. A cor fica na linha, nao no mural - com dois eventos de
// urgencias diferentes, uma cor unica pro bloco mentiria sobre um dos dois.
function linhaAviso({ ev, dias }) {
  const r = semResposta(ev);
  const pendente = r && r.faltam > 0;
  const cor = pendente ? '#D9573C' : '#4CAF6E';
  // Todo mundo respondeu: vira ✅, com um salto quando aparece (data-anima).
  const todosOk = r !== null && !pendente;
  const icone = pendente ? '⚠️' : todosOk ? '✅' : '📅';
  const detalhe = [diaDaSemana(ev.data), formatDataBR(ev.data), quando(dias)]
    .filter(Boolean).join(' · ');
  const contagem = r === null
    ? 'vendo quem já respondeu…'
    : (pendente ? `${r.faltam} de ${r.total} ainda não responderam` : 'todos responderam');
  return `
    <div class="aviso-linha" style="border-left-color:${cor};" data-action="open-event" data-id="${ev.id}">
      <div class="aviso-icone${pendente ? ' pulsando' : ''}${todosOk ? ' aviso-ok' : ''}" style="border-color:${cor};"${todosOk ? ` data-anima="mural-ok:${ev.id}"` : ''}>${icone}</div>
      <div class="aviso-texto">
        <div class="aviso-nome">${escapeHtml(ev.nome)}</div>
        <div class="aviso-meta">${escapeHtml(detalhe)}</div>
        <div class="aviso-contagem" style="color:${pendente ? cor : 'var(--text-muted)'};">${escapeHtml(contagem)}</div>
      </div>
      ${pendente
        ? `<button class="aviso-cobrar" data-action="copiar-cobranca" data-id="${ev.id}" title="Copiar a lista de quem falta pro WhatsApp">📋 Chamado</button>`
        : '<div class="aviso-seta">›</div>'}
    </div>
  `;
}

// O aniversario de um irmao (a data vem da carteirinha): de 7 dias antes
// ate o dia. No dia, o aviso ganha a cor de destaque.
function linhaAniversario(a) {
  const regional = state.adminEscopo === 'regional';
  const data = a.nascimento.slice(8, 10) + '/' + a.nascimento.slice(5, 7);
  const detalhe = [regional ? a.divisao : '', a.grau ? `Grau ${a.grau}` : '', data].filter(Boolean).join(' · ');
  const cor = a.dias === 0 ? '#E0B24D' : '#D46A9F';
  const prazo = a.dias === 0 ? 'É hoje! 🎉' : quando(a.dias).replace(/^./, c => c.toUpperCase());
  return `
    <div class="aviso-linha" style="border-left-color:${cor};">
      <div class="aviso-icone${a.dias === 0 ? ' pulsando' : ''}" style="border-color:${cor};">🎂</div>
      <div class="aviso-texto">
        <div class="aviso-nome">Aniversário — ${escapeHtml(a.nome)}</div>
        <div class="aviso-meta">${escapeHtml(detalhe)}</div>
        <div class="aviso-contagem" style="color:${cor};">${escapeHtml(prazo)} · faz ${a.idade} anos</div>
      </div>
    </div>
  `;
}

function linhaHonraria(h) {
  const regional = state.adminEscopo === 'regional';
  const detalhe = [regional ? h.membro.divisao : '', formatDataBR(h.data)].filter(Boolean).join(' · ');
  return `
    <div class="aviso-linha aviso-honraria" style="border-left-color:#E0B24D;">
      <div class="aviso-icone" style="border-color:#E0B24D;">🏅</div>
      <div class="aviso-texto">
        <div class="aviso-nome">Medalha de ${h.anos} anos — ${escapeHtml(h.membro.nome)}</div>
        <div class="aviso-meta">${escapeHtml(detalhe)}</div>
        <div class="aviso-contagem" style="color:#E0B24D;">${escapeHtml(textoPrazoHonraria(h.dias))}</div>
      </div>
    </div>
  `;
}

// Quem chegou por transferencia e ainda nao teve o grau confirmado pela
// divisao. Um aviso so, com a contagem; tocar abre o cadastro, onde cada
// um tem o "✅ Confirmar grau".
function linhaGrauPendente(membros) {
  const n = membros.length;
  return `
    <div class="aviso-linha" style="border-left-color:#5FA0C4;" data-action="abrir-secao-organizador" data-tab="membros">
      <div class="aviso-icone" style="border-color:#5FA0C4;">⏳</div>
      <div class="aviso-texto">
        <div class="aviso-nome">${n} ${n === 1 ? 'integrante' : 'integrantes'} com grau a confirmar</div>
        <div class="aviso-meta">${escapeHtml(membros.map(m => m.nome).join(', '))}</div>
        <div class="aviso-contagem" style="color:#5FA0C4;">${n === 1 ? 'Chegou' : 'Chegaram'} por transferência · confirme em Membros</div>
      </div>
      <div class="aviso-seta">›</div>
    </div>
  `;
}

function avisosDoMural() {
  const nomeDivisao = escopoPorChave(state.adminEscopo).nome;
  const grauAConfirmar = state.roster.filter(m => m.grauPendente && m.divisao === nomeDivisao);
  const graus = grauAConfirmar.length ? [{ tipo:'grau', prioridade:1, ordem:'', dados:grauAConfirmar }] : [];
  const eventos = eventosProximos(state.adminEscopo).map(dados => {
    const r = semResposta(dados.ev);
    // Evento que ainda pode ter pendencia fica no topo. Se todos ja
    // responderam, vira o lembrete tranquilo do fim da lista.
    const prioridade = r === null || r.faltam > 0 ? 0 : 3;
    return { tipo:'evento', prioridade, ordem:dados.ev.data + '|' + (dados.ev.horario || ''), dados };
  });
  const honrarias = alertasHonrarias(state.roster, state.adminEscopo).map(h => ({
    tipo:'honraria', prioridade:h.dias <= 30 ? 1 : 2,
    ordem:String(h.dias + 1000).padStart(4, '0') + '|' + h.membro.nome, dados:h,
  }));
  // Aniversario de hoje junto dos avisos importantes; os da semana, depois.
  const lista = state.aniversariosEscopo === state.adminEscopo ? (state.aniversarios || []) : [];
  const aniversarios = aniversariosProximos(lista, hojeISO(), 7).map(a => ({
    tipo:'aniversario', prioridade:a.dias === 0 ? 1 : 2, ordem:String(a.dias).padStart(4, '0') + '|' + a.nome, dados:a,
  }));
  return eventos.concat(graus, honrarias, aniversarios).sort((a, b) => a.prioridade - b.prioridade || a.ordem.localeCompare(b.ordem));
}

// O mural fica na tela mesmo sem nenhum aviso, com a mesma altura de
// sempre: e um quadro fixo na parede, e os avisos e que vao e vem. Vazio,
// ele diz que nao ha nada - silencio informado, diferente do bloco que
// sumia e deixava a duvida entre "nada pra ver" e "ainda carregando".
//
// O rotulo nao muda com a contagem, justamente porque o mural e permanente:
// "Mural de avisos" continua verdade com zero, um ou cinco eventos.
function muralDeAvisos() {
  const avisos = avisosDoMural();
  const conteudo = avisos.length
    ? avisos.map(a => a.tipo === 'evento' ? linhaAviso(a.dados) : a.tipo === 'grau' ? linhaGrauPendente(a.dados)
      : a.tipo === 'aniversario' ? linhaAniversario(a.dados) : linhaHonraria(a.dados)).join('')
    : '<div class="aviso-vazio">Nenhum aviso no momento</div>';
  return `
    <div class="rotulo-secao">Mural de avisos</div>
    <div class="card aviso-painel">${conteudo}</div>
  `;
}

// Obrigatoriedades do mes, so no Regional: as divisoes que ainda nao
// marcaram no calendario algum dos eventos obrigatorios do mes (as regras
// moram em dominio/obrigatoriedades.js). Mesmo visual das linhas do mural,
// mas sem a altura fixa dele: aqui cada divisao abre o proprio detalhe.
// Amarelo enquanto ha tempo; vermelho nos ultimos dias do mes. Como o
// mural, nao some quando esta tudo certo - diz que esta.
const COR_OK = '#4CAF6E';
function linhaObrigatoriedade(d, cor) {
  const chave = d.escopo.chave;
  const aberta = state.obrigatoriedadeAberta === chave;
  return `
    <div class="aviso-linha" style="border-left-color:${cor}; height:auto; min-height:58px; padding:8px 12px;" data-action="abrir-obrigatoriedade" data-value="${chave}">
      <div class="aviso-icone" style="border-color:${cor};">⚠️</div>
      <div class="aviso-texto">
        <div class="aviso-nome">${escapeHtml(d.escopo.nome)}</div>
        <div class="aviso-contagem" style="color:${cor};">${escapeHtml(textoFaltam(d.faltam))}</div>
      </div>
      <div class="aviso-seta">${aberta ? '⌄' : '›'}</div>
    </div>
    ${aberta ? `
      <div style="padding:2px 12px 10px 50px; border-left:3px solid ${cor};">
        ${d.tipos.map(t => `
          <div style="font-size:12px; padding:3px 0; color:${t.ok ? 'var(--text)' : 'var(--status-infracional)'};">
            ${t.ok ? '✅' : '❌'} ${escapeHtml(rotuloTipo(t.tipo))}<span style="color:var(--text-muted);"> — ${escapeHtml(textoEventoMarcado(t))}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function cardObrigatoriedades() {
  const r = obrigatoriedadesDoMes(state.events);
  const n = r.devendo.length;
  const cor = r.urgente ? '#D9573C' : '#E0B24D';
  const topo = `${r.nomeMes} · ${textoDiasRestantes(r.diasRestantes)} · ${n ? `${n} ${n === 1 ? 'divisão' : 'divisões'} com pendência` : 'tudo em dia'}`;
  const conteudo = n
    ? r.devendo.map(d => linhaObrigatoriedade(d, cor)).join('')
    : `
      <div class="aviso-linha" style="border-left-color:${COR_OK}; height:auto; padding:12px; cursor:default;">
        <div class="aviso-icone aviso-ok" style="border-color:${COR_OK};">✅</div>
        <div class="aviso-texto"><div class="aviso-meta" style="font-size:12px;">Todas as divisões marcaram os ${TIPOS_OBRIGATORIOS.length} eventos de ${escapeHtml(r.nomeMes)}.</div></div>
      </div>
    `;
  return `
    <div class="rotulo-secao">Eventos de divisão do mês</div>
    <div class="card" style="padding:0; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px;">
        <div style="font-size:12px; font-weight:600; color:${n ? cor : COR_OK};">${n ? '⚠️' : '✅'} ${escapeHtml(topo)}</div>
        ${n ? '<button class="aviso-cobrar" data-action="copiar-obrigatoriedades" title="Copiar as pendências pro WhatsApp">📋 Chamado</button>' : ''}
      </div>
      ${conteudo}
    </div>
  `;
}

// Entrar no menu: desenha na hora e busca as presencas dos eventos proximos
// em seguida, sem travar a tela - ate elas chegarem o aviso diz que esta
// vendo. Quem chama e o PIN (primeira entrada) e o "‹ Menu" de dentro das
// secoes, porque o numero muda enquanto a pessoa trabalha.
export async function entrarNoMenuOrganizador(naRaiz = false) {
  if (naRaiz) state.organizadorArea = null;
  state.view = 'admin-menu';
  render();
  carregarTextosChamada();
  carregarAniversarios();
  return loadPresencasProximas(eventosProximos(state.adminEscopo).map(x => x.ev));
}

export function renderMenuOrganizador(app) {
  const area = AREAS.find(a => a.chave === state.organizadorArea);
  if (area) {
    app.innerHTML = `
      <div class="back-link on-photo" data-action="voltar-areas-organizador">‹ Menu do organizador</div>
      <div class="event-header">
        <h1 style="font-size:20px;">${escapeHtml(area.nome)}</h1>
        <div class="count-box">${escapeHtml(escopoPorChave(state.adminEscopo).nome.toUpperCase())}</div>
      </div>
      <div class="rotulo-secao">Ferramentas</div>
      ${secoesVisiveis(area.chave).map(cardSecao).join('')}
    `;
    return;
  }
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-divisoes">‹ Trocar divisão</div>
    <div class="event-header">
      <h1 style="font-size: 20px;">Organizador</h1>
      <div class="count-box">${escapeHtml(escopoPorChave(state.adminEscopo).nome.toUpperCase())}</div>
    </div>
    ${muralDeAvisos()}
    ${state.adminEscopo === 'regional' ? cardObrigatoriedades() : ''}
    <div class="rotulo-secao">Áreas</div>
    ${areasVisiveis().map(cardArea).join('')}
  `;
}

// Acoes do menu do organizador.
export const acoes = {
  'go-menu-organizador': async (id, target, action, e) => {
    return entrarNoMenuOrganizador();
  },
  'abrir-area-organizador': async (id, target, action, e) => {
    state.organizadorArea = target.dataset.value;
    return render();
  },
  'voltar-areas-organizador': async (id, target, action, e) => {
    state.organizadorArea = null;
    return render();
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
  // Abre (ou fecha) o detalhe de uma divisao no card de obrigatoriedades.
  'abrir-obrigatoriedade': async (id, target, action, e) => {
    const chave = target.dataset.value;
    state.obrigatoriedadeAberta = state.obrigatoriedadeAberta === chave ? null : chave;
    return render();
  },
  'copiar-obrigatoriedades': async (id, target, action, e) => {
    return copiarTexto(textoCobrancaObrigatoriedades(obrigatoriedadesDoMes(state.events)));
  },
};
