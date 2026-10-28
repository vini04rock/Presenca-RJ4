// As Funcoes especiais (28/10/2026): Batedores e Caveiras, cada um com os
// proprios eventos, so no Regional. As contas daqui so olham os eventos que
// vem da planilha (lerFuncoesEspeciais, no Code.gs) - nunca state.events -,
// e e isso que mantem os numeros delas fora dos do clube, e os do clube
// fora delas.
//
// Um evento: { id, nome, data, horario, endereco, status,
//   presencas: [{ membroId, nome, grau, divisao, status }] }.

import { STATUS, escoposNaOrdemOficial } from '../nucleo/config.js';
import { formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';
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

// As estatisticas de uma funcao no periodo: o geral, cada integrante, cada
// divisao e cada mes. Nome, grau e divisao de um integrante sao os do
// evento mais recente dele (o retrato gravado na planilha).
export function estatisticasFuncao(eventos, periodo) {
  const evs = encerradosDoPeriodo(eventos, periodo);
  const geral = { convites: 0, confirmados: 0, justificadas: 0, naoJustificadas: 0 };
  const pessoas = {};
  const divisoes = {};
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
      const div = divisoes[p.divisao] = divisoes[p.divisao] || { divisao: p.divisao, convites: 0, confirmados: 0 };
      [geral, pessoa].forEach(x => {
        if (veio) x.confirmados++;
        else if (nj) x.naoJustificadas++;
        else x.justificadas++;
      });
      geral.convites++; pessoa.eventos++;
      div.convites++; if (veio) div.confirmados++;
      if (mes) { meses[mes].convites++; if (veio) meses[mes].confirmados++; }
    });
  });
  const porIntegrante = Object.values(pessoas)
    .map(x => ({ ...x, pct: pctDe(x.confirmados, x.eventos) }))
    .sort((a, b) => b.pct - a.pct || b.confirmados - a.confirmados || a.nome.localeCompare(b.nome));
  const ordem = escoposNaOrdemOficial().map(e => e.nome);
  const lugar = d => (ordem.includes(d.divisao) ? ordem.indexOf(d.divisao) : ordem.length);
  const porDivisao = Object.values(divisoes).sort((a, b) => lugar(a) - lugar(b))
    .map(d => ({ ...d, pct: pctDe(d.confirmados, d.convites) }));
  const porMes = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({ ...m, pct: pctDe(m.confirmados, m.convites) }));
  return { eventos: evs.length, geral: { ...geral, pct: pctDe(geral.confirmados, geral.convites) }, porIntegrante, porDivisao, porMes };
}

// As estatisticas pro WhatsApp. Leva os nomes de quem tem falta nao
// justificada - o texto e o que serve pra cobrar (a imagem nao leva).
export function textoEstatisticasFuncao(r, chave, periodo) {
  const f = dadosDaFuncao(chave);
  const g = r.geral;
  const linhas = [
    `${f.selo} *${f.nome.toUpperCase()} — ESTATÍSTICAS*`,
    rotuloPeriodoMovimentos(periodo),
    `📅 ${r.eventos} ${r.eventos === 1 ? 'evento encerrado' : 'eventos encerrados'}`,
  ];
  if (!r.eventos) return linhas.concat('', 'Nenhum evento encerrado no período.').join('\n');
  linhas.push(
    '',
    `📊 *${g.pct}% DE PRESENÇA* (${g.confirmados} de ${g.convites})`,
    `${STATUS.confirmado.emoji} ${g.confirmados} presenças · ${STATUS.justificada.emoji} ${g.justificadas} justificadas · ${STATUS.infracional.emoji} ${g.naoJustificadas} não justificadas`,
    '',
    '*POR DIVISÃO*',
    ...r.porDivisao.map(d => `- ${divisaoCurta(d.divisao)}: ${d.pct}% (${d.confirmados} de ${d.convites})`),
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
