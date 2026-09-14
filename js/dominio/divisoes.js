// Agrupamento de membros por divisao, usado por varias telas.

import { divisoesSemRegional, escopoPorChave } from '../nucleo/config.js';
import { getMemberStatus } from '../nucleo/estado.js';
import { ordenarPorHierarquia } from '../nucleo/util.js';

// Junta uma lista qualquer (membros, estatisticas, nomes de rodada...) num
// objeto { 'Barra - RJ4': [...], 'Recreio - RJ4': [...] }. Quem nao tem
// divisao cai em "Sem divisão" em vez de sumir da conta.
function porDivisao(lista) {
  const mapa = {};
  lista.forEach(item => {
    const chave = item.divisao || 'Sem divisão';
    (mapa[chave] = mapa[chave] || []).push(item);
  });
  return mapa;
}

// Regional no topo, o resto em ordem alfabetica - mesma regra de
// escoposEmOrdemDeExibicao(), so que aqui os nomes vem direto dos itens
// (string), nao da lista ESCOPOS.
function comRegionalNoTopo(chaves) {
  const nomeRegional = escopoPorChave('regional').nome;
  return [...chaves].sort((a, b) => {
    if (a === nomeRegional) return -1;
    if (b === nomeRegional) return 1;
    return a.localeCompare(b);
  });
}

// Agrupa uma lista de membros da rodada por divisao, na mesma ordem de
// exibicao do resto do app (Regional fica de fora, insight e coisa da
// base) - so entram divisoes que tem pelo meno 1 membro na lista recebida.
export function agruparMembrosRodadaPorDivisao(membros) {
  return divisoesSemRegional()
    .map(e => ({ e, membros: membros.filter(m => m.divisao === e.nome) }))
    .filter(g => g.membros.length > 0);
}

// So usado em eventos regionais: agrupa os participantes pela divisao de
// cada um, com a hierarquia aplicada dentro de cada grupo. Funciona desde
// ja porque cada membro ja carrega a propria divisao - so vai mostrar mais
// de um grupo quando existir membro de outra divisao alem da Barra.
export function agruparPorDivisao(membros) {
  const grupos = porDivisao(membros);
  return comRegionalNoTopo(Object.keys(grupos)).map(divisao => ({
    divisao,
    membros: ordenarPorHierarquia(grupos[divisao])
  }));
}

// Contagem ao vivo de um grupo, lida do status atual do evento aberto
// (state.currentStatus) - atualiza sozinha a cada confirmacao, igual o
// resto da tela.
export function contagemGrupo(membros) {
  const c = { confirmado: 0, aguardando: 0, faltam: 0 };
  membros.forEach(m => {
    const st = getMemberStatus(m.id).status;
    if (st === 'confirmado') c.confirmado++;
    else if (st === 'familia' || st === 'trabalho' || st === 'infracional' || st === 'justificada') c.faltam++;
    else c.aguardando++;
  });
  return c;
}

// Agrupa uma lista de estatisticas de membro (precisa de nome/divisao/
// percentual) por divisao - mesma ordem de agruparPorDivisao, mantendo
// dentro de cada grupo a ordenacao por % (maior primeiro), que e o que da
// sentido a lista.
export function agruparStatsPorDivisao(lista) {
  const grupos = porDivisao(lista);
  return comRegionalNoTopo(Object.keys(grupos)).map(divisao => ({
    divisao,
    itens: [...grupos[divisao]].sort((a, b) => {
      if (a.percentual === null && b.percentual === null) return a.nome.localeCompare(b.nome);
      if (a.percentual === null) return 1;
      if (b.percentual === null) return -1;
      return b.percentual - a.percentual || a.nome.localeCompare(b.nome);
    })
  }));
}

// Mesma ideia de buildReportText, so que pra uma rodada de Insight (Sim/Nao
// por membro, sem motivo de falta - Insight nao tem isso). r.membros vem de
// listarInsightRodadas no Code.gs.
// Agrupa uma lista de membros (com nome/divisao ja resolvidos) por divisao,
// um cabecalho por divisao + os nomes ordenados dentro.
//
// ATENCAO: aqui a ordem das divisoes e alfabetica PURA, sem o Regional no
// topo - de proposito, diferente de agruparPorDivisao/agruparStatsPorDivisao.
// Isto aqui vira texto pra colar no WhatsApp, nao tela; se um dia alguem
// unificar com comRegionalNoTopo(), a ordem do relatorio enviado ao grupo
// muda. Por isso nao usa aquele ordenador.
export function agruparNomesPorDivisaoParaTexto(lista) {
  const grupos = porDivisao(lista);
  const linhas = [];
  Object.keys(grupos).sort((a, b) => a.localeCompare(b)).forEach(divisao => {
    linhas.push(divisao.toUpperCase() + ':');
    grupos[divisao]
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .forEach(m => linhas.push('- ' + m.nome + (m.grau ? ` (${m.grau})` : '')));
  });
  return linhas;
}
