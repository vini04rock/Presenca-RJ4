// Desenha TODAS as telas e abas do app com dados falsos e avisa se alguma
// estoura ou sai vazia. Nao toca na planilha nem na internet.
//
//     node ferramentas/telas.mjs
//
// (se nao tiver Node instalado, ver ferramentas/README.md - da pra usar o
//  Node que vem embutido no VS Code)
//
// O resultado sai na tela e tambem em ferramentas/ultimo-teste.txt.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(AQUI, '..', 'js');
// "--html arquivo" grava o HTML de todas as telas nesse arquivo. Serve pra
// comparar antes/depois de uma mexida: captura, mexe, captura de novo e
// roda um diff. Diferenca que aparecer ali e mudanca de verdade na tela.
const iHtml = process.argv.indexOf('--html');
const HTML = iHtml > -1 ? process.argv[iHtml + 1] : null;
const args = process.argv.slice(2).filter((a, i, l) => a !== '--html' && l[i - 1] !== '--html');
const SAIDA = args[0] || path.join(AQUI, 'ultimo-teste.txt');
const linhas = [];
const log = (s) => { linhas.push(s); try { console.log(s); } catch (e) {} };
const url = (rel) => pathToFileURL(path.join(JS, rel)).href;

// ---------- um navegador de mentira, so o que o app usa ------------------
const escapa = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const elementos = new Map();
function novoEl(id) {
  const el = {
    id: id || '', innerHTML: '', value: '', dataset: {}, style: {}, checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, remove() {},
    appendChild() {}, removeChild() {}, insertBefore() {}, setAttribute() {},
    getAttribute() { return null; }, removeAttribute() {}, closest() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, click() {}, select() {},
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._t || ''; },
    set(v) { el._t = String(v == null ? '' : v); el.innerHTML = escapa(el._t); },
  });
  return el;
}
globalThis.document = {
  getElementById(id) {
    if (!elementos.has(id)) elementos.set(id, novoEl(id));
    return elementos.get(id);
  },
  createElement() { return novoEl(); },
  querySelectorAll() { return []; },
  execCommand() { return true; },
  body: novoEl('body'),
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, print() {}, location: { href: '' } };
// o Node ja tem um navigator nativo e so-leitura; precisa sobrescrever assim
Object.defineProperty(globalThis, 'navigator', {
  value: { sendBeacon() { return true; }, clipboard: { writeText: async () => {} } },
  configurable: true, writable: true,
});
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.fetch = () => new Promise(() => {});

// Relogio parado, so pro carimbo "Gerado em" do cabecalho de impressao (as
// duas unicas chamadas a toLocaleString no app: admin-insights.js e
// relatorios.js). Sem isso a saida muda de um segundo pro outro, e a
// comparacao antes/depois - que e o que esta ferramenta existe pra servir -
// acusa diferenca em telas que ninguem tocou. Mesmo motivo do calendario
// apontar pra um mes fixo do passado.
Date.prototype.toLocaleString = function () { return '01/01/2026, 00:00:00'; };

// ---------- 1. todo modulo carrega? --------------------------------------
function listar(dir, base = '') {
  const out = [];
  for (const nome of fs.readdirSync(path.join(dir, base))) {
    const rel = base ? base + '/' + nome : nome;
    if (fs.statSync(path.join(dir, rel)).isDirectory()) out.push(...listar(dir, rel));
    else if (nome.endsWith('.js')) out.push(rel);
  }
  return out;
}
log('=== 1. carregar cada modulo ===');
let falhasCarga = 0;
for (const m of listar(JS).sort()) {
  if (m === 'app.js') continue;   // o app.js dispara a primeira carga de rede
  try {
    await import(url(m));
  } catch (e) {
    falhasCarga++;
    log(`   FALHOU ${m}: ${e.message}`);
  }
}
log(`   ${listar(JS).length - 1} modulos, ${falhasCarga} falha(s)`);

// ---------- 2. dados de mentira ------------------------------------------
const { state } = await import(url('nucleo/estado.js'));
const membros = [
  { id:'m1', nome:'Costa',   grau:'X',    divisao:'Barra - RJ4',    funcoes:['sargento_armas'] },
  { id:'m2', nome:'Bull',    grau:'VIII', divisao:'Barra - RJ4',    funcoes:['caveira','batedor'] },
  { id:'m3', nome:'Almeida', grau:'V',    divisao:'Barra - RJ4',    funcoes:[] },
  { id:'m4', nome:'Tigre',   grau:'III',  divisao:'Recreio - RJ4',  funcoes:['combate_insanos'] },
  { id:'m5', nome:'Falcao',  grau:'I',    divisao:'Gardênia - RJ4', funcoes:[] },
  { id:'m6', nome:'Chefe',   grau:'X',    divisao:'Regional RJ4',   funcoes:[] },
];
const eventos = [
  { id:'e1', nome:'Pub do mes', data:'2026-09-05', horario:'20:00', endereco:'Rua X, 100',
    outros:'Levar capacete https://exemplo.com', status:'encerrado', criadoEm:'01/09/2026 10:00',
    categoria:'barra', tipo:'Pub', textoOriginal:'CONVOCACAO\n1. Costa (X)', memberIds:['m1','m2','m3'] },
  { id:'e2', nome:'Bate e Volta Serra', data:'2026-09-12', horario:'07:00', endereco:'Posto Y',
    outros:'', status:'ativo', criadoEm:'02/09/2026 10:00',
    categoria:'barra', tipo:'Bate e Volta', textoOriginal:'', memberIds:['m1','m2','m3'] },
  { id:'e3', nome:'Reuniao Regional', data:'2026-08-20', horario:'19:00', endereco:'Sede',
    outros:'', status:'encerrado', criadoEm:'01/08/2026 10:00',
    categoria:'regional', tipo:'Reunião', textoOriginal:'', memberIds:['m1','m4','m5','m6'] },
  { id:'e4', nome:'Acao Social', data:'2026-07-10', horario:'09:00', endereco:'Hospital Z',
    outros:'', status:'encerrado', criadoEm:'01/07/2026 10:00',
    categoria:'barra', tipo:'Ação Social', textoOriginal:'', memberIds:['m1','m2'] },
];
const st = (s, extra = {}) => Object.assign({ status:s, direto:false, destacado:false, acompanhado:false }, extra);
const presencas = {
  e1: { m1: st('confirmado', { direto:true }), m2: st('familia'), m3: st('infracional') },
  e2: { m1: st('aguardando'), m2: st('confirmado', { destacado:true, acompanhado:true }), m3: st('trabalho') },
  e3: { m1: st('confirmado'), m4: st('justificada'), m5: st('confirmado'), m6: st('infracional') },
  e4: { m1: st('confirmado'), m2: st('confirmado') },
};
const daBase = membros.filter(m => m.divisao !== 'Regional RJ4');
const rodadas = [1,2,3,4,5].map(i => ({
  id:'r'+i, data:`2026-09-0${i}`, totalSim:3+(i%3), totalElegiveis:5,
  percentual: Math.round(((3+(i%3))/5)*100),
  membros: daBase.map((m,k) => ({ id:m.id, nome:m.nome, divisao:m.divisao, fez:(k+i)%2===0 })),
}));
const insight = {
  rodadas: 5,
  membros: daBase.map((m,i) => ({ id:m.id, nome:m.nome, divisao:m.divisao, grau:m.grau,
    funcoes:m.funcoes, rodadas:5, confirmacoes:5-i, percentual:Math.round(((5-i)/5)*100) })),
  divisoes: [
    // Barra no formato do Code.gs atual (com as somas); Recreio no antigo,
    // sem elas - o app tem que desenhar os dois (ver numerosInsightDivisao).
    { chave:'barra', nome:'Barra - RJ4', totalMembros:3, fez:11, marcacoes:15, mediaPorRodada:2.2, mediaTotalPorRodada:3, percentual:73 },
    { chave:'recreio', nome:'Recreio - RJ4', totalMembros:1, mediaPorRodada:1, mediaTotalPorRodada:1, percentual:60 },
  ],
  excluidos: [{ id:'m5', nome:'Falcao', divisao:'Gardênia - RJ4' }],
};
Object.assign(state, {
  loading:false, loadError:null, roster:membros, events:eventos, reportData:presencas,
  currentEventId:'e2', currentStatus:presencas.e2, statusLoaded:true,
  estatisticas: membros.map((m,i) => ({ id:m.id, nome:m.nome, convites:4, confirmacoes:4-i,
    percentual: Math.round(((4-i)/4)*100) })),
  rankData: {
    divisoes: [
      { chave:'regional', nome:'Regional RJ4', convites:4, confirmacoes:2, percentual:50 },
      { chave:'barra',    nome:'Barra - RJ4',  convites:8, confirmacoes:6, percentual:75 },
    ],
    membros: membros.map((m,i) => ({ id:m.id, nome:m.nome, divisao:m.divisao,
      convites:4, confirmacoes:4-i, percentual:Math.round(((4-i)/4)*100) })),
  },
  insightRankData: insight, insightStats: insight, insightRodadasHistorico: rodadas,
});

// ---------- 3. desenha tudo ----------------------------------------------
const T = {};
for (const m of ['home','evento','rank','rank-insights','calendario','pin','relatorios','admin','convocacao','menu-organizador','relatorio-individual']) {
  Object.assign(T, await import(url('telas/' + m + '.js')));
}
const casos = [];
const add = (nome, patch, fn) => casos.push({ nome, patch, fn });

// O card de "proximo evento" olha a data de hoje, entao estes dois casos
// fixam a lista de eventos - senao o teste mudaria de resultado conforme os
// dias passassem, e a comparacao antes/depois acusaria diferenca que nao e
// mudanca de codigo.
add('home (raiz, sem evento futuro)', { homeEventosAberto:false, events:[] }, T.renderHome);
add('home (raiz, com proximo evento)', { homeEventosAberto:false, events:[
  { id:'f1', nome:'Bate e Volta Serra', data:'2099-12-31', horario:'07:00', endereco:'Posto Y',
    outros:'', status:'ativo', criadoEm:'01/01/2099', categoria:'barra', tipo:'Bate e Volta',
    textoOriginal:'', memberIds:['m1','m2'] },
] }, T.renderHome);
add('home (escolha divisao)',         { homeEventosAberto:true }, T.renderHome);
add('home (escolha tipo)',            { homeEventosAberto:true, homeEscopo:'barra' }, T.renderHome);
add('home (lista de eventos)',        { homeEventosAberto:true, homeEscopo:'barra', homeTipo:'todos' }, T.renderHome);
add('home (eventos regional)',        { homeEventosAberto:true, homeEscopo:'regional', homeTipo:'todos' }, T.renderHome);
add('evento',                         { currentEventId:'e2' }, T.renderEvent);
// Evento com a chamada salva: o membro ve o resumo enxuto (destino e P.E.).
add('evento (com chamada salva)',     { currentEventId:'e2', events: eventos.map(ev => ev.id === 'e2'
  ? { ...ev, chamada:{ subtitulo:'', destino:'Bandas Bar', destinoEndereco:'Av. Mal. Castelo Branco, 395',
      destinoMaps:'https://maps.app.goo.gl/x', roteiro:'',
      pes:[{ nome:'Posto Ipiranga - Cebolão', endereco:'', maps:'https://maps.app.goo.gl/y',
        concentracao:'06:00', briefing:'06:30', saida:'07:00', vias:'Av. Ayrton Senna' }] } }
  : ev) }, T.renderEvent);
add('evento (regional, agrupado)',    { currentEventId:'e3' }, T.renderEvent);
add('confirmados',                    { currentEventId:'e2' }, T.renderConfirmados);
add('rank de presenca',               { rankJanela:'sempre' }, T.renderRank);
add('rank de presenca (6 meses)',     { rankJanela:'6meses' }, T.renderRank);
add('rank insights (total)',          { insightRankTab:'total' }, T.renderRankInsights);
add('rank insights (por rodada)',     { insightRankTab:'porRodada' }, T.renderRankInsights);
add('rank insights (rodada aberta)',  { insightRankTab:'porRodada', insightRankRodadaSelecionada:'r1' }, T.renderRankInsights);
add('escolha divisao (organizador)',  {}, T.renderDivisoes);
add('pin (organizador)',              {}, T.renderPin);
add('pin (com erro)',                 { pinErro:'PIN incorreto.' }, T.renderPin);
add('pin (verificando)',              { pinVerificando:true }, T.renderPin);
add('calendario (escolha)',           {}, T.renderCalendarioDivisoes);
// Julho/2026 de proposito, nao o mes atual: o calendario marca o dia de
// hoje, entao usar o mes corrente faria o HTML mudar todo dia e sujar a
// comparacao antes/depois. Julho tem um evento nos dados falsos (a Acao
// Social do dia 10), entao a grade sai com conteudo mesmo assim.
const cal = { calendarioEscopo:'barra', calendarioAno:2026, calendarioMes:6 };
add('calendario (grade)',             { ...cal }, T.renderCalendario);
add('calendario / com dias vazios marcado', { ...cal, calendarioDiasVazios:true }, T.renderCalendario);
add('calendario (organizar: pin)',    { ...cal, calendarioOrganizarEtapa:'pin' }, T.renderCalendario);
add('calendario (pin com erro)',      { ...cal, calendarioOrganizarEtapa:'pin', calendarioPinErro:'PIN incorreto.' }, T.renderCalendario);
add('calendario (org: adicionar)',    { ...cal, calendarioOrganizarEtapa:'texto', calendarioOrganizarSubTab:'adicionar' }, T.renderCalendario);
add('calendario (org: editar)',       { ...cal, calendarioOrganizarEtapa:'texto', calendarioOrganizarSubTab:'editar' }, T.renderCalendario);
// A Acao Social dos dados falsos e 10/07/2026 - com ela selecionada, o campo
// de data da edicao aparece preenchido, que e o que prova a ida e volta
// (ISO no state -> dd/mm/aaaa na tela).
add('calendario (org: editar, com data)', { ...cal, calendarioOrganizarEtapa:'texto',
  calendarioOrganizarSubTab:'editar', calendarioEditandoData:'2026-07-10',
  calendarioAjustandoData:true }, T.renderCalendario);
// Aviso de evento proximo. Ao contrario do resto do arquivo, estes casos
// NAO podem ter data fixa: o aviso so existe pra evento entre hoje e 2 dias
// a frente, entao a data tem que andar junto com o relogio. Isso faz o HTML
// deles mudar de um dia pro outro (a data e o "e amanha" aparecem no texto)
// - e esperado, e nao atrapalha a comparacao antes/depois, que sempre roda
// nas duas pontas no mesmo dia.
const daquiA = (n) => { const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const evProximo = { id:'ep1', nome:'Bate e Volta Serra', data:daquiA(1), horario:'07:00',
  endereco:'Posto Y', outros:'', status:'ativo', criadoEm:'01/09/2026',
  categoria:'barra', tipo:'Bate e Volta', textoOriginal:'', memberIds:['m1','m2','m3'] };

add('organizador / menu (evento amanhã, 2 faltando)', { isAdmin:true, adminEscopo:'barra',
  events:[evProximo], reportData:{ ep1:{ m1:{ status:'confirmado' } } } }, T.renderMenuOrganizador);
add('organizador / menu (evento amanhã, todos responderam)', { isAdmin:true, adminEscopo:'barra',
  events:[evProximo], reportData:{ ep1:{ m1:{ status:'confirmado' }, m2:{ status:'familia' },
  m3:{ status:'trabalho' } } } }, T.renderMenuOrganizador);
add('organizador / menu (presenças ainda carregando)', { isAdmin:true, adminEscopo:'barra',
  events:[evProximo], reportData:{} }, T.renderMenuOrganizador);
// Mais avisos do que cabem: o mural tem altura de 2 linhas, entao com 3
// eventos na janela ele tem que rolar por dentro em vez de crescer e
// empurrar as secoes pra fora da tela. Um de cada dia da janela - hoje,
// amanha e depois - que e o pior caso real.
const evHoje = { ...evProximo, id:'ep2', nome:'Reunião de Diretoria', data:daquiA(0),
  horario:'20:00', tipo:'Reunião' };
const evDepois = { ...evProximo, id:'ep3', nome:'Entrega de Alimentos na Fundação Angélica Goulart',
  data:daquiA(2), horario:'09:00', tipo:'Ação Social' };
add('organizador / menu (mural transbordando)', { isAdmin:true, adminEscopo:'barra',
  events:[evHoje, evProximo, evDepois],
  reportData:{ ep1:{ m1:{ status:'confirmado' } }, ep2:{}, ep3:{ m1:{ status:'confirmado' },
    m2:{ status:'familia' }, m3:{ status:'trabalho' } } } }, T.renderMenuOrganizador);
const entradaParaHonraria = dias => {
  const d = new Date(); d.setDate(d.getDate() + dias); d.setFullYear(d.getFullYear() - 3);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
add('organizador / menu (medalha em 42 dias)', { isAdmin:true, adminEscopo:'barra', events:[],
  roster:membros.map(m => m.id === 'm1' ? { ...m, entrada:entradaParaHonraria(42) } : m) }, T.renderMenuOrganizador);
add('organizador / menu (grau a confirmar)', { isAdmin:true, adminEscopo:'barra', events:[],
  roster:membros.map(m => m.id === 'm1' || m.id === 'm3' ? { ...m, grauPendente:true } : m) }, T.renderMenuOrganizador);
add('organizador / menu (medalha hoje)', { isAdmin:true, adminEscopo:'barra', events:[],
  roster:membros.map(m => m.id === 'm2' ? { ...m, entrada:entradaParaHonraria(0), situacao:'afastado' } : m) }, T.renderMenuOrganizador);
add('organizador / menu (regional vê medalhas da RJ4)', { isAdmin:true, adminEscopo:'regional', events:[],
  roster:membros.map((m, i) => i < 2 ? { ...m, entrada:entradaParaHonraria(10 + i) } : m) }, T.renderMenuOrganizador);
add('organizador / menu (evento urgente antes da medalha)', { isAdmin:true, adminEscopo:'barra', events:[evProximo],
  roster:membros.map(m => m.id === 'm1' ? { ...m, entrada:entradaParaHonraria(5) } : m), reportData:{ ep1:{} } }, T.renderMenuOrganizador);
// O mural vazio ("Nenhum aviso no momento") ja e desenhado pelos tres casos
// logo abaixo: os eventos dos dados falsos tem data fixa e nenhum cai na
// janela, entao o menu de qualquer divisao nasce com o mural vazio.
add('organizador / menu (regional)', { isAdmin:true, adminEscopo:'regional' }, T.renderMenuOrganizador);
// Obrigatoriedades do mes (so no Regional): o card olha o mes de HOJE, entao
// os eventos daqui tambem andam com o relogio, como os do mural acima.
const evMes = (categoria, tipo) => ({ ...evProximo, id:'ob-' + categoria + tipo, nome:tipo + ' ' + categoria, categoria, tipo, data:daquiA(0) });
add('organizador / obrigatoriedades (com pendências)', { isAdmin:true, adminEscopo:'regional',
  events:[evMes('barra', 'Pub'), evMes('barra', 'Reunião'), evMes('regional', 'Bate e Volta')] }, T.renderMenuOrganizador);
add('organizador / obrigatoriedades (divisão aberta)', { isAdmin:true, adminEscopo:'regional', obrigatoriedadeAberta:'barra',
  events:[evMes('barra', 'Pub'), evMes('barra', 'Reunião'), evMes('regional', 'Bate e Volta')] }, T.renderMenuOrganizador);
add('organizador / obrigatoriedades (tudo em dia)', { isAdmin:true, adminEscopo:'regional',
  events:['barra', 'oeste', 'recreio', 'curicica', 'taquara', 'gardenia'].flatMap(c =>
    ['Reunião', 'Pub', 'Bate e Volta', 'Ação Social'].map(t => evMes(c, t))) }, T.renderMenuOrganizador);
add('organizador / menu (barra)',    { isAdmin:true, adminEscopo:'barra' }, T.renderMenuOrganizador);
add('organizador / menu (oeste)',    { isAdmin:true, adminEscopo:'oeste' }, T.renderMenuOrganizador);
add('organizador / área ADM (regional)', { isAdmin:true, adminEscopo:'regional', organizadorArea:'adm' }, T.renderMenuOrganizador);
add('organizador / área Operacional (regional)', { isAdmin:true, adminEscopo:'regional', organizadorArea:'operacional' }, T.renderMenuOrganizador);
add('organizador / área Social (regional)', { isAdmin:true, adminEscopo:'regional', organizadorArea:'social' }, T.renderMenuOrganizador);
add('organizador / área ADM (oeste)', { isAdmin:true, adminEscopo:'oeste', organizadorArea:'adm' }, T.renderMenuOrganizador);
add('organizador / área Operacional (oeste)', { isAdmin:true, adminEscopo:'oeste', organizadorArea:'operacional' }, T.renderMenuOrganizador);
for (const aba of ['eventos','membros','encerrados','presencas','insights','insights-rodadas','insights-relatorio']) {
  add(`organizador / ${aba}`, { isAdmin:true, adminEscopo:'regional', adminTab:aba }, T.renderAdmin);
}
// As rodadas de mentira sao 01 a 05/09/2026 (ver "rodadas" la em cima).
add('organizador / insights-relatorio (periodo)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights-relatorio', insightFiltroDataInicio:'2026-09-02', insightFiltroDataFim:'2026-09-04' }, T.renderAdmin);
add('organizador / insights-relatorio (periodo vazio)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights-relatorio', insightFiltroDataInicio:'2026-01-01', insightFiltroDataFim:'2026-01-31' }, T.renderAdmin);
// Campo de data da rodada de Insight - so existe com "Registrar com outra
// data" aberto, por isso nao aparecia em teste nenhum.
add('organizador / insights (outra data)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights', insightMostrarDataCustom:true, insightDataEscolhida:'2026-09-21' }, T.renderAdmin);
// Evento sendo editado: o formulario nasce com o que o evento tem (ver
// abrirFormulario em telas/admin-eventos.js), inclusive os quadros da chamada.
const chamadaFalsa = { subtitulo:'', destino:'Bandas Bar - Paraíba do Sul', destinoEndereco:'Av. Mal. Castelo Branco, 395',
  destinoMaps:'https://maps.app.goo.gl/x', roteiro:'',
  pes:[{ nome:'Posto Ipiranga - Cebolão', endereco:'', maps:'https://maps.app.goo.gl/y',
    concentracao:'06:00', briefing:'06:30', saida:'07:00', vias:'Av. Ayrton Senna' },
    { nome:'Casa do Alemão', endereco:'BR-040, km 111', maps:'', concentracao:'08:00', briefing:'', saida:'09:00', vias:'' }] };
add('organizador / editar evento',    { isAdmin:true, adminEscopo:'barra', adminTab:'eventos',
  editingEventId:'e1', newEventSelected:new Set(['m1']), newEventTipo:'Pub',
  newEventForm:{ nome:'Pub do mes', data:'05/09/2026', horario:'20:00', outros:'' },
  newEventChamada:{ ...chamadaFalsa, tipo:'Pub', horario:'20:00h' } }, T.renderAdmin);
// Com uma rodada em ajuste, a aba "Nova rodada" tem que continuar sendo a de
// CRIAR - antes ela era sequestrada pelo painel de ajuste.
add('organizador / nova rodada (com ajuste aberto)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights', insightEditandoRodadaId:'r3',
  insightAjusteMembroIds:['m1','m2'],
  insightAjusteInfo:{ m1:{nome:'Costa',divisao:'Barra - RJ4'}, m2:{nome:'Bull',divisao:'Barra - RJ4'} } }, T.renderAdmin);
// Depois de ajustar, a confirmacao tem que aparecer na aba das rodadas - e
// NAO na de criar, que e onde ela era desenhada antes.
add('organizador / rodadas (ajuste salvo)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights-rodadas', insightResultado:{ ajuste:true, percentual:80, totalSim:4, totalElegiveis:5 } }, T.renderAdmin);
add('organizador / nova rodada (criada)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights', insightResultado:{ ajuste:false, percentual:60, totalSim:3, totalElegiveis:5 } }, T.renderAdmin);
// O evento e1 dos dados falsos tem textoOriginal (nasceu de convocacao
// colada), entao e nele que "Corrigir" e "Ver texto original" aparecem.
add('organizador / encerrados (texto original)', { isAdmin:true, adminEscopo:'barra',
  adminTab:'encerrados', relatorioTextoOriginalExpandido:new Set(['e1']) }, T.renderAdmin);
// Divisao sem Relatorios (Oeste): "Ver texto original" fica, "Corrigir" nao -
// ele leva pra tela de Relatorios, que essa divisao nao acessa. Precisa de um
// evento encerrado proprio, com textoOriginal, que os dados falsos nao tem.
add('organizador / encerrados (sem corrigir)', { isAdmin:true, adminEscopo:'oeste',
  adminTab:'encerrados', relatorioTextoOriginalExpandido:new Set(['eo1']),
  events:[{ id:'eo1', nome:'Pub do Oeste', data:'2026-09-05', horario:'20:00',
    endereco:'Bar X', outros:'', status:'encerrado', criadoEm:'01/09/2026',
    categoria:'oeste', tipo:'Pub', textoOriginal:'CONVOCACAO\n1. Fulano (X)',
    memberIds:['m1'] }] }, T.renderAdmin);
add('organizador / membros (grau VI)', { isAdmin:true, adminEscopo:'barra', adminTab:'membros',
  newMemberGrau:'VI' }, T.renderAdmin);
add('organizador / eventos (barra)',  { isAdmin:true, adminEscopo:'barra', adminTab:'eventos' }, T.renderAdmin);
const peFalso = (nome, extra) => ({ nome, endereco:'', maps:'https://maps.app.goo.gl/x',
  concentracao:'06:00', briefing:'06:30', saida:'07:00', ...extra });
add('criar chamada (divisão, preenchida)', { convocacaoEventoId:'e1',
  convocacaoCampos:{ tipo:'Pub', subtitulo:'Aniversariantes do mês', destino:'Bar do Zé',
    horario:'19:30', pes:[peFalso('Posto Ipiranga - Cebolão')],
    destinoEndereco:'Barra da Tijuca', destinoMaps:'https://maps.app.goo.gl/x', roteiro:'' },
  convocacaoResponsavel:{ nome:'Tedboy', cargo:'Subdiretor Divisão Barra', telefone:'21 90000-0000' } },
  T.renderConvocacao);
add('criar chamada (campos vazios)',  { convocacaoEventoId:'e2', convocacaoCampos:{} }, T.renderConvocacao);
add('criar chamada (regional, 2 P.E.)', { convocacaoEventoId:'e3',
  convocacaoCampos:{ tipo:'Bate e Volta', subtitulo:'Inauguração Divisão Paraíba do Sul',
    destino:'Bandas Bar - Paraíba do Sul', horario:'07:00',
    pes:[peFalso('Posto Ipiranga - Cebolão'),
      peFalso('Integração com Bonde RJ3\nCasa do Alemão', { endereco:'Rodovia Washington Luiz, Km 111' })],
    destinoEndereco:'Av. Mal. Castelo Branco, 395', destinoMaps:'', roteiro:'Seguir pela BR-040.' },
  convocacaoResponsavel:{ nome:'Bull', cargo:'Operacional RJ4', telefone:'21 90000-0000' } },
  T.renderConvocacao);
// O Regional ve o botao de personalizar regras e atencao; aqui, com as regras
// abertas para edicao e a atencao ja personalizada.
add('criar chamada (regional editando regras)', { adminEscopo:'regional', convocacaoEventoId:'e3',
  convocacaoCampos:{ pes:[peFalso('Posto Ipiranga', { vias:'Av. Ayrton Senna' })] },
  convocacaoTextos:{ atencao:'⚠️ ATENÇÃO ⚠️\n\nTexto novo' },
  convocacaoTextoEditando:'regras', convocacaoTextoRascunho:'Prazo: 2 dias antes.' }, T.renderConvocacao);
add('criar chamada (texto salvo)', { adminEscopo:'regional', convocacaoEventoId:'e3', convocacaoCampos:{ pes:[] },
  convocacaoTextoMsg:{ chave:'regras', texto:'✅ Salvo para a RJ4 inteira.' } }, T.renderConvocacao);
add('criar chamada (buscando responsável)', { convocacaoEventoId:'e3', convocacaoCampos:{ pes:[] },
  convocacaoRespEstado:'carregando' }, T.renderConvocacao);
add('criar chamada (responsável não carregou)', { convocacaoEventoId:'e2', convocacaoCampos:{ pes:[] },
  convocacaoRespEstado:'erro', convocacaoRespMsg:'Não consegui salvar: Falha de conexao.' }, T.renderConvocacao);
add('organizador / novo evento',      { isAdmin:true, adminEscopo:'barra', adminTab:'eventos',
  newEventSelected:new Set(['m1']), newEventTipo:'Pub',
  newEventForm:{ nome:'', data:'', horario:'', outros:'' },
  newEventChamada:{ subtitulo:'', destino:'', destinoEndereco:'', destinoMaps:'', roteiro:'',
    pes:[{ nome:'', endereco:'', maps:'', concentracao:'', briefing:'', saida:'', vias:'' }] } }, T.renderAdmin);
// Sem o formulario aberto pelo botao (estado antigo, ou vindo de outra aba):
// desenha vazio em vez de quebrar.
add('organizador / novo evento (sem estado do formulário)', { isAdmin:true, adminEscopo:'regional', adminTab:'eventos',
  newEventSelected:new Set(), newEventTipo:null }, T.renderAdmin);
add('organizador / ajustar rodada',   { isAdmin:true, adminEscopo:'regional', adminTab:'insights-rodadas',
  insightEditandoRodadaId:'r1', insightAjusteMembroIds:['m1','m2'],
  insightAjusteInfo:{ m1:{nome:'Costa',divisao:'Barra - RJ4'}, m2:{nome:'Bull',divisao:'Barra - RJ4'} } }, T.renderAdmin);
// A aba "Adicionar" do painel de ajuste: m3 (Almeida) esta elegivel e nao
// esta nesta rodada, entao tem que aparecer como candidato.
add('organizador / ajustar rodada (aba adicionar)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights-rodadas', insightEditandoRodadaId:'r3', insightAjusteMostrarAdicionar:true,
  insightAjusteMembroIds:['m1','m2'], insightMarcacoes:{ m1:true, m2:false },
  insightAjusteInfo:{ m1:{nome:'Costa',divisao:'Barra - RJ4'}, m2:{nome:'Bull',divisao:'Barra - RJ4'} } }, T.renderAdmin);
// Ninguem sobrando pra adicionar: os CINCO elegiveis (as tres da Barra mais
// Tigre e Falcao - o Regional nao faz insight) ja estao na rodada.
add('organizador / ajustar rodada (nada a adicionar)', { isAdmin:true, adminEscopo:'regional',
  adminTab:'insights-rodadas', insightEditandoRodadaId:'r3', insightAjusteMostrarAdicionar:true,
  insightAjusteMembroIds:['m1','m2','m3','m4','m5'],
  insightMarcacoes:{ m1:true, m2:false, m3:false, m4:true, m5:false },
  insightAjusteInfo:{ m1:{nome:'Costa',divisao:'Barra - RJ4'}, m2:{nome:'Bull',divisao:'Barra - RJ4'},
    m3:{nome:'Almeida',divisao:'Barra - RJ4'}, m4:{nome:'Tigre',divisao:'Recreio - RJ4'},
    m5:{nome:'Falcao',divisao:'Gardênia - RJ4'} } }, T.renderAdmin);
for (const aba of ['resumo','enviar','Pub','Bate e Volta','Reunião','Ação Social']) {
  add(`relatorios / ${aba}`, { isAdmin:true, adminEscopo:'regional',
    relatorioCategoriaAlvo:'regional', relatorioTab:aba, relatorioFiltroDivisao:'todas' }, T.renderRelatorioShell);
}
add('relatorios / resumo (so barra)', { isAdmin:true, adminEscopo:'barra',
  relatorioCategoriaAlvo:'barra', relatorioTab:'resumo' }, T.renderRelatorioShell);
// "Ver eventos" do Presença total: no Regional com todas as divisões sai
// agrupado por divisão; numa divisão só, a lista de sempre, sem títulos.
// O período de 12 meses é fixo para o resultado não mudar com o calendário.
add('relatorios / presença total (por divisão)', { isAdmin:true, adminEscopo:'regional',
  relatorioCategoriaAlvo:'regional', relatorioTab:'resumo', relatorioFiltroDivisao:'todas',
  relatorioTipoDetalhe:'total', relatorioPeriodoPorGrafico:{ total:12 } }, T.renderRelatorioShell);
add('relatorios / presença total (so barra)', { isAdmin:true, adminEscopo:'barra',
  relatorioCategoriaAlvo:'barra', relatorioTab:'resumo',
  relatorioTipoDetalhe:'total', relatorioPeriodoPorGrafico:{ total:12 } }, T.renderRelatorioShell);
// Revisao da convocacao colada - tem o campo de data do evento.
add('relatorios / revisão do colado', { isAdmin:true, adminEscopo:'barra',
  relatorioTab:'enviar', relatorioColarStep:'revisao', relatorioCategoriaAlvo:'barra',
  relatorioParsed:{ avisos:[], evento:{ nome:'Pub de teste', data:'2026-09-21', tipo:'Pub' },
    membrosParsed:[{ nome:'Costa', membroId:'m1', status:'confirmado', sugestoes:[], ignorado:false }] } },
  T.renderRelatorioShell);
add('relatorios / ficha do membro',   { isAdmin:true, adminEscopo:'regional',
  relatorioTab:'resumo', relatorioMembroFichaId:'m1' }, T.renderRelatorioShell);
add('relatorios / detalhe por tipo',  { isAdmin:true, adminEscopo:'regional',
  relatorioTab:'resumo', relatorioTipoDetalhe:'Pub' }, T.renderRelatorioShell);
// Relatorio individual. Os dados imitam a resposta do Code.gs
// (relatorioIndividual): Costa foi convocado pra Pub e Reuniao da Barra e
// pra um evento do Regional, nunca pra Bate e Volta - esse bloco nao pode
// aparecer.
const relInd = {
  ok: true,
  membro: { id:'m1', nome:'Costa', grau:'VI', cargo:'Diretor', divisao:'Barra - RJ4', funcoes:['sargento_armas'] },
  eventos: [
    { id:'e1', nome:'Pub do mes', data:'2026-07-05', tipo:'Pub', categoria:'barra', status:'confirmado' },
    { id:'e4', nome:'Acao Social', data:'2026-07-10', tipo:'Ação Social', categoria:'barra', status:'familia' },
    { id:'e7', nome:'Pub de agosto', data:'2026-08-05', tipo:'Pub', categoria:'barra', status:'infracional' },
    { id:'e3', nome:'Reuniao Regional', data:'2026-08-20', tipo:'Reunião', categoria:'regional', status:'confirmado' },
  ],
  insight: { elegivel:true, rodadas:[
    { id:'r1', data:'2026-07-02', fez:true }, { id:'r2', data:'2026-07-09', fez:false },
    { id:'r3', data:'2026-08-02', fez:true },
  ] },
};
const org = { isAdmin:true, view:'relatorio-individual' };
add('relatório individual / lista (barra)',     { ...org, adminEscopo:'barra' }, T.renderRelatorioIndividual);
add('relatório individual / lista (regional)',  { ...org, adminEscopo:'regional',
  relIndDivisoesAbertas:new Set(['barra']) }, T.renderRelatorioIndividual);
add('relatório individual / divisão sem ninguém', { ...org, adminEscopo:'taquara' }, T.renderRelatorioIndividual);
add('relatório individual / carregando',        { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndCarregando:true }, T.renderRelatorioIndividual);
add('relatório individual / erro',              { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndErro:'A conexao demorou demais' }, T.renderRelatorioIndividual);
add('relatório individual / completo',          { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndDados:relInd }, T.renderRelatorioIndividual);
// Com a data de ingresso: a carteirinha mostra desde quando e o tempo de
// clube (que anda com o relogio - muda de um mes pro outro, e esta certo).
add('relatório individual / com ingresso',      { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndDados:{ ...relInd, membro:{ ...relInd.membro, entrada:'2019-03-12' } } }, T.renderRelatorioIndividual);
add('relatório individual / só agosto',         { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndDados:relInd, relIndFiltroInicio:'2026-08-01', relIndFiltroFim:'2026-08-31' }, T.renderRelatorioIndividual);
add('relatório individual / nada no período',   { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndDados:{ ...relInd, insight:{ elegivel:false, rodadas:[] } },
  relIndFiltroInicio:'2026-01-01', relIndFiltroFim:'2026-01-31' }, T.renderRelatorioIndividual);
add('relatório individual / do Regional',       { ...org, adminEscopo:'regional', relIndMembroId:'m6',
  relIndDados:{ ok:true, membro:{ id:'m6', nome:'Chefe', grau:'X', divisao:'Regional RJ4', funcoes:[] },
    eventos:[relInd.eventos[3]], insight:{ elegivel:false, rodadas:[] } } }, T.renderRelatorioIndividual);
add('relatório individual / copiado',           { ...org, adminEscopo:'barra', relIndMembroId:'m1',
  relIndDados:relInd, relIndCopiado:true }, T.renderRelatorioIndividual);
// Exportar varios em PDF.
add('relatório individual / seleção (barra)',   { ...org, adminEscopo:'barra', relIndSelecionando:true,
  relIndMarcados:new Set(['m1']) }, T.renderRelatorioIndividual);
add('relatório individual / seleção (regional)', { ...org, adminEscopo:'regional', relIndSelecionando:true,
  relIndDivisoesAbertas:new Set(['barra']), relIndMarcados:new Set(['m1', 'm6']) }, T.renderRelatorioIndividual);
add('relatório individual / seleção vazia',     { ...org, adminEscopo:'barra', relIndSelecionando:true }, T.renderRelatorioIndividual);
add('relatório individual / montando vários',   { ...org, adminEscopo:'barra', relIndSelecionando:true,
  relIndMarcados:new Set(['m1']), relIndVariosCarregando:true }, T.renderRelatorioIndividual);
add('relatório individual / erro em vários',    { ...org, adminEscopo:'barra', relIndSelecionando:true,
  relIndMarcados:new Set(['m1']), relIndVariosErro:'Acao desconhecida: relatorioIndividualVarios' }, T.renderRelatorioIndividual);
add('relatório individual / folha de vários',   { ...org, adminEscopo:'regional', relIndSelecionando:true,
  relIndMarcados:new Set(['m1', 'm6', 'sumiu']),
  relIndVarios:[relInd, { ok:true, membro:{ id:'m6', nome:'Chefe', grau:'X', divisao:'Regional RJ4', funcoes:[] },
    eventos:[relInd.eventos[3]], insight:{ elegivel:false, rodadas:[] } }] }, T.renderRelatorioIndividual);
add('relatório individual / folha vazia',       { ...org, adminEscopo:'barra', relIndSelecionando:true,
  relIndMarcados:new Set(['sumiu']), relIndVarios:[] }, T.renderRelatorioIndividual);

// Doacoes e Caixinha (so na Barra). Os dados imitam o que o Code.gs devolve
// (lerDoacoes / lerCaixinha). Periodo "desde sempre" (0) nos ranks, pra
// saida nao depender do dia em que o teste roda.
const doacoesFalsas = { eventos: [
  { id:'e1', nome:'Pub do mes', data:'2026-09-05', tipo:'Pub', status:'encerrado',
    convocados:['m1','m2','m3'], confirmados:['m1','m3'], doacoes:{ m1:1, m3:2 } },
  { id:'e2', nome:'Bate e Volta Serra', data:'2026-09-12', tipo:'Bate e Volta', status:'ativo',
    convocados:['m1','m2','m3'], confirmados:['m2'], doacoes:{} },
  { id:'e4', nome:'Acao Social', data:'2026-07-10', tipo:'Ação Social', status:'encerrado',
    convocados:['m1','m2'], confirmados:['m1','m2'], doacoes:{ m1:1 } },
], nomes:{ m1:'Costa', m3:'Almeida' },
  estoque:{
    itens:[{ id:'alimentos-barra', nome:'Alimentos (dos eventos)', medida:'kg', automatico:true, saldo:23.5 },
      { id:'it1', nome:'Cobertor', medida:'un', saldo:12 }, { id:'it2', nome:'Sapato', medida:'par', saldo:6 }, { id:'it3', nome:'Blusa', medida:'un', saldo:0 }],
    movimentos:[
      { id:'v6', data:'2026-10-05', tipo:'saida', itemId:'alimentos-barra', item:'Alimentos (dos eventos)', medida:'kg', quantidade:1.5, origem:'', destino:'familia', descricao:'', eventoId:'', anulado:false },
      { id:'v5', data:'2026-10-04', tipo:'saida', itemId:'it1', item:'Cobertor', medida:'un', quantidade:3, origem:'', destino:'instituicao', descricao:'Abrigo São José', eventoId:'', anulado:true },
      { id:'v4', data:'2026-10-02', tipo:'correcao', itemId:'alimentos-barra', item:'Alimentos (dos eventos)', medida:'kg', quantidade:-1, origem:'evento', destino:'', descricao:'Correção · Pub', eventoId:'e1', anulado:false },
      { id:'v3', data:'2026-09-20', tipo:'entrada', itemId:'alimentos-barra', item:'Alimentos (dos eventos)', medida:'kg', quantidade:6, origem:'avulsa', destino:'', descricao:'família do Costa', eventoId:'', anulado:false },
      { id:'v2', data:'2026-09-12', tipo:'entrada', itemId:'alimentos-barra', item:'Alimentos (dos eventos)', medida:'kg', quantidade:20, origem:'evento', destino:'', descricao:'Pub', eventoId:'e1', anulado:false },
      { id:'v1', data:'2026-09-01', tipo:'entrada', itemId:'it1', item:'Cobertor', medida:'un', quantidade:12, origem:'avulsa', destino:'', descricao:'', eventoId:'', anulado:false },
      { id:'v0', data:'2026-09-01', tipo:'entrada', itemId:'it2', item:'Sapato', medida:'par', quantidade:6, origem:'avulsa', destino:'', descricao:'', eventoId:'', anulado:false },
    ] } };
const caixinhaFalsa = { meses: [
  { mes:'2026-10', membros:[{ id:'m1', nome:'Costa', pagou:true, valor:30 }, { id:'m2', nome:'Bull', pagou:false, valor:0 }, { id:'m3', nome:'Almeida', pagou:true, valor:35.5 }] },
  // m9 saiu do clube: aparece pelo nome gravado no mes.
  { mes:'2026-09', membros:[{ id:'m1', nome:'Costa', pagou:true, valor:30 }, { id:'m2', nome:'Bull', pagou:false, valor:0 }, { id:'m9', nome:'Antigo', pagou:false, valor:0 }] },
  // Antes do saldo inicial: fica de fora da conta do caixa.
  { mes:'2026-07', membros:[{ id:'m1', nome:'Costa', pagou:true, valor:30 }] },
],
  saldoInicial:{ mes:'2026-08', valor:175 },
  lancamentos:[
    { id:'l1', tipo:'saida', data:'2026-10-05', categoria:'Kit Churrasco / lanches', descricao:'Carne do pub', valor:120.5 },
    { id:'l2', tipo:'entrada', data:'2026-09-15', categoria:'Outras entradas', descricao:'Rifa', valor:50 },
    { id:'l3', tipo:'saida', data:'2026-09-10', categoria:'Material gráfico', descricao:'', valor:20 },
  ] };
const caixaVazio = { meses:[], saldoInicial:null, lancamentos:[] };
const dc = { isAdmin:true, adminEscopo:'barra', doacoesDados:doacoesFalsas, doacoesDadosEscopo:'barra',
  caixinhaDados:caixinhaFalsa, caixinhaDadosEscopo:'barra', doacoesPeriodo:0, caixinhaPeriodo:0 };
add('doações / por evento',            { ...dc, adminTab:'doacoes' }, T.renderAdmin);
add('doações / por evento (salvo)',    { ...dc, adminTab:'doacoes', doacoesMsg:{ ok:true, texto:'✅ Pub do mes: 2 integrantes levaram 3 kg.' } }, T.renderAdmin);
add('doações / marcando um evento',    { ...dc, adminTab:'doacoes', doacoesEventoId:'e1', doacoesMarcacoes:{ m1:1, m3:2 } }, T.renderAdmin);
add('doações / marcando (erro ao salvar)', { ...dc, adminTab:'doacoes', doacoesEventoId:'e2', doacoesMarcacoes:{},
  doacoesMsg:{ ok:false, texto:'Não consegui salvar: Falha de conexao.' } }, T.renderAdmin);
add('doações / rank',                  { ...dc, adminTab:'doacoes-rank' }, T.renderAdmin);
add('doações / rank sem nada',         { ...dc, adminTab:'doacoes-rank', doacoesDados:{ eventos:[], nomes:{} } }, T.renderAdmin);
add('doações / sem eventos',           { ...dc, adminTab:'doacoes', doacoesDados:{ eventos:[], nomes:{} } }, T.renderAdmin);
add('doações / carregando',            { ...dc, adminTab:'doacoes', doacoesDados:null }, T.renderAdmin);
// Dados de outra divisao na memoria: nao podem aparecer dentro da Barra.
add('doações / dados de outra divisão', { ...dc, adminTab:'doacoes', doacoesDadosEscopo:'oeste' }, T.renderAdmin);
add('doações / erro',                  { ...dc, adminTab:'doacoes', doacoesErro:'A conexao demorou demais' }, T.renderAdmin);
add('estoque / painel (alimentos)',      { ...dc, adminTab:'doacoes-estoque' }, T.renderAdmin);
add('estoque / painel de outro item',    { ...dc, adminTab:'doacoes-estoque', estoqueItemId:'it1' }, T.renderAdmin);
add('estoque / confirmando anular',      { ...dc, adminTab:'doacoes-estoque', estoqueItemId:'it1', estoqueAnularId:'v1' }, T.renderAdmin);
add('estoque / alimentos em 0 kg',       { ...dc, adminTab:'doacoes-estoque',
  doacoesDados:{ eventos:[], nomes:{}, estoque:{ itens:[{ id:'alimentos-barra', nome:'Alimentos (dos eventos)', medida:'kg', automatico:true, saldo:0 }], movimentos:[] } } }, T.renderAdmin);
add('estoque / lançando entrada',        { ...dc, adminTab:'doacoes-estoque', estoqueForm:{ tipo:'entrada', itemId:'it1', itemNome:'', medida:'un',
  medidaManual:false, quantidade:'4', data:'18/10/2026', destino:'', descricao:'' } }, T.renderAdmin);
add('estoque / entrada de item novo',    { ...dc, adminTab:'doacoes-estoque', estoqueForm:{ tipo:'entrada', itemId:'novo', itemNome:'Arroz', medida:'kg',
  medidaManual:false, quantidade:'2,5', data:'', destino:'', descricao:'' } }, T.renderAdmin);
add('estoque / lançando saída',          { ...dc, adminTab:'doacoes-estoque', estoqueForm:{ tipo:'saida', itemId:'alimentos-barra', itemNome:'', medida:'un',
  medidaManual:false, quantidade:'3', data:'18/10/2026', destino:'outro', descricao:'' }, estoqueMsg:{ ok:false, texto:'Escreva pra onde foi.' } }, T.renderAdmin);
add('estoque / relatório (tudo)',        { ...dc, adminTab:'doacoes-estoque', estoqueRelatorio:true, estoquePeriodo:0 }, T.renderAdmin);
add('estoque / relatório de um mês',     { ...dc, adminTab:'doacoes-estoque', estoqueRelatorio:true, estoquePeriodo:'2026-10' }, T.renderAdmin);
add('estoque / relatório de mês a mês',  { ...dc, adminTab:'doacoes-estoque', estoqueRelatorio:true, estoquePeriodo:{ de:'2026-09', ate:'2026-10' }, estoqueItemId:'it1' }, T.renderAdmin);
// O Regional: das Doacoes so o estoque (sem as abas Por evento e Rank, e a
// aba "doacoes" tambem cai no estoque); a Caixinha vem das divisoes.
const rg = { isAdmin:true, adminEscopo:'regional', doacoesDadosEscopo:'regional', caixinhaDadosEscopo:'regional',
  doacoesDados:{ eventos:[], nomes:{}, estoque:{ itens:[{ id:'r1', nome:'Arroz', medida:'kg', saldo:40 }, { id:'r2', nome:'Cobertor', medida:'un', saldo:12 }],
    movimentos:[{ id:'rv1', data:'2026-10-01', tipo:'entrada', itemId:'r1', item:'Arroz', medida:'kg', quantidade:40, origem:'avulsa', destino:'', descricao:'', eventoId:'', anulado:false },
      { id:'rv2', data:'2026-10-01', tipo:'entrada', itemId:'r2', item:'Cobertor', medida:'un', quantidade:12, origem:'avulsa', destino:'', descricao:'', eventoId:'', anulado:false }] } },
  caixinhaDados:{ meses:[{ mes:'2026-10', membros:[
    { id:'oeste', nome:'Oeste - RJ4', pagou:true, valor:90 }, { id:'barra', nome:'Barra - RJ4', pagou:true, valor:70 },
    { id:'recreio', nome:'Recreio - RJ4', pagou:false, valor:0 }] }],
    saldoInicial:{ mes:'2026-09', data:'2026-09-30', valor:500 }, lancamentos:[] }, caixinhaPeriodo:0 };
add('regional / doações (só estoque)',   { ...rg, adminTab:'doacoes-estoque' }, T.renderAdmin);
add('regional / doações pela aba antiga', { ...rg, adminTab:'doacoes' }, T.renderAdmin);
add('regional / caixinha mês a mês',     { ...rg, adminTab:'caixinha' }, T.renderAdmin);
add('regional / caixinha mês das divisões', { ...rg, adminTab:'caixinha', caixinhaMes:'2026-10',
  caixinhaMembroIds:['oeste','barra','recreio'], caixinhaValores:{ oeste:90, barra:70 } }, T.renderAdmin);
add('regional / caixinha mês novo',      { ...rg, adminTab:'caixinha', caixinhaMes:'2026-11',
  caixinhaMembroIds:['oeste','recreio','barra','curicica','taquara','gardenia'] }, T.renderAdmin);
add('regional / caixinha rank',          { ...rg, adminTab:'caixinha-rank' }, T.renderAdmin);
add('regional / caixinha controle',      { ...rg, adminTab:'caixinha-financeiro' }, T.renderAdmin);
add('regional / caixinha relatório',     { ...rg, adminTab:'caixinha-financeiro', caixinhaFinRelatorio:true, caixinhaFinPeriodo:'2026-10' }, T.renderAdmin);
add('estoque / vazio (regional sem nada)', { ...dc, adminEscopo:'regional', doacoesDadosEscopo:'regional', adminTab:'doacoes-estoque',
  doacoesDados:{ eventos:[], nomes:{}, estoque:{ itens:[], movimentos:[] } } }, T.renderAdmin);
add('estoque / saída sem item com saldo', { ...dc, adminTab:'doacoes-estoque', estoqueForm:{ tipo:'saida', itemId:'', itemNome:'', medida:'un',
  medidaManual:false, quantidade:'', data:'', destino:'', descricao:'' },
  doacoesDados:{ eventos:[], nomes:{}, estoque:{ itens:[{ id:'alimentos-barra', nome:'Alimentos (dos eventos)', medida:'kg', automatico:true, saldo:0 }], movimentos:[] } } }, T.renderAdmin);
add('estoque / lançando (salvando)',     { ...dc, adminTab:'doacoes-estoque', estoqueSalvando:true, estoqueForm:{ tipo:'entrada', itemId:'it1', itemNome:'', medida:'un',
  medidaManual:false, quantidade:'1', data:'', destino:'', descricao:'' } }, T.renderAdmin);
add('estoque / sem estoque na resposta', { ...dc, adminTab:'doacoes-estoque', doacoesDados:{ eventos:[], nomes:{} } }, T.renderAdmin);
add('caixinha / mês a mês',            { ...dc, adminTab:'caixinha' }, T.renderAdmin);
add('caixinha / corrigindo mês lançado', { ...dc, adminTab:'caixinha', caixinhaMes:'2026-09',
  caixinhaMembroIds:['m1','m2','m9'], caixinhaValores:{ m1:30 }, caixinhaInfo:{ m9:{ nome:'Antigo' } } }, T.renderAdmin);
add('caixinha / valor diferente e valor errado', { ...dc, adminTab:'caixinha', caixinhaMes:'2026-10',
  caixinhaMembroIds:['m1','m2','m3'], caixinhaValores:{ m1:30, m2:35.5, m3:null }, caixinhaValoresTexto:{ m2:'35,5', m3:'3o' },
  caixinhaMsg:{ ok:false, texto:'O valor de Almeida não está certo. Escreva só o número, como 30 ou 35,50.' } }, T.renderAdmin);
add('caixinha / mês novo',             { ...dc, adminTab:'caixinha', caixinhaMes:'2026-11', caixinhaMembroIds:['m1','m2','m3'] }, T.renderAdmin);
add('caixinha / adicionar ao mês',     { ...dc, adminTab:'caixinha', caixinhaMes:'2026-09', caixinhaMostrarAdicionar:true,
  caixinhaMembroIds:['m1','m2'], caixinhaValores:{ m1:30 } }, T.renderAdmin);
add('caixinha / confirmar exclusão',   { ...dc, adminTab:'caixinha', caixinhaMes:'2026-10', caixinhaConfirmarRemover:true,
  caixinhaMembroIds:['m1','m2','m3'], caixinhaValores:{ m1:30, m3:35.5 } }, T.renderAdmin);
add('caixinha / mês sem ninguém',      { ...dc, adminTab:'caixinha', caixinhaMes:'2026-11', caixinhaMembroIds:[],
  caixinhaMsg:{ ok:false, texto:'O mês precisa ter pelo menos 1 integrante na lista.' } }, T.renderAdmin);
add('caixinha / rank',                 { ...dc, adminTab:'caixinha-rank' }, T.renderAdmin);
add('caixinha / rank sem meses',       { ...dc, adminTab:'caixinha-rank', caixinhaDados:{ meses:[] } }, T.renderAdmin);
add('caixinha / sem meses lançados',   { ...dc, adminTab:'caixinha', caixinhaDados:{ meses:[] } }, T.renderAdmin);
add('caixinha / erro',                 { ...dc, adminTab:'caixinha', caixinhaErro:'Sem permissao para os dados desta divisao' }, T.renderAdmin);
const fin = { ...dc, adminTab:'caixinha-financeiro' };
add('caixinha / controle financeiro',         fin, T.renderAdmin);
add('caixinha / controle vazio, sem saldo inicial', { ...fin, caixinhaDados:caixaVazio }, T.renderAdmin);
add('caixinha / controle no vermelho',        { ...fin, caixinhaDados:{ ...caixaVazio,
  lancamentos:[{ id:'x', tipo:'saida', data:'2026-10-01', categoria:'Outros', descricao:'', valor:80 }] } }, T.renderAdmin);
add('caixinha / controle carregando',         { ...fin, caixinhaDados:null }, T.renderAdmin);
add('caixinha / lançar saída',                { ...fin, caixinhaFinForm:{ tipo:'saida', data:'', categoria:'Material gráfico', descricao:'Adesivo novo', valor:'45' } }, T.renderAdmin);
add('caixinha / lançar entrada',              { ...fin, caixinhaFinForm:{ tipo:'entrada', data:'15/10/2026', categoria:'', descricao:'', valor:'' } }, T.renderAdmin);
add('caixinha / corrigir saída (excluir)',    { ...fin, caixinhaFinForm:{ tipo:'saida', id:'l1', data:'05/10/2026',
  categoria:'Kit Churrasco / lanches', descricao:'Carne do pub', valor:'120,5' }, caixinhaFinConfirmarRemover:'l1' }, T.renderAdmin);
add('caixinha / lançamento com erro',         { ...fin, caixinhaFinForm:{ tipo:'saida', data:'', categoria:'', descricao:'', valor:'10' },
  caixinhaFinMsg:{ ok:false, texto:'Escolha a categoria da saída.' } }, T.renderAdmin);
add('caixinha / corrigir saldo inicial',      { ...fin, caixinhaFinForm:{ tipo:'saldoInicial', valor:'175', pinRegional:'' } }, T.renderAdmin);
add('caixinha / corrigir saldo (PIN errado)',  { ...fin, caixinhaFinForm:{ tipo:'saldoInicial', valor:'175', pinRegional:'1234' },
  caixinhaFinMsg:{ ok:false, texto:'Não consegui salvar: O saldo inicial ja foi definido e esta travado. So o PIN do Regional corrige.' } }, T.renderAdmin);
add('caixinha / definindo o saldo inicial',   { ...fin, caixinhaDados:caixaVazio, caixinhaFinSaldoTexto:'175,5' }, T.renderAdmin);
add('caixinha / confirmando o saldo inicial', { ...fin, caixinhaDados:caixaVazio, caixinhaFinSaldoTexto:'175,5', caixinhaFinConfirmarSaldo:true }, T.renderAdmin);
add('caixinha / saldo inicial em branco',     { ...fin, caixinhaDados:caixaVazio, caixinhaFinMsg:{ ok:false, texto:'Escreva quanto tem na caixinha (pode ser 0).' } }, T.renderAdmin);
add('caixinha / saldo travado (com o dia)',   { ...fin, caixinhaDados:{ ...caixinhaFalsa, saldoInicial:{ mes:'2026-09', data:'2026-09-15', valor:175 } } }, T.renderAdmin);
add('caixinha / relatório de controle (tudo)', { ...fin, caixinhaFinRelatorio:true, caixinhaFinPeriodo:0 }, T.renderAdmin);
add('caixinha / relatório de um mês',         { ...fin, caixinhaFinRelatorio:true, caixinhaFinPeriodo:'2026-10' }, T.renderAdmin);
add('caixinha / relatório antes do saldo inicial', { ...fin, caixinhaFinRelatorio:true, caixinhaFinPeriodo:'2026-07' }, T.renderAdmin);
add('caixinha / relatório de um mês a outro', { ...fin, caixinhaFinRelatorio:true, caixinhaFinPeriodo:{ de:'2026-08', ate:'2026-10' } }, T.renderAdmin);
add('caixinha / relatório de mês a mês invertido', { ...fin, caixinhaFinRelatorio:true, caixinhaFinPeriodo:{ de:'2026-10', ate:'2026-09' } }, T.renderAdmin);
add('caixinha / relatório de caixa vazio',    { ...fin, caixinhaDados:caixaVazio, caixinhaFinRelatorio:true, caixinhaFinPeriodo:6 }, T.renderAdmin);

// Entrada/Saida. No cadastro, Bull (m2) esta afastado; o painel de
// movimentacao abre na linha do Costa (m1). Os movimentos tem data fixa e o
// periodo e "desde sempre" (0), pra saida nao mudar com o calendario.
const rosterComAfastado = membros.map(m => m.id === 'm2' ? { ...m, situacao:'afastado', situacaoDesde:'2026-09-01' } : m);
const movimentosFalsos = [
  { id:'v1', data:'2026-10-01', divisao:'barra', membroId:'m3', nome:'Almeida', grau:'V', tipo:'entrada', motivo:'' },
  { id:'v2', data:'2026-09-01', divisao:'barra', membroId:'m2', nome:'Bull', grau:'VIII', tipo:'afastamento', motivo:'Trabalho fora do estado' },
  { id:'v3', data:'2026-08-15', divisao:'barra', membroId:'mx', nome:'Antigo', grau:'X', tipo:'desligamento', motivo:'' },
  { id:'v4', data:'2026-08-10', divisao:'recreio', membroId:'m4', nome:'Tigre', grau:'III', tipo:'entrada', motivo:'' },
];
add('membros / cadastro com afastado',   { isAdmin:true, adminEscopo:'barra', adminTab:'membros', roster:rosterComAfastado }, T.renderAdmin);
add('membros / afastando (painel)',      { isAdmin:true, adminEscopo:'barra', adminTab:'membros', movMembroId:'m1', movTipo:'afastamento' }, T.renderAdmin);
add('membros / retorno (painel)',        { isAdmin:true, adminEscopo:'barra', adminTab:'membros', roster:rosterComAfastado,
  movMembroId:'m2', movTipo:'retorno', movData:'18/10/2026' }, T.renderAdmin);
add('membros / com datas de ingresso',   { isAdmin:true, adminEscopo:'barra', adminTab:'membros',
  roster:membros.map((m, i) => i % 2 ? m : { ...m, entrada:'2019-03-12' }) }, T.renderAdmin);
add('membros / preenchendo datas',       { isAdmin:true, adminEscopo:'barra', adminTab:'membros',
  preencherEntradasIds:['m1', 'm3'], entradasRascunho:{ m1:'12/03/2019' } }, T.renderAdmin);
add('membros / datas com erro',          { isAdmin:true, adminEscopo:'barra', adminTab:'membros', preencherEntradasIds:['m1'],
  entradasRascunho:{ m1:'31/02/2019' }, entradasMsg:{ ok:false, texto:'A data de Costa ("31/02/2019") não é uma data válida - escreva como 12/03/2019.' } }, T.renderAdmin);
add('membros / editando com ingresso',   { isAdmin:true, adminEscopo:'barra', adminTab:'membros', editingMemberId:'m1',
  newMemberNome:'Costa', newMemberEntrada:'12/03/2019' }, T.renderAdmin);
add('membros / confirmando remover',     { isAdmin:true, adminEscopo:'barra', adminTab:'membros', removerMembroId:'m1' }, T.renderAdmin);
add('membros / desligando (com erro)',   { isAdmin:true, adminEscopo:'barra', adminTab:'membros', movMembroId:'m3', movTipo:'desligamento',
  movMotivo:'Pediu pra sair', movErro:'Não consegui registrar: Falha de conexao.' }, T.renderAdmin);
add('membros / transferindo na RJ4',    { isAdmin:true, adminEscopo:'barra', adminTab:'membros', movMembroId:'m1', movTipo:'transferencia',
  movDestino:'oeste', movMotivo:'Mudou de bairro' }, T.renderAdmin);
add('membros / transferindo pra fora',   { isAdmin:true, adminEscopo:'barra', adminTab:'membros', movMembroId:'m1', movTipo:'transferencia',
  movForaDaRJ4:true, movRegionalDestino:'RJ2', movDivisaoDestino:'', movErro:'Escreva a divisão de destino.' }, T.renderAdmin);
add('membros / grau a confirmar',        { isAdmin:true, adminEscopo:'barra', adminTab:'membros',
  roster:membros.map(m => m.id === 'm1' ? { ...m, cargo:'', grauPendente:true } : m) }, T.renderAdmin);
add('membros / confirmando grau',        { isAdmin:true, adminEscopo:'barra', adminTab:'membros',
  roster:membros.map(m => m.id === 'm1' ? { ...m, cargo:'', grauPendente:true } : m), grauMembroId:'m1', grauEscolhido:'VI', cargoEscolhido:'Social' }, T.renderAdmin);
const comTransferencias = movimentosFalsos.concat([
  { id:'t1', data:'2026-10-05', divisao:'barra', membroId:'m5', nome:'Lobo', grau:'X', tipo:'transferenciaSaida', motivo:'Mudou de bairro', dePara:'Oeste - RJ4' },
  { id:'t2', data:'2026-10-05', divisao:'oeste', membroId:'m5', nome:'Lobo', grau:'X', tipo:'transferenciaEntrada', motivo:'Mudou de bairro', dePara:'Barra - RJ4' },
  { id:'t3', data:'2026-10-06', divisao:'barra', membroId:'m6', nome:'Puma', grau:'IX', tipo:'transferenciaSaida', motivo:'', dePara:'RJ2 · Centro' },
]);
const mvs = { isAdmin:true, adminTab:'movimentos', roster:rosterComAfastado, movimentosDados:movimentosFalsos, movimentosPeriodo:0 };
add('entrada/saída / com transferências', { ...mvs, adminEscopo:'barra', movimentosDadosEscopo:'barra', movimentosDados:comTransferencias }, T.renderAdmin);
add('entrada/saída / quadro com transferências', { ...mvs, adminEscopo:'regional', movimentosDadosEscopo:'regional', movimentosDados:comTransferencias }, T.renderAdmin);
add('entrada/saída / divisão',           { ...mvs, adminEscopo:'barra', movimentosDadosEscopo:'barra' }, T.renderAdmin);
add('entrada/saída / divisão vazia',     { ...mvs, adminEscopo:'oeste', movimentosDadosEscopo:'oeste', movimentosDados:[] }, T.renderAdmin);
add('entrada/saída / quadro regional',   { ...mvs, adminEscopo:'regional', movimentosDadosEscopo:'regional' }, T.renderAdmin);
add('entrada/saída / 1 mês',            { ...mvs, adminEscopo:'barra', movimentosDadosEscopo:'barra', movimentosPeriodo:1 }, T.renderAdmin);
add('entrada/saída / por período',       { ...mvs, adminEscopo:'barra', movimentosDadosEscopo:'barra', movimentosPeriodo:{ de:'2026-08-01', ate:'2026-09-30' } }, T.renderAdmin);
add('entrada/saída / regional abriu barra', { ...mvs, adminEscopo:'regional', movimentosDadosEscopo:'regional', movimentosDivisaoAberta:'barra' }, T.renderAdmin);
add('entrada/saída / carregando',        { ...mvs, adminEscopo:'barra', movimentosDados:null }, T.renderAdmin);
add('entrada/saída / erro',              { ...mvs, adminEscopo:'barra', movimentosErro:'Sem permissao para os dados desta divisao' }, T.renderAdmin);
const estoqueAdmDados = {
  itens:[{ id:'mat1', nome:'Cones', quantidade:7 }, { id:'mat2', nome:'Rádios', quantidade:0 }],
  movimentos:[
    { id:'ea3', data:'2026-10-18', tipo:'saida', materialId:'mat1', material:'Cones', quantidade:3,
      destinoTipo:'membro', destinoId:'m1', destinoNome:'Costa', observacao:'Evento', anulado:false },
    { id:'ea2', data:'2026-10-17', tipo:'saida', materialId:'mat1', material:'Cones', quantidade:2,
      destinoTipo:'divisao', destinoId:'barra', destinoNome:'Barra - RJ4', observacao:'', anulado:true, anuladoEm:'18/10/2026 10:00' },
    { id:'ea1', data:'2026-10-16', tipo:'entrada', materialId:'mat1', material:'Cones', quantidade:10,
      destinoTipo:'', destinoId:'', destinoNome:'', observacao:'Compra', anulado:false },
  ],
};
const eadm = { isAdmin:true, adminEscopo:'regional', estoqueAdmDados, estoqueAdmCarregando:false, estoqueAdmErro:null };
add('estoque ADM / movimentar',           { ...eadm, adminTab:'estoque-adm-movimentar', estoqueAdmForm:null }, T.renderAdmin);
add('estoque ADM / formulario entrada',   { ...eadm, adminTab:'estoque-adm-movimentar', estoqueAdmForm:{
  tipo:'entrada', materialId:'novo', materialNome:'Colete', quantidade:'5', data:'19/10/2026', destinoTipo:'divisao', destinoId:'barra', observacao:'Doação' } }, T.renderAdmin);
add('estoque ADM / formulario saída',     { ...eadm, adminTab:'estoque-adm-movimentar', estoqueAdmForm:{
  tipo:'saida', materialId:'mat1', materialNome:'', quantidade:'2', data:'19/10/2026', destinoTipo:'membro', destinoId:'m1', observacao:'' } }, T.renderAdmin);
add('estoque ADM / estoque atual',        { ...eadm, adminTab:'estoque-adm-estoque' }, T.renderAdmin);
add('estoque ADM / relatório',            { ...eadm, adminTab:'estoque-adm-relatorio', estoqueAdmFiltroTipo:'todos' }, T.renderAdmin);
add('estoque ADM / relatório entradas',   { ...eadm, adminTab:'estoque-adm-relatorio', estoqueAdmFiltroTipo:'entrada' }, T.renderAdmin);
add('estoque ADM / confirmar anulação',   { ...eadm, adminTab:'estoque-adm-relatorio', estoqueAdmAnularId:'ea3' }, T.renderAdmin);
add('estoque ADM / carregando',           { ...eadm, adminTab:'estoque-adm-movimentar', estoqueAdmCarregando:true }, T.renderAdmin);
add('estoque ADM / erro',                 { ...eadm, adminTab:'estoque-adm-movimentar', estoqueAdmErro:'Falha de conexão' }, T.renderAdmin);

const acoesSociaisDados = {
  ideias: [
    { id: 'i1', emoji: '🧥', nome: 'Doação de agasalhos', descricao: 'Roupas e cobertores no frio', precisa: 'Ponto de coleta' },
    { id: 'i2', emoji: '🩸', nome: 'Doação de sangue', descricao: '', precisa: '' },
  ],
  agenda: [{ id: 'a1', mes: '2027-07', ideiaId: 'i1', emoji: '🧥', acao: 'Doação de agasalhos', data: '', horario: '', local: '', observacao: '', situacao: 'ideia', eventoId: '' }],
  textos: [],
};
const asoc = { isAdmin:true, adminEscopo:'barra', acoesSociaisDados, acoesSociaisDadosEscopo:'barra', adminTab:'acoes-sociais-ideias' };
const agendaCheia = { ...acoesSociaisDados,
  agenda: [ ...acoesSociaisDados.agenda,
    { id: 'a2', mes: '2027-07', ideiaId: '', emoji: '🎱', acao: 'Bingo no asilo', data: '2027-07-03', horario: '15:00', local: 'Asilo São José', observacao: 'Levar prêmios', situacao: 'confirmada', eventoId: '' },
    { id: 'a3', mes: '2027-10', ideiaId: 'i2', emoji: '🩸', acao: 'Doação de sangue', data: '2027-10-09', horario: '08:00', local: 'Hemorio', observacao: '', situacao: 'realizada', eventoId: 'ev1' } ],
  textos: [{ id: 't1', titulo: 'Motivacional', texto: 'Nunca se esqueçam senhores.\nI.S.S.I\n\nAlmeida. VI' }] };
const agen = { ...asoc, adminTab:'acoes-sociais', acoesSociaisDados: agendaCheia, acoesSociaisAno: 2027 };
add('ações sociais / banco de ideias',      { ...asoc }, T.renderAdmin);
add('ações sociais / nova ideia',           { ...asoc, acaoSocialIdeiaForm:{ id:'', emoji:'🤝', nome:'', descricao:'', precisa:'' } }, T.renderAdmin);
add('ações sociais / editar ideia',         { ...asoc, acaoSocialIdeiaForm:{ ...acoesSociaisDados.ideias[0] } }, T.renderAdmin);
add('ações sociais / confirmar apagar',     { ...asoc, acaoSocialIdeiaForm:{ ...acoesSociaisDados.ideias[0] }, acaoSocialApagarId:'i1' }, T.renderAdmin);
add('ações sociais / banco vazio',          { ...asoc, acoesSociaisDados:{ ideias:[], agenda:[], textos:[] } }, T.renderAdmin);
add('ações sociais / carregando',           { ...asoc, acoesSociaisDadosEscopo:null, acoesSociaisCarregando:true }, T.renderAdmin);
add('ações sociais / agenda do ano',       { ...agen }, T.renderAdmin);
add('ações sociais / agenda com legenda',   { ...agen, acoesSociaisLegenda:true }, T.renderAdmin);
add('ações sociais / mês aberto',           { ...agen, acaoSocialMesAberto:'2027-07' }, T.renderAdmin);
add('ações sociais / escolher a ação',      { ...agen, acaoSocialMesAberto:'2027-02', acaoSocialAgendaForm:{ id:'', mes:'2027-02', ideiaId:'', emoji:'🤝', acao:'', dataTexto:'', horario:'', local:'', observacao:'', situacao:'ideia', escrevendo:false } }, T.renderAdmin);
add('ações sociais / editar ação escrita',  { ...agen, acaoSocialMesAberto:'2027-07', acaoSocialAgendaForm:{ ...agendaCheia.agenda[1], dataTexto:'03/07/2027', escrevendo:true } }, T.renderAdmin);
add('ações sociais / tirar do mês',         { ...agen, acaoSocialMesAberto:'2027-07', acaoSocialAgendaForm:{ ...agendaCheia.agenda[1], dataTexto:'03/07/2027', escrevendo:true }, acaoSocialApagarId:'a2' }, T.renderAdmin);
add('ações sociais / criar evento',         { ...agen, acaoSocialMesAberto:'2027-07', acaoSocialCriarEventoId:'a2' }, T.renderAdmin);
add('ações sociais / criar evento sem data',{ ...agen, acaoSocialMesAberto:'2027-07', acaoSocialCriarEventoId:'a1' }, T.renderAdmin);
add('ações sociais / agenda ano vazio',     { ...agen, acoesSociaisAno: 2030 }, T.renderAdmin);
add('ações sociais / textos',               { ...agen, adminTab:'acoes-sociais-textos' }, T.renderAdmin);
add('ações sociais / novo texto',           { ...agen, adminTab:'acoes-sociais-textos', acaoSocialTextoForm:{ id:'', titulo:'', texto:'' } }, T.renderAdmin);
add('ações sociais / editar texto',         { ...agen, adminTab:'acoes-sociais-textos', acaoSocialTextoForm:{ ...agendaCheia.textos[0] }, acaoSocialApagarId:'t1' }, T.renderAdmin);
add('ações sociais / textos vazio',         { ...asoc, adminTab:'acoes-sociais-textos' }, T.renderAdmin);
add('ações sociais / rascunho (Barra vazia)', { ...asoc, adminTab:'acoes-sociais', acoesSociaisDados:{ ideias:[], agenda:[], textos:[] } }, T.renderAdmin);
add('ações sociais / rascunho confirmar',   { ...asoc, adminTab:'acoes-sociais', acoesSociaisDados:{ ideias:[], agenda:[], textos:[] }, acaoSocialRascunhoConfirmar:true }, T.renderAdmin);
const cart = { isAdmin:true, adminEscopo:'barra', adminTab:'membros', carteirinhaMembroId: membros[0].id, carteirinhaPct: 67 };
const fichaCheia = { telefone:'(21) 99999-0000', emergenciaNome:'Maria Costa', emergenciaParentesco:'Esposa', emergenciaTelefone:'21 98888-1111',
  nascimento:'1985-03-12', tipoSanguineo:'O+', saude:'Alérgico a dipirona', foto:'' };
add('carteirinha / com os dados',           { ...cart, carteirinhaFicha: fichaCheia }, T.renderAdmin);
add('carteirinha / vazia',                  { ...cart, carteirinhaFicha: {} }, T.renderAdmin);
add('carteirinha / editando',               { ...cart, carteirinhaFicha: fichaCheia, carteirinhaForm: { ...fichaCheia, nascimentoTexto:'12/03/1985' } }, T.renderAdmin);
add('carteirinha / carregando',             { ...cart, carteirinhaCarregando: true }, T.renderAdmin);
add('carteirinha / erro',                   { ...cart, carteirinhaErro: 'Sem permissao para os dados desta divisao' }, T.renderAdmin);
add('ações sociais / erro',                 { ...asoc, acoesSociaisErro:'Falha de conexão' }, T.renderAdmin);

const LIMPO = {
  // A lista de eventos volta ao padrao entre um caso e outro: o card de
  // "proximo evento" depende dela, e um caso que a troca nao pode vazar
  // pro seguinte.
  events: eventos,
  convocacaoEventoId:null, convocacaoCampos:{}, convocacaoCopiado:false,
  convocacaoResponsavel:{}, convocacaoRespEstado:'pronto', convocacaoRespSalvando:false, convocacaoRespMsg:null,
  convocacaoEventoSalvando:false, convocacaoEventoMsg:null,
  newEventForm:null, newEventChamada:null, newEventTipo:null,
  convocacaoTextos:{}, convocacaoTextoEditando:null, convocacaoTextoRascunho:'', convocacaoTextoSalvando:false, convocacaoTextoMsg:null,
  newMemberGrau:null, newMemberCargo:null,
  pinErro:null, pinVerificando:false,
  calendarioPinErro:null, calendarioPinVerificando:false,
  homeEventosAberto:false, homeEscopo:null, homeTipo:null, relatorioMembroFichaId:null,
  relatorioTipoDetalhe:null, insightEditandoRodadaId:null, calendarioOrganizarEtapa:null,
  insightResultado:null, insightAjusteMostrarAdicionar:false,
  insightAjusteDivisoesExpandidas:new Set(),
  relatorioFiltroDivisao:'todas',
  insightFiltroDataInicio:'', insightFiltroDataFim:'',
  calendarioEditandoData:null, insightMostrarDataCustom:false, insightDataEscolhida:'',
  calendarioAjustandoData:false, calendarioConfirmandoExclusao:false,
  relatorioParsed:null, relatorioColarStep:'texto', editingEventId:null,
  relatorioTextoOriginalExpandido:new Set(),
  reportData:presencas,
  newEventSelected:null, insightRankRodadaSelecionada:null,
  relIndMembroId:null, relIndDados:null, relIndCarregando:false, relIndErro:null,
  relIndFiltroInicio:'', relIndFiltroFim:'', relIndDivisoesAbertas:new Set(),
  relIndCopiado:false, relIndSelecionando:false, relIndMarcados:new Set(), relIndVarios:null,
  relIndVariosCarregando:false, relIndVariosErro:null, obrigatoriedadeAberta:null, calendarioDiasVazios:false,
  doacoesDados:null, doacoesDadosEscopo:null, doacoesErro:null, doacoesEventoId:null, doacoesMarcacoes:{},
  doacoesMsg:null, doacoesSalvando:false, doacoesQtdEncerrados:8, doacoesPeriodo:0,
  estoqueItemId:null, estoqueForm:null, estoqueSalvando:false, estoqueMsg:null, estoqueRelatorio:false, estoquePeriodo:0,
  estoqueAnularId:null, estoqueQtdExtrato:15,
  caixinhaDados:null, caixinhaDadosEscopo:null, caixinhaErro:null, caixinhaMes:null, caixinhaMembroIds:[],
  caixinhaValores:{}, caixinhaValoresTexto:{}, caixinhaInfo:{}, caixinhaMostrarAdicionar:false, caixinhaConfirmarRemover:false,
  caixinhaSalvando:false, caixinhaMsg:null, caixinhaPeriodo:0,
  caixinhaFinForm:null, caixinhaFinSalvando:false, caixinhaFinMsg:null, caixinhaFinConfirmarRemover:null,
  caixinhaFinSaldoTexto:'', caixinhaFinConfirmarSaldo:false,
  caixinhaFinQtdExtrato:15, caixinhaFinRelatorio:false, caixinhaFinPeriodo:0,
  roster:membros, newMemberEntrada:'', movMembroId:null, movTipo:null, movData:'', movMotivo:'', movSalvando:false, movErro:null, removerMembroId:null,
  movDestino:null, movForaDaRJ4:false, movRegionalDestino:'', movDivisaoDestino:'',
  grauMembroId:null, grauEscolhido:null, cargoEscolhido:null, grauSalvando:false, grauErro:null, preencherEntradasIds:null, entradasRascunho:{}, entradasSalvando:false, entradasMsg:null,
  movimentosDados:null, movimentosDadosEscopo:null, movimentosErro:null, movimentosPeriodo:0, movimentosDivisaoAberta:null,
  estoqueAdmDados:null, estoqueAdmCarregando:false, estoqueAdmErro:null, estoqueAdmForm:null,
  estoqueAdmSalvando:false, estoqueAdmMsg:null, estoqueAdmFiltroTipo:'todos', estoqueAdmAnularId:null,
  acoesSociaisDados:null, acoesSociaisDadosEscopo:null, acoesSociaisCarregando:false, acoesSociaisErro:null,
  acoesSociaisSalvando:false, acoesSociaisMsg:null, acaoSocialIdeiaForm:null, acaoSocialApagarId:null,
  acoesSociaisAno:null, acaoSocialMesAberto:null, acaoSocialAgendaForm:null, acaoSocialCriarEventoId:null, acoesSociaisLegenda:false, acaoSocialTextoForm:null, acaoSocialRascunhoConfirmar:false,
  carteirinhaMembroId:null, carteirinhaFicha:null, carteirinhaPct:null, carteirinhaCarregando:false, carteirinhaErro:null,
  carteirinhaForm:null, carteirinhaSalvando:false, carteirinhaMsg:null, carteirinhaFotoProcessando:false, aniversarios:null, aniversariosEscopo:null,
};
log('');
log('=== 2. desenhar cada tela e aba ===');
let falhas = 0, vazias = 0;
const paginas = [];
for (const c of casos) {
  Object.assign(state, LIMPO, c.patch);
  const app = novoEl('app');
  elementos.clear();
  elementos.set('app', app);
  try {
    c.fn(app);
    let total = 0;
    for (const el of elementos.values()) total += (el.innerHTML || '').length;
    if (HTML) {
      const partes = [...elementos.entries()]
        .filter(([, el]) => el.innerHTML)
        .map(([id, el]) => `--- #${id} ---\n${el.innerHTML}`);
      paginas.push(`===== ${c.nome} =====\n${partes.join('\n')}`);
    }
    if (total < 50) { vazias++; log(`   VAZIA  ${c.nome} (${total} chars)`); }
    else log(`   ok     ${c.nome}  (${total} chars)`);
  } catch (e) {
    falhas++;
    log(`   ERRO   ${c.nome}: ${e.message}`);
    if (e.stack) log('          ' + (e.stack.split('\n')[1] || '').trim());
  }
}
log('');
log(`   ${casos.length} telas/abas | ${falhas} erro(s) | ${vazias} vazia(s)`);
log('');
log(falhasCarga + falhas + vazias === 0 ? 'TUDO OK' : 'HA PROBLEMAS - veja acima');

fs.writeFileSync(SAIDA, linhas.join('\n'), 'utf8');
if (HTML) fs.writeFileSync(HTML, paginas.join('\n\n'), 'utf8');
process.exit(falhasCarga + falhas + vazias === 0 ? 0 : 1);
