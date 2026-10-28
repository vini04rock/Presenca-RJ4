// As Funcoes especiais (28/10/2026): Batedores e Caveiras, cada um com os
// proprios eventos, so no Regional. As contas daqui so olham os eventos que
// vem da planilha (lerFuncoesEspeciais, no Code.gs) - nunca state.events -,
// e e isso que mantem os numeros delas fora dos do clube, e os do clube
// fora delas.
//
// Um evento: { id, nome, data, horario, endereco, status,
//   presencas: [{ membroId, nome, grau, divisao, status }] }.

import { MESES_ABREV, STATUS, escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { dataCorteMeses, formatDataBR, hojeISO, ordenarPorHierarquia } from '../nucleo/util.js';
import { estaAfastado, movimentosDoPeriodo, rotuloPeriodoMovimentos } from './movimentos.js';

export const FUNCOES_ESPECIAIS = [
  { chave: 'batedor', nome: 'Batedores', singular: 'Batedor', selo: '🛡️' },
  // `tambem`: outras funcoes do cadastro que entram nos eventos desta. O
  // Caveira Suplente e chamado pros eventos de Caveira (o Code.gs tem a
  // mesma lista, em FUNCOES_QUE_ENTRAM).
  { chave: 'caveira', nome: 'Caveiras', singular: 'Caveira', selo: '💀', tambem: ['caveira_suplente'] },
];
export function dadosDaFuncao(chave) { return FUNCOES_ESPECIAIS.find(f => f.chave === chave) || FUNCOES_ESPECIAIS[0]; }

// Os status que o organizador marca: os da confirmacao, sem o Aguardando
// (ele e o "ainda nao marquei", e volta sozinho no Reabrir).
export const STATUS_MARCAVEIS = ['confirmado', 'familia', 'trabalho', 'justificada', 'infracional'];

// "Barra - RJ4" -> "Barra"; "Regional RJ4" -> "Regional".
export function divisaoCurta(nome) { return String(nome || '').replace(/\s*-?\s*RJ4$/, '') || 'Sem divisão'; }

// Quem entra num evento novo: so quem tem a funcao no cadastro (a regra do
// clube - evento de Batedor so tem Batedor; o de Caveira, Caveira e
// Caveira Suplente), e nao esta afastado.
export function integrantesDaFuncao(roster, chave) {
  const f = FUNCOES_ESPECIAIS.find(x => x.chave === chave);
  const aceitas = [chave, ...((f && f.tambem) || [])];
  const lista = (roster || []).filter(m => (m.funcoes || []).some(c => aceitas.includes(c)) && !estaAfastado(m));
  return porDivisaoNaOrdemOficial(lista).flatMap(g => g.itens);
}

// Os grupos por divisao, na ordem oficial do clube (a da chamada), e a
// hierarquia dentro de cada um. Divisao fora da lista vai pro fim.
export function porDivisaoNaOrdemOficial(itens) {
  const ordem = escoposNaOrdemOficial().map(e => e.nome);
  const grupos = ordem
    .map(nome => ({ divisao: nome, itens: ordenarPorHierarquia(itens.filter(x => x.divisao === nome)) }))
    .filter(g => g.itens.length);
  const fora = itens.filter(x => !ordem.includes(x.divisao));
  if (fora.length) grupos.push({ divisao: 'Sem divisão', itens: ordenarPorHierarquia(fora) });
  return grupos;
}

// A mesma regra do resto do app (statusEfetivo): no evento encerrado, quem
// ficou Aguardando e falta nao justificada. `rascunho` = o que foi marcado
// na tela e ainda nao foi salvo.
export function statusNoEvento(ev, p, rascunho) {
  const st = (rascunho && rascunho[p.membroId]) || p.status || 'aguardando';
  return ev.status === 'encerrado' && st === 'aguardando' ? 'infracional' : st;
}

export function contagemEvento(ev, rascunho) {
  const c = { confirmado: 0, familia: 0, trabalho: 0, justificada: 0, infracional: 0, aguardando: 0 };
  (ev.presencas || []).forEach(p => { c[statusNoEvento(ev, p, rascunho)]++; });
  const total = (ev.presencas || []).length;
  return { ...c, total, justificadas: c.familia + c.trabalho + c.justificada, pct: total ? Math.round(c.confirmado / total * 100) : null };
}

// Os nomes de cada status, por divisao na ordem oficial: "Costa (Barra)".
function nomesPorStatus(ev) {
  const g = { confirmado: [], familia: [], trabalho: [], justificada: [], infracional: [], aguardando: [] };
  porDivisaoNaOrdemOficial(ev.presencas || []).forEach(grupo => grupo.itens.forEach(p => {
    g[statusNoEvento(ev, p)].push(`${p.nome} (${divisaoCurta(p.divisao)})`);
  }));
  return g;
}

function linhaQuando(ev) {
  return '🗓️ ' + [ev.data ? formatDataBR(ev.data) : 'Sem data', ev.horario].filter(Boolean).join(' · ');
}

// O relatorio de um evento pro WhatsApp, no molde do relatorio de presenca
// dos eventos do clube (buildReportText). Aberto sai como parcial: quem
// ainda nao foi marcado aparece como "sem marcação", nunca como falta.
export function textoEventoFuncao(ev, chave) {
  const f = dadosDaFuncao(chave);
  const g = nomesPorStatus(ev);
  const c = contagemEvento(ev);
  const parcial = ev.status !== 'encerrado';
  const naoPuderam = [
    ...g.familia.map(n => `${n} - Família`),
    ...g.trabalho.map(n => `${n} - Trabalho`),
    ...g.justificada.map(n => `${n} - Justificada`),
  ];
  const lista = (nomes, vazio) => (nomes.length ? nomes.map(n => '- ' + n) : ['- ' + vazio]);
  const linhas = [
    `${f.selo} *${f.nome.toUpperCase()} — ${parcial ? 'RELATÓRIO PARCIAL' : 'RELATÓRIO DE PRESENÇA'}*`,
    ev.nome,
    linhaQuando(ev),
  ];
  if (ev.endereco) linhas.push('📍 ' + ev.endereco);
  linhas.push('', `📊 ${c.pct === null ? 0 : c.pct}% DE PRESENÇA (${c.confirmado} de ${c.total})`, '');
  linhas.push(`✅ PRESENTES (${g.confirmado.length})`, ...lista(g.confirmado, 'Ninguém'), '');
  linhas.push(`❌ NÃO PUDERAM IR (${naoPuderam.length})`, ...lista(naoPuderam, 'Ninguém'), '');
  if (parcial) {
    linhas.push(`⚠️ SEM MARCAÇÃO AINDA (${g.aguardando.length})`, ...lista(g.aguardando, 'Todos marcados'));
    if (g.infracional.length) linhas.push('', `⭕ FALTA NÃO JUSTIFICADA (${g.infracional.length})`, ...lista(g.infracional, ''));
  } else {
    linhas.push(`⭕ FALTA NÃO JUSTIFICADA (${g.infracional.length})`, ...lista(g.infracional, 'Nenhuma'));
  }
  return linhas.join('\n');
}

// Os eventos encerrados do periodo, do mais recente pro mais antigo. O
// periodo e o mesmo da Entrada/Saida: 0 = tudo, N = ultimos N meses, ou
// { de, ate }. So os encerrados contam, como no % do clube: um evento
// aberto ainda pode mudar.
export function encerradosDoPeriodo(eventos, periodo) {
  return movimentosDoPeriodo((eventos || []).filter(e => e.status === 'encerrado'), periodo);
}

const pctDe = (sim, total) => (total ? Math.round(sim / total * 100) : null);

// As estatisticas de uma funcao no periodo: o geral, cada evento, cada
// integrante e cada mes. Nome, grau e divisao de um integrante sao os do
// evento mais recente dele (o retrato gravado na planilha).
export function estatisticasFuncao(eventos, periodo) {
  const evs = encerradosDoPeriodo(eventos, periodo);
  const geral = { convites: 0, confirmados: 0, justificadas: 0, naoJustificadas: 0 };
  const pessoas = {};
  const meses = {};
  evs.forEach(ev => {
    const mes = (ev.data || '').slice(0, 7);
    if (mes) meses[mes] = meses[mes] || { mes, eventos: 0, convites: 0, confirmados: 0 };
    if (mes) meses[mes].eventos++;
    (ev.presencas || []).forEach(p => {
      const st = statusNoEvento(ev, p);
      const veio = st === 'confirmado';
      const nj = st === 'infracional';
      const pessoa = pessoas[p.membroId] = pessoas[p.membroId] ||
        { membroId: p.membroId, nome: p.nome, grau: p.grau, divisao: p.divisao, eventos: 0, confirmados: 0, justificadas: 0, naoJustificadas: 0 };
      [geral, pessoa].forEach(x => {
        if (veio) x.confirmados++;
        else if (nj) x.naoJustificadas++;
        else x.justificadas++;
      });
      geral.convites++; pessoa.eventos++;
      if (mes) { meses[mes].convites++; if (veio) meses[mes].confirmados++; }
    });
  });
  // Cada evento com a propria contagem, do mais recente pro mais antigo
  // (sem data no fim). E o evento inteiro: a tela abre o relatorio dele.
  const porEvento = evs.slice()
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    .map(ev => ({ ev, c: contagemEvento(ev) }));
  const porIntegrante = Object.values(pessoas)
    .map(x => ({ ...x, pct: pctDe(x.confirmados, x.eventos) }))
    .sort((a, b) => b.pct - a.pct || b.confirmados - a.confirmados || a.nome.localeCompare(b.nome));
  const porMes = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({ ...m, pct: pctDe(m.confirmados, m.convites) }));
  return { eventos: evs.length, geral: { ...geral, pct: pctDe(geral.confirmados, geral.convites) }, porEvento, porIntegrante, porMes };
}

// "20/10 · Escolta Serra" - a linha de um evento nas listas das estatisticas.
export function rotuloEventoCurto(ev) {
  return (ev.data ? formatDataBR(ev.data).slice(0, 5) + ' · ' : '') + ev.nome;
}

function cabecalhoEstatisticas(f, titulo, r, periodo) {
  return [
    `${f.selo} *${f.nome.toUpperCase()} — ${titulo}*`,
    rotuloPeriodoMovimentos(periodo),
    `📅 ${r.eventos} ${r.eventos === 1 ? 'evento encerrado' : 'eventos encerrados'}`,
  ];
}

// As estatisticas gerais pro WhatsApp: o % do periodo e cada evento. Os
// integrantes (e quem tem falta nao justificada) ficam no texto das
// individuais.
export function textoEstatisticasFuncao(r, chave, periodo) {
  const g = r.geral;
  const linhas = cabecalhoEstatisticas(dadosDaFuncao(chave), 'ESTATÍSTICAS', r, periodo);
  if (!r.eventos) return linhas.concat('', 'Nenhum evento encerrado no período.').join('\n');
  linhas.push(
    '',
    `📊 *${g.pct}% DE PRESENÇA* (${g.confirmados} de ${g.convites})`,
    `${STATUS.confirmado.emoji} ${g.confirmados} presenças · ${STATUS.justificada.emoji} ${g.justificadas} justificadas · ${STATUS.infracional.emoji} ${g.naoJustificadas} não justificadas`,
    '',
    '*POR EVENTO*',
    ...r.porEvento.map(({ ev, c }) => `- ${rotuloEventoCurto(ev)}: ${c.pct === null ? 0 : c.pct}% (${c.confirmado} de ${c.total})`),
  );
  return linhas.join('\n');
}

// As estatisticas de cada integrante pro WhatsApp. Leva os nomes de quem
// tem falta nao justificada - o texto e o que serve pra cobrar (a imagem
// nao leva).
export function textoIndividuaisFuncao(r, chave, periodo) {
  const f = dadosDaFuncao(chave);
  const linhas = cabecalhoEstatisticas(f, 'ESTATÍSTICAS INDIVIDUAIS', r, periodo);
  if (!r.eventos) return linhas.concat('', 'Nenhum evento encerrado no período.').join('\n');
  linhas.push(
    '',
    `*POR ${f.singular.toUpperCase()}*`,
    ...r.porIntegrante.map((p, i) => `${i + 1}. ${p.nome} (${divisaoCurta(p.divisao)}) — ${p.pct}% (${p.confirmados} de ${p.eventos})`),
  );
  const faltosos = r.porIntegrante.filter(p => p.naoJustificadas > 0)
    .sort((a, b) => b.naoJustificadas - a.naoJustificadas || a.nome.localeCompare(b.nome));
  if (faltosos.length) {
    linhas.push('', `${STATUS.infracional.emoji} *FALTAS NÃO JUSTIFICADAS*`,
      ...faltosos.map(p => `- ${p.nome} (${divisaoCurta(p.divisao)}): ${p.naoJustificadas}`));
  }
  return linhas.join('\n');
}

// ---------- o Relatorio Caveiras ----------
// O relatorio dos Caveiras no formato que o clube ja usava no grupo (28/10/
// 2026): titulares e suplentes, cada um com um emoji por evento encerrado
// do periodo - do mais antigo (esquerda) pro mais novo - e o % dele; embaixo
// os eventos, na mesma ordem dos emojis.
export const EMOJI_CAVEIRAS = { presente: '✅', falta: '❌', fora: '➖' };
const VAGAS_CAVEIRAS = 10;

// Quem tem a funcao no cadastro hoje, afastados inclusive (o patch continua
// com ele). Caveira e Suplente ao mesmo tempo conta so como titular. O
// `caveira01` escolhido abre a lista; o resto vai na hierarquia.
function listaCaveiras(roster, chave, caveira01) {
  const lista = ordenarPorHierarquia((roster || []).filter(m => (m.funcoes || []).includes(chave)
    && (chave === 'caveira' || !(m.funcoes || []).includes('caveira'))));
  const i = lista.findIndex(m => m.id === caveira01);
  if (i > 0) lista.unshift(lista.splice(i, 1)[0]);
  return lista;
}

// "Jun_26" - o mes da Avaliacao.
function mesAvaliacao(iso) {
  const i = Number(String(iso).slice(5, 7)) - 1;
  const m = MESES_ABREV[i] || '';
  return `${m.charAt(0)}${m.slice(1).toLowerCase()}_${String(iso).slice(2, 4)}`;
}

// O comeco e o fim do periodo, pro "Avaliacao Jun_26 a Dez_26": De/Ate
// quando escolhidos; N meses = de N meses atras; Tudo = do primeiro evento.
// Sem "Ate", o fim e hoje - ou o ultimo evento, se ele tiver data depois de
// hoje (um evento encerrado antes da data), pro fim nunca vir antes do comeco.
function periodoDaAvaliacao(periodo, evs) {
  const datas = evs.map(e => e.data).filter(Boolean).sort();
  const primeiro = datas[0], ultimo = datas[datas.length - 1];
  const hoje = hojeISO();
  const fim = ultimo && ultimo > hoje ? ultimo : hoje;
  if (periodo && typeof periodo === 'object') return { de: periodo.de || primeiro || hoje, ate: periodo.ate || fim };
  if (periodo) return { de: dataCorteMeses(periodo), ate: fim };
  return { de: primeiro || hoje, ate: fim };
}

// O nome de quem ocupa um cargo do Regional, pelo cadastro.
function nomeDoCargoRegional(roster, cargo) {
  const regional = escopoPorChave('regional').nome;
  const m = (roster || []).find(x => x.divisao === regional && x.cargo === cargo);
  return m ? m.nome : '';
}

export function relatorioCaveiras(eventos, roster, periodo, caveira01) {
  // Do mais antigo pro mais novo: e a ordem dos emojis e da lista.
  const evs = encerradosDoPeriodo(eventos, periodo).slice().reverse();
  const linha = m => {
    let presentes = 0, convocado = 0;
    const emojis = evs.map(ev => {
      const p = (ev.presencas || []).find(x => x.membroId === m.id);
      if (!p) return EMOJI_CAVEIRAS.fora;
      convocado++;
      if (statusNoEvento(ev, p) === 'confirmado') { presentes++; return EMOJI_CAVEIRAS.presente; }
      return EMOJI_CAVEIRAS.falta;
    });
    return { id: m.id, nome: m.nome, grau: m.grau, emojis, presentes, convocado, pct: pctDe(presentes, convocado) };
  };
  const avaliacao = periodoDaAvaliacao(periodo, evs);
  return {
    eventos: evs,
    titulares: listaCaveiras(roster, 'caveira', caveira01).map(linha),
    suplentes: listaCaveiras(roster, 'caveira_suplente', caveira01).map(linha),
    avaliacao: `${mesAvaliacao(avaliacao.de)} a ${mesAvaliacao(avaliacao.ate)}`,
    diretor: nomeDoCargoRegional(roster, 'Diretor Regional'),
    operacional: nomeDoCargoRegional(roster, 'Operacional'),
  };
}

// "✅❌ — 50%" - os emojis e o %, o que vem depois do nome.
export function marcasCaveira(l) {
  return [l.emojis.join(''), l.pct === null ? '' : `— ${l.pct}%`].filter(Boolean).join(' ');
}

const n2 = i => String(i).padStart(2, '0');

export function textoRelatorioCaveiras(r, patchs) {
  const diretor = r.diretor || '(nome)', operacional = r.operacional || '(nome)';
  const titulares = [];
  for (let i = 0; i < Math.max(VAGAS_CAVEIRAS, r.titulares.length); i++) {
    const l = r.titulares[i];
    titulares.push(l ? `💀${n2(i + 1)}- ${l.nome} ${marcasCaveira(l)}`.trimEnd() : `💀${n2(i + 1)}-`);
  }
  const suplentes = [];
  for (let i = 0; i < Math.max(VAGAS_CAVEIRAS, r.suplentes.length); i++) {
    const l = r.suplentes[i];
    suplentes.push(l ? `🪖 ${l.nome} ${marcasCaveira(l)}`.trimEnd() : '🪖');
  }
  const eventos = r.eventos.length
    ? r.eventos.flatMap((ev, i) => [
        `${i + 1}. ${ev.nome}`,
        ev.data ? formatDataBR(ev.data).slice(0, 5) : '',
        ev.horario ? `${ev.horario}h` : '',
        ev.endereco || '',
      ].filter(Boolean).concat(i < r.eventos.length - 1 ? [''] : []))
    : ['Nenhum evento encerrado no período.'];
  return [
    'REGIONAL  RJ4',
    `Diretor - ${diretor.toUpperCase()}`,
    `Operacional - ${operacional.toUpperCase()}`,
    '..........................................',
    '',
    'Leitura:',
    `${EMOJI_CAVEIRAS.presente} Missão concluída`,
    `${EMOJI_CAVEIRAS.falta} Não participação`,
    `${EMOJI_CAVEIRAS.fora} Não estava na equipe`,
    '',
    '---------------------------------',
    '',
    'REGIONAL = RJ4',
    '',
    `Diretor= ${diretor}`,
    `Operacional= ${operacional}`,
    '',
    '-------------------------------',
    '💀 CAVEIRA TITULAR 💀',
    '',
    ...titulares,
    '-------------------------------',
    '🪖 SUPLENTES 🪖',
    '',
    ...suplentes,
    '............................................',
    '',
    `Avaliação ${r.avaliacao}`,
    '',
    'Reuniões / Missão:',
    '',
    '',
    ...eventos,
    '...........................................',
    `Patchs caveiras em uso : ${patchs}`,
    '............................................',
    '',
    'Virtudes de um Caveira',
    'Comprometimento, amor à causa, disponibilidade, postura, responsabilidade, respeito, atenção e sigilo.',
    '',
    'Todos seremos caveira um dia, mas poucos serão em vida!',
    '',
    'I.S.S.I',
  ].join('\n');
}
