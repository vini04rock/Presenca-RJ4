// Ponto de entrada: monta o roteador de telas, liga os ouvintes de
// clique/digitacao e faz a primeira carga.

import { loadInitial } from './dados/carregar.js';
import { state } from './nucleo/estado.js';
import { corTipoEvento } from './nucleo/config.js';
import { LOGO_SRC } from './nucleo/imagens.js';
import { definirRender } from './nucleo/render.js';
import { escapeHtml, mascaraData } from './nucleo/util.js';
import { renderAdmin } from './telas/admin.js';
import { acoes as acoesConvocacao, renderConvocacao } from './telas/convocacao.js';
import { renderCalendario, renderCalendarioDivisoes } from './telas/calendario.js';
import { renderConfirmados, renderEvent } from './telas/evento.js';
import { renderHome } from './telas/home.js';
import { renderDivisoes, renderPin } from './telas/pin.js';
import { renderRankInsights } from './telas/rank-insights.js';
import { renderRank } from './telas/rank.js';
import { renderRelatorioShell } from './telas/relatorios.js';
import { acoes as acoesRelatorios } from './telas/relatorios.js';
import { acoes as acoesAdmin } from './telas/admin.js';
import { acoes as acoesAdminEventos, aoDigitarNoFormulario, atualizarEtapasDoFormulario } from './telas/admin-eventos.js';
import { atualizarConfirmacoes } from './fluxos/evento.js';
import { acoes as acoesAdminMembros } from './telas/admin-membros.js';
import { acoes as acoesAdminInsights } from './telas/admin-insights.js';
import { acoes as acoesComuns, aplicarBusca } from './ui/comuns.js';
import { acoes as acoesGraficos } from './ui/graficos.js';
import { acoes as acoesHome } from './telas/home.js';
import { acoes as acoesEvento } from './telas/evento.js';
import { acoes as acoesRank } from './telas/rank.js';
import { acoes as acoesRankinsights } from './telas/rank-insights.js';
import { acoes as acoesPin } from './telas/pin.js';
import { acoes as acoesCalendario } from './telas/calendario.js';
import { acoes as acoesMenuOrganizador, renderMenuOrganizador } from './telas/menu-organizador.js';
import { acoes as acoesRelatorioIndividual, renderRelatorioIndividual } from './telas/relatorio-individual.js';

// Os acabamentos de luz e movimento (fim do estilo.css, "LUZ E VIDA"): cada
// um e uma classe no <html>. Pra comparar com e sem, o endereco aceita
// ?sem=reflexo,brasas - desliga so aqueles, so naquela aba.
const ACABAMENTOS = ['reflexo', 'clima', 'brasas', 'divisores'];
const semAcabamento = (new URLSearchParams(location.search).get('sem') || '').split(',');
ACABAMENTOS.filter(a => !semAcabamento.includes(a))
  .forEach(a => document.documentElement.classList.add('ac-' + a));

// A tela nova entra deslizando (.tela-entrando, no fim do estilo.css). So na
// TROCA de tela: o app redesenha a cada toque e a cada resposta da
// planilha, e animar todo redesenho faria a tela piscar. Num redesenho da
// mesma tela a classe sai na hora, e o conteudo novo aparece parado.
let telaAnterior = null;
let fimDaEntrada = null;
function marcarTrocaDeTela(app) {
  const tela = [state.loading, state.view, state.homeEventosAberto, state.homeEscopo,
    state.homeTipo, state.adminTab, state.relatorioTab, state.relatorioTipoDetalhe,
    state.currentEventId].join('|');
  clearTimeout(fimDaEntrada);
  if (tela === telaAnterior) {
    app.classList.remove('tela-entrando', 'recem-chegada');
    return;
  }
  telaAnterior = tela;
  // O reflexo que atravessa os cards de arte passa uma vez logo que a tela
  // chega (no computador ele tambem passa com o mouse). A classe dura o
  // bastante pro ultimo card terminar.
  clearTimeout(fimDoReflexo);
  app.classList.add('recem-chegada');
  fimDoReflexo = setTimeout(() => app.classList.remove('recem-chegada'), 2600);
  // Tela nova, memoria nova: os graficos dela se desenham de novo.
  jaAnimados = new Set();
  valoresVistos = new Map();
  // Entra pela direita quando avanca e pela esquerda quando volta, como
  // num app de celular. Quem decide e o toque (ver o ouvinte de clique).
  app.classList.toggle('entrando-volta', proximaDirecao === 'volta');
  proximaDirecao = 'ida';
  app.classList.add('tela-entrando');
  fimDaEntrada = setTimeout(() => app.classList.remove('tela-entrando', 'entrando-volta'), 800);
}
let proximaDirecao = 'ida';
let fimDoReflexo = null;

// O que se mexe depois de desenhado, marcado no HTML:
//   data-anima="chave"  se desenha ao aparecer (rosca, barra, linha) e o
//                       numero de dentro com data-conta sobe de 0 ate ele;
//   data-muda="lugar" + data-valor  salta quando o valor daquele lugar muda
//                       (o selo de status de um integrante).
// Cada um so anima uma vez por tela. Sem esta memoria, cada toque - que
// redesenha a tela inteira - desenharia todos os graficos de novo.
let jaAnimados = new Set();
let valoresVistos = new Map();

function animarNovidades(app) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // A mesma chave pode se repetir na tela (duas barras de 50%): a ordem de
  // aparicao desempata.
  const vezes = {};
  app.querySelectorAll('[data-anima]').forEach(el => {
    const base = el.dataset.anima;
    vezes[base] = (vezes[base] || 0) + 1;
    const chave = base + '#' + vezes[base];
    if (jaAnimados.has(chave)) return;
    jaAnimados.add(chave);
    el.classList.add('anima');
    el.querySelectorAll('[data-conta]').forEach(contarAte);
  });
  app.querySelectorAll('[data-muda]').forEach(el => {
    const lugar = el.dataset.muda, valor = el.dataset.valor;
    const antes = valoresVistos.get(lugar);
    valoresVistos.set(lugar, valor);
    if (antes !== undefined && antes !== valor) el.classList.add('saltou');
  });
}

// O numero sobe de 0 ate o valor, freando no fim. O HTML ja nasce com o
// valor final, entao se algo der errado aqui o que fica e o numero certo.
function contarAte(el) {
  const alvo = Number(el.dataset.conta);
  const sufixo = el.dataset.sufixo || '';
  const inicio = performance.now();
  const passo = agora => {
    const t = Math.min(1, (agora - inicio) / 700);
    el.textContent = Math.round(alvo * (1 - Math.pow(1 - t, 3))) + sufixo;
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function render() {
  const app = document.getElementById('app');
  marcarTrocaDeTela(app);
  desenhar(app);
  animarNovidades(app);
  aplicarBusca(app);
  atualizarPastilhaSalvar();
  // Na tela de evento, o "puxar pra baixo" e nosso: sem isto o Chrome do
  // Android recarregaria a pagina inteira no mesmo gesto.
  document.documentElement.classList.toggle('tela-evento', state.view === 'event');
  atualizarClima();
  atualizarBrasas();
}

// Luz ambiente: um halo no topo da tela, na cor do tipo do evento aberto
// (ou do tipo escolhido na tela inicial). Fora disso, sem halo.
function atualizarClima() {
  let cor = '';
  if (state.view === 'event' || state.view === 'confirmados') {
    const ev = state.events.find(e => e.id === state.currentEventId);
    if (ev && ev.tipo) cor = corTipoEvento(ev.tipo);
  } else if (state.view === 'home' && state.homeTipo && state.homeTipo !== 'todos') {
    cor = corTipoEvento(state.homeTipo);
  }
  const raiz = document.documentElement;
  if (cor) raiz.style.setProperty('--clima', cor);
  raiz.classList.toggle('com-clima', !!cor);
}

// Brasas subindo devagar no fundo, em todas as telas. Ficam fora do #app,
// que e refeito a cada toque - senao recomecariam do chao a cada redesenho.
// Sao criadas uma vez so, depois da primeira carga.
function atualizarBrasas() {
  if (state.loading || document.getElementById('brasas')) return;
  const ninho = document.createElement('div');
  ninho.id = 'brasas';
  ninho.setAttribute('aria-hidden', 'true');
  ninho.innerHTML = Array.from({ length: 16 }, () => {
    const dur = 9 + Math.random() * 8;
    return `<i style="left:${(Math.random() * 100).toFixed(1)}%; --tam:${(1.5 + Math.random() * 1.8).toFixed(1)}px;
      --vai:${(Math.random() * 60 - 30).toFixed(0)}px; animation-duration:${dur.toFixed(1)}s;
      animation-delay:-${(Math.random() * dur).toFixed(1)}s;"></i>`;
  }).join('');
  document.body.appendChild(ninho);
}


// "Salvando…" / "✅ Salvo na planilha" na tela de evento: uma pastilha que
// flutua no pe da tela, fora do #app, em vez de uma faixa que empurrava a
// lista a cada toque. O erro de gravacao continua como faixa na propria
// tela (renderStatusBanner) - esse nao pode passar despercebido.
function atualizarPastilhaSalvar() {
  const mostrar = state.view === 'event' && (state.saveState === 'saving' || state.saveState === 'saved');
  let el = document.getElementById('pastilha-salvar');
  if (!el) {
    if (!mostrar) return;
    el = document.createElement('div');
    el.id = 'pastilha-salvar';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  // Ao sumir, o texto fica como estava, pra pastilha nao trocar de frase
  // enquanto desaparece.
  if (mostrar) el.textContent = state.saveState === 'saving' ? 'Salvando… pode continuar marcando' : '✅ Salvo na planilha';
  el.classList.toggle('visivel', mostrar);
  el.classList.toggle('salvo', state.saveState === 'saved');
}

// Enquanto a planilha nao responde: o contorno da tela inicial em vidro,
// com um brilho passando, em vez de um texto solto. O conteudo de verdade
// aparece no lugar dele, sem a tela pular.
const ESQUELETO = `
  <div class="esqueleto-tela" aria-busy="true">
    <div class="esqueleto esqueleto-logo"></div>
    <div class="esqueleto esqueleto-titulo"></div>
    <div class="esqueleto esqueleto-linha"></div>
    <div class="esqueleto esqueleto-card"></div>
    <div class="esqueleto-dupla">
      <div class="esqueleto esqueleto-card-baixo"></div>
      <div class="esqueleto esqueleto-card-baixo"></div>
    </div>
    <div class="esqueleto esqueleto-card-alto"></div>
    <div class="loading">Carregando…</div>
  </div>
`;

function desenhar(app) {
  if (state.loading) {
    app.innerHTML = ESQUELETO;
    return;
  }
  if (state.loadError) {
    app.innerHTML = `
      <div class="crest-wrap">
        <img src="${LOGO_SRC}" alt="Insanos MC Regional RJ4">
      </div>
      <div class="alert">
        <div class="alert-title">Não consegui carregar os dados</div>
        <div class="alert-msg">${escapeHtml(state.loadError)}.<br>Verifique sua conexão e tente de novo.</div>
      </div>
      <button class="btn block" data-action="retry-load">Tentar de novo</button>
    `;
    return;
  }
  if (state.view === 'home') return renderHome(app);
  if (state.view === 'event') return renderEvent(app);
  if (state.view === 'confirmados') return renderConfirmados(app);
  if (state.view === 'rank') return renderRank(app);
  if (state.view === 'rank-insights') return renderRankInsights(app);
  if (state.view === 'admin-divisoes') return renderDivisoes(app);
  if (state.view === 'admin-pin') return renderPin(app);
  if (state.view === 'admin-menu') return renderMenuOrganizador(app);
  if (state.view === 'admin') return renderAdmin(app);
  if (state.view === 'relatorio-individual') return renderRelatorioIndividual(app);
  if (state.view === 'convocacao') return renderConvocacao(app);
  if (state.view === 'relatorio') return renderRelatorioShell(app);
  if (state.view === 'calendario-divisoes') return renderCalendarioDivisoes(app);
  if (state.view === 'calendario') return renderCalendario(app);
}

// Os campos de data NAO tem tratador aqui de proposito - o valor deles so e
// lido quando se toca em "Atualizar" (ver aplicar-relatorio-filtro-periodo
// e aplicar-insight-filtro-periodo). Duas tentativas de reagir enquanto a
// pessoa digita falharam, e por motivos diferentes:
//
// 1. Redesenhar a cada tecla ("input"): um <input type="date"> so entrega
//    valor com os tres pedacos completos, entao o campo voltava pro zero a
//    cada tecla.
// 2. Redesenhar quando a data fica completa ("change"): no ano isso acontece
//    no PRIMEIRO digito - "25/09/2" ja vale como 25/09/0002, uma data
//    valida. O redesenho levava embora o resto do ano.
//
// Por isso o botao. Ninguem adivinha quando a pessoa terminou de digitar -
// ela avisa, tocando em "Atualizar", "Salvar" ou "Confirmar".
//
// (Depois disso o campo nativo saiu de cena de vez, por outro motivo: ele
//  seguia o idioma do navegador e virava mm/dd/yyyy num Chrome em ingles.
//  Ver nucleo/util.js. O unico tratador de digitacao que sobrou e a mascara
//  abaixo, que so poe as barras e nao redesenha a tela.)
document.getElementById('app').addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-data')) {
    const cursorNoFim = e.target.selectionStart === e.target.value.length;
    e.target.value = mascaraData(e.target.value);
    // Digitando no fim (o caso normal), mantem o cursor no fim - senao a
    // barra recem-inserida jogaria o cursor pra tras.
    if (cursorNoFim) e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    // A data do formulario de evento tambem vai pro state (ja com as barras).
    if (aoDigitarNoFormulario(e.target)) atualizarEtapasDoFormulario(document.getElementById('app'));
    return;
  }
  // A busca do evento filtra sem redesenhar - redesenhar fecharia o teclado.
  if (e.target.id === 'busca-membro') {
    state.buscaMembro = e.target.value;
    aplicarBusca(document.getElementById('app'));
    return;
  }
  // O formulario de evento guarda tudo no state enquanto se digita - ver
  // aoDigitarNoFormulario. Nao redesenha: so lembra.
  if (aoDigitarNoFormulario(e.target)) {
    atualizarEtapasDoFormulario(document.getElementById('app'));
    return;
  }
  if (e.target.id === 'new-member-nome') {
    state.newMemberNome = e.target.value;
  }
  if (e.target.id === 'relatorio-texto-field') {
    state.relatorioTextoBruto = e.target.value;
  }
  if (e.target.dataset && e.target.dataset.action === 'resolver-membro') {
    const i = Number(e.target.dataset.index);
    const row = state.relatorioParsed.membrosParsed[i];
    row.membroId = e.target.value || null;
    row.sugestoes = [];
    render();
  }
});

// O mapa de acoes: cada area traz as suas, e aqui viram um dicionario so.
// Dois modulos nao podem registrar a mesma acao - a conferencia abaixo
// avisa na hora de carregar, em vez de uma sobrescrever a outra calada.
const ACOES = {};
for (const [area, mapa] of Object.entries({
  acoesRelatorios,
  acoesAdmin,
  acoesAdminEventos,
  acoesAdminMembros,
  acoesAdminInsights,
  acoesComuns,
  acoesGraficos,
  acoesHome,
  acoesEvento,
  acoesRank,
  acoesRankinsights,
  acoesPin,
  acoesCalendario,
  acoesMenuOrganizador,
  acoesConvocacao,
  acoesRelatorioIndividual,
})) {
  for (const nome of Object.keys(mapa)) {
    if (ACOES[nome]) throw new Error('Acao repetida em ' + area + ': ' + nome);
    ACOES[nome] = mapa[nome];
  }
}
ACOES['retry-load'] = async (id, target, action, e) => {
    return loadInitial();
};

document.getElementById('app').addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  const tratar = ACOES[action];
  if (!tratar) return;
  // Botao de voltar faz a proxima tela entrar pela esquerda.
  if (target.classList.contains('back-link') || /^(voltar|close|fechar)/.test(action)) proximaDirecao = 'volta';
  return tratar(id, target, action, e);
});

// Cards de arte inclinam na direcao do mouse, com o reflexo seguindo -
// so no computador (no celular nao ha "passar por cima") e so pra quem nao
// pediu menos movimento.
const SELETOR_INCLINA = '.card-eventos-home, .card-rank-home, .card-regional-home, .card-divisao-home, .card-admin-home, .home-btn-organizador, .tipo-home-card, .menu-org-card';
const podeInclinar = window.matchMedia
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let cardInclinado = null;
function soltarCard(el) {
  el.classList.remove('inclinado');
  el.style.removeProperty('--rx');
  el.style.removeProperty('--ry');
}
if (podeInclinar) {
  const appEl = document.getElementById('app');
  appEl.addEventListener('pointermove', (e) => {
    const el = e.target.closest(SELETOR_INCLINA);
    if (cardInclinado && cardInclinado !== el) soltarCard(cardInclinado);
    cardInclinado = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.classList.add('inclinado');
  });
  appEl.addEventListener('pointerleave', () => {
    if (cardInclinado) soltarCard(cardInclinado);
    cardInclinado = null;
  });
}

// A barra fixa do topo do evento (.barra-fixa) mostra o nome so depois que
// a capa sai da tela. Um ouvinte so, pro app inteiro: liga e desliga uma
// classe no body, sem redesenhar nada.
window.addEventListener('scroll', () => {
  document.body.classList.toggle('rolou', window.scrollY > 150);
}, { passive: true });

// Puxar pra atualizar, na tela de evento: com a pagina no topo, arrastar
// pra baixo mostra uma moto que gira conforme o dedo desce; soltando depois
// de PUXAR_PX, busca as respostas de novo (atualizarConfirmacoes).
const PUXAR_PX = 80;
let puxarInicio = null;
let puxarDistancia = 0;
function indicadorPuxar() {
  let el = document.getElementById('puxar-atualizar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'puxar-atualizar';
    el.innerHTML = '<span>🏍️</span>';
    document.body.appendChild(el);
  }
  return el;
}
window.addEventListener('touchstart', (e) => {
  puxarInicio = (state.view === 'event' && state.statusLoaded && !state.atualizandoStatus && window.scrollY <= 0)
    ? e.touches[0].clientY : null;
  puxarDistancia = 0;
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (puxarInicio === null) return;
  puxarDistancia = Math.max(0, Math.min(140, e.touches[0].clientY - puxarInicio));
  const el = indicadorPuxar();
  el.style.setProperty('--puxado', puxarDistancia + 'px');
  el.style.setProperty('--giro', (puxarDistancia * 3) + 'deg');
  el.classList.toggle('pronto', puxarDistancia >= PUXAR_PX);
  el.classList.toggle('visivel', puxarDistancia > 10);
}, { passive: true });
window.addEventListener('touchend', () => {
  if (puxarInicio === null) return;
  const disparar = puxarDistancia >= PUXAR_PX;
  puxarInicio = null;
  const el = document.getElementById('puxar-atualizar');
  if (el) el.classList.remove('visivel', 'pronto');
  if (disparar) atualizarConfirmacoes();
}, { passive: true });

definirRender(render);
loadInitial();
