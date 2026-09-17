// Ponto de entrada: monta o roteador de telas, liga os ouvintes de
// clique/digitacao e faz a primeira carga.

import { loadInitial } from './dados/carregar.js';
import { state } from './nucleo/estado.js';
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
import { acoes as acoesComuns } from './ui/comuns.js';
import { acoes as acoesGraficos } from './ui/graficos.js';
import { acoes as acoesHome } from './telas/home.js';
import { acoes as acoesEvento } from './telas/evento.js';
import { acoes as acoesRank } from './telas/rank.js';
import { acoes as acoesRankinsights } from './telas/rank-insights.js';
import { acoes as acoesPin } from './telas/pin.js';
import { acoes as acoesCalendario } from './telas/calendario.js';
import { acoes as acoesMenuOrganizador, renderMenuOrganizador } from './telas/menu-organizador.js';

function render() {
  const app = document.getElementById('app');
  if (state.loading) {
    app.innerHTML = '<div class="loading">Carregando…</div>';
    return;
  }
  if (state.loadError) {
    app.innerHTML = `
      <div class="crest-wrap">
        <img src="${LOGO_SRC}" alt="Insanos MC Brasil">
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
  return tratar(id, target, action, e);
});

definirRender(render);
loadInitial();
