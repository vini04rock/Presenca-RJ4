// Modo organizador, secao Entrada/Saida: quem entrou, quem esta afastado e
// quem saiu. Numa divisao, o relatorio dela; no Regional, o quadro de todas
// as divisoes, e cada uma abre a propria linha do tempo. As contas moram em
// dominio/movimentos.js; o registro, no cadastro de membros.

import { carregarMovimentos } from '../dados/carregar.js';
import { rotuloPilula } from '../dominio/doacoes.js';
import { PERIODOS_MOVIMENTOS, TIPOS_MOVIMENTO, quadroRegional, rotuloMovimento, rotuloPeriodoMovimentos, resumoMovimentos, textoMovimentos, textoQuadroRegional } from '../dominio/movimentos.js';
import { escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, dataDoCampoOuAvisar, escapeHtml, formatDataBR } from '../nucleo/util.js';
import { campoData, selinhoIniciais } from '../ui/comuns.js';
import { esqueletoLista, renderPizza } from '../ui/graficos.js';
import { imagemMovimentos, imagemQuadroMovimentos, mostrarPreviaImagem } from '../ui/imagem.js';

function dados() {
  return state.movimentosDadosEscopo === state.adminEscopo ? state.movimentosDados : null;
}

// Qual relatorio de divisao esta na tela: a propria divisao, ou a que o
// Regional abriu no quadro. null = o quadro do Regional.
function chaveAberta() {
  if (state.adminEscopo !== 'regional') return state.adminEscopo;
  return state.movimentosDivisaoAberta;
}

// "1 mes" e "Tudo" em cima e, embaixo, "Por periodo": duas datas e o
// Aplicar (decisao do clube, 19/10/2026 - antes eram 3, 6, 12 meses e
// tudo, a lista das Doacoes e da Caixinha, que continua la). Com o periodo
// aplicado, nenhum dos dois botoes fica marcado; tocar num volta a ele.
function pilulas() {
  const p = state.movimentosPeriodo;
  const livre = p && typeof p === 'object' ? p : null;
  return `
    <div class="no-print">
      <div class="pilulas-periodo">
        ${PERIODOS_MOVIMENTOS.map(m => `<button class="pilula ${p === m ? 'active' : ''}" data-action="movimentos-periodo" data-value="${m}">${m === 1 ? '1 mês' : rotuloPilula(m)}</button>`).join('')}
      </div>
      <div class="fin-ou-mes">ou por período${livre ? `: <b>${escapeHtml(rotuloPeriodoMovimentos(livre))}</b>` : ''}</div>
      <div class="row-gap">
        ${campoData({ id: 'mov-periodo-de', rotulo: 'De', valor: livre ? livre.de : '', estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'mov-periodo-ate', rotulo: 'Até', valor: livre ? livre.ate : '', estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <button class="btn secondary block" style="margin:8px 0 14px;" data-action="movimentos-aplicar-periodo">Aplicar período</button>
    </div>
  `;
}

// A pizza dos quatro numeros, entre o placar e os botoes. Mesmas cores do
// placar e das imagens: verde entrou, amarelo afastado, vermelho desligado,
// azul transferencia.
function pizzaMovimentos(entradas, afastados, desligamentos, transferencias) {
  return renderPizza([
    { label: 'Entraram', value: entradas, cor: 'var(--status-confirmado)' },
    { label: 'Afastados agora', value: afastados, cor: '#E0B24D' },
    { label: 'Desligados', value: desligamentos, cor: 'var(--status-infracional)' },
    { label: transferencias.rotulo, value: transferencias.n, cor: '#5FA0C4' },
  ], 130, 'Nada no período');
}

// Os quatro numeros, dois a dois. `transferencias` = { n, rotulo, detalhe }:
// numa divisao, quem chegou + quem saiu; no total da RJ4, so quem foi pra
// outra regional (entre divisoes daqui, uma saida e uma chegada se anulam).
function placar(entradas, afastados, desligamentos, transferencias) {
  return `
    <div class="mov-placar" data-anima="placar:${entradas},${afastados},${desligamentos},${transferencias.n}">
      <div class="mov-placar-item mov-entrada"><b data-conta="${entradas}">${entradas}</b><span>🟢 Entraram</span></div>
      <div class="mov-placar-item mov-afastamento"><b data-conta="${afastados}">${afastados}</b><span>⏸️ Afastados agora</span></div>
      <div class="mov-placar-item mov-desligamento"><b data-conta="${desligamentos}">${desligamentos}</b><span>🚪 Desligados</span></div>
      <div class="mov-placar-item mov-transferencia"><b data-conta="${transferencias.n}">${transferencias.n}</b><span>🔁 ${escapeHtml(transferencias.rotulo)}</span>${transferencias.detalhe ? `<span>${escapeHtml(transferencias.detalhe)}</span>` : ''}</div>
    </div>
  `;
}

function transferenciasDaDivisao(r) {
  return { n: r.chegaram.length + r.sairam.length, rotulo: 'Transferências',
    detalhe: `${r.chegaram.length} ${r.chegaram.length === 1 ? 'chegou' : 'chegaram'} · ${r.sairam.length} ${r.sairam.length === 1 ? 'saiu' : 'saíram'}` };
}

function linhaMovimento(m) {
  const t = TIPOS_MOVIMENTO[m.tipo];
  return `
    <div class="member-row mov-linha mov-${m.tipo}">
      <div class="member-head" style="cursor:default;">
        <div class="member-info">
          <span class="mov-emoji" aria-hidden="true">${t.emoji}</span>
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        </div>
        <span class="mov-data">${m.data ? escapeHtml(formatDataBR(m.data)) : '—'}</span>
      </div>
      <div class="mov-tipo">${escapeHtml(rotuloMovimento(m))}${m.motivo ? ` · <span class="mov-motivo">${escapeHtml(m.motivo)}</span>` : ''}</div>
    </div>
  `;
}

function relatorioDivisao(movimentos, chave) {
  const r = resumoMovimentos(movimentos, state.roster, chave, state.movimentosPeriodo);
  const voltar = state.adminEscopo === 'regional'
    ? '<div class="btn ghost" style="margin-bottom:10px;" data-action="voltar-quadro-movimentos">‹ Todas as divisões</div>'
    : '';
  return `
    ${voltar}
    <div class="card">
      <div class="painel-titulo">🔄 ${escapeHtml(escopoPorChave(chave).nome)}</div>
      ${pilulas()}
      ${placar(r.entradas.length, r.afastadosAgora.length, r.desligamentos.length, transferenciasDaDivisao(r))}
      ${pizzaMovimentos(r.entradas.length, r.afastadosAgora.length, r.desligamentos.length, transferenciasDaDivisao(r))}
      <div class="info-line" style="padding:10px 0 0; color:var(--text-muted); font-size:12px;">Entraram, desligados e transferências: no período. Afastados: quem está afastado hoje.</div>
      <div class="row-gap no-print" style="margin-top:12px;">
        <button class="btn secondary" style="flex:1;" data-action="copiar-texto-movimentos" data-value="${chave}">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-movimentos" data-value="${chave}">🖼️ Imagem pro grupo</button>
      </div>
      <div class="info-line" style="padding:6px 0 0; color:var(--text-muted); font-size:11.5px;">O motivo não vai no texto nem na imagem.</div>
    </div>
    ${r.afastadosAgora.length ? `
      <div class="card" style="padding: 4px 16px;">
        <div class="division-subheader"><span>⏸️ AFASTADOS AGORA</span><span class="division-counts">${r.afastadosAgora.length}</span></div>
        ${r.afastadosAgora.map(m => `
          <div class="member-row">
            <div class="member-head" style="cursor:default;">
              <div class="member-info">
                ${selinhoIniciais(m)}
                <span class="member-name">${escapeHtml(m.nome)}</span>
                ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
              </div>
              <span class="mov-data">${m.situacaoDesde ? 'desde ' + escapeHtml(formatDataBR(m.situacaoDesde)) : ''}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>LINHA DO TEMPO</span><span class="division-counts">${r.linhaDoTempo.length}</span></div>
      ${r.linhaDoTempo.length
        ? r.linhaDoTempo.map(linhaMovimento).join('')
        : `<div class="empty">Nenhuma movimentação ${state.movimentosPeriodo ? 'nesse período' : 'registrada ainda'}.<br>Afastamento, transferência e desligamento se registram no cadastro de Membros.</div>`}
    </div>
  `;
}

function quadro(movimentos) {
  const q = quadroRegional(movimentos, state.roster, state.movimentosPeriodo);
  const paraFora = { n: q.total.sairamDaRJ4, rotulo: 'Para outra regional', detalhe: '' };
  return `
    <div class="card">
      <div class="painel-titulo">🔄 Entrada e saída — RJ4</div>
      ${pilulas()}
      ${placar(q.total.entradas, q.total.afastados, q.total.desligamentos, paraFora)}
      ${pizzaMovimentos(q.total.entradas, q.total.afastados, q.total.desligamentos, paraFora)}
      <div class="info-line" style="padding:10px 0 0; color:var(--text-muted); font-size:12px;">A soma de todas as divisões. Transferência entre divisões da RJ4 não muda o total; só conta quem foi pra outra regional. Toque numa divisão abaixo pra ver só a dela.</div>
      <div class="row-gap no-print" style="margin-top:12px;">
        <button class="btn secondary" style="flex:1;" data-action="copiar-quadro-movimentos">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-quadro-movimentos">🖼️ Imagem pro grupo</button>
      </div>
    </div>
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>POR DIVISÃO</span><span class="division-counts">🟢 · ⏸️ · 🚪 · 🔁</span></div>
      ${q.linhas.map(l => `
        <div class="member-row mov-quadro-linha" data-action="abrir-movimentos-divisao" data-value="${l.e.chave}">
          <div class="member-head">
            <span class="member-name">${escapeHtml(l.e.nome)}</span>
            <span class="mov-quadro-numeros">
              <span class="mov-num mov-entrada${l.entradas ? '' : ' zero'}">🟢 ${l.entradas}</span>
              <span class="mov-num mov-afastamento${l.afastados ? '' : ' zero'}">⏸️ ${l.afastados}</span>
              <span class="mov-num mov-desligamento${l.desligamentos ? '' : ' zero'}">🚪 ${l.desligamentos}</span>
              <span class="mov-num mov-transferencia${l.chegaram || l.sairam ? '' : ' zero'}" title="chegaram · saíram">🔁 +${l.chegaram} −${l.sairam}</span>
              <span class="arrow">›</span>
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderAdminMovimentos() {
  if (state.movimentosErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar o Entrada/Saída</div>
        <div class="alert-msg">${escapeHtml(state.movimentosErro)}.</div>
        <button class="btn secondary block" data-action="retry-movimentos" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  const d = dados();
  if (!d) return `<div class="card">${esqueletoLista(5)}</div>`;
  const chave = chaveAberta();
  return chave ? relatorioDivisao(d, chave) : quadro(d);
}

export const acoes = {
  'retry-movimentos': async (id, target, action, e) => {
    return carregarMovimentos();
  },
  'movimentos-periodo': async (id, target, action, e) => {
    state.movimentosPeriodo = Number(target.dataset.value);
    return render();
  },
  // "Por periodo": De em branco = desde o comeco; Ate em branco = ate hoje.
  // Os dois em branco e o mesmo que "Tudo".
  'movimentos-aplicar-periodo': async (id, target, action, e) => {
    const de = dataDoCampoOuAvisar('mov-periodo-de', 'A data "De"');
    if (de === null) return;
    const ate = dataDoCampoOuAvisar('mov-periodo-ate', 'A data "Até"');
    if (ate === null) return;
    if (de && ate && de > ate) {
      alert('A data "De" não pode ser depois da data "Até".');
      return;
    }
    state.movimentosPeriodo = de || ate ? { de, ate } : 0;
    return render();
  },
  'abrir-movimentos-divisao': async (id, target, action, e) => {
    state.movimentosDivisaoAberta = target.dataset.value;
    window.scrollTo(0, 0);
    return render();
  },
  'voltar-quadro-movimentos': async (id, target, action, e) => {
    state.movimentosDivisaoAberta = null;
    return render();
  },
  'copiar-texto-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const r = resumoMovimentos(d, state.roster, target.dataset.value, state.movimentosPeriodo);
    return copiarTexto(textoMovimentos(r, state.movimentosPeriodo));
  },
  'imagem-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const chave = target.dataset.value;
    const r = resumoMovimentos(d, state.roster, chave, state.movimentosPeriodo);
    return mostrarPreviaImagem(() => imagemMovimentos(r, escopoPorChave(chave).nome, rotuloPeriodoMovimentos(state.movimentosPeriodo)), `entrada-saida-${chave}.png`);
  },
  'copiar-quadro-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    return copiarTexto(textoQuadroRegional(quadroRegional(d, state.roster, state.movimentosPeriodo), state.movimentosPeriodo));
  },
  'imagem-quadro-movimentos': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const q = quadroRegional(d, state.roster, state.movimentosPeriodo);
    return mostrarPreviaImagem(() => imagemQuadroMovimentos(q, rotuloPeriodoMovimentos(state.movimentosPeriodo)), 'entrada-saida-rj4.png');
  },
};
