// Utilidades sem dono: escapar HTML, formatar data, copiar texto, lotes.

import { GRAUS, MESES_ABREV, cargosDoGrau } from './config.js';

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

// Valor de um campo do formulario, pelo id. Usado por quem so le o campo
// na hora de aplicar (os filtros de periodo, a data do evento), em vez de
// acompanhar cada tecla.
export function valorDoCampo(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

// ---- campos de data ------------------------------------------------------
//
// O app nao usa mais <input type="date">. O navegador desenha esse campo na
// ordem do IDIOMA DELE, nao no da pagina: num Chrome em ingles ele vira
// mm/dd/yyyy, e o lang="pt-BR" do index.html nao muda isso. Quem digitava
// "21" pro dia 21 caia no campo do mes, que pula sozinho no primeiro digito
// (nao existe mes 20 a 29) - e a data saia com dia e mes trocados, sem aviso.
//
// No lugar dele vai um campo de texto comum, com mascara dd/mm/aaaa. Fica
// igual em todo navegador e em todo aparelho, e na ordem que o clube usa.

// Vai pondo as barras enquanto a pessoa digita: "2109" -> "21/09".
export function mascaraData(valor) {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return d.slice(0, 2) + '/' + d.slice(2);
  return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
}

// '21/09/2026' -> '2026-09-21', que e como a data viaja e e guardada.
// Devolve '' pro que nao for data de verdade - inclusive 31/02, que passa
// na conferencia de faixa mas nao existe no calendario.
export function dataISOdeBR(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || '').trim());
  if (!m) return '';
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (d.getFullYear() !== Number(ano) || d.getMonth() !== Number(mes) - 1 || d.getDate() !== Number(dia)) return '';
  return `${ano}-${mes}-${dia}`;
}

// Le um campo de data e devolve a data em ISO, ou '' se estiver em branco
// (que vale como "sem data" em todo lugar que usa isto).
//
// Se a pessoa escreveu algo que NAO e data - 31/02, mes 13, a data pela
// metade - avisa e devolve null, e quem chamou desiste de salvar. Sem isso
// o texto errado viraria '' e o evento seria salvo sem data nenhuma, calado.
// O campo nativo nao deixava isso acontecer; o campo de texto deixa, entao
// a conferencia que o navegador fazia passa a ser nossa.
export function dataDoCampoOuAvisar(id, rotulo) {
  const bruto = valorDoCampo(id).trim();
  if (!bruto) return '';
  const iso = dataISOdeBR(bruto);
  if (iso) return iso;
  alert(`${rotulo} não é uma data válida: "${bruto}".

Escreva no formato dia/mês/ano, como 21/09/2026.`);
  return null;
}

export function formatDataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Formato compacto para o selo do card na tela inicial - "09 SET" em vez de
// "09/09/2026", que não cabe bem num canto de card.
const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// '2026-09-19' -> 'Sábado'. Vazio se a data nao for valida.
//
// A data e montada por partes de proposito: new Date('2026-09-19') e lido
// como UTC e, no fuso do Brasil, voltaria o dia anterior.
// Hoje, no formato em que as datas viajam e sao comparadas ('2026-09-18').
// Sai do relogio do aparelho - e o unico que o navegador tem. Pra decisao
// que muda dado (encerrar evento sozinho, por exemplo) isso nao basta: ali
// quem tem que decidir e o servidor, que conhece o fuso da planilha.
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Quantos dias faltam ate a data: 0 = hoje, 1 = amanha, negativo = ja passou.
// Devolve null se nao for uma data. Conta por dia de calendario, nao por 24h
// - um evento amanha as 7h e "amanha", mesmo faltando 14 horas.
export function diasAte(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

export function diaDaSemana(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return DIAS_SEMANA[(d.getDay() + 6) % 7];   // getDay: 0 = domingo
}

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
  // Dentro do mesmo grau: nos graus de cargo (VI e V) vale a ordem do cargo;
  // nos demais, alfabetica. Quem esta num grau de cargo mas sem cargo
  // marcado vai pro fim do bloco dele, nao some nem se mistura.
  const ordemCargo = (m) => {
    const lista = cargosDoGrau(m.grau);
    if (!lista.length) return 0;
    const i = lista.indexOf(m.cargo);
    return i === -1 ? lista.length : i;
  };
  return [...membros].sort((a, b) =>
    indice(a) - indice(b) || ordemCargo(a) - ordemCargo(b) || a.nome.localeCompare(b.nome));
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
