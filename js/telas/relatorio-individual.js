// Modo organizador, "Relatorio individual": a lista de integrantes e o
// relatorio completo de cada um - presenca na divisao por tipo de evento,
// eventos do Regional a parte, Insight e o historico evento a evento.
//
// Numa divisao, a lista e so dela. No Regional (chave-mestra), cada divisao
// vira um grupo que abre ao toque, pra nao despejar cem nomes de uma vez -
// o mesmo padrao do Rank e da lista de um evento regional.
//
// As contas moram em dominio/relatorio-individual.js; aqui e so desenho.

import { montarRelatorioIndividual } from '../dominio/relatorio-individual.js';
import { emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao, STATUS } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { dataDoCampoOuAvisar, escapeHtml, formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';
import { campoData, linhaFuncoes } from '../ui/comuns.js';
import { renderDonutChart, renderSparklineTendencia, segmentosDonutStatus } from '../ui/graficos.js';
import { loadRelatorioIndividual } from '../dados/carregar.js';
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
  if (state.relIndMembroId) {
    app.innerHTML = cabecalho('fechar-relatorio-individual-membro', 'Integrantes') + conteudoRelatorio();
    return;
  }
  app.innerHTML = cabecalho('go-menu-organizador', 'Menu') + listaIntegrantes();
}

// ---------- a lista -------------------------------------------------------

// A divisao nao aparece na linha: numa divisao e a propria tela, e no
// Regional e o grupo em que a linha esta.
function linhaIntegrante(m) {
  return `
    <div class="member-row">
      <div class="member-head" data-action="abrir-relatorio-individual-membro" data-id="${m.id}">
        <div class="member-info-wrap">
          <div class="member-info">
            <span class="member-name">${escapeHtml(m.nome)}</span>
            ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
          </div>
          ${m.cargo ? `<div class="confirmado-divisao">${escapeHtml(m.cargo)}</div>` : ''}
          ${linhaFuncoes(m.funcoes)}
        </div>
        <span class="arrow" style="color:var(--text-muted); font-size:20px;">›</span>
      </div>
    </div>
  `;
}

function listaIntegrantes() {
  const doEscopo = (e) => ordenarPorHierarquia(state.roster.filter(m => m.divisao === e.nome));
  const aviso = `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Toque num integrante pra ver a presença dele em cada tipo de evento e no Insight.</div>
    </div>
  `;

  if (state.adminEscopo !== 'regional') {
    const membros = doEscopo(escopoPorChave(state.adminEscopo));
    if (!membros.length) return '<div class="empty">Nenhum integrante cadastrado nesta divisão.</div>';
    return aviso + `<div class="card" style="padding: 4px 16px;">${membros.map(linhaIntegrante).join('')}</div>`;
  }

  return aviso + escoposEmOrdemDeExibicao().map(e => {
    const membros = doEscopo(e);
    const aberto = state.relIndDivisoesAbertas.has(e.chave);
    return `
      <div class="card" style="padding: 4px 16px;">
        <div class="division-subheader clicavel" data-action="toggle-relind-divisao" data-value="${e.chave}">
          <span>${aberto ? '▾' : '▸'} ${escapeHtml(e.nome.toUpperCase())}</span>
          <span class="division-counts">${membros.length} ${membros.length === 1 ? 'integrante' : 'integrantes'}</span>
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

function textoPeriodo() {
  const i = state.relIndFiltroInicio, f = state.relIndFiltroFim;
  if (!i && !f) return 'Desde sempre';
  if (i && f) return `De ${formatDataBR(i)} a ${formatDataBR(f)}`;
  return i ? `A partir de ${formatDataBR(i)}` : `Até ${formatDataBR(f)}`;
}

function cabecalhoMembro(m) {
  const detalhe = [m.cargo, m.divisao].filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-family:'Rye',serif; font-size:19px; color:var(--white-strong);">${escapeHtml(m.nome)}${m.grau ? ` <span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-top:4px;">${detalhe || '—'}</div>
      ${linhaFuncoes(m.funcoes)}
      <div style="color:var(--text-muted); font-size:11.5px; margin-top:8px;">${escapeHtml(textoPeriodo())}</div>
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
    <div class="card">
      <div style="font-weight:600; margin-bottom:6px;">Histórico evento a evento</div>
      ${itens.map(ev => {
        const s = STATUS[ev.status] || STATUS.infracional;
        const origem = rotuloOrigem[ev.origem] || escopoPorChave(ev.categoria).nome;
        const detalhe = [ev.data ? formatDataBR(ev.data) : 'sem data', ev.tipo ? emojiTipoEvento(ev.tipo) + ' ' + ev.tipo : '', origem]
          .filter(Boolean).map(escapeHtml).join(' · ');
        return `
          <div class="member-row">
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

  const r = montarRelatorioIndividual(state.relIndDados, state.relIndFiltroInicio, state.relIndFiltroFim);
  const m = r.membro;
  const blocos = [
    r.divisao ? blocoPresenca('🏁 Presença · ' + m.divisao, r.divisao) : '',
    r.regional ? blocoPresenca('🏛️ Eventos do Regional', r.regional) : '',
    r.insight ? blocoInsight(r.insight) : '',
  ].join('');

  return `
    ${filtroPeriodo()}
    ${cabecalhoMembro(m)}
    ${blocos || '<div class="empty">Nenhum evento encerrado nem rodada de Insight nesse período.</div>'}
    ${historico(r.historico, m.divisao)}
  `;
}

// ---------- acoes ---------------------------------------------------------

export const acoes = {
  // Vem do card do menu do organizador. Sempre comeca pela lista.
  'abrir-relatorio-individual': async (id, target, action, e) => {
    state.view = 'relatorio-individual';
    state.relIndMembroId = null;
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
    const inicio = dataDoCampoOuAvisar('relind-data-inicio', 'A data inicial');
    if (inicio === null) return;
    const fim = dataDoCampoOuAvisar('relind-data-fim', 'A data final');
    if (fim === null) return;
    state.relIndFiltroInicio = inicio;
    state.relIndFiltroFim = fim;
    return render();
  },
  'limpar-relind-periodo': async (id, target, action, e) => {
    state.relIndFiltroInicio = '';
    state.relIndFiltroFim = '';
    return render();
  },
};
