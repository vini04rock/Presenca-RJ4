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
log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S) — veja acima`);
fs.writeFileSync(SAIDA, linhas.join('\n'), 'utf8');
process.exit(falhas === 0 ? 0 : 1);
