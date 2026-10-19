// Modo organizador, secao Doacoes, aba "Estoque": o livro de entradas e
// saidas do que o clube tem guardado (alimentos, roupas, cobertores...),
// no molde do Controle financeiro da Caixinha. O saldo nunca e digitado:
// entra pelo "Lançar entrada" ou sozinho, pelas doacoes salvas em "Por
// evento"; sai so pelo "Lançar saída", com o destino. Corrigir e anular -
// a linha fica no extrato, riscada.
//
// Os itens tem medidas diferentes (un, par, kg), entao o painel mostra um
// item por vez (os botoes no topo); o relatorio traz a tabela de todos. As
// contas moram em dominio/estoque.js; os dados vem na mesma leitura das
// Doacoes (state.doacoesDados.estoque).

import { mesesParaEscolher, nomeCurtoDoMes, nomeDoMes } from '../dominio/caixinha.js';
import { mesesDoPeriodoFinanceiro, rotuloDoPeriodoFinanceiro } from '../dominio/caixinha-financeiro.js';
import { PERIODOS, rotuloPilula } from '../dominio/doacoes.js';
import { DESTINOS_SAIDA, MEDIDAS, destinoPorChave, podeAnular, relatorioEstoque, resumoDaLinha,
  sugerirMedida, textoQuantidade, textoRelatorioEstoque, tituloDoMovimento } from '../dominio/estoque.js';
import { anularNoEstoque, lancarNoEstoque } from '../fluxos/doacoes-caixinha.js';
import { escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, formatDataBR, hojeISO } from '../nucleo/util.js';
import { renderPizza } from '../ui/graficos.js';
import { imagensEstoqueDoacoes, imagensRelatorioEstoque, mostrarPreviaImagem } from '../ui/imagem.js';

const COR_ENTRADA = 'var(--status-confirmado)';
const COR_SAIDA = 'var(--status-infracional)';
const CORES_DESTINO = { acao_social: '#4CAF6E', familia: '#E0B24D', instituicao: '#4C86D9', outro: '#8FA3B8' };

function estoque() {
  const e = state.doacoesDados && state.doacoesDados.estoque;
  return e && Array.isArray(e.itens) ? e : { itens: [], movimentos: [] };
}

// O item do painel: o escolhido, ou o primeiro (os alimentos, nas divisoes).
function itemEscolhido(d) {
  return d.itens.find(x => x.id === state.estoqueItemId) || d.itens[0] || null;
}

const qtd = (q, medida) => escapeHtml(textoQuantidade(q, medida));
const emojiItem = x => (x.automatico ? '🥫' : x.medida === 'par' ? '👟' : x.medida === 'kg' ? '⚖️' : '📦');

function aviso() {
  const m = state.estoqueMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

// Os botoes de item, no topo do painel e do relatorio.
function botoesItens(d, item) {
  if (d.itens.length < 2) return '';
  return `
    <div class="fin-categorias estoque-itens no-print" style="margin-bottom:12px;">
      ${d.itens.map(x => `<button class="pilula ${item && x.id === item.id ? 'active' : ''}" data-action="estoque-item" data-id="${escapeHtml(x.id)}">${emojiItem(x)} ${escapeHtml(x.automatico ? 'Alimentos' : x.nome)}</button>`).join('')}
    </div>
  `;
}

function pizzaEntrouSaiu(r) {
  const m = r.item.medida;
  return renderPizza([
    { label: 'Entradas', value: Math.max(0, r.entradas.total), cor: COR_ENTRADA, texto: textoQuantidade(r.entradas.total, m) },
    { label: 'Saídas', value: r.saidas.total, cor: COR_SAIDA, texto: textoQuantidade(r.saidas.total, m) },
  ], 130, 'Nada lançado');
}

// Entrou x saiu por mes (os 6 ultimos), as mesmas barras da Caixinha.
function barrasPorMes(serie, medida) {
  const meses = serie.filter(m => m.entradas || m.saidas).length ? serie.slice(-6) : [];
  if (!meses.length) return '';
  const maior = Math.max(...meses.map(m => Math.max(Math.abs(m.entradas), m.saidas)), 1);
  return `
    <div class="card">
      <div class="painel-titulo">📅 Mês a mês</div>
      <div class="fin-legenda"><span class="fin-swatch entrada"></span>Entradas <span class="fin-swatch saida"></span>Saídas</div>
      <div class="fin-barras" data-anima="estoque-barras:${meses.map(m => m.entradas + '/' + m.saidas).join(',')}">
        ${meses.map(m => `
          <div class="fin-barra-mes" title="${escapeHtml(nomeDoMes(m.mes))}: entrou ${escapeHtml(textoQuantidade(m.entradas, medida))}, saiu ${escapeHtml(textoQuantidade(m.saidas, medida))}">
            <div class="fin-barra-par">
              <div class="fin-barra entrada" style="height:${Math.round((Math.max(0, m.entradas) / maior) * 100)}%;"></div>
              <div class="fin-barra saida" style="height:${Math.round((m.saidas / maior) * 100)}%;"></div>
            </div>
            <div class="barra-mes-nome">${escapeHtml(nomeCurtoDoMes(m.mes))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// "De onde veio" (eventos x avulsas) e "Para onde foi" (por destino), em
// barras deitadas como o "Com o que gastamos" da Caixinha.
function blocoOrigemDestino(r, regional) {
  const m = r.item.medida;
  const linha = (rotulo, valor, maior, cor) => `
    <div class="fin-cat">
      <div class="fin-cat-linha"><span>${rotulo}</span><b>${qtd(valor, m)}</b></div>
      <div class="fin-cat-trilho"><div class="fin-cat-cheia" style="width:${Math.max(3, Math.round((Math.max(0, valor) / (maior || 1)) * 100))}%; background-color:${cor};"></div></div>
    </div>`;
  const origem = !regional && r.item.automatico
    ? [['🥫 Dos eventos', r.entradas.eventos], ['🟢 Entradas avulsas', r.entradas.avulsas]].filter(([, v]) => v)
    : [];
  const maiorOrigem = Math.max(0, ...origem.map(([, v]) => v));
  const destinos = r.saidas.porDestino;
  return `
    ${origem.length ? `
      <div class="card fin-bloco">
        <div class="painel-titulo">🟢 De onde veio</div>
        ${origem.map(([t, v]) => linha(escapeHtml(t), v, maiorOrigem, COR_ENTRADA)).join('')}
      </div>` : ''}
    ${destinos.length ? `
      <div class="card fin-bloco">
        <div class="painel-titulo">🔴 Para onde foi</div>
        ${destinos.map(x => linha(`${x.emoji} ${escapeHtml(x.label)}`, x.valor, destinos[0].valor, CORES_DESTINO[x.chave])).join('')}
      </div>` : ''}
  `;
}

function linhaExtrato(m) {
  const sinal = m.tipo === 'saida' ? '−' : (m.quantidade < 0 ? '−' : '+');
  const emoji = m.tipo === 'saida' ? '🔴' : m.tipo === 'correcao' ? '↩️' : '🟢';
  const anulavel = podeAnular(m);
  const confirmando = state.estoqueAnularId === m.id;
  return `
    <div class="member-row fin-linha fin-${m.tipo === 'saida' ? 'saida' : 'entrada'}${m.anulado ? ' estoque-anulado' : ''}">
      <div class="member-head" ${anulavel ? `data-action="estoque-pedir-anular" data-id="${escapeHtml(m.id)}"` : 'style="cursor:default;"'}>
        <div class="member-info">
          <span class="fin-emoji" aria-hidden="true">${emoji}</span>
          <span class="member-name">${escapeHtml(tituloDoMovimento(m))}</span>
        </div>
        <span class="fin-valor">${sinal}${qtd(Math.abs(m.quantidade), m.medida)}</span>
      </div>
      <div class="fin-detalhe">${escapeHtml(formatDataBR(m.data))} · ${escapeHtml(m.item)}${m.anulado ? ' · anulado' : m.eventoId ? ' · automático' : ''}</div>
      ${confirmando ? `
        <div class="alert" style="margin:8px 0;">
          <div class="alert-msg">Anular este lançamento? Ele fica no extrato, riscado, e sai do saldo.</div>
          <div class="row-gap" style="margin-top:10px;">
            <button class="btn danger" data-action="estoque-anular" data-id="${escapeHtml(m.id)}" ${state.estoqueSalvando ? 'disabled' : ''}>${state.estoqueSalvando ? 'Anulando…' : 'Anular'}</button>
            <button class="btn secondary" data-action="estoque-cancelar-anular">Cancelar</button>
          </div>
        </div>` : ''}
    </div>
  `;
}

function extrato(itens, { limite, titulo } = {}) {
  const mostrar = limite ? itens.slice(0, limite) : itens;
  return `
    <div class="card fin-bloco" style="padding: 4px 16px;">
      <div class="division-subheader"><span>${escapeHtml(titulo || 'EXTRATO')}</span><span class="division-counts">${itens.length}</span></div>
      ${itens.length
        ? mostrar.map(linhaExtrato).join('') + '<div class="fin-nota no-print" style="margin:6px 0 10px;">Toque numa entrada avulsa ou saída pra anular. O que veio dos eventos se corrige nas doações do evento.</div>'
        : '<div class="empty">Nada lançado ainda neste item.</div>'}
      ${limite && itens.length > limite ? `<button class="btn ghost block no-print" style="margin:8px 0;" data-action="estoque-mais-extrato">Mostrar mais (${itens.length - limite})</button>` : ''}
    </div>
  `;
}

// Todos os itens com o saldo de hoje - tocar num abre ele no painel.
function todosOsItens(d) {
  if (!d.itens.length) return '';
  return `
    <div class="card fin-bloco" style="padding: 4px 16px 14px;">
      <div class="division-subheader"><span>📦 TODOS OS ITENS</span><span class="division-counts">${d.itens.length}</span></div>
      ${d.itens.map(x => `
        <div class="member-row" data-action="estoque-item" data-id="${escapeHtml(x.id)}">
          <div class="member-head">
            <span class="member-name">${emojiItem(x)} ${escapeHtml(x.nome)}</span>
            <span class="fin-valor${x.saldo ? '' : ' estoque-zerado'}">${x.saldo ? qtd(x.saldo, x.medida) : 'acabou'}</span>
          </div>
        </div>`).join('')}
      <button class="btn secondary block no-print" style="margin-top:12px;" data-action="imagem-estoque">🖼️ Imagem do estoque pro grupo</button>
    </div>
  `;
}

// ---------- o painel ----------

function painel(d) {
  const nome = escopoPorChave(state.adminEscopo).nome;
  const regional = state.adminEscopo === 'regional';
  const item = itemEscolhido(d);
  if (!item) {
    return `
      ${aviso()}
      <div class="card">
        <div class="painel-titulo">📦 Estoque da ${escapeHtml(nome)}</div>
        <div class="fin-explica">Nada no estoque ainda. Cada doação que chegar entra pelo "Lançar entrada", e cada uma que sair, pelo "Lançar saída" — assim fica o histórico.</div>
        <button class="btn block" data-action="estoque-novo" data-value="entrada">🟢 Lançar entrada</button>
      </div>
    `;
  }
  const r = relatorioEstoque(d, item.id, 0);
  return `
    ${aviso()}
    ${botoesItens(d, item)}
    <div class="card">
      <div class="painel-titulo">📦 Estoque da ${escapeHtml(nome)}</div>
      <div class="fin-subtitulo">${emojiItem(item)} ${escapeHtml(item.nome)}</div>
      <div class="fin-saldo" data-anima="estoque-saldo:${item.id}:${item.saldo}">
        <span>Saldo atual</span>
        <b>${qtd(item.saldo, item.medida)}</b>
      </div>
      <div class="fin-placar">
        <div class="fin-placar-item entrada"><span>🟢 Entrou</span><b>${qtd(r.entradas.total, item.medida)}</b></div>
        <div class="fin-placar-item saida"><span>🔴 Saiu</span><b>${qtd(r.saidas.total, item.medida)}</b></div>
      </div>
      ${pizzaEntrouSaiu(r)}
      ${r.correcoes ? `<div class="fin-nota">↩️ Correções das doações dos eventos: ${qtd(r.correcoes, item.medida)}</div>` : ''}
      ${item.automatico ? '<div class="fin-nota">🥫 As doações salvas em "Por evento" entram aqui sozinhas.</div>' : ''}
      <div class="row-gap no-print" style="margin-top:14px;">
        <button class="btn secondary" style="flex:1;" data-action="estoque-novo" data-value="saida" ${item.saldo > 0 || d.itens.some(x => x.saldo > 0) ? '' : 'disabled'}>🔴 Lançar saída</button>
        <button class="btn secondary" style="flex:1;" data-action="estoque-novo" data-value="entrada">🟢 Lançar entrada</button>
      </div>
      <div class="row-gap no-print" style="margin-top:8px;">
        <button class="btn" style="flex:1;" data-action="estoque-abrir-relatorio">📊 Relatório</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-relatorio-estoque">🖼️ Relatório em imagem</button>
      </div>
    </div>
    ${barrasPorMes(r.serie, item.medida)}
    ${blocoOrigemDestino(r, regional)}
    ${todosOsItens(d)}
    ${extrato(r.extrato, { limite: state.estoqueQtdExtrato })}
  `;
}

// ---------- o formulario de entrada / saida ----------

function formulario(d, f) {
  const saida = f.tipo === 'saida';
  const opcoes = saida ? d.itens.filter(x => x.saldo > 0) : d.itens;
  const novo = f.itemId === 'novo';
  const item = novo ? null : d.itens.find(x => x.id === f.itemId);
  const medida = novo ? f.medida : (item ? item.medida : 'un');
  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="estoque-fechar-form">‹ Voltar ao estoque</div>
    <div class="card fin-form fin-${f.tipo}">
      <div class="nome-evento-card">${saida ? '🔴 Lançar saída' : '🟢 Lançar entrada'}</div>
      <div class="fin-explica">${saida
        ? 'O que saiu do estoque: o quê, quanto, quando e pra onde foi.'
        : 'Uma doação que chegou fora dos eventos. As doações de "Por evento" entram sozinhas, não precisa lançar.'}</div>
      ${saida && !opcoes.length ? '<div class="empty">Não há item com saldo pra sair.</div>' : `
        <div class="field">
          <label>Item</label>
          <select id="est-item">
            ${opcoes.map(x => `<option value="${escapeHtml(x.id)}"${x.id === f.itemId ? ' selected' : ''}>${escapeHtml(x.nome)}${saida ? ` — tem ${escapeHtml(textoQuantidade(x.saldo, x.medida))}` : ''}</option>`).join('')}
            ${saida ? '' : `<option value="novo"${novo ? ' selected' : ''}>+ Item novo</option>`}
          </select>
        </div>
        ${novo ? `
          <div class="field">
            <label>Nome do item novo</label>
            <input type="text" class="estoque-campo" data-campo="itemNome" maxlength="60" value="${escapeHtml(f.itemNome || '')}" placeholder="Ex.: Cobertor, Arroz, Tênis" autocomplete="off">
          </div>
          <label>Medida</label>
          <div class="row-gap" style="margin-bottom:12px;">
            ${MEDIDAS.map(m => `<button class="toggle-chip ${medida === m ? 'active' : ''}" style="flex:1;" data-action="estoque-medida" data-value="${m}">${m === 'un' ? 'unidade' : m === 'par' ? 'par' : 'kg'}</button>`).join('')}
          </div>
        ` : ''}
        <div class="field">
          <label>Quantidade (${medida === 'kg' ? 'kg, com até uma casa decimal' : medida === 'par' ? 'pares' : 'unidades'})</label>
          <input type="text" inputmode="${medida === 'kg' ? 'decimal' : 'numeric'}" class="estoque-campo" data-campo="quantidade" maxlength="8"
                 value="${escapeHtml(f.quantidade || '')}" placeholder="${medida === 'kg' ? 'Ex.: 2,5' : 'Ex.: 10'}" autocomplete="off">
        </div>
        <div class="field">
          <label>Data (em branco = hoje)</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="est-data"
                 value="${escapeHtml(f.data || '')}" placeholder="dd/mm/aaaa" autocomplete="off">
        </div>
        ${saida ? `
          <label>Pra onde foi</label>
          <div class="fin-categorias" style="margin-bottom:12px;">
            ${DESTINOS_SAIDA.map(x => `<button class="pilula ${f.destino === x.chave ? 'active' : ''}" data-action="estoque-destino" data-value="${x.chave}">${x.emoji} ${escapeHtml(x.label)}</button>`).join('')}
          </div>
        ` : ''}
        <div class="field">
          <label>${saida ? (f.destino === 'outro' ? 'Descrição' : 'Descrição (opcional)') : 'De onde veio (opcional)'}</label>
          <input type="text" class="estoque-campo" data-campo="descricao" maxlength="200" value="${escapeHtml(f.descricao || '')}"
                 placeholder="${saida ? 'Ex.: Abrigo São José' : 'Ex.: doação da família do Costa'}" autocomplete="off">
        </div>
        ${aviso()}
        <div class="row-gap" style="margin-top:6px;">
          <button class="btn block" data-action="estoque-lancar" ${state.estoqueSalvando ? 'disabled' : ''}>${state.estoqueSalvando ? 'Lançando…' : '💾 Lançar'}</button>
          <button class="btn secondary block" data-action="estoque-fechar-form" ${state.estoqueSalvando ? 'disabled' : ''}>Cancelar</button>
        </div>
      `}
    </div>
  `;
}

// ---------- o relatorio ----------

function mesesDoSeletor(d) {
  return [...new Set([...mesesParaEscolher(), ...d.movimentos.map(m => (m.data || '').slice(0, 7))]
    .filter(m => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
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
  const p = state.estoquePeriodo;
  const { de, ate } = mesesDoPeriodoFinanceiro(p);
  const meses = mesesDoSeletor(d);
  return `
    <div class="no-print">
      <div class="pilulas-periodo">
        ${PERIODOS.map(m => `<button class="pilula ${p === m ? 'active' : ''}" data-action="estoque-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
      </div>
      <div class="fin-ou-mes">ou escolha de um mês a outro:</div>
      <div class="fin-seletores">
        ${seletorMes('est-de', 'De', de || meses[meses.length - 1], meses)}
        ${seletorMes('est-ate', 'Até', ate, meses)}
      </div>
    </div>
  `;
}

function relatorio(d) {
  const item = itemEscolhido(d);
  const r = relatorioEstoque(d, item && item.id, state.estoquePeriodo);
  const rotulo = rotuloDoPeriodoFinanceiro(state.estoquePeriodo);
  const m = item ? item.medida : 'un';
  const nSaidas = r.saidasPorMes.reduce((s, x) => s + x.itens.length, 0);
  return `
    <div class="btn ghost no-print" style="margin-bottom:10px;" data-action="estoque-fechar-relatorio">‹ Voltar ao estoque</div>
    <div class="card">
      <div class="print-only" style="margin-bottom:10px; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
      <div class="painel-titulo">📊 Relatório do estoque</div>
      <div class="fin-subtitulo">${escapeHtml(escopoPorChave(state.adminEscopo).nome)} · ${escapeHtml(rotulo)}</div>
      ${seletorPeriodo(d)}
      <div class="row-gap no-print" style="margin-top:14px;">
        <button class="btn secondary" style="flex:1;" data-action="texto-relatorio-estoque">📋 WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="imagem-relatorio-estoque">🖼️ Imagem</button>
        <button class="btn secondary" style="flex:1;" data-action="pdf-relatorio-estoque">🖨️ PDF</button>
      </div>
    </div>
    <div class="card fin-bloco" style="padding: 4px 16px 10px;">
      <div class="division-subheader"><span>📦 TODOS OS ITENS</span><span class="division-counts">início → fim</span></div>
      ${r.tabela.length ? r.tabela.map(t => `
        <div class="member-row">
          <div class="member-head" style="cursor:default;">
            <span class="member-name">${escapeHtml(t.item)}</span>
            <span class="fin-valor">${qtd(t.saldoAnterior, t.medida)} → <b>${qtd(t.saldoFinal, t.medida)}</b></span>
          </div>
          <div class="fin-detalhe">${escapeHtml(resumoDaLinha(t))}</div>
        </div>`).join('') : '<div class="empty">Nenhum item ainda.</div>'}
    </div>
    ${item ? `
      ${botoesItens(d, item)}
      <div class="card">
        <div class="painel-titulo">${emojiItem(item)} ${escapeHtml(item.nome)}</div>
        <div class="fin-conta">
          <div class="fin-conta-linha"><span>📦 Saldo no início</span><b>${qtd(r.item.saldoAnterior, m)}</b></div>
          <div class="fin-conta-linha entrada"><span>+ Entrou</span><b>${qtd(r.entradas.total, m)}</b></div>
          ${r.correcoes ? `<div class="fin-conta-linha saida"><span>↩️ Correções dos eventos</span><b>${qtd(r.correcoes, m)}</b></div>` : ''}
          <div class="fin-conta-linha saida"><span>− Saiu</span><b>${qtd(r.saidas.total, m)}</b></div>
          <div class="fin-conta-linha total"><span>📦 Saldo no fim</span><b>${qtd(r.item.saldoFinal, m)}</b></div>
        </div>
        ${pizzaEntrouSaiu(r)}
      </div>
      ${barrasPorMes(r.serie, m)}
      ${blocoOrigemDestino(r, state.adminEscopo === 'regional')}
    ` : ''}
    <div class="card fin-bloco" style="padding: 4px 16px 10px;">
      <div class="division-subheader"><span>🔴 SAÍDAS DO PERÍODO</span><span class="division-counts">${nSaidas}</span></div>
      ${nSaidas ? r.saidasPorMes.map(mes => `
        <div class="fin-cat-linha" style="margin-top:8px;"><span><b>${escapeHtml(nomeDoMes(mes.mes))}</b></span></div>
        ${mes.itens.map(x => {
          const dest = destinoPorChave(x.destino);
          return `<div class="fin-cat-item">↳ ${escapeHtml(formatDataBR(x.data).slice(0, 5))} · ${escapeHtml(x.item)} ${qtd(x.quantidade, x.medida)} · ${dest.emoji} ${escapeHtml(dest.label)}${x.descricao ? ' · ' + escapeHtml(x.descricao) : ''}</div>`;
        }).join('')}`).join('') : '<div class="empty">Nenhuma saída no período.</div>'}
    </div>
    ${item ? extrato(r.extrato, { titulo: 'EXTRATO DO ITEM NO PERÍODO' }) : ''}
  `;
}

export function renderEstoque() {
  const d = estoque();
  if (state.estoqueForm) return formulario(d, state.estoqueForm);
  if (state.estoqueRelatorio) return relatorio(d);
  return painel(d);
}

// O que se digita no formulario (nome do item novo, quantidade, descricao):
// so lembra, sem redesenhar - redesenhar fecharia o teclado. No nome do
// item novo, a medida sugerida acompanha (Arroz -> kg), ate a pessoa tocar
// numa medida.
export function atualizarCampoEstoque(campo, raiz) {
  const f = state.estoqueForm;
  if (!f) return;
  f[campo.dataset.campo] = campo.value;
  if (campo.dataset.campo === 'itemNome' && !f.medidaManual) {
    f.medida = sugerirMedida(campo.value);
    raiz.querySelectorAll('[data-action="estoque-medida"]').forEach(b => b.classList.toggle('active', b.dataset.value === f.medida));
  }
}

// Os seletores (item do formulario, "De"/"Ate" do relatorio): redesenham.
export function escolherNoEstoque(campo) {
  if (campo.id === 'est-item' && state.estoqueForm) {
    state.estoqueForm.itemId = campo.value;
    state.estoqueForm.quantidade = '';
  }
  if (campo.id === 'est-de' || campo.id === 'est-ate') {
    const atual = mesesDoPeriodoFinanceiro(state.estoquePeriodo);
    const meses = mesesDoSeletor(estoque());
    const de = atual.de || meses[meses.length - 1] || campo.value;
    state.estoquePeriodo = campo.id === 'est-de' ? { de: campo.value, ate: atual.ate } : { de, ate: campo.value };
  }
  return render();
}

function relatorioAtual() {
  const d = estoque();
  const item = itemEscolhido(d);
  return relatorioEstoque(d, item && item.id, state.estoquePeriodo);
}

export const acoes = {
  'estoque-item': async (id, target, action, e) => {
    state.estoqueItemId = id;
    state.estoqueAnularId = null;
    window.scrollTo(0, 0);
    return render();
  },
  'estoque-novo': async (id, target, action, e) => {
    const d = estoque();
    const tipo = target.dataset.value;
    const atual = itemEscolhido(d);
    // Comeca no item que esta no painel (na saida, se ele tiver saldo).
    const comSaldo = d.itens.filter(x => x.saldo > 0);
    const itemId = tipo === 'saida'
      ? (atual && atual.saldo > 0 ? atual.id : (comSaldo[0] || {}).id || '')
      : (atual ? atual.id : 'novo');
    state.estoqueForm = { tipo, itemId, itemNome: '', medida: 'un', medidaManual: false, quantidade: '', data: formatDataBR(hojeISO()), destino: '', descricao: '' };
    state.estoqueMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'estoque-fechar-form': async (id, target, action, e) => {
    state.estoqueForm = null;
    state.estoqueMsg = null;
    return render();
  },
  'estoque-medida': async (id, target, action, e) => {
    if (state.estoqueForm) {
      state.estoqueForm.medida = target.dataset.value;
      state.estoqueForm.medidaManual = true;
    }
    return render();
  },
  'estoque-destino': async (id, target, action, e) => {
    if (state.estoqueForm) state.estoqueForm.destino = target.dataset.value;
    return render();
  },
  'estoque-lancar': async (id, target, action, e) => {
    return lancarNoEstoque();
  },
  'estoque-pedir-anular': async (id, target, action, e) => {
    state.estoqueAnularId = state.estoqueAnularId === id ? null : id;
    return render();
  },
  'estoque-cancelar-anular': async (id, target, action, e) => {
    state.estoqueAnularId = null;
    return render();
  },
  'estoque-anular': async (id, target, action, e) => {
    return anularNoEstoque(id);
  },
  'estoque-mais-extrato': async (id, target, action, e) => {
    state.estoqueQtdExtrato += 30;
    return render();
  },
  'estoque-abrir-relatorio': async (id, target, action, e) => {
    state.estoqueRelatorio = true;
    state.estoqueMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'estoque-fechar-relatorio': async (id, target, action, e) => {
    state.estoqueRelatorio = false;
    return render();
  },
  'estoque-periodo': async (id, target, action, e) => {
    state.estoquePeriodo = Number(target.dataset.value);
    return render();
  },
  'texto-relatorio-estoque': async (id, target, action, e) => {
    return copiarTexto(textoRelatorioEstoque(relatorioAtual(), state.adminEscopo, rotuloDoPeriodoFinanceiro(state.estoquePeriodo)));
  },
  'imagem-relatorio-estoque': async (id, target, action, e) => {
    const r = relatorioAtual();
    if (!r.item) return;
    const nome = escopoPorChave(state.adminEscopo).nome;
    return mostrarPreviaImagem(() => imagensRelatorioEstoque(r, nome, rotuloDoPeriodoFinanceiro(state.estoquePeriodo)), 'estoque-relatorio.png');
  },
  'pdf-relatorio-estoque': async (id, target, action, e) => {
    window.print();
  },
  // O saldo de hoje de cada item, pro grupo.
  'imagem-estoque': async (id, target, action, e) => {
    const d = estoque();
    if (!d.itens.length) return;
    const itens = d.itens.map(x => ({ item: x.nome, quantidade: x.saldo, medida: x.medida }));
    const resumo = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
    return mostrarPreviaImagem(() => imagensEstoqueDoacoes(itens, resumo, escopoPorChave(state.adminEscopo).nome), 'estoque-doacoes.png');
  },
};

