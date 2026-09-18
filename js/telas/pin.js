// Escolha de divisao e pedido de PIN do Modo organizador.
//
// Os Relatorios tinham um fluxo identico a este, com os proprios campos
// no state, porque eram um card separado na tela inicial. Agora sao uma
// secao dentro do organizador e entram pelo PIN daqui.

import { conferirPin } from '../dados/pin.js';
import { escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { renderEscolhaDivisao, renderTelaPin } from '../ui/comuns.js';
import { entrarNoMenuOrganizador } from './menu-organizador.js';

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
      state.adminTab = 'eventos';
      // Depois do PIN a pessoa escolhe a secao no menu, em vez de cair
      // direto em Eventos - ver telas/menu-organizador.js. A entrada busca
      // as presencas dos eventos proximos, pro aviso do topo.
      entrarNoMenuOrganizador();
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
};
