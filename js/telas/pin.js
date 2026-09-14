// Escolha de divisao e pedido de PIN do Modo organizador e dos Relatorios.

import { loadReportData } from '../dados/carregar.js';
import { conferirPin } from '../dados/pin.js';
import { escoposAtivos, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { renderEscolhaDivisao, renderTelaPin } from '../ui/comuns.js';

// As 7 divisoes, cada uma com o proprio PIN (o do Regional tambem abre
// qualquer uma das outras, ver verificarPin no Code.gs). Eventos criados
// aqui dentro ficam marcados com a categoria certa e a lista de membros e
// filtrada pra so mostrar quem e daquela divisao.
export function renderDivisoes(app) {
  renderEscolhaDivisao(app, {
    titulo: 'Modo organizador',
    escopos: escoposEmOrdemDeExibicao(),
    acao: 'select-divisao',
  });
}

export function renderPin(app) {
  renderTelaPin(app, {
    titulo: 'Modo organizador',
    voltar: 'go-divisoes',
    campo: 'pin-field',
    acao: 'check-pin',
    verificando: state.pinVerificando,
    erro: state.pinErro,
    aoEnter: checkPin,
  });
}

// O PIN nunca e comparado no navegador - so o servidor sabe o valor certo.
// A pagina manda o que foi digitado e recebe de volta so um sim/nao.
export async function checkPin() {
  return conferirPin({
    campo: 'pin-field',
    escopo: state.adminEscopo,
    chaveVerificando: 'pinVerificando',
    chaveErro: 'pinErro',
    aoEntrar: () => {
      state.isAdmin = true;
      state.view = 'admin';
      state.adminTab = 'eventos';
    },
  });
}

// Tela "Relatorios" (colar convocacao) - copia de renderDivisoes/renderPin,
// mas escreve em relatorioEscopo/relatorioIsAdmin em vez de
// adminEscopo/isAdmin, para nao interferir numa sessao do Modo organizador
// que porventura esteja aberta ao mesmo tempo.
export function renderRelatorioDivisoes(app) {
  renderEscolhaDivisao(app, {
    titulo: 'Relatórios',
    escopos: escoposAtivos(),
    acao: 'select-relatorio-divisao',
  });
}

export function renderRelatorioPin(app) {
  renderTelaPin(app, {
    titulo: 'Relatórios',
    voltar: 'go-relatorio-divisoes',
    campo: 'relatorio-pin-field',
    acao: 'check-relatorio-pin',
    verificando: state.relatorioPinVerificando,
    erro: state.relatorioPinErro,
    aoEnter: checkRelatorioPin,
  });
}

export async function checkRelatorioPin() {
  return conferirPin({
    campo: 'relatorio-pin-field',
    escopo: state.relatorioEscopo,
    chaveVerificando: 'relatorioPinVerificando',
    chaveErro: 'relatorioPinErro',
    aoEntrar: async () => {
      state.relatorioIsAdmin = true;
      state.view = 'relatorio';
      // A pagina principal depois do PIN e o "Resumo Relatorio" (os 5
      // donuts) - as outras 6 abas ficam a um clique de distancia.
      state.relatorioTab = 'resumo';
      state.relatorioColarStep = 'texto';
      state.relatorioTipoDetalhe = null;
      state.relatorioFiltroDivisao = 'todas';
      state.relatorioFiltroDataInicio = '';
      state.relatorioFiltroDataFim = '';
      render();
      await loadReportData();
    },
  });
}

// Acoes da escolha de divisao e do PIN.
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'go-divisoes': async (id, target, action, e) => {
    state.view = 'admin-divisoes'; return render();
  },
  'select-divisao': async (id, target, action, e) => {
    state.adminEscopo = target.dataset.value;
    state.view = 'admin-pin';
    state.pinErro = null;
    return render();
  },
  'check-pin': async (id, target, action, e) => {
    return checkPin();
  },
  'go-relatorio-divisoes': async (id, target, action, e) => {
    state.view = 'relatorio-divisoes';
    state.relatorioTextoBruto = '';
    state.relatorioParsed = null;
    state.relatorioSalvarErro = null;
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    state.relatorioEditandoEventoId = null;
    state.relatorioTab = 'resumo';
    state.relatorioColarStep = 'texto';
    state.relatorioCategoriaAlvo = null;
    state.relatorioTipoEscolhido = null;
    state.relatorioTipoDetalhe = null;
    state.relatorioFiltroDivisao = 'todas';
    state.relatorioFiltroDataInicio = '';
    state.relatorioFiltroDataFim = '';
    state.relatorioEstatisticasExpandidas = new Set();
    state.relatorioEventosExpandidos = new Set();
    state.relatorioMembroFichaId = null;
    return render();
  },
  'select-relatorio-divisao': async (id, target, action, e) => {
    state.relatorioEscopo = target.dataset.value;
    // Padrao: a categoria alvo comeca igual ao escopo escolhido (Regional ->
    // "Regional", Barra -> "Barra") - so muda se a pessoa clicar num botao
    // de divisao especifica na tela de colar, ver "set-relatorio-categoria".
    state.relatorioCategoriaAlvo = target.dataset.value;
    state.view = 'relatorio-pin';
    state.relatorioPinErro = null;
    return render();
  },
  'check-relatorio-pin': async (id, target, action, e) => {
    return checkRelatorioPin();
  },
};
