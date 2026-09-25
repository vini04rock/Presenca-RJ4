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
const { montarConvocacao, camposIniciais, dataDaConvocacao, blocoInformacoes } = await import(url('dominio/convocacao.js'));
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
log('=== convocação: data no formato do clube ===');
// Conferido contra duas convocações reais.
confere('09/09/2026 é quarta', dataDaConvocacao('2026-09-09'), 'Quarta: 09SET26');
confere('06/09/2026 é domingo', dataDaConvocacao('2026-09-06'), 'Domingo: 06SET26');
confere('data vazia não quebra', dataDaConvocacao(''), '');
confere('data inválida não quebra', dataDaConvocacao('não é data'), '');

log('');
log('=== convocação: quem assina o rodapé ===');
// Decisão do clube: na divisão assina o Subdiretor; no Regional, o
// Operacional. Não é o cargo mais alto.
const diretoriaBarra = [
  { nome:'Costa',  grau:'VI', divisao:'Barra - RJ4', cargo:'Diretor' },
  { nome:'Tedboy', grau:'VI', divisao:'Barra - RJ4', cargo:'Subdiretor' },
  { nome:'Bull',   grau:'V',  divisao:'Regional RJ4', cargo:'Operacional' },
  { nome:'Chefe',  grau:'V',  divisao:'Regional RJ4', cargo:'Diretor Regional' },
];
confere('divisão: assina o Subdiretor, não o Diretor',
  blocoInformacoes('barra', diretoriaBarra).split('\n')[2], 'TEDBOY (VI)');
confere('divisão: o cargo sai em caixa alta',
  blocoInformacoes('barra', diretoriaBarra).split('\n')[3], 'SUBDIRETOR');
confere('regional: assina o Operacional, em itálico',
  blocoInformacoes('regional', diretoriaBarra).split('\n')[1], '_Bull - Operacional RJ4_');
confere('sem ninguém no cargo, sai espaço pra preencher (e não o nome errado)',
  blocoInformacoes('barra', []).split('\n').slice(2, 4), ['(nome)', '(cargo)']);

log('');
log('=== convocação: o parser do app relê o que ele mesmo gerou ===');
// Esta é a prova de que o formato continua fiel: gera a convocação e passa
// pelo mesmo parser que lê as convocações coladas do grupo. Se alguém mexer
// no molde e quebrar o formato, esta conferência acusa.
const rosterTeste = [
  { id:'1', nome:'Costa',     grau:'VI',   divisao:'Barra - RJ4', cargo:'Diretor' },
  { id:'2', nome:'Tedboy',    grau:'VI',   divisao:'Barra - RJ4', cargo:'Subdiretor' },
  { id:'3', nome:'Bravo',     grau:'VI',   divisao:'Barra - RJ4', cargo:'Sgt de Armas de Divisão' },
  { id:'4', nome:'Fabio Big', grau:'VIII', divisao:'Barra - RJ4' },
  { id:'5', nome:'Mórbius',   grau:'IX',   divisao:'Barra - RJ4' },
  { id:'6', nome:'China',     grau:'X',    divisao:'Barra - RJ4' },
];
const evTeste = {
  id:'e1', nome:'Pub Mensal', tipo:'Pub', categoria:'barra',
  data:'2026-09-09', horario:'19:30',
  endereco:"Lucky Murphy's Irish Pub, Barra da Tijuca",
  outros:'https://maps.app.goo.gl/exemplo\nDestacamento: 18:30 · Briefing: 19:15',
};
const textoTeste = montarConvocacao(evTeste, rosterTeste, camposIniciais(evTeste, rosterTeste));
const lido = parseConvocacaoTexto(textoTeste);
confere('a data volta igual', lido.evento.data, evTeste.data);
confere('o tipo volta igual', lido.evento.tipo, 'Pub');
confere('o horário de início volta igual', lido.evento.horario, '19:30');
confere('todos os integrantes voltam', lido.membrosParsed.length, rosterTeste.length);
confere('na ordem hierárquica', lido.membrosParsed.map(m => m.nomeTexto),
  ordenarPorHierarquia(rosterTeste).map(m => m.nome.toUpperCase()));
confere('com o grau de cada um', lido.membrosParsed.map(m => m.grauTexto),
  ordenarPorHierarquia(rosterTeste).map(m => m.grau));
confere('sem nenhum aviso do parser', lido.avisos, []);

log('');
log('=== convocação: o modelo Bate e Volta também volta inteiro ===');
// Bate e Volta fecha a lista com "Legenda", nao com "Participação". O
// parser so parava no segundo - entao a varredura seguia ate o fim e lia o
// contato do rodape ("NOME (GRAU)") como mais um integrante.
const evBV = Object.assign({}, evTeste, { tipo:'Bate e Volta', nome:'Bate e Volta Serra' });
const camposBV = camposIniciais(evBV, rosterTeste, 'bate-volta');
camposBV.roteiro = 'Destino: Serra';
const textoBV = montarConvocacao(evBV, rosterTeste, camposBV, 'bate-volta');
const lidoBV = parseConvocacaoTexto(textoBV);
confere('nao inventa integrante a mais (o do rodape)', lidoBV.membrosParsed.length, rosterTeste.length);
confere('a lista para antes da legenda',
  lidoBV.membrosParsed.map(m => m.nomeTexto),
  ordenarPorHierarquia(rosterTeste).map(m => m.nome.toUpperCase()));
confere('o tipo volta igual', lidoBV.evento.tipo, 'Bate e Volta');
confere('tem o bloco de ATENÇÃO', textoBV.includes('⚠️ ATENÇÃO ⚠️'), true);
confere('tem o bloco de BRIEFING', textoBV.includes('⚫ BRIEFING ⚫'), true);
confere('usa Legenda, e não Participação',
  [textoBV.includes('Legenda'), textoBV.includes('Participação')], [true, false]);

log('');
log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S) — veja acima`);
fs.writeFileSync(SAIDA, linhas.join('\n'), 'utf8');
process.exit(falhas === 0 ? 0 : 1);
