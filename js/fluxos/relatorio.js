// Acoes de relatorio: gerar na planilha, exportar PDF, copiar texto.

import { loadReportData } from '../dados/carregar.js';
import { buildInsightReportText, buildReportText } from '../dominio/relatorio-texto.js';
import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto } from '../nucleo/util.js';

// "Exportar para PDF" da aba Eventos do Modo organizador - pula direto pro
// Resumo Relatorio (a mesma tela/botao de imprimir que ja existe em
// Relatorios), no escopo e periodo que o organizador ja escolheu aqui, sem
// pedir o PIN de novo (o organizador ja provou quem e entrando no Modo
// organizador - o PIN de Relatorios de uma divisao e sempre o mesmo PIN).
export async function exportarRelatorioPdfAdmin() {
  state.exportandoPdfAdmin = true;
  render();
  state.relatorioEscopo = state.adminEscopo;
  state.relatorioIsAdmin = true;
  state.view = 'relatorio';
  state.relatorioTab = 'resumo';
  state.relatorioColarStep = 'texto';
  state.relatorioTipoDetalhe = null;
  state.relatorioFiltroDivisao = 'todas';
  await loadReportData();
  state.exportandoPdfAdmin = false;
  render();
  window.print();
}

// Regera a aba Relatorio da planilha. Fica fora do caminho da confirmacao de
// propósito: gerar junto com cada marcacao dobrava o tempo que o membro espera.
export async function gerarRelatorio() {
  state.relatorioState = 'gerando';
  state.relatorioErro = null;
  render();
  try {
    await api('relatorio');
    state.relatorioState = 'ok';
  } catch (e) {
    state.relatorioState = 'erro';
    state.relatorioErro = e.message;
  }
  render();
  if (state.relatorioState === 'ok') {
    setTimeout(() => {
      if (state.relatorioState === 'ok') { state.relatorioState = 'idle'; render(); }
    }, 4000);
  }
}

export async function copyReportToClipboard(ev) {
  const ok = await copiarTexto(buildReportText(ev));
  if (ok) {
    state.copiedEventId = ev.id;
    render();
    setTimeout(() => {
      if (state.copiedEventId === ev.id) {
        state.copiedEventId = null;
        render();
      }
    }, 1600);
  }
}

export async function copyInsightReportToClipboard(r) {
  const ok = await copiarTexto(buildInsightReportText(r));
  if (ok) {
    state.copiedInsightRodadaId = r.id;
    render();
    setTimeout(() => {
      if (state.copiedInsightRodadaId === r.id) {
        state.copiedInsightRodadaId = null;
        render();
      }
    }, 1600);
  }
}
