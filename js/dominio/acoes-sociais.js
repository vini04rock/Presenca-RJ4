// O planejador de Acoes Sociais de cada divisao: as contas e os textos.
// So planeja - nada daqui mexe em evento, presenca ou obrigatoriedade.

import { diaDaSemana, formatDataBR } from '../nucleo/util.js';

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// A situacao de cada acao da agenda, na ordem em que ela anda.
export const SITUACOES_ACAO = [
  { chave: 'ideia', emoji: '💡', rotulo: 'Ideia' },
  { chave: 'planejada', emoji: '📅', rotulo: 'Planejada' },
  { chave: 'confirmada', emoji: '✅', rotulo: 'Confirmada' },
  { chave: 'realizada', emoji: '🏁', rotulo: 'Realizada' },
];
export function situacaoPorChave(chave) { return SITUACOES_ACAO.find(s => s.chave === chave) || SITUACOES_ACAO[0]; }

// O contexto de cada mes e a legenda que explica o porque - do rascunho do
// Social da Barra ("ESBOCO ANUAL" e "LEGENDA"). O clima e as datas sao do
// Rio, entao valem pra todas as divisoes. Mudou a leitura de um mes, muda
// aqui.
export const LEGENDA_CONTEXTO = {
  frio: { emoji: '🥶', rotulo: 'Frio', porque: ['Necessidade de agasalho', 'Necessidade de mais comida'] },
  calor: { emoji: '☀️', rotulo: 'Calor', porque: ['Praias cheias (mais lixo na praia)', 'Mais acidentes', 'Mais pipas'] },
  ferias: { emoji: '🏝️', rotulo: 'Férias', porque: ['Alto índice de acidentes', 'Alto índice de pipas'] },
  viagens: { emoji: '🧳', rotulo: 'Viagens', porque: ['Cidade mais vazia, necessidade de mais recursos'] },
  carnaval: { emoji: '🎭', rotulo: 'Carnaval' },
  pascoa: { emoji: '🐣', rotulo: 'Páscoa' },
  maes: { emoji: '💐', rotulo: 'Dia das Mães' },
  pais: { emoji: '👔', rotulo: 'Dia dos Pais' },
  criancas: { emoji: '🧸', rotulo: 'Dia das Crianças' },
  natal: { emoji: '🎄', rotulo: 'Natal' },
  festas: { emoji: '🎉', rotulo: 'Festas de fim de ano' },
};
// Indice 0 = janeiro.
export const CONTEXTO_DOS_MESES = [
  ['calor', 'ferias', 'viagens'],
  ['calor', 'ferias', 'carnaval', 'viagens'],
  ['calor', 'viagens'],
  ['pascoa', 'calor'],
  ['frio', 'maes'],
  ['frio', 'ferias'],
  ['frio'],
  ['frio', 'pais'],
  ['frio'],
  ['frio', 'criancas'],
  ['calor'],
  ['calor', 'ferias', 'natal', 'festas'],
];

// '2027' -> ['2027-01', ..., '2027-12']
export function mesesDoAno(ano) {
  return MESES_NOMES.map((_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
}
export function acoesDoMes(agenda, mes) { return (agenda || []).filter(a => a.mes === mes); }

// Um mes pode ter varias ideias, uma embaixo da outra: as que ainda estao
// como "Ideia" sao opcoes; as que andaram (planejada, confirmada,
// realizada) sao as escolhidas. Escolher e so mudar a situacao.
export function ehEscolhida(a) { return a.situacao !== 'ideia'; }

// O ano que a agenda abre: o de hoje, se ja tem alguma acao nele; senao o
// primeiro ano seguinte que tem; senao o de hoje.
export function anoInicialDaAgenda(agenda, hoje) {
  const atual = Number(String(hoje).slice(0, 4));
  const anos = [...new Set((agenda || []).map(a => Number(String(a.mes).slice(0, 4))))].sort();
  if (anos.includes(atual)) return atual;
  return anos.find(a => a > atual) || atual;
}

// O placar do ano: quantos meses ja tem a acao escolhida, e quantas acoes
// em cada situacao (as "Ideia" sao as opcoes ainda nao escolhidas).
export function resumoDoAno(agenda, ano) {
  const doAno = (agenda || []).filter(a => String(a.mes).startsWith(ano + '-'));
  const porSituacao = {};
  SITUACOES_ACAO.forEach(s => { porSituacao[s.chave] = 0; });
  doAno.forEach(a => { porSituacao[a.situacao] = (porSituacao[a.situacao] || 0) + 1; });
  return { mesesComAcao: new Set(doAno.filter(ehEscolhida).map(a => a.mes)).size, acoes: doAno.length, porSituacao };
}

// Emojis pra escolher com um toque ao criar uma ideia - os do rascunho do
// Social. Da pra escrever qualquer outro no campo.
export const EMOJIS_SUGERIDOS = ['🤝', '🧥', '🩸', '🧺', '🍫', '💐', '🪁', '👔', '🐾', '🧸', '👴', '🎅',
  '🏖️', '🌳', '🍲', '🍖', '🍱', '🦷', '🪥', '🏠', '✂️', '🎨', '🎱', '🌎'];

// '2027-07' -> 'Jul/2027'
export function rotuloMesCurto(mes) {
  const [ano, m] = String(mes || '').split('-');
  return MESES_CURTOS[Number(m) - 1] ? `${MESES_CURTOS[Number(m) - 1]}/${ano}` : String(mes || '');
}

// Os meses da agenda que usam uma ideia, sem repetir, em ordem.
export function mesesDaIdeia(agenda, ideiaId) {
  return [...new Set((agenda || []).filter(a => a.ideiaId === ideiaId).map(a => a.mes))].sort();
}

// A rotina do Social, do rascunho: so lembrete, no topo da agenda.
export const ROTINA_SOCIAL = [
  '🥫 Todo Pub e toda Reunião: levar 1 kg de alimento',
  '📣 1 dia antes do Pub/Reunião: enviar o texto de arrecadação',
  '💬 1 vez por mês: um texto motivacional ou reflexivo',
];

// A mesma ordem da planilha (lerAcoesSociais): por mes, por data (sem data
// por ultimo) e, empatando, a que ja estava antes.
export function ordenarAgenda(agenda) {
  return agenda.map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.mes.localeCompare(y.a.mes) || (x.a.data || '9999').localeCompare(y.a.data || '9999') || x.i - y.i)
    .map(x => x.a);
}

// '2027-07-10' -> 'Sábado, 10/07/2027'
function dataPorExtenso(iso) {
  return iso ? [diaDaSemana(iso), formatDataBR(iso)].filter(Boolean).join(', ') : '';
}
// A linha de quando/onde de uma acao: 'Sábado, 10/07 · 09:00 · Sede'.
export function quandoEOnde(a) {
  return [a.data ? `${diaDaSemana(a.data)}, ${formatDataBR(a.data).slice(0, 5)}` : '', a.horario, a.local].filter(Boolean).join(' · ');
}

// O relatorio do ano pro WhatsApp: os 12 meses, cada um com a(s) acao(oes)
// escolhida(s) e a situacao, e embaixo as outras opcoes numa linha. Mes sem
// nada escolhido sai como "a definir", a vista.
export function textoAgendaDoAno(agenda, ano, nomeDivisao) {
  const r = resumoDoAno(agenda, ano);
  const placar = SITUACOES_ACAO.filter(s => s.chave !== 'ideia' && r.porSituacao[s.chave]).map(s => `${s.emoji} ${r.porSituacao[s.chave]}`).join(' · ');
  const partes = [
    `🤝 *AÇÕES SOCIAIS ${ano}* 🤝`,
    `*${String(nomeDivisao).toUpperCase()}*`,
    '',
    `📊 ${r.mesesComAcao} de 12 meses com ação escolhida${placar ? ' · ' + placar : ''}`,
  ];
  mesesDoAno(ano).forEach((mes, i) => {
    partes.push('', `*${MESES_NOMES[i].toUpperCase()}*`);
    const doMes = acoesDoMes(agenda, mes);
    const escolhidas = doMes.filter(ehEscolhida);
    const opcoes = doMes.filter(a => !ehEscolhida(a));
    if (!escolhidas.length) partes.push('— a definir —');
    escolhidas.forEach(a => {
      const s = situacaoPorChave(a.situacao);
      partes.push(`${a.emoji ? a.emoji + ' ' : ''}${a.acao} — ${s.emoji} ${s.rotulo}`);
      const onde = quandoEOnde(a);
      if (onde) partes.push(`   ${onde}`);
    });
    if (opcoes.length) partes.push(`💡 ${escolhidas.length ? 'Outras opções' : 'Opções'}: ${opcoes.map(a => (a.emoji ? a.emoji + ' ' : '') + a.acao).join(' · ')}`);
  });
  partes.push('', '💀 I.S.S.I');
  return partes.join('\n');
}

// A convocacao de uma acao: o texto de divulgacao pro grupo - o que e,
// quando, onde e o que precisa. Nao e a chamada oficial (8 quadros); essa
// vem do evento, se a acao virar evento.
export function textoConvocacaoAcaoSocial(a, ideia, nomeDivisao) {
  const partes = [
    '🤝 *AÇÃO SOCIAL* 🤝',
    `*${String(nomeDivisao).toUpperCase()}*`,
    '',
    `${a.emoji ? a.emoji + ' ' : ''}*${String(a.acao).toUpperCase()}*`,
  ];
  if (ideia && ideia.descricao) partes.push(ideia.descricao);
  partes.push('', a.data ? `📅 *${dataPorExtenso(a.data)}*` : '📅 Data a definir');
  if (a.horario) partes.push(`⏰ ${a.horario}h`);
  if (a.local) partes.push(`📍 ${a.local}`);
  if (ideia && ideia.precisa) partes.push('', `🧰 *O que precisa:* ${ideia.precisa}`);
  if (a.observacao) partes.push('', `📝 ${a.observacao}`);
  partes.push('', 'Nosso foco é, e sempre será, ajudar o próximo. Contamos com a presença de todos!', '💀 I.S.S.I');
  return partes.join('\n');
}

// '9' -> '09:00', '930' -> '09:30', '09:30' -> '09:30'. '' se nao der
// horario de verdade.
export function horarioNormalizado(texto) {
  const d = String(texto || '').replace(/\D/g, '');
  if (!d) return '';
  const hh = d.length <= 2 ? d : d.slice(0, d.length - 2);
  const mm = d.length <= 2 ? '00' : d.slice(-2);
  if (Number(hh) > 23 || Number(mm) > 59 || hh.length > 2) return '';
  return `${hh.padStart(2, '0')}:${mm}`;
}

// Ideia nova ou corrigida na lista, em ordem de nome (a mesma do Code.gs),
// e o nome/emoji atualizados nos meses que a usam - igual a planilha faz.
export function aplicarIdeiaSalva(dados, ideia) {
  const ideias = dados.ideias.filter(i => i.id !== ideia.id).concat(ideia)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const agenda = dados.agenda.map(a => a.ideiaId === ideia.id ? { ...a, emoji: ideia.emoji, acao: ideia.nome } : a);
  return { ...dados, ideias, agenda };
}
