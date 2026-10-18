// Confere as regras que moram no apps-script/Code.gs — o único pedaço do
// projeto que roda fora do navegador, e o único que mexe na planilha sem
// ninguém olhando.
//
//     node ferramentas/planilha.mjs
//
// Ele não fala com o Google: monta uma planilha de mentira em memória,
// carrega o Code.gs de verdade por cima dela e confere o que ficou gravado.
// Vale porque `py ferramentas/estrutura.py` e os outros dois só enxergam o
// que está em js/ — o Code.gs sempre foi ponto cego, e é justamente ele que
// roda de madrugada, sozinho, na planilha de produção.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CODE_GS = path.join(AQUI, '..', 'apps-script', 'Code.gs');
const SAIDA = process.argv[2] || path.join(AQUI, 'ultimo-planilha.txt');
const linhas = [];
const log = (s) => { linhas.push(s); try { console.log(s); } catch (e) {} };

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

// ---------- a planilha de mentira ----------------------------------------
// Só o que o Code.gs usa de verdade. Cada aba é um array de linhas, com o
// cabeçalho na posição 0 — igual à planilha real, onde os dados começam na
// linha 2. As coordenadas do getRange são 1-indexadas, como no Apps Script.
function novaAba(nome, linhasIniciais) {
  const dados = linhasIniciais.map(l => l.slice());
  const s = {
    nome,
    dados,
    getLastRow: () => dados.length,
    getLastColumn: () => dados.reduce((m, l) => Math.max(m, l.length), 0),
    setFrozenRows() { return s; },
    appendRow(l) { dados.push(l.slice()); return s; },
    // 1-indexada como no Apps Script, e a linha 1 e o cabecalho. Quem apaga
    // varias percorre de tras pra frente (ver apagarLinhas no Code.gs) -
    // apagar de frente pra tras embaralharia os indices no meio do caminho.
    deleteRow(linha) { dados.splice(linha - 1, 1); return s; },
    getRange(linha, coluna, nLinhas, nColunas) {
      const altura = nLinhas === undefined ? 1 : nLinhas;
      const largura = nColunas === undefined ? 1 : nColunas;
      const range = {
        getValues() {
          const saida = [];
          for (let i = 0; i < altura; i++) {
            const l = dados[linha - 1 + i] || [];
            const linhaSaida = [];
            for (let j = 0; j < largura; j++) {
              linhaSaida.push(l[coluna - 1 + j] === undefined ? '' : l[coluna - 1 + j]);
            }
            saida.push(linhaSaida);
          }
          return saida;
        },
        setValues(vals) {
          for (let i = 0; i < altura; i++) {
            if (!dados[linha - 1 + i]) dados[linha - 1 + i] = [];
            for (let j = 0; j < largura; j++) dados[linha - 1 + i][coluna - 1 + j] = vals[i][j];
          }
          return range;
        },
        setValue(v) { return range.setValues([[v]]); },
        setFontWeight() { return range; },
        setNumberFormat() { return range; },
        setBackground() { return range; },
        setFontColor() { return range; },
      };
      return range;
    },
  };
  return s;
}

const CAB_EVENTOS = ['ID', 'Nome', 'Data', 'Horario', 'Endereco', 'Outros', 'Status', 'Criado em', 'Categoria', 'Tipo', 'Texto Original'];
const CAB_PRESENCAS = ['ID Evento', 'Evento', 'ID Membro', 'Membro', 'Status', 'Direto', 'Destacado', 'Acompanhado', 'Atualizado em'];

function montaPlanilha(eventos, presencas) {
  const abas = {
    Eventos: novaAba('Eventos', [CAB_EVENTOS, ...eventos]),
    Presencas: novaAba('Presencas', [CAB_PRESENCAS, ...presencas]),
  };
  return {
    abas,
    getSheetByName: (n) => abas[n] || null,
    insertSheet: (n) => (abas[n] = novaAba(n, [[]])),
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
  };
}

// ---------- o ambiente do Apps Script, só o que o Code.gs toca ------------
function carregaCodeGs(planilhaFalsa, propriedades) {
  const gatilhos = [];
  const logados = [];
  // Cada addItem do onOpen vira um par [rótulo, nome da função] aqui.
  const itensDeMenu = [];
  const dois = (n) => String(n).padStart(2, '0');
  const contexto = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => planilhaFalsa,
      getUi: () => ({
        alert() {},
        createMenu() {
          const menu = {
            addItem(rotulo, fn) { itensDeMenu.push([rotulo, fn]); return menu; },
            addToUi() {},
          };
          return menu;
        },
      }),
    },
    // Só os dois formatos que o Code.gs pede.
    Utilities: {
      formatDate(d, tz, fmt) {
        const p = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
        if (fmt === 'yyyy-MM-dd') return p;
        if (fmt === 'HH:mm') return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
        return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
      },
      getUuid: () => 'id-de-mentira',
    },
    // A trava não tem o que travar aqui: um teste roda sozinho.
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Logger: { log: (s) => logados.push(String(s)) },
    ScriptApp: {
      getProjectTriggers: () => gatilhos.slice(),
      deleteTrigger: (t) => { const i = gatilhos.indexOf(t); if (i > -1) gatilhos.splice(i, 1); },
      newTrigger(fn) {
        const t = {
          getHandlerFunction: () => fn,
          timeBased: () => t, atHour: () => t, everyDays: () => t,
          create: () => { gatilhos.push(t); return t; },
        };
        return t;
      },
    },
    // Os PINs de mentira do teste da guarda de permissao. Sem nada passado,
    // continua devolvendo null como antes - e ai todo PIN e invalido, que e
    // exatamente o cenario "ninguem configurou PIN".
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propriedades && propriedades[k] !== undefined ? propriedades[k] : null),
        setProperty(k, v) { if (propriedades) propriedades[k] = v; },
      }),
    },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
    console,
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(CODE_GS, 'utf8'), contexto, { filename: 'Code.gs' });
  return { contexto, gatilhos, logados, itensDeMenu };
}

// Datas relativas a hoje, pro teste não depender do dia em que roda.
const emISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daquiA = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return emISO(d); };

// ev(id, data, status) -> uma linha da aba Eventos
const ev = (id, data, status) => [id, 'Evento ' + id, data, '19:00', 'Bar X', '',
  status, '01/09/2026 10:00', 'barra', 'Pub', ''];
// pr(evId, membroId, status) -> uma linha da aba Presencas
const pr = (evId, mid, status) => [evId, 'Evento ' + evId, mid, 'Membro ' + mid,
  status, '', '', '', '01/09/2026 10:00'];

// Lê uma coluna da aba depois que o Code.gs mexeu nela.
const coluna = (p, aba, i) => p.abas[aba].dados.slice(1).map(l => l[i]);

log('=== encerramento automático: quem encerra e quem fica ===');
{
  const p = montaPlanilha([
    ev('ontem',   daquiA(-1), 'ativo'),
    ev('hoje',    daquiA(0),  'ativo'),
    ev('amanha',  daquiA(1),  'ativo'),
    ev('semdata', '',         'ativo'),
    ev('velho',   daquiA(-9), 'encerrado'),
    ev('branco',  daquiA(-3), ''),
  ], []);
  const { contexto } = carregaCodeGs(p);
  const r = contexto.encerrarEventosVencidos();

  confere('encerra o evento de ontem', coluna(p, 'Eventos', 6)[0], 'encerrado');
  // O evento de hoje fica aberto o dia inteiro: quem está lá ainda confirma
  // pelo celular. A virada é na madrugada seguinte.
  confere('NÃO encerra o de hoje', coluna(p, 'Eventos', 6)[1], 'ativo');
  confere('NÃO encerra o de amanhã', coluna(p, 'Eventos', 6)[2], 'ativo');
  // A armadilha: '' é anterior a qualquer data na comparação de texto, então
  // sem a guarda o evento sem data seria encerrado na primeira madrugada.
  confere('NÃO encerra o que está sem data', coluna(p, 'Eventos', 6)[3], 'ativo');
  confere('não mexe no que já estava encerrado', coluna(p, 'Eventos', 6)[4], 'encerrado');
  // Linha antiga, de antes da coluna Status existir: conta como aberta.
  confere('encerra o de status em branco', coluna(p, 'Eventos', 6)[5], 'encerrado');
  confere('conta quantos encerrou', r.encerrados, 2);
}

log('');
log('=== a data pode voltar como texto ou como Date ===');
{
  // Depende de quem escreveu a célula: o Sheets às vezes converte o texto
  // "2026-09-17" num Date de verdade. formatarData resolve os dois, e é por
  // isso que o encerramento passa por ele em vez de comparar l[2] direto.
  const d = new Date(); d.setDate(d.getDate() - 1);
  const p = montaPlanilha([ev('comoDate', d, 'ativo')], []);
  const { contexto } = carregaCodeGs(p);
  contexto.encerrarEventosVencidos();
  confere('encerra igual quando a data é um Date', coluna(p, 'Eventos', 6)[0], 'encerrado');
}

log('');
log('=== encerrar converte quem não respondeu ===');
{
  // A regra do clube: não responder à convocação é falta igual à falta sem
  // justificativa. Encerrar sozinho tem que fazer o mesmo que o botão
  // "Encerrar" do app — senão o automático seria mais brando que o manual.
  const p = montaPlanilha(
    [ev('venceu', daquiA(-1), 'ativo'), ev('aberto', daquiA(3), 'ativo')],
    [
      pr('venceu', 'm1', 'Aguardando'),
      pr('venceu', 'm2', 'Confirmado'),
      pr('venceu', 'm3', 'Familia'),
      pr('aberto', 'm1', 'Aguardando'),
    ]);
  const { contexto } = carregaCodeGs(p);
  contexto.encerrarEventosVencidos();
  const status = coluna(p, 'Presencas', 4);
  confere('quem estava Aguardando vira Infracional', status[0], 'Infracional');
  confere('quem confirmou continua Confirmado', status[1], 'Confirmado');
  confere('falta justificada continua como estava', status[2], 'Familia');
  // A conversão é por evento. Varrer demais aqui infracionaria gente de um
  // evento que ainda nem aconteceu.
  confere('não toca em evento que continua aberto', status[3], 'Aguardando');
}

log('');
log('=== rodar de novo não estraga nada ===');
{
  // O gatilho é diário e o encerramento manual está no menu da planilha, então
  // duas passadas no mesmo dia acontecem. A segunda tem que ser inofensiva.
  const p = montaPlanilha([ev('venceu', daquiA(-1), 'ativo')],
    [pr('venceu', 'm1', 'Aguardando'), pr('venceu', 'm2', 'Confirmado')]);
  const { contexto } = carregaCodeGs(p);
  contexto.encerrarEventosVencidos();
  const depoisDaPrimeira = JSON.stringify(p.abas.Presencas.dados);
  const segunda = contexto.encerrarEventosVencidos();
  confere('a segunda passada não encerra nada', segunda.encerrados, 0);
  confere('as presenças ficam iguais', JSON.stringify(p.abas.Presencas.dados), depoisDaPrimeira);
}

log('');
log('=== o gatilho ===');
{
  const p = montaPlanilha([], []);
  const { contexto, gatilhos } = carregaCodeGs(p);
  const primeira = contexto.instalarGatilhoDeEncerramento();
  confere('instala um gatilho', gatilhos.length, 1);
  confere('apontando pro encerramento', gatilhos[0].getHandlerFunction(), 'encerrarEventosVencidos');
  confere('na primeira vez não apaga nada', primeira.gatilhosApagados, 0);
  // Rodar de novo tem que TROCAR, não acumular: dois gatilhos fariam o
  // trabalho em duplicata e bagunçariam o log.
  const segunda = contexto.instalarGatilhoDeEncerramento();
  confere('rodar de novo continua com um só', gatilhos.length, 1);
  confere('e diz que substituiu o anterior', segunda.gatilhosApagados, 1);
}

log('');
log('=== o menu da planilha ===');
{
  // O gatilho e o "encerrar agora" só existem, para quem usa, como item de
  // menu: ligar o encerramento sem abrir o editor do Apps Script depende
  // deles estarem aqui. Escrever a função e esquecer de registrar no onOpen
  // não quebra nada — o menu só aparece menor, e o passo fica impossível de
  // achar. Foi o que aconteceu na primeira versão disto.
  const p = montaPlanilha([], []);
  const { contexto, itensDeMenu } = carregaCodeGs(p);
  contexto.onOpen();
  const funcoes = itensDeMenu.map(([, fn]) => fn);
  confere('tem "encerrar agora"', funcoes.includes('encerrarEventosVencidosManual'), true);
  confere('tem "ligar o automático"', funcoes.includes('instalarGatilhoDeEncerramentoManual'), true);
  // Item apontando pra função que não existe não dá erro na hora de montar o
  // menu: só falha quando alguém clica.
  const orfaos = funcoes.filter(fn => typeof contexto[fn] !== 'function');
  confere('todo item aponta pra uma função que existe', orfaos, []);
}

log('');
log('=== permissao: quem pode gravar na planilha ===');
{
  // Ate 21/09/2026 qualquer um com a URL do Web App (que e publica, vive no
  // js/nucleo/api.js) podia apagar um evento digitando-a no navegador. O PIN
  // so decidia qual TELA o app desenhava. Estes testes existem pra isso nao
  // voltar sem ninguem perceber.
  const PINS = { PIN_REGIONAL: '0418', PIN_BARRA: '1801', PIN_RECREIO: '1805' };
  const monta = () => {
    const p = montaPlanilha([ev('alvo', daquiA(3), 'ativo')], []);
    return { p, ...carregaCodeGs(p, { ...PINS }) };
  };
  const existeAlvo = (p) => coluna(p, 'Eventos', 0).includes('alvo');

  // --- sem PIN nenhum: recusa, e o evento continua la ---
  {
    const { p, contexto } = monta();
    const r = contexto.executar('eventoRemover', { id: 'alvo' });
    confere('sem PIN, a remocao e recusada', r.ok, false);
    confere('e o evento continua na planilha', existeAlvo(p), true);
  }

  // --- PIN errado: idem ---
  {
    const { p, contexto } = monta();
    const r = contexto.executar('eventoRemover', { id: 'alvo', escopo: 'barra', pin: '9999' });
    confere('PIN errado tambem e recusado', r.ok, false);
    confere('e o evento continua na planilha', existeAlvo(p), true);
  }

  // --- PIN certo da divisao: passa ---
  {
    const { p, contexto } = monta();
    const r = contexto.executar('eventoRemover', { id: 'alvo', escopo: 'barra', pin: '1801' });
    confere('com o PIN da divisao, remove', r.ok, true);
    confere('e o evento sai da planilha', existeAlvo(p), false);
  }

  // --- o Regional e chave-mestra, inclusive aqui ---
  {
    const { p, contexto } = monta();
    const r = contexto.executar('eventoRemover', { id: 'alvo', escopo: 'barra', pin: '0418' });
    confere('o PIN Regional abre qualquer divisao', r.ok, true);
    confere('e o evento sai da planilha', existeAlvo(p), false);
  }

  // --- PIN de OUTRA divisao nao serve pro escopo declarado ---
  {
    const { contexto } = monta();
    const r = contexto.executar('eventoRemover', { id: 'alvo', escopo: 'barra', pin: '1805' });
    confere('PIN de outra divisao nao vale', r.ok, false);
  }

  // --- a confirmacao de presenca NAO pode ter sido protegida ---
  // A tela do membro e publica, sem PIN. Se ela entrar na lista por engano,
  // o app quebra pra todo o clube - e essa e a unica coisa que ele faz.
  {
    const { contexto } = monta();
    const r = contexto.executar('presenca', {
      eventoId: 'alvo', membroId: 'm1', status: 'confirmado',
      direto: false, destacado: false, acompanhado: false,
    });
    confere('confirmar presenca continua sem pedir PIN', r.ok, true);
  }

  // --- as leituras continuam publicas ---
  {
    const { contexto } = monta();
    confere('ler os dados continua publico', contexto.executar('dados', {}).ok, true);
    confere('o rank continua publico', contexto.executar('rankPresenca', { janela: 'sempre' }).ok, true);
  }

  // --- toda acao protegida e de fato barrada, uma a uma ---
  {
    const { contexto } = monta();
    const passaram = contexto.ACOES_PROTEGIDAS.filter(a => contexto.executar(a, {}).ok !== false);
    confere('nenhuma acao protegida passa sem PIN', passaram, []);
  }

  // --- e a lista cobre tudo que grava ---
  // Um "if (action === 'x') return comTrava(...)" novo no executar() que nao
  // entre na lista nasce desprotegido, e nada avisaria. Esta conferencia le o
  // proprio Code.gs e cobra a lista.
  {
    const fonte = fs.readFileSync(CODE_GS, 'utf8');
    const { contexto } = monta();
    const gravam = [...fonte.matchAll(/if \(action === '([a-zA-Z]+)'\) return comTrava/g)].map(m => m[1]);
    const desprotegidas = gravam.filter(a => a !== 'presenca' && !contexto.ACOES_PROTEGIDAS.includes(a));
    confere('toda acao que grava esta na lista (menos presenca)', desprotegidas, []);
  }
}

log('');
log('=== Rank de Insights: os números de cada divisão ===');
{
  // O caso real de 25/09/2026, na Gardênia: 4 integrantes, 7 rodadas, 3
  // "Sim" ao todo. A media por rodada (0,43) virava 0 arredondada, e o
  // grafico da divisao saia todo vermelho ao lado de um "11%" certo.
  const membrosG = ['g1', 'g2', 'g3', 'g4'];
  const rodadas = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
  const sim = new Set(['r1|g1', 'r3|g2', 'r6|g1']);
  const p = montaPlanilha([], []);
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ...membrosG.map(id => [id, 'Membro ' + id, 'X', 'Gardênia - RJ4', '', ''])]);
  p.abas.InsightRodadas = novaAba('InsightRodadas', [['ID', 'Data', 'Criado em'],
    ...rodadas.map((r, i) => [r, `2026-09-0${i + 1}`, ''])]);
  p.abas.InsightPresencas = novaAba('InsightPresencas', [['ID Rodada', 'ID Membro', 'Membro', 'Divisao', 'Fez'],
    ...rodadas.flatMap(r => membrosG.map(m => [r, m, 'Membro ' + m, 'Gardênia - RJ4', sim.has(r + '|' + m) ? 'Sim' : 'Nao']))]);
  const { contexto } = carregaCodeGs(p);
  const r = contexto.executar('insightEstatisticas', {});
  const g = r.divisoes.find(d => d.chave === 'gardenia');
  confere('manda as somas exatas (3 de 28)', [g.fez, g.marcacoes], [3, 28]);
  confere('o percentual continua 11%', g.percentual, 11);
  confere('a média por rodada não vira 0', [g.mediaPorRodada, g.mediaTotalPorRodada], [0.4, 4]);
  const vazia = r.divisoes.find(d => d.chave === 'barra');
  confere('divisão sem rodada nenhuma vem zerada', [vazia.fez, vazia.marcacoes, vazia.percentual], [0, 0, null]);
}

log('');
log('=== relatório individual: o que o Code.gs devolve de um integrante ===');
{
  // m1 (Barra) foi convocado pra e1 (encerrado, Pub), e2 (encerrado, sem
  // resposta), e3 (ativo) e e5 (Regional, encerrado). Nao estava em e4.
  const p = montaPlanilha([
    ev('e1', '2026-08-01', 'encerrado'),
    ev('e2', '2026-08-15', 'encerrado'),
    ev('e3', '2099-01-01', 'ativo'),
    ev('e4', '2026-08-20', 'encerrado'),
    [...ev('e5', '2026-09-01', 'encerrado').slice(0, 8), 'regional', 'Reunião', ''],
    // Linha antiga, de quando a categoria nao existia: tem que virar "barra".
    [...ev('e6', '2026-06-01', 'encerrado').slice(0, 8), '', 'Pub', ''],
  ], [
    pr('e1', 'm1', 'Confirmado'),
    pr('e2', 'm1', 'Aguardando'),
    pr('e3', 'm1', 'Confirmado'),
    pr('e4', 'm2', 'Confirmado'),
    pr('e5', 'm1', 'Familia'),
    pr('e6', 'm1', 'Confirmado'),
  ]);
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ['m1', 'Costa', 'VI', 'Barra - RJ4', 'caveira', 'Diretor'],
    ['m2', 'Bull', 'X', 'Barra - RJ4', '', ''],
    ['m3', 'Chefe', 'V', 'Regional RJ4', '', 'Operacional']]);
  p.abas.InsightRodadas = novaAba('InsightRodadas', [['ID', 'Data', 'Criado em'],
    ['r1', '2026-08-02', ''], ['r2', '2026-08-09', '']]);
  p.abas.InsightPresencas = novaAba('InsightPresencas', [['ID Rodada', 'ID Membro', 'Membro', 'Divisao', 'Fez'],
    ['r1', 'm1', 'Costa', 'Barra - RJ4', 'Sim'], ['r2', 'm1', 'Costa', 'Barra - RJ4', 'Nao'],
    ['r1', 'm2', 'Bull', 'Barra - RJ4', 'Sim']]);
  p.abas.InsightExcluidos = novaAba('InsightExcluidos', [['ID Membro', 'Nome', 'Removido em'], ['m2', 'Bull', '']]);
  const { contexto } = carregaCodeGs(p);

  // Sem PIN: e leitura, igual ao resto do que o app le.
  const r = contexto.executar('relatorioIndividual', { membroId: 'm1' });
  confere('é leitura pública (não pede PIN)', r.ok, true);
  confere('só os encerrados em que ele foi convocado, em ordem', r.eventos.map(e => e.id), ['e6', 'e1', 'e2', 'e5']);
  confere('quem não respondeu num encerrado sai como infracional', r.eventos.find(e => e.id === 'e2').status, 'infracional');
  confere('a categoria vem junto (divisão x Regional)', r.eventos.map(e => e.categoria), ['barra', 'barra', 'barra', 'regional']);
  confere('o tipo vem junto', r.eventos.find(e => e.id === 'e5').tipo, 'Reunião');
  confere('o cadastro dele vem junto', [r.membro.nome, r.membro.cargo, r.membro.funcoes], ['Costa', 'Diretor', ['caveira']]);
  confere('Insight: participa, e as rodadas dele', [r.insight.elegivel, r.insight.rodadas.map(x => x.fez)], [true, [true, false]]);

  const excluido = contexto.executar('relatorioIndividual', { membroId: 'm2' });
  confere('removido do Insight não é elegível', excluido.insight.elegivel, false);
  const regional = contexto.executar('relatorioIndividual', { membroId: 'm3' });
  confere('integrante do Regional não faz Insight', regional.insight.elegivel, false);
  confere('integrante que não existe é recusado', contexto.executar('relatorioIndividual', { membroId: 'zz' }).ok, false);

  // Varios de uma vez (o "Exportar varios em PDF"): cada um tem que sair
  // IGUAL ao que a chamada de um so devolve - e a mesma regra, so lida uma vez.
  const varios = contexto.executar('relatorioIndividualVarios', { membroIds: 'm3,m1,zz,m2' });
  confere('vários: é leitura pública (não pede PIN)', varios.ok, true);
  confere('vários: na ordem pedida, sem quem não existe', varios.relatorios.map(x => x.membro.id), ['m3', 'm1', 'm2']);
  const soUm = (id) => { const x = contexto.executar('relatorioIndividual', { membroId: id }); return { membro: x.membro, eventos: x.eventos, insight: x.insight }; };
  confere('vários: cada um igual ao relatório de um só',
    JSON.stringify(varios.relatorios), JSON.stringify([soUm('m3'), soUm('m1'), soUm('m2')]));
  confere('vários: a lista também pode vir como array', contexto.executar('relatorioIndividualVarios', { membroIds: ['m2'] }).relatorios.length, 1);
  let semNinguem = null;
  try { contexto.executar('relatorioIndividualVarios', { membroIds: '' }); } catch (e) { semNinguem = e.message; }
  confere('vários: sem ninguém marcado é recusado', semNinguem, 'Nenhum integrante marcado');
}

log('');
log('=== responsável da chamada: salvo por divisão, atrás do PIN ===');
{
  const p = montaPlanilha([], []);
  const PINS = { PIN_REGIONAL: '0418', PIN_BARRA: '1801', PIN_RECREIO: '1805' };
  const { contexto } = carregaCodeGs(p, PINS);
  const barra = { categoria: 'barra', nome: 'Tedboy', cargo: 'Subdiretor Divisão Barra', telefone: '21964506672' };

  confere('ler sem PIN é recusado (devolve telefone)',
    contexto.executar('responsavel', { categoria: 'barra' }).ok, false);
  confere('salvar sem PIN é recusado', contexto.executar('responsavelSalvar', barra).ok, false);
  confere('nada salvo ainda: devolve vazio',
    contexto.executar('responsavel', { categoria: 'barra', escopo: 'barra', pin: '1801' }).responsavel, null);

  confere('a Barra salva o dela', contexto.executar('responsavelSalvar', { ...barra, escopo: 'barra', pin: '1801' }).ok, true);
  confere('e lê de volta igual', contexto.executar('responsavel', { categoria: 'barra', escopo: 'barra', pin: '1801' }).responsavel,
    { nome: 'Tedboy', cargo: 'Subdiretor Divisão Barra', telefone: '21964506672' });

  // A guarda geral só olha o escopo em que a pessoa entrou. Sem a segunda
  // conferência, quem entrou pela Barra trocaria o responsável do Regional.
  const invasao = contexto.executar('responsavelSalvar',
    { categoria: 'regional', nome: 'Errado', cargo: 'x', telefone: 'x', escopo: 'barra', pin: '1801' });
  confere('a Barra NÃO troca o do Regional', invasao.ok, false);
  confere('e o Regional continua sem responsável',
    contexto.executar('responsavel', { categoria: 'regional', escopo: 'regional', pin: '0418' }).responsavel, null);

  // O PIN do Regional é chave-mestra: entra em qualquer divisão.
  contexto.executar('responsavelSalvar', { ...barra, nome: 'Costa', escopo: 'regional', pin: '0418' });
  confere('o PIN do Regional troca o da Barra', p.abas.Responsaveis.dados.slice(1).map(l => [l[0], l[1]]), [['barra', 'Costa']]);
  confere('salvar de novo atualiza a linha, não cria outra', p.abas.Responsaveis.dados.length, 2);
  confere('divisão desconhecida é recusada', (() => {
    try { return contexto.executar('responsavelSalvar', { ...barra, categoria: 'xyz', escopo: 'regional', pin: '0418' }).ok; }
    catch (e) { return false; }
  })(), false);
}

log('');
log('=== regras e atenção da chamada: um texto só, e só o Regional muda ===');
{
  const p = montaPlanilha([], []);
  const PINS = { PIN_REGIONAL: '0418', PIN_BARRA: '1801' };
  const { contexto } = carregaCodeGs(p, PINS);
  const ler = () => contexto.executar('responsavel', { categoria: 'barra', escopo: 'barra', pin: '1801' }).textos;

  confere('nada salvo: textos vazios (o app usa o padrão)', ler(), {});
  confere('salvar sem PIN é recusado', contexto.executar('textoChamadaSalvar', { chave: 'regras', texto: 'x' }).ok, false);
  confere('a Barra NÃO muda (vale pra RJ4 inteira)',
    contexto.executar('textoChamadaSalvar', { chave: 'regras', texto: 'x', escopo: 'barra', pin: '1801' }).ok, false);
  confere('o Regional muda',
    contexto.executar('textoChamadaSalvar', { chave: 'regras', texto: 'Regra nova', escopo: 'regional', pin: '0418' }).ok, true);
  // O PIN do Regional é chave-mestra: quem entrou numa divisão com ele também pode.
  confere('o PIN do Regional dentro de uma divisão também muda',
    contexto.executar('textoChamadaSalvar', { chave: 'atencao', texto: 'Atenção nova', escopo: 'barra', pin: '0418' }).ok, true);
  confere('a Barra lê o que o Regional salvou', ler(), { regras: 'Regra nova', atencao: 'Atenção nova' });
  contexto.executar('textoChamadaSalvar', { chave: 'regras', texto: '', escopo: 'regional', pin: '0418' });
  confere('salvar vazio volta ao padrão, sem criar linha nova',
    [ler().regras, p.abas.TextosChamada.dados.length], ['', 3]);
  confere('texto que não existe é recusado', (() => {
    try { return contexto.executar('textoChamadaSalvar', { chave: 'legenda', texto: 'x', escopo: 'regional', pin: '0418' }).ok; }
    catch (e) { return false; }
  })(), false);
}

log('');
log('=== evento com a chamada guardada (coluna Chamada) ===');
{
  // A aba como ela está hoje na planilha de produção: 11 colunas, sem a
  // "Chamada". O Code.gs tem que acrescentar a coluna sozinho.
  const p = montaPlanilha([ev('antigo', daquiA(5), 'ativo')], []);
  const PINS = { PIN_BARRA: '1801' };
  const { contexto } = carregaCodeGs(p, PINS);
  const cred = { escopo: 'barra', pin: '1801' };
  const lido = (id) => contexto.executar('dados', {}).eventos.find(e => e.id === id);

  confere('evento antigo, sem a coluna: chamada vazia', lido('antigo').chamada, null);
  const chamada = { destino: 'Bandas Bar', pes: [{ nome: 'Posto Ipiranga', concentracao: '06:00' }] };
  // Pelo POST a chamada chega como objeto de verdade.
  contexto.executar('eventoSalvar', { ...cred, id: 'novo', nome: 'Bonde', data: daquiA(9), categoria: 'barra', chamada });
  confere('a coluna Chamada é criada no cabeçalho', p.abas.Eventos.dados[0][11], 'Chamada');
  confere('e a chamada volta igual', lido('novo').chamada, chamada);

  // Encerrar, reabrir ou mudar a data no Calendário não mandam a chamada -
  // e não podem apagá-la.
  contexto.executar('eventoSalvar', { ...cred, id: 'novo', nome: 'Bonde', data: daquiA(9), categoria: 'barra', status: 'encerrado' });
  confere('encerrar não apaga a chamada', lido('novo').chamada, chamada);
  // Pela URL (JSONP) ela chega como texto.
  contexto.executar('eventoSalvar', { ...cred, id: 'novo', nome: 'Bonde', data: daquiA(9), categoria: 'barra',
    chamada: JSON.stringify({ destino: 'Outro' }) });
  confere('chamada em texto também é aceita', lido('novo').chamada, { destino: 'Outro' });
  confere('salvar o evento antigo não quebra a linha dele', lido('antigo').nome, 'Evento antigo');
}

log('');
log('=== doações: por evento, atrás do PIN da divisão ===');
{
  // b1 e b2 sao da Barra, o1 do Oeste. Em b1, m1 confirmou, m2 ficou
  // aguardando e m3 avisou Familia.
  const p = montaPlanilha([
    ev('b1', '2026-09-05', 'encerrado'),
    ev('b2', daquiA(3), 'ativo'),
    [...ev('o1', '2026-09-06', 'encerrado').slice(0, 8), 'oeste', 'Pub', ''],
  ], [
    pr('b1', 'm1', 'Confirmado'), pr('b1', 'm2', 'Aguardando'), pr('b1', 'm3', 'Familia'),
    pr('b2', 'm1', 'Confirmado'),
    pr('o1', 'o9', 'Confirmado'),
  ]);
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ['m1', 'Costa', 'VI', 'Barra - RJ4', '', 'Diretor'], ['m2', 'Bull', 'X', 'Barra - RJ4', '', ''],
    ['m3', 'Raposo', 'VI', 'Barra - RJ4', '', 'Social'], ['o9', 'Fabiano', 'IX', 'Oeste - RJ4', '', '']]);
  const PINS = { PIN_REGIONAL: '0418', PIN_BARRA: '1801', PIN_OESTE: '1802' };
  const { contexto } = carregaCodeGs(p, PINS);
  const barra = { escopo: 'barra', pin: '1801' };
  const linhasDoacao = () => p.abas.Doacoes ? p.abas.Doacoes.dados.slice(1).map(l => [l[0], l[3], l[5]]) : [];

  confere('ler sem PIN é recusado', contexto.executar('doacoes', { divisao: 'barra' }).ok, false);
  confere('salvar sem PIN é recusado', contexto.executar('doacoesSalvar', { eventoId: 'b1', kgs: '{"m1":1}' }).ok, false);

  const salvo = contexto.executar('doacoesSalvar', { ...barra, eventoId: 'b1', kgs: JSON.stringify({ m1: 1, m2: '2,5', m3: 0 }) });
  confere('a Barra salva o evento dela', [salvo.ok, salvo.doadores, salvo.totalKg], [true, 2, 3.5]);
  // "2,5" com virgula e o jeito que se digita no Brasil; 0 e "nao levou".
  confere('vírgula vira decimal, e 0 não grava linha', linhasDoacao(), [['b1', 'm1', 1], ['b1', 'm2', 2.5]]);
  confere('o nome do integrante vai junto', p.abas.Doacoes.dados[1][4], 'Costa');

  // Salvar de novo e a lista nova, inteira: m2 saiu, m3 entrou.
  contexto.executar('doacoesSalvar', { ...barra, eventoId: 'b1', kgs: { m1: 1, m3: 1 } });
  confere('salvar de novo troca, não acumula', linhasDoacao(), [['b1', 'm1', 1], ['b1', 'm3', 1]]);
  contexto.executar('doacoesSalvar', { ...barra, eventoId: 'b2', kgs: { m1: 500 } });
  confere('500 kg é erro de digitação, não grava', linhasDoacao().length, 2);

  // A guarda geral so olha a divisao de entrada. Sem a segunda conferencia,
  // a Barra gravaria no evento do Oeste.
  const invasao = contexto.executar('doacoesSalvar', { ...barra, eventoId: 'o1', kgs: { o9: 1 } });
  confere('a Barra NÃO grava no evento do Oeste', [invasao.ok, linhasDoacao().length], [false, 2]);
  confere('a Barra NÃO lê as doações do Oeste', contexto.executar('doacoes', { ...barra, divisao: 'oeste' }).ok, false);
  confere('o PIN do Regional grava em qualquer divisão',
    contexto.executar('doacoesSalvar', { escopo: 'barra', pin: '0418', eventoId: 'o1', kgs: { o9: 1 } }).ok, true);

  const lido = contexto.executar('doacoes', { ...barra, divisao: 'barra' });
  const b1 = lido.eventos.find(e => e.id === 'b1');
  confere('só os eventos da divisão', lido.eventos.map(e => e.id), ['b1', 'b2']);
  confere('convocados e confirmados de cada evento', [b1.convocados, b1.confirmados], [['m1', 'm2', 'm3'], ['m1']]);
  confere('o que cada um levou', b1.doacoes, { m1: 1, m3: 1 });
  confere('e o nome gravado, pra quem sair do cadastro', lido.nomes, { m1: 'Costa', m3: 'Raposo' });

  contexto.executar('eventoRemover', { ...barra, id: 'b1' });
  confere('remover o evento apaga as doações dele', linhasDoacao().map(l => l[0]), ['o1']);
  let semEvento = null;
  try { contexto.executar('doacoesSalvar', { ...barra, eventoId: 'b1', kgs: { m1: 1 } }); } catch (e) { semEvento = e.message; }
  confere('evento que não existe é recusado', semEvento, 'Evento nao encontrado');
}

log('');
log('=== caixinha: um mês por vez, atrás do PIN da divisão ===');
{
  const p = montaPlanilha([], []);
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ['m1', 'Costa', 'VI', 'Barra - RJ4', '', 'Diretor'], ['m2', 'Bull', 'X', 'Barra - RJ4', '', ''],
    ['m3', 'Raposo', 'VI', 'Barra - RJ4', '', 'Social'], ['o9', 'Fabiano', 'IX', 'Oeste - RJ4', '', '']]);
  const PINS = { PIN_REGIONAL: '0418', PIN_BARRA: '1801', PIN_OESTE: '1802' };
  const { contexto } = carregaCodeGs(p, PINS);
  const barra = { escopo: 'barra', pin: '1801', divisao: 'barra' };
  const ler = () => contexto.executar('caixinha', barra).meses;
  const nLinhas = () => p.abas.Caixinha.dados.length - 1;

  confere('ler sem PIN é recusado', contexto.executar('caixinha', { divisao: 'barra' }).ok, false);
  confere('nada lançado: lista vazia', ler(), []);

  const r = contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-09', membroIds: 'm1,m2,m3', marcacoes: JSON.stringify({ m1: true, m3: true }) });
  confere('a Barra lança setembro', [r.ok, r.pagaram, r.total], [true, 2, 3]);
  contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-10', membroIds: ['m1', 'm2'], marcacoes: { m2: true } });
  confere('os meses vêm do mais recente pro mais antigo', ler().map(m => m.mes), ['2026-10', '2026-09']);
  // Sem "valores" (o app de antes), quem pagou vale o padrao.
  confere('com quem devia, quem pagou e quanto (app antigo: o padrão)', ler()[1].membros,
    [{ id: 'm1', nome: 'Costa', pagou: true, valor: 30 }, { id: 'm2', nome: 'Bull', pagou: false, valor: 0 },
     { id: 'm3', nome: 'Raposo', pagou: true, valor: 30 }]);

  // Corrigir setembro: m3 saiu da lista, m2 pagou.
  contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-09', membroIds: 'm1,m2', marcacoes: { m1: true, m2: true } });
  confere('lançar o mesmo mês corrige, não duplica', [nLinhas(), ler()[1].membros.map(m => m.id + ':' + m.pagou)],
    [4, ['m1:true', 'm2:true']]);

  let erro = null;
  try { contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-09', membroIds: '', marcacoes: {} }); } catch (e) { erro = e.message; }
  confere('mês sem ninguém é recusado', erro, 'O mes precisa ter pelo menos 1 integrante');
  confere('e o mês que existia continua lá', nLinhas(), 4);
  erro = null;
  try { contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-13', membroIds: 'm1' }); } catch (e) { erro = e.message; }
  confere('mês inválido é recusado', erro, 'Mes invalido');

  const invasao = contexto.executar('caixinhaSalvar', { ...barra, divisao: 'oeste', mes: '2026-09', membroIds: 'o9' });
  confere('a Barra NÃO lança a caixinha do Oeste', [invasao.ok, nLinhas()], [false, 4]);
  confere('a Barra NÃO lê a caixinha do Oeste', contexto.executar('caixinha', { ...barra, divisao: 'oeste' }).ok, false);
  contexto.executar('caixinhaSalvar', { escopo: 'barra', pin: '0418', divisao: 'oeste', mes: '2026-09', membroIds: 'o9', marcacoes: { o9: true } });
  confere('o Regional lança no Oeste, e a Barra não vê', [nLinhas(), ler().length], [5, 2]);

  confere('remover sem permissão é recusado',
    contexto.executar('caixinhaRemover', { ...barra, divisao: 'oeste', mes: '2026-09' }).ok, false);
  contexto.executar('caixinhaRemover', { ...barra, mes: '2026-09' });
  confere('remover apaga só aquele mês daquela divisão', [ler().map(m => m.mes), nLinhas()], [['2026-10'], 3]);
}

log('');
log('=== caixinha: o valor de cada pagamento ===');
{
  const p = montaPlanilha([], []);
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ['m1', 'Costa', 'VI', 'Barra - RJ4', '', 'Diretor'], ['m2', 'Bull', 'X', 'Barra - RJ4', '', ''],
    ['m3', 'Raposo', 'VI', 'Barra - RJ4', '', 'Social']]);
  // A aba como ela esta hoje na planilha: 6 colunas, sem "Valor".
  p.abas.Caixinha = novaAba('Caixinha', [['Divisao', 'Mes', 'ID Membro', 'Membro', 'Pagou', 'Atualizado em'],
    ['barra', '2026-08', 'm1', 'Costa', 'Sim', '01/08/2026 10:00'], ['barra', '2026-08', 'm2', 'Bull', 'Nao', '01/08/2026 10:00']]);
  const { contexto } = carregaCodeGs(p, { PIN_REGIONAL: '0418', PIN_BARRA: '1801' });
  const barra = { escopo: 'barra', pin: '1801', divisao: 'barra' };
  const mes = (m) => contexto.executar('caixinha', barra).meses.find(x => x.mes === m);

  confere('mês de antes do valor: "Sim" vale R$ 30, "Nao" vale 0', mes('2026-08').membros.map(m => [m.id, m.pagou, m.valor]),
    [['m1', true, 30], ['m2', false, 0]]);

  const r = contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-09', membroIds: 'm1,m2,m3',
    valores: JSON.stringify({ m1: 30, m2: 35.5, m3: 0 }) });
  confere('salvar com valores: quantos pagaram e o total', [r.pagaram, r.total, r.totalValor], [2, 3, 65.5]);
  confere('a aba ganhou a coluna Valor sozinha', p.abas.Caixinha.dados[0][6], 'Valor');
  const linhas = p.abas.Caixinha.dados.slice(1).filter(l => l[1] === '2026-09').map(l => [l[2], l[4], l[6]]);
  confere('cada linha com Pagou e Valor', linhas, [['m1', 'Sim', 30], ['m2', 'Sim', 35.5], ['m3', 'Nao', '']]);
  confere('e é lido de volta com o valor', mes('2026-09').membros.map(m => [m.id, m.pagou, m.valor]),
    [['m1', true, 30], ['m2', true, 35.5], ['m3', false, 0]]);
  contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-09', membroIds: 'm1,m2', valores: { m1: '30,5', m2: 50000 } });
  // O app manda as marcacoes junto, pro Code.gs antigo; aqui os valores mandam.
  contexto.executar('caixinhaSalvar', { ...barra, mes: '2026-10', membroIds: 'm1,m2',
    valores: JSON.stringify({ m2: 35 }), marcacoes: JSON.stringify({ m2: true }) });
  confere('com valores e marcações juntos, valem os valores', mes('2026-10').membros.map(m => [m.id, m.pagou, m.valor]),
    [['m1', false, 0], ['m2', true, 35]]);
  confere('vírgula vale; R$ 50 mil é erro de digitação e não conta como pago',
    mes('2026-09').membros.map(m => [m.id, m.pagou, m.valor]), [['m1', true, 30.5], ['m2', false, 0]]);
}

log('');
log('=== caixinha: controle financeiro (saldo inicial, entradas e saídas) ===');
{
  const p = montaPlanilha([], []);
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ['m1', 'Costa', 'VI', 'Barra - RJ4', '', 'Diretor']]);
  const { contexto } = carregaCodeGs(p, { PIN_REGIONAL: '0418', PIN_BARRA: '1801', PIN_OESTE: '1802' });
  const barra = { escopo: 'barra', pin: '1801', divisao: 'barra' };
  const ler = () => contexto.executar('caixinha', barra);
  const lancar = (extra) => contexto.executar('caixinhaLancamentoSalvar', { ...barra, ...extra });
  const tentar = (fn) => { try { const r = fn(); return r.ok === false ? r.erro : 'ok'; } catch (e) { return e.message; } };
  const nLinhas = () => (p.abas.CaixinhaFinanceiro ? p.abas.CaixinhaFinanceiro.dados.length - 1 : 0);
  const mesAtual = daquiA(0).slice(0, 7);

  confere('lançar sem PIN é recusado', contexto.executar('caixinhaLancamentoSalvar', { divisao: 'barra', tipo: 'saida' }).ok, false);
  confere('nada lançado: sem saldo inicial e sem lançamentos', [ler().saldoInicial, ler().lancamentos], [null, []]);

  lancar({ tipo: 'saldoInicial', mes: '2026-09', valor: 175 });
  confere('o saldo inicial', ler().saldoInicial, { mes: '2026-09', valor: 175 });
  lancar({ tipo: 'saldoInicial', mes: '2026-08', valor: '200,5' });
  confere('salvar de novo substitui, não acumula', [ler().saldoInicial, nLinhas()], [{ mes: '2026-08', valor: 200.5 }, 1]);
  lancar({ tipo: 'saldoInicial', mes: '2026-08', valor: 0 });
  confere('saldo inicial pode ser zero', ler().saldoInicial, { mes: '2026-08', valor: 0 });
  confere('saldo inicial de um mês que não chegou é recusado',
    tentar(() => lancar({ tipo: 'saldoInicial', mes: '2099-01', valor: 10 })), 'O saldo inicial nao pode ser de um mes que ainda nao chegou');
  confere('saldo inicial negativo é recusado', tentar(() => lancar({ tipo: 'saldoInicial', mes: mesAtual, valor: -5 })), 'Valor invalido');
  confere('saldo inicial sem valor é recusado', tentar(() => lancar({ tipo: 'saldoInicial', mes: mesAtual, valor: '' })), 'Valor invalido');

  const saida = lancar({ tipo: 'saida', data: '2026-09-12', categoria: 'Kit Churrasco / lanches', descricao: 'Carne do pub', valor: '120,5' });
  lancar({ tipo: 'entrada', data: '2026-09-20', categoria: 'Outras entradas', descricao: 'Rifa', valor: 60 });
  confere('saída e entrada gravadas, a mais recente primeiro', ler().lancamentos.map(l => [l.tipo, l.data, l.categoria, l.descricao, l.valor]),
    [['entrada', '2026-09-20', 'Outras entradas', 'Rifa', 60], ['saida', '2026-09-12', 'Kit Churrasco / lanches', 'Carne do pub', 120.5]]);
  const semData = lancar({ tipo: 'saida', categoria: 'Adesivos', valor: 15 });
  confere('sem data, vale hoje', ler().lancamentos.find(l => l.id === semData.id).data, daquiA(0));

  confere('valor zero é recusado', tentar(() => lancar({ tipo: 'saida', categoria: 'Adesivos', valor: 0 })), 'Valor invalido');
  confere('R$ 50 mil é recusado', tentar(() => lancar({ tipo: 'saida', categoria: 'Adesivos', valor: 50000 })), 'Valor invalido');
  confere('data no futuro é recusada', tentar(() => lancar({ tipo: 'saida', categoria: 'Adesivos', valor: 5, data: daquiA(2) })), 'A data nao pode ser no futuro');
  confere('saída sem categoria é recusada', tentar(() => lancar({ tipo: 'saida', valor: 5 })), 'Faltou a categoria');
  confere('tipo desconhecido é recusado', tentar(() => lancar({ tipo: 'roubo', valor: 5 })), 'Tipo de lancamento desconhecido');

  // Corrigir: mesmo id, a linha e reescrita no lugar.
  const antes = nLinhas();
  lancar({ id: saida.id, tipo: 'saida', data: '2026-09-13', categoria: 'Kit Churrasco / lanches', descricao: 'Carne e carvão', valor: 130 });
  const corrigida = ler().lancamentos.find(l => l.id === saida.id);
  confere('corrigir reescreve a mesma linha', [nLinhas(), corrigida.data, corrigida.descricao, corrigida.valor], [antes, '2026-09-13', 'Carne e carvão', 130]);
  confere('corrigir um id que não existe é recusado', tentar(() => lancar({ id: 'nao-existe', tipo: 'saida', categoria: 'Adesivos', valor: 5 })), 'Lancamento nao encontrado');

  // O Oeste tem o caixa dele; a Barra nao enxerga nem mexe.
  const doOeste = contexto.executar('caixinhaLancamentoSalvar', { escopo: 'barra', pin: '0418', divisao: 'oeste', tipo: 'saida', categoria: 'Pedágios', valor: 40 });
  confere('o Regional lança no Oeste', doOeste.ok, true);
  confere('e a Barra não vê o lançamento do Oeste', ler().lancamentos.some(l => l.id === doOeste.id), false);
  confere('a Barra NÃO lança no Oeste', lancar({ divisao: 'oeste', tipo: 'saida', categoria: 'Pedágios', valor: 1 }).ok, false);
  confere('a Barra NÃO corrige o lançamento do Oeste dizendo que é da Barra',
    lancar({ id: doOeste.id, tipo: 'saida', categoria: 'Pedágios', valor: 1 }).ok, false);
  confere('a Barra NÃO exclui o lançamento do Oeste',
    contexto.executar('caixinhaLancamentoRemover', { ...barra, id: doOeste.id }).ok, false);
  confere('o lançamento do Oeste continua intacto',
    p.abas.CaixinhaFinanceiro.dados.find(l => l[0] === doOeste.id)[6], 40);

  const saldoId = p.abas.CaixinhaFinanceiro.dados.find(l => l[1] === 'barra' && l[2] === 'Saldo inicial')[0];
  confere('o saldo inicial não se exclui como lançamento',
    tentar(() => contexto.executar('caixinhaLancamentoRemover', { ...barra, id: saldoId })), 'Lancamento nao encontrado');
  contexto.executar('caixinhaLancamentoRemover', { ...barra, id: saida.id });
  confere('excluir apaga só aquele lançamento', ler().lancamentos.map(l => l.descricao).sort(), ['', 'Rifa']);

  const linha = p.abas.CaixinhaFinanceiro.dados.find(l => l[0] === semData.id);
  confere('a linha na planilha: tipo legível e valor como número', [linha[2], typeof linha[6]], ['Saida', 'number']);
}

log('');
log('=== entrada/saída: afastamento, retorno e desligamento ===');
{
  // 'velho' ja encerrou, 'aberto' ainda vai acontecer. m1 e m2 sao da
  // Barra, o9 do Oeste.
  const p = montaPlanilha([ev('velho', '2026-09-05', 'encerrado'), ev('aberto', daquiA(3), 'ativo')], [
    pr('velho', 'm1', 'Confirmado'), pr('aberto', 'm1', 'Aguardando'),
    pr('velho', 'm2', 'Confirmado'), pr('aberto', 'm2', 'Confirmado'),
    pr('aberto', 'o9', 'Aguardando'),
  ]);
  // A aba como esta hoje na planilha: 6 colunas, sem Situacao nem Entrada.
  p.abas.Membros = novaAba('Membros', [['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes', 'Cargo'],
    ['m1', 'Costa', 'VI', 'Barra - RJ4', '', 'Diretor'], ['m2', 'Bull', 'X', 'Barra - RJ4', '', ''],
    ['o9', 'Fabiano', 'IX', 'Oeste - RJ4', '', '']]);
  const PINS = { PIN_REGIONAL: '0418', PIN_BARRA: '1801', PIN_OESTE: '1802' };
  const { contexto } = carregaCodeGs(p, PINS);
  const barra = { escopo: 'barra', pin: '1801' };
  const membro = (id) => contexto.executar('dados', {}).membros.find(m => m.id === id);
  const presencasDe = (mid) => p.abas.Presencas.dados.slice(1).filter(l => l[2] === mid).map(l => l[0]);
  const livro = () => (p.abas.Movimentacoes ? p.abas.Movimentacoes.dados.slice(1) : []).map(l => [l[2], l[3], l[6]]);
  const mover = (extra) => contexto.executar('membroMovimentar', { ...barra, ...extra });

  confere('sem PIN, movimentar é recusado', contexto.executar('membroMovimentar', { membroId: 'm1', tipo: 'afastamento' }).ok, false);
  confere('ler o livro sem PIN é recusado', contexto.executar('movimentos', { divisao: 'barra' }).ok, false);

  // Integrante novo: entrada no cadastro e no livro.
  contexto.executar('membroSalvar', { ...barra, id: 'm3', nome: 'Raposo', grau: 'VI', divisao: 'Barra - RJ4', funcoes: '', cargo: 'Social', entrada: '2026-10-01' });
  confere('integrante novo grava a data de entrada', membro('m3').entrada, '2026-10-01');
  confere('e entra no livro como Entrada', livro(), [['barra', 'm3', 'Entrada']]);
  contexto.executar('membroSalvar', { ...barra, id: 'm4', nome: 'Alfa', divisao: 'Barra - RJ4' });
  confere('sem data de entrada, vale hoje', membro('m4').entrada, daquiA(0));

  const r = mover({ membroId: 'm1', tipo: 'afastamento', data: '2026-10-10', motivo: 'Trabalho fora do estado' });
  confere('a Barra afasta o dela', [r.ok, r.eventosAbertosTirados], [true, 1]);
  confere('o afastado aparece assim no cadastro', [membro('m1').situacao, membro('m1').situacaoDesde], ['afastado', '2026-10-10']);
  confere('sai do evento aberto, fica no encerrado', presencasDe('m1'), ['velho']);
  // Editar pelo formulario (nome/grau) nao pode desfazer o afastamento.
  contexto.executar('membroSalvar', { ...barra, id: 'm1', nome: 'Costa Jr', grau: 'VI', divisao: 'Barra - RJ4', cargo: 'Diretor' });
  confere('editar o cadastro não tira o afastamento', [membro('m1').nome, membro('m1').situacao], ['Costa Jr', 'afastado']);
  let erro = null;
  try { mover({ membroId: 'm1', tipo: 'afastamento' }); } catch (e) { erro = e.message; }
  confere('afastar de novo é recusado', erro, 'Este integrante ja esta afastado');
  erro = null;
  try { mover({ membroId: 'm2', tipo: 'retorno' }); } catch (e) { erro = e.message; }
  confere('retorno de quem não está afastado é recusado', erro, 'Este integrante nao esta afastado');

  // O Insight deixa o afastado de fora enquanto durar.
  confere('afastado fica fora do Insight', contexto.executar('insightEstatisticas', {}).membros.map(m => m.id).includes('m1'), false);

  mover({ membroId: 'm1', tipo: 'retorno', data: '2026-10-20' });
  confere('retorno volta a ativo', [membro('m1').situacao, membro('m1').situacaoDesde], ['', '']);
  confere('e volta pro Insight', contexto.executar('insightEstatisticas', {}).membros.map(m => m.id).includes('m1'), true);

  const desl = mover({ membroId: 'm2', tipo: 'desligamento', data: '2026-10-21', motivo: 'Pediu pra sair' });
  confere('desligar tira do cadastro', [desl.ok, membro('m2')], [true, undefined]);
  // A diferenca pro "Remover": o historico dos eventos encerrados fica.
  confere('o histórico do evento encerrado fica, o aberto sai', presencasDe('m2'), ['velho']);

  const invasao = mover({ membroId: 'o9', tipo: 'afastamento' });
  confere('a Barra NÃO afasta ninguém do Oeste', [invasao.ok, membro('o9').situacao], [false, '']);
  confere('o Regional afasta em qualquer divisão',
    contexto.executar('membroMovimentar', { escopo: 'barra', pin: '0418', membroId: 'o9', tipo: 'afastamento' }).ok, true);

  confere('o livro guarda tudo, na ordem', livro(), [['barra', 'm3', 'Entrada'], ['barra', 'm4', 'Entrada'],
    ['barra', 'm1', 'Afastamento'], ['barra', 'm1', 'Retorno'], ['barra', 'm2', 'Desligamento'], ['oeste', 'o9', 'Afastamento']]);
  const daBarra = contexto.executar('movimentos', { ...barra, divisao: 'barra' }).movimentos;
  confere('a Barra lê só o livro dela', daBarra.every(m => m.divisao === 'barra') && daBarra.length, 5);
  confere('do mais recente pro mais antigo, com tipo e motivo', [daBarra[0].tipo, daBarra[0].nome, daBarra[0].motivo],
    ['desligamento', 'Bull', 'Pediu pra sair']);
  confere('a Barra NÃO lê o livro do Regional (todas as divisões)', contexto.executar('movimentos', { ...barra, divisao: 'regional' }).ok, false);
  confere('o Regional lê o livro inteiro',
    contexto.executar('movimentos', { escopo: 'regional', pin: '0418', divisao: 'regional' }).movimentos.length, 6);
}

log('');
log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S) — veja acima`);
fs.writeFileSync(SAIDA, linhas.join('\n'), 'utf8');
process.exit(falhas === 0 ? 0 : 1);
