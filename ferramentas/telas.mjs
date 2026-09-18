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
    { chave:'barra', nome:'Barra - RJ4', totalMembros:3, mediaPorRodada:2, mediaTotalPorRodada:3, percentual:70 },
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
for (const m of ['home','evento','rank','rank-insights','calendario','pin','relatorios','admin','convocacao','menu-organizador']) {
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
add('organizador / menu (regional)', { isAdmin:true, adminEscopo:'regional' }, T.renderMenuOrganizador);
add('organizador / menu (barra)',    { isAdmin:true, adminEscopo:'barra' }, T.renderMenuOrganizador);
add('organizador / menu (oeste)',    { isAdmin:true, adminEscopo:'oeste' }, T.renderMenuOrganizador);
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
// Evento sendo editado: o campo de data nasce preenchido com a data dele.
add('organizador / editar evento',    { isAdmin:true, adminEscopo:'barra', adminTab:'eventos',
  editingEventId:'e1', newEventSelected:new Set(['m1']) }, T.renderAdmin);
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
add('organizador / membros (grau VI)', { isAdmin:true, adminEscopo:'barra', adminTab:'membros',
  newMemberGrau:'VI' }, T.renderAdmin);
add('organizador / eventos (barra)',  { isAdmin:true, adminEscopo:'barra', adminTab:'eventos' }, T.renderAdmin);
add('criar chamada (convocação)',     { convocacaoEventoId:'e1',
  convocacaoCampos:{ subtitulo:'Aniversariantes do mês',
    destino:['Bar do Zé', 'Barra da Tijuca'].join('\n'),
    linkMapa:'https://maps.app.goo.gl/x', destacamento:'18h30', briefing:'19h15', inicio:'19h30',
    informacoes:['ℹ️ INFORMAÇÕES ℹ️', '', 'COSTA (X)', 'DIRETOR', 'DIVISÃO BARRA - RJ4', '(21) 90000-0000'].join('\n') } },
  T.renderConvocacao);
add('criar chamada (campos vazios)',  { convocacaoEventoId:'e2', convocacaoCampos:{} }, T.renderConvocacao);
add('criar chamada (bate e volta)',   { convocacaoEventoId:'e2', convocacaoModelo:'bate-volta',
  convocacaoCampos:{ subtitulo:'Bonde da Independência',
    horarios:['Concentração: 05h00','Briefing: 05h15','Saída: 05h30'].join('\n'),
    concentracao:['Posto Ipiranga Cebolão','Barra da Tijuca'].join('\n'),
    linkMapa:'https://maps.app.goo.gl/x',
    roteiro:['PE 1 → PE 2 → Três Rios','BR-040 sentido Petrópolis'].join('\n'),
    informacoes:'ℹ️ INFORMAÇÕES ℹ️' } }, T.renderConvocacao);
add('criar chamada (regional)',       { convocacaoEventoId:'e3', convocacaoModelo:'simples',
  convocacaoCampos:{} }, T.renderConvocacao);
add('organizador / novo evento',      { isAdmin:true, adminEscopo:'barra', adminTab:'eventos',
  newEventSelected:new Set(['m1']), newEventTipo:'Pub' }, T.renderAdmin);
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
for (const aba of ['resumo','enviar','eventos','Pub','Bate e Volta','Reunião','Ação Social']) {
  add(`relatorios / ${aba}`, { isAdmin:true, adminEscopo:'regional',
    relatorioCategoriaAlvo:'regional', relatorioTab:aba, relatorioFiltroDivisao:'todas' }, T.renderRelatorioShell);
}
add('relatorios / resumo (so barra)', { isAdmin:true, adminEscopo:'barra',
  relatorioCategoriaAlvo:'barra', relatorioTab:'resumo' }, T.renderRelatorioShell);
// Com "Todas as divisoes" a lista vem agrupada e fechada, entao os cards de
// evento nem chegam a ser desenhados - filtrando numa divisao eles aparecem,
// que e o que esta tela precisa checar.
add('relatorios / eventos (uma divisao)', { isAdmin:true, adminEscopo:'regional',
  relatorioTab:'eventos', relatorioFiltroDivisao:'barra' }, T.renderRelatorioShell);
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

const LIMPO = {
  // A lista de eventos volta ao padrao entre um caso e outro: o card de
  // "proximo evento" depende dela, e um caso que a troca nao pode vazar
  // pro seguinte.
  events: eventos,
  convocacaoEventoId:null, convocacaoModelo:null, convocacaoCampos:{}, convocacaoCopiado:false,
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
  newEventSelected:null, insightRankRodadaSelecionada:null,
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
