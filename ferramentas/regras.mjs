// Confere as regras do clube que viram código — as que, se quebrarem, saem
// erradas numa convocação ou num relatório sem ninguém perceber.
//
//     node ferramentas/regras.mjs
//
// (sem Node instalado, ver ferramentas/README.md)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(AQUI, '..', 'js');
const SAIDA = process.argv[2] || path.join(AQUI, 'ultimo-regras.txt');
const linhas = [];
const log = (s) => { linhas.push(s); try { console.log(s); } catch (e) {} };
const url = (rel) => pathToFileURL(path.join(JS, rel)).href;

globalThis.document = { createElement: () => ({ innerHTML: '', set textContent(v) { this.innerHTML = String(v); } }), getElementById: () => null, body: {}, addEventListener() {} };
globalThis.window = { addEventListener() {} };

const { ordenarPorHierarquia } = await import(url('nucleo/util.js'));
const { CARGOS, cargosDoGrau } = await import(url('nucleo/config.js'));
const { montarConvocacao, camposIniciais, dataDaChamada, comoHora, responsavelDoCadastro, peVazio, roteiroDoBonde, TEXTOS_PADRAO,
  camposDoEvento, chamadaParaGuardar, enderecoDoEvento, horaParaEvento, resumoDoEvento } = await import(url('dominio/convocacao.js'));
const { parseConvocacaoTexto } = await import(url('dominio/parser.js'));
const { estatisticasInsightsPorPeriodo, numerosInsightDivisao } = await import(url('dominio/estatisticas.js'));
const { mascaraData, dataISOdeBR, formatDataBR } = await import(url('nucleo/util.js'));
const { eventosProximos, semResposta } = await import(url('dominio/pendencias.js'));
const { state: st } = await import(url('nucleo/estado.js'));
const { hojeISO } = await import(url('nucleo/util.js'));
const { quantidadeEstoqueAdm, resumoEstoqueAdm, textoResumoEstoqueAdm, filtrarMovimentosEstoqueAdm } = await import(url('dominio/estoque-adm.js'));
const { alertasHonrarias, dataDaHonraria, textoPrazoHonraria } = await import(url('dominio/honrarias.js'));

let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  log(`  ${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) {
    log(`         esperado: ${JSON.stringify(esperado)}`);
    log(`         obtido  : ${JSON.stringify(obtido)}`);
  }
}
const nomes = (l) => l.map(m => m.nome);

log('=== estoque ADM: quantidade, resumo e filtros ===');
confere('quantidade aceita apenas inteiro positivo',
  ['12', '0', '-2', '2,5', '100001'].map(quantidadeEstoqueAdm), [12, 0, 2, 25, 0]);
const resumoAdm = resumoEstoqueAdm([
  { nome:'Cones', quantidade:8 }, { nome:'Radios', quantidade:2 }, { nome:'Coletes', quantidade:0 },
]);
confere('resumo soma materiais, unidades e zerados', resumoAdm, { materiais:3, unidades:10, zerados:1 });
confere('resumo escrito', textoResumoEstoqueAdm(resumoAdm), '3 materiais · 10 unidades · 1 zerado');
const movAdm = [{ id:'e', tipo:'entrada' }, { id:'s', tipo:'saida' }];
confere('filtro de entradas', filtrarMovimentosEstoqueAdm(movAdm, 'entrada').map(x => x.id), ['e']);
confere('filtro tudo preserva o livro', filtrarMovimentosEstoqueAdm(movAdm, 'todos').map(x => x.id), ['e','s']);

log('');

log('=== honrarias por tempo de clube ===');
{
  const base = new Date(2026, 9, 19); // 19/10/2026
  const m = (id, entrada, divisao = 'Barra - RJ4', extra = {}) => ({ id, nome:id, grau:'X', entrada, divisao, ...extra });
  const membrosHonraria = [
    m('limite60', '2023-12-18'), m('fora61', '2023-12-19'),
    m('amanha', '2023-10-20'), m('hoje', '2023-10-19'),
    m('limite30', '2023-09-19'), m('fora31', '2023-09-18'),
    m('seis', '2020-11-01'), m('nove', '2017-10-19', 'Oeste - RJ4'),
    m('afastado', '2023-11-02', 'Barra - RJ4', { situacao:'afastado' }),
    m('semData', ''), m('invalida', '2023-02-31'), m('futura', '2027-01-01'),
  ];
  const barra = alertasHonrarias(membrosHonraria, 'barra', base);
  confere('a janela inclui 60 dias antes e 30 depois, sem passar das bordas',
    barra.map(x => x.membro.id), ['limite30', 'hoje', 'amanha', 'seis', 'afastado', 'limite60']);
  confere('cada integrante recebe apenas o proximo marco',
    barra.map(x => [x.membro.id, x.anos]),
    [['limite30',3],['hoje',3],['amanha',3],['seis',6],['afastado',3],['limite60',3]]);
  confere('a divisao nao ve integrante do Oeste', barra.some(x => x.membro.id === 'nove'), false);
  const regional = alertasHonrarias(membrosHonraria, 'regional', base).map(x => x.membro.id);
  confere('o Regional ve toda a RJ4, inclusive afastado', regional.includes('nove') && regional.includes('afastado'), true);
  confere('sem data, data invalida e entrada futura ficam fora',
    barra.some(x => ['semData','invalida','futura'].includes(x.membro.id)), false);
  confere('29 de fevereiro vira 28 no ano da honraria', dataDaHonraria('2020-02-29', 3), '2023-02-28');
  confere('os textos antes, no dia e depois',
    [textoPrazoHonraria(42), textoPrazoHonraria(1), textoPrazoHonraria(0), textoPrazoHonraria(-1), textoPrazoHonraria(-5)],
    ['Completa em 42 dias', 'Completa amanhã', 'Completa hoje', 'Completou há 1 dia', 'Completou há 5 dias']);
}

log('');

log('=== aviso de evento próximo ===');

// Datas relativas a hoje, pro teste não depender do dia em que roda.
const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const evt = (id, dias, extra) => ({ id, nome: id, data: emDias(dias), horario: '20:00',
  status: 'ativo', categoria: 'barra', tipo: 'Pub', memberIds: ['a','b','c'], ...extra });

st.events = [
  evt('hoje', 0), evt('amanha', 1), evt('em2', 2), evt('em3', 3),
  evt('ontem', -1),
  evt('encerrado', 1, { status: 'encerrado' }),
  evt('outraDivisao', 1, { categoria: 'oeste' }),
  evt('semData', 1, { data: '' }),
];
const ids = (l) => l.map(x => x.ev.id);

confere('entram hoje, amanhã e em 2 dias - nessa ordem',
  ids(eventosProximos('barra')), ['hoje', 'amanha', 'em2']);
confere('evento de 3 dias fica fora da janela',
  ids(eventosProximos('barra')).includes('em3'), false);
confere('evento que já passou fica fora',
  ids(eventosProximos('barra')).includes('ontem'), false);
confere('evento encerrado fica fora',
  ids(eventosProximos('barra')).includes('encerrado'), false);
confere('evento de outra divisão fica fora',
  ids(eventosProximos('barra')).includes('outraDivisao'), false);
// Sem esta, '' < qualquer data no comparador de texto e o evento entraria.
confere('evento sem data fica fora',
  ids(eventosProximos('barra')).includes('semData'), false);
confere('a contagem de dias sai certa',
  eventosProximos('barra').map(x => x.dias), [0, 1, 2]);
confere('janela maior alcança mais',
  ids(eventosProximos('barra', 3)), ['hoje', 'amanha', 'em2', 'em3']);

// Quem não respondeu.
const ev3 = st.events[0];
st.reportData = {};
confere('sem as presenças ainda, devolve null (não zero)', semResposta(ev3), null);
st.reportData = { hoje: { a: { status: 'confirmado' }, b: { status: 'aguardando' } } };
confere('aguardando e ausente contam como sem resposta',
  semResposta(ev3), { faltam: 2, total: 3 });
st.reportData = { hoje: { a: { status: 'confirmado' }, b: { status: 'familia' }, c: { status: 'trabalho' } } };
confere('falta justificada É resposta', semResposta(ev3), { faltam: 0, total: 3 });

log('=== campo de data (dd/mm/aaaa) ===');

// A máscara, tecla a tecla: é o que a pessoa vê enquanto digita 21/09/2026.
confere('a máscara vai pondo as barras',
  ['2', '21', '219', '2109', '21092', '21092026'].map(mascaraData),
  ['2', '21', '21/9', '21/09', '21/09/2', '21/09/2026']);
confere('não passa de 8 dígitos', mascaraData('2109202699'), '21/09/2026');
confere('ignora o que não for número', mascaraData('21//09//2026'), '21/09/2026');
confere('campo vazio continua vazio', mascaraData(''), '');

// A conversão pro formato em que a data é guardada.
confere('21/09/2026 vira ISO', dataISOdeBR('21/09/2026'), '2026-09-21');
confere('e volta igual', formatDataBR(dataISOdeBR('21/09/2026')), '21/09/2026');

// O bug que motivou tudo isto: no campo nativo em inglês, "09/11" entrava
// como 9 de novembro. Aqui é sempre 9 de NOVEMBRO só se for escrito 09/11.
confere('dia e mês não se invertem', dataISOdeBR('09/11/2026'), '2026-11-09');
confere('o outro sentido também', dataISOdeBR('11/09/2026'), '2026-09-11');

// Datas que não existem não podem passar.
confere('31/02 não existe', dataISOdeBR('31/02/2026'), '');
confere('mês 13 não existe', dataISOdeBR('01/13/2026'), '');
confere('dia 00 não existe', dataISOdeBR('00/09/2026'), '');
confere('31/04 não existe', dataISOdeBR('31/04/2026'), '');
confere('29/02 existe em ano bissexto', dataISOdeBR('29/02/2024'), '2024-02-29');
confere('29/02 não existe fora dele', dataISOdeBR('29/02/2026'), '');
confere('data pela metade não passa', dataISOdeBR('21/09'), '');
confere('vazio não passa', dataISOdeBR(''), '');
confere('texto qualquer não passa', dataISOdeBR('amanhã'), '');
confere('ano de 2 dígitos não passa', dataISOdeBR('21/09/26'), '');

log('=== relatório de Insight por período ===');

// Quatro rodadas, duas em agosto e duas em setembro. Ana fez em todas;
// Bia so nas de agosto; Caio em nenhuma. Assim da pra conferir que o
// recorte muda o resultado de cada um de um jeito previsivel.
const rodadasFake = [
  { data: '2026-08-05', membros: [
    { id: 'a', divisao: 'Barra - RJ4', fez: true },
    { id: 'b', divisao: 'Barra - RJ4', fez: true },
    { id: 'c', divisao: 'Barra - RJ4', fez: false }] },
  { data: '2026-08-19', membros: [
    { id: 'a', divisao: 'Barra - RJ4', fez: true },
    { id: 'b', divisao: 'Barra - RJ4', fez: true },
    { id: 'c', divisao: 'Barra - RJ4', fez: false }] },
  { data: '2026-09-02', membros: [
    { id: 'a', divisao: 'Barra - RJ4', fez: true },
    { id: 'b', divisao: 'Barra - RJ4', fez: false },
    { id: 'c', divisao: 'Barra - RJ4', fez: false }] },
  { data: '2026-09-16', membros: [
    { id: 'a', divisao: 'Barra - RJ4', fez: true },
    { id: 'b', divisao: 'Barra - RJ4', fez: false },
    { id: 'c', divisao: 'Barra - RJ4', fez: false }] },
];
const statsFake = {
  rodadas: 4,
  membros: [
    { id: 'a', nome: 'Ana', divisao: 'Barra - RJ4', grau: 'X', funcoes: [] },
    { id: 'b', nome: 'Bia', divisao: 'Barra - RJ4', grau: 'X', funcoes: [] },
    { id: 'c', nome: 'Caio', divisao: 'Barra - RJ4', grau: 'X', funcoes: [] },
  ],
  divisoes: [{ chave: 'barra', nome: 'Barra - RJ4', totalMembros: 3 }],
};
const pct = (r) => r.stats.membros.map(m => [m.nome, m.confirmacoes + '/' + m.rodadas, m.percentual]);

const tudo = estatisticasInsightsPorPeriodo(statsFake, rodadasFake, '', '');
confere('sem período, entram as 4 rodadas', tudo.stats.rodadas, 4);
confere('sem período, os percentuais', pct(tudo),
  [['Ana', '4/4', 100], ['Bia', '2/4', 50], ['Caio', '0/4', 0]]);

const soAgosto = estatisticasInsightsPorPeriodo(statsFake, rodadasFake, '2026-08-01', '2026-08-31');
confere('só agosto, entram 2 rodadas', soAgosto.stats.rodadas, 2);
confere('só agosto, a Bia sobe pra 100%', pct(soAgosto),
  [['Ana', '2/2', 100], ['Bia', '2/2', 100], ['Caio', '0/2', 0]]);

const soSetembro = estatisticasInsightsPorPeriodo(statsFake, rodadasFake, '2026-09-01', '');
confere('só setembro, a Bia cai pra 0%', pct(soSetembro),
  [['Ana', '2/2', 100], ['Bia', '0/2', 0], ['Caio', '0/2', 0]]);

// As bordas entram: uma rodada no dia exato do inicio ou do fim conta.
const soUmDia = estatisticasInsightsPorPeriodo(statsFake, rodadasFake, '2026-08-05', '2026-08-05');
confere('a data da borda entra no período', soUmDia.stats.rodadas, 1);

// Divisao: 2 de 3 fizeram por rodada em agosto (Ana e Bia), 6 linhas no total.
confere('média da divisão em agosto', soAgosto.stats.divisoes.map(d => [d.mediaPorRodada, d.mediaTotalPorRodada, d.percentual]),
  [[2, 3, 67]]);

// Media que nao da inteiro: 6 "Sim" em 12 marcacoes, ao longo de 4 rodadas.
// Arredondada pra inteiro ela virava 2 - e o grafico mentia.
confere('média quebrada fica com uma casa', tudo.stats.divisoes.map(d => [d.mediaPorRodada, d.mediaTotalPorRodada, d.percentual]),
  [[1.5, 3, 50]]);
confere('e as somas exatas vão junto', tudo.stats.divisoes.map(d => [d.fez, d.marcacoes]), [[6, 12]]);

log('=== gráfico de cada divisão no Rank de Insights ===');

// O caso real que abriu isto (Gardênia, 25/09/2026): 3 "Sim" em 28
// marcações, 7 rodadas. O meio dizia 11% e o grafico saia todo vermelho,
// porque a fatia verde era a media arredondada (0,43 -> 0).
const gardenia = numerosInsightDivisao({ fez: 3, marcacoes: 28, percentual: 11, mediaTotalPorRodada: 4 }, 7);
confere('Gardênia: a fatia verde não some', [gardenia.fez, gardenia.naoFez], [3, 25]);
confere('Gardênia: a média por rodada não arredonda', Math.round(gardenia.mediaFez * 10) / 10, 0.4);

// Code.gs antigo (sem fez/marcacoes): as somas sao refeitas do percentual e
// chegam nos mesmos numeros. Os tres casos sao os valores reais de hoje.
const semSomas = (percentual, mediaTotalPorRodada) =>
  numerosInsightDivisao({ percentual, mediaTotalPorRodada, mediaPorRodada: 0 }, 7);
confere('Code.gs antigo: Gardênia', [semSomas(11, 4).fez, semSomas(11, 4).naoFez], [3, 25]);
confere('Code.gs antigo: Curicica', [semSomas(33, 7).fez, semSomas(33, 7).naoFez], [16, 33]);
confere('Code.gs antigo: Taquara', [semSomas(43, 2).fez, semSomas(43, 2).naoFez], [6, 8]);

// A fatia tem que bater com o numero do meio, em toda divisao.
const reais = [['barra', 26, 57, 46], ['oeste', 83, 91, 91], ['recreio', 44, 89, 49],
  ['curicica', 16, 49, 33], ['taquara', 6, 14, 43], ['gardenia', 3, 28, 11]];
confere('a fatia verde bate com o % do meio, nas 6 divisões',
  reais.map(([k, fez, marcacoes, pct]) => {
    const n = numerosInsightDivisao({ fez, marcacoes, percentual: pct }, 7);
    return [k, Math.round(n.fez / (n.fez + n.naoFez) * 100) === pct];
  }),
  reais.map(([k]) => [k, true]));
confere('divisão sem dado não quebra', numerosInsightDivisao(undefined, 7), { fez: 0, naoFez: 0, mediaFez: 0, mediaTotal: 0 });

// Periodo sem rodada nenhuma nao pode dividir por zero.
const vazio = estatisticasInsightsPorPeriodo(statsFake, rodadasFake, '2026-01-01', '2026-01-31');
confere('período vazio não quebra', [vazio.stats.rodadas, vazio.stats.membros[0].percentual, vazio.stats.divisoes[0].percentual],
  [0, null, null]);

// O relatorio completo nao pode mudar quem existe - so os numeros deles.
confere('a lista de membros continua a mesma', soAgosto.stats.membros.map(m => m.id), ['a', 'b', 'c']);
confere('grau e funções vêm do cadastro, não do histórico', soAgosto.stats.membros[0].grau, 'X');

log('=== relatório individual ===');
{
  const { montarRelatorioIndividual } = await import(url('dominio/relatorio-individual.js'));
  const evento = (id, data, tipo, categoria, status) => ({ id, nome: 'Evento ' + id, data, tipo, categoria, status });
  // Um integrante da Barra: dois Pubs e uma Reunião da Barra, um Pub do
  // Regional. NUNCA foi convocado pra Bate e Volta nem pra Ação Social.
  const dadosBarra = {
    membro: { id: 'm1', nome: 'Costa', grau: 'VI', cargo: 'Diretor', divisao: 'Barra - RJ4', funcoes: [] },
    eventos: [
      evento('a', '2026-07-01', 'Pub', 'barra', 'confirmado'),
      evento('b', '2026-08-01', 'Pub', 'barra', 'infracional'),
      evento('c', '2026-08-15', 'Reunião', 'barra', 'familia'),
      evento('d', '2026-09-01', 'Pub', 'regional', 'confirmado'),
    ],
    insight: { elegivel: true, rodadas: [
      { id: 'r1', data: '2026-07-10', fez: true },
      { id: 'r2', data: '2026-08-10', fez: false },
      { id: 'r3', data: '2026-09-10', fez: true },
    ] },
  };
  const tudo = montarRelatorioIndividual(dadosBarra, '', '');
  const resumoDe = (r) => r && [r.convites, r.confirmado, r.justificada, r.infracional, r.percentual];

  confere('divisão: só os 3 eventos da Barra', resumoDe(tudo.divisao.geral), [3, 1, 1, 1, 33]);
  confere('só ganha bloco o tipo em que foi convocado', tudo.divisao.porTipo.map(t => t.tipo), ['Pub', 'Reunião']);
  confere('Pub da Barra: 1 de 2', resumoDe(tudo.divisao.porTipo[0].resumo), [2, 1, 0, 1, 50]);
  confere('o Regional fica à parte, sem misturar', resumoDe(tudo.regional.geral), [1, 1, 0, 0, 100]);
  confere('Insight: 2 de 3 rodadas', [tudo.insight.fez, tudo.insight.naoFez, tudo.insight.percentual], [2, 1, 67]);
  confere('a evolução é acumulada, na ordem do tempo', tudo.divisao.evolucao.map(x => x.pct), [100, 50, 33]);
  confere('histórico: mais recente primeiro, com a origem', tudo.historico.map(x => x.id + ':' + x.origem),
    ['d:regional', 'c:divisao', 'b:divisao', 'a:divisao']);

  // Período: só agosto. O Pub de julho, o do Regional e duas rodadas saem.
  const agosto = montarRelatorioIndividual(dadosBarra, '2026-08-01', '2026-08-31');
  confere('agosto: a divisão só conta o que caiu no período', resumoDe(agosto.divisao.geral), [2, 0, 1, 1, 0]);
  confere('agosto: sem evento do Regional, o bloco some', agosto.regional, null);
  confere('agosto: o Insight também respeita o período', [agosto.insight.rodadas, agosto.insight.fez], [1, 0]);

  // Fora do Insight: o bloco não aparece, mesmo com rodadas antigas.
  const semInsight = montarRelatorioIndividual({ ...dadosBarra, insight: { elegivel: false, rodadas: dadosBarra.insight.rodadas } }, '', '');
  confere('quem não participa do Insight não vê o bloco', semInsight.insight, null);

  // Participa, mas nenhuma rodada no período: o bloco fica, zerado - ele é
  // elegível, só não houve rodada. Diferente de não participar.
  const semRodada = montarRelatorioIndividual(dadosBarra, '2026-01-01', '2026-01-31');
  confere('participa sem rodada no período: bloco fica, com 0', [semRodada.insight && semRodada.insight.rodadas], [0]);
  confere('sem nada no período, os blocos de presença somem', [semRodada.divisao, semRodada.regional], [null, null]);

  // Integrante do próprio Regional: os eventos do Regional SÃO os dele.
  const doRegional = montarRelatorioIndividual({
    membro: { id: 'm9', nome: 'Chefe', grau: 'V', divisao: 'Regional RJ4', funcoes: [] },
    eventos: [evento('x', '2026-09-01', 'Pub', 'regional', 'confirmado')],
    insight: { elegivel: false, rodadas: [] },
  }, '', '');
  confere('do Regional: os eventos contam como da divisão dele', resumoDe(doRegional.divisao.geral), [1, 1, 0, 0, 100]);
  confere('do Regional: não existe bloco "Eventos do Regional" à parte', doRegional.regional, null);

  // Evento sem data some quando há período escolhido (não dá pra saber se
  // cai dentro), mas conta no "desde sempre".
  const semData = { ...dadosBarra, eventos: [evento('s', '', 'Pub', 'barra', 'confirmado')] };
  confere('evento sem data conta no desde sempre', montarRelatorioIndividual(semData, '', '').divisao.geral.convites, 1);
  confere('evento sem data fica de fora com período', montarRelatorioIndividual(semData, '2026-01-01', '').divisao, null);

  // O texto pro WhatsApp: os mesmos numeros da tela, e do historico so as
  // faltas nao justificadas.
  const { textoRelatorioIndividual, textoDoPeriodo } = await import(url('dominio/relatorio-individual.js'));
  const texto = textoRelatorioIndividual(tudo, '', '');
  const linhasTexto = texto.split('\n');
  confere('texto: abre com o nome, o grau, o cargo, o ingresso e o período', linhasTexto.slice(0, 5),
    ['📄 RELATÓRIO INDIVIDUAL', 'Costa (VI)', 'Diretor · Barra - RJ4', '🪪 Data de ingresso não informada', '🗓️ Desde sempre']);
  confere('texto: o geral da divisão bate com a tela', linhasTexto.includes('📊 33% (1 de 3 eventos)'), true);
  confere('texto: só os tipos em que foi convocado',
    linhasTexto.filter(l => / \d+% \(\d+ de \d+\)$/.test(l)), ['🍻 Pub: 50% (1 de 2)', '📊 Reunião: 0% (0 de 1)', '🍻 Pub: 100% (1 de 1)']);
  confere('texto: Bate e Volta não aparece', texto.includes('Bate e Volta'), false);
  confere('texto: o Regional à parte', linhasTexto.includes('🏛️ EVENTOS DO REGIONAL'), true);
  confere('texto: o Insight', linhasTexto.includes('📊 67% (fez 2 de 3 rodadas)'), true);
  confere('texto: termina com as faltas não justificadas', linhasTexto.slice(-2),
    ['⭕ FALTAS NÃO JUSTIFICADAS (1)', '- 01/08/2026 · Evento b']);
  confere('texto: sem falta, diz que não tem', textoRelatorioIndividual(doRegional, '', '').split('\n').slice(-1), ['- Nenhuma']);
  confere('texto: o período escolhido vai no topo', textoRelatorioIndividual(agosto, '2026-08-01', '2026-08-31').split('\n')[4],
    '🗓️ De 01/08/2026 a 31/08/2026');
  confere('texto: sem nada no período, avisa', textoRelatorioIndividual(semRodada, '2026-01-01', '2026-01-31')
    .includes('💡 INSIGHT\nNenhuma rodada nesse período.'), true);
  confere('período: os quatro jeitos', [textoDoPeriodo('', ''), textoDoPeriodo('2026-08-01', ''), textoDoPeriodo('', '2026-08-31')],
    ['Desde sempre', 'A partir de 01/08/2026', 'Até 31/08/2026']);
}

log('=== ordem hierárquica (grau, depois cargo, depois nome) ===');

// A diretoria da Barra, como estava na convocação real do Pub de 09SET26.
// Se esta ordem mudar, a convocação sai com a diretoria fora de ordem.
const diretoria = [
  { nome: 'BRAVO',   grau: 'VI', cargo: 'Sgt de Armas de Divisão' },
  { nome: 'ALMEIDA', grau: 'VI', cargo: 'Social' },
  { nome: 'COSTA',   grau: 'VI', cargo: 'Diretor' },
  { nome: 'RAPOSO',  grau: 'VI', cargo: 'ADM' },
  { nome: 'TEDBOY',  grau: 'VI', cargo: 'Subdiretor' },
];
confere('grau VI sai na ordem do cargo (embaralhado na entrada)',
  nomes(ordenarPorHierarquia(diretoria)),
  ['COSTA', 'TEDBOY', 'ALMEIDA', 'RAPOSO', 'BRAVO']);

confere('grau V idem, com os cargos regionais',
  nomes(ordenarPorHierarquia([
    { nome: 'E', grau: 'V', cargo: 'Comunicação' },
    { nome: 'C', grau: 'V', cargo: 'Social Regional' },
    { nome: 'A', grau: 'V', cargo: 'Diretor Regional' },
    { nome: 'D', grau: 'V', cargo: 'ADM Regional' },
    { nome: 'B', grau: 'V', cargo: 'Operacional' },
  ])),
  ['A', 'B', 'C', 'D', 'E']);

// Graus sem cargo: a ordem de verdade é antiguidade, que o app não guarda -
// ficou combinado alfabética.
confere('graus sem cargo continuam em ordem alfabética',
  nomes(ordenarPorHierarquia([
    { nome: 'MASSA', grau: 'X' }, { nome: 'BELO', grau: 'X' }, { nome: 'CHINA', grau: 'X' },
  ])),
  ['BELO', 'CHINA', 'MASSA']);

confere('grau mais alto vem antes (VI < VIII < IX < X)',
  nomes(ordenarPorHierarquia([
    { nome: 'd', grau: 'X' }, { nome: 'c', grau: 'IX' },
    { nome: 'b', grau: 'VIII' }, { nome: 'a', grau: 'VI', cargo: 'Diretor' },
  ])),
  ['a', 'b', 'c', 'd']);

confere('quem está em grau de cargo mas sem cargo vai pro fim do próprio grau',
  nomes(ordenarPorHierarquia([
    { nome: 'SEM CARGO', grau: 'VI' },
    { nome: 'COSTA', grau: 'VI', cargo: 'Diretor' },
  ])),
  ['COSTA', 'SEM CARGO']);

confere('cargo inválido não derruba a lista',
  nomes(ordenarPorHierarquia([
    { nome: 'X', grau: 'VI', cargo: 'Cargo Que Nao Existe' },
    { nome: 'COSTA', grau: 'VI', cargo: 'Diretor' },
  ])),
  ['COSTA', 'X']);

confere('membro sem grau vai pro fim',
  nomes(ordenarPorHierarquia([
    { nome: 'SEM GRAU' }, { nome: 'COSTA', grau: 'VI', cargo: 'Diretor' },
  ])),
  ['COSTA', 'SEM GRAU']);

confere('lista vazia não quebra', ordenarPorHierarquia([]), []);

log('');
log('=== cargos cadastrados ===');
for (const grau of Object.keys(CARGOS)) {
  log(`  grau ${grau}: ${CARGOS[grau].join(' > ')}`);
}
confere('grau sem cargo devolve lista vazia', cargosDoGrau('X'), []);

log('');
log('=== chamada: data e hora no formato da chamada oficial ===');
// A chamada oficial do Bonde Regional escreve "📅 Data: 19/09" e "06:00h".
confere('a data sai sem o ano', dataDaChamada('2026-09-19'), '19/09');
confere('data vazia não quebra', dataDaChamada(''), '');
confere('data inválida não quebra', dataDaChamada('não é data'), '');
confere('hora com dois pontos', comoHora('7:00'), '07:00h');
confere('hora com h', comoHora('6h30'), '06:30h');
confere('só a hora', comoHora('7'), '07:00h');
confere('já no formato fica igual', comoHora('06:00h'), '06:00h');
confere('o que não é hora sai como foi digitado', comoHora('depois do almoço'), 'depois do almoço');

log('');
log('=== chamada: quem o cadastro sugere como responsável ===');
// Decisão do clube: na divisão assina o Subdiretor; no Regional, o
// Operacional. Não é o cargo mais alto. Só vale até alguém salvar outro.
const diretoriaBarra = [
  { nome:'Costa',  grau:'VI', divisao:'Barra - RJ4', cargo:'Diretor' },
  { nome:'Tedboy', grau:'VI', divisao:'Barra - RJ4', cargo:'Subdiretor' },
  { nome:'Bull',   grau:'V',  divisao:'Regional RJ4', cargo:'Operacional' },
  { nome:'Chefe',  grau:'V',  divisao:'Regional RJ4', cargo:'Diretor Regional' },
];
confere('divisão: o Subdiretor, não o Diretor', responsavelDoCadastro('barra', diretoriaBarra),
  { nome:'Tedboy', cargo:'Subdiretor Divisão Barra', telefone:'' });
confere('regional: o Operacional', responsavelDoCadastro('regional', diretoriaBarra),
  { nome:'Bull', cargo:'Operacional RJ4', telefone:'' });
confere('sem ninguém no cargo, vem vazio (e não o nome errado)', responsavelDoCadastro('oeste', diretoriaBarra),
  { nome:'', cargo:'', telefone:'' });

log('');
log('=== chamada: o Bonde Regional sai no padrão oficial ===');
const rosterTeste = [
  { id:'1', nome:'Costa',     grau:'VI',   divisao:'Barra - RJ4', cargo:'Diretor' },
  { id:'2', nome:'Tedboy',    grau:'VI',   divisao:'Barra - RJ4', cargo:'Subdiretor' },
  { id:'3', nome:'Bravo',     grau:'VI',   divisao:'Barra - RJ4', cargo:'Sgt de Armas de Divisão' },
  { id:'4', nome:'Fabio Big', grau:'VIII', divisao:'Barra - RJ4' },
  { id:'5', nome:'Mórbius',   grau:'IX',   divisao:'Barra - RJ4' },
  { id:'6', nome:'China',     grau:'X',    divisao:'Barra - RJ4' },
  { id:'7', nome:'Bull',      grau:'V',    divisao:'Regional RJ4', cargo:'Operacional' },
];
const evRegional = {
  id:'r1', nome:'Inauguração Divisão Paraíba do Sul', tipo:'Ação Social', categoria:'regional',
  data:'2026-09-19', horario:'07:00', endereco:'Bandas Bar - Paraíba do Sul, Av. Mal. Castelo Branco, 395',
  outros:'https://maps.app.goo.gl/destino',
};
const camposReg = camposIniciais(evRegional);
camposReg.destino = 'Bandas Bar - Paraíba do Sul';
camposReg.pes = [
  { ...peVazio(), nome:'Posto Ipiranga - Cebolão', maps:'https://maps.app.goo.gl/pe1',
    concentracao:'6:00', briefing:'6:30', saida:'7:00' },
  { ...peVazio(), nome:'Integração com Bonde RJ3\nCasa do Alemão - Washington Luiz',
    endereco:'Rodovia Washington Luiz, Km 111 - Duque de Caxias', maps:'https://maps.app.goo.gl/pe2',
    concentracao:'08:00', briefing:'08:30', saida:'09:00' },
];
camposReg.pes[0].vias = 'Av. Ayrton Senna\n* Linha Amarela — sentido Fundão';
const respBull = { nome:'Bull', cargo:'Operacional RJ4', telefone:'21 90000-0000' };
const textoReg = montarConvocacao(evRegional, rosterTeste, camposReg, respBull);
const linhasReg = textoReg.split('\n');
confere('o tipo no topo, o bonde logo abaixo', linhasReg.slice(0, 2), ['🤝 AÇÃO SOCIAL 🤝', '⚙️ BONDE REGIONAL - RJ4 ⚙️']);
confere('o subtítulo vem do nome do evento', linhasReg[3], 'Inauguração Divisão Paraíba do Sul');
confere('informações: destino, data e horário', ['🎯 Bandas Bar - Paraíba do Sul', '📅 Data: 19/09', '⏰ Horário: 07:00h']
  .every(l => linhasReg.includes(l)), true);
confere('cada P.E. com o próprio número', [linhasReg.includes('📍 PE 1: Posto Ipiranga - Cebolão'),
  linhasReg.includes('📍 PE 2: Integração com Bonde RJ3')], [true, true]);
confere('a segunda linha do nome do P.E. fica embaixo dele',
  linhasReg[linhasReg.indexOf('📍 PE 2: Integração com Bonde RJ3') + 1], 'Casa do Alemão - Washington Luiz');
confere('os horários do P.E. no formato 06:00h',
  ['⏰ Concentração: 06:00h', '⏰ Briefing: 06:30h', '⏰ Saída: 07:00h'].every(l => linhasReg.includes(l)), true);
confere('o destino final', linhasReg.includes('🏁 Destino: Bandas Bar - Paraíba do Sul'), true);
// A lista do Bonde Regional sai em branco, cada integrante se coloca no grupo
// - nem o Bull, que é do Regional e está no cadastro, entra.
confere('a lista sai em branco (ninguém do cadastro entra)', textoReg.includes('Bull (V)'), false);
const blocos = linhasReg.filter(l => /^(REGIONAL|Divisão .+)$/.test(l));
confere('as divisões na ordem da chamada oficial', blocos,
  ['REGIONAL', 'Divisão Oeste', 'Divisão Recreio', 'Divisão Barra', 'Divisão Curicica', 'Divisão Taquara', 'Divisão Gardênia']);
const iReg = linhasReg.indexOf('REGIONAL');
const iOeste = linhasReg.indexOf('Divisão Oeste');
confere('o Regional ganha 5 linhas, as divisões 3',
  [linhasReg.slice(iReg + 1, iReg + 7), linhasReg.slice(iOeste + 1, iOeste + 5)],
  [['1.', '2.', '3.', '4.', '5.', ''], ['1.', '2.', '3.', '']]);
confere('a legenda nova', ['🐯 Esposa', '👨‍👩‍👦 Família', '🚘 De carro', '❌ Desistência'].every(l => linhasReg.includes(l)), true);
confere('regras, atenção e briefing', ['Respaldo RDI', '⚠️ ATENÇÃO ⚠️', '⚫ BRIEFING ⚫'].every(l => linhasReg.includes(l)), true);
confere('fecha com o responsável salvo', linhasReg.slice(-5),
  ['Bora rodar!!!!!! 🏍️🌪️', '', 'Informações:', 'Bull - Operacional RJ4', 'Contato: 21 90000-0000']);
confere('versão limpa: nenhum espaço sobrando no fim de linha', linhasReg.filter(l => / $/.test(l)), []);
confere('versão limpa: nenhum espaço duplo fora da estrada de motos',
  linhasReg.filter(l => !l.includes('🏍️') && /\S  +\S/.test(l)), []);
confere('versão limpa: um separador só', [...new Set(linhasReg.filter(l => /^\.+$/.test(l)))].length, 1);

const semResp = montarConvocacao(evRegional, rosterTeste, camposReg, {});
confere('sem responsável, sai espaço pra preencher', semResp.split('\n').slice(-2),
  ['(nome) - (cargo)', 'Contato: (telefone)']);
const camposSemPe = { ...camposReg, pes: [peVazio()] };
confere('P.E. em branco não aparece', montarConvocacao(evRegional, rosterTeste, camposSemPe, respBull).includes('📍 PE'), false);
confere('evento sem tipo começa direto no bonde',
  montarConvocacao({ ...evRegional, tipo:'' }, rosterTeste, { ...camposReg, tipo:'' }, respBull).split('\n')[0],
  '⚙️ BONDE REGIONAL - RJ4 ⚙️');

log('');
log('=== chamada: o roteiro do bonde é montado dos P.E. ===');
// A pessoa só escreve as vias de cada trecho; a sequência, os 📍 e o 🏁 o
// app monta - como no roteiro da chamada oficial.
confere('o roteiro completo, a partir dos P.E.', roteiroDoBonde(camposReg), [
  '🎯 Roteiro do Bonde:',
  'PE 1 → PE 2 → BANDAS BAR - PARAÍBA DO SUL',
  '',
  '📍 PE 1 — Saída',
  'Posto Ipiranga - Cebolão',
  '',
  '🛣️ TRECHO 1 — PE 1 → PE 2',
  'Sequência das vias:',
  '* Av. Ayrton Senna',
  '* Linha Amarela — sentido Fundão',
  '',
  '📍 PE 2',
  'Integração com Bonde RJ3',
  'Casa do Alemão - Washington Luiz',
  '',
  '🛣️ TRECHO 2 — PE 2 → BANDAS BAR - PARAÍBA DO SUL',
  'Sequência das vias:',
  '* (vias)',
  '',
  '🏁 Bandas Bar - Paraíba do Sul',
]);
confere('o roteiro entra na chamada', textoReg.includes('🛣️ TRECHO 1 — PE 1 → PE 2'), true);
const semVias = { ...camposReg, pes: camposReg.pes.map(pe => ({ ...pe, vias: '' })), roteiro: '' };
confere('sem nenhuma via, não há roteiro (só repetiria os nomes)', roteiroDoBonde(semVias), []);
confere('só com observação, ela entra com a sequência',
  roteiroDoBonde({ ...semVias, roteiro: 'Seguir pela BR-040.' }).slice(-1), ['Seguir pela BR-040.']);
const umPe = { ...semVias, pes: [{ ...camposReg.pes[0], vias: 'Av. Ayrton Senna' }] };
confere('com um P.E. só, o trecho vai direto ao destino', roteiroDoBonde(umPe)[1], 'PE 1 → BANDAS BAR - PARAÍBA DO SUL');
confere('P.E. só com vias e sem nome não conta como ponto',
  roteiroDoBonde({ ...umPe, pes: [...umPe.pes, { ...peVazio(), vias: 'x' }] })[1], 'PE 1 → BANDAS BAR - PARAÍBA DO SUL');

log('');
log('=== chamada: regras e atenção personalizadas pelo Regional ===');
const regrasNovas = 'Prazo para a justificativa: 2 dias antes do evento.\n\nRespaldo RDI';
const comTextos = montarConvocacao(evRegional, rosterTeste, camposReg, respBull, { regras: regrasNovas });
confere('o texto salvo entra no lugar das regras', [comTextos.includes('2 dias antes'), comTextos.includes('1 dia antes')], [true, false]);
confere('a atenção sem texto salvo continua a padrão', comTextos.includes('⚫ BRIEFING ⚫'), true);
confere('texto salvo vazio volta ao padrão',
  montarConvocacao(evRegional, rosterTeste, camposReg, respBull, { regras: '  ', atencao: '' }), textoReg);
confere('o padrão é o texto da chamada oficial', TEXTOS_PADRAO.regras.split('\n')[0], 'Prazo para a justificativa: 1 dia antes do evento.');

log('');
log('=== chamada guardada no evento: o evento nasce com os quadros 1 a 3 ===');
const evBarraSemChamada = () => ({ id:'e0', nome:'Pub', tipo:'Pub', categoria:'barra', data:'2026-09-09',
  horario:'19:30', endereco:"Lucky Murphy's Irish Pub, Barra da Tijuca", outros:'' });
// O que o formulário do evento guarda tem que voltar igual na chamada -
// senão a chamada "pronta" sairia diferente do que foi digitado no evento.
const guardada = chamadaParaGuardar(camposReg);
const evComChamada = { ...evRegional, chamada: guardada };
const reaberta = camposDoEvento(evComChamada);
confere('a chamada do evento sai igual à que foi montada',
  montarConvocacao(evComChamada, rosterTeste, reaberta, respBull), textoReg);
confere('o tipo e o horário vêm do evento, não da coluna Chamada', [reaberta.tipo, reaberta.horario], ['Ação Social', '07:00h']);
confere('P.E. vazio não é guardado', chamadaParaGuardar({ pes: [peVazio(), { ...peVazio(), nome: ' PE ' }] }).pes.map(p => p.nome), ['PE']);
confere('subtítulo em branco vira o nome do evento',
  camposDoEvento({ ...evRegional, chamada: { ...guardada, subtitulo: '' } }).subtitulo, evRegional.nome);
confere('evento sem chamada guardada cai nas sugestões de sempre',
  camposDoEvento(evBarraSemChamada()).destino, "Lucky Murphy's Irish Pub");
confere('evento com chamada sem P.E. ainda abre com um P.E. pra preencher',
  camposDoEvento({ ...evRegional, chamada: { destino: 'X' } }).pes.length, 1);
confere('o endereço de uma linha, pro resto do app', enderecoDoEvento(guardada),
  'Bandas Bar - Paraíba do Sul, Av. Mal. Castelo Branco, 395');
confere('a hora da chamada vira a hora do evento', [horaParaEvento('07:00h'), horaParaEvento('7h30'), horaParaEvento('cedo')],
  ['07:00', '07:30', '']);

log('');
log('=== tela do membro: só o essencial da chamada ===');
const resumo = resumoDoEvento(evComChamada);
confere('o destino com endereço e mapa', [resumo.destino, resumo.endereco, resumo.maps],
  ['Bandas Bar - Paraíba do Sul', 'Av. Mal. Castelo Branco, 395', 'https://maps.app.goo.gl/destino']);
confere('cada P.E. numa linha, o nome de duas linhas junto', resumo.pes.map(p => [p.numero, p.nome]),
  [[1, 'Posto Ipiranga - Cebolão'], [2, 'Integração com Bonde RJ3 · Casa do Alemão - Washington Luiz']]);
confere('os horários do P.E. no formato da chamada', resumo.pes[0].horarios,
  [{ rotulo: 'Concentração', hora: '06:00h' }, { rotulo: 'Briefing', hora: '06:30h' }, { rotulo: 'Saída', hora: '07:00h' }]);
confere('as vias ficam de fora (só a chamada leva)', JSON.stringify(resumo).includes('Ayrton'), false);
confere('evento sem chamada guardada não tem resumo', resumoDoEvento(evRegional), null);

log('');
log('=== chamada: evento de divisão traz os convocados da divisão ===');
const evBarra = {
  id:'e1', nome:'Pub Mensal', tipo:'Pub', categoria:'barra',
  data:'2026-09-09', horario:'19:30',
  endereco:"Lucky Murphy's Irish Pub, Barra da Tijuca",
  outros:'https://maps.app.goo.gl/exemplo\nDestacamento: 18:30 · Briefing: 19:15',
};
const camposBarra = camposIniciais(evBarra);
confere('a concentração do P.E. vem do Destacamento do evento', camposBarra.pes[0].concentracao, '18:30h');
confere('o destino vem da primeira parte do endereço', camposBarra.destino, "Lucky Murphy's Irish Pub");
confere('e o endereço do destino é o resto, sem repetir o nome', camposBarra.destinoEndereco, 'Barra da Tijuca');
const textoBarra = montarConvocacao(evBarra, rosterTeste, camposBarra, respBull);
const linhasBarra = textoBarra.split('\n');
confere('a linha do bonde diz a divisão', linhasBarra[1], '⚙️ DIVISÃO BARRA - RJ4 ⚙️');
const iBarra = linhasBarra.indexOf('Divisão Barra');
// O Bull é do Regional: mesmo convocado, não entra na lista de um evento da Barra.
confere('só os da divisão, em Nome (Grau), na ordem hierárquica', linhasBarra.slice(iBarra + 1, iBarra + 7),
  ['1. Costa (VI)', '2. Tedboy (VI)', '3. Bravo (VI)', '4. Fabio Big (VIII)', '5. Mórbius (IX)', '6. China (X)']);

log('');
log('=== chamada: o parser do app relê o que ele mesmo gerou ===');
// A prova de que o formato continua legível: depois do evento, a chamada
// preenchida no grupo é colada nos Relatórios. Se alguém mexer no molde e o
// parser deixar de entender, esta conferência acusa.
const hojeTeste = new Date(2026, 9, 2);
const lido = parseConvocacaoTexto(textoBarra, hojeTeste);
confere('a data volta igual (sem ano no texto)', lido.evento.data, evBarra.data);
confere('o tipo volta igual', lido.evento.tipo, 'Pub');
confere('o horário volta igual', lido.evento.horario, '19:30');
confere('todos os integrantes da divisão voltam, na ordem', lido.membrosParsed.map(m => m.nomeTexto),
  ['Costa', 'Tedboy', 'Bravo', 'Fabio Big', 'Mórbius', 'China']);
confere('com o grau de cada um', lido.membrosParsed.map(m => m.grauTexto), ['VI', 'VI', 'VI', 'VIII', 'IX', 'X']);
confere('o rodapé não vira integrante', lido.membrosParsed.some(m => m.nomeTexto === 'Bull'), false);
confere('sem nenhum aviso do parser', lido.avisos, []);

const lidoReg = parseConvocacaoTexto(textoReg, hojeTeste);
confere('Bonde Regional em branco: lista vazia, sem aviso', [lidoReg.membrosParsed.length, lidoReg.avisos], [0, []]);
confere('Bonde Regional: o tipo volta', lidoReg.evento.tipo, 'Ação Social');

log('');
log('=== chamada: o parser lê a chamada oficial, preenchida no grupo ===');
// A chamada real do Bonde Regional de 19/09, do jeito que circulou no grupo
// (o telefone foi trocado por um falso - o repositório é público).
const oficial = fs.readFileSync(path.join(AQUI, 'exemplos', 'chamada-bonde-regional.txt'), 'utf8');
const lidoOficial = parseConvocacaoTexto(oficial, hojeTeste);
confere('a data 19/09 vira 2026-09-19', lidoOficial.evento.data, '2026-09-19');
confere('o horário 7:00h vira 07:00', lidoOficial.evento.horario, '07:00');
confere('acha o único preenchido, no bloco do Regional',
  lidoOficial.membrosParsed.map(m => [m.nomeTexto, m.grauTexto, m.divisaoTexto, m.status]),
  [['Bull', 'V', 'Regional', 'confirmado']]);
// Data sem ano: o ano é o que deixa a data mais perto do dia em que se cola.
confere('em janeiro, 28/12 é do ano que passou',
  parseConvocacaoTexto('📅 Data: 28/12', new Date(2027, 0, 5)).evento.data, '2026-12-28');
confere('em dezembro, 03/01 é do ano que vem',
  parseConvocacaoTexto('📅 Data: 03/01', new Date(2026, 11, 20)).evento.data, '2027-01-03');

log('');
log('=== cobrar quem falta ===');
{
  const { quemFalta, textoCobranca } = await import(url('dominio/pendencias.js'));
  const { textoEfetivo } = await import(url('dominio/convocacao.js'));
  st.roster = [
    { id: 'c1', nome: 'Raposo', grau: 'VI', divisao: 'Barra - RJ4' },
    { id: 'c2', nome: 'Costa', grau: 'VI', divisao: 'Barra - RJ4', cargo: 'Diretor' },
    { id: 'c3', nome: 'Bravo', grau: 'X', divisao: 'Barra - RJ4' },
    { id: 'c4', nome: 'Fabiano', grau: 'IX', divisao: 'Oeste - RJ4' },
    { id: 'c5', nome: 'Bull', grau: 'V', divisao: 'Regional RJ4' },
  ];
  const status = { c1: 'aguardando', c2: 'aguardando', c3: 'confirmado', c4: undefined, c5: 'familia' };
  const evDiv = { id: 'x', nome: 'Pub', data: '2026-10-09', categoria: 'barra', tipo: 'Pub', memberIds: ['c1', 'c2', 'c3'] };
  const faltamDiv = quemFalta(evDiv, id => status[id]);
  confere('só quem está aguardando, na ordem hierárquica (cargo antes do nome)', nomes(faltamDiv), ['Costa', 'Raposo']);
  const regrasPadrao = textoEfetivo({}, 'regras');
  const texto = textoCobranca(evDiv, faltamDiv, regrasPadrao).split('\n');
  confere('a lista sai numerada com o grau', texto.filter(l => /^\d+\. /.test(l)), ['1. Costa (VI)', '2. Raposo (VI)']);
  confere('termina com as Regras do clube, iguais às da chamada', texto.slice(-regrasPadrao.length), regrasPadrao);
  confere('as Regras padrão são o prazo e o Respaldo RDI', [regrasPadrao[0], regrasPadrao[regrasPadrao.length - 1]],
    ['Prazo para a justificativa: 1 dia antes do evento.', 'X - Faltar sem motivo justificado a evento oficial do MC.']);
  confere('com Regras personalizadas, vale o texto do Regional',
    textoCobranca(evDiv, faltamDiv, textoEfetivo({ regras: 'Regra nova' }, 'regras')).split('\n').slice(-1), ['Regra nova']);
  confere('sem link nem a frase antiga', /Responda pelo app|Quem não responder/.test(texto.join('\n')), false);

  // Regional: sem resposta (undefined) também é "falta responder", e cada
  // divisão sai no seu bloco, na ordem oficial (Regional, Oeste, ..., Barra).
  const evReg = { ...evDiv, categoria: 'regional', memberIds: ['c1', 'c2', 'c3', 'c4', 'c5'] };
  const faltamReg = quemFalta(evReg, id => status[id]);
  const blocos = textoCobranca(evReg, faltamReg, regrasPadrao).split('\n').filter(l => /^\*[A-Z]/.test(l) && !l.startsWith('*Pub'));
  confere('regional: um bloco por divisão, na ordem oficial', blocos, ['*OESTE - RJ4*', '*BARRA - RJ4*']);
}

log('');
log('=== relatório parcial: evento aberto não dá falta ===');
{
  // Encerrar só pra ver o relatório dava falta a quem não respondeu. O
  // relatório de evento aberto mostra essa gente como "ainda não responderam".
  const { buildReportText } = await import(url('dominio/relatorio-texto.js'));
  st.reportData = { x: { c1: { status: 'aguardando' }, c3: { status: 'confirmado' } } };
  const evAberto = { id: 'x', nome: 'Pub', data: '2026-10-09', categoria: 'barra', status: 'ativo', memberIds: ['c1', 'c2', 'c3'] };
  const parcial = buildReportText(evAberto).split('\n');
  confere('aberto sai como parcial', parcial[0], '📋 RELATÓRIO PARCIAL DE PRESENÇA');
  confere('quem não respondeu fica em "ainda não responderam"',
    parcial.slice(parcial.indexOf('⚠️ AINDA NÃO RESPONDERAM (2)') + 1), ['- Raposo', '- Costa']);
  confere('sem falta no aberto', parcial.some(l => l.startsWith('⭕')), false);
  const final = buildReportText({ ...evAberto, status: 'encerrado' }).split('\n');
  confere('encerrado continua igual: quem não respondeu vira falta',
    [final[0], final.includes('⭕ FALTA NÃO JUSTIFICADA (2)'), final.some(l => l.startsWith('⚠️'))],
    ['📋 RELATÓRIO DE PRESENÇA', true, false]);
}

log('');
log('=== ações sociais: agenda, relatório do ano e convocação ===');
{
  const AS = await import(url('dominio/acoes-sociais.js'));
  const agenda = [
    { id: 'a1', mes: '2027-07', ideiaId: 'i1', emoji: '🧥', acao: 'Doação de agasalhos', data: '2027-07-10', horario: '09:00', local: 'Sede', observacao: '', situacao: 'planejada' },
    { id: 'a2', mes: '2027-07', ideiaId: '', emoji: '🎱', acao: 'Bingo no asilo', data: '', horario: '', local: '', observacao: '', situacao: 'ideia' },
    { id: 'a3', mes: '2026-12', ideiaId: '', emoji: '🎅', acao: 'Papai Noel', data: '', horario: '', local: '', observacao: '', situacao: 'realizada' },
  ];
  const r = AS.resumoDoAno(agenda, 2027);
  confere('o resumo conta meses e situações só do ano', [r.mesesComAcao, r.acoes, r.porSituacao.planejada], [1, 2, 1]);
  confere('a agenda abre no ano de hoje se ele tem ação', AS.anoInicialDaAgenda(agenda, '2026-10-21'), 2026);
  confere('senão, no próximo que tem', AS.anoInicialDaAgenda(agenda.slice(0, 2), '2026-10-21'), 2027);
  confere('sem nada, no ano de hoje', AS.anoInicialDaAgenda([], '2026-10-21'), 2026);
  confere('a ordem: mês, data, sem data por último', AS.ordenarAgenda([agenda[1], agenda[2], agenda[0]]).map(a => a.id), ['a3', 'a1', 'a2']);
  confere('horário escrito de qualquer jeito', ['9', '930', '09:30', '19h', '25', ''].map(AS.horarioNormalizado), ['09:00', '09:30', '09:30', '19:00', '', '']);

  const texto = AS.textoAgendaDoAno(agenda, 2027, 'Barra - RJ4').split('\n');
  confere('o relatório do ano começa com o ano e a divisão', texto.slice(0, 2), ['🤝 *AÇÕES SOCIAIS 2027* 🤝', '*BARRA - RJ4*']);
  confere('mês sem ação sai como a definir', texto.slice(texto.indexOf('*JANEIRO*'), texto.indexOf('*JANEIRO*') + 2), ['*JANEIRO*', '— a definir —']);
  const julho = texto.indexOf('*JULHO*');
  confere('julho: a escolhida com a situação e quando/onde, e a outra opção embaixo', texto.slice(julho, julho + 4),
    ['*JULHO*', '🧥 Doação de agasalhos — 📅 Planejada', '   Sábado, 10/07 · 09:00 · Sede', '💡 Outras opções: 🎱 Bingo no asilo']);
  const soOpcao = AS.textoAgendaDoAno([{ ...agenda[1], mes: '2027-03' }], 2027, 'Barra - RJ4').split('\n');
  const marco = soOpcao.indexOf('*MARÇO*');
  confere('mês só com opções: a definir, e as opções embaixo', soOpcao.slice(marco, marco + 3), ['*MARÇO*', '— a definir —', '💡 Opções: 🎱 Bingo no asilo']);
  confere('o ano de 2026 não entra no de 2027', texto.some(l => l.includes('Papai Noel')), false);

  const conv = AS.textoConvocacaoAcaoSocial(agenda[0], { descricao: 'Roupas e cobertores', precisa: 'Caixas' }, 'Barra - RJ4').split('\n');
  confere('a convocação: a ação, o dia por extenso, a hora e o local', conv.slice(3, 9),
    ['🧥 *DOAÇÃO DE AGASALHOS*', 'Roupas e cobertores', '', '📅 *Sábado, 10/07/2027*', '⏰ 09:00h', '📍 Sede']);
  confere('com o que precisa', conv.includes('🧰 *O que precisa:* Caixas'), true);
  confere('sem data, diz que está a definir', AS.textoConvocacaoAcaoSocial(agenda[1], null, 'Barra - RJ4').includes('📅 Data a definir'), true);
  confere('cada mês tem o contexto do rascunho', [AS.CONTEXTO_DOS_MESES[6], AS.CONTEXTO_DOS_MESES[11]], [['frio'], ['calor', 'ferias', 'natal', 'festas']]);
  confere('toda etiqueta do contexto está na legenda', AS.CONTEXTO_DOS_MESES.flat().every(c => AS.LEGENDA_CONTEXTO[c]), true);

  // O rascunho do Social: cada mes aponta pra uma ideia que existe.
  const R = await import(url('dominio/acoes-sociais-rascunho.js'));
  const nomes = R.RASCUNHO_IDEIAS.map(i => i.nome);
  confere('o rascunho: 28 ideias, sem nome repetido', [nomes.length, new Set(nomes).size], [28, 28]);
  confere('a agenda do rascunho: os 12 meses de 2027, cada um com uma ideia do banco',
    [R.RASCUNHO_AGENDA.map(a => a.mes.slice(5)).join(','), R.RASCUNHO_AGENDA.every(a => nomes.includes(a.ideia))],
    ['01,02,03,04,05,06,07,08,09,10,11,12', true]);
  confere('julho é a doação de agasalhos', R.RASCUNHO_AGENDA[6].ideia, 'Doação de agasalhos');
  confere('os 3 textos, com a assinatura', R.RASCUNHO_TEXTOS.map(t => t.titulo + ':' + t.texto.includes('Almeida. VI')), ['Arrecadação Pub:true', 'Reflexivo:true', 'Motivacional:true']);
}

log('');
log('=== carteirinha: idade, telefone e aniversários do mural ===');
{
  const C = await import(url('dominio/carteirinha.js'));
  confere('a idade conta o aniversário do ano', [C.idadeEm('1985-03-12', '2026-03-11'), C.idadeEm('1985-03-12', '2026-03-12'), C.idadeEm('', '2026-03-12')], [40, 41, null]);
  confere('telefone vira link com o Brasil', [C.telefoneParaLink('(21) 99999-0000'), C.telefoneParaLink('+351 912 345 678'), C.linkWhatsApp('21 98888-1111')],
    ['+5521999990000', '+351912345678', 'https://wa.me/5521988881111']);
  const lista = [
    { nome: 'Costa', nascimento: '1985-10-21' },   // hoje
    { nome: 'Bull', nascimento: '1990-10-28' },    // daqui a 7 dias
    { nome: 'Raposo', nascimento: '1990-10-29' },  // daqui a 8: fora
    { nome: 'Bravo', nascimento: '1990-10-20' },   // ontem: fora
    { nome: 'Leap', nascimento: '1992-02-29' },
  ];
  confere('do dia até 7 dias antes, do mais perto pro mais longe', C.aniversariosProximos(lista, '2026-10-21').map(a => `${a.nome} ${a.dias} ${a.idade}`), ['Costa 0 41', 'Bull 7 36']);
  confere('virando o ano: 1º de janeiro visto em 28 de dezembro', C.aniversariosProximos([{ nome: 'X', nascimento: '2000-01-01' }], '2026-12-28').map(a => a.dias + ' ' + a.idade), ['4 27']);
  confere('29/02 faz aniversário em 28/02 no ano que não é bissexto', C.aniversariosProximos(lista, '2027-02-27').map(a => a.nome + ' ' + a.dias), ['Leap 1']);
}

log('');
log('=== doações: kg, cumprimento e quem foi e não levou ===');
{
  const { rankDoacoes, membrosParaMarcar, textoDoacoes, formatKg, eventosDoPeriodo } = await import(url('dominio/doacoes.js'));
  const membros = [
    { id: 'd1', nome: 'Costa', grau: 'VI', cargo: 'Diretor' },
    { id: 'd2', nome: 'Raposo', grau: 'VI', cargo: 'Social' },
    { id: 'd3', nome: 'Bravo', grau: 'X' },
  ];
  const evD = (id, data, status, confirmados, doacoes, convocados) => ({ id, nome: id, data, tipo: 'Pub', status,
    convocados: convocados || ['d1', 'd2', 'd3'], confirmados, doacoes });
  const dados = { eventos: [
    // Costa foi nos 3 encerrados e levou em 2; Raposo foi em 2 e levou em 2
    // (2 kg num deles); Bravo foi em 1 e nao levou.
    evD('e1', '2026-08-01', 'encerrado', ['d1', 'd2'], { d1: 1, d2: 2 }),
    evD('e2', '2026-08-15', 'encerrado', ['d1', 'd2', 'd3'], { d1: 1, d2: 1 }),
    evD('e3', '2026-09-01', 'encerrado', ['d1'], {}),
    // Evento aberto: o kg conta, o cumprimento nao (ainda pode mudar).
    evD('e4', '2099-01-01', 'ativo', [], { d3: 1.5 }),
    // Quem levou sem estar Confirmado: soma kg, nao conta no cumprimento.
    evD('e5', '2026-09-10', 'encerrado', [], { d1: 1 }),
    // Quem saiu do clube (d9) soma no total da divisao, mas nao aparece na lista.
    evD('e6', '2026-09-20', 'encerrado', ['d9'], { d9: 1 }),
  ] };
  const r = rankDoacoes(dados, membros, 0);
  const porId = Object.fromEntries(r.membros.map(m => [m.id, m]));
  confere('kg de cada um, somando evento aberto e sem confirmação', [porId.d1.kg, porId.d2.kg, porId.d3.kg], [3, 3, 1.5]);
  confere('cumprimento só conta evento encerrado em que estava Confirmado',
    [porId.d1.cumprimento, porId.d2.cumprimento, porId.d3.cumprimento], [67, 100, 0]);
  confere('empate em kg: quem cumpre mais vem antes', r.membros.map(m => m.nome), ['Raposo', 'Costa', 'Bravo']);
  confere('o total da divisão inclui quem saiu do clube', r.totalKg, 8.5);
  confere('cumprimento da divisão (4 de 6 presenças)', [r.presencasComDoacao, r.presencas, r.cumprimento], [4, 6, 67]);
  confere('quem foi e não levou, quem deixou mais primeiro', r.melhorar.map(m => m.nome), ['Bravo', 'Costa']);
  confere('ninguém que não foi aparece pra melhorar', r.melhorar.some(m => m.nome === 'Raposo'), false);
  // Do mais recente pro mais antigo: e6, e5 (ninguem confirmado), e3, e2, e1.
  confere('a tendência é por evento encerrado', r.porEvento.map(x => x.pct), [100, null, 0, 67, 100]);
  confere('kg em português', [formatKg(2.5), formatKg(3), formatKg(0)], ['2,5 kg', '3 kg', '0 kg']);
  confere('o período corta pela data do evento', eventosDoPeriodo([{ data: '2000-01-01' }, { data: '' }], 3).length, 0);

  // Marcar: os confirmados primeiro, cada grupo na ordem hierárquica.
  const roster = [...membros, { id: 'd4', nome: 'Alfa', grau: 'X' }];
  confere('marcar: confirmados primeiro, depois a hierarquia',
    nomes(membrosParaMarcar(evD('x', '', 'ativo', ['d3'], {}, ['d1', 'd2', 'd3']), roster, roster)), ['Bravo', 'Costa', 'Raposo']);
  confere('marcar: quem já doou entra mesmo sem convocação',
    nomes(membrosParaMarcar(evD('x', '', 'ativo', [], { d4: 1 }, ['d1']), roster, roster)), ['Costa', 'Alfa']);
  confere('marcar: evento sem convocados mostra a divisão inteira',
    membrosParaMarcar(evD('x', '', 'ativo', [], {}, []), membros, roster).length, 3);

  const texto = textoDoacoes(r, 'barra', 0).split('\n');
  confere('texto: o rank só com quem levou', texto.filter(l => /^\d+\. .* kg$/.test(l)),
    ['1. Raposo (VI) — 3 kg', '2. Costa (VI) — 3 kg', '3. Bravo (X) — 1,5 kg']);
  confere('texto: quem foi e não levou, com a conta', texto.filter(l => /levou em/.test(l)),
    ['1. Bravo (X) — levou em 0 de 1 evento', '2. Costa (VI) — levou em 2 de 3 eventos']);
  confere('texto: termina lembrando a regra', texto[texto.length - 1], 'Regra do clube: *1 kg de alimento em todo evento.*');
}

log('');
log('=== caixinha: meses, quem está em dia e quem deve ===');
{
  const { rankCaixinha, mesISO, nomeDoMes, nomeCurtoDoMes, mesesParaEscolher, mesesDoPeriodo, quemNaoPagou,
    textoCaixinha, relatorioMesCaixinha, textoRelatorioMesCaixinha } = await import(url('dominio/caixinha.js'));
  const base = new Date(2026, 9, 18); // 18/10/2026
  confere('o mês de hoje e os vizinhos', [mesISO(0, base), mesISO(-1, base), mesISO(1, base), mesISO(-10, base)],
    ['2026-10', '2026-09', '2026-11', '2025-12']);
  confere('nome do mês', [nomeDoMes('2026-10'), nomeCurtoDoMes('2026-03')], ['Outubro/2026', 'mar/26']);
  const escolha = mesesParaEscolher(base);
  confere('dá pra lançar do mês que vem até um ano atrás', [escolha[0], escolha[1], escolha[escolha.length - 1]],
    ['2026-11', '2026-10', '2025-10']);

  const membros = [
    { id: 'c1', nome: 'Costa', grau: 'VI', cargo: 'Diretor' },
    { id: 'c2', nome: 'Raposo', grau: 'VI', cargo: 'Social' },
    { id: 'c3', nome: 'Bravo', grau: 'X' },
  ];
  const mes = (m, pagos, ids) => ({ mes: m, membros: ids.map(id => ({ id, nome: 'Nome ' + id, pagou: pagos.includes(id) })) });
  const dados = { meses: [
    // Bravo (c3) entrou em outubro: setembro e julho nao contam pra ele.
    mes('2026-10', ['c1', 'c3'], ['c1', 'c2', 'c3']),
    mes('2026-09', ['c1'], ['c1', 'c2', 'c9']),
    mes('2026-07', ['c1', 'c2'], ['c1', 'c2']),
  ] };
  confere('janela de 3 meses em outubro: agosto a outubro', mesesDoPeriodo(dados.meses, 3, base).map(m => m.mes), ['2026-10', '2026-09']);

  const r = rankCaixinha(dados, membros, 0, base);
  const porId = Object.fromEntries(r.membros.map(m => [m.id, m]));
  confere('quem entrou depois não deve mês antigo', [porId.c3.devia, porId.c3.pct], [1, 100]);
  confere('o % de cada um', [porId.c1.pct, porId.c2.pct], [100, 33]);
  confere('os meses que cada um deve', porId.c2.devendo, ['2026-10', '2026-09']);
  confere('ordem: % maior primeiro, empate por quem pagou mais', r.membros.map(m => m.nome), ['Costa', 'Bravo', 'Raposo']);
  confere('quantos pagaram em cada mês', r.meses.map(m => `${m.pagaram}/${m.total}`), ['2/3', '1/3', '2/2']);
  confere('o % da divisão conta até quem saiu do clube (5 de 8)', [r.pagamentos, r.cobrancas, r.pct], [5, 8, 63]);
  confere('em dia e pendentes', [nomes(r.emDia), nomes(r.devendo)], [['Costa', 'Bravo'], ['Raposo']]);
  // Dados sem valor (so "pagou"): cada pagamento vale o padrao.
  confere('sem valor gravado, cada pagamento vale R$ 30', [r.arrecadado, porId.c1.valor], [150, 90]);

  const roster = [...membros];
  confere('quem não pagou, com quem saiu pelo nome gravado', nomes(quemNaoPagou(dados.meses[1], roster)), ['Raposo', 'Nome c9']);
  // Relatorio do mes: os dois lados, com nome, na ordem hierarquica.
  const rel = relatorioMesCaixinha(dados.meses[1], roster);
  confere('relatório do mês: quem pagou e quem não pagou', [nomes(rel.pagaram), nomes(rel.naoPagaram), rel.pct],
    [['Costa'], ['Raposo', 'Nome c9'], 33]);
  const relTexto = textoRelatorioMesCaixinha(dados.meses[0], roster, 'barra').split('\n');
  confere('relatório do mês pro WhatsApp', relTexto.slice(1), ['*BARRA - RJ4* · Outubro/2026', '', '*2 de 3* pagaram (67%)',
    '', '✅ *PAGARAM (2)*', '✅ Costa (VI)', '✅ Bravo (X)', '', '❌ *NÃO PAGARAM (1)*', '❌ Raposo (VI)']);
  const todosPagaram = textoRelatorioMesCaixinha(dados.meses[2], roster, 'barra');
  confere('mês em que todos pagaram não tem a lista de quem não pagou', /NÃO PAGARAM/.test(todosPagaram), false);
  const texto = textoCaixinha(r, 'barra', 0).split('\n');
  confere('panorama: os meses do mais antigo pro mais novo', texto.filter(l => l.startsWith('• ')),
    ['• Julho/2026: 2 de 2 pagaram', '• Setembro/2026: 1 de 3 pagaram', '• Outubro/2026: 2 de 3 pagaram']);
  confere('panorama: pendentes com os meses', texto.filter(l => / — /.test(l)), ['1. Raposo (VI) — out/26, set/26']);
}

log('');
log('=== caixinha: reais e o valor digitado ===');
{
  const { formatReais, lerValor, valorPago, somaReais } = await import(url('dominio/caixinha.js'));
  confere('reais sempre com centavos', [formatReais(30), formatReais(1234.5), formatReais(0), formatReais(-10)],
    ['R$ 30,00', 'R$ 1.234,50', 'R$ 0,00', '−R$ 10,00']);
  confere('o valor digitado: número, vírgula, milhar e "R$"',
    ['30', '35,50', '1.234,50', 'R$ 30', '30.5', '1.234', ' 40 '].map(t => lerValor(t)), [30, 35.5, 1234.5, 30, 30.5, 1234, 40]);
  confere('vazio é 0 (não pagou)', lerValor(''), 0);
  confere('o que não é valor, e o que passa de R$ 10 mil, é null', ['3o', '30,555', '-5', '50000'].map(t => lerValor(t)), [null, null, null, null]);
  confere('saldo inicial aceita até R$ 1 milhão', lerValor('50000', 1000000), 50000);
  confere('valor pago: o gravado, ou o padrão pra quem só tem "pagou"',
    [valorPago({ pagou: true, valor: 35 }), valorPago({ pagou: true }), valorPago({ pagou: false })], [35, 30, 0]);
  confere('soma sem sujeira de vírgula flutuante', somaReais([0.1, 0.2]), 0.3);
}

log('');
log('=== caixinha: controle financeiro (saldo, entradas, saídas, período) ===');
{
  const { controleCaixinha, movimentosDoCaixa, textoControleCaixinha, rotuloDoPeriodoFinanceiro } = await import(url('dominio/caixinha-financeiro.js'));
  const base = new Date(2026, 9, 18); // 18/10/2026
  const pg = (id, valor) => ({ id, nome: 'N' + id, pagou: valor > 0, valor });
  const { categoriasSaidaCaixinha } = await import(url('nucleo/config.js'));
  confere('a contribuição pro Regional é saída da divisão, não do Regional',
    [categoriasSaidaCaixinha('barra').includes('Contribuição Caixinha Regional'), categoriasSaidaCaixinha('regional').includes('Contribuição Caixinha Regional'),
      categoriasSaidaCaixinha('regional').at(-1)], [true, false, 'Outros']);
  const lc = (id, tipo, data, categoria, descricao, valor) => ({ id, tipo, data, categoria, descricao, valor });
  const dados = {
    meses: [
      { mes: '2026-10', membros: [pg('a', 30), pg('b', 35), pg('c', 0)] },
      { mes: '2026-09', membros: [pg('a', 30), pg('b', 0)] },
      // Antes do saldo inicial: fica de fora da conta.
      { mes: '2026-07', membros: [pg('a', 30)] },
    ],
    saldoInicial: { mes: '2026-08', valor: 175 },
    lancamentos: [
      lc('l4', 'saida', '2026-10-07', 'Kit Churrasco / lanches', 'Pão', 15.5),
      lc('l1', 'saida', '2026-10-05', 'Kit Churrasco / lanches', 'Carne', 100),
      lc('l3', 'entrada', '2026-09-15', 'Outras entradas', 'Rifa', 50),
      lc('l2', 'saida', '2026-09-10', 'Adesivos', '', 20),
      lc('l5', 'saida', '2026-07-20', 'Adesivos', 'velho', 999),
    ],
  };

  const caixa = movimentosDoCaixa(dados);
  confere('as mensalidades viram uma entrada por mês, somadas do Mês a mês',
    caixa.itens.filter(x => x.origem === 'mensalidade').map(x => [x.mes, x.valor, x.pagaram]), [['2026-10', 65, 2], ['2026-09', 30, 1]]);
  confere('o que é de antes do saldo inicial fica de fora (e é contado)', caixa.antesDoInicio, 2);

  const tudo = controleCaixinha(dados, 0, base);
  confere('tudo: entradas (mensalidades + outras) e saídas',
    [tudo.entradas.mensalidades, tudo.entradas.pagamentos, tudo.entradas.outras, tudo.entradas.total, tudo.saidas.total],
    [95, 3, 50, 145, 135.5]);
  confere('tudo: começa no saldo inicial e termina no saldo de hoje',
    [tudo.saldoAnterior, tudo.saldoFinal, tudo.saldoAtual], [175, 184.5, 184.5]);
  confere('saídas por categoria, da maior pra menor', tudo.saidas.porCategoria.map(c => [c.categoria, c.valor, c.itens.length]),
    [['Kit Churrasco / lanches', 115.5, 2], ['Adesivos', 20, 1]]);
  confere('mês a mês, do mais antigo pro mais novo', tudo.porMes, [
    { mes: '2026-09', entradas: 80, saidas: 20 }, { mes: '2026-10', entradas: 65, saidas: 115.5 }]);
  confere('o extrato do mais recente pro mais antigo', tudo.extrato.map(x => x.id || x.mes),
    ['l4', 'l1', '2026-10', 'l3', 'l2', '2026-09']);

  const outubro = controleCaixinha(dados, '2026-10', base);
  confere('um mês: o saldo no início leva o que veio antes',
    [outubro.saldoAnterior, outubro.entradas.total, outubro.saidas.total, outubro.saldoFinal], [235, 65, 115.5, 184.5]);
  const setembro = controleCaixinha(dados, '2026-09', base);
  confere('setembro termina onde outubro começa', [setembro.saldoAnterior, setembro.saldoFinal], [175, 235]);
  confere('o saldo de hoje não depende do período', setembro.saldoAtual, 184.5);
  const julho = controleCaixinha(dados, '2026-07', base);
  confere('mês antes do saldo inicial: avisado e vazio', [julho.periodoAntesDoInicio, julho.extrato.length, julho.saldoFinal], [true, 0, 175]);
  confere('3 meses em outubro (agosto a outubro) = tudo desde o saldo inicial', controleCaixinha(dados, 3, base).saldoFinal, 184.5);

  const semSaldo = controleCaixinha({ ...dados, saldoInicial: null }, 0, base);
  confere('sem saldo inicial: do zero, e tudo conta', [semSaldo.temSaldoInicial, semSaldo.antesDoInicio, semSaldo.saldoAtual], [false, 0, -959.5]);
  confere('caixa vazio não quebra', controleCaixinha({ meses: [], saldoInicial: null, lancamentos: [] }, 0, base).saldoAtual, 0);

  confere('o rótulo do período', [rotuloDoPeriodoFinanceiro('2026-10'), rotuloDoPeriodoFinanceiro(0), rotuloDoPeriodoFinanceiro(6)],
    ['Outubro/2026', 'Desde sempre', 'Últimos 6 meses']);
  confere('o relatório de controle pro WhatsApp', textoControleCaixinha(outubro, 'barra').split('\n'), [
    '💰 *CAIXINHA · CONTROLE* 💰',
    '*BARRA - RJ4* · Outubro/2026',
    '',
    '💼 Saldo no início: *R$ 235,00*',
    '',
    '🟢 *ENTRADAS: R$ 65,00*',
    '• Mensalidades: R$ 65,00 (2 pagamentos)',
    '',
    '🔴 *SAÍDAS: R$ 115,50*',
    '• Kit Churrasco / lanches: R$ 115,50',
    '   ↳ 05/10 · Carne · R$ 100,00',
    '   ↳ 07/10 · Pão · R$ 15,50',
    '',
    '💰 *SALDO: R$ 184,50*',
  ]);
  const texto9 = textoControleCaixinha(setembro, 'barra');
  confere('outras entradas com a descrição, e saída sem descrição', [
    texto9.includes('• Outras entradas: R$ 50,00\n   ↳ 15/09 · Rifa · R$ 50,00'),
    texto9.includes('   ↳ 10/09 · R$ 20,00')], [true, true]);
  confere('o texto não leva nome de integrante', /Na|Nb/.test(textoControleCaixinha(tudo, 'barra')), false);
  confere('período sem nada diz que não houve', textoControleCaixinha(julho, 'barra').includes('• Nenhuma saída'), true);

  // O periodo "de um mes a outro" (o relatorio em imagem).
  const { mesesDoPeriodoFinanceiro, periodoDeUmMes } = await import(url('dominio/caixinha-financeiro.js'));
  const setOut = controleCaixinha(dados, { de: '2026-09', ate: '2026-10' }, base);
  confere('de setembro a outubro: início, entradas, saídas e fim',
    [setOut.saldoAnterior, setOut.entradas.total, setOut.saidas.total, setOut.saldoFinal], [175, 145, 135.5, 184.5]);
  confere('escolhido ao contrário, vale a ordem certa',
    controleCaixinha(dados, { de: '2026-10', ate: '2026-09' }, base).saldoFinal, 184.5);
  confere('a série mês a mês, com o saldo do fim de cada mês', setOut.serie, [
    { mes: '2026-09', entradas: 80, saidas: 20, saldo: 235 }, { mes: '2026-10', entradas: 65, saidas: 115.5, saldo: 184.5 }]);
  confere('a série não pula mês vazio (agosto, sem nada)', tudo.serie.map(m => [m.mes, m.saldo]),
    [['2026-08', 175], ['2026-09', 235], ['2026-10', 184.5]]);
  confere('as saídas por mês, do mais antigo pro mais novo e por dia', setOut.saidasPorMes.map(m => [m.mes, m.total, m.itens.map(x => x.id)]),
    [['2026-09', 20, ['l2']], ['2026-10', 115.5, ['l1', 'l4']]]);
  confere('mês antes do saldo inicial: série vazia', julho.serie, []);
  confere('rótulo de um mês a outro', [rotuloDoPeriodoFinanceiro({ de: '2026-08', ate: '2026-10' }), rotuloDoPeriodoFinanceiro({ de: '2026-10', ate: '2026-10' })],
    ['Agosto/2026 a Outubro/2026', 'Outubro/2026']);
  confere('os meses que os seletores mostram', [mesesDoPeriodoFinanceiro(6, base), mesesDoPeriodoFinanceiro(0, base), mesesDoPeriodoFinanceiro('2026-09', base)],
    [{ de: '2026-05', ate: '2026-10' }, { de: '', ate: '2026-10' }, { de: '2026-09', ate: '2026-09' }]);
  // O saldo inicial de hoje (com o dia): o mes dele ja esta dentro do valor.
  const { quandoDoSaldoInicial } = await import(url('dominio/caixinha-financeiro.js'));
  const comDia = {
    meses: [{ mes: '2026-09', membros: [pg('a', 30)] }, { mes: '2026-10', membros: [pg('a', 30), pg('b', 35)] }],
    saldoInicial: { mes: '2026-09', data: '2026-09-15', valor: 100 },
    lancamentos: [
      lc('d1', 'saida', '2026-09-15', 'Adesivos', 'no mesmo dia', 10),
      lc('d2', 'saida', '2026-09-16', 'Adesivos', 'no dia seguinte', 20),
      lc('d3', 'entrada', '2026-09-30', 'Outras entradas', 'pagou setembro atrasado', 30),
    ],
  };
  const cd = controleCaixinha(comDia, 0, base);
  confere('saldo de hoje: a mensalidade do mês dele fica de fora, a do mês seguinte conta',
    cd.extrato.filter(x => x.origem === 'mensalidade').map(x => x.mes), ['2026-10']);
  confere('saldo de hoje: lançamento do mesmo dia conta, e o do dia seguinte também',
    cd.extrato.filter(x => x.origem === 'lancamento').map(x => x.id), ['d3', 'd2', 'd1']);
  confere('saldo de hoje: a conta', [cd.antesDoInicio, cd.saldoAtual], [1, 100 - 10 - 20 + 30 + 65]);
  confere('saldo de hoje: lançamento do dia anterior fica de fora',
    movimentosDoCaixa({ ...comDia, lancamentos: [lc('d0', 'saida', '2026-09-14', 'Outros', 'na véspera', 5)] }).antesDoInicio, 2);
  confere('o relatório de setembro começa no saldo e leva o do dia dele em diante',
    [controleCaixinha(comDia, '2026-09', base).saldoAnterior, controleCaixinha(comDia, '2026-09', base).saldoFinal], [100, 100]);
  confere('como o saldo inicial é descrito', [quandoDoSaldoInicial(comDia.saldoInicial), quandoDoSaldoInicial({ mes: '2026-08', valor: 1 })],
    ['definido em 15/09/2026', 'no começo de Agosto/2026']);
  confere('o que é período de um mês só', [periodoDeUmMes('2026-10'), periodoDeUmMes({ de: '2026-10', ate: '2026-10' }), periodoDeUmMes({ de: '2026-09', ate: '2026-10' }), periodoDeUmMes(6)],
    [true, true, false, false]);
}

log('');
log('=== estoque das doações: medidas e quantidades ===');
{
  const { sugerirMedida, proximaMedida, lerQuantidade, numeroEstoque, textoQuantidade } = await import(url('dominio/estoque.js'));
  confere('o que se conta em par', ['Sapato', 'Tênis infantil', 'chinelos', 'Sandália', 'Botas', 'Meia', 'Cobertor', 'Botão', 'Blusa'].map(sugerirMedida),
    ['par', 'par', 'par', 'par', 'par', 'par', 'un', 'un', 'un']);
  confere('o que se pesa em kg', ['Arroz', 'Feijão preto', 'Açúcar', 'Macarrão', 'Alimentos', 'Sal', 'Cobertor', 'Salgadinho'].map(sugerirMedida),
    ['kg', 'kg', 'kg', 'kg', 'kg', 'kg', 'un', 'un']);
  confere('a medida gira un, par, kg', [proximaMedida('un'), proximaMedida('par'), proximaMedida('kg')], ['par', 'kg', 'un']);
  confere('kg aceita uma casa decimal; un e par, só inteiro; o resto vira 0',
    [lerQuantidade('2,5', 'kg'), lerQuantidade('2.55', 'kg'), lerQuantidade('2,5', 'un'), lerQuantidade('3', 'par'), lerQuantidade('', 'kg'), lerQuantidade('-3', 'un')],
    [2.5, 0, 0, 3, 0, 0]);
  confere('como a quantidade se escreve', [textoQuantidade(12, 'un'), textoQuantidade(1, 'par'), textoQuantidade(6, 'par'), textoQuantidade(2.5, 'kg'), numeroEstoque(1000)],
    ['12 un', '1 par', '6 pares', '2,5 kg', '1000']);
}

log('');
log('=== estoque das doações: o relatório (livro, período, gráficos, texto) ===');
{
  const { relatorioEstoque, textoRelatorioEstoque, podeAnular, tituloDoMovimento, ITEM_ALIMENTOS } = await import(url('dominio/estoque.js'));
  const base = new Date(2026, 9, 18); // 18/10/2026
  const mv = (id, itemId, item, medida, data, tipo, quantidade, extra) => ({ id, itemId, item, medida, data, tipo, quantidade,
    origem: '', destino: '', descricao: '', eventoId: '', anulado: false, ...extra });
  const dados = {
    itens: [{ id: 'al', nome: ITEM_ALIMENTOS, medida: 'kg', automatico: true, saldo: 3.5 }, { id: 'cb', nome: 'Cobertor', medida: 'un', saldo: 8 }],
    movimentos: [
      mv('1', 'al', ITEM_ALIMENTOS, 'kg', '2026-08-10', 'entrada', 3, { origem: 'evento', eventoId: 'e1', descricao: 'Pub' }),
      mv('2', 'al', ITEM_ALIMENTOS, 'kg', '2026-09-05', 'entrada', 4, { origem: 'avulsa', descricao: 'família do Costa' }),
      mv('3', 'al', ITEM_ALIMENTOS, 'kg', '2026-09-06', 'correcao', -1, { origem: 'evento', eventoId: 'e1', descricao: 'Correção · Pub' }),
      mv('4', 'al', ITEM_ALIMENTOS, 'kg', '2026-10-02', 'saida', 0.5, { destino: 'familia' }),
      mv('5', 'al', ITEM_ALIMENTOS, 'kg', '2026-10-03', 'saida', 2, { destino: 'instituicao', descricao: 'Abrigo' }),
      mv('6', 'al', ITEM_ALIMENTOS, 'kg', '2026-10-04', 'saida', 9, { destino: 'familia', anulado: true }),
      mv('7', 'cb', 'Cobertor', 'un', '2026-10-01', 'entrada', 10, { origem: 'avulsa' }),
      mv('8', 'cb', 'Cobertor', 'un', '2026-10-05', 'saida', 2, { destino: 'acao_social', descricao: 'Natal' }),
    ],
  };

  const tudo = relatorioEstoque(dados, 'al', 0, base);
  confere('tudo: início, entrou, correções (à parte), saiu e fim',
    [tudo.item.saldoAnterior, tudo.entradas.total, tudo.correcoes, tudo.saidas.total, tudo.item.saldoFinal], [0, 7, -1, 2.5, 3.5]);
  confere('o anulado não conta em nada', tudo.saidas.total, 2.5);
  confere('de onde veio: eventos e avulsas (a correção não entra aqui)', [tudo.entradas.eventos, tudo.entradas.avulsas], [3, 4]);
  confere('para onde foi, do maior pro menor', tudo.saidas.porDestino.map(d => [d.chave, d.valor]), [['instituicao', 2], ['familia', 0.5]]);
  confere('mês a mês, sem pular mês, com o saldo do fim de cada um', tudo.serie,
    [{ mes: '2026-08', entradas: 3, saidas: 0, saldo: 3 }, { mes: '2026-09', entradas: 4, saidas: 0, saldo: 6 }, { mes: '2026-10', entradas: 0, saidas: 2.5, saldo: 3.5 }]);
  confere('sem item escolhido, vale o primeiro', relatorioEstoque(dados, null, 0, base).item.id, 'al');

  const out = relatorioEstoque(dados, 'al', '2026-10', base);
  confere('um mês: o saldo no início leva o que veio antes', [out.item.saldoAnterior, out.entradas.total, out.saidas.total, out.item.saldoFinal], [6, 0, 2.5, 3.5]);
  confere('a tabela traz todos os itens, cada um na sua medida', out.tabela.map(t => [t.item, t.medida, t.saldoAnterior, t.entrou, t.correcoes, t.saiu, t.saldoFinal]),
    [[ITEM_ALIMENTOS, 'kg', 6, 0, 0, 2.5, 3.5], ['Cobertor', 'un', 0, 10, 0, 2, 8]]);
  const set = relatorioEstoque(dados, 'al', '2026-09', base);
  confere('um mês só com correção: entrou continua positivo, a correção vem à parte', [set.entradas.total, set.correcoes, set.item.saldoFinal], [4, -1, 6]);
  const { resumoDaLinha } = await import(url('dominio/estoque.js'));
  confere('a linha de um item, com e sem correção', [resumoDaLinha(set.tabela[0]), resumoDaLinha(out.tabela[1])],
    ['início 3 kg · 🟢 +4 · ↩️ −1 · 🔴 −0', 'início 0 un · 🟢 +10 · 🔴 −2']);
  confere('as saídas do período, de todos os itens, por dia (sem a anulada)', out.saidasPorMes.map(m => [m.mes, m.itens.map(x => x.id)]), [['2026-10', ['4', '5', '8']]]);
  confere('o extrato do item mostra a anulada (riscada na tela)', out.extrato.map(x => x.id), ['4', '5', '6']);
  confere('de agosto a setembro', relatorioEstoque(dados, 'al', { de: '2026-08', ate: '2026-09' }, base).item.saldoFinal, 6);
  confere('estoque vazio não quebra', [relatorioEstoque({ itens: [], movimentos: [] }, null, 0, base).item, relatorioEstoque(null, null, 0, base).tabela], [null, []]);

  confere('anula-se a entrada avulsa e a saída; o que veio do evento, não',
    dados.movimentos.map(podeAnular), [false, true, false, true, true, false, true, true]);
  confere('o título de cada linha do extrato', [tituloDoMovimento(dados.movimentos[0]), tituloDoMovimento(dados.movimentos[3]), tituloDoMovimento(dados.movimentos[4]), tituloDoMovimento(dados.movimentos[2])],
    ['🥫 Pub', '👨‍👩‍👧 Família', '🏠 Instituição · Abrigo', 'Correção · Pub']);

  const texto = textoRelatorioEstoque(out, 'barra', 'Outubro/2026').split('\n');
  confere('o texto pro WhatsApp', texto, [
    '📦 *ESTOQUE DE DOAÇÕES* 📦',
    '*BARRA - RJ4* · Outubro/2026',
    '',
    `• *${ITEM_ALIMENTOS}*: 3,5 kg`,
    '   ↳ início 6 kg · 🟢 +0 · 🔴 −2,5',
    '• *Cobertor*: 8 un',
    '   ↳ início 0 un · 🟢 +10 · 🔴 −2',
    '',
    '🔴 *SAÍDAS: 3*',
    '_Outubro/2026_',
    `   ↳ 02/10 · ${ITEM_ALIMENTOS} 0,5 kg · 👨‍👩‍👧 Família`,
    `   ↳ 03/10 · ${ITEM_ALIMENTOS} 2 kg · 🏠 Instituição · Abrigo`,
    '   ↳ 05/10 · Cobertor 2 un · 🤝 Ação social · Natal',
  ]);
  confere('período sem nada diz que não houve', textoRelatorioEstoque(relatorioEstoque(dados, 'al', '2026-01', base), 'barra', 'Janeiro/2026').includes('• Nenhuma saída'), true);
}

log('');
log('=== caixinha do Regional: quem contribui são as divisões ===');
{
  const { divisoesContribuintes, ehCaixinhaDeDivisoes, vocabularioCaixinha, ordenarParticipantes, rankCaixinha, relatorioMesCaixinha, textoRelatorioMesCaixinha, textoCaixinha } = await import(url('dominio/caixinha.js'));
  const { controleCaixinha, textoControleCaixinha } = await import(url('dominio/caixinha-financeiro.js'));
  confere('as 6 divisões, na ordem oficial', divisoesContribuintes().map(d => d.id), ['oeste', 'recreio', 'barra', 'curicica', 'taquara', 'gardenia']);
  confere('só o Regional é caixinha de divisões', [ehCaixinhaDeDivisoes('regional'), ehCaixinhaDeDivisoes('barra')], [true, false]);
  confere('o vocabulário', [vocabularioCaixinha('regional').pagaram, vocabularioCaixinha('barra').pagaram, vocabularioCaixinha('regional').mensalidades],
    ['contribuíram', 'pagaram', 'Contribuições das divisões']);
  confere('divisões na ordem oficial, não alfabética',
    ordenarParticipantes([{ id: 'barra', nome: 'Barra - RJ4' }, { id: 'oeste', nome: 'Oeste - RJ4' }, { id: 'gardenia', nome: 'Gardênia - RJ4' }], 'regional').map(d => d.id),
    ['oeste', 'barra', 'gardenia']);

  const c = (id, valor) => ({ id, nome: divisoesContribuintes().find(d => d.id === id).nome, pagou: valor > 0, valor });
  const dados = {
    meses: [{ mes: '2026-10', membros: [c('barra', 70), c('oeste', 90), c('recreio', 0)] }],
    saldoInicial: { mes: '2026-10', data: '2026-09-30', valor: 500 },
    lancamentos: [{ id: 'x', tipo: 'saida', data: '2026-10-05', categoria: 'Outros', descricao: 'Bandeira', valor: 100 }],
  };
  const rel = relatorioMesCaixinha(dados.meses[0], divisoesContribuintes(), 'regional');
  confere('o relatório do mês: quem contribuiu e quem não', [rel.pagaram.map(d => d.id), rel.naoPagaram.map(d => d.id)], [['oeste', 'barra'], ['recreio']]);
  confere('o relatório do mês pro WhatsApp', textoRelatorioMesCaixinha(dados.meses[0], divisoesContribuintes(), 'regional').split('\n').slice(1), [
    '*REGIONAL RJ4* · Outubro/2026', '', '*2 de 3* contribuíram (67%)', '', '✅ *CONTRIBUÍRAM (2)*', '✅ Oeste - RJ4', '✅ Barra - RJ4',
    '', '❌ *NÃO CONTRIBUÍRAM (1)*', '❌ Recreio - RJ4']);
  const rank = rankCaixinha(dados, divisoesContribuintes(), 0, new Date(2026, 9, 18));
  confere('o rank: quanto cada divisão contribuiu e o total', [rank.arrecadado, rank.membros.find(d => d.id === 'oeste').valor], [160, 90]);
  confere('o panorama fala em contribuições', textoCaixinha(rank, 'regional', 0).split('\n')[3], 'Em dia: *67%* das contribuições (2 de 3)');
  const ctrl = controleCaixinha(dados, 0, new Date(2026, 9, 18));
  confere('o controle: as contribuições entram no caixa', [ctrl.entradas.mensalidades, ctrl.saldoAtual], [160, 560]);
  confere('o texto de controle fala em contribuições', textoControleCaixinha(ctrl, 'regional').split('\n')[6], '• Contribuições das divisões: R$ 160,00 (2 contribuições)');
}

log('');
log('=== data de ingresso e tempo de clube ===');
{
  const { tempoDeClube, textoIngresso, semDataDeIngresso } = await import(url('dominio/movimentos.js'));
  const hoje = new Date(2026, 9, 19); // 19/10/2026
  confere('o tempo de clube, em meses inteiros', [
    tempoDeClube('2023-08-19', hoje), tempoDeClube('2023-08-20', hoje), tempoDeClube('2025-10-19', hoje),
    tempoDeClube('2026-02-01', hoje), tempoDeClube('2026-09-19', hoje), tempoDeClube('2026-10-01', hoje), tempoDeClube('', hoje)],
    ['3 anos e 2 meses', '3 anos e 1 mês', '1 ano', '8 meses', '1 mês', 'menos de 1 mês', '']);
  confere('a linha da carteirinha', [textoIngresso('2019-03-12', hoje), textoIngresso('', hoje)],
    ['No clube desde 12/03/2019 · 7 anos e 7 meses', 'Data de ingresso não informada']);
  confere('quem ainda não tem data, na ordem hierárquica',
    semDataDeIngresso([{ id: 'a', nome: 'Bravo', grau: 'X', entrada: '' }, { id: 'b', nome: 'Costa', grau: 'VI', entrada: '' },
      { id: 'c', nome: 'Raposo', grau: 'VI', entrada: '2020-01-01' }]).map(m => m.nome), ['Costa', 'Bravo']);
  const { montarRelatorioIndividual, textoRelatorioIndividual } = await import(url('dominio/relatorio-individual.js'));
  const r = montarRelatorioIndividual({ membro: { id: 'm1', nome: 'Costa', grau: 'VI', divisao: 'Barra - RJ4', entrada: '2019-03-12' }, eventos: [], insight: { elegivel: false, rodadas: [] } }, '', '');
  confere('o texto do relatório individual leva o ingresso', textoRelatorioIndividual(r, '', '').split('\n')[3].startsWith('🪪 No clube desde 12/03/2019 · '), true);
}

log('');
log('=== calendário do mês em texto pro WhatsApp ===');
{
  const { textoCalendario } = await import(url('dominio/calendario-texto.js'));
  const e = (categoria, tipo, data, nome, horario) => ({ id: categoria + data + tipo, categoria, tipo, data, nome, horario: horario || '' });
  const eventos = [
    e('barra', 'Pub', '2026-10-07', 'Pub da Barra'),
    e('regional', 'Bate e Volta', '2026-10-11', 'Bate e Volta - Serra'),
    e('regional', 'Reunião', '2026-10-20', 'Reunião Diretor Regional & Diretores', '20:00'),
    e('gardenia', 'Pub', '2026-10-20', 'Pub Gardênia', '19:00'),
    // Fora do mes: nao entra.
    e('barra', 'Reunião', '2026-11-03', 'Reunião'),
  ];
  const so = textoCalendario({ ano: 2026, mes: 9, escopo: 'regional', eventos, diasVazios: false }).split('\n');
  confere('só os dias com evento, na ordem', so, [
    '📝 *CALENDÁRIO · OUTUBRO/2026*', '*_Acompanhe aqui tudo que acontece na sua Regional_*', '*REGIONAL RJ4*',
    '', '📍 *Dia 07 · Qua*', '🍻 Div. Barra: Pub',
    '', '📍 *Dia 11 · Dom*', '🏍️ *BATE E VOLTA - SERRA*',
    '', '📍 *Dia 20 · Ter*', '• 🍻 Div. Gardênia: Pub', '• 📊 *REUNIÃO DIRETOR REGIONAL & DIRETORES*',
  ]);
  const todos = textoCalendario({ ano: 2026, mes: 9, escopo: 'barra', eventos, diasVazios: true }).split('\n');
  confere('relatar dias vazios: do dia 1 ao 31', [todos.filter(l => l.startsWith('📍')).length, todos[1], todos[2], todos.slice(3, 6)],
    [31, '*_Acompanhe aqui tudo que acontece na sua Divisão_*', '*BARRA - RJ4*', ['', '📍 *Dia 01 · Qui*', '']]);
  confere('mês sem evento avisa', textoCalendario({ ano: 2026, mes: 11, escopo: 'barra', eventos, diasVazios: false }).split('\n').slice(-1),
    ['Nenhum evento marcado.']);
}

log('');
log('=== obrigatoriedades do mês: os 4 eventos de cada divisão ===');
{
  const { obrigatoriedadesDoMes, textoFaltam, textoDiasRestantes, textoEventoMarcado, textoCobrancaObrigatoriedades } = await import(url('dominio/obrigatoriedades.js'));
  const e = (categoria, tipo, data, nome) => ({ id: categoria + tipo + data, categoria, tipo, data, nome: nome || tipo, status: 'ativo' });
  const eventos = [
    e('barra', 'Reunião', '2026-10-05'), e('barra', 'Pub', '2026-10-12'), e('barra', 'Bate e Volta', '2026-10-19'),
    // Marcado pra depois de hoje: ja conta.
    e('barra', 'Ação Social', '2026-10-26'),
    e('oeste', 'Pub', '2026-10-03'),
    // O Regional fez Bate e Volta no mes: vale pra todas.
    e('regional', 'Bate e Volta', '2026-10-19', 'Bonde da Serra'),
    // Fora do mes, e sem data: nao contam.
    e('recreio', 'Reunião', '2026-09-28'), e('recreio', 'Pub', ''),
  ];
  const r = obrigatoriedadesDoMes(eventos, new Date(2026, 9, 22));
  confere('as 6 divisões, na ordem oficial', r.divisoes.map(d => d.escopo.chave), ['oeste', 'recreio', 'barra', 'curicica', 'taquara', 'gardenia']);
  confere('quem deve, e o quê', r.devendo.map(d => [d.escopo.chave, d.faltam]), [
    ['oeste', ['Reunião', 'Ação Social']], ['recreio', ['Reunião', 'Pub', 'Ação Social']],
    ['curicica', ['Reunião', 'Pub', 'Ação Social']], ['taquara', ['Reunião', 'Pub', 'Ação Social']], ['gardenia', ['Reunião', 'Pub', 'Ação Social']]]);
  const oeste = r.divisoes[0].tipos.find(t => t.tipo === 'Bate e Volta');
  const barra = r.divisoes[2].tipos.find(t => t.tipo === 'Bate e Volta');
  confere('o Bate e Volta do Regional cobre a divisão; o da própria divisão vem primeiro',
    [oeste.peloRegional, textoEventoMarcado(oeste), barra.peloRegional], [true, 'pelo Regional: Bonde da Serra · 19/10', false]);
  confere('o mês, os dias que faltam e a urgência (últimos 10 dias)',
    [r.mes, r.nomeMes, r.diasRestantes, r.urgente, obrigatoriedadesDoMes(eventos, new Date(2026, 9, 21)).urgente], ['2026-10', 'Outubro', 9, true, false]);
  confere('os textos', [textoFaltam(['Ação Social', 'Pub']), textoDiasRestantes(9), textoDiasRestantes(1), textoDiasRestantes(0)],
    ['falta 🤝 Ação Social · 🍻 Pub', 'faltam 9 dias', 'falta 1 dia', 'último dia do mês']);
  const texto = textoCobrancaObrigatoriedades(r).split('\n');
  confere('a cobrança pro grupo', [texto[0], texto.slice(3, 7), texto[texto.length - 1]], [
    '⚠️ *OBRIGATORIEDADES DE OUTUBRO* ⚠️', ['', '*OESTE - RJ4*', '❌ 📊 Reunião', '❌ 🤝 Ação Social'], '⏳ Faltam 9 dias para fechar Outubro.']);
  const tudoOk = obrigatoriedadesDoMes(['oeste', 'recreio', 'barra', 'curicica', 'taquara', 'gardenia', 'regional'].flatMap(c =>
    ['Reunião', 'Pub', 'Bate e Volta', 'Ação Social'].map(t => e(c, t, '2026-10-10'))), new Date(2026, 9, 31));
  confere('tudo em dia, no último dia', [tudoOk.devendo.length, textoCobrancaObrigatoriedades(tudoOk).split('\n')[2]],
    [0, '✅ Todas as divisões marcaram os 4 eventos do mês.']);
  const pub = { ...e('regional', 'Pub', '2026-11-10'), chamada: { dispensaObrigatoriedade: false } };
  const pendencias = lista => obrigatoriedadesDoMes(lista, new Date(2026, 10, 2));
  confere('regional desmarcado nao dispensa nenhuma divisao', pendencias([pub]).divisoes.every(d => d.faltam.includes('Pub')), true);
  confere('regional marcado dispensa todas no mes', pendencias([{ ...pub, chamada: { dispensaObrigatoriedade: true } }]).divisoes.every(d => !d.faltam.includes('Pub')), true);
  confere('evento proprio continua atendendo mesmo com regional desmarcado', pendencias([pub, e('barra', 'Pub', '2026-11-15')]).divisoes.find(d => d.escopo.chave === 'barra').faltam.includes('Pub'), false);
  confere('regional desmarcado nao esconde outro marcado do mesmo tipo', pendencias([pub, { ...pub, id: 'outro', data: '2026-11-20', chamada: { dispensaObrigatoriedade: true } }]).divisoes.every(d => !d.faltam.includes('Pub')), true);
  confere('dispensa nao passa para outro mes', pendencias([{ ...pub, data: '2026-10-20', chamada: { dispensaObrigatoriedade: true } }]).divisoes.every(d => d.faltam.includes('Pub')), true);
  confere('editar chamada preserva escolha desmarcada', chamadaParaGuardar(camposDoEvento(pub)).dispensaObrigatoriedade, false);
}

log('');
log('=== entrada/saída: o relatório de cada divisão e o quadro do Regional ===');
{
  const { resumoMovimentos, quadroRegional, textoMovimentos, textoQuadroRegional, soAtivos, movimentosDoPeriodo } = await import(url('dominio/movimentos.js'));
  const roster = [
    { id: 'a1', nome: 'Costa', grau: 'VI', cargo: 'Diretor', divisao: 'Barra - RJ4', situacao: 'afastado', situacaoDesde: '2026-08-01' },
    { id: 'a2', nome: 'Bravo', grau: 'X', divisao: 'Barra - RJ4', situacao: '' },
    { id: 'a3', nome: 'Tigre', grau: 'X', divisao: 'Oeste - RJ4', situacao: 'afastado', situacaoDesde: '2026-10-01' },
  ];
  const mv = (data, divisao, nome, tipo, motivo) => ({ id: nome + tipo, data, divisao, membroId: nome, nome, grau: 'X', tipo, motivo: motivo || '' });
  const movimentos = [
    mv(emDias(-5), 'barra', 'Novo', 'entrada'),
    mv(emDias(-10), 'barra', 'Saiu', 'desligamento', 'Mudou de cidade'),
    mv('2000-01-01', 'barra', 'Antigo', 'entrada'),
    mv(emDias(-3), 'oeste', 'Outro', 'entrada'),
  ];
  confere('afastado fica fora das listas novas', nomes(soAtivos(roster)), ['Bravo']);
  const r = resumoMovimentos(movimentos, roster, 'barra', 6);
  confere('no período: só os da divisão e da janela', [nomes(r.entradas), nomes(r.desligamentos)], [['Novo'], ['Saiu']]);
  // Afastado e estado, nao acontecimento: Costa se afastou antes da janela
  // e ainda conta.
  confere('afastados agora contam fora da janela', nomes(r.afastadosAgora), ['Costa']);
  confere('linha do tempo do mais recente pro mais antigo', nomes(r.linhaDoTempo), ['Novo', 'Saiu']);
  confere('desde sempre pega tudo', resumoMovimentos(movimentos, roster, 'barra', 0).entradas.length, 2);
  confere('evento sem data só entra em desde sempre', movimentosDoPeriodo([mv('', 'barra', 'X', 'entrada')], 3).length, 0);
  // O periodo do Entrada/Saida: "1 mes", "Tudo" e o "Por periodo" (datas).
  const { rotuloPeriodoMovimentos, PERIODOS_MOVIMENTOS } = await import(url('dominio/movimentos.js'));
  confere('os botões: 1 mês e Tudo', PERIODOS_MOVIMENTOS, [1, 0]);
  confere('1 mês: os últimos 30 dias, do mais recente', nomes(movimentosDoPeriodo(movimentos, 1)), ['Outro', 'Novo', 'Saiu']);
  const fixos = [mv('2026-08-01', 'barra', 'A', 'entrada'), mv('2026-08-31', 'barra', 'B', 'entrada'), mv('2026-09-01', 'barra', 'C', 'entrada'), mv('', 'barra', 'D', 'entrada')];
  confere('por período: os dois dias entram, e sem data fica de fora',
    nomes(movimentosDoPeriodo(fixos, { de: '2026-08-01', ate: '2026-08-31' })), ['B', 'A']);
  confere('por período: só "De" ou só "Até"',
    [nomes(movimentosDoPeriodo(fixos, { de: '2026-08-31', ate: '' })), nomes(movimentosDoPeriodo(fixos, { de: '', ate: '2026-08-01' }))],
    [['C', 'B'], ['A']]);
  confere('o rótulo do período', [rotuloPeriodoMovimentos(1), rotuloPeriodoMovimentos(0), rotuloPeriodoMovimentos({ de: '2026-08-01', ate: '2026-10-19' }),
    rotuloPeriodoMovimentos({ de: '2026-08-01', ate: '' }), rotuloPeriodoMovimentos({ de: '', ate: '2026-10-19' })],
    ['Último mês', 'Desde sempre', 'De 01/08/2026 a 19/10/2026', 'Desde 01/08/2026', 'Até 19/10/2026']);
  confere('o texto pro WhatsApp leva o período escolhido',
    textoMovimentos(resumoMovimentos(fixos, roster, 'barra', { de: '2026-08-01', ate: '2026-08-31' }), { de: '2026-08-01', ate: '2026-08-31' }).split('\n')[1].endsWith('· De 01/08/2026 a 31/08/2026'), true);

  const texto = textoMovimentos(r, 6);
  confere('o texto leva nome e data', /🟢 Novo \(X\) — /.test(texto) && /⏸️ Costa \(VI\) — desde 01\/08\/2026/.test(texto), true);
  confere('o texto NÃO leva o motivo', texto.includes('Mudou de cidade'), false);

  const q = quadroRegional(movimentos, roster, 6);
  confere('o quadro vem na ordem oficial', q.linhas.map(l => l.e.chave), ['regional', 'oeste', 'recreio', 'barra', 'curicica', 'taquara', 'gardenia']);
  const linha = c => { const l = q.linhas.find(x => x.e.chave === c); return [l.entradas, l.afastados, l.desligamentos]; };
  confere('números da Barra e do Oeste', [linha('barra'), linha('oeste')], [[1, 1, 1], [1, 1, 0]]);
  confere('total da RJ4', q.total, { entradas: 2, afastados: 2, desligamentos: 1, sairamDaRJ4: 0 });
  confere('texto do quadro com o total', textoQuadroRegional(q, 6).split('\n').slice(-1),
    ['*TOTAL RJ4*: 🟢 2 entraram · ⏸️ 2 afastados · 🚪 1 desligados · 🔁 0 para outra regional']);

  // Transferencias: Lobo foi da Barra pro Oeste (duas linhas no livro) e
  // Puma foi da Barra pra outra regional (so a saida).
  const { rotuloMovimento, saiuDaRJ4 } = await import(url('dominio/movimentos.js'));
  const tr = (nome, divisao, tipo, dePara) => ({ ...mv(emDias(-2), divisao, nome, tipo, 'pessoal'), dePara });
  const comTransf = movimentos.concat([
    tr('Lobo', 'barra', 'transferenciaSaida', 'Oeste - RJ4'),
    tr('Lobo', 'oeste', 'transferenciaEntrada', 'Barra - RJ4'),
    tr('Puma', 'barra', 'transferenciaSaida', 'RJ2 · Centro'),
  ]);
  const rb = resumoMovimentos(comTransf, roster, 'barra', 6), ro = resumoMovimentos(comTransf, roster, 'oeste', 6);
  confere('transferência: a Barra vê quem saiu, o Oeste quem chegou',
    [nomes(rb.sairam), nomes(rb.chegaram), nomes(ro.chegaram), nomes(ro.sairam)], [['Lobo', 'Puma'], [], ['Lobo'], []]);
  confere('o rótulo diz pra onde foi e de onde veio', [rotuloMovimento(rb.sairam[0]), rotuloMovimento(ro.chegaram[0])],
    ['Transferido para Oeste - RJ4', 'Veio de Barra - RJ4']);
  confere('só sai da RJ4 quem foi pra outra regional', comTransf.filter(saiuDaRJ4).map(m => m.nome), ['Puma']);
  const qt = quadroRegional(comTransf, roster, 6);
  const tLinha = c => { const l = qt.linhas.find(x => x.e.chave === c); return [l.chegaram, l.sairam]; };
  confere('o quadro: Barra -2, Oeste +1', [tLinha('barra'), tLinha('oeste')], [[0, 2], [1, 0]]);
  confere('no total da RJ4, a transferência interna se anula', qt.total.sairamDaRJ4, 1);
  const textoT = textoMovimentos(rb, 6);
  confere('o texto leva as transferências, sem o motivo', [
    textoT.includes('🔁 Transferências: *0* chegaram · *2* saíram'),
    textoT.includes('🔁 Lobo (X) — para Oeste - RJ4 — '), textoT.includes('🔁 Puma (X) — para RJ2 · Centro — '),
    textoT.includes('pessoal')], [true, true, true, false]);
  confere('o texto do quadro leva +chegaram −saíram', textoQuadroRegional(qt, 6).split('\n').find(l => l.startsWith('*Barra')),
    '*Barra - RJ4*: 🟢 1 · ⏸️ 1 · 🚪 1 · 🔁 +0 −2');
}

log('');
{
  log('=== calendario: datas compartilhadas e divisao ===');
  const { marcacoesVisiveisCalendario, construirGradeCalendario } = await import(url('dominio/estatisticas.js'));
  const anteriores = st.events;
  st.events = [
    { id: 'a', data: '2026-08-01', categoria: 'barra', tipo: 'Pub' },
    { id: 'b', data: '2026-08-01', categoria: 'regional', tipo: 'Reunião', status: 'encerrado' },
    { id: 'c', data: '2026-08-01', categoria: 'oeste', tipo: 'Pub' },
    { id: 'sem-data', data: '', categoria: 'barra', tipo: 'Pub' },
    { id: 'sem-tipo', data: '2026-08-02', categoria: 'barra', tipo: '' },
  ];
  const barra = marcacoesVisiveisCalendario('barra');
  confere('divisao preserva os dois eventos, inclusive encerrado, sem trazer outra divisao', barra['2026-08-01'].eventos.map(e => e.id), ['a', 'b']);
  confere('regional preserva todos os eventos na mesma data', marcacoesVisiveisCalendario('regional')['2026-08-01'].eventos.map(e => e.id), ['a', 'b', 'c']);
  confere('sem data ou sem tipo fica fora da grade', Object.keys(barra), ['2026-08-01']);
  confere('meses de quatro, cinco e seis semanas', [construirGradeCalendario(2021, 1).length, construirGradeCalendario(2026, 9).length, construirGradeCalendario(2026, 7).length], [28, 35, 42]);
  st.events = anteriores;
}
{
  log('=== funções especiais: só quem tem a função, e números à parte ===');
  const { integrantesDaFuncao, contagemEvento, estatisticasFuncao, textoEventoFuncao, textoEstatisticasFuncao, textoIndividuaisFuncao, divisaoCurta } =
    await import(url('dominio/funcoes-especiais.js'));
  const roster = [
    { id: 'b1', nome: 'Costa', grau: 'X', divisao: 'Barra - RJ4', funcoes: ['batedor'] },
    { id: 'b2', nome: 'Bull', grau: 'VII', divisao: 'Barra - RJ4', funcoes: ['batedor', 'caveira'] },
    { id: 'b3', nome: 'Lobo', grau: 'IX', divisao: 'Oeste - RJ4', funcoes: ['batedor'] },
    { id: 'b4', nome: 'Urso', grau: 'VIII', divisao: 'Recreio - RJ4', funcoes: ['batedor'], situacao: 'afastado' },
    { id: 'c1', nome: 'Tigre', grau: 'VIII', divisao: 'Recreio - RJ4', funcoes: ['caveira'] },
    { id: 'x1', nome: 'Zeca', grau: 'X', divisao: 'Barra - RJ4', funcoes: ['sargento_armas'] },
    { id: 's1', nome: 'Gato', grau: 'IX', divisao: 'Recreio - RJ4', funcoes: ['caveira_suplente'] },
  ];
  confere('evento de Batedor: só Batedores, sem afastado, divisão na ordem oficial e hierarquia dentro',
    nomes(integrantesDaFuncao(roster, 'batedor')), ['Lobo', 'Bull', 'Costa']);
  confere('evento de Caveira: Caveiras e Caveiras Suplentes', nomes(integrantesDaFuncao(roster, 'caveira')), ['Tigre', 'Gato', 'Bull']);
  confere('nome curto da divisão', ['Barra - RJ4', 'Regional RJ4', ''].map(divisaoCurta), ['Barra', 'Regional', 'Sem divisão']);

  const p = (membroId, nome, divisao, status) => ({ membroId, nome, grau: 'X', divisao, status });
  const evs = [
    { id: 'e1', nome: 'Escolta Serra', data: '2026-09-20', horario: '07:00', endereco: 'Posto BR', status: 'encerrado',
      presencas: [p('b1', 'Costa', 'Barra - RJ4', 'confirmado'), p('b3', 'Lobo', 'Oeste - RJ4', 'aguardando'), p('b2', 'Bull', 'Barra - RJ4', 'familia')] },
    { id: 'e2', nome: 'Treino', data: '2026-10-10', horario: '', endereco: '', status: 'encerrado',
      presencas: [p('b1', 'Costa', 'Barra - RJ4', 'confirmado'), p('b3', 'Lobo', 'Oeste - RJ4', 'confirmado')] },
    { id: 'e3', nome: 'Escolta Pub', data: '2026-10-20', horario: '', endereco: '', status: 'ativo',
      presencas: [p('b1', 'Costa', 'Barra - RJ4', 'aguardando')] },
  ];
  confere('encerrado: quem ficou sem marcação conta como não justificada',
    contagemEvento(evs[0]), { confirmado: 1, familia: 1, trabalho: 0, justificada: 0, infracional: 1, aguardando: 0, total: 3, justificadas: 1, pct: 33 });
  confere('aberto: sem marcação continua sem marcação', contagemEvento(evs[2]).aguardando, 1);
  confere('a marcação ainda não salva entra na conta da tela', contagemEvento(evs[2], { b1: 'confirmado' }).pct, 100);

  const r = estatisticasFuncao(evs, 0);
  confere('estatísticas só contam os encerrados', [r.eventos, r.geral], [2, { convites: 5, confirmados: 3, justificadas: 1, naoJustificadas: 1, pct: 60 }]);
  confere('por evento: só os encerrados, do mais recente pro mais antigo, cada um com o seu %',
    r.porEvento.map(({ ev, c }) => [ev.nome, c.pct, c.total]), [['Treino', 100, 2], ['Escolta Serra', 33, 3]]);
  confere('por integrante, do maior % pro menor', r.porIntegrante.map(x => [x.nome, x.pct, x.naoJustificadas]), [['Costa', 100, 0], ['Lobo', 50, 1], ['Bull', 0, 0]]);
  confere('mês a mês', r.porMes.map(m => [m.mes, m.pct]), [['2026-09', 33], ['2026-10', 100]]);
  confere('por período: só outubro', estatisticasFuncao(evs, { de: '2026-10-01', ate: '' }).eventos, 1);

  const texto = textoEventoFuncao(evs[0], 'batedor').split('\n');
  confere('texto do evento: título da função e o %', [texto[0], texto[1], texto[5]],
    ['🛡️ *BATEDORES — RELATÓRIO DE PRESENÇA*', 'Escolta Serra', '📊 33% DE PRESENÇA (1 de 3)']);
  confere('texto do evento: nomes com a divisão e o motivo', texto.filter(l => l.startsWith('- ')),
    ['- Costa (Barra)', '- Bull (Barra) - Família', '- Lobo (Oeste)']);
  confere('evento aberto sai como parcial, sem falta', textoEventoFuncao(evs[2], 'batedor').includes('RELATÓRIO PARCIAL') &&
    textoEventoFuncao(evs[2], 'batedor').includes('⚠️ SEM MARCAÇÃO AINDA (1)'), true);
  const textoStats = textoEstatisticasFuncao(r, 'caveira', 0).split('\n');
  confere('texto das estatísticas: cabeçalho e cada evento, sem os integrantes',
    [textoStats[0], textoStats.slice(-3), textoStats.some(l => l.includes('Lobo'))],
    ['💀 *CAVEIRAS — ESTATÍSTICAS*', ['*POR EVENTO*', '- 10/10 · Treino: 100% (2 de 2)', '- 20/09 · Escolta Serra: 33% (1 de 3)'], false]);
  const textoInd = textoIndividuaisFuncao(r, 'caveira', 0).split('\n');
  confere('texto das individuais: cada integrante e quem tem falta não justificada',
    [textoInd[0], textoInd.includes('1. Costa (Barra) — 100% (2 de 2)'), textoInd.slice(-2)],
    ['💀 *CAVEIRAS — ESTATÍSTICAS INDIVIDUAIS*', true, ['⭕ *FALTAS NÃO JUSTIFICADAS*', '- Lobo (Oeste): 1']]);
}
{
  log('=== as três saídas: os textos novos (WhatsApp e PDF) ===');
  const { textoResumoRelatorios, textoRelatorioInsight, textoRankPresenca } = await import(url('dominio/relatorio-texto.js'));
  const { textoSaldoEstoque } = await import(url('dominio/estoque.js'));
  const r = (pct, c, t, n) => ({ pct, somaConfirmados: c, somaConvidados: t, eventosNoPeriodo: n, statusPeriodo: { confirmado: c, justificada: 2, infracional: t - c - 2, aguardando: 0 } });
  const resumo = textoResumoRelatorios({ escopo: 'Regional RJ4', filtro: 'Todas as divisões', datas: '', total: { meses: 3, r: r(60, 30, 50, 6) },
    tipos: [{ tipo: 'Pub', emoji: '🍻', meses: 6, r: r(70, 7, 10, 2) }], faltas: [{ nome: 'Costa', divisao: 'Barra', total: 3 }], mesesLista: 3,
    membros: [{ nome: 'Costa', divisao: 'Barra - RJ4', percentual: 50, confirmacoes: 2, convites: 4 }, { nome: 'Zé', divisao: 'Barra - RJ4', percentual: null, confirmacoes: 0, convites: 0 }] }).split('\n');
  confere('resumo dos relatórios: total, cada tipo no próprio período e quem faltou',
    [resumo[4], resumo[8], resumo[11]], ['📊 60% (30 de 50) · 6 eventos', '🍻 Pub (últimos 6 meses): 70% (7 de 10) · 2 eventos', '- Costa (Barra): 3']);
  confere('resumo: quem não teve evento fica fora do % de cada integrante', resumo.includes('- Zé: null% (0 de 0)') || resumo.some(l => l.startsWith('- Zé')), false);
  const insight = textoRelatorioInsight({ rodadas: 4, divisoes: [{ chave: 'barra', percentual: 75 }],
    membros: [{ nome: 'Costa', divisao: 'Barra - RJ4', rodadas: 4, confirmacoes: 3, percentual: 75 }] }, 'Desde sempre').split('\n');
  confere('insight completo: média e o integrante', [insight[3], insight[insight.length - 1]], ['📊 *Média: 75%* (3 de 4)', '- Costa: 75% (3 de 4)']);
  const rank = textoRankPresenca({ divisoes: [{ chave: 'barra', percentual: 80, convites: 10, confirmacoes: 8 }, { chave: 'regional', percentual: 50, convites: 4, confirmacoes: 2 }], membros: [] }, '6meses').split('\n');
  confere('rank de presença: o total da RJ4 e as divisões do maior % pro menor', [rank[1], rank[3], rank[6], rank[7]],
    ['Últimos 6 meses', '🏁 *Total Regional RJ4: 71%*', '1. Barra - RJ4: 80%', '2. Regional RJ4: 50%']);
  confere('saldo do estoque, cada item na sua medida', textoSaldoEstoque([{ item: 'Sapatos', quantidade: 2, medida: 'par' }], 'barra').split('\n').pop(), '• *Sapatos*: 2 pares');
}
log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S) — veja acima`);
fs.writeFileSync(SAIDA, linhas.join('\n'), 'utf8');
process.exit(falhas === 0 ? 0 : 1);
