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
  confere('texto: abre com o nome, o grau, o cargo e o período', linhasTexto.slice(0, 4),
    ['📄 RELATÓRIO INDIVIDUAL', 'Costa (VI)', 'Diretor · Barra - RJ4', '🗓️ Desde sempre']);
  confere('texto: o geral da divisão bate com a tela', linhasTexto.includes('📊 33% (1 de 3 eventos)'), true);
  confere('texto: só os tipos em que foi convocado',
    linhasTexto.filter(l => / \d+% \(\d+ de \d+\)$/.test(l)), ['🍻 Pub: 50% (1 de 2)', '📊 Reunião: 0% (0 de 1)', '🍻 Pub: 100% (1 de 1)']);
  confere('texto: Bate e Volta não aparece', texto.includes('Bate e Volta'), false);
  confere('texto: o Regional à parte', linhasTexto.includes('🏛️ EVENTOS DO REGIONAL'), true);
  confere('texto: o Insight', linhasTexto.includes('📊 67% (fez 2 de 3 rodadas)'), true);
  confere('texto: termina com as faltas não justificadas', linhasTexto.slice(-2),
    ['⭕ FALTAS NÃO JUSTIFICADAS (1)', '- 01/08/2026 · Evento b']);
  confere('texto: sem falta, diz que não tem', textoRelatorioIndividual(doRegional, '', '').split('\n').slice(-1), ['- Nenhuma']);
  confere('texto: o período escolhido vai no topo', textoRelatorioIndividual(agosto, '2026-08-01', '2026-08-31').split('\n')[3],
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
confere('o tipo no topo, o bonde logo abaixo', linhasReg.slice(0, 2), ['🏥 AÇÃO SOCIAL 🏥', '⚙️ BONDE REGIONAL - RJ4 ⚙️']);
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
log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S) — veja acima`);
fs.writeFileSync(SAIDA, linhas.join('\n'), 'utf8');
process.exit(falhas === 0 ? 0 : 1);
