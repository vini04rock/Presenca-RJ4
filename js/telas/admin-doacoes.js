// Modo organizador, secao Doacoes: as abas "Por evento" (marcar quem levou
// alimento em cada evento), "Rank" (quem mais levou e quem foi e nao
// levou) e "Estoque" (o que o clube tem guardado, em
// admin-doacoes-estoque.js). As contas moram em dominio/doacoes.js.
//
// So aparece nas divisoes de temDoacoesECaixinha (ver config.js). O
// Regional tem o "Por evento" desde 04/11/2026, com a lista de cada evento
// em blocos por divisao.

import { carregarDoacoes } from '../dados/carregar.js';
import { PERIODOS, blocosPorDivisao, dataDoEvento, formatKg, membrosParaMarcar, nomeDoPeriodo, rankDoacoes, rankPorDivisao, rotuloPilula, somaKg, textoDoacoes } from '../dominio/doacoes.js';
import { proximaMedida, sugerirMedida } from '../dominio/estoque.js';
import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { soAtivos } from '../dominio/movimentos.js';
import { salvarDoacoes } from '../fluxos/doacoes-caixinha.js';
import { corTipoEvento, doacoesDesde, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, formatDataCurta, hexParaRgba, imprimirTexto, normalizarBusca } from '../nucleo/util.js';
import { botaoGerarRelatorio, linhaFuncoes, medalha, posicoesDoPodio, selinhoIniciais } from '../ui/comuns.js';
import { esqueletoLista, renderDonutChart, renderSparklineTendencia } from '../ui/graficos.js';
import { imagemDoacoes, mostrarPreviaImagem } from '../ui/imagem.js';
import { renderEstoque } from './admin-doacoes-estoque.js';

// Os dados na memoria sao de uma divisao so; dentro de outra, e como se
// nao houvesse nada (a busca ja esta a caminho).
function dados() {
  return state.doacoesDadosEscopo === state.adminEscopo ? state.doacoesDados : null;
}

function eventoAberto() {
  const d = dados();
  return d ? d.eventos.find(e => e.id === state.doacoesEventoId) : null;
}

function aviso() {
  const m = state.doacoesMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

// ---------- aba "Por evento" ----------

function cardEvento(ev) {
  const cor = corTipoEvento(ev.tipo);
  const kg = somaKg(ev.doacoes);
  const doadores = Object.keys(ev.doacoes).length;
  const levaram = ev.confirmados.filter(id => ev.doacoes[id]).length;
  const externas = (ev.externas || []).length;
  const resumo = (doadores
    ? `🥫 <b style="color:var(--white-strong);">${formatKg(kg)}</b> · ${doadores} ${doadores === 1 ? 'levou' : 'levaram'}`
    : (externas ? '' : 'Nenhuma doação marcada'))
    + (externas ? `${doadores ? ' · ' : ''}🤝 ${externas} de fora` : '');
  // Do lado da regra: dos ✅ do evento, quantos levaram. So faz sentido
  // depois que o evento acontece.
  const regra = ev.status === 'encerrado' && ev.confirmados.length
    ? ` · ${levaram} de ${ev.confirmados.length} confirmados`
    : '';
  return `
    <div class="card event-card doacao-evento" style="background-color:${ev.tipo ? hexParaRgba(cor, 0.12) : ''}; border-left:3px solid ${cor};" data-action="abrir-doacoes-evento" data-id="${ev.id}">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        ${ev.tipo ? `<div class="tipo-home-icone" style="border-color:${cor}; flex-shrink:0;">${emojiTipoEvento(ev.tipo)}</div>` : ''}
        <div style="min-width:0;">
          <div class="name">${escapeHtml(ev.nome)}</div>
          <div class="meta">${ev.data ? escapeHtml(formatDataCurta(ev.data)) + ' · ' : ''}${resumo}${regra}</div>
        </div>
      </div>
      <div class="arrow">›</div>
    </div>
  `;
}

function listaEventos(d) {
  const ordenados = d.eventos.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const ativos = ordenados.filter(e => e.status !== 'encerrado');
  const encerrados = ordenados.filter(e => e.status === 'encerrado');
  const visiveis = encerrados.slice(0, state.doacoesQtdEncerrados);
  if (!ordenados.length) {
    const desde = doacoesDesde(state.adminEscopo);
    return `<div class="empty">Nenhum evento ${desde ? 'desde ' + escapeHtml(formatDataCurta(desde)) : 'desta divisão'} ainda.<br>Os eventos aparecem aqui assim que forem criados.</div>`;
  }
  return `
    <div class="alert info" style="margin-bottom:14px;">
      <div class="alert-msg">Toque num evento pra marcar quem levou alimento. A regra do clube é 1 kg em todo evento.</div>
    </div>
    ${ativos.length ? `<div class="rotulo-secao">Ativos</div>${ativos.map(cardEvento).join('')}` : ''}
    ${encerrados.length ? `<div class="rotulo-secao">Encerrados</div>${visiveis.map(cardEvento).join('')}` : ''}
    ${encerrados.length > visiveis.length ? `
      <button class="btn ghost block" data-action="doacoes-mais-eventos" style="margin-bottom:16px;">Mostrar mais antigos (${encerrados.length - visiveis.length})</button>
    ` : ''}
  `;
}

// Um integrante na marcacao: o toque no nome marca 1 kg (a regra) ou
// desmarca; o − e o + ajustam quando alguem levou mais.
function linhaMarcar(m, ev) {
  const kg = state.doacoesMarcacoes[m.id] || 0;
  const confirmado = ev.confirmados.includes(m.id);
  return `
    <div class="member-row" data-busca="${escapeHtml(normalizarBusca(m.nome))}">
      <div class="member-head" data-action="doacao-alternar" data-id="${m.id}">
        <div class="member-info">
          ${selinhoIniciais(m)}
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
          ${confirmado ? '<span title="Confirmado no evento">✅</span>' : ''}
        </div>
        ${kg ? `
          <div class="kg-controle">
            <button class="kg-botao" data-action="doacao-menos" data-id="${m.id}" aria-label="Menos 1 kg">−</button>
            <span class="kg-valor" data-muda="kg:${m.id}" data-valor="${kg}">${formatKg(kg)}</span>
            <button class="kg-botao" data-action="doacao-mais" data-id="${m.id}" aria-label="Mais 1 kg">+</button>
          </div>
        ` : '<span class="status-badge status-nao-fez">🥫 Marcar</span>'}
      </div>
    </div>
  `;
}

// No Regional, um bloco por divisao (blocosPorDivisao), fechado ate o toque
// no nome dela, como na tela do evento (as mesmas divisoes abertas,
// state.expandedDivisoes). O titulo diz quantos daquela divisao ja levaram
// e o %, sobre todos os nomes do bloco. A busca abre sozinha a divisao de
// quem ela acha (aplicarBusca).
function listaMarcar(ev, membros) {
  if (!membros.length) return '<div class="empty">Ninguém convocado neste evento.</div>';
  if (state.adminEscopo !== 'regional') return membros.map(m => linhaMarcar(m, ev)).join('');
  return blocosPorDivisao(membros).map(b => {
    const levaram = b.membros.filter(m => state.doacoesMarcacoes[m.id]).length;
    const pct = Math.round((levaram / b.membros.length) * 100);
    const aberto = state.expandedDivisoes.has(b.divisao);
    return `
      <div class="grupo-divisao${aberto ? ' aberto' : ''}">
        <div class="division-subheader clicavel" data-action="toggle-divisao-grupo" data-value="${escapeHtml(b.divisao)}">
          <span>${aberto ? '▾' : '▸'} ${escapeHtml(b.divisao.toUpperCase())}</span>
          <span class="division-counts">🥫 ${levaram} de ${b.membros.length} &nbsp;·&nbsp; <b>${pct}%</b></span>
          <span class="barra-divisao" aria-hidden="true">
            <i class="barra-divisao-confirmado" style="flex-grow:${levaram}"></i>
            <i class="barra-divisao-aguardando" style="flex-grow:${b.membros.length - levaram}"></i>
          </span>
        </div>
        <div class="grupo-linhas">${b.membros.map(m => linhaMarcar(m, ev)).join('')}</div>
      </div>
    `;
  }).join('');
}

// A partir de quantos nomes a busca aparece - o mesmo numero da tela do evento.
const MINIMO_PRA_BUSCA = 10;

function painelMarcar(ev) {
  // Evento sem convocado: a divisao inteira, ou, no Regional, todo mundo.
  const daCasa = state.adminEscopo === 'regional' ? state.roster : membrosDoEscopo();
  const membros = membrosParaMarcar(ev, soAtivos(daCasa), state.roster);
  const kgs = Object.values(state.doacoesMarcacoes).filter(Boolean);
  const total = kgs.reduce((s, k) => s + k, 0);
  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-doacoes-evento">‹ Voltar aos eventos</div>
    <div class="card" style="border-left:3px solid ${corTipoEvento(ev.tipo)};">
      <div class="nome-evento-card">${ev.tipo ? emojiTipoEvento(ev.tipo) + ' ' : ''}${escapeHtml(ev.nome)}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-top:5px;">${escapeHtml(dataDoEvento(ev))}${ev.status === 'encerrado' ? ' · encerrado' : ' · ativo'}</div>
      <div class="doacao-total"><b>${formatKg(total)}</b> · ${kgs.length} ${kgs.length === 1 ? 'integrante levou' : 'integrantes levaram'}</div>
    </div>
    ${state.doacoesMsg && !state.doacoesMsg.ok ? aviso() : ''}
    <div class="alert info" style="margin-bottom:12px;">
      <div class="alert-msg">Toque no nome pra marcar 1 kg. Se alguém levou mais, use o +. Os ✅ confirmaram presença no evento.</div>
    </div>
    ${membros.length >= MINIMO_PRA_BUSCA ? `
      <input id="busca-membro" class="busca-membro" type="search" placeholder="🔎 Ache o nome…"
        value="${escapeHtml(state.buscaMembro || '')}" autocomplete="off" autocorrect="off" spellcheck="false">
    ` : ''}
    <div class="card lista-membros" style="padding: 4px 16px;">
      ${listaMarcar(ev, membros)}
      <div class="empty busca-vazia" hidden>Ninguém com esse nome por aqui.</div>
    </div>
    ${cardExternas()}
    <div class="row-gap" style="margin-bottom:16px;">
      <button class="btn block" data-action="salvar-doacoes" ${state.doacoesSalvando ? 'disabled' : ''}>${state.doacoesSalvando ? 'Salvando…' : '✅ Salvar doações'}</button>
      <button class="btn secondary block" data-action="fechar-doacoes-evento" ${state.doacoesSalvando ? 'disabled' : ''}>Cancelar</button>
    </div>
  `;
}

// ---------- as doacoes de fora (31/10/2026) ----------
// O que veio de gente de fora do clube ou de outro motoclube no evento:
// uma linha por coisa, texto livre e quantidade. Escrever na ultima linha
// abre outra embaixo. A medida (un, par, kg) e a do item do estoque com o
// mesmo nome; se o item e novo, vem sugerida pelo nome (sugerirMedida) e um
// toque troca. Salva junto com os kg e vai sozinha pro estoque (Code.gs,
// registrarExternasDoEvento). Nao entra no rank: nao e de integrante.

// O item do estoque com esse nome (o mesmo criterio do Code.gs), se houver.
function itemDoEstoque(descricao) {
  const d = dados();
  const chave = normalizarBusca(descricao).trim().replace(/\s+/g, ' ');
  if (!d || !d.estoque || !chave) return null;
  return d.estoque.itens.find(i => !i.automatico && normalizarBusca(i.nome).trim().replace(/\s+/g, ' ') === chave) || null;
}

// A medida de uma linha: a do item que ja existe; senao a escolhida no
// toque, ou a sugerida pelo nome.
function medidaDaLinha(x) {
  const item = itemDoEstoque(x.descricao);
  if (item) return { medida: item.medida, fixa: true };
  return { medida: x.medida || sugerirMedida(x.descricao), fixa: false };
}

function linhaExterna(x, i) {
  const { medida, fixa } = medidaDaLinha(x);
  return `
    <div class="externa-linha" data-externa-linha="${i}">
      <input type="text" class="externa-texto" data-externa="${i}" data-campo="descricao" maxlength="60" autocomplete="off"
             placeholder="${i === 0 ? 'Ex.: Agasalho, cesta básica…' : 'Outra doação…'}" value="${escapeHtml(x.descricao)}">
      <input type="text" class="externa-qtd" data-externa="${i}" data-campo="quantidade" inputmode="decimal" maxlength="7" autocomplete="off"
             placeholder="Qtd" value="${escapeHtml(x.quantidade)}">
      <button class="externa-medida${fixa ? ' fixa' : ''}" data-action="doacao-externa-medida" data-value="${i}"
              title="${fixa ? 'Medida do item no estoque' : 'Tocar troca: un → par → kg'}">${medida}</button>
      ${x.descricao || x.quantidade ? `<button class="externa-tirar" data-action="doacao-externa-tirar" data-value="${i}" aria-label="Tirar esta doação">✕</button>` : '<span class="externa-tirar vazio"></span>'}
    </div>
  `;
}

function cardExternas() {
  // Sempre ha onde escrever: a lista nunca fica sem a linha vazia do fim.
  state.doacoesExternas = comLinhaVazia(state.doacoesExternas);
  const lista = state.doacoesExternas;
  const preenchidas = lista.filter(x => x.descricao.trim()).length;
  return `
    <div class="card externas-card">
      <div class="painel-titulo" style="margin-bottom:2px;">🤝 Doações de fora</div>
      <div style="color:var(--text-muted); font-size:12px; margin-bottom:10px;">De quem não é do clube ou de outro motoclube: agasalho, roupa, comida… Vai junto pro estoque.${preenchidas ? ` · <b>${preenchidas}</b> ${preenchidas === 1 ? 'doação' : 'doações'}` : ''}</div>
      <div class="externas-lista">${lista.map(linhaExterna).join('')}</div>
    </div>
  `;
}

// Sempre uma linha vazia no fim, pra proxima doacao.
function comLinhaVazia(lista) {
  const ultima = lista[lista.length - 1];
  return ultima && !ultima.descricao && !ultima.quantidade ? lista : lista.concat([{ descricao: '', quantidade: '', medida: '' }]);
}

// Digitacao numa linha: so lembra, sem redesenhar (o teclado fecharia).
// Escrever na ultima linha poe outra embaixo direto na tela; a medida
// acompanha o nome. Devolve true se o campo era daqui.
export function atualizarCampoDoacaoExterna(el) {
  if (!el.dataset || el.dataset.externa === undefined) return false;
  const i = Number(el.dataset.externa);
  const x = state.doacoesExternas[i];
  if (!x) return true;
  x[el.dataset.campo] = el.value;
  const linha = el.closest('.externa-linha');
  const botao = linha && linha.querySelector('.externa-medida');
  if (botao && el.dataset.campo === 'descricao') {
    const { medida, fixa } = medidaDaLinha(x);
    botao.textContent = medida;
    botao.classList.toggle('fixa', fixa);
  }
  if (i === state.doacoesExternas.length - 1 && (x.descricao || x.quantidade)) {
    state.doacoesExternas.push({ descricao: '', quantidade: '', medida: '' });
    const lista = linha && linha.parentElement;
    if (lista) lista.insertAdjacentHTML('beforeend', linhaExterna(state.doacoesExternas[i + 1], i + 1));
  }
  return true;
}

// ---------- aba "Rank" ----------

function pilulas() {
  return `
    <div class="pilulas-periodo no-print">
      ${PERIODOS.map(m => `<button class="pilula ${state.doacoesPeriodo === m ? 'active' : ''}" data-action="doacoes-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
    </div>
  `;
}

// O rank que a tela, o texto, o PDF e a imagem usam - um so, pra nunca
// discordarem. No Regional entra o cadastro inteiro (os eventos dele chamam
// todas as divisoes) e vem junto o rank por divisao.
function rankDaTela(d) {
  const regional = state.adminEscopo === 'regional';
  const r = rankDoacoes(d, regional ? state.roster : membrosDoEscopo(), state.doacoesPeriodo);
  return { r, porDivisao: regional ? rankPorDivisao(r) : null };
}

// Um integrante no rank: os kg e, embaixo, o cumprimento dele.
function linhaRank(m, lugar) {
  return `
    <div class="member-row${lugar ? ' podio podio-' + lugar : ''}">
      <div class="member-head" style="cursor:default;">
        <div class="member-info">
          ${medalha(lugar)}${selinhoIniciais(m)}
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        </div>
        <span class="status-badge ${m.kg ? 'status-confirmado' : 'status-nao-fez'}">${formatKg(m.kg)}</span>
      </div>
      ${linhaFuncoes(m.funcoes)}
      <div class="doacao-detalhe">${m.foi
        ? `Levou em ${m.levouQuandoFoi} de ${m.foi} ${m.foi === 1 ? 'evento' : 'eventos'} em que foi · <b class="${m.cumprimento === 100 ? 'cumpre' : 'falta-cumprir'}">${m.cumprimento}%</b>`
        : 'Não foi a nenhum evento encerrado no período'}</div>
    </div>
  `;
}

// Quem foi e nao levou, com quantas vezes ficou sem levar.
function linhaMelhorar(m) {
  return `
    <div class="member-row">
      <div class="member-head" style="cursor:default;">
        <div class="member-info">
          ${selinhoIniciais(m)}
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        </div>
        <span class="status-badge status-nao-fez">${m.foi - m.levouQuandoFoi} sem levar</span>
      </div>
    </div>
  `;
}

// "2 eventos encerrados sem doação marcada ficaram de fora" - pra conta nao
// parecer errada a quem lembra de um evento que nao entrou (ver rankDoacoes).
function avisoSemMarcacao(r) {
  if (!r.semMarcacao) return '';
  return `<div class="info-line" style="padding:2px 0 0; color:var(--text-muted); font-size:12px; text-align:center;">${r.semMarcacao} ${r.semMarcacao === 1 ? 'evento encerrado sem doação marcada ficou' : 'eventos encerrados sem doação marcada ficaram'} de fora da conta.</div>`;
}

function cardTotalRank(r) {
  const naoLevaram = r.presencas - r.presencasComDoacao;
  return `
    <div class="card donut-card donut-card-total" style="margin-bottom:14px;">
      <div class="painel-titulo">🥫 Doações de alimento</div>
      ${pilulas()}
      ${renderDonutChart([
        { label: 'Foram e levaram', value: r.presencasComDoacao, cor: 'var(--status-confirmado)' },
        { label: 'Foram e não levaram', value: naoLevaram, cor: 'var(--status-infracional)' },
      ], r.cumprimento === null ? '—' : r.cumprimento + '%', 'cumprimento', 150)}
      <div class="doacao-total" style="text-align:center;"><b>${formatKg(r.totalKg)}</b> arrecadados em ${r.eventosComDoacao} ${r.eventosComDoacao === 1 ? 'evento' : 'eventos'}</div>
      <div class="info-line" style="padding:2px 0 0; color:var(--text-muted); font-size:12px; text-align:center;">Cumprimento: dos que foram aos eventos encerrados, quantos levaram alimento.</div>
      ${avisoSemMarcacao(r)}
      ${renderSparklineTendencia(r.porEvento.map(x => ({ ev: x.ev, pct: x.pct })))}
      ${botaoGerarRelatorio('doacoes-rank', [
        { acao: 'copiar-texto-doacoes', rotulo: '📋 WhatsApp' },
        { acao: 'pdf-doacoes', rotulo: '📄 PDF' },
        { acao: 'imagem-doacoes', rotulo: '🖼️ Imagem' },
      ])}
    </div>
  `;
}

// O Rank do Regional: as divisoes, da que mais cumpre pra que menos. Tocar
// numa abre os integrantes dela (kg e cumprimento) e quem foi e nao levou.
function renderRankRegional(r, porDivisao) {
  const lugares = posicoesDoPodio(porDivisao.map(x => x.cumprimento));
  const linhas = porDivisao.map((x, i) => {
    const aberta = state.doacoesDivisaoAberta === x.divisao;
    const lugaresM = posicoesDoPodio(x.membros.map(m => m.kg > 0 ? m.kg : null));
    return `
      <div class="member-row${lugares[i] ? ' podio podio-' + lugares[i] : ''}">
        <div class="member-head" data-action="doacoes-abrir-divisao" data-value="${escapeHtml(x.divisao)}">
          <div class="member-info">
            ${medalha(lugares[i])}
            <span class="member-name">${escapeHtml(x.divisao)}</span>
          </div>
          <span class="status-badge ${x.cumprimento === 100 ? 'status-confirmado' : 'status-nao-fez'}">${x.cumprimento === null ? '—' : x.cumprimento + '%'}</span>
        </div>
        <div class="doacao-detalhe">${x.foi
          ? `Levaram em ${x.levouQuandoFoi} de ${x.foi} ${x.foi === 1 ? 'presença' : 'presenças'}`
          : 'Ninguém foi a evento encerrado no período'} · 🥫 ${formatKg(x.kg)} · ${aberta ? 'fechar ▲' : 'ver integrantes ▼'}</div>
      </div>
      ${aberta ? `
        <div class="doacao-divisao-aberta">
          ${x.membros.map((m, j) => linhaRank(m, lugaresM[j])).join('')}
          ${x.melhorar.length ? `
            <div class="division-subheader"><span>📌 FORAM E NÃO LEVARAM</span><span class="division-counts">${x.melhorar.length}</span></div>
            ${x.melhorar.map(linhaMelhorar).join('')}
          ` : ''}
        </div>
      ` : ''}
    `;
  }).join('');
  return cardTotalRank(r) + `
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>🏁 POR DIVISÃO</span><span class="division-counts">nos eventos do Regional</span></div>
      ${porDivisao.length ? linhas : '<div class="empty">Nenhum integrante cadastrado.</div>'}
    </div>
  `;
}

function renderRank(d) {
  const { r, porDivisao } = rankDaTela(d);
  if (porDivisao) return renderRankRegional(r, porDivisao);
  const doaram = r.membros.filter(m => m.kg > 0);
  const lugares = posicoesDoPodio(r.membros.map(m => m.kg > 0 ? m.kg : null));

  const lista = `
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>🏆 QUEM MAIS LEVOU</span><span class="division-counts">${doaram.length} de ${r.membros.length}</span></div>
      ${r.membros.length === 0 ? '<div class="empty">Nenhum integrante cadastrado nesta divisão.</div>' : r.membros.map((m, i) => linhaRank(m, lugares[i])).join('')}
    </div>
  `;

  const melhorar = r.melhorar.length ? `
    <div class="card" style="padding: 4px 16px; margin-top:14px;">
      <div class="division-subheader"><span>📌 FORAM E NÃO LEVARAM</span><span class="division-counts">${r.melhorar.length}</span></div>
      ${r.melhorar.map(linhaMelhorar).join('')}
    </div>
  ` : '';

  return cardTotalRank(r) + lista + melhorar;
}

export function renderAdminDoacoes() {
  if (state.doacoesErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar as doações</div>
        <div class="alert-msg">${escapeHtml(state.doacoesErro)}.</div>
        <button class="btn secondary block" data-action="retry-doacoes" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  const d = dados();
  if (!d) return `<div class="card">${esqueletoLista(5)}</div>`;

  if (state.adminTab === 'doacoes-rank') return renderRank(d);
  if (state.adminTab === 'doacoes-estoque') return renderEstoque();
  const ev = eventoAberto();
  if (ev) return painelMarcar(ev);
  return aviso() + listaEventos(d);
}

// Acoes das duas abas.
export const acoes = {
  'retry-doacoes': async (id, target, action, e) => {
    return carregarDoacoes();
  },
  'abrir-doacoes-evento': async (id, target, action, e) => {
    const d = dados();
    const ev = d && d.eventos.find(x => x.id === id);
    if (!ev) return;
    state.doacoesEventoId = id;
    // Comeca com o que ja estava gravado - abrir de novo e corrigir.
    state.doacoesMarcacoes = { ...ev.doacoes };
    state.doacoesExternas = comLinhaVazia((ev.externas || []).map(x => ({ descricao: x.descricao, quantidade: String(x.quantidade).replace('.', ','), medida: x.medida })));
    state.doacoesMsg = null;
    state.buscaMembro = '';
    state.expandedDivisoes = new Set();
    window.scrollTo(0, 0);
    return render();
  },
  'fechar-doacoes-evento': async (id, target, action, e) => {
    state.doacoesEventoId = null;
    state.doacoesMarcacoes = {};
    state.doacoesExternas = [];
    state.doacoesMsg = null;
    return render();
  },
  // O toque no nome: sem nada, marca a regra (1 kg); com qualquer coisa,
  // desmarca. O − e o + ficam dentro da mesma linha e tem acao propria.
  'doacao-alternar': async (id, target, action, e) => {
    state.doacoesMarcacoes[id] = state.doacoesMarcacoes[id] ? 0 : 1;
    return render();
  },
  'doacao-mais': async (id, target, action, e) => {
    state.doacoesMarcacoes[id] = Math.min(100, (state.doacoesMarcacoes[id] || 0) + 1);
    return render();
  },
  // Abaixo de 1 kg desmarca - o − nunca deixa um "0 kg" marcado na tela.
  'doacao-menos': async (id, target, action, e) => {
    const atual = state.doacoesMarcacoes[id] || 0;
    state.doacoesMarcacoes[id] = atual > 1 ? atual - 1 : 0;
    return render();
  },
  'salvar-doacoes': async (id, target, action, e) => {
    return salvarDoacoes(state.doacoesExternas.map(x => ({ ...x, medida: medidaDaLinha(x).medida })));
  },
  // A medida de uma doacao de fora: un -> par -> kg. A de um item que ja
  // existe no estoque nao muda (e a dele).
  'doacao-externa-medida': async (id, target, action, e) => {
    const x = state.doacoesExternas[Number(target.dataset.value)];
    if (!x || medidaDaLinha(x).fixa) return;
    x.medida = proximaMedida(medidaDaLinha(x).medida);
    return render();
  },
  'doacao-externa-tirar': async (id, target, action, e) => {
    state.doacoesExternas.splice(Number(target.dataset.value), 1);
    state.doacoesExternas = comLinhaVazia(state.doacoesExternas);
    return render();
  },
  'doacoes-mais-eventos': async (id, target, action, e) => {
    state.doacoesQtdEncerrados += 10;
    return render();
  },
  'doacoes-periodo': async (id, target, action, e) => {
    state.doacoesPeriodo = Number(target.dataset.value);
    return render();
  },
  'copiar-texto-doacoes': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const { r, porDivisao } = rankDaTela(d);
    return copiarTexto(textoDoacoes(r, state.adminEscopo, state.doacoesPeriodo, porDivisao));
  },
  // O PDF leva o mesmo texto do WhatsApp, numa folha limpa (imprimirTexto).
  'pdf-doacoes': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const { r, porDivisao } = rankDaTela(d);
    return imprimirTexto(textoDoacoes(r, state.adminEscopo, state.doacoesPeriodo, porDivisao));
  },
  'imagem-doacoes': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const { r, porDivisao } = rankDaTela(d);
    return mostrarPreviaImagem(() => imagemDoacoes(r, escopoPorChave(state.adminEscopo).nome, nomeDoPeriodo(state.doacoesPeriodo), porDivisao), 'doacoes.png');
  },
  // No Rank do Regional: abre (ou fecha) os integrantes de uma divisao.
  'doacoes-abrir-divisao': async (id, target, action, e) => {
    const divisao = target.dataset.value;
    state.doacoesDivisaoAberta = state.doacoesDivisaoAberta === divisao ? null : divisao;
    return render();
  },
};
