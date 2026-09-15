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
