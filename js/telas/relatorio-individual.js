// Modo organizador, "Relatorio individual": a lista de integrantes e o
// relatorio completo de cada um - presenca na divisao por tipo de evento,
// eventos do Regional a parte, Insight e o historico evento a evento.
//
// Numa divisao, a lista e so dela. No Regional (chave-mestra), cada divisao
// vira um grupo que abre ao toque, pra nao despejar cem nomes de uma vez -
// o mesmo padrao do Rank e da lista de um evento regional.
//
// Tres saidas pro relatorio: o PDF de um integrante, o texto pro WhatsApp e
// o PDF de varios, escolhidos marcando caixas na lista. O PDF e a impressao
// do navegador (window.print), igual aos Relatorios - sem biblioteca.
//
// As contas moram em dominio/relatorio-individual.js; aqui e so desenho.

import { montarRelatorioIndividual, textoDoPeriodo, textoRelatorioIndividual } from '../dominio/relatorio-individual.js';
import { emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao, STATUS } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { LOGO_SRC } from '../nucleo/imagens.js';
import { copiarTexto, dataDoCampoOuAvisar, escapeHtml, formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';
import { campoData, linhaFuncoes, nivelDoGrau } from '../ui/comuns.js';
import { renderDonutChart, renderSparklineTendencia, segmentosDonutStatus } from '../ui/graficos.js';
import { loadRelatorioIndividual, loadRelatoriosIndividuaisVarios } from '../dados/carregar.js';
import { render } from '../nucleo/render.js';

export function renderRelatorioIndividual(app) {
  const escopo = escopoPorChave(state.adminEscopo);
  const cabecalho = (voltar, rotuloVoltar) => `
    <div class="back-link on-photo no-print" data-action="${voltar}">‹ ${rotuloVoltar}</div>
    <div class="event-header">
      <h1 style="font-size: 20px;">Relatório individual</h1>
      <div class="count-box">${escapeHtml(escopo.nome.toUpperCase())}</div>
    </div>
  `;
  if (state.relIndVarios) {
    app.innerHTML = cabecalho('fechar-relind-varios', 'Voltar à seleção') + folhaDeVarios();
    return;
  }
  if (state.relIndMembroId) {
    app.innerHTML = cabecalho('fechar-relatorio-individual-membro', 'Integrantes') + conteudoRelatorio();
    return;
  }
  app.innerHTML = cabecalho('go-menu-organizador', 'Menu') + listaIntegrantes();
  // A caixa da divisao com so parte dos integrantes marcados fica "parcial"
  // (o traco no lugar do ✓). Isso nao existe como atributo do HTML, so
  // como propriedade do elemento - por isso vai depois de desenhar.
  app.querySelectorAll('[data-parcial]').forEach(el => { el.indeterminate = true; });
}

// ---------- a lista -------------------------------------------------------

// As divisoes que aparecem na lista: so a propria, ou as 7 no Regional.
function escoposDaLista() {
  return state.adminEscopo === 'regional' ? escoposEmOrdemDeExibicao() : [escopoPorChave(state.adminEscopo)];
}

function membrosDoEscopo(e) {
  return ordenarPorHierarquia(state.roster.filter(m => m.divisao === e.nome));
}

// Os marcados, na ordem em que aparecem na lista - e a ordem do PDF.
function marcadosEmOrdem() {
  return escoposDaLista().flatMap(membrosDoEscopo).filter(m => state.relIndMarcados.has(m.id));
}

// A divisao nao aparece na linha: numa divisao e a propria tela, e no
// Regional e o grupo em que a linha esta.
//
// Na selecao, tocar na linha marca em vez de abrir o relatorio. A caixa
// nao tem acao propria: o toque nela sobe pra linha.
function linhaIntegrante(m) {
  const selecionando = state.relIndSelecionando;
  const acao = selecionando ? 'relind-marcar-membro' : 'abrir-relatorio-individual-membro';
  return `
    <div class="member-row">
      <div class="member-head" data-action="${acao}" data-id="${m.id}">
        <div style="display:flex; align-items:center; min-width:0;">
          ${selecionando ? `<input type="checkbox" class="relind-check" ${state.relIndMarcados.has(m.id) ? 'checked' : ''}>` : ''}
          <div class="member-info-wrap">
            <div class="member-info">
              <span class="member-name">${escapeHtml(m.nome)}</span>
              ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
            </div>
            ${m.cargo ? `<div class="confirmado-divisao">${escapeHtml(m.cargo)}</div>` : ''}
            ${linhaFuncoes(m.funcoes)}
          </div>
        </div>
        ${selecionando ? '' : '<span class="arrow" style="color:var(--text-muted); font-size:20px;">›</span>'}
      </div>
    </div>
  `;
}

// A caixa de uma divisao: marcada com todos, "parcial" com alguns. Tem acao
// propria, entao no Regional marcar nao abre nem fecha o grupo.
function caixaDivisao(e, membros) {
  const n = membros.filter(m => state.relIndMarcados.has(m.id)).length;
  const todos = membros.length > 0 && n === membros.length;
  return `<input type="checkbox" class="relind-check" data-action="relind-marcar-divisao" data-value="${e.chave}"
    ${todos ? 'checked' : ''} ${n && !todos ? 'data-parcial="1"' : ''} ${membros.length ? '' : 'disabled'}>`;
}

function contagemDivisao(membros) {
  if (state.relIndSelecionando) {
    const n = membros.filter(m => state.relIndMarcados.has(m.id)).length;
    return `${n}/${membros.length} ${membros.length === 1 ? 'marcado' : 'marcados'}`;
  }
  return `${membros.length} ${membros.length === 1 ? 'integrante' : 'integrantes'}`;
}

// O topo da lista: o botao que liga a selecao, ou, ligada, o periodo e o
// botao de exportar.
function topoDaLista() {
  if (!state.relIndSelecionando) {
    return `
      <div class="alert info" style="margin-bottom:12px;">
        <div class="alert-msg">Toque num integrante pra ver a presença dele em cada tipo de evento e no Insight.</div>
      </div>
      <button class="btn secondary block" data-action="relind-iniciar-selecao" style="margin-bottom:16px;">📑 Exportar vários em PDF</button>
    `;
  }
  const n = state.relIndMarcados.size;
  const carregando = state.relIndVariosCarregando;
  const rotulo = carregando ? `Montando ${n} ${n === 1 ? 'relatório' : 'relatórios'}…`
    : n ? `📑 Exportar ${n} ${n === 1 ? 'relatório' : 'relatórios'}` : 'Marque quem vai no PDF';
  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:4px;">Exportar vários em PDF</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-bottom:10px;">Marque a divisão inteira ou cada integrante. Cada um sai em página nova.</div>
      <div class="row-gap">
        ${campoData({ id: 'relind-data-inicio', rotulo: 'Data inicial', valor: state.relIndFiltroInicio, estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'relind-data-fim', rotulo: 'Data final', valor: state.relIndFiltroFim, estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <div style="color:var(--text-muted); font-size:12px; margin:6px 0 10px;">Deixe em branco pra incluir desde sempre.</div>
      ${state.relIndVariosErro ? `
        <div class="alert" style="margin-bottom:10px;">
          <div class="alert-title">Não consegui montar os relatórios</div>
          <div class="alert-msg">${escapeHtml(state.relIndVariosErro)}.</div>
        </div>
      ` : ''}
      <button class="btn block" data-action="relind-exportar-varios" style="margin-bottom:8px;" ${n && !carregando ? '' : 'disabled'}>${rotulo}</button>
      <button class="btn secondary block" data-action="relind-cancelar-selecao" ${carregando ? 'disabled' : ''}>Cancelar</button>
    </div>
  `;
}

function listaIntegrantes() {
  const selecionando = state.relIndSelecionando;

  if (state.adminEscopo !== 'regional') {
    const e = escopoPorChave(state.adminEscopo);
    const membros = membrosDoEscopo(e);
    if (!membros.length) return '<div class="empty">Nenhum integrante cadastrado nesta divisão.</div>';
    // Na divisao a lista nao tem grupo - na selecao ganha um cabecalho so
    // pra levar a caixa de "todos".
    const cabecalhoSelecao = selecionando ? `
      <div class="division-subheader">
        <span style="display:flex; align-items:center;">${caixaDivisao(e, membros)}${escapeHtml(e.nome.toUpperCase())}</span>
        <span class="division-counts">${contagemDivisao(membros)}</span>
      </div>
    ` : '';
    return topoDaLista() + `<div class="card" style="padding: 4px 16px;">${cabecalhoSelecao}${membros.map(linhaIntegrante).join('')}</div>`;
  }

  return topoDaLista() + escoposDaLista().map(e => {
    const membros = membrosDoEscopo(e);
    const aberto = state.relIndDivisoesAbertas.has(e.chave);
    return `
      <div class="card" style="padding: 4px 16px;">
        <div class="division-subheader clicavel" data-action="toggle-relind-divisao" data-value="${e.chave}">
          <span style="display:flex; align-items:center;">${selecionando ? caixaDivisao(e, membros) : ''}${aberto ? '▾' : '▸'} ${escapeHtml(e.nome.toUpperCase())}</span>
          <span class="division-counts">${contagemDivisao(membros)}</span>
        </div>
        ${aberto ? (membros.length ? membros.map(linhaIntegrante).join('') : '<div class="empty">Nenhum integrante cadastrado.</div>') : ''}
      </div>
    `;
  }).join('');
}

// ---------- o relatorio ---------------------------------------------------

function filtroPeriodo() {
  const ativo = state.relIndFiltroInicio || state.relIndFiltroFim;
  return `
    <div class="card no-print" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">Período</div>
      <div class="row-gap">
        ${campoData({ id: 'relind-data-inicio', rotulo: 'Data inicial', valor: state.relIndFiltroInicio, estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'relind-data-fim', rotulo: 'Data final', valor: state.relIndFiltroFim, estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <div style="color:var(--text-muted); font-size:12px; margin:6px 0 10px;">Deixe em branco pra ver desde sempre.</div>
      <button class="btn secondary block" data-action="aplicar-relind-periodo">Atualizar</button>
      ${ativo ? '<div class="btn ghost" data-action="limpar-relind-periodo" style="margin-top:8px; padding:2px 0; font-size:12px;">Limpar (voltar a mostrar tudo)</div>' : ''}
    </div>
  `;
}

// Carimbo do papel: sem ele, um PDF guardado nao diz de quando e.
function geradoEm() {
  return `<div class="print-only" style="margin-bottom:10px; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>`;
}

// A "carteirinha" do integrante: emblema, nome, grau com o anel da cor
// dele (ouro/prata/bronze, igual as iniciais das listas), cargo, divisao e
// o % de presenca em destaque - o da divisao, ou o do Regional pra quem e
// do Regional. Sai igual na tela e no PDF.
function cabecalhoMembro(m, r) {
  const detalhe = [m.cargo, m.divisao].filter(Boolean).map(escapeHtml).join(' · ');
  const bloco = r.divisao || r.regional;
  const pct = bloco && bloco.geral.percentual !== null ? bloco.geral.percentual : null;
  return `
    <div class="carteirinha carteirinha-${nivelDoGrau(m.grau)}">
      <img class="carteirinha-emblema" src="${LOGO_SRC}" alt="">
      <div class="carteirinha-dados">
        <div class="carteirinha-clube">Insanos MC · Regional RJ4</div>
        <div class="carteirinha-nome">${escapeHtml(m.nome)}</div>
        <div class="carteirinha-detalhe">${m.grau ? `<span class="carteirinha-grau">${escapeHtml(m.grau)}</span>` : ''}${detalhe || '—'}</div>
        ${linhaFuncoes(m.funcoes)}
        <div class="carteirinha-periodo">${escapeHtml(textoDoPeriodo(state.relIndFiltroInicio, state.relIndFiltroFim))}</div>
      </div>
      ${pct === null ? '' : `
        <div class="carteirinha-pct" data-anima="carteirinha:${m.id}:${pct}">
          <b data-conta="${pct}" data-sufixo="%">${pct}%</b>
          <span>presença</span>
        </div>
      `}
    </div>
  `;
}

const nEventos = (n) => `${n} ${n === 1 ? 'evento' : 'eventos'}`;

function donutPresenca(r, tamanho) {
  return renderDonutChart(segmentosDonutStatus(r), r.percentual === null ? '—' : r.percentual + '%', 'presença', tamanho);
}

// Um bloco de presenca: o card grande do geral (com a linha de evolucao) e,
// embaixo, um card pequeno por tipo em que ele foi convocado.
function blocoPresenca(titulo, bloco) {
  const g = bloco.geral;
  return `
    <div class="card donut-card donut-card-total">
      <div style="font-weight:600; margin-bottom:8px; font-family:'Rye',serif; font-size:17px;">${escapeHtml(titulo)}</div>
      ${donutPresenca(g, 150)}
      <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12.5px;">Convocado para ${nEventos(g.convites)} · confirmou ${g.confirmado}</div>
      ${renderSparklineTendencia(bloco.evolucao)}
    </div>
    ${bloco.porTipo.length ? `
      <div class="donut-grid" style="margin-bottom:14px;">
        ${bloco.porTipo.map(t => `
          <div class="card donut-card">
            <div style="font-weight:600; margin-bottom:8px;">${emojiTipoEvento(t.tipo)} ${escapeHtml(t.tipo)}</div>
            ${donutPresenca(t.resumo, 110)}
            <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">${t.resumo.confirmado} de ${nEventos(t.resumo.convites)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function blocoInsight(ins) {
  if (!ins.rodadas) {
    return `
      <div class="card donut-card">
        <div style="font-weight:600; margin-bottom:6px;">💡 Insight</div>
        <div class="empty" style="padding:16px;">Participa do Insight, mas não teve rodada nesse período.</div>
      </div>
    `;
  }
  return `
    <div class="card donut-card donut-card-total">
      <div style="font-weight:600; margin-bottom:8px; font-family:'Rye',serif; font-size:17px;">💡 Insight</div>
      ${renderDonutChart([
        { label: 'Fez', value: ins.fez, cor: 'var(--status-confirmado)' },
        { label: 'Não fez', value: ins.naoFez, cor: 'var(--status-infracional)' },
      ], ins.percentual === null ? '—' : ins.percentual + '%', 'fez', 150)}
      <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12.5px;">Fez ${ins.fez} de ${ins.rodadas} ${ins.rodadas === 1 ? 'rodada' : 'rodadas'}</div>
      ${renderSparklineTendencia(ins.evolucao)}
    </div>
  `;
}

function historico(itens, nomeDivisao) {
  if (!itens.length) return '';
  const rotuloOrigem = { divisao: nomeDivisao, regional: 'Regional RJ4' };
  return `
    <div class="card linha-do-tempo">
      <div style="font-weight:600; margin-bottom:6px;">Histórico evento a evento</div>
      ${itens.map(ev => {
        const s = STATUS[ev.status] || STATUS.infracional;
        const origem = rotuloOrigem[ev.origem] || escopoPorChave(ev.categoria).nome;
        const detalhe = [ev.data ? formatDataBR(ev.data) : 'sem data', ev.tipo ? emojiTipoEvento(ev.tipo) + ' ' + ev.tipo : '', origem]
          .filter(Boolean).map(escapeHtml).join(' · ');
        return `
          <div class="member-row marco marco-${ev.status}">
            <div class="member-head" style="cursor:default;">
              <div class="member-info-wrap">
                <span class="member-name">${escapeHtml(ev.nome)}</span>
                <div style="color:var(--text-muted); font-size:11.5px;">${detalhe}</div>
              </div>
              <span class="status-badge status-${ev.status}">${s.emoji} ${s.label}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// O relatorio de um integrante, do jeito que vai pro papel: o mesmo na tela
// de um so e em cada pagina do PDF de varios.
function relatorioDoMembro(dados) {
  const r = montarRelatorioIndividual(dados, state.relIndFiltroInicio, state.relIndFiltroFim);
  const m = r.membro;
  const blocos = [
    r.divisao ? blocoPresenca('🏁 Presença · ' + m.divisao, r.divisao) : '',
    r.regional ? blocoPresenca('🏛️ Eventos do Regional', r.regional) : '',
    r.insight ? blocoInsight(r.insight) : '',
  ].join('');
  return `
    ${cabecalhoMembro(m, r)}
    ${blocos || '<div class="empty">Nenhum evento encerrado nem rodada de Insight nesse período.</div>'}
    ${historico(r.historico, m.divisao)}
  `;
}

function conteudoRelatorio() {
  if (state.relIndErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar o relatório</div>
        <div class="alert-msg">${escapeHtml(state.relIndErro)}.</div>
        <button class="btn secondary block" data-action="recarregar-relatorio-individual" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (state.relIndCarregando || !state.relIndDados) {
    return '<div class="alert info"><div class="alert-msg">Montando o relatório…</div></div>';
  }
  return `
    ${filtroPeriodo()}
    <div class="row-gap no-print" style="margin-bottom:14px;">
      <button class="btn secondary" style="flex:1;" data-action="imprimir-relind">🖨️ Exportar PDF</button>
      <button class="btn secondary" style="flex:1;" data-action="copiar-relatorio-individual">${state.relIndCopiado ? 'Copiado ✓' : '📋 Copiar relatório'}</button>
    </div>
    ${geradoEm()}
    ${relatorioDoMembro(state.relIndDados)}
  `;
}

// A folha do PDF de varios: um relatorio embaixo do outro, cada um
// comecando numa pagina nova (.relind-pagina, no CSS de impressao). Fica na
// tela depois da impressao, pra dar pra imprimir de novo sem buscar tudo.
function folhaDeVarios() {
  const lista = state.relIndVarios;
  const faltaram = state.relIndMarcados.size - lista.length;
  return `
    <div class="card no-print" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:4px;">${lista.length} ${lista.length === 1 ? 'relatório pronto' : 'relatórios prontos'}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-bottom:10px;">${escapeHtml(textoDoPeriodo(state.relIndFiltroInicio, state.relIndFiltroFim))}</div>
      ${faltaram > 0 ? `<div class="chamada-quadro-nota" style="margin-bottom:10px;">${faltaram} ${faltaram === 1 ? 'integrante não foi encontrado' : 'integrantes não foram encontrados'} na planilha e ficou de fora.</div>` : ''}
      <button class="btn block" data-action="imprimir-relind">🖨️ Imprimir / Exportar PDF</button>
    </div>
    ${geradoEm()}
    ${lista.length ? lista.map(d => `<div class="relind-pagina">${relatorioDoMembro(d)}</div>`).join('')
      : '<div class="empty">Nenhum dos marcados foi encontrado na planilha.</div>'}
  `;
}

// ---------- acoes ---------------------------------------------------------

// Le o periodo dos campos. null = alguma data errada (o aviso ja saiu).
function lerPeriodo() {
  const inicio = dataDoCampoOuAvisar('relind-data-inicio', 'A data inicial');
  if (inicio === null) return null;
  const fim = dataDoCampoOuAvisar('relind-data-fim', 'A data final');
  if (fim === null) return null;
  return { inicio, fim };
}

function sairDaSelecao() {
  state.relIndSelecionando = false;
  state.relIndMarcados = new Set();
  state.relIndVarios = null;
  state.relIndVariosErro = null;
  state.relIndVariosCarregando = false;
}

export const acoes = {
  // Vem do card do menu do organizador. Sempre comeca pela lista.
  'abrir-relatorio-individual': async (id, target, action, e) => {
    state.view = 'relatorio-individual';
    state.relIndMembroId = null;
    sairDaSelecao();
    return render();
  },
  'toggle-relind-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.relIndDivisoesAbertas.has(chave)) state.relIndDivisoesAbertas.delete(chave);
    else state.relIndDivisoesAbertas.add(chave);
    return render();
  },
  'abrir-relatorio-individual-membro': async (id, target, action, e) => {
    state.relIndMembroId = id;
    state.relIndCopiado = false;
    return loadRelatorioIndividual(id);
  },
  'recarregar-relatorio-individual': async (id, target, action, e) => {
    return loadRelatorioIndividual(state.relIndMembroId);
  },
  'fechar-relatorio-individual-membro': async (id, target, action, e) => {
    state.relIndMembroId = null;
    state.relIndDados = null;
    state.relIndErro = null;
    state.relIndCarregando = false;
    return render();
  },
  // As datas so sao lidas aqui, no toque - ver o comentario no app.js sobre
  // por que o campo de data nao redesenha a tela enquanto se digita.
  'aplicar-relind-periodo': async (id, target, action, e) => {
    const p = lerPeriodo();
    if (!p) return;
    state.relIndFiltroInicio = p.inicio;
    state.relIndFiltroFim = p.fim;
    return render();
  },
  'limpar-relind-periodo': async (id, target, action, e) => {
    state.relIndFiltroInicio = '';
    state.relIndFiltroFim = '';
    return render();
  },
  'imprimir-relind': async (id, target, action, e) => {
    window.print();
  },
  'copiar-relatorio-individual': async (id, target, action, e) => {
    if (!state.relIndDados) return;
    const r = montarRelatorioIndividual(state.relIndDados, state.relIndFiltroInicio, state.relIndFiltroFim);
    const ok = await copiarTexto(textoRelatorioIndividual(r, state.relIndFiltroInicio, state.relIndFiltroFim));
    if (!ok) return;
    state.relIndCopiado = true;
    render();
    setTimeout(() => {
      if (!state.relIndCopiado) return;
      state.relIndCopiado = false;
      render();
    }, 1600);
  },

  // ---- exportar varios ----
  'relind-iniciar-selecao': async (id, target, action, e) => {
    sairDaSelecao();
    state.relIndSelecionando = true;
    return render();
  },
  'relind-cancelar-selecao': async (id, target, action, e) => {
    sairDaSelecao();
    return render();
  },
  'relind-marcar-membro': async (id, target, action, e) => {
    if (state.relIndMarcados.has(id)) state.relIndMarcados.delete(id);
    else state.relIndMarcados.add(id);
    return render();
  },
  // Com todos marcados, desmarca todos; senao (nenhum ou so alguns), marca
  // todos - o mesmo que a caixa "parcial" faz em qualquer lugar.
  'relind-marcar-divisao': async (id, target, action, e) => {
    const membros = membrosDoEscopo(escopoPorChave(target.dataset.value));
    const todos = membros.length > 0 && membros.every(m => state.relIndMarcados.has(m.id));
    membros.forEach(m => {
      if (todos) state.relIndMarcados.delete(m.id);
      else state.relIndMarcados.add(m.id);
    });
    return render();
  },
  'relind-exportar-varios': async (id, target, action, e) => {
    if (state.relIndVariosCarregando) return;
    const ids = marcadosEmOrdem().map(m => m.id);
    if (!ids.length) return;
    const p = lerPeriodo();
    if (!p) return;
    state.relIndFiltroInicio = p.inicio;
    state.relIndFiltroFim = p.fim;
    await loadRelatoriosIndividuaisVarios(ids);
    // So imprime se chegou - com erro, a selecao continua na tela, com o aviso.
    if (state.relIndVarios && state.view === 'relatorio-individual') window.print();
  },
  // Volta pra lista com as mesmas caixas marcadas, pra ajustar e tentar de novo.
  'fechar-relind-varios': async (id, target, action, e) => {
    state.relIndVarios = null;
    return render();
  },
};
