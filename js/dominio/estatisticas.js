// Contas de presenca, percentuais, filtros de evento e grade do calendario.

import { normalizarNome } from './parser.js';
import { computeCounts, statusEfetivo } from './status.js';
import { TIPOS_EVENTO, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { dataCorteMeses } from '../nucleo/util.js';

// Grade de um mes, semana Segunda-a-Domingo: null nas celulas antes do dia 1
// ou depois do ultimo dia, pra completar sempre um numero de semanas
// inteiras (multiplo de 7).
export function construirGradeCalendario(ano, mes) {
  const primeiroDia = new Date(ano, mes, 1);
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const offsetInicio = (primeiroDia.getDay() + 6) % 7; // getDay(): 0=domingo - vira 0=segunda
  const celulas = [];
  for (let i = 0; i < offsetInicio; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDias; dia++) celulas.push(dia);
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

// Le linhas "DD/MM - Tipo" coladas na tela "Organizar" do Calendario e
// devolve um mapa 'yyyy-mm-dd' -> tipo. Reconhece o tipo do mesmo jeito que
// o parser de convocacao (parseConvocacaoTexto): bate por palavra (ignorando
// "e"/"de"), tolera acentos e maiuscula/minuscula, entao "PUb" ou
// "bate volta" batem igual. ano vem sempre de fora (o ano do calendario em
// exibicao) - o texto colado so tem dia/mes, nunca ano.
// O separador entre data e tipo e opcional - aceita "01/09 - Pub",
// "01/09 Pub" e ate "01/09Pub" (colado sem espaço nenhum, sem querer) -
// \s*[-–:]?\s* casa qualquer uma das tres formas, inclusive nenhum
// caractere entre a data e o tipo.
export function parseTextoOrganizarCalendario(texto, ano) {
  const marcacoes = {};
  const naoReconhecidas = [];
  String(texto || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(linha => {
    const m = linha.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*[-–:]?\s*(.+)$/);
    const dia = m && Number(m[1]);
    const mes = m && Number(m[2]);
    const valido = !!m && dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12;
    const tipoTexto = valido ? normalizarNome(m[3]) : '';
    const tipoAchado = valido && TIPOS_EVENTO.find(t => {
      const tokens = normalizarNome(t).split(' ').filter(tok => tok && tok !== 'e' && tok !== 'de');
      return tokens.every(tok => tipoTexto.includes(tok));
    });
    if (!valido || !tipoAchado) { naoReconhecidas.push(linha); return; }
    marcacoes[`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`] = tipoAchado;
  });
  return { marcacoes, naoReconhecidas };
}

// Regional enxerga tudo (o proprio + o que cada divisao marcou) - uma
// divisao enxerga so o proprio + o que o Regional marcou (vale pra todo
// mundo). Uma divisao nunca ve o que outra divisao marcou.
// Cada data devolvida vem com { tipo, origem } - origem e a chave de quem
// marcou (uma divisao, ou 'regional') - usado so pra rotular de qual
// divisao e o evento quando visto pelo calendario Regional (ver
// renderCalendario). Uma divisao nunca precisa dessa info pra si mesma.
// Eventos com tipo marcado (os que a tela "Organizar" cria/mostra) visiveis
// num escopo do calendario - Regional ve o proprio + o de todas as
// divisoes; uma divisao ve o proprio + o que o Regional marcou (vale pra
// todo mundo), nunca o que outra divisao marcou. Eventos sem tipo (ex: um
// evento antigo criado manualmente sem selecionar tipo) nao aparecem no
// calendario - continuam existindo normalmente na aba Eventos.
export function eventosCalendarioVisiveis(chaveEscopo) {
  if (chaveEscopo === 'regional') return state.events.filter(ev => ev.tipo);
  return state.events.filter(ev => ev.tipo && (ev.categoria === chaveEscopo || ev.categoria === 'regional'));
}

// Membros convidados quando um evento nasce da tela "Organizar" do
// Calendario - mesmo criterio de membrosElegiveisEvento() (Modo
// organizador): Regional convida todo mundo, uma divisao so os proprios.
export function membrosElegiveisCalendario(chaveEscopo) {
  if (chaveEscopo === 'regional') return state.roster;
  const nomeDivisao = escopoPorChave(chaveEscopo).nome;
  return state.roster.filter(m => m.divisao === nomeDivisao);
}

// Mapa 'yyyy-mm-dd' -> { tipo, origem, id } pra desenhar a grade do
// calendario (renderCalendario) - origem e a categoria do evento (uma
// divisao, ou 'regional'), usada so pro rotulo de origem.
export function marcacoesVisiveisCalendario(chaveEscopo) {
  const mapa = {};
  eventosCalendarioVisiveis(chaveEscopo).forEach(ev => {
    if (ev.data) mapa[ev.data] = { tipo: ev.tipo, origem: ev.categoria, id: ev.id };
  });
  return mapa;
}

// Mesma divisao (categoria) e mesma data ja tem outro evento gravado - sinal
// forte de convocacao colada duas vezes por engano (ou duplo clique em
// "Confirmar"). Nao bloqueia - so avisa, porque duas divisoes podem ter
// eventos legitimos no mesmo dia, ou o clube pode ter dois eventos no mesmo
// dia de fato. excluirId tira o proprio evento da conta ao corrigir uma
// convocacao ja enviada (ver iniciarCorrecaoConvocacao) - senao o evento
// sempre "bateria" contra ele mesmo.
export function eventosPossivelmenteDuplicados(data, categoria, excluirId) {
  return state.events.filter(e => e.data === data && e.categoria === categoria && e.id !== excluirId);
}

// Todos os eventos da divisao/Regional escolhida na tela de Relatorios -
// tanto os criados colando convocacao quanto os que ja existiam antes
// (criados pelo Modo organizador), ja que sao o mesmo tipo de registro. No
// Regional (unica chave-mestra), respeita o filtro de divisao escolhido no
// topo do painel: 'todas' junta tudo (inclusive convocacoes coladas em nome
// de uma divisao especifica, que "sumiam" do resumo Regional antes disso
// existir), uma chave especifica mostra so os eventos daquela categoria -
// 'regional' inclusive, pros eventos que sao da Regional mesmo.
export function eventosDoRelatorioEscopo() {
  return state.events
    .filter(e => {
      const bateDivisao = state.adminEscopo !== 'regional'
        ? e.categoria === state.adminEscopo
        : (state.relatorioFiltroDivisao === 'todas' || e.categoria === state.relatorioFiltroDivisao);
      if (!bateDivisao) return false;
      // Comparacao de texto funciona porque a data e sempre ISO (yyyy-mm-dd) -
      // ordem alfabetica bate com ordem cronologica. Evento sem data marcada
      // fica de fora assim que qualquer um dos dois limites for escolhido
      // (nao da pra saber se ele cai dentro do intervalo ou nao).
      if (state.relatorioFiltroDataInicio && (!e.data || e.data < state.relatorioFiltroDataInicio)) return false;
      if (state.relatorioFiltroDataFim && (!e.data || e.data > state.relatorioFiltroDataFim)) return false;
      return true;
    })
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
}

// Roster visivel no painel de Relatorios, respeitando o mesmo filtro de
// divisao de eventosDoRelatorioEscopo() - usado pelas abas fixas de tipo
// ("% de cada integrante em X"), onde faz sentido restringir a lista de
// nomes tambem, nao so os eventos.
function membrosVisiveisRelatorio() {
  if (state.adminEscopo !== 'regional') {
    const nomeEscopo = escopoPorChave(state.adminEscopo).nome;
    return state.roster.filter(m => m.divisao === nomeEscopo);
  }
  if (state.relatorioFiltroDivisao === 'todas') return state.roster;
  const nomeFiltro = escopoPorChave(state.relatorioFiltroDivisao).nome;
  return state.roster.filter(m => m.divisao === nomeFiltro);
}

// Quem mais acumulou falta infracional num periodo - separado do "% de cada
// integrante" (que mistura confirmado/aguardando/faltas justificadas na
// mesma media) porque infracional e o dado que interessa pra acao
// disciplinar, e fica diluido demais dentro de uma % geral.
export function rankingFaltasInfracionais(encerrados, meses) {
  const corte = dataCorteMeses(meses);
  const porMembro = {};
  encerrados.forEach(ev => {
    if (!ev.data || ev.data < corte) return;
    const statusData = state.reportData[ev.id];
    if (!statusData) return;
    ev.memberIds.forEach(mid => {
      const s = statusEfetivo(ev, (statusData[mid] && statusData[mid].status) || 'aguardando');
      if (s === 'infracional') porMembro[mid] = (porMembro[mid] || 0) + 1;
    });
  });
  return Object.keys(porMembro)
    .map(id => {
      const m = state.roster.find(r => r.id === id);
      return { id, nome: m ? m.nome : id, divisao: m ? m.divisao : '', total: porMembro[id] };
    })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

// Resumo de um grafico (chave = 'total' ou um TIPOS_EVENTO) numa janela de
// meses: soma por status (pro donut), % geral e a lista de eventos que
// entraram na conta (pro drill-down em "Ver eventos").
export function resumoDonutPeriodo(encerrados, chave, meses) {
  const corte = dataCorteMeses(meses);
  const doGrupo = encerrados.filter(ev => chave === 'total' || ev.tipo === chave);
  let somaConfirmados = 0, somaConvidados = 0, eventosNoPeriodo = 0, faltaCarregar = false;
  const statusPeriodo = { confirmado: 0, aguardando: 0, justificada: 0, infracional: 0 };
  const itens = [];
  doGrupo.forEach(ev => {
    if (!ev.data || ev.data < corte) return;
    if (!state.reportData[ev.id]) { faltaCarregar = true; return; }
    const c = computeCounts(ev);
    const total = ev.memberIds.length;
    somaConfirmados += c.confirmado;
    somaConvidados += total;
    eventosNoPeriodo++;
    statusPeriodo.confirmado += c.confirmado;
    statusPeriodo.aguardando += c.aguardando;
    statusPeriodo.justificada += c.familia + c.trabalho + c.justificada;
    statusPeriodo.infracional += c.infracional;
    itens.push({ ev, confirmado: c.confirmado, total, pct: total ? Math.round((c.confirmado / total) * 100) : null });
  });
  itens.sort((a, b) => (b.ev.data || '').localeCompare(a.ev.data || ''));
  return {
    pct: somaConvidados ? Math.round((somaConfirmados / somaConvidados) * 100) : null,
    statusPeriodo, somaConfirmados, somaConvidados, eventosNoPeriodo, itens, faltaCarregar
  };
}

// Conta convites/confirmacoes por membro a partir de uma lista de eventos ja
// filtrada (por tipo, por periodo, o que for) - motor comum de
// estatisticasMembrosPorTipo e estatisticasMembrosPorPeriodo, pra nao
// duplicar o mesmo loop com filtro diferente por fora.
function contarConfirmacoesPorMembro(eventos) {
  const contagem = {};
  eventos.forEach(ev => {
    const presencas = state.reportData[ev.id];
    if (!presencas) return;
    ev.memberIds.forEach(mid => {
      if (!contagem[mid]) contagem[mid] = { convites: 0, confirmacoes: 0 };
      contagem[mid].convites++;
      if (presencas[mid] && presencas[mid].status === 'confirmado') contagem[mid].confirmacoes++;
    });
  });
  return contagem;
}

function estatisticasDeContagem(membros, contagem) {
  return membros.map(m => {
    const c = contagem[m.id] || { convites: 0, confirmacoes: 0 };
    return {
      id: m.id, nome: m.nome, grau: m.grau, divisao: m.divisao, funcoes: m.funcoes,
      convites: c.convites, confirmacoes: c.confirmacoes,
      percentual: c.convites ? Math.round((c.confirmacoes / c.convites) * 100) : null
    };
  });
}

// % de cada integrante calculado so a partir dos eventos ENCERRADOS de um
// tipo especifico. Convites conta so eventos daquele tipo em que o membro
// foi convidado (tem linha em Presencas); confirmacoes so as que tem status
// "confirmado". Roster/eventos respeitam o filtro de divisao do painel
// (membrosVisiveisRelatorio/eventosDoRelatorioEscopo).
export function estatisticasMembrosPorTipo(tipo) {
  const eventosTipo = eventosDoRelatorioEscopo().filter(e => e.status === 'encerrado' && e.tipo === tipo);
  return estatisticasDeContagem(membrosVisiveisRelatorio(), contarConfirmacoesPorMembro(eventosTipo));
}

// % de cada integrante dentro de uma janela de tempo (1/3/6/12 meses) - usa
// o mesmo corte de data do card "Presença total" (dataCorteMeses,
// resumoDonutPeriodo), pra nao mostrar uma % "desde sempre" embaixo de
// donuts que ja tem um periodo escolhido. Calculado no navegador a partir de
// state.reportData (ja carregado pra aba Resumo Relatorio inteira), sem
// round-trip novo ao servidor.
export function estatisticasMembrosPorPeriodo(meses) {
  const corte = dataCorteMeses(meses);
  const eventosNoPeriodo = eventosDoRelatorioEscopo().filter(e => e.status === 'encerrado' && e.data && e.data >= corte);
  return estatisticasDeContagem(membrosVisiveisRelatorio(), contarConfirmacoesPorMembro(eventosNoPeriodo));
}

// Historico evento a evento de um membro (mais recente primeiro) - base da
// "Ficha do membro" (renderFichaMembro), aberta ao tocar num nome em
// qualquer lista de "% de cada integrante". So eventos encerrados em que
// esse membro foi convidado (tem linha em Presencas), dentro do mesmo
// filtro de divisao do painel (eventosDoRelatorioEscopo).
export function historicoMembro(membroId) {
  const eventosOrdemCronologica = eventosDoRelatorioEscopo()
    .filter(ev => ev.status === 'encerrado' && ev.memberIds.includes(membroId))
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.criadoEm || '').localeCompare(b.criadoEm || ''));

  let convites = 0, confirmacoes = 0, justificadas = 0, infracionais = 0;
  const itens = eventosOrdemCronologica.map(ev => {
    const presencas = state.reportData[ev.id];
    const statusBruto = presencas && presencas[membroId] ? presencas[membroId].status : null;
    // Evento encerrado sem resposta vira falta infracional (ver statusEfetivo) -
    // aplicado aqui tambem, senao a ficha mostraria "Aguardando" pra eventos
    // ja fechados de antes dessa regra existir.
    const status = presencas ? statusEfetivo(ev, statusBruto || 'aguardando') : null;
    if (presencas) {
      convites++;
      if (status === 'confirmado') confirmacoes++;
      else if (status === 'familia' || status === 'trabalho' || status === 'justificada') justificadas++;
      else if (status === 'infracional') infracionais++;
    }
    return {
      ev, status,
      // % acumulada ate esse evento (inclusive), na ordem cronologica - da
      // o "sparkline" pessoal (como a media do membro foi evoluindo ao
      // longo do tempo), reaproveitando renderSparklineTendencia que ja
      // existe pro Rank Total. Fica null enquanto o evento ainda nao
      // carregou (ver faltaCarregar em renderFichaMembro).
      pctAcumulado: presencas ? Math.round((confirmacoes / convites) * 100) : null
    };
  });
  return { itens: itens.slice().reverse(), convites, confirmacoes, justificadas, infracionais };
}

export function eventosDoEscopo() {
  return state.events.filter(ev => (ev.categoria || 'barra') === state.adminEscopo);
}

// Evento regional convida gente de todas as divisoes (Regional incluso);
// evento de uma divisao especifica so pode convidar os proprios membros.
export function membrosElegiveisEvento() {
  return state.adminEscopo === 'regional' ? state.roster : membrosDoEscopo();
}

// So os membros da divisao (ou Regional) que o organizador esta gerenciando
// agora - mesma logica de eventosDoEscopo(), pro organizador de uma divisao
// nao ver nem poder mexer nos membros de outra.
export function membrosDoEscopo() {
  const nome = escopoPorChave(state.adminEscopo).nome;
  return state.roster.filter(m => m.divisao === nome);
}

// Recalcula o relatorio de Insights usando so as rodadas de um periodo.
//
// O servidor devolve as estatisticas ja somadas de TODAS as rodadas
// (insightEstatisticas), entao nao da pra recortar um periodo a partir
// delas. O que da e refazer a conta a partir do historico (insightRodadas),
// que vem com a lista de quem fez e quem nao fez em cada rodada - as mesmas
// linhas que o servidor somou, so que abertas. As formulas aqui sao as
// mesmas de calcularEstatisticasInsights no Code.gs, com o numero de
// rodadas do periodo no lugar do total.
//
// ATENCAO: o historico vem limitado as ultimas 30 rodadas (ver
// listarInsightRodadas). Um periodo que comece antes disso so enxerga o que
// coube nessas 30 - por isso a tela avisa quantas rodadas entraram na conta.
//
// Identidade do membro (grau, funcoes) continua vindo de stats.membros: o
// historico so traz id/nome/divisao, e stats.membros ja e a lista de quem
// esta elegivel (sem o Regional e sem quem foi removido do insight).
export function estatisticasInsightsPorPeriodo(stats, historico, inicio, fim) {
  const rodadas = (historico || []).filter(r =>
    (!inicio || r.data >= inicio) && (!fim || r.data <= fim));
  const num = rodadas.length;

  const porMembro = {};
  const porDivisao = {};
  rodadas.forEach(r => (r.membros || []).forEach(m => {
    if (!porMembro[m.id]) porMembro[m.id] = { convites: 0, confirmacoes: 0 };
    porMembro[m.id].convites++;
    if (m.fez) porMembro[m.id].confirmacoes++;
    if (!porDivisao[m.divisao]) porDivisao[m.divisao] = { total: 0, sim: 0 };
    porDivisao[m.divisao].total++;
    if (m.fez) porDivisao[m.divisao].sim++;
  }));

  const membros = stats.membros.map(m => {
    const c = porMembro[m.id] || { convites: 0, confirmacoes: 0 };
    return {
      ...m,
      rodadas: c.convites,
      confirmacoes: c.confirmacoes,
      percentual: c.convites ? Math.round((c.confirmacoes / c.convites) * 100) : null,
    };
  });

  const divisoes = stats.divisoes.map(dv => {
    const c = porDivisao[dv.nome] || { total: 0, sim: 0 };
    const cadastrados = membros.filter(m => m.divisao === dv.nome).length;
    return {
      ...dv,
      fez: c.sim,
      marcacoes: c.total,
      mediaPorRodada: num ? Math.round((c.sim / num) * 10) / 10 : 0,
      mediaTotalPorRodada: num ? Math.round((c.total / num) * 10) / 10 : cadastrados,
      percentual: c.total ? Math.round((c.sim / c.total) * 100) : null,
    };
  });

  return { stats: { ...stats, rodadas: num, membros, divisoes }, rodadas };
}

// Os numeros do grafico de uma divisao no Rank de Insights: as fatias
// (fez/naoFez, somando todas as rodadas) e a media por rodada, sem
// arredondar - quem desenha e que formata.
//
// As fatias vem das somas exatas, nunca das medias: arredondada pra inteiro,
// a media de uma divisao com 3 "Sim" em 7 rodadas (0,43) virava 0, e o
// grafico saia todo vermelho ao lado de um "11%" que estava certo.
//
// Um Code.gs publicado antes dessa correcao nao manda fez/marcacoes. Ai as
// somas sao refeitas a partir do que ele manda (media de marcacoes por
// rodada x rodadas, e o percentual por cima disso) - chega no mesmo numero,
// porque as marcacoes por rodada sao sempre inteiras. Pode sair quando o
// Code.gs novo estiver no ar.
export function numerosInsightDivisao(item, rodadas) {
  if (!item) return { fez: 0, naoFez: 0, mediaFez: 0, mediaTotal: 0 };
  let fez = item.fez;
  let marcacoes = item.marcacoes;
  if (fez === undefined || marcacoes === undefined) {
    marcacoes = Math.round((item.mediaTotalPorRodada || 0) * rodadas);
    fez = Math.round(((item.percentual || 0) / 100) * marcacoes);
  }
  return {
    fez,
    naoFez: Math.max(0, marcacoes - fez),
    mediaFez: rodadas ? fez / rodadas : 0,
    mediaTotal: rodadas ? marcacoes / rodadas : (item.mediaTotalPorRodada || 0),
  };
}
