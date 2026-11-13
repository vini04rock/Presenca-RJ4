// O Painel Social do Regional (10/11/2026): as Acoes Sociais de todas as
// divisoes num lugar so, pra quem cuida do Social da RJ4 acompanhar se cada
// divisao fez a sua (regra do clube: pelo menos 1 Acao Social por mes).
//
// So le os eventos que o app ja tem (state.events) - nada novo vem da
// planilha, e o Code.gs nao muda. As regras (decisao do Social Regional):
//   - "fez" tem dois degraus: 📅 marcada (o evento esta no calendario) e
//     🏁 realizada (o evento ja foi encerrado);
//   - uma Acao Social do Regional vale pra todas as divisoes, a mesma regra
//     das Obrigatoriedades (valeParaAsDivisoes). A divisao pode fazer a dela
//     tambem, e ai as duas aparecem;
//   - mes que ja passou sem nada e ⭕ nao fez; o mes de hoje sem nada e
//     ⚠️ ainda nao marcou; mes que ainda vem fica em branco.

import { NOMES_MESES, escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { DIAS_URGENTES, valeParaAsDivisoes } from './obrigatoriedades.js';
import { SITUACOES_ACAO } from './acoes-sociais.js';
import { soAtivos } from './movimentos.js';

export const TIPO_SOCIAL = 'Ação Social';

const dois = n => String(n).padStart(2, '0');
// (2026, 10) -> '2026-11'
export function chaveDoMes(ano, mesIndice) { return `${ano}-${dois(mesIndice + 1)}`; }

// As Acoes Sociais de um mes ('2026-11'), de todas as divisoes e do
// Regional, por data, horario e nome.
export function acoesSociaisDoMes(eventos, mes) {
  return (eventos || [])
    .filter(ev => ev.tipo === TIPO_SOCIAL && typeof ev.data === 'string' && ev.data.slice(0, 7) === mes)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || '') || String(a.nome).localeCompare(String(b.nome)));
}

export function foiRealizada(ev) { return ev.status === 'encerrado'; }

// ---------- a reuniao dos sociais (13/11/2026) ----------
//
// O Social Regional marca, pelo ➕ Registrar evento do Painel, reunioes com
// o Social de cada divisao. E um evento do Regional, tipo Reuniao, com tres
// marcas no JSON da chamada (ver METADADOS_DO_EVENTO em convocacao.js):
//   reuniaoSociais: e dela que o Painel e o relatorio de 10 dias sabem;
//   foraDoRank: nao entra em conta de presenca nenhuma (contaNoRank);
//   dispensaObrigatoriedade false: nao vale pela Reuniao do mes das divisoes.
// Nao conta no quadro das divisoes nem nas obrigatorias - so Acao Social conta.

export const TIPO_REUNIAO = 'Reunião';
export const CARGO_SOCIAL = 'Social';
export const CARGO_SOCIAL_REGIONAL = 'Social Regional';

export function ehReuniaoDosSociais(ev) {
  return !!ev && ev.tipo === TIPO_REUNIAO && !!ev.chamada && ev.chamada.reuniaoSociais === true;
}

export function reunioesSociaisDoMes(eventos, mes) {
  return (eventos || [])
    .filter(ev => ehReuniaoDosSociais(ev) && typeof ev.data === 'string' && ev.data.slice(0, 7) === mes)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || ''));
}

// Quem a reuniao convoca: o Social Regional e o Social de cada divisao (o
// cargo, do jeito que esta em Membros), so os ativos. Escopo sem ninguem
// com o cargo vai em `semSocial`, pra tela avisar - a reuniao segue sem ele.
export function convocadosDaReuniao(roster) {
  const ativos = soAtivos(roster || []);
  const membros = [], semSocial = [];
  escoposNaOrdemOficial().forEach(e => {
    const cargo = e.chave === 'regional' ? CARGO_SOCIAL_REGIONAL : CARGO_SOCIAL;
    const achados = ativos.filter(m => m.divisao === e.nome && m.cargo === cargo);
    if (achados.length) achados.forEach(m => membros.push({ membro: m, escopo: e }));
    else semSocial.push(e);
  });
  return { membros, semSocial };
}

export const ESTADOS_SOCIAL = {
  realizada: { emoji: '🏁', rotulo: 'Realizada' },
  marcada: { emoji: '📅', rotulo: 'Marcada' },
  pendente: { emoji: '⚠️', rotulo: 'Ainda não marcou' },
  'nao-fez': { emoji: '⭕', rotulo: 'Não fez' },
  futuro: { emoji: '·', rotulo: 'Ainda não chegou' },
};
export function cumpriu(estado) { return estado === 'realizada' || estado === 'marcada'; }

// A situacao de uma divisao num mes. `doMes` sao as Acoes Sociais daquele
// mes (acoesSociaisDoMes); `hoje` e a data ISO de hoje.
export function situacaoDaDivisao(doMes, chave, mes, hoje) {
  const proprias = doMes.filter(ev => ev.categoria === chave);
  const regionais = doMes.filter(valeParaAsDivisoes);
  const todas = proprias.concat(regionais);
  const mesHoje = String(hoje).slice(0, 7);
  let estado;
  if (todas.some(foiRealizada)) estado = 'realizada';
  else if (todas.length) estado = 'marcada';
  else if (mes < mesHoje) estado = 'nao-fez';
  else if (mes === mesHoje) estado = 'pendente';
  else estado = 'futuro';
  return { estado, proprias, regionais, peloRegional: !proprias.length && regionais.length > 0 };
}

// So as 6 divisoes, na ordem oficial - o Regional nao deve Acao Social a
// ninguem aqui (as obrigatorias dele sao outra conta).
function divisoes() { return escoposNaOrdemOficial().filter(e => e.chave !== 'regional'); }

// O quadro de um mes: as acoes do mes e a situacao de cada divisao. No mes
// de hoje vem tambem quantos dias faltam, e nos ultimos DIAS_URGENTES fica
// urgente (vermelho), como nas Obrigatoriedades.
export function quadroDoMes(eventos, mes, hoje) {
  const doMes = acoesSociaisDoMes(eventos, mes);
  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const atual = String(hoje).slice(0, 7) === mes;
  const diasRestantes = atual ? ultimoDia - Number(String(hoje).slice(8, 10)) : null;
  const linhas = divisoes().map(e => ({ escopo: e, ...situacaoDaDivisao(doMes, e.chave, mes, hoje) }));
  return {
    mes, ano, nomeMes: NOMES_MESES[m - 1], atual, diasRestantes,
    passado: mes < String(hoje).slice(0, 7),
    urgente: atual && diasRestantes < DIAS_URGENTES,
    acoes: doMes,
    divisoes: linhas,
    emDia: linhas.filter(l => cumpriu(l.estado)),
    faltando: linhas.filter(l => l.estado === 'pendente' || l.estado === 'nao-fez'),
  };
}

// A grade do ano: uma linha por divisao, uma celula por mes. A conta no fim
// da linha e dos meses que ja fecharam - o de hoje ainda esta correndo e nao
// entra (nem a favor nem contra).
export function gradeDoAno(eventos, ano, hoje) {
  const mesHoje = String(hoje).slice(0, 7);
  const meses = NOMES_MESES.map((_, i) => chaveDoMes(ano, i));
  const porMes = meses.map(mes => acoesSociaisDoMes(eventos, mes));
  return divisoes().map(e => {
    const celulas = meses.map((mes, i) => ({ mes, ...situacaoDaDivisao(porMes[i], e.chave, mes, hoje) }));
    const fechados = celulas.filter(c => c.mes < mesHoje);
    return { escopo: e, celulas, fechados: fechados.length, cumpridos: fechados.filter(c => cumpriu(c.estado)).length };
  });
}

// O 📋 Chamado pro grupo: quem ainda nao marcou (ou, num mes que ja
// passou, quem nao fez) e quem ja esta em dia.
export function textoChamadoSocial(q) {
  const nome = l => `*${l.escopo.nome.toUpperCase()}*`;
  const partes = [`🤝 *AÇÃO SOCIAL DE ${q.nomeMes.toUpperCase()}* 🤝`, ''];
  if (!q.faltando.length) {
    partes.push(`✅ Todas as divisões já ${q.passado ? 'fizeram' : 'marcaram'} a Ação Social de ${q.nomeMes}.`);
  } else {
    partes.push(q.passado
      ? `Divisões que não fizeram a Ação Social de ${q.nomeMes}:`
      : 'Divisões que ainda não marcaram a Ação Social do mês no calendário:');
    q.faltando.forEach(l => partes.push(`❌ ${nome(l)}`));
    if (q.emDia.length) {
      partes.push('', q.passado ? 'Fizeram:' : 'Já marcaram:');
      q.emDia.forEach(l => partes.push(`✅ ${nome(l)}${l.peloRegional ? ' (pela ação do Regional)' : ''}`));
    }
    if (q.atual) {
      partes.push('', q.diasRestantes <= 0
        ? `⏳ Hoje é o último dia de ${q.nomeMes}.`
        : `⏳ ${q.diasRestantes === 1 ? 'Falta 1 dia' : `Faltam ${q.diasRestantes} dias`} para fechar ${q.nomeMes}.`);
    }
  }
  partes.push('', 'Regra do clube: pelo menos *1 Ação Social por mês* em cada divisão.', '💀 I.S.S.I');
  return partes.join('\n');
}

// ---------- as 4 Acoes Sociais obrigatorias do Regional ----------
//
// Por ano o Regional organiza 4 (decisao do Social Regional, 10/11/2026):
// Pascoa, Dia das Criancas, Doacao de sangue e Natal. O app nao cria nada
// sozinho: ele olha se ja tem uma Acao Social DO REGIONAL marcada na janela
// de cada uma e conta quanto falta. A doacao de sangue nao tem dia fixo -
// o clube faz no fim de novembro (28/11 em 2026) - entao a data sugerida e
// o ultimo sabado de novembro, ate o evento ser marcado.
//
// Mais de uma Acao Social do Regional na janela: vale a que tem o nome da
// obrigatoria (Pascoa, crianca, sangue, Natal); sem nenhuma assim, a mais
// perto da data - e o painel avisa pra conferir se e aquela mesmo.

// Quantos dias antes a obrigatoria sem evento entra no mural, e quando
// fica vermelha.
export const DIAS_AVISO_OBRIGATORIA = 45;
export const DIAS_URGENTE_OBRIGATORIA = 15;

const isoDe = (ano, mes, dia) => `${ano}-${dois(mes)}-${dois(dia)}`;
const dataUTC = iso => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
const comDias = (iso, n) => new Date(dataUTC(iso) + n * 86400000).toISOString().slice(0, 10);
export function diasEntre(de, ate) { return Math.round((dataUTC(ate) - dataUTC(de)) / 86400000); }

// Domingo de Pascoa (calendario gregoriano, o calculo de Meeus/Butcher).
export function domingoDePascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDe(ano, mes, dia);
}

function ultimoSabadoDeNovembro(ano) {
  const d = new Date(Date.UTC(ano, 10, 30));
  d.setUTCDate(30 - ((d.getUTCDay() + 1) % 7));   // getUTCDay: 6 = sabado
  return d.toISOString().slice(0, 10);
}

export const OBRIGATORIAS_REGIONAIS = [
  { chave: 'pascoa', nome: 'Páscoa', curto: 'Páscoa', emoji: '🐣', regra: 'Domingo de Páscoa',
    nomeBate: /p[áa]scoa|chocolate/i,
    janela: ano => { const p = domingoDePascoa(ano); return { referencia: p, inicio: comDias(p, -30), fim: comDias(p, 7) }; } },
  { chave: 'criancas', nome: 'Dia das Crianças', curto: 'Crianças', emoji: '🧸', regra: '12 de outubro',
    nomeBate: /crian[çc]a/i,
    janela: ano => ({ referencia: isoDe(ano, 10, 12), inicio: isoDe(ano, 10, 1), fim: isoDe(ano, 10, 31) }) },
  { chave: 'sangue', nome: 'Doação de sangue', curto: 'Sangue', emoji: '🩸', regra: 'fim de novembro (sugestão: último sábado)',
    nomeBate: /sangue|doador|hemo/i, dataSugerida: true,
    janela: ano => ({ referencia: ultimoSabadoDeNovembro(ano), inicio: isoDe(ano, 11, 1), fim: isoDe(ano, 11, 30) }) },
  { chave: 'natal', nome: 'Natal', curto: 'Natal', emoji: '🎄', regra: '25 de dezembro',
    nomeBate: /natal|noel/i,
    janela: ano => ({ referencia: isoDe(ano, 12, 25), inicio: isoDe(ano, 12, 1), fim: isoDe(ano, 12, 31) }) },
];

// A situacao de uma obrigatoria num ano: o evento que a cumpre (ou null),
// o estado (realizada / marcada / pendente / nao-fez), a data que vale (a do
// evento ou a de referencia) e quantos dias faltam pra ela.
export function situacaoObrigatoria(ob, eventos, ano, hoje) {
  const j = ob.janela(ano);
  const perto = ev => Math.abs(diasEntre(j.referencia, ev.data));
  const candidatas = (eventos || [])
    .filter(ev => ev.tipo === TIPO_SOCIAL && ev.categoria === 'regional'
      && /^\d{4}-\d{2}-\d{2}$/.test(ev.data || '') && ev.data >= j.inicio && ev.data <= j.fim)
    .sort((a, b) => Number(ob.nomeBate.test(b.nome || '')) - Number(ob.nomeBate.test(a.nome || '')) || perto(a) - perto(b));
  const evento = candidatas[0] || null;
  let estado;
  if (evento) estado = foiRealizada(evento) ? 'realizada' : 'marcada';
  else if (hoje > j.fim) estado = 'nao-fez';
  else estado = 'pendente';
  const data = evento ? evento.data : j.referencia;
  const dias = diasEntre(hoje, data);
  return {
    ob, ...j, ano, evento, estado, data, dias,
    conferir: !!evento && !ob.nomeBate.test(evento.nome || ''),
    urgente: estado === 'pendente' && dias <= DIAS_URGENTE_OBRIGATORIA,
  };
}

export function obrigatoriasDoAno(eventos, ano, hoje) {
  return OBRIGATORIAS_REGIONAIS.map(ob => situacaoObrigatoria(ob, eventos, ano, hoje));
}

// As que entram no mural do Regional: ainda sem evento e a ate
// DIAS_AVISO_OBRIGATORIA dias (inclusive a que ja passou da data mas ainda
// esta na janela). Olha o ano de hoje e o que vem - em dezembro a Pascoa
// seguinte ainda esta longe, mas a conta fica certa de qualquer jeito.
export function obrigatoriasParaAvisar(eventos, hoje) {
  const ano = Number(String(hoje).slice(0, 4));
  return obrigatoriasDoAno(eventos, ano, hoje).concat(obrigatoriasDoAno(eventos, ano + 1, hoje))
    .filter(s => s.estado === 'pendente' && s.dias <= DIAS_AVISO_OBRIGATORIA)
    .sort((a, b) => a.dias - b.dias);
}

// "faltam 18 dias", "é amanhã", "a data passou · vale até 30/11".
export function textoPrazoObrigatoria(s) {
  if (s.estado === 'realizada') return 'feita';
  if (s.estado === 'nao-fez') return 'passou sem Ação Social do Regional';
  if (s.estado === 'marcada' && s.dias < 0) return 'já aconteceu · falta encerrar o evento';
  if (s.dias < 0) return `a data passou · ainda vale até ${s.fim.slice(8, 10)}/${s.fim.slice(5, 7)}`;
  if (s.dias === 0) return 'é hoje';
  if (s.dias === 1) return 'é amanhã';
  return `faltam ${s.dias} dias`;
}

// ---------- o relatorio de 10 em 10 dias ----------
//
// O Social Regional manda um relatorio a cada periodo: 1 a 10, 11 a 20 e 21
// ate o ultimo dia do mes (decisao de 10/11/2026, "por enquanto"). Nele vao
// as Acoes Sociais de cada divisao no periodo: qual acao (o nome do evento),
// qual divisao, qual data, e se foi feita (🏁 encerrada) ou so esta marcada.

const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// O periodo que contem a data ISO: { inicio, fim, numero (1|2|3), mes, ano }.
export function periodoDecendial(iso) {
  const [ano, m, d] = String(iso).split('-').map(Number);
  const numero = d <= 10 ? 1 : d <= 20 ? 2 : 3;
  const ultimo = new Date(ano, m, 0).getDate();
  const inicio = isoDe(ano, m, [1, 11, 21][numero - 1]);
  const fim = isoDe(ano, m, [10, 20, ultimo][numero - 1]);
  return { inicio, fim, numero, ano, mesIndice: m - 1, nomeMes: NOMES_MESES[m - 1] };
}

// O periodo anterior (-1) ou seguinte (+1).
export function periodoVizinho(p, passo) {
  return periodoDecendial(passo < 0 ? comDias(p.inicio, -1) : comDias(p.fim, 1));
}

// "01 a 10 de Novembro de 2026"
export function rotuloDoDecendio(p) {
  return `${p.inicio.slice(8, 10)} a ${p.fim.slice(8, 10)} de ${p.nomeMes} de ${p.ano}`;
}

function diaCurto(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS_SEMANA_CURTO[new Date(a, m - 1, d).getDay()]} ${dois(d)}/${dois(m)}`;
}

// O relatorio de um periodo: as acoes do Regional (quando ha) e as de cada
// uma das 6 divisoes, na ordem oficial - divisao sem nada tambem aparece,
// porque o relatorio e justamente pra mostrar quem fez.
export function relatorioDecendial(eventos, p, hoje) {
  const doPeriodo = (eventos || [])
    .filter(ev => ev.tipo === TIPO_SOCIAL && /^\d{4}-\d{2}-\d{2}$/.test(ev.data || '') && ev.data >= p.inicio && ev.data <= p.fim)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || '') || String(a.nome).localeCompare(String(b.nome)));
  const regionais = doPeriodo.filter(ev => ev.categoria === 'regional');
  const linhas = divisoes().map(e => ({ escopo: e, acoes: doPeriodo.filter(ev => ev.categoria === e.chave) }));
  // As reunioes dos sociais vao a parte: nao sao Acao Social e nao entram
  // nas contas de realizadas/marcadas.
  const reunioes = (eventos || [])
    .filter(ev => ehReuniaoDosSociais(ev) && /^\d{4}-\d{2}-\d{2}$/.test(ev.data || '') && ev.data >= p.inicio && ev.data <= p.fim)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || ''));
  return {
    periodo: p, regionais, divisoes: linhas, reunioes,
    emAndamento: hoje >= p.inicio && hoje <= p.fim,
    futuro: hoje < p.inicio,
    diasParaFechar: diasEntre(hoje, p.fim),
    realizadas: doPeriodo.filter(foiRealizada).length,
    marcadas: doPeriodo.filter(ev => !foiRealizada(ev)).length,
    semAcao: linhas.filter(l => !l.acoes.length && !regionais.some(valeParaAsDivisoes)),
  };
}

// O texto pro WhatsApp.
export function textoRelatorioDecendial(r) {
  const p = r.periodo;
  const linha = ev => `${foiRealizada(ev) ? '✅' : '📅'} ${diaCurto(ev.data)}${ev.horario ? ' ' + ev.horario : ''} · ${ev.nome}${foiRealizada(ev) ? '' : ' _(marcada, ainda não encerrada)_'}`;
  // Os detalhes da acao (as observacoes do evento - onde o ➕ Registrar do
  // Painel guarda os "Detalhes da acao social"), numa linha so, embaixo.
  const detalhes = ev => {
    const t = String(ev.outros || '').replace(/\s*\n+\s*/g, ' · ').trim();
    return t ? [`   ↳ ${t}`] : [];
  };
  const partes = [
    '🤝 *RELATÓRIO DO SOCIAL REGIONAL* 🤝',
    `📆 ${p.inicio.slice(8, 10)}/${p.inicio.slice(5, 7)} a ${p.fim.slice(8, 10)}/${p.fim.slice(5, 7)}/${p.ano} (${p.numero}º período de ${p.nomeMes})`,
  ];
  if (r.regionais.length) {
    partes.push('', `*${escopoPorChave('regional').nome.toUpperCase()}*`);
    r.regionais.forEach(ev => partes.push(linha(ev) + (valeParaAsDivisoes(ev) ? ' _(vale para todas as divisões)_' : ''), ...detalhes(ev)));
  }
  r.divisoes.forEach(l => {
    partes.push('', `*${l.escopo.nome.toUpperCase()}*`);
    if (l.acoes.length) l.acoes.forEach(ev => partes.push(linha(ev), ...detalhes(ev)));
    else partes.push('— nenhuma Ação Social no período');
  });
  if (r.reunioes && r.reunioes.length) {
    partes.push('', '📊 *REUNIÕES DOS SOCIAIS*');
    r.reunioes.forEach(ev => partes.push(linha(ev), ...detalhes(ev)));
  }
  const total = r.realizadas + r.marcadas;
  partes.push('', total
    ? `Total: ${r.realizadas} ${r.realizadas === 1 ? 'realizada' : 'realizadas'}${r.marcadas ? ` · ${r.marcadas} ${r.marcadas === 1 ? 'marcada' : 'marcadas'}, ainda não ${r.marcadas === 1 ? 'encerrada' : 'encerradas'}` : ''}`
    : 'Nenhuma Ação Social no período.');
  partes.push('💀 I.S.S.I');
  return partes.join('\n');
}

// ---------- os planejadores das divisoes (so leitura) ----------
//
// Cada divisao tem o planejador de Acoes Sociais dela (Social -> Acoes
// Sociais). O Regional so OLHA: ve o que cada uma planejou pra cada mes e em
// que pe esta. `dados` e { chave: { agenda } | { erro } }, um por divisao,
// do jeito que o carregarPlanejadoresDivisoes deixa.

const ORDEM_SITUACAO = SITUACOES_ACAO.map(s => s.chave);   // ideia -> realizada

// O que uma divisao tem num mes: as escolhidas primeiro (da mais andada pra
// menos), depois as ideias. `melhor` e a situacao mais andada do mes, ou null.
function planoDoMes(agenda, mes) {
  const doMes = (agenda || []).filter(a => a.mes === mes)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDEM_SITUACAO.indexOf(y.a.situacao) - ORDEM_SITUACAO.indexOf(x.a.situacao) || x.i - y.i)
    .map(x => x.a);
  return { itens: doMes, melhor: doMes.length ? doMes[0].situacao : null, escolhidas: doMes.filter(a => a.situacao !== 'ideia').length };
}

export function planejadoresDoMes(dados, mes) {
  return divisoes().map(e => {
    const d = (dados || {})[e.chave];
    if (!d) return { escopo: e, carregado: false, itens: [], melhor: null, escolhidas: 0 };
    if (d.erro) return { escopo: e, carregado: true, erro: d.erro, itens: [], melhor: null, escolhidas: 0 };
    return { escopo: e, carregado: true, ...planoDoMes(d.agenda, mes) };
  });
}

// Uma linha por divisao, uma celula por mes, com a situacao mais andada do
// mes. A conta e de quantos meses do ano ja tem uma acao escolhida.
export function gradePlanejadores(dados, ano) {
  const meses = NOMES_MESES.map((_, i) => chaveDoMes(ano, i));
  return divisoes().map(e => {
    const d = (dados || {})[e.chave];
    const agenda = d && !d.erro ? d.agenda : null;
    const celulas = meses.map(mes => ({ mes, melhor: agenda ? planoDoMes(agenda, mes).melhor : null }));
    return { escopo: e, carregado: !!agenda, erro: d && d.erro, celulas, mesesComAcao: celulas.filter(c => c.melhor && c.melhor !== 'ideia').length };
  });
}
