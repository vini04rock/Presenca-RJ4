// Doacoes de alimento: as contas do rank e o texto pro WhatsApp.
//
// A regra do clube e levar 1 kg de alimento em todo evento. Daqui saem dois
// numeros, e eles medem coisas diferentes de proposito:
//
//   - kg: quanto cada um levou, no total. E o rank, o lado de quem esta bem.
//   - cumprimento: dos eventos ENCERRADOS em que a pessoa estava ✅
//     Confirmada, em quantos ela levou alguma coisa. E o lado da melhoria -
//     e so cobra de quem foi. Quem faltou ja responde pela falta; contar
//     doacao de evento a que ele nem foi seria cobrar duas vezes.
//
// Doacao de quem nao estava como Confirmado (a presenca nao foi atualizada,
// por exemplo) entra nos kg normalmente - so nao entra no cumprimento, que e
// uma conta sobre presencas confirmadas.
//
// Os dados chegam do Code.gs (lerDoacoes) ja agrupados por evento:
// { eventos: [{ id, nome, data, tipo, status, convocados, confirmados,
//   doacoes: { idMembro: kg } }], nomes }.

import { escopoPorChave } from '../nucleo/config.js';
import { dataCorteMeses, formatDataBR, ordenarPorHierarquia } from '../nucleo/util.js';

// As janelas do filtro de periodo das duas secoes (Doacoes e Caixinha).
// 0 = desde sempre.
export const PERIODOS = [3, 6, 12, 0];
export function nomeDoPeriodo(meses) {
  if (!meses) return 'Desde sempre';
  return meses === 1 ? 'Último mês' : `Últimos ${meses} meses`;
}
export function rotuloPilula(meses) {
  return meses ? `${meses} meses` : 'Tudo';
}

const umaCasa = n => Math.round(n * 10) / 10;

// "1 kg", "2,5 kg" - uma casa no maximo, e inteiro sem casa nenhuma.
export function formatKg(n) {
  return umaCasa(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg';
}

export function somaKg(doacoes) {
  return umaCasa(Object.values(doacoes || {}).reduce((s, kg) => s + kg, 0));
}

// Os eventos da janela, do mais recente pro mais antigo. Evento sem data so
// entra em "desde sempre": sem ela nao da pra saber se esta na janela.
export function eventosDoPeriodo(eventos, meses) {
  const corte = meses ? dataCorteMeses(meses) : null;
  return (eventos || [])
    .filter(e => !corte || (e.data && e.data >= corte))
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

// O rank da divisao no periodo. `membros` sao os integrantes ATUAIS da
// divisao (do cadastro) - quem saiu do clube nao aparece na lista, mas o que
// ele doou continua somando no total da divisao.
export function rankDoacoes(dados, membros, meses) {
  const eventos = eventosDoPeriodo(dados && dados.eventos, meses);
  const encerrados = eventos.filter(e => e.status === 'encerrado');

  const linhas = membros.map(m => {
    let kg = 0, vezes = 0, foi = 0, levouQuandoFoi = 0;
    eventos.forEach(e => {
      const k = e.doacoes[m.id] || 0;
      if (k) { kg += k; vezes++; }
    });
    encerrados.forEach(e => {
      if (!e.confirmados.includes(m.id)) return;
      foi++;
      if (e.doacoes[m.id]) levouQuandoFoi++;
    });
    return { ...m, kg: umaCasa(kg), vezes, foi, levouQuandoFoi,
      cumprimento: foi ? Math.round((levouQuandoFoi / foi) * 100) : null };
  });
  // Mais kg primeiro; empate, quem cumpre mais; depois o nome.
  linhas.sort((a, b) => b.kg - a.kg || (b.cumprimento ?? -1) - (a.cumprimento ?? -1) || a.nome.localeCompare(b.nome));

  const foiTotal = linhas.reduce((s, m) => s + m.foi, 0);
  const levouTotal = linhas.reduce((s, m) => s + m.levouQuandoFoi, 0);
  // Cada evento encerrado, pra linha de tendencia: dos confirmados, quantos
  // levaram. Evento sem ninguem confirmado nao tem o que medir.
  const porEvento = encerrados.map(e => {
    const levaram = e.confirmados.filter(id => e.doacoes[id]).length;
    return { ev: e, kg: somaKg(e.doacoes), doadores: Object.keys(e.doacoes).length,
      confirmados: e.confirmados.length, levaram,
      pct: e.confirmados.length ? Math.round((levaram / e.confirmados.length) * 100) : null };
  });

  return {
    eventos: eventos.length,
    eventosComDoacao: eventos.filter(e => Object.keys(e.doacoes).length).length,
    totalKg: umaCasa(eventos.reduce((s, e) => s + somaKg(e.doacoes), 0)),
    presencas: foiTotal,
    presencasComDoacao: levouTotal,
    cumprimento: foiTotal ? Math.round((levouTotal / foiTotal) * 100) : null,
    membros: linhas,
    // Quem foi e nao levou em todos - quem mais deixou de levar primeiro.
    melhorar: linhas
      .filter(m => m.foi > m.levouQuandoFoi)
      .sort((a, b) => (b.foi - b.levouQuandoFoi) - (a.foi - a.levouQuandoFoi) || (a.cumprimento ?? 0) - (b.cumprimento ?? 0) || a.nome.localeCompare(b.nome)),
    porEvento,
  };
}

// Quem aparece pra marcar num evento: os convocados, os ✅ primeiro (sao
// os que mais provavelmente levaram), cada grupo em ordem hierarquica. Quem
// ja tem doacao marcada entra mesmo sem estar convocado. Evento sem
// convocado nenhum (um evento marcado so pelo Calendario, por exemplo) mostra
// a divisao inteira, senao nao haveria em quem marcar.
export function membrosParaMarcar(ev, membrosDivisao, roster) {
  const ids = new Set([...(ev.convocados || []), ...Object.keys(ev.doacoes || {})]);
  const lista = ids.size
    ? roster.filter(m => ids.has(m.id))
    : membrosDivisao;
  const confirmados = new Set(ev.confirmados || []);
  return [
    ...ordenarPorHierarquia(lista.filter(m => confirmados.has(m.id))),
    ...ordenarPorHierarquia(lista.filter(m => !confirmados.has(m.id))),
  ];
}

const linhaNome = m => `${m.nome}${m.grau ? ` (${m.grau})` : ''}`;

// O texto pro grupo: os numeros da divisao, o rank de quem levou e - pro
// lado da melhoria - quem foi e nao levou. Diferente da imagem, o texto leva
// nomes: e ele que serve pra cobrar.
export function textoDoacoes(rank, escopo, meses) {
  const partes = [
    '🥫 *DOAÇÕES DE ALIMENTO* 🥫',
    `*${escopoPorChave(escopo).nome.toUpperCase()}* · ${nomeDoPeriodo(meses)}`,
    '',
    `Arrecadado: *${formatKg(rank.totalKg)}* em ${rank.eventosComDoacao} ${rank.eventosComDoacao === 1 ? 'evento' : 'eventos'}`,
  ];
  if (rank.cumprimento !== null) {
    partes.push(`Cumprimento: *${rank.cumprimento}%* (levaram alimento em ${rank.presencasComDoacao} de ${rank.presencas} presenças)`);
  }
  const doaram = rank.membros.filter(m => m.kg > 0);
  if (doaram.length) {
    partes.push('', '🏆 *QUEM MAIS LEVOU*');
    doaram.forEach((m, i) => partes.push(`${i + 1}. ${linhaNome(m)} — ${formatKg(m.kg)}`));
  }
  if (rank.melhorar.length) {
    partes.push('', '📌 *FORAM E NÃO LEVARAM*');
    rank.melhorar.forEach((m, i) => partes.push(`${i + 1}. ${linhaNome(m)} — levou em ${m.levouQuandoFoi} de ${m.foi} ${m.foi === 1 ? 'evento' : 'eventos'}`));
  }
  partes.push('', 'Regra do clube: *1 kg de alimento em todo evento.*');
  return partes.join('\n');
}

// Data curta do evento pras listas: "05/09/2026".
export function dataDoEvento(ev) {
  return ev.data ? formatDataBR(ev.data) : 'sem data';
}
