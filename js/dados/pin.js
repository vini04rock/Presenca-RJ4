// Conferencia de PIN, compartilhada pelas tres telas que pedem PIN
// (Modo organizador, Relatorios e o Organizar do Calendario).
//
// O PIN nunca e comparado aqui no navegador: a tela manda o que a pessoa
// digitou e recebe de volta so um sim/nao. O valor certo vive nas
// Propriedades do Script do Apps Script (ver verificarPin no Code.gs) e
// nunca chega ao aparelho de ninguem.

import { api } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';

// Cada tela guarda o proprio "verificando"/"erro" no state, com nomes
// diferentes - por isso eles chegam como nome de chave, e nao como valor.
// aoEntrar e o que cada tela faz quando o PIN bate (trocar de view, abrir
// uma aba, carregar dados...); pode ser async, e esperado antes de sair.
export async function conferirPin({ campo, escopo, chaveVerificando, chaveErro, aoEntrar }) {
  if (state[chaveVerificando]) return;
  const val = document.getElementById(campo).value.trim();
  if (!val) return;
  state[chaveVerificando] = true;
  state[chaveErro] = null;
  render();
  try {
    const r = await api('verificarPin', { escopo, pin: val });
    if (r.valido) {
      // Guardado, nao descartado: o backend exige o PIN em toda gravacao
      // administrativa (ver ACOES_PROTEGIDAS em nucleo/api.js). Sem isso a
      // pessoa entraria na tela e toda acao seria recusada.
      state.pinAtual = { escopo, pin: val };
      await aoEntrar();
    }
    else state[chaveErro] = 'PIN incorreto.';
  } catch (e) {
    state[chaveErro] = 'Não consegui verificar (' + e.message + '). Tente de novo.';
  }
  state[chaveVerificando] = false;
  render();
}
