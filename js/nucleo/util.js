// Utilidades sem dono: escapar HTML, formatar data, copiar texto, lotes.

import { GRAUS, MESES_ABREV } from './config.js';

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

// Hex ('#RRGGBB') pra rgba(...) com opacidade - usado nos tons de fundo bem
// transparentes das personalidades por tipo (renderHomeTipos/renderCardEvento).
export function hexParaRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Escapa o texto normalmente (mesma seguranca de sempre) e so depois
// transforma em link o que parecer uma URL - nunca insere HTML vindo do
// texto em si, so envolve o trecho reconhecido numa tag <a>.
export function linkify(str) {
  const escapado = escapeHtml(str);
  return escapado.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (match) => {
    // Pontuacao de fechamento de frase (. , ; : ! ? ) provavelmente nao faz
    // parte do link - tira do link e devolve depois dele.
    const corte = match.match(/[.,;:!?)\]]+$/);
    const sufixo = corte ? corte[0] : '';
    const url = sufixo ? match.slice(0, -sufixo.length) : match;
    const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#9cc4ff; text-decoration:underline; word-break:break-all;">${url}</a>${sufixo}`;
  });
}

// ---------- RENDER ----------

export function formatDataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Formato compacto para o selo do card na tela inicial - "09 SET" em vez de
// "09/09/2026", que não cabe bem num canto de card.
export function formatDataCurta(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  const mesIndice = Number(m) - 1;
  if (!d || mesIndice < 0 || mesIndice > 11) return '';
  return `${d} ${MESES_ABREV[mesIndice]}`;
}

// Quanto menor o grau (I antes de X), maior o cargo - aparece primeiro.
// Quem nao tem grau cadastrado fica no fim, em ordem alfabetica.
export function ordenarPorHierarquia(membros) {
  const indice = (m) => { const i = GRAUS.indexOf(m.grau); return i === -1 ? GRAUS.length : i; };
  return [...membros].sort((a, b) => indice(a) - indice(b) || a.nome.localeCompare(b.nome));
}

// ========================================================================
// PARSER DA CONVOCACAO COLADA (tela "Relatorios")
// Le o texto que o clube ja manda pronto no WhatsApp e transforma em
// { evento, membrosParsed, avisos } - funcao pura, sem tocar em state/DOM,
// pra dar pra testar/ajustar so olhando entrada e saida.
// ========================================================================

// Usado pelas validacoes de confirmarEventoParseado - o botao "Confirmar"
// fica la embaixo da tela, entao um aviso que so aparece perto do campo
// (ex.: "escolha o tipo") passa batido se a pagina nao rolar sozinha ate lá.
export function scrollParaElemento(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// yyyy-MM-dd de N meses atras, no fuso local - mesma ideia de dataCorte no
// Code.gs, so que calculada no navegador (aqui nao precisamos ler a
// planilha de novo, so filtrar o que ja esta em state.events/reportData).
export function dataCorteMeses(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Google Sheets recusa lote grande demais de leituras ao mesmo tempo ("Muitos
// pedidos simultaneos"). Antes disso so acontecia com dezenas de eventos
// (ex.: depois de gerarDadosFakeTeste); disparando tudo de uma vez com
// Promise.allSettled, como fazia antes, o navegador manda uma leitura por
// evento em paralelo sem limite nenhum. Aqui o mesmo trabalho e feito em
// lotes pequenos, um atras do outro - mais lento, mas nao esbarra no limite.
export async function emLotes(itens, tamanhoDoLote, tarefa) {
  const resultados = [];
  for (let i = 0; i < itens.length; i += tamanhoDoLote) {
    const lote = itens.slice(i, i + tamanhoDoLote);
    const parciais = await Promise.allSettled(lote.map(tarefa));
    resultados.push(...parciais);
  }
  return resultados;
}

// Extraido de copyReportToClipboard pra reaproveitar tambem no "Copiar
// relatorio" de cada rodada de Insight (copyInsightReportToClipboard) -
// navigator.clipboard exige contexto seguro (https) e falha silenciosa em
// alguns navegadores/paginas embutidas, daí o fallback com textarea+
// execCommand, que funciona bem mais amplamente.
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}
