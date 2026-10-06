// As contas do "Relatorio individual": o que o Code.gs devolve de um
// integrante (relatorioIndividual) vira os blocos que a tela desenha.
//
// O Code.gs manda tudo cru e o recorte de periodo acontece aqui - trocar as
// datas nao precisa de outra ida a planilha.
//
// A regra que atravessa o arquivo inteiro e a de ELEGIVEL: so aparece o que
// o integrante podia ter feito. Um tipo de evento so ganha bloco se ele foi
// convocado pra pelo menos um evento encerrado daquele tipo no periodo; o
// Insight so aparece se ele participa do Insight. Um "0% em Bate e Volta"
// pra quem nunca foi chamado pra Bate e Volta nao e um numero, e uma
// acusacao.

import { TIPOS_EVENTO_TABS_ORDEM, emojiTipoEvento, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { formatDataBR } from '../nucleo/util.js';

// Mesma regra dos Relatorios (eventosDoRelatorioEscopo): com um limite
// escolhido, o que nao tem data fica de fora - nao da pra saber se cai
// dentro do intervalo.
function noPeriodo(data, inicio, fim) {
  if (inicio && (!data || data < inicio)) return false;
  if (fim && (!data || data > fim)) return false;
  return true;
}

// Familia, trabalho e justificada sao todas falta justificada - o mesmo
// agrupamento do donut dos Relatorios e do texto copiado.
function resumo(eventos) {
  const r = { convites: eventos.length, confirmado: 0, justificada: 0, infracional: 0 };
  eventos.forEach(ev => {
    if (ev.status === 'confirmado') r.confirmado++;
    else if (ev.status === 'infracional') r.infracional++;
    else r.justificada++;
  });
  r.percentual = r.convites ? Math.round((r.confirmado / r.convites) * 100) : null;
  return r;
}

// A % acumulada evento a evento, na ordem do tempo - a "linha de evolucao"
// (renderSparklineTendencia). Acumulada, e nao evento a evento, porque um
// evento sozinho so vale 0 ou 100 e a linha viraria um serrote.
function evolucao(itens, conta) {
  let feitos = 0;
  return itens.map((x, i) => {
    if (conta(x)) feitos++;
    return { ev: { data: x.data, nome: x.nome }, pct: Math.round((feitos / (i + 1)) * 100) };
  });
}

// Um bloco de presenca (a divisao, ou o Regional): o geral, a evolucao e um
// resumo por tipo - so dos tipos em que ele foi convocado. Evento sem tipo
// marcado conta no geral e nao ganha bloco proprio. null quando nao ha
// evento nenhum: o bloco inteiro some.
function blocoPresenca(eventos) {
  if (!eventos.length) return null;
  return {
    geral: resumo(eventos),
    evolucao: evolucao(eventos, ev => ev.status === 'confirmado'),
    porTipo: TIPOS_EVENTO_TABS_ORDEM
      .map(tipo => ({ tipo, resumo: resumo(eventos.filter(ev => ev.tipo === tipo)) }))
      .filter(t => t.resumo.convites > 0),
  };
}

function chaveDaDivisao(nomeDivisao) {
  const e = escoposEmOrdemDeExibicao().find(x => x.nome === nomeDivisao);
  return e ? e.chave : null;
}

// dados: a resposta do Code.gs ({ membro, eventos, insight }).
//
// Os eventos se separam em dois blocos, e nao se somam: a % pessoal de um
// integrante so conta a propria divisao (a mesma regra de Membros >
// Presencas e do Rank), e o Regional aparece a parte. Pra quem e do
// Regional, os eventos do Regional SAO os da divisao dele - ai o bloco a
// parte nao existe.
//
// Evento de uma terceira divisao (alguem que mudou de divisao, por exemplo)
// nao entra em bloco nenhum, so no historico - ele nao pertence a nenhuma
// das duas contas.
export function montarRelatorioIndividual(dados, inicio, fim) {
  const chave = chaveDaDivisao(dados.membro.divisao);
  const eventos = (dados.eventos || [])
    .filter(ev => noPeriodo(ev.data, inicio, fim))
    .slice()
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  const origem = ev => ev.categoria === chave ? 'divisao' : (ev.categoria === 'regional' ? 'regional' : 'outra');

  const insight = dados.insight || {};
  let blocoInsight = null;
  if (insight.elegivel) {
    const rodadas = (insight.rodadas || [])
      .filter(r => noPeriodo(r.data, inicio, fim))
      .slice()
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const fez = rodadas.filter(r => r.fez).length;
    blocoInsight = {
      rodadas: rodadas.length,
      fez,
      naoFez: rodadas.length - fez,
      percentual: rodadas.length ? Math.round((fez / rodadas.length) * 100) : null,
      evolucao: evolucao(rodadas.map(r => ({ ...r, nome: 'Rodada' })), r => r.fez),
    };
  }

  return {
    membro: dados.membro,
    divisao: blocoPresenca(eventos.filter(ev => origem(ev) === 'divisao')),
    regional: chave === 'regional' ? null : blocoPresenca(eventos.filter(ev => origem(ev) === 'regional')),
    insight: blocoInsight,
    // Mais recente primeiro: e o que se procura primeiro numa lista longa.
    historico: eventos.slice().reverse().map(ev => ({ ...ev, origem: origem(ev) })),
  };
}

// "Desde sempre", "De 01/08/2026 a 31/08/2026"... - vai no cabecalho da
// tela, do PDF e do texto copiado, pra ninguem ler um numero sem saber de
// que periodo ele e.
export function textoDoPeriodo(inicio, fim) {
  if (!inicio && !fim) return 'Desde sempre';
  if (inicio && fim) return `De ${formatDataBR(inicio)} a ${formatDataBR(fim)}`;
  return inicio ? `A partir de ${formatDataBR(inicio)}` : `Até ${formatDataBR(fim)}`;
}

const pctTexto = (p) => p === null ? '—' : p + '%';
const nEventosTexto = (n) => `${n} ${n === 1 ? 'evento' : 'eventos'}`;

function linhasPresenca(titulo, bloco) {
  const g = bloco.geral;
  return [
    '',
    titulo,
    `📊 ${pctTexto(g.percentual)} (${g.confirmado} de ${nEventosTexto(g.convites)})`,
    `✅ Confirmou: ${g.confirmado}`,
    `❌ Falta justificada: ${g.justificada}`,
    `⭕ Falta não justificada: ${g.infracional}`,
    ...(bloco.porTipo.length ? ['', 'Por tipo:', ...bloco.porTipo.map(t =>
      `${emojiTipoEvento(t.tipo)} ${t.tipo}: ${pctTexto(t.resumo.percentual)} (${t.resumo.confirmado} de ${t.resumo.convites})`)] : []),
  ];
}

// O texto pra colar no WhatsApp. `r` e o que montarRelatorioIndividual
// devolve - os mesmos numeros da tela, entao os dois nunca discordam.
//
// Do historico so vao as faltas nao justificadas (decisao do clube): e o
// que se cobra, e o historico inteiro viraria uma parede de texto no grupo.
// Mais recente primeiro, como na tela.
export function textoRelatorioIndividual(r, inicio, fim) {
  const m = r.membro;
  const faltas = r.historico.filter(ev => ev.status === 'infracional');
  const linhas = [
    '📄 RELATÓRIO INDIVIDUAL',
    m.nome + (m.grau ? ` (${m.grau})` : ''),
    [m.cargo, m.divisao].filter(Boolean).join(' · '),
    '🗓️ ' + textoDoPeriodo(inicio, fim),
  ].filter(Boolean);
  if (r.divisao) linhas.push(...linhasPresenca('🏁 PRESENÇA · ' + String(m.divisao || '').toUpperCase(), r.divisao));
  if (r.regional) linhas.push(...linhasPresenca('🏛️ EVENTOS DO REGIONAL', r.regional));
  if (r.insight) {
    linhas.push('', '💡 INSIGHT', r.insight.rodadas
      ? `📊 ${pctTexto(r.insight.percentual)} (fez ${r.insight.fez} de ${r.insight.rodadas} ${r.insight.rodadas === 1 ? 'rodada' : 'rodadas'})`
      : 'Nenhuma rodada nesse período.');
  }
  if (!r.divisao && !r.regional && !r.insight) {
    linhas.push('', 'Nenhum evento encerrado nem rodada de Insight nesse período.');
  }
  linhas.push('', `⭕ FALTAS NÃO JUSTIFICADAS (${faltas.length})`);
  linhas.push(...(faltas.length
    ? faltas.map(ev => '- ' + [ev.data ? formatDataBR(ev.data) : 'sem data', ev.nome, ev.origem === 'regional' ? 'Regional' : '']
        .filter(Boolean).join(' · '))
    : ['- Nenhuma']));
  return linhas.join('\n');
}
