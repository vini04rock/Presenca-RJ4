// Modo organizador, secao Caixinha, aba "Controle financeiro": o caixa da
// divisao. O saldo de hoje, o que entrou e o que saiu, com o que se gastou,
// o extrato, os lancamentos (entrada, saida, saldo inicial) e o relatorio
// de controle - em texto pro WhatsApp, imagem pro grupo e PDF.
//
// As contas moram em dominio/caixinha-financeiro.js; as mensalidades vem
// do "Mes a mes" (admin-caixinha.js), nunca lancadas de novo aqui. Os dados
// sao os mesmos da secao inteira (state.caixinhaDados), buscados ao entrar
// nela.

import { formatReais, mesISO, mesesParaEscolher, nomeCurtoDoMes, nomeDoMes } from '../dominio/caixinha.js';
import { CATEGORIA_MENSALIDADES, controleCaixinha, rotuloDoPeriodoFinanceiro, textoControleCaixinha } from '../dominio/caixinha-financeiro.js';
import { PERIODOS, rotuloPilula } from '../dominio/doacoes.js';
import { fecharFormFinanceiro, removerLancamentoFinanceiro, salvarLancamentoFinanceiro } from '../fluxos/doacoes-caixinha.js';
import { CATEGORIAS_SAIDA_CAIXINHA, CATEGORIA_ENTRADA_CAIXINHA, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, formatDataBR } from '../nucleo/util.js';
import { renderPizza } from '../ui/graficos.js';
import { imagemControleCaixinha, mostrarPreviaImagem } from '../ui/imagem.js';

const COR_ENTRADA = 'var(--status-confirmado)';
const COR_SAIDA = 'var(--status-infracional)';

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
  const titulo = mensalidade ? x.descricao : (x.tipo === 'saida' ? x.categoria : (x.descricao || x.categoria));
  const detalhe = mensalidade
    ? `${x.pagaram} ${x.pagaram === 1 ? 'pagamento' : 'pagamentos'}`
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
        : '<div class="empty">Nada lançado ainda.<br>Lance as saídas e as entradas pelos botões acima; as mensalidades vêm do Mês a mês.</div>'}
      ${limite && itens.length > limite ? `<button class="btn ghost block no-print" style="margin:8px 0;" data-action="mais-extrato-caixinha">Mostrar mais (${itens.length - limite})</button>` : ''}
    </div>
  `;
}

function linhaSaldoInicial(d) {
  if (!d.saldoInicial) {
    return `
      <div class="alert info" style="margin:12px 0 0;">
        <div class="alert-msg">Ainda sem saldo inicial: o caixa está contando do zero. Toque em "💼 Saldo inicial" e diga quanto havia no caixa no começo de um mês.</div>
      </div>
    `;
  }
  return `<div class="fin-nota">💼 Saldo inicial: <b>${reais(d.saldoInicial.valor)}</b> no começo de ${escapeHtml(nomeDoMes(d.saldoInicial.mes))}</div>`;
}

// ---------- o painel (a aba, sem relatorio aberto) ----------

function painel(d) {
  const r = controleCaixinha(d, 0);
  return `
    ${aviso()}
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
        <button class="btn secondary" style="flex:1;" data-action="editar-saldo-inicial-caixinha">💼 Saldo inicial</button>
        <button class="btn" style="flex:1;" data-action="abrir-relatorio-financeiro">📊 Relatório de controle</button>
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

function formSaldoInicial(f) {
  // Ate o mes de hoje: saldo inicial de um mes que nao chegou nao existe.
  const meses = mesesParaEscolher().filter(m => m <= mesISO(0));
  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-form-caixinha">‹ Voltar ao controle</div>
    <div class="card">
      <div class="nome-evento-card">💼 Saldo inicial</div>
      <div class="fin-explica">Quanto havia no caixa no <b>começo</b> do mês escolhido. Tudo daquele mês em diante — mensalidades, entradas e saídas — soma em cima dele; o que for de antes fica de fora da conta. Salvar de novo substitui o anterior.</div>
      <div class="field">
        <label>No começo de</label>
        <div class="mes-grade">
          ${meses.map(m => `
            <button class="mes-chip${f.mes === m ? ' lancado' : ''}" data-action="fin-saldo-mes" data-value="${m}">
              <span class="mes-chip-nome">${escapeHtml(nomeCurtoDoMes(m))}</span>
              <span class="mes-chip-info">${f.mes === m ? '✓' : ''}</span>
            </button>
          `).join('')}
        </div>
      </div>
      ${campoValor(f.valor, 'Ex.: 175,00')}
      ${botoesForm('💾 Salvar saldo inicial')}
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
            ${CATEGORIAS_SAIDA_CAIXINHA.map(c => `<button class="pilula ${f.categoria === c ? 'active' : ''}" data-action="fin-categoria" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
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

function seletorPeriodo(d) {
  const p = state.caixinhaFinPeriodo;
  // Os meses com alguma coisa, pra escolher um so.
  const comMovimento = new Set([
    ...(d.meses || []).map(m => m.mes),
    ...(d.lancamentos || []).map(l => (l.data || '').slice(0, 7)),
  ]);
  const meses = mesesParaEscolher();
  return `
    <div class="no-print">
      <div class="pilulas-periodo">
        ${PERIODOS.map(m => `<button class="pilula ${p === m ? 'active' : ''}" data-action="fin-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
      </div>
      <div class="fin-ou-mes">ou um mês só:</div>
      <div class="mes-grade">
        ${meses.map(m => `
          <button class="mes-chip${p === m ? ' lancado' : ''}" data-action="fin-periodo-mes" data-value="${m}">
            <span class="mes-chip-nome">${escapeHtml(nomeCurtoDoMes(m))}</span>
            <span class="mes-chip-info">${comMovimento.has(m) ? '•' : ''}</span>
          </button>
        `).join('')}
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
        <div class="fin-conta-linha entrada"><span>+ ${CATEGORIA_MENSALIDADES} <small>(${r.entradas.pagamentos} ${r.entradas.pagamentos === 1 ? 'pagamento' : 'pagamentos'})</small></span><b>${reais(r.entradas.mensalidades)}</b></div>
        <div class="fin-conta-linha entrada"><span>+ ${escapeHtml(CATEGORIA_ENTRADA_CAIXINHA)}</span><b>${reais(r.entradas.outras)}</b></div>
        <div class="fin-conta-linha saida"><span>− Saídas</span><b>${reais(r.saidas.total)}</b></div>
        <div class="fin-conta-linha total${r.saldoFinal < 0 ? ' negativo' : ''}"><span>💰 Saldo ${typeof state.caixinhaFinPeriodo === 'string' ? 'no fim do mês' : 'final'}</span><b>${reais(r.saldoFinal)}</b></div>
      </div>
      ${pizzaCaixa(r)}
      <div class="row-gap no-print" style="margin-top:14px;">
        <button class="btn secondary" style="flex:1;" data-action="texto-controle-caixinha">📋 WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-controle-caixinha">🖼️ Imagem</button>
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
  'editar-saldo-inicial-caixinha': async (id, target, action, e) => {
    const d = dadosCaixinha();
    const s = d && d.saldoInicial;
    return abrirForm({ tipo: 'saldoInicial', mes: s ? s.mes : mesISO(0),
      valor: s ? s.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '' });
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
  'fin-saldo-mes': async (id, target, action, e) => {
    if (state.caixinhaFinForm) state.caixinhaFinForm.mes = target.dataset.value;
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
  'fin-periodo-mes': async (id, target, action, e) => {
    state.caixinhaFinPeriodo = target.dataset.value;
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
    return mostrarPreviaImagem(() => imagemControleCaixinha(r, nome, rotulo), 'caixinha-controle.png');
  },
  'pdf-controle-caixinha': async (id, target, action, e) => {
    window.print();
  },
};
