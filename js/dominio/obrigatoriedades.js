// Obrigatoriedades do mes: todo mes, cada divisao tem que fazer pelo menos
// um evento de cada tipo obrigatorio (regra do clube). O card do organizador
// do Regional confere, no mes atual, quem ja marcou cada um no calendario e
// quem ainda nao (telas/menu-organizador.js).
//
// Regras (decisao do clube, 19/10/2026):
//   - confere as 6 divisoes, na ordem oficial do clube;
//   - MARCADO no calendario ja conta, mesmo que o evento ainda nao tenha
//     acontecido - o que se cobra e a divisao ter planejado;
//   - evento do Regional vale para todas: um Bate e Volta do Regional no
//     mes tira o Bate e Volta da pendencia de todas as divisoes;
//   - nos ultimos 10 dias do mes a pendencia vira urgente (vermelho).
//
// Os dados sao os eventos que o app ja tem (state.events), de todas as
// divisoes - nada novo vem da planilha.

import { NOMES_MESES, emojiTipoEvento, escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { formatDataBR } from '../nucleo/util.js';

// Os tipos obrigatorios, na ordem em que aparecem. Mudou a regra do clube,
// muda esta linha - os nomes sao os de TIPOS_EVENTO (config.js).
export const TIPOS_OBRIGATORIOS = ['Reunião', 'Pub', 'Bate e Volta', 'Ação Social'];

// Nos ultimos DIAS_URGENTES dias do mes, quem ainda deve fica em vermelho.
export const DIAS_URGENTES = 10;

const dois = n => String(n).padStart(2, '0');

export function obrigatoriedadesDoMes(eventos, base = new Date()) {
  const mes = `${base.getFullYear()}-${dois(base.getMonth() + 1)}`;
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const diasRestantes = ultimoDia - base.getDate();
  const doMes = (eventos || []).filter(ev => typeof ev.data === 'string' && ev.data.slice(0, 7) === mes);
  // O primeiro do mes, se houver mais de um do mesmo tipo.
  const primeiro = (categoria, tipo) => doMes
    .filter(ev => ev.categoria === categoria && ev.tipo === tipo)
    .sort((a, b) => a.data.localeCompare(b.data))[0] || null;

  const divisoes = escoposNaOrdemOficial().filter(e => e.chave !== 'regional').map(e => {
    const tipos = TIPOS_OBRIGATORIOS.map(tipo => {
      const proprio = primeiro(e.chave, tipo);
      const regional = proprio ? null : primeiro('regional', tipo);
      const evento = proprio || regional;
      return { tipo, ok: !!evento, evento, peloRegional: !!regional };
    });
    return { escopo: e, tipos, faltam: tipos.filter(t => !t.ok).map(t => t.tipo) };
  });
  return {
    mes,
    nomeMes: NOMES_MESES[base.getMonth()],
    diasRestantes,
    urgente: diasRestantes < DIAS_URGENTES,
    divisoes,
    devendo: divisoes.filter(d => d.faltam.length),
  };
}

const comEmoji = tipo => `${emojiTipoEvento(tipo)} ${tipo}`.trim();
export function rotuloTipo(tipo) { return comEmoji(tipo); }

// "falta 🏥 Ação Social · 🍻 Pub"
export function textoFaltam(faltam) {
  return `falta ${faltam.map(comEmoji).join(' · ')}`;
}

// "faltam 9 dias" / "último dia" - o que resta do mes.
export function textoDiasRestantes(dias) {
  if (dias <= 0) return 'último dia do mês';
  return dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`;
}

// O detalhe de um tipo marcado: "Pub do mês · 12/10" ou, quando quem cobre
// e o Regional, "pelo Regional: Bonde da Serra · 19/10".
export function textoEventoMarcado(t) {
  if (!t.evento) return 'não marcado';
  const dia = formatDataBR(t.evento.data).slice(0, 5);
  return `${t.peloRegional ? 'pelo Regional: ' : ''}${t.evento.nome} · ${dia}`;
}

// A cobranca pro grupo: o que cada divisao ainda nao marcou no mes.
export function textoCobrancaObrigatoriedades(r) {
  const partes = [`⚠️ *OBRIGATORIEDADES DE ${r.nomeMes.toUpperCase()}* ⚠️`, ''];
  if (!r.devendo.length) {
    partes.push(`✅ Todas as divisões marcaram os ${TIPOS_OBRIGATORIOS.length} eventos do mês.`);
    return partes.join('\n');
  }
  partes.push('Eventos obrigatórios que ainda não foram marcados no calendário:');
  r.devendo.forEach(d => {
    partes.push('', `*${escopoPorChave(d.escopo.chave).nome.toUpperCase()}*`, ...d.faltam.map(t => `❌ ${comEmoji(t)}`));
  });
  partes.push('', r.diasRestantes <= 0
    ? `⏳ Hoje é o último dia de ${r.nomeMes}.`
    : `⏳ ${r.diasRestantes === 1 ? 'Falta 1 dia' : `Faltam ${r.diasRestantes} dias`} para fechar ${r.nomeMes}.`);
  return partes.join('\n');
}
