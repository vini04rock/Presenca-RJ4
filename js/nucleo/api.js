// Transporte com o Apps Script: JSONP para ler, POST/beacon para gravar,
// e a credencial do organizador anexada nas acoes que gravam.

import { state } from './estado.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbyotQH6FypFdkC6D42WQHszNiuG29wqIBal2jBcwXdoCsT-Om_0gyDxFE02hxfwrZegxw/exec';

// A API do Apps Script leva de 2 a 4s numa conexao boa. No 4G do celular
// passa disso com folga, entao o limite precisa ser generoso.
const READ_TIMEOUT = 20000;
const READ_RETRIES = 2;

// As mesmas acoes que o Code.gs recusa sem PIN (ver ACOES_PROTEGIDAS la).
// A lista esta escrita nos dois lados de proposito, e o backend e quem
// manda: aqui ela so evita gastar uma ida ate o servidor com uma requisicao
// que ja nasceria recusada. Se as duas sairem do ar uma da outra, quem
// perde e o app - a planilha continua protegida.
//
// "presenca" nao entra: a tela de confirmar e publica, sem PIN.
const ACOES_PROTEGIDAS = [
  'eventoSalvar', 'eventoRemover', 'membroSalvar', 'membroRemover',
  'criarEventoDeTexto', 'criarEventosDeCalendario', 'relatorio',
  'insightSalvar', 'insightRodadaAjustar', 'insightRodadaRemover',
  'insightMembroRemover', 'insightMembroReincluir',
];

// Anexa escopo+PIN quando a acao exige. Some do caminho nas demais, pra
// leitura publica continuar sendo leitura publica - o PIN nao precisa
// passear pela URL de quem so esta vendo a lista de eventos.
function comCredencial(action, params) {
  if (!ACOES_PROTEGIDAS.includes(action)) return params || {};
  const cred = state.pinAtual;
  return { ...(params || {}), escopo: cred ? cred.escopo : '', pin: cred ? cred.pin : '' };
}

function jsonp(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cbName = 'cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
    };
    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Falha de conexao')); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName;
    document.body.appendChild(script);
    timer = setTimeout(() => {
      if (window[cbName]) { cleanup(); reject(new Error('A conexao demorou demais')); }
    }, timeoutMs);
  });
}

// Leitura e gravacao passam pelo mesmo caminho: o backend responde confirmando
// a operacao, entao nao e mais preciso gravar as cegas e reler para conferir.
// Lanca em caso de falha, em vez de devolver vazio - devolver vazio fazia o app
// confundir "nao consegui ler" com "nao tem nada salvo".
export async function api(action, params) {
  params = comCredencial(action, params);
  const query = Object.keys(params || {})
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = API_URL + '?action=' + encodeURIComponent(action) + (query ? '&' + query : '');

  let ultimoErro;
  for (let tentativa = 0; tentativa <= READ_RETRIES; tentativa++) {
    try {
      const r = await jsonp(url, READ_TIMEOUT);
      if (!r || !r.ok) throw new Error((r && r.erro) || 'A planilha recusou a operação');
      return r;
    } catch (e) {
      ultimoErro = e;
      console.error('Falha em', action, 'tentativa', tentativa + 1, e);
    }
  }
  throw ultimoErro;
}

// Rede de seguranca para quando a pagina esta sendo fechada: o sendBeacon e
// entregue pelo navegador mesmo depois da aba morrer. Nao da para conferir o
// resultado, mas e melhor que perder a marcacao.
export function apiBeacon(action, params) {
  if (!navigator.sendBeacon) return false;
  const corpo = JSON.stringify(Object.assign({ action: action }, comCredencial(action, params)));
  return navigator.sendBeacon(API_URL, new Blob([corpo], { type: 'text/plain;charset=utf-8' }));
}

// Usado so pela importacao de convocacao colada: o payload (lista de membros
// com status) pode passar do limite pratico de tamanho de uma URL de GET, ja
// que o api() normal manda tudo como query string. O doGet/doPost no Code.gs
// caem na mesma funcao executar(), entao o backend nao muda - so troca o
// transporte para um corpo JSON de verdade.
export async function apiPost(action, params) {
  // Sem header de Content-Type de proposito: o fetch entao manda como
  // "text/plain" (o mesmo que o sendBeacon acima ja usa), que o navegador
  // trata como requisicao simples e nao dispara preflight OPTIONS - o Apps
  // Script nao responde a OPTIONS, entao um POST com Content-Type
  // "application/json" explicito falharia por CORS.
  const r = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action: action }, comCredencial(action, params)))
  });
  const data = await r.json();
  if (!data || !data.ok) throw new Error((data && data.erro) || 'A planilha recusou a operação');
  return data;
}
