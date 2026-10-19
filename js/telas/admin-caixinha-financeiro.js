// Modo organizador, secao Caixinha, aba "Controle financeiro": o caixa da
// divisao. O saldo de hoje, o que entrou e o que saiu, com o que se gastou,
// o extrato, os lancamentos (entrada, saida, saldo inicial) e o relatorio
// de controle - em texto pro WhatsApp, imagem pro grupo e PDF.
//
// As contas moram em dominio/caixinha-financeiro.js; as mensalidades vem
// do "Mes a mes" (admin-caixinha.js), nunca lancadas de novo aqui. Os dados
// sao os mesmos da secao inteira (state.caixinhaDados), buscados ao entrar
// nela.

import { formatReais, mesesParaEscolher, nomeCurtoDoMes, nomeDoMes, vocabularioCaixinha } from '../dominio/caixinha.js';
import { controleCaixinha, mesesDoPeriodoFinanceiro, periodoDeUmMes, quandoDoSaldoInicial, rotuloDoPeriodoFinanceiro, textoControleCaixinha } from '../dominio/caixinha-financeiro.js';
import { PERIODOS, rotuloPilula } from '../dominio/doacoes.js';
import { conferirSaldoInicial, definirSaldoInicial, fecharFormFinanceiro, removerLancamentoFinanceiro, salvarLancamentoFinanceiro } from '../fluxos/doacoes-caixinha.js';
import { CATEGORIA_ENTRADA_CAIXINHA, categoriasSaidaCaixinha, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, formatDataBR } from '../nucleo/util.js';
import { renderPizza } from '../ui/graficos.js';
import { imagensRelatorioCaixinha, mostrarPreviaImagem } from '../ui/imagem.js';

const COR_ENTRADA = 'var(--status-confirmado)';
const COR_SAIDA = 'var(--status-infracional)';

// Na caixinha do Regional quem contribui sao as divisoes: os textos mudam junto.
const vocab = () => vocabularioCaixinha(state.adminEscopo);

function dadosCaixinha() {
  return state.caixinhaDadosEscopo === state.adminEscopo ? state.caixinhaDados : null;
}

function aviso() {
  const m = state.caixinhaFinMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

const reais = v => escapeHtml(formatReais(v));

function pizzaCaixa(r) {
  return renderPizza([
    { label: 'Entradas', value: r.entradas.total, cor: COR_ENTRADA, texto: formatReais(r.entradas.total) },
    { label: 'Saídas', value: r.saidas.total, cor: COR_SAIDA, texto: formatReais(r.saidas.total) },
  ], 130, 'Nada lançado');
}

// Uma barra de entrada e uma de saida por mes, do mais antigo pro mais novo.
function barrasPorMes(porMes) {
  const meses = porMes.slice(-6);
  if (!meses.length) return '';
  const maior = Math.max(...meses.map(m => Math.max(m.entradas, m.saidas)), 1);
  return `
    <div class="card">
      <div class="painel-titulo">📅 Mês a mês</div>
      <div class="fin-legenda"><span class="fin-swatch entrada"></span>Entradas <span class="fin-swatch saida"></span>Saídas</div>
      <div class="fin-barras" data-anima="fin-barras:${meses.map(m => m.entradas + '/' + m.saidas).join(',')}">
        ${meses.map(m => `
          <div class="fin-barra-mes" title="${escapeHtml(nomeDoMes(m.mes))}: entrou ${escapeHtml(formatReais(m.entradas))}, saiu ${escapeHtml(formatReais(m.saidas))}">
            <div class="fin-barra-par">
              <div class="fin-barra entrada" style="height:${Math.round((m.entradas / maior) * 100)}%;"></div>
              <div class="fin-barra saida" style="height:${Math.round((m.saidas / maior) * 100)}%;"></div>
            </div>
            <div class="barra-mes-nome">${escapeHtml(nomeCurtoDoMes(m.mes))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Com o que se gastou: uma linha por categoria, da maior pra menor. Com
// `comItens`, cada lancamento aparece embaixo da sua categoria (relatorio).
function saidasPorCategoria(r, comItens) {
  const cats = r.saidas.porCategoria;
  if (!cats.length) return '';
  const maior = cats[0].valor || 1;
  return `
    <div class="card fin-bloco">
      <div class="painel-titulo">🔴 Com o que gastamos</div>
      ${cats.map(c => `
        <div class="fin-cat">
          <div class="fin-cat-linha"><span>${escapeHtml(c.categoria)}</span><b>${reais(c.valor)}</b></div>
          <div class="fin-cat-trilho"><div class="fin-cat-cheia" style="width:${Math.max(3, Math.round((c.valor / maior) * 100))}%;"></div></div>
          ${comItens ? c.itens.map(x => `<div class="fin-cat-item">↳ ${escapeHtml(formatDataBR(x.data))}${x.descricao ? ' · ' + escapeHtml(x.descricao) : ''} · ${reais(x.valor)}</div>`).join('') : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function linhaExtrato(x) {
  const mensalidade = x.origem === 'mensalidade';
  const emoji = mensalidade ? '💵' : x.tipo === 'saida' ? '🔴' : '🟢';
  const titulo = mensalidade ? `${vocab().deCadaMes} ${nomeDoMes(x.mes)}` : (x.tipo === 'saida' ? x.categoria : (x.descricao || x.categoria));
  const detalhe = mensalidade
    ? `${x.pagaram} ${x.pagaram === 1 ? vocab().pagamento : vocab().pagamentos}`
    : `${formatDataBR(x.data)}${x.tipo === 'saida' && x.descricao ? ' · ' + x.descricao : ''}`;
  // Mensalidade se corrige no "Mes a mes"; lancamento abre aqui mesmo.
  const toque = mensalidade ? 'style="cursor:default;"' : `data-action="editar-lancamento-caixinha" data-id="${escapeHtml(x.id)}"`;
  return `
    <div class="member-row fin-linha fin-${x.tipo}">
      <div class="member-head" ${toque}>
        <div class="member-info">
          <span class="fin-emoji" aria-hidden="true">${emoji}</span>
          <span class="member-name">${escapeHtml(titulo)}</span>
        </div>
        <span class="fin-valor">${x.tipo === 'saida' ? '−' : '+'}${reais(x.valor)}</span>
      </div>
      <div class="fin-detalhe">${escapeHtml(detalhe)}</div>
    </div>
  `;
}

function extrato(itens, { limite, titulo } = {}) {
  const mostrar = limite ? itens.slice(0, limite) : itens;
  return `
    <div class="card fin-bloco" style="padding: 4px 16px;">
      <div class="division-subheader"><span>${escapeHtml(titulo || 'EXTRATO')}</span><span class="division-counts">${itens.length}</span></div>
      ${itens.length
        ? mostrar.map(linhaExtrato).join('')
        : `<div class="empty">Nada lançado ainda.<br>Lance as saídas e as entradas pelos botões acima; ${vocab().regional ? 'as contribuições das divisões' : 'as mensalidades'} vêm do Mês a mês.</div>`}
      ${limite && itens.length > limite ? `<button class="btn ghost block no-print" style="margin:8px 0;" data-action="mais-extrato-caixinha">Mostrar mais (${itens.length - limite})</button>` : ''}
    </div>
  `;
}

// O saldo inicial e o ponto de partida: informado uma vez, e trava. Sem
// ele, um card no topo do painel pede o valor, com uma confirmacao antes
// de travar; com ele, uma linha com o cadeado e o "Corrigir" do Regional.
function cardDefinirSaldo() {
  const confirmando = state.caixinhaFinConfirmarSaldo;
  const c = conferirSaldoInicial(state.caixinhaFinSaldoTexto);
  return `
    <div class="card fin-saldo-inicial">
      <div class="painel-titulo">💼 Quanto tem na caixinha agora?</div>
      <div class="fin-explica">É o ponto de partida do controle, informado <b>uma vez só</b>. O valor já inclui tudo deste mês: daqui pra frente o app soma ${vocab().regional ? 'as contribuições das divisões' : 'as mensalidades'} a partir do mês que vem, e as entradas e saídas lançadas a partir de hoje.</div>
      ${confirmando && !c.erro ? `
        <div class="alert" style="margin-bottom:10px;">
          <div class="alert-msg">Confere: <b>${reais(c.valor)}</b> na caixinha hoje? Depois de salvo, o valor fica <b>travado</b> — só o PIN do Regional corrige.</div>
        </div>
        <div class="row-gap">
          <button class="btn block" data-action="definir-saldo-inicial" ${state.caixinhaFinSalvando ? 'disabled' : ''}>${state.caixinhaFinSalvando ? 'Salvando…' : '🔒 Confirmar e travar'}</button>
          <button class="btn secondary block" data-action="voltar-saldo-inicial" ${state.caixinhaFinSalvando ? 'disabled' : ''}>Voltar</button>
        </div>
      ` : `
        <div class="field">
          <label>Valor em caixa hoje (R$)</label>
          <input type="text" inputmode="decimal" id="fin-saldo-valor" value="${escapeHtml(state.caixinhaFinSaldoTexto)}" placeholder="Ex.: 175,00" autocomplete="off">
        </div>
        <button class="btn block" data-action="pedir-confirmar-saldo">💾 Salvar</button>
      `}
    </div>
  `;
}

function linhaSaldoInicial(d) {
  if (!d.saldoInicial) return '<div class="fin-nota">Sem saldo inicial ainda: o caixa está contando do zero.</div>';
  return `
    <div class="fin-nota">🔒 Saldo inicial: <b>${reais(d.saldoInicial.valor)}</b> · ${escapeHtml(quandoDoSaldoInicial(d.saldoInicial))}</div>
    <div class="fin-nota no-print" style="margin-top:4px;"><button class="btn ghost" style="padding:2px 8px; font-size:11px;" data-action="corrigir-saldo-inicial">🔓 Corrigir (PIN do Regional)</button></div>
  `;
}

// ---------- o painel (a aba, sem relatorio aberto) ----------

function painel(d) {
  const r = controleCaixinha(d, 0);
  return `
    ${aviso()}
    ${d.saldoInicial ? '' : cardDefinirSaldo()}
    <div class="card">
      <div class="painel-titulo">💼 Caixa da ${escapeHtml(escopoPorChave(state.adminEscopo).nome)}</div>
      <div class="fin-saldo${r.saldoAtual < 0 ? ' negativo' : ''}" data-anima="fin-saldo:${r.saldoAtual}">
        <span>Saldo atual</span>
        <b>${reais(r.saldoAtual)}</b>
      </div>
      <div class="fin-placar">
        <div class="fin-placar-item entrada"><span>🟢 Entrou</span><b>${reais(r.entradas.total)}</b></div>
        <div class="fin-placar-item saida"><span>🔴 Saiu</span><b>${reais(r.saidas.total)}</b></div>
      </div>
      ${pizzaCaixa(r)}
      ${linhaSaldoInicial(d)}
      ${r.antesDoInicio ? `<div class="fin-nota">${r.antesDoInicio} ${r.antesDoInicio === 1 ? 'movimento de antes do saldo inicial fica' : 'movimentos de antes do saldo inicial ficam'} fora da conta.</div>` : ''}
      <div class="row-gap no-print" style="margin-top:14px;">
        <button class="btn secondary" style="flex:1;" data-action="novo-lancamento-caixinha" data-value="saida">🔴 Lançar saída</button>
        <button class="btn secondary" style="flex:1;" data-action="novo-lancamento-caixinha" data-value="entrada">🟢 Lançar entrada</button>
      </div>
      <div class="row-gap no-print" style="margin-top:8px;">
        <button class="btn" style="flex:1;" data-action="abrir-relatorio-financeiro">📊 Relatório de controle</button>
        <button class="btn secondary" style="flex:1;" data-action="abrir-relatorio-financeiro">🖼️ Relatório em imagem</button>
      </div>
    </div>
    ${barrasPorMes(r.porMes)}
    ${saidasPorCategoria(r, false)}
    ${extrato(r.extrato, { limite: state.caixinhaFinQtdExtrato })}
  `;
}

// ---------- os formularios ----------

function campoValor(valor, placeholder) {
  return `
    <div class="field">
      <label>Valor (R$)</label>
      <input type="text" inputmode="decimal" id="fin-valor" value="${escapeHtml(valor || '')}" placeholder="${placeholder}" autocomplete="off">
    </div>
  `;
}

function botoesForm(rotulo) {
  return `
    ${aviso()}
    <div class="row-gap" style="margin-top:6px;">
      <button class="btn block" data-action="salvar-lancamento-caixinha" ${state.caixinhaFinSalvando ? 'disabled' : ''}>${state.caixinhaFinSalvando ? 'Salvando…' : escapeHtml(rotulo)}</button>
      <button class="btn secondary block" data-action="fechar-form-caixinha" ${state.caixinhaFinSalvando ? 'disabled' : ''}>Cancelar</button>
    </div>
  `;
}

// A correcao do saldo inicial: so o valor, e so com o PIN do Regional - o
// dia em que ele foi definido continua o mesmo.
function formSaldoInicial(f) {
  const d = dadosCaixinha();
  const atual = d && d.saldoInicial;
  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-form-caixinha">‹ Voltar ao controle</div>
    <div class="card">
      <div class="nome-evento-card">🔓 Corrigir saldo inicial</div>
      <div class="fin-explica">O saldo inicial fica travado: só o <b>PIN do Regional</b> corrige. A correção muda só o valor${atual ? ` — continua ${escapeHtml(quandoDoSaldoInicial(atual))}` : ''}.</div>
      ${campoValor(f.valor, 'Ex.: 175,00')}
      <div class="field">
        <label>PIN do Regional</label>
        <input type="password" inputmode="numeric" id="fin-pin-regional" value="${escapeHtml(f.pinRegional || '')}" autocomplete="off">
      </div>
      ${botoesForm('🔒 Salvar correção')}
    </div>
  `;
}

function formLancamento(f) {
  const saida = f.tipo === 'saida';
  const titulo = (f.id ? '✏️ Corrigir ' : (saida ? '🔴 Lançar ' : '🟢 Lançar ')) + (saida ? 'saída' : 'entrada');
  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-form-caixinha">‹ Voltar ao controle</div>
    <div class="card fin-form fin-${f.tipo}">
      <div class="nome-evento-card">${escapeHtml(titulo)}</div>
      <div class="fin-explica">${saida
        ? 'O que saiu do caixa: com o quê, quando e quanto.'
        : `Dinheiro que entrou fora das mensalidades (doação extra, rifa…). Vai como "${escapeHtml(CATEGORIA_ENTRADA_CAIXINHA)}" — a descrição diz o que foi.`}</div>
      <div class="field">
        <label>Data (em branco = hoje)</label>
        <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="fin-data"
               value="${escapeHtml(f.data || '')}" placeholder="dd/mm/aaaa" autocomplete="off">
      </div>
      ${saida ? `
        <div class="field">
          <label>Categoria</label>
          <div class="fin-categorias">
            ${categoriasSaidaCaixinha(state.adminEscopo).map(c => `<button class="pilula ${f.categoria === c ? 'active' : ''}" data-action="fin-categoria" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="field">
        <label>Descrição ${saida ? '(opcional)' : ''}</label>
        <input type="text" id="fin-descricao" maxlength="200" value="${escapeHtml(f.descricao || '')}"
               placeholder="${saida ? 'Ex.: carne do pub de outubro' : 'Ex.: rifa da moto'}" autocomplete="off">
      </div>
      ${campoValor(f.valor, 'Ex.: 120,50')}
      ${botoesForm(f.id ? '💾 Salvar correção' : '💾 Lançar')}
      ${f.id ? (state.caixinhaFinConfirmarRemover === f.id ? `
        <div class="alert" style="margin-top:12px;">
          <div class="alert-msg">Excluir este lançamento? Ele sai do saldo e dos relatórios.</div>
          <div class="row-gap" style="margin-top:10px;">
            <button class="btn danger" data-action="remover-lancamento-caixinha" data-id="${escapeHtml(f.id)}" ${state.caixinhaFinSalvando ? 'disabled' : ''}>Excluir</button>
            <button class="btn secondary" data-action="cancelar-remover-lancamento-caixinha">Cancelar</button>
          </div>
        </div>
      ` : `<button class="btn ghost" style="margin-top:12px; font-size:12px;" data-action="pedir-remover-lancamento-caixinha" data-id="${escapeHtml(f.id)}">Excluir este lançamento</button>`) : ''}
    </div>
  `;
}

// ---------- o relatorio de controle ----------

// Os meses que da pra escolher em "De"/"Ate": os da grade da caixinha (do
// mes que vem a um ano atras) e todos os que tem algum movimento, do mais
// novo pro mais antigo.
function mesesDoSeletor(d) {
  return [...new Set([
    ...mesesParaEscolher(),
    ...(d.meses || []).map(m => m.mes),
    ...(d.lancamentos || []).map(l => (l.data || '').slice(0, 7)),
    ...(d.saldoInicial ? [d.saldoInicial.mes] : []),
  ].filter(m => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
}

function seletorMes(id, rotulo, valor, meses) {
  return `
    <label class="fin-seletor">
      <span>${rotulo}</span>
      <select id="${id}">
        ${meses.map(m => `<option value="${m}"${m === valor ? ' selected' : ''}>${escapeHtml(nomeDoMes(m))}</option>`).join('')}
      </select>
    </label>
  `;
}

function seletorPeriodo(d) {
  const p = state.caixinhaFinPeriodo;
  const { de, ate } = mesesDoPeriodoFinanceiro(p);
  const meses = mesesDoSeletor(d);
  // "Tudo" nao tem mes de comeco: o "De" mostra o mais antigo da lista.
  const deMostrado = de || meses[meses.length - 1];
  return `
    <div class="no-print">
      <div class="pilulas-periodo">
        ${PERIODOS.map(m => `<button class="pilula ${p === m ? 'active' : ''}" data-action="fin-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
      </div>
      <div class="fin-ou-mes">ou escolha de um mês a outro:</div>
      <div class="fin-seletores">
        ${seletorMes('fin-de', 'De', deMostrado, meses)}
        ${seletorMes('fin-ate', 'Até', ate, meses)}
      </div>
    </div>
  `;
}

function relatorio(d) {
  const r = controleCaixinha(d, state.caixinhaFinPeriodo);
  const rotulo = rotuloDoPeriodoFinanceiro(state.caixinhaFinPeriodo);
  return `
    <div class="btn ghost no-print" style="margin-bottom:10px;" data-action="fechar-relatorio-financeiro">‹ Voltar ao controle</div>
    <div class="card">
      <div class="print-only" style="margin-bottom:10px; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
      <div class="painel-titulo">📊 Relatório de controle</div>
      <div class="fin-subtitulo">${escapeHtml(escopoPorChave(state.adminEscopo).nome)} · ${escapeHtml(rotulo)}</div>
      ${seletorPeriodo(d)}
      ${r.periodoAntesDoInicio ? `<div class="alert info" style="margin-top:12px;"><div class="alert-msg">${escapeHtml(rotulo)} é de antes do saldo inicial (${escapeHtml(nomeDoMes(r.inicio))}): fica fora da conta.</div></div>` : ''}
      <div class="fin-conta">
        <div class="fin-conta-linha"><span>💼 Saldo no início</span><b>${reais(r.saldoAnterior)}</b></div>
        <div class="fin-conta-linha entrada"><span>+ ${escapeHtml(vocab().mensalidades)} <small>(${r.entradas.pagamentos} ${r.entradas.pagamentos === 1 ? vocab().pagamento : vocab().pagamentos})</small></span><b>${reais(r.entradas.mensalidades)}</b></div>
        <div class="fin-conta-linha entrada"><span>+ ${escapeHtml(CATEGORIA_ENTRADA_CAIXINHA)}</span><b>${reais(r.entradas.outras)}</b></div>
        <div class="fin-conta-linha saida"><span>− Saídas</span><b>${reais(r.saidas.total)}</b></div>
        <div class="fin-conta-linha total${r.saldoFinal < 0 ? ' negativo' : ''}"><span>💰 Saldo ${periodoDeUmMes(state.caixinhaFinPeriodo) ? 'no fim do mês' : 'final'}</span><b>${reais(r.saldoFinal)}</b></div>
      </div>
      ${pizzaCaixa(r)}
      <div class="row-gap no-print" style="margin-top:14px;">
        <button class="btn secondary" style="flex:1;" data-action="texto-controle-caixinha">📋 WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-controle-caixinha">🖼️ Imagem detalhada</button>
        <button class="btn secondary" style="flex:1;" data-action="pdf-controle-caixinha">🖨️ PDF</button>
      </div>
    </div>
    ${saidasPorCategoria(r, true)}
    ${r.entradas.outrasItens.length ? `
      <div class="card fin-bloco">
        <div class="painel-titulo">🟢 ${escapeHtml(CATEGORIA_ENTRADA_CAIXINHA)}</div>
        ${r.entradas.outrasItens.map(x => `<div class="fin-cat-item">↳ ${escapeHtml(formatDataBR(x.data))}${x.descricao ? ' · ' + escapeHtml(x.descricao) : ''} · ${reais(x.valor)}</div>`).join('')}
      </div>
    ` : ''}
    ${extrato(r.extrato, { titulo: 'EXTRATO DO PERÍODO' })}
  `;
}

export function renderControleFinanceiro(d) {
  const f = state.caixinhaFinForm;
  if (f) return f.tipo === 'saldoInicial' ? formSaldoInicial(f) : formLancamento(f);
  if (state.caixinhaFinRelatorio) return relatorio(d);
  return painel(d);
}

function abrirForm(form) {
  fecharFormFinanceiro();
  state.caixinhaFinForm = form;
  state.caixinhaFinMsg = null;
  window.scrollTo(0, 0);
  return render();
}

function relatorioAtual() {
  const d = dadosCaixinha();
  return d ? controleCaixinha(d, state.caixinhaFinPeriodo) : null;
}

export const acoes = {
  'novo-lancamento-caixinha': async (id, target, action, e) => {
    return abrirForm({ tipo: target.dataset.value, data: '', categoria: '', descricao: '', valor: '' });
  },
  'editar-lancamento-caixinha': async (id, target, action, e) => {
    const d = dadosCaixinha();
    const l = d && (d.lancamentos || []).find(x => x.id === id);
    if (!l) return;
    return abrirForm({ tipo: l.tipo, id: l.id, data: formatDataBR(l.data), categoria: l.categoria, descricao: l.descricao,
      valor: l.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) });
  },
  // O card de definir: primeiro confere o valor e mostra "depois trava";
  // so o segundo toque grava.
  'pedir-confirmar-saldo': async (id, target, action, e) => {
    const c = conferirSaldoInicial(state.caixinhaFinSaldoTexto);
    state.caixinhaFinMsg = c.erro ? { ok: false, texto: c.erro } : null;
    state.caixinhaFinConfirmarSaldo = !c.erro;
    return render();
  },
  'voltar-saldo-inicial': async (id, target, action, e) => {
    state.caixinhaFinConfirmarSaldo = false;
    return render();
  },
  'definir-saldo-inicial': async (id, target, action, e) => {
    return definirSaldoInicial();
  },
  'corrigir-saldo-inicial': async (id, target, action, e) => {
    const d = dadosCaixinha();
    const s = d && d.saldoInicial;
    if (!s) return;
    return abrirForm({ tipo: 'saldoInicial', valor: s.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }), pinRegional: '' });
  },
  'fechar-form-caixinha': async (id, target, action, e) => {
    fecharFormFinanceiro();
    state.caixinhaFinMsg = null;
    return render();
  },
  'fin-categoria': async (id, target, action, e) => {
    if (state.caixinhaFinForm) state.caixinhaFinForm.categoria = target.dataset.value;
    return render();
  },
  'salvar-lancamento-caixinha': async (id, target, action, e) => {
    return salvarLancamentoFinanceiro();
  },
  'pedir-remover-lancamento-caixinha': async (id, target, action, e) => {
    state.caixinhaFinConfirmarRemover = id;
    return render();
  },
  'cancelar-remover-lancamento-caixinha': async (id, target, action, e) => {
    state.caixinhaFinConfirmarRemover = null;
    return render();
  },
  'remover-lancamento-caixinha': async (id, target, action, e) => {
    return removerLancamentoFinanceiro(id);
  },
  'mais-extrato-caixinha': async (id, target, action, e) => {
    state.caixinhaFinQtdExtrato += 30;
    return render();
  },
  'abrir-relatorio-financeiro': async (id, target, action, e) => {
    state.caixinhaFinRelatorio = true;
    state.caixinhaFinMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'fechar-relatorio-financeiro': async (id, target, action, e) => {
    state.caixinhaFinRelatorio = false;
    return render();
  },
  'fin-periodo': async (id, target, action, e) => {
    state.caixinhaFinPeriodo = Number(target.dataset.value);
    return render();
  },

  'texto-controle-caixinha': async (id, target, action, e) => {
    const r = relatorioAtual();
    if (!r) return;
    return copiarTexto(textoControleCaixinha(r, state.adminEscopo));
  },
  'imagem-controle-caixinha': async (id, target, action, e) => {
    const r = relatorioAtual();
    if (!r) return;
    const nome = escopoPorChave(state.adminEscopo).nome;
    const rotulo = rotuloDoPeriodoFinanceiro(state.caixinhaFinPeriodo);
    return mostrarPreviaImagem(() => imagensRelatorioCaixinha(r, nome, rotulo, vocab()), 'caixinha-relatorio.png');
  },
  'pdf-controle-caixinha': async (id, target, action, e) => {
    window.print();
  },
};

// "De"/"Ate" do relatorio, escolhidos nos seletores (ver o ouvinte de
// digitacao no app.js). O outro lado fica como estava na tela.
export function escolherMesDoPeriodo(campo) {
  const atual = mesesDoPeriodoFinanceiro(state.caixinhaFinPeriodo);
  const d = dadosCaixinha();
  const meses = d ? mesesDoSeletor(d) : [];
  const de = atual.de || meses[meses.length - 1] || campo.value;
  state.caixinhaFinPeriodo = campo.id === 'fin-de' ? { de: campo.value, ate: atual.ate } : { de, ate: campo.value };
  return render();
}
