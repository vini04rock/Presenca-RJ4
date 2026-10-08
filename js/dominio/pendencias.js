// O que esta esperando acao do organizador.
//
// Por enquanto so uma pendencia: evento chegando com gente que ainda nao
// respondeu. A ideia e crescer daqui (cadastro incompleto, evento sem tipo,
// Insight parado), mas cada uma so entra se valer o espaco - painel de
// alerta cheio demais e painel que ninguem le.

import { emojiTipoEvento, escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { diaDaSemana, diasAte, formatDataBR, hojeISO, ordenarPorHierarquia, quando } from '../nucleo/util.js';

// Quantos dias antes o evento comeca a aparecer no aviso. O evento se
// encerra sozinho na virada do dia dele, entao esta janela e a ultima
// chance de cobrar quem falta - depois disso quem nao respondeu vira falta
// infracional (ver statusEfetivo em dominio/status.js).
export const JANELA_DIAS = 2;

// Eventos ativos da divisao que acontecem de hoje ate JANELA_DIAS a frente,
// do mais proximo pro mais distante. Evento sem data fica de fora: sem ela
// nao da pra saber se esta perto, e a comparacao de texto trataria '' como
// anterior a qualquer data.
export function eventosProximos(escopo, dias = JANELA_DIAS) {
  const hoje = hojeISO();
  return state.events
    .filter(ev => ev.status !== 'encerrado'
      && ev.categoria === escopo
      && /^\d{4}-\d{2}-\d{2}$/.test(ev.data || '')
      && ev.data >= hoje)
    .map(ev => ({ ev, dias: diasAte(ev.data) }))
    .filter(x => x.dias !== null && x.dias <= dias)
    .sort((a, b) => a.ev.data.localeCompare(b.ev.data)
      || (a.ev.horario || '').localeCompare(b.ev.horario || ''));
}

// Quantos dos convocados ainda nao responderam.
//
// Devolve null enquanto as presencas daquele evento nao chegaram - quem
// desenha usa isso pra dizer "carregando" em vez de mostrar um numero
// errado (sem os dados, TODO mundo pareceria nao ter respondido).
export function semResposta(ev) {
  const presencas = state.reportData[ev.id];
  if (!presencas) return null;
  const total = (ev.memberIds || []).length;
  const faltam = (ev.memberIds || []).filter(id => {
    const p = presencas[id];
    return !p || !p.status || p.status === 'aguardando';
  }).length;
  return { faltam, total };
}

// Os convocados que ainda estao "aguardando", na ordem hierarquica.
// statusDe(id) diz o status de cada um - a tela de evento le das
// confirmacoes abertas, o mural das presencas que ele mesmo buscou.
export function quemFalta(ev, statusDe) {
  const membros = (ev.memberIds || [])
    .map(id => state.roster.find(m => m.id === id))
    .filter(Boolean)
    .filter(m => {
      const s = statusDe(m.id);
      return !s || s === 'aguardando';
    });
  return ordenarPorHierarquia(membros);
}

// A mensagem de "cobrar quem falta", pronta pro WhatsApp. Evento regional
// separa por divisao, na ordem oficial do clube (a mesma da chamada).
// Termina com as Regras do clube - o mesmo bloco da chamada (prazo da
// justificativa e o Respaldo RDI), que chega pronto em `regras`, uma linha
// por item: o padrao do app ou o que o Regional personalizou.
export function textoCobranca(ev, membros, regras) {
  const linha = (m, i) => `${i + 1}. ${m.nome}${m.grau ? ` (${m.grau})` : ''}`;
  const quandoTexto = quando(diasAte(ev.data));
  const data = [diaDaSemana(ev.data), ev.data ? formatDataBR(ev.data) : '', quandoTexto].filter(Boolean).join(' · ');
  const partes = [
    '⚠️ *AINDA NÃO RESPONDERAM* ⚠️',
    '',
    `${ev.tipo ? emojiTipoEvento(ev.tipo) + ' ' : ''}*${ev.nome}*`,
  ];
  if (data) partes.push(`📅 ${data}`);
  if (ev.categoria === 'regional') {
    escoposNaOrdemOficial().forEach(e => {
      const daDivisao = membros.filter(m => m.divisao === e.nome);
      if (!daDivisao.length) return;
      partes.push('', `*${e.nome.toUpperCase()}*`, ...daDivisao.map(linha));
    });
    const semDivisao = membros.filter(m => !escoposNaOrdemOficial().some(e => e.nome === m.divisao));
    if (semDivisao.length) partes.push('', '*SEM DIVISÃO*', ...semDivisao.map(linha));
  } else {
    partes.push('', `*${escopoPorChave(ev.categoria).nome.toUpperCase()}*`, ...membros.map(linha));
  }
  partes.push('', ...regras);
  return partes.join('\n');
}
