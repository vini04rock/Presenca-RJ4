// Graficos em SVG: rosca, sparkline e o ranking de faltas.

import { rankingFaltasInfracionais, resumoDonutPeriodo } from '../dominio/estatisticas.js';
import { RELATORIO_PERIODOS, emojiTipoEvento } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml, formatDataBR } from '../nucleo/util.js';
import { render } from '../nucleo/render.js';

// Donut de status em SVG puro (sem biblioteca) - um anel por segmento,
// usando stroke-dasharray/dashoffset; numero central + legenda com
// swatch+valor, pra identidade nunca depender so da cor (segue a mesma
// regra de acessibilidade das outras telas do app). "centro"/"centroLabel"
// ficam sobrepostos ao SVG num div posicionado por cima.
export function renderDonutChart(segments, centro, centroLabel, tamanho) {
  tamanho = tamanho || 120;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = tamanho / 2, cy = tamanho / 2, espessura = Math.round(tamanho * 0.133), r = cx - espessura / 2 - 2;
  const C = 2 * Math.PI * r;
  let acumulado = 0;
  const comDados = segments.filter(s => s.value > 0);
  const arcos = total && comDados.length ? comDados.map(s => {
    const frac = s.value / total;
    const arco = `
      <circle class="donut-arco" data-action="destacar-fatia" data-rotulo="${escapeHtml(s.label)}" data-valor="${s.value} · ${Math.round(frac * 100)}%" cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:${s.cor}" stroke-width="${espessura}"
        stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}"
        stroke-dashoffset="${(-acumulado * C).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})"></circle>
    `;
    acumulado += frac;
    return arco;
  }).join('') : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--surface-alt)" stroke-width="${espessura}"></circle>`;
  const fonteCentro = Math.round(tamanho * 0.183), fonteLabel = Math.round(tamanho * 0.075);
  // "56%" sobe de 0 ate 56 quando a rosca aparece (ver animarNovidades, no
  // app.js); "—" e qualquer outro texto ficam parados.
  const pctCentro = /^\d+%$/.test(String(centro)) ? ` data-conta="${parseInt(centro, 10)}" data-sufixo="%"` : '';
  const chaveAnima = 'rosca:' + centro + ':' + segments.map(s => s.value).join(',');

  return `
    <div class="donut-wrap" data-anima="${escapeHtml(chaveAnima)}">
      <div style="position:relative; width:${tamanho}px; height:${tamanho}px; flex-shrink:0;">
        <svg width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">${arcos}</svg>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center;">
          <div class="donut-centro-valor" data-original="${escapeHtml(String(centro))}" style="font-size:${fonteCentro}px; font-weight:700; color:var(--white-strong); line-height:1;"${pctCentro}>${escapeHtml(String(centro))}</div>
          <div class="donut-centro-rotulo" data-original="${escapeHtml(centroLabel)}" style="font-size:${fonteLabel}px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; margin-top:3px;">${escapeHtml(centroLabel)}</div>
        </div>
      </div>
      <div class="donut-legend">
        ${segments.map(s => `
          <div class="donut-legend-item" data-action="destacar-fatia" data-rotulo="${escapeHtml(s.label)}">
            <span class="donut-swatch" style="background:${s.cor};"></span>
            <span class="donut-legend-label">${escapeHtml(s.label)}</span>
            <span class="donut-legend-value">${s.value}${total ? ' · ' + Math.round(s.value / total * 100) + '%' : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Status agrupado em 4 fatias (confirmado/aguardando/faltas justificadas/
// faltas infracionais) para o donut - familia+trabalho+justificada viram
// uma unica fatia, igual ao que buildReportText ja agrupa.
// So 3 fatias - eventos encerrados nunca deveriam ter "Aguardando" de
// verdade (ver statusEfetivo), entao esse status nem entra no donut.
export function segmentosDonutStatus(statusPeriodo) {
  return [
    { label: 'Confirmado', value: statusPeriodo.confirmado, cor: 'var(--status-confirmado)' },
    { label: 'Faltas justificadas', value: statusPeriodo.justificada, cor: 'var(--status-justificada)' },
    { label: 'Faltas não justificadas', value: statusPeriodo.infracional, cor: 'var(--status-infracional)' },
  ];
}

// Painel opcional acima de "% de cada integrante", no mesmo periodo
// escolhido pro card "Presenca total" (ver renderDonutCard) - some sozinho
// quando ninguem tem falta infracional no periodo, pra nao virar um card
// vazio disputando espaco com o resto do resumo.
export function renderRankingFaltasInfracionais(encerrados) {
  const meses = state.relatorioPeriodoPorGrafico.total || 3;
  const mostrarDivisao = state.adminEscopo === 'regional' && state.relatorioFiltroDivisao === 'todas';
  const ranking = rankingFaltasInfracionais(encerrados, meses).filter(r => r.total > 0).slice(0, 8);
  if (!ranking.length) return '';
  return `
    <div class="card" style="margin-top:14px;">
      <div class="painel-titulo" style="margin-bottom:2px;">⚠️ Mais faltas não justificadas</div>
      <div style="color:var(--text-muted); font-size:12px; margin-bottom:8px;">Últimos ${meses === 1 ? 'mês' : meses + ' meses'}</div>
      ${ranking.map(r => `
        <div class="info-line" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${escapeHtml(r.nome)}${mostrarDivisao && r.divisao ? ` <span style="color:var(--text-muted); font-size:11.5px;">· ${escapeHtml(r.divisao)}</span>` : ''}</span>
          <span style="font-weight:700; color:var(--status-infracional);">${r.total}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// Um card do painel: titulo, chips de periodo proprios, donut e a contagem
// de eventos embaixo - "total" vem maior e centralizado (destaque = true).
// Linha de tendencia (sparkline) em SVG puro - mesma tecnica de
// stroke-dasharray/path do donut, sem lib nenhuma. So conecta pontos com %
// valido (eventos ainda sem reportData carregado ficam de fora da linha em
// vez de virar um buraco em 0%, que mentiria sobre a presenca). Usada so no
// card "Presença total" (destaque) - nos 4 cards de tipo, lado a lado num
// grid pequeno, o grafico ficaria pequeno demais pra informar algo.
export function renderSparklineTendencia(itens) {
  const cronologico = itens.slice().sort((a, b) => (a.ev.data || '').localeCompare(b.ev.data || ''));
  const validos = cronologico.filter(x => x.pct !== null);
  if (validos.length < 2) return '';

  const largura = 280, altura = 56, margem = 6;
  const n = cronologico.length;
  const pontos = cronologico.map((x, i) => ({
    x: n > 1 ? margem + (i / (n - 1)) * (largura - margem * 2) : largura / 2,
    y: x.pct === null ? null : altura - margem - (x.pct / 100) * (altura - margem * 2),
    pct: x.pct, nome: x.ev.nome, data: x.ev.data
  }));

  let caminho = '';
  pontos.forEach(p => { if (p.y !== null) caminho += (caminho ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' '; });
  const bolinhas = pontos.filter(p => p.y !== null).map(p => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--white-strong)">
      <title>${escapeHtml(p.nome)}${p.data ? ' — ' + formatDataBR(p.data) : ''}: ${p.pct}%</title>
    </circle>
  `).join('');

  return `
    <div style="margin-top:10px;" data-anima="linha:${validos.map(x => x.pct).join(',')}">
      <svg width="100%" height="${altura}" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" style="display:block;">
        <path class="linha-tendencia" pathLength="1" d="${caminho.trim()}" fill="none" stroke="var(--white-strong)" stroke-width="1.5"></path>
        ${bolinhas}
      </svg>
      <div style="display:flex; justify-content:space-between; font-size:10.5px; color:var(--text-muted); margin-top:2px;">
        <span>${cronologico[0].ev.data ? formatDataBR(cronologico[0].ev.data) : ''}</span>
        <span>${cronologico[cronologico.length - 1].ev.data ? formatDataBR(cronologico[cronologico.length - 1].ev.data) : ''}</span>
      </div>
    </div>
  `;
}

// Enquanto as presencas dos eventos chegam: o formato da rosca e da
// legenda em vidro, no lugar do "Carregando..." - a tela ja nasce com a
// forma que vai ter, e nada pula quando os numeros chegam.
export function esqueletoRosca(tamanho) {
  return `
    <div class="donut-wrap esqueleto-rosca" aria-busy="true">
      <div class="esqueleto esqueleto-circulo" style="width:${tamanho}px; height:${tamanho}px;"></div>
      <div class="donut-legend">
        ${[0, 1, 2].map(() => '<div class="esqueleto esqueleto-texto"></div>').join('')}
      </div>
    </div>
  `;
}

// O mesmo, pras listas (% de cada integrante, eventos de um tipo).
export function esqueletoLista(linhas = 4) {
  return `<div class="esqueleto-lista" aria-busy="true">${Array.from({ length: linhas }, () => '<div class="esqueleto esqueleto-texto-linha"></div>').join('')}</div>`;
}

export function renderDonutCard(titulo, chave, encerrados, destaque) {
  const meses = state.relatorioPeriodoPorGrafico[chave] || 3;
  const r = resumoDonutPeriodo(encerrados, chave, meses);
  const emoji = chave === 'total' ? '🏁' : emojiTipoEvento(chave);
  return `
    <div class="card donut-card${destaque ? ' donut-card-total' : ''}">
      <div class="painel-titulo">${emoji} ${escapeHtml(titulo)}</div>
      <div class="pilulas-periodo no-print">
        ${RELATORIO_PERIODOS.map(m => `
          <button class="pilula ${meses === m ? 'active' : ''}" data-action="set-relatorio-periodo-tipo" data-chave="${escapeHtml(chave)}" data-value="${m}">${m === 1 ? '1 mês' : m + ' meses'}</button>
        `).join('')}
      </div>
      <div class="print-only" style="margin-bottom:10px; font-size:12px; color:var(--text-muted);">Período: últimos ${meses === 1 ? 'mês' : meses + ' meses'}</div>
      ${r.faltaCarregar ? esqueletoRosca(destaque ? 150 : 110) : renderDonutChart(segmentosDonutStatus(r.statusPeriodo), r.pct === null ? '—' : r.pct + '%', 'presença', destaque ? 150 : 110)}
      <div class="info-line" style="padding:8px 0 0; color:var(--text-muted); font-size:12px;">
        ${r.eventosNoPeriodo} ${r.eventosNoPeriodo === 1 ? 'evento encerrado' : 'eventos encerrados'} nesse período
      </div>
      ${destaque && !r.faltaCarregar ? renderSparklineTendencia(r.itens) : ''}
      ${r.itens.length ? `<div class="btn ghost no-print" style="margin-top:6px; padding:4px 0;" data-action="abrir-relatorio-tipo-detalhe" data-value="${escapeHtml(chave)}">Ver eventos ›</div>` : ''}
    </div>
  `;
}

// Acoes dos graficos (trocar periodo, abrir detalhe do tipo).
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  // Tocar numa fatia (ou na legenda dela) acende so ela e poe o numero dela
  // no meio da rosca; tocar de novo volta ao total. So mexe no que ja esta
  // na tela - sem redesenhar, senao a rosca se desenharia de novo.
  'destacar-fatia': async (id, target, action, e) => {
    const wrap = target.closest('.donut-wrap');
    if (!wrap) return;
    const rotulo = target.dataset.rotulo;
    const arco = [...wrap.querySelectorAll('.donut-arco')].find(c => c.dataset.rotulo === rotulo);
    const valor = wrap.querySelector('.donut-centro-valor');
    const legenda = wrap.querySelector('.donut-centro-rotulo');
    const jaAceso = arco && arco.classList.contains('fatia-acesa');
    wrap.querySelectorAll('.fatia-acesa').forEach(el => el.classList.remove('fatia-acesa'));
    if (!arco || jaAceso) {
      wrap.classList.remove('com-fatia');
      valor.textContent = valor.dataset.original;
      legenda.textContent = legenda.dataset.original;
      return;
    }
    wrap.classList.add('com-fatia');
    arco.classList.add('fatia-acesa');
    wrap.querySelectorAll('.donut-legend-item').forEach(el => el.classList.toggle('fatia-acesa', el.dataset.rotulo === rotulo));
    const [n, pct] = arco.dataset.valor.split(' · ');
    valor.textContent = pct;
    legenda.textContent = rotulo + ' · ' + n;
  },
  'set-relatorio-periodo-tipo': async (id, target, action, e) => {
    state.relatorioPeriodoPorGrafico[target.dataset.chave] = Number(target.dataset.value);
    return render();
  },
  'abrir-relatorio-tipo-detalhe': async (id, target, action, e) => {
    state.relatorioTipoDetalhe = target.dataset.value;
    return render();
  },
};
