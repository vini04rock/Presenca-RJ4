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

import { TIPOS_EVENTO_TABS_ORDEM, escoposEmOrdemDeExibicao } from '../nucleo/config.js';

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
