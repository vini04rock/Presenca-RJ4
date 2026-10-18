// Modo organizador, secao Caixinha: as abas "Mês a mês" (lancar quem pagou
// e quanto em cada mes, ou corrigir um mes ja lancado), "Rank" (quem esta em
// dia, quem deve e quantos pagaram em cada mes) e "Controle financeiro"
// (o caixa: saldo, entradas e saidas - em admin-caixinha-financeiro.js).
// As contas moram em dominio/caixinha.js.
//
// So aparece nas divisoes de temDoacoesECaixinha (ver config.js).

import { carregarCaixinha } from '../dados/carregar.js';
import { formatReais, lerValor, mesesParaEscolher, nomeCurtoDoMes, nomeDoMes, rankCaixinha, relatorioMesCaixinha, somaReais, textoCaixinha, textoRelatorioMesCaixinha, valorPago } from '../dominio/caixinha.js';
import { PERIODOS, nomeDoPeriodo, rotuloPilula } from '../dominio/doacoes.js';
import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { soAtivos } from '../dominio/movimentos.js';
import { fecharFormFinanceiro, fecharMesCaixinha, removerMesCaixinha, salvarCaixinha } from '../fluxos/doacoes-caixinha.js';
import { VALOR_CAIXINHA_PADRAO, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, ordenarPorHierarquia } from '../nucleo/util.js';
import { anelConfirmados, medalha, posicoesDoPodio, selinhoIniciais } from '../ui/comuns.js';
import { esqueletoLista, renderDonutChart } from '../ui/graficos.js';
import { imagemCaixinha, imagemMesCaixinha, mostrarPreviaImagem } from '../ui/imagem.js';
import { renderControleFinanceiro } from './admin-caixinha-financeiro.js';

function dados() {
  return state.caixinhaDadosEscopo === state.adminEscopo ? state.caixinhaDados : null;
}

function mesLancado(mes) {
  const d = dados();
  return d ? d.meses.find(m => m.mes === mes) : null;
}

function aviso() {
  const m = state.caixinhaMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

// Quem esta na lista do mes aberto, com nome e grau - do cadastro, ou do
// nome gravado no mes pra quem ja saiu do clube.
function membroDaLista(id) {
  return state.roster.find(m => m.id === id) || { id, ...(state.caixinhaInfo[id] || { nome: '(sem nome)' }) };
}

// ---------- aba "Mês a mês" ----------

// Os meses que dao pra lancar, numa grade. O mes ja lancado mostra quantos
// pagaram; tocar nele abre a correcao.
function gradeMeses() {
  return `
    <div class="card">
      <div class="painel-titulo">Lançar ou corrigir um mês</div>
      <div class="mes-grade">
        ${mesesParaEscolher().map(mes => {
          const l = mesLancado(mes);
          const pagaram = l ? l.membros.filter(m => m.pagou).length : 0;
          return `
            <button class="mes-chip${l ? ' lancado' : ''}" data-action="abrir-mes-caixinha" data-value="${mes}">
              <span class="mes-chip-nome">${escapeHtml(nomeCurtoDoMes(mes))}</span>
              <span class="mes-chip-info">${l ? `${pagaram}/${l.membros.length}` : '+'}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function cardMesLancado(l) {
  const pagaram = l.membros.filter(m => m.pagou).length;
  const faltam = l.membros.length - pagaram;
  const valor = somaReais(l.membros.map(valorPago));
  return `
    <div class="card">
      <div class="member-head" data-action="abrir-mes-caixinha" data-value="${l.mes}">
        <div style="min-width:0;">
          <div class="nome-evento-card">💰 ${escapeHtml(nomeDoMes(l.mes))}</div>
          <div class="meta-card-evento">
            <span class="selo-confirmados">${anelConfirmados(pagaram, l.membros.length)}${pagaram}/${l.membros.length}</span>
            <span>${faltam ? `${faltam} ${faltam === 1 ? 'falta pagar' : 'faltam pagar'}` : 'todos pagaram'}</span>
            <span class="valor-mes">${escapeHtml(formatReais(valor))}</span>
          </div>
        </div>
        <span style="color:var(--text-muted); font-size:20px;">›</span>
      </div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn secondary" style="flex:1;" data-action="imagem-mes-caixinha" data-value="${l.mes}">🖼️ Relatório em imagem</button>
        <button class="btn secondary" style="flex:1;" data-action="texto-mes-caixinha" data-value="${l.mes}">📋 Relatório pro WhatsApp</button>
      </div>
      <button class="btn ghost block" style="margin-top:8px;" data-action="controle-mes-caixinha" data-value="${l.mes}">📊 Controle financeiro do mês</button>
    </div>
  `;
}

function listaMeses(d) {
  return `
    ${aviso()}
    ${gradeMeses()}
    ${d.meses.length ? `<div class="rotulo-secao">Meses lançados</div>${d.meses.map(cardMesLancado).join('')}` : '<div class="empty">Nenhum mês lançado ainda.<br>Escolha um mês acima pra começar.</div>'}
  `;
}

// O valor no formato de quem digita: "35", "35,5".
function valorParaCampo(v) {
  return v ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '';
}

// O selo do lado do nome: quanto pagou, ou que nao pagou. Redesenhado sem
// redesenhar a tela enquanto se digita (ver atualizarValorCaixinha).
function seloValor(v) {
  if (v === null) return { classe: 'status-nao-fez', texto: '⚠️ Valor?' };
  if (v > 0) return { classe: 'status-confirmado', texto: '✅ ' + formatReais(v) };
  return { classe: 'status-nao-fez', texto: '⬜ Não pagou' };
}

// "12 de 18 pagaram · R$ 365,00" - o cabecalho do mes aberto.
function resumoDoMesAberto() {
  const ids = state.caixinhaMembroIds;
  const valores = ids.map(id => state.caixinhaValores[id]).filter(v => v > 0);
  return `<b>${valores.length} de ${ids.length}</b> pagaram · <b>${escapeHtml(formatReais(somaReais(valores)))}</b>`;
}

function linhaPagamento(m) {
  const v = state.caixinhaValores[m.id] === undefined ? 0 : state.caixinhaValores[m.id];
  const selo = seloValor(v);
  const texto = state.caixinhaValoresTexto[m.id] !== undefined
    ? state.caixinhaValoresTexto[m.id]
    : (v && v !== VALOR_CAIXINHA_PADRAO ? valorParaCampo(v) : '');
  return `
    <div class="member-row">
      <div class="member-head" data-action="caixinha-alternar" data-id="${m.id}">
        <div class="member-info">
          ${selinhoIniciais(m)}
          <span class="member-name">${escapeHtml(m.nome)}</span>
          ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        </div>
        <span class="status-badge ${selo.classe}" data-selo-valor="${m.id}" data-muda="caixinha:${m.id}" data-valor="${v}">${escapeHtml(selo.texto)}</span>
      </div>
      <div class="caixinha-valor-linha">
        <button class="btn-valor-padrao${v === VALOR_CAIXINHA_PADRAO ? ' ativo' : ''}" data-action="caixinha-alternar" data-id="${m.id}">💵 R$ ${VALOR_CAIXINHA_PADRAO}</button>
        <input type="text" inputmode="decimal" class="caixinha-valor" data-id="${m.id}" value="${escapeHtml(texto)}"
               placeholder="Outro valor" aria-label="Outro valor pago por ${escapeHtml(m.nome)}" autocomplete="off">
        <button class="btn ghost" data-action="caixinha-tirar" data-id="${m.id}" style="padding:4px 10px; font-size:11px;">Tirar deste mês</button>
      </div>
    </div>
  `;
}

function painelMes() {
  const mes = state.caixinhaMes;
  const jaLancado = !!mesLancado(mes);
  const lista = ordenarPorHierarquia(state.caixinhaMembroIds.map(membroDaLista));
  // Quem e da divisao e nao esta na lista deste mes (entrou depois, ou foi
  // tirado) - da pra pôr de volta.
  const fora = ordenarPorHierarquia(membrosDoEscopo().filter(m => !state.caixinhaMembroIds.includes(m.id)));

  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-mes-caixinha">‹ Voltar aos meses</div>
    <div class="card">
      <div class="nome-evento-card">💰 ${escapeHtml(nomeDoMes(mes))}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-top:5px;">${jaLancado ? 'Mês já lançado — salvar corrige.' : 'Mês novo — a lista começa com a divisão inteira, menos os afastados.'}</div>
      <div class="doacao-total" id="caixinha-total">${resumoDoMesAberto()}</div>
    </div>
    ${state.caixinhaMsg && !state.caixinhaMsg.ok ? aviso() : ''}
    <div class="alert info" style="margin-bottom:12px;">
      <div class="alert-msg">Toque no nome (ou em 💵) de quem pagou os ${escapeHtml(formatReais(VALOR_CAIXINHA_PADRAO))}. Quem pagou outro valor, escreva na caixa ao lado. Quem não devia pagar este mês, use "Tirar deste mês".</div>
    </div>
    <div class="tabs no-print">
      <div class="tab ${state.caixinhaMostrarAdicionar ? '' : 'active'}" data-action="caixinha-aba-lista" data-tab="lista">Na lista (${lista.length})</div>
      <div class="tab ${state.caixinhaMostrarAdicionar ? 'active' : ''}" data-action="caixinha-aba-lista" data-tab="adicionar">Adicionar (${fora.length})</div>
    </div>
    <div class="card" style="padding: 4px 16px;">
      ${state.caixinhaMostrarAdicionar
        ? (fora.length ? fora.map(m => `
            <div class="member-row">
              <div class="member-head" style="cursor:default;">
                <div class="member-info">
                  ${selinhoIniciais(m)}
                  <span class="member-name">${escapeHtml(m.nome)}</span>
                  ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
                </div>
                <button class="btn ghost" data-action="caixinha-adicionar" data-id="${m.id}" style="padding:4px 10px; font-size:11px;">+ Adicionar</button>
              </div>
            </div>
          `).join('') : '<div class="empty">A divisão inteira já está na lista.</div>')
        : (lista.length ? lista.map(linhaPagamento).join('') : '<div class="empty">Ninguém na lista. Use "Adicionar".</div>')}
    </div>
    <div class="row-gap" style="margin-bottom:12px;">
      <button class="btn block" data-action="salvar-caixinha" ${state.caixinhaSalvando ? 'disabled' : ''}>${state.caixinhaSalvando ? 'Salvando…' : '✅ Salvar ' + escapeHtml(nomeDoMes(mes))}</button>
      <button class="btn secondary block" data-action="fechar-mes-caixinha" ${state.caixinhaSalvando ? 'disabled' : ''}>Cancelar</button>
    </div>
    ${jaLancado ? (state.caixinhaConfirmarRemover ? `
      <div class="alert" style="margin-bottom:16px;">
        <div class="alert-msg">Excluir ${escapeHtml(nomeDoMes(mes))}? Os pagamentos e os valores deste mês somem do rank e do saldo da caixinha.</div>
        <div class="row-gap" style="margin-top:10px;">
          <button class="btn danger" data-action="remover-mes-caixinha" ${state.caixinhaSalvando ? 'disabled' : ''}>Excluir o mês</button>
          <button class="btn secondary" data-action="cancelar-remover-mes-caixinha">Cancelar</button>
        </div>
      </div>
    ` : '<button class="btn ghost" data-action="pedir-remover-mes-caixinha" style="margin-bottom:16px; font-size:12px;">Excluir este mês</button>') : ''}
  `;
}

// ---------- aba "Rank" ----------

function pilulas() {
  return `
    <div class="pilulas-periodo no-print">
      ${PERIODOS.map(m => `<button class="pilula ${state.caixinhaPeriodo === m ? 'active' : ''}" data-action="caixinha-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
    </div>
  `;
}

// Uma barra por mes, do mais antigo pro mais novo: quantos pagaram.
function barrasMeses(meses) {
  if (!meses.length) return '';
  return `
    <div class="barras-meses" data-anima="barras-caixinha:${meses.map(m => m.pct).join(',')}">
      ${meses.slice().reverse().map(m => `
        <div class="barra-mes" title="${escapeHtml(nomeDoMes(m.mes))}: ${m.pagaram} de ${m.total}">
          <div class="barra-mes-pct">${m.pct === null ? '—' : m.pct + '%'}</div>
          <div class="barra-mes-trilho"><div class="barra-mes-cheia" style="height:${m.pct || 0}%;"></div></div>
          <div class="barra-mes-nome">${escapeHtml(nomeCurtoDoMes(m.mes))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRank(d) {
  const r = rankCaixinha(d, membrosDoEscopo(), state.caixinhaPeriodo);
  const comMeses = r.membros.filter(m => m.devia > 0);
  // Pódio so pra quem pagou alguma coisa: 0% nao e lugar de medalha, mesmo
  // sendo o segundo valor da lista.
  const lugares = posicoesDoPodio(r.membros.map(m => m.devia && m.pct > 0 ? m.pct : null));

  const cardTotal = `
    <div class="card donut-card donut-card-total" style="margin-bottom:14px;">
      <div class="painel-titulo">💰 Caixinha</div>
      ${pilulas()}
      ${renderDonutChart([
        { label: 'Pagos', value: r.pagamentos, cor: 'var(--status-confirmado)' },
        { label: 'Em aberto', value: r.cobrancas - r.pagamentos, cor: 'var(--status-infracional)' },
      ], r.pct === null ? '—' : r.pct + '%', 'em dia', 150)}
      <div class="doacao-total" style="text-align:center;"><b>${r.emDia.length}</b> ${r.emDia.length === 1 ? 'integrante' : 'integrantes'} com tudo em dia · <b>${r.devendo.length}</b> ${r.devendo.length === 1 ? 'pendente' : 'pendentes'}</div>
      <div class="doacao-total" style="text-align:center; margin-top:4px;"><b>${escapeHtml(formatReais(r.arrecadado))}</b> arrecadados no período</div>
      ${barrasMeses(r.meses)}
      <div class="row-gap no-print" style="margin-top:12px;">
        <button class="btn secondary" style="flex:1;" data-action="copiar-texto-caixinha">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-caixinha">🖼️ Imagem pro grupo</button>
      </div>
    </div>
  `;

  if (!r.meses.length) {
    return cardTotal + `<div class="empty">Nenhum mês lançado ${state.caixinhaPeriodo ? 'nesse período' : 'ainda'}.</div>`;
  }

  const lista = `
    <div class="card" style="padding: 4px 16px;">
      <div class="division-subheader"><span>🏆 EM DIA</span><span class="division-counts">${r.emDia.length} de ${comMeses.length}</span></div>
      ${r.membros.map((m, i) => `
        <div class="member-row${lugares[i] ? ' podio podio-' + lugares[i] : ''}">
          <div class="member-head" style="cursor:default;">
            <div class="member-info">
              ${medalha(lugares[i])}${selinhoIniciais(m)}
              <span class="member-name">${escapeHtml(m.nome)}</span>
              ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
            </div>
            <span class="status-badge ${m.devia && !m.devendo.length ? 'status-confirmado' : 'status-nao-fez'}">${m.pct === null ? '—' : m.pct + '%'}</span>
          </div>
          <div class="doacao-detalhe">${m.devia
            ? `Pagou ${m.pagou} de ${m.devia} ${m.devia === 1 ? 'mês' : 'meses'}${m.valor ? ` · ${escapeHtml(formatReais(m.valor))}` : ''}${m.devendo.length ? ` · <b class="falta-cumprir">deve ${escapeHtml(m.devendo.map(nomeCurtoDoMes).join(', '))}</b>` : ''}`
            : 'Não estava na lista de nenhum mês do período'}</div>
        </div>
      `).join('')}
    </div>
  `;
  return cardTotal + lista;
}

export function renderAdminCaixinha() {
  if (state.caixinhaErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar a caixinha</div>
        <div class="alert-msg">${escapeHtml(state.caixinhaErro)}.</div>
        <button class="btn secondary block" data-action="retry-caixinha" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  const d = dados();
  if (!d) return `<div class="card">${esqueletoLista(5)}</div>`;
  if (state.adminTab === 'caixinha-rank') return renderRank(d);
  if (state.adminTab === 'caixinha-financeiro') return renderControleFinanceiro(d);
  if (state.caixinhaMes) return painelMes();
  return listaMeses(d);
}

// Enquanto se digita um valor: guarda no state e acerta o selo da linha e
// o total do mes, sem redesenhar - redesenhar fecharia o teclado do celular.
export function atualizarValorCaixinha(campo, raiz) {
  const id = campo.dataset.id;
  if (!id || !state.caixinhaMes) return;
  const v = lerValor(campo.value);
  state.caixinhaValores[id] = v;
  state.caixinhaValoresTexto[id] = campo.value;
  const selo = raiz.querySelector(`[data-selo-valor="${id}"]`);
  if (selo) {
    const s = seloValor(v);
    selo.className = 'status-badge ' + s.classe;
    selo.textContent = s.texto;
  }
  const padrao = campo.parentNode && campo.parentNode.querySelector('.btn-valor-padrao');
  if (padrao) padrao.classList.toggle('ativo', v === VALOR_CAIXINHA_PADRAO);
  const total = raiz.querySelector('#caixinha-total');
  if (total) total.innerHTML = resumoDoMesAberto();
}

// Acoes das tres abas (as do controle financeiro moram no arquivo dele).
export const acoes = {
  'retry-caixinha': async (id, target, action, e) => {
    return carregarCaixinha();
  },
  // Abre um mes: o ja lancado vem com a lista e as marcacoes gravadas; o
  // novo comeca com a divisao inteira e ninguem marcado.
  'abrir-mes-caixinha': async (id, target, action, e) => {
    const mes = target.dataset.value;
    const l = mesLancado(mes);
    fecharMesCaixinha();
    state.caixinhaMes = mes;
    if (l) {
      state.caixinhaMembroIds = l.membros.map(m => m.id);
      l.membros.forEach(m => {
        state.caixinhaValores[m.id] = valorPago(m);
        state.caixinhaInfo[m.id] = { nome: m.nome };
      });
    } else {
      // Afastado nao entra num mes novo; se pagar mesmo assim, o
      // "Adicionar" poe ele na lista.
      state.caixinhaMembroIds = soAtivos(membrosDoEscopo()).map(m => m.id);
    }
    state.caixinhaMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'fechar-mes-caixinha': async (id, target, action, e) => {
    fecharMesCaixinha();
    state.caixinhaMsg = null;
    return render();
  },
  // O toque no nome ou no 💵: marca o valor padrao, ou desmarca quem ja
  // estava com ele. Quem pagou outro valor e tocado volta pro padrao - o
  // valor diferente se escreve na caixa.
  'caixinha-alternar': async (id, target, action, e) => {
    state.caixinhaValores[id] = state.caixinhaValores[id] === VALOR_CAIXINHA_PADRAO ? 0 : VALOR_CAIXINHA_PADRAO;
    delete state.caixinhaValoresTexto[id];
    return render();
  },
  'caixinha-tirar': async (id, target, action, e) => {
    state.caixinhaMembroIds = state.caixinhaMembroIds.filter(x => x !== id);
    delete state.caixinhaValores[id];
    delete state.caixinhaValoresTexto[id];
    return render();
  },
  'caixinha-adicionar': async (id, target, action, e) => {
    if (!state.caixinhaMembroIds.includes(id)) state.caixinhaMembroIds.push(id);
    return render();
  },
  'caixinha-aba-lista': async (id, target, action, e) => {
    state.caixinhaMostrarAdicionar = target.dataset.tab === 'adicionar';
    return render();
  },
  'salvar-caixinha': async (id, target, action, e) => {
    return salvarCaixinha();
  },
  'pedir-remover-mes-caixinha': async (id, target, action, e) => {
    state.caixinhaConfirmarRemover = true;
    return render();
  },
  'cancelar-remover-mes-caixinha': async (id, target, action, e) => {
    state.caixinhaConfirmarRemover = false;
    return render();
  },
  'remover-mes-caixinha': async (id, target, action, e) => {
    return removerMesCaixinha();
  },
  // O relatorio de um mes: quem pagou e quem nao pagou, com os nomes.
  'imagem-mes-caixinha': async (id, target, action, e) => {
    const l = mesLancado(target.dataset.value);
    if (!l) return;
    const r = relatorioMesCaixinha(l, state.roster);
    return mostrarPreviaImagem(() => imagemMesCaixinha(r, escopoPorChave(state.adminEscopo).nome), `caixinha-${l.mes}.png`);
  },
  'texto-mes-caixinha': async (id, target, action, e) => {
    const l = mesLancado(target.dataset.value);
    if (!l) return;
    return copiarTexto(textoRelatorioMesCaixinha(l, state.roster, state.adminEscopo));
  },
  // Do card do mes direto pro relatorio de controle daquele mes. A mesma
  // secao, entao nada e buscado de novo.
  'controle-mes-caixinha': async (id, target, action, e) => {
    fecharMesCaixinha();
    fecharFormFinanceiro();
    state.caixinhaMsg = null;
    state.caixinhaFinMsg = null;
    state.adminTab = 'caixinha-financeiro';
    state.caixinhaFinRelatorio = true;
    state.caixinhaFinPeriodo = target.dataset.value;
    window.scrollTo(0, 0);
    return render();
  },
  'caixinha-periodo': async (id, target, action, e) => {
    state.caixinhaPeriodo = Number(target.dataset.value);
    return render();
  },
  'copiar-texto-caixinha': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const r = rankCaixinha(d, membrosDoEscopo(), state.caixinhaPeriodo);
    return copiarTexto(textoCaixinha(r, state.adminEscopo, state.caixinhaPeriodo));
  },
  'imagem-caixinha': async (id, target, action, e) => {
    const d = dados();
    if (!d) return;
    const r = rankCaixinha(d, membrosDoEscopo(), state.caixinhaPeriodo);
    return mostrarPreviaImagem(() => imagemCaixinha(r, escopoPorChave(state.adminEscopo).nome, nomeDoPeriodo(state.caixinhaPeriodo)), 'caixinha.png');
  },
};
