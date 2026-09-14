/**
 * Confirmacao de Presenca - Insanos MC Barra RJ4
 * Backend do app, publicado como Web App a partir da planilha.
 *
 * Guarda os dados em tres abas legiveis - Membros, Eventos e Presencas -
 * com uma linha por registro, em vez de JSON cru numa unica celula.
 * Duas consequencias praticas:
 *
 *   1. Da para ler, filtrar e editar a planilha na mao.
 *   2. Cada membro grava na propria linha, entao duas pessoas confirmando
 *      ao mesmo tempo nao se sobrescrevem.
 *
 * A aba KV antiga e lida uma unica vez, para migrar o que ja existia.
 *
 * COMO PUBLICAR (repetir a cada alteracao deste arquivo):
 *   Implantar > Gerenciar implantacoes > editar (lapis)
 *   > Versao: Nova versao > Implantar
 * Manter "Executar como: eu" e "Quem tem acesso: qualquer pessoa".
 * A URL nao muda ao criar nova versao de uma implantacao existente.
 */

// Marcador para conferir o que esta publicado de fato: basta chamar a URL do
// Web App com ?action=versao. Subir sempre junto com as alteracoes.
var VERSAO = '2026-09-13-v-insight-ajustar-rodada-fix-vazio';

var ABA_MEMBROS = 'Membros';
var ABA_EVENTOS = 'Eventos';
var ABA_PRESENCAS = 'Presencas';
var ABA_RELATORIO = 'Relatorio';
var ABA_REGIONAL = 'Regional RJ4';
var ABA_INSIGHT_RESUMO = 'Insight RJ4';
var ABA_CALENDARIO = 'Calendário';
var ABA_KV = 'KV';
var ABA_INSIGHT_RODADAS = 'InsightRodadas';
var ABA_INSIGHT_PRESENCAS = 'InsightPresencas';
var ABA_INSIGHT_EXCLUIDOS = 'InsightExcluidos';

var CAB_MEMBROS = ['ID', 'Nome', 'Grau', 'Divisao', 'Funcoes'];
// "Texto Original" (ultima coluna) so existe pra eventos criados via colar
// convocacao (ver criarEventoDeTexto) - eventos criados pelo Modo
// organizador manual ficam com essa coluna vazia, e lerEventos() ja trata
// esse caso (linhas antigas nem tem a coluna preenchida na planilha).
var CAB_EVENTOS = ['ID', 'Nome', 'Data', 'Horario', 'Endereco', 'Outros', 'Status', 'Criado em', 'Categoria', 'Tipo', 'Texto Original'];
var CAB_PRESENCAS = ['ID Evento', 'Evento', 'ID Membro', 'Membro', 'Status',
                     'Direto', 'Destacado', 'Acompanhado', 'Atualizado em'];
// So membros de divisao fazem insight (Regional RJ4 fica de fora - ver
// calcularEstatisticasInsights). "Divisao" aqui e um retrato de quando a
// rodada foi gravada, igual "Membro" em CAB_PRESENCAS - se o membro mudar
// de divisao depois, o historico de rodadas antigas nao muda.
var CAB_INSIGHT_RODADAS = ['ID', 'Data', 'Criado em'];
var CAB_INSIGHT_PRESENCAS = ['ID Rodada', 'ID Membro', 'Membro', 'Divisao', 'Fez'];
// So os que foram removidos aparecem aqui - por padrao todo membro de
// divisao participa, sem precisar de nenhuma linha. Remover = entra aqui;
// voltar a participar = sai daqui.
var CAB_INSIGHT_EXCLUIDOS = ['ID Membro', 'Nome', 'Removido em'];

// Na planilha fica o rotulo legivel; o app continua falando em chaves.
var STATUS_ROTULO = {
  aguardando: 'Aguardando',
  confirmado: 'Confirmado',
  familia: 'Familia',
  trabalho: 'Trabalho',
  // Usados so pela importacao de convocacao colada (ver criarEventoDeTexto) -
  // o picker manual do evento continua com só os 4 de cima (STATUS_PICKER_KEYS
  // no index.html). "infracional" cobre tanto quem tem falta sem justificativa
  // quanto quem nao respondeu a convocacao (mesmo tratamento, por decisao do
  // clube).
  infracional: 'Infracional',
  justificada: 'Justificada'
};

function statusParaChave(rotulo) {
  for (var chave in STATUS_ROTULO) {
    if (STATUS_ROTULO[chave] === String(rotulo).trim()) return chave;
  }
  return 'aguardando';
}

function simNao(v) { return v ? 'Sim' : 'Nao'; }
function ehSim(v) { return String(v).trim().toLowerCase() === 'sim'; }

// ---------- ENTRADAS ----------

function doGet(e) {
  var p = e.parameter || {};
  var resposta;
  try {
    resposta = executar(p.action || 'dados', p);
  } catch (erro) {
    resposta = { ok: false, erro: String(erro && erro.message || erro) };
  }
  return responder(resposta, p.callback);
}

// Usado pelo sendBeacon, quando a pagina do membro esta sendo fechada.
function doPost(e) {
  var dados = {};
  try {
    dados = JSON.parse(e.postData.contents);
  } catch (erro) {
    return responder({ ok: false, erro: 'Corpo invalido' });
  }
  var resposta;
  try {
    resposta = executar(dados.action || '', dados);
  } catch (erro) {
    resposta = { ok: false, erro: String(erro && erro.message || erro) };
  }
  return responder(resposta);
}

function responder(obj, callback) {
  var texto = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + texto + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(texto)
    .setMimeType(ContentService.MimeType.JSON);
}

function executar(action, p) {
  if (action === 'versao') return { ok: true, versao: VERSAO };
  if (action === 'dados') return { ok: true, membros: lerMembros(), eventos: lerEventos() };
  if (action === 'presencas') return { ok: true, presencas: lerPresencas(p.eventoId) };
  // O relatorio nunca e refeito junto com uma gravacao: fazer isso dobrava o
  // tempo da confirmacao, e o membro esperava por uma pagina que ele nem ve.
  // Ele e gerado sob demanda, pelo botao no app ou pelo menu da planilha.
  if (action === 'presenca') return comTrava(function () { return salvarPresenca(p); });
  if (action === 'membroSalvar') return comTrava(function () { return salvarMembro(p); });
  if (action === 'membroRemover') return comTrava(function () { return removerMembro(p.id); });
  if (action === 'eventoSalvar') return comTrava(function () { return salvarEvento(p); });
  if (action === 'criarEventoDeTexto') return comTrava(function () { return criarEventoDeTexto(p); });
  if (action === 'criarEventosDeCalendario') return comTrava(function () { return criarEventosDeCalendario(p); });
  if (action === 'eventoRemover') return comTrava(function () { return removerEvento(p.id); });
  if (action === 'relatorio') return comTrava(function () {
    atualizarRelatorio();
    atualizarAbaRegional();
    atualizarAbasDivisoes();
    atualizarAbaInsight();
    atualizarAbaCalendario();
    organizarAbas();
    return { ok: true };
  });
  if (action === 'estatisticas') return { ok: true, membros: lerEstatisticasMembros(String(p.categoria || '')) };
  if (action === 'verificarPin') return verificarPin(String(p.escopo || ''), String(p.pin || ''));
  if (action === 'rankPresenca') return { ok: true, rank: calcularRankPresenca(String(p.janela || 'sempre')) };
  if (action === 'insightEstatisticas') return calcularEstatisticasInsights();
  // 30 (nao 5) desde a aba "Por rodada" do Rank de Insights publico - antes
  // so precisava das ultimas 5 pro sparkline de tendencia, agora tambem
  // alimenta uma lista navegavel de rodadas passadas.
  if (action === 'insightRodadas') return { ok: true, rodadas: listarInsightRodadas(30) };
  // O app manda tudo por GET (ver api() no index.html) - marcacoes vira uma
  // unica string JSON num parametro so, em vez de um objeto de verdade.
  if (action === 'insightSalvar') return comTrava(function () { return salvarInsightRodada(parseOuVazio(p.marcacoes, {}), String(p.data || '')); });
  if (action === 'insightRodadaAjustar') return comTrava(function () { return ajustarInsightRodada(String(p.id || ''), parseOuVazio(p.marcacoes, {}), listaDe(p.membroIds)); });
  if (action === 'insightRodadaRemover') return comTrava(function () { return removerInsightRodada(p.id); });
  if (action === 'insightMembroRemover') return comTrava(function () { return removerMembroDoInsight(String(p.id || '')); });
  if (action === 'insightMembroReincluir') return comTrava(function () { return reincluirMembroNoInsight(String(p.id || '')); });
  throw new Error('Acao desconhecida: ' + action);
}

// Sem a trava, duas gravacoes simultaneas podem escolher a mesma linha vazia.
function comTrava(fn) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) throw new Error('A planilha esta ocupada, tente de novo');
  try {
    return fn();
  } finally {
    trava.releaseLock();
  }
}

// ---------- PIN ----------
// Os PINs ficam nas Propriedades do Script (Apps Script > Configuracoes do
// projeto > Propriedades do script) - nunca no codigo que roda no
// navegador, entao nao da pra achar "ver codigo-fonte". Trocar um PIN e so
// editar o valor da propriedade correspondente, sem mexer em codigo.
var ESCOPOS_VALIDOS = ['barra', 'oeste', 'recreio', 'curicica', 'taquara', 'gardenia', 'regional'];
// Espelha a lista ESCOPOS do index.html (chave -> nome). Se uma divisao for
// renomeada la, atualizar aqui tambem.
var ESCOPOS_NOME = {
  barra: 'Barra - RJ4', oeste: 'Oeste - RJ4', recreio: 'Recreio - RJ4',
  curicica: 'Curicica - RJ4', taquara: 'Taquara - RJ4', gardenia: 'Gardênia - RJ4',
  regional: 'Regional RJ4'
};

// O app nunca compara PIN sozinho - manda o que a pessoa digitou pra ca, e
// so recebe de volta se bateu ou nao. Assim o valor certo nunca trafega
// para fora do servidor.
function verificarPin(escopo, pinDigitado) {
  if (ESCOPOS_VALIDOS.indexOf(escopo) === -1 || !pinDigitado) return { ok: true, valido: false };
  var props = PropertiesService.getScriptProperties();
  var pinRegional = props.getProperty('PIN_REGIONAL') || '';
  // O PIN do Regional e chave-mestra: abre qualquer divisao, alem da propria.
  if (pinRegional && pinDigitado === pinRegional) return { ok: true, valido: true };
  var pinEscopo = props.getProperty('PIN_' + escopo.toUpperCase()) || '';
  return { ok: true, valido: !!pinEscopo && pinDigitado === pinEscopo };
}

// Rodar UMA VEZ pelo editor do Apps Script (selecionar esta funcao no menu
// de funcoes, no topo, e clicar em Executar) para criar os 7 PINs, todos
// comecando iguais ao PIN unico de hoje. Depois disso, trocar um PIN e so
// editar a propriedade correspondente em Configuracoes do projeto >
// Propriedades do script - nao precisa rodar esta funcao de novo.
function configurarPinsIniciais() {
  var props = PropertiesService.getScriptProperties();
  var chaves = ['BARRA', 'OESTE', 'RECREIO', 'CURICICA', 'TAQUARA', 'GARDENIA', 'REGIONAL'];
  chaves.forEach(function (c) { props.setProperty('PIN_' + c, '0987'); });
  return 'PINs criados: ' + chaves.map(function (c) { return 'PIN_' + c; }).join(', ');
}

// Rodar UMA VEZ pelo editor do Apps Script para trocar os 7 PINs de uma vez
// so, pelos novos valores definidos em 10/09/2026. Depois de rodar e
// conferir que funcionou, pode apagar esta funcao (ou deixar, nao faz mal -
// so nao roda sozinha, precisa ser chamada na mao).
function configurarPinsNovos() {
  var props = PropertiesService.getScriptProperties();
  var novos = {
    REGIONAL: '0418',
    BARRA: '1801',
    CURICICA: '1802',
    GARDENIA: '1803',
    OESTE: '1804',
    RECREIO: '1805',
    TAQUARA: '1806'
  };
  Object.keys(novos).forEach(function (c) { props.setProperty('PIN_' + c, novos[c]); });
  return 'PINs atualizados: ' + Object.keys(novos).join(', ');
}

// ---------- ABAS ----------

function planilha() { return SpreadsheetApp.getActiveSpreadsheet(); }

function aba(nome, cabecalho) {
  var ss = planilha();
  var s = ss.getSheetByName(nome);
  if (!s) {
    s = ss.insertSheet(nome);
    s.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function linhas(s) {
  var ultima = s.getLastRow();
  if (ultima < 2) return [];
  return s.getRange(2, 1, ultima - 1, s.getLastColumn()).getValues();
}

function acharLinha(s, teste) {
  var dados = linhas(s);
  for (var i = 0; i < dados.length; i++) {
    if (teste(dados[i])) return { indice: i + 2, valores: dados[i] };
  }
  return null;
}

// ---------- LEITURA ----------

function lerMembros() {
  migrarSePreciso();
  return linhas(aba(ABA_MEMBROS, CAB_MEMBROS))
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      return {
        id: String(l[0]), nome: String(l[1]), grau: String(l[2] || ''), divisao: String(l[3] || ''),
        // Guardado como texto separado por virgula, igual a lista de
        // participantes de um evento - cresce sem precisar de coluna nova
        // a cada funcao que o app ganhar no futuro.
        funcoes: String(l[4] || '').split(',').map(function (f) { return f.trim(); }).filter(Boolean)
      };
    });
}

function lerEventos() {
  migrarSePreciso();
  return linhas(aba(ABA_EVENTOS, CAB_EVENTOS))
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      return {
        id: String(l[0]),
        nome: String(l[1]),
        data: formatarData(l[2]),
        horario: formatarHorario(l[3]),
        endereco: String(l[4] || ''),
        outros: String(l[5] || ''),
        status: String(l[6] || 'ativo'),
        criadoEm: ehData(l[7]) ? Utilities.formatDate(l[7], fuso(), 'dd/MM/yyyy HH:mm') : String(l[7] || ''),
        // Linhas gravadas antes de existirem varias divisoes tem 'divisao'
        // ou nada - nessa epoca so a Barra existia, entao viram 'barra'.
        // Categorias novas guardam a divisao especifica (recreio, oeste,
        // regional, ...) direto, sem tradução nenhuma.
        categoria: (function () {
          var raw = String(l[8] || '');
          return (raw === '' || raw === 'divisao') ? 'barra' : raw;
        })(),
        tipo: String(l[9] || ''),
        textoOriginal: String(l[10] || ''),
        memberIds: membrosDoEvento(String(l[0]))
      };
    });
}

function membrosDoEvento(eventoId) {
  return linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS))
    .filter(function (l) { return String(l[0]) === eventoId && l[2]; })
    .map(function (l) { return String(l[2]); });
}

function lerPresencas(eventoId) {
  var mapa = {};
  linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS)).forEach(function (l) {
    if (String(l[0]) !== String(eventoId) || !l[2]) return;
    mapa[String(l[2])] = {
      status: statusParaChave(l[4]),
      direto: ehSim(l[5]),
      destacado: ehSim(l[6]),
      acompanhado: ehSim(l[7])
    };
  });
  return mapa;
}

// Percentual de presenca de cada membro, olhando so para eventos ja
// encerrados: um evento ainda ativo pode ter a confirmacao mudada, entao
// contar ele antes da hora distorceria o numero. Um membro so entra na conta
// de um evento se estava convidado (tem linha em Presencas) - assim quem
// entrou no clube depois de um evento antigo nao e penalizado por ele.
// So os membros daquela divisao entram na conta - sem isso, o organizador
// da Barra veria (e o percentual incluiria) gente de outra divisao.
function lerEstatisticasMembros(categoria) {
  var nomeDivisao = ESCOPOS_NOME[categoria] || '';
  var nomes = {};
  linhas(aba(ABA_MEMBROS, CAB_MEMBROS)).forEach(function (l) {
    if (l[0] && (!nomeDivisao || String(l[3] || '') === nomeDivisao)) nomes[String(l[0])] = String(l[1] || '');
  });

  var encerrados = {};
  linhas(aba(ABA_EVENTOS, CAB_EVENTOS)).forEach(function (l) {
    if (!l[0] || String(l[6]) !== 'encerrado') return;
    var cat = String(l[8] || '');
    cat = (cat === '' || cat === 'divisao') ? 'barra' : cat;
    if (!categoria || cat === categoria) encerrados[String(l[0])] = true;
  });

  var contagem = {};
  linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS)).forEach(function (l) {
    if (!l[0] || !l[2] || !encerrados[String(l[0])]) return;
    var mid = String(l[2]);
    if (!contagem[mid]) contagem[mid] = { convites: 0, confirmacoes: 0 };
    contagem[mid].convites++;
    if (statusParaChave(l[4]) === 'confirmado') contagem[mid].confirmacoes++;
  });

  return Object.keys(nomes).map(function (mid) {
    var c = contagem[mid] || { convites: 0, confirmacoes: 0 };
    return {
      id: mid,
      nome: nomes[mid],
      convites: c.convites,
      confirmacoes: c.confirmacoes,
      percentual: c.convites ? Math.round((c.confirmacoes / c.convites) * 100) : null
    };
  });
}

var CHAVE_POR_NOME_DIVISAO = (function () {
  var mapa = {};
  Object.keys(ESCOPOS_NOME).forEach(function (chave) { mapa[ESCOPOS_NOME[chave]] = chave; });
  return mapa;
})();

function pctOuNulo(c) { return c.convites ? Math.round((c.confirmacoes / c.convites) * 100) : null; }

// Motor compartilhado do Rank publico e da aba Regional RJ4 da planilha:
// confirmados/convidados por divisao (nos proprios eventos encerrados) e por
// membro (so dentro dos eventos da propria divisao - um membro convidado
// para um evento regional nao mistura essa presenca na % pessoal dele).
// dataInicio (yyyy-mm-dd) filtra so eventos a partir dali; null = sem
// filtro, desde sempre.
function calcularEstatisticasPorEscopo(dataInicio) {
  var nomePorId = {}, divisaoPorId = {};
  linhas(aba(ABA_MEMBROS, CAB_MEMBROS)).forEach(function (l) {
    if (!l[0]) return;
    nomePorId[String(l[0])] = String(l[1] || '');
    divisaoPorId[String(l[0])] = String(l[3] || '');
  });

  var categoriaPorEvento = {};
  linhas(aba(ABA_EVENTOS, CAB_EVENTOS)).forEach(function (l) {
    if (!l[0] || String(l[6]) !== 'encerrado') return;
    if (dataInicio) {
      var dataEv = formatarData(l[2]);
      if (!dataEv || dataEv < dataInicio) return;
    }
    var cat = String(l[8] || '');
    categoriaPorEvento[String(l[0])] = (cat === '' || cat === 'divisao') ? 'barra' : cat;
  });

  var porDivisao = {}, porMembro = {};
  linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS)).forEach(function (l) {
    if (!l[0] || !l[2]) return;
    var cat = categoriaPorEvento[String(l[0])];
    if (!cat) return;
    var mid = String(l[2]);
    var confirmado = statusParaChave(l[4]) === 'confirmado';

    if (!porDivisao[cat]) porDivisao[cat] = { convites: 0, confirmacoes: 0 };
    porDivisao[cat].convites++;
    if (confirmado) porDivisao[cat].confirmacoes++;

    // So conta pra % pessoal se o evento e da mesma categoria da divisao do
    // membro - senao, um membro convidado por um evento regional teria essa
    // presenca misturada na propria % da divisao dele.
    if (CHAVE_POR_NOME_DIVISAO[divisaoPorId[mid]] === cat) {
      if (!porMembro[mid]) porMembro[mid] = { convites: 0, confirmacoes: 0 };
      porMembro[mid].convites++;
      if (confirmado) porMembro[mid].confirmacoes++;
    }
  });

  var divisoes = ESCOPOS_VALIDOS.map(function (chave) {
    var c = porDivisao[chave] || { convites: 0, confirmacoes: 0 };
    return { chave: chave, nome: ESCOPOS_NOME[chave], convites: c.convites, confirmacoes: c.confirmacoes, percentual: pctOuNulo(c) };
  });

  var membros = Object.keys(nomePorId).map(function (mid) {
    var c = porMembro[mid] || { convites: 0, confirmacoes: 0 };
    return {
      id: mid, nome: nomePorId[mid], divisao: divisaoPorId[mid],
      convites: c.convites, confirmacoes: c.confirmacoes, percentual: pctOuNulo(c)
    };
  });

  return { divisoes: divisoes, membros: membros };
}

function dataCorte(mesesAtras) {
  var d = new Date();
  d.setMonth(d.getMonth() - mesesAtras);
  return Utilities.formatDate(d, fuso(), 'yyyy-MM-dd');
}

// Mesmo calculo de calcularEstatisticasPorEscopo, mas para varias janelas de
// tempo de uma vez, lendo a planilha uma unica vez em vez de uma leitura por
// janela - usado pela aba Regional RJ4, que mostra 1/3/6/12 meses juntos.
// janelasEmMeses: lista de numeros (1, 3, 6, 12, ...); usar null na lista
// para incluir "desde sempre". Devolve um objeto { '1': {...}, '3': {...},
// 'sempre': {...} }, uma chave de texto por janela.
function calcularEstatisticasVariasJanelas(janelasEmMeses) {
  var nomePorId = {}, divisaoPorId = {};
  linhas(aba(ABA_MEMBROS, CAB_MEMBROS)).forEach(function (l) {
    if (!l[0]) return;
    nomePorId[String(l[0])] = String(l[1] || '');
    divisaoPorId[String(l[0])] = String(l[3] || '');
  });

  var eventosInfo = {};
  linhas(aba(ABA_EVENTOS, CAB_EVENTOS)).forEach(function (l) {
    if (!l[0] || String(l[6]) !== 'encerrado') return;
    var cat = String(l[8] || '');
    cat = (cat === '' || cat === 'divisao') ? 'barra' : cat;
    eventosInfo[String(l[0])] = { categoria: cat, data: formatarData(l[2]) };
  });

  var presencas = [];
  linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS)).forEach(function (l) {
    if (!l[0] || !l[2]) return;
    var info = eventosInfo[String(l[0])];
    if (!info) return;
    presencas.push({
      membroId: String(l[2]), categoria: info.categoria, data: info.data,
      confirmado: statusParaChave(l[4]) === 'confirmado'
    });
  });

  function calcularParaCorte(dataInicio) {
    var porDivisao = {}, porMembro = {};
    presencas.forEach(function (p) {
      if (dataInicio && (!p.data || p.data < dataInicio)) return;

      if (!porDivisao[p.categoria]) porDivisao[p.categoria] = { convites: 0, confirmacoes: 0 };
      porDivisao[p.categoria].convites++;
      if (p.confirmado) porDivisao[p.categoria].confirmacoes++;

      if (CHAVE_POR_NOME_DIVISAO[divisaoPorId[p.membroId]] === p.categoria) {
        if (!porMembro[p.membroId]) porMembro[p.membroId] = { convites: 0, confirmacoes: 0 };
        porMembro[p.membroId].convites++;
        if (p.confirmado) porMembro[p.membroId].confirmacoes++;
      }
    });

    var divisoes = ESCOPOS_VALIDOS.map(function (chave) {
      var c = porDivisao[chave] || { convites: 0, confirmacoes: 0 };
      return { chave: chave, nome: ESCOPOS_NOME[chave], convites: c.convites, confirmacoes: c.confirmacoes, percentual: pctOuNulo(c) };
    });
    var membros = Object.keys(nomePorId).map(function (mid) {
      var c = porMembro[mid] || { convites: 0, confirmacoes: 0 };
      return { id: mid, nome: nomePorId[mid], divisao: divisaoPorId[mid], convites: c.convites, confirmacoes: c.confirmacoes, percentual: pctOuNulo(c) };
    });
    return { divisoes: divisoes, membros: membros };
  }

  var resultado = {};
  janelasEmMeses.forEach(function (m) {
    resultado[m === null ? 'sempre' : String(m)] = calcularParaCorte(m === null ? null : dataCorte(m));
  });
  return resultado;
}

// Rank publico: 'sempre' (padrao) ou '6meses'.
function calcularRankPresenca(janela) {
  return calcularEstatisticasPorEscopo(janela === '6meses' ? dataCorte(6) : null);
}

// Regional primeiro, depois as divisoes em ordem alfabetica - mesmo padrao
// usado em todo o app.
var ORDEM_EXIBICAO_ESCOPOS = ['regional', 'barra', 'curicica', 'gardenia', 'oeste', 'recreio', 'taquara'];

// Uma cor por divisao, na mesma ordem de ORDEM_EXIBICAO_ESCOPOS - usada tanto
// no emoji ao lado do nome (tabela) quanto na opcao 'colors' do grafico de
// linha, pra bolinha da tabela bater exatamente com a cor da linha no
// grafico. Sem isso o grafico usa a paleta padrao do Google e ninguem
// consegue saber qual linha e qual divisao.
var CORES_DIVISOES = {
  regional: { hex: '#4a86e8', emoji: '🔵' },
  barra: { hex: '#ea4335', emoji: '🔴' },
  curicica: { hex: '#fbbc04', emoji: '🟡' },
  gardenia: { hex: '#34a853', emoji: '🟢' },
  oeste: { hex: '#ff9900', emoji: '🟠' },
  recreio: { hex: '#9900cc', emoji: '🟣' },
  taquara: { hex: '#8d6e63', emoji: '🟤' }
};

// Verde/amarelo/vermelho, no mesmo tom pastel que o Google Sheets ja usa em
// formatacao condicional (legivel com texto preto por cima). null quando
// nao ha percentual - a celula fica sem cor.
function corSemaforo(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 75) return '#b6d7a8';
  if (pct >= 50) return '#ffe599';
  return '#ea9999';
}

// So chamada de dentro do Regional (via o botao "Gerar relatorio na
// planilha", que so aparece la). So o resumo - % de cada divisao e o total
// regional junto, desde sempre (sem janela de tempo - o motor
// calcularEstatisticasPorEscopo aceita data de corte, so nao esta sendo
// usado aqui por enquanto; e facil religar se um dia quiser de volta).
// 4 colunas lado a lado - 1, 3, 6 e 12 meses (sem "desde sempre" aqui, so
// essas 4 janelas mesmo).
var JANELAS_REGIONAL = [
  { meses: 1, titulo: '1 MÊS' },
  { meses: 3, titulo: '3 MESES' },
  { meses: 6, titulo: '6 MESES' },
  { meses: 12, titulo: '12 MESES' }
];

function atualizarAbaRegional() {
  var s = planilha().getSheetByName(ABA_REGIONAL);
  if (!s) s = planilha().insertSheet(ABA_REGIONAL);
  s.clear();

  var porJanela = calcularEstatisticasVariasJanelas(JANELAS_REGIONAL.map(function (j) { return j.meses; }));
  var numColunas = JANELAS_REGIONAL.length + 1;

  // Numero cru (nao texto "78%") pra celula virar numero de verdade na
  // planilha - precisa disso tanto pro grafico de barras quanto pra deixar
  // a planilha ordenavel/somavel por quem for mexer nela. A formatacao
  // '0"%"' (abaixo, via setNumberFormat) cuida de mostrar o sinal de % sem
  // dividir o valor por 100, que e o que o formato de porcentagem nativo
  // do Sheets faria.
  function pctValor(v) { return (v === null || v === undefined) ? '' : v; }
  function porChave(estat, chave) {
    for (var i = 0; i < estat.divisoes.length; i++) if (estat.divisoes[i].chave === chave) return estat.divisoes[i];
    return null;
  }
  function totalDe(estat) {
    var conv = 0, conf = 0;
    estat.divisoes.forEach(function (d) { conv += d.convites; conf += d.confirmacoes; });
    return conv ? Math.round((conf / conv) * 100) : null;
  }
  function colunasVazias(n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return a; }
  function linhaVazia() { return colunasVazias(numColunas); }
  function coresVazias(n) { var a = []; for (var i = 0; i < n; i++) a.push(null); return a; }

  var linhasSaida = [];
  var coresSaida = [];
  var formatos = [];

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'titulo' });
  linhasSaida.push(['REGIONAL RJ4 — RESUMO DE PRESENÇA'].concat(colunasVazias(numColunas - 1)));
  coresSaida.push(coresVazias(numColunas));
  formatos.push({ linha: linhasSaida.length + 1, tipo: 'detalhe' });
  linhasSaida.push(['Gerado em ' + agora()].concat(colunasVazias(numColunas - 1)));
  coresSaida.push(coresVazias(numColunas));
  linhasSaida.push(linhaVazia());
  coresSaida.push(coresVazias(numColunas));

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'cabecalho' });
  linhasSaida.push([''].concat(JANELAS_REGIONAL.map(function (j) { return j.titulo; })));
  coresSaida.push(coresVazias(numColunas));

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'total' });
  var pctsTotal = JANELAS_REGIONAL.map(function (j) { return totalDe(porJanela[j.meses]); });
  linhasSaida.push(['🏆 RANK TOTAL REGIONAL'].concat(pctsTotal.map(pctValor)));
  coresSaida.push([null].concat(pctsTotal.map(corSemaforo)));
  linhasSaida.push(linhaVazia());
  coresSaida.push(coresVazias(numColunas));

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
  linhasSaida.push(['% DE EFETIVO POR DIVISÃO'].concat(colunasVazias(numColunas - 1)));
  coresSaida.push(coresVazias(numColunas));

  // Cabecalho repetido, colado direto acima das divisoes (o de cima, junto
  // com o total, fica longe demais pra servir de fonte do grafico - um
  // range de grafico precisa ser continuo).
  formatos.push({ linha: linhasSaida.length + 1, tipo: 'cabecalho' });
  linhasSaida.push([''].concat(JANELAS_REGIONAL.map(function (j) { return j.titulo; })));
  coresSaida.push(coresVazias(numColunas));
  var linhaCabecalhoDivisoes = formatos[formatos.length - 1].linha;

  var linhaInicioDivisoes = linhasSaida.length + 1;
  ORDEM_EXIBICAO_ESCOPOS.forEach(function (chave) {
    var linha = [CORES_DIVISOES[chave].emoji + ' ' + ESCOPOS_NOME[chave]];
    var cores = [null];
    JANELAS_REGIONAL.forEach(function (j) {
      var e = porChave(porJanela[j.meses], chave);
      var pct = e && e.percentual;
      linha.push(pctValor(pct));
      cores.push(corSemaforo(pct));
    });
    linhasSaida.push(linha);
    coresSaida.push(cores);
  });
  var linhaFimDivisoes = linhasSaida.length;

  s.getRange(1, 1, linhasSaida.length, numColunas).setValues(linhasSaida);
  s.getRange(1, 1, coresSaida.length, numColunas).setBackgrounds(coresSaida);

  formatos.forEach(function (f) {
    var linha = s.getRange(f.linha, 1, 1, numColunas);
    if (f.tipo === 'titulo') linha.setFontWeight('bold').setFontSize(14);
    if (f.tipo === 'detalhe') linha.setFontColor('#888888').setFontStyle('italic');
    if (f.tipo === 'cabecalho') linha.setFontWeight('bold').setFontColor('#666666').setFontSize(10);
    if (f.tipo === 'total') linha.setFontWeight('bold').setFontSize(13);
    if (f.tipo === 'secao') linha.setFontWeight('bold').setFontColor('#666666');
  });

  // Celulas numericas de verdade (ver pctValor acima) com formato custom -
  // mostra "78%" sem dividir o valor por 100, que e o que o formato de
  // porcentagem nativo do Sheets faria com um numero ja de 0 a 100.
  s.getRange(formatos[3].linha, 2, 1, numColunas - 1).setNumberFormat('0"%"');
  s.getRange(linhaInicioDivisoes, 2, linhaFimDivisoes - linhaInicioDivisoes + 1, numColunas - 1).setNumberFormat('0"%"');

  s.setColumnWidth(1, 220);
  for (var c = 2; c <= numColunas; c++) s.setColumnWidth(c, 80);

  // Grafico de linha, uma cor por divisao, eixo X com as janelas de tempo -
  // mostra se cada divisao esta subindo ou descendo. O range (cabecalho +
  // divisoes, agora colados um no outro) tem divisao nas linhas e janela nas
  // colunas; setTransposeRowsAndColumns vira isso de cabeca pra baixo pro
  // grafico, fazendo a janela virar o eixo X e cada linha (divisao) virar
  // uma serie/cor, com o nome dela puxado da coluna A como legenda.
  s.getCharts().forEach(function (c) { s.removeChart(c); });
  var rangeGrafico = s.getRange(linhaCabecalhoDivisoes, 1, linhaFimDivisoes - linhaCabecalhoDivisoes + 1, numColunas);
  var grafico = s.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(rangeGrafico)
    .setTransposeRowsAndColumns(true)
    .setPosition(linhaFimDivisoes + 2, 1, 0, 0)
    .setOption('title', 'Tendência de efetivo por divisão')
    .setOption('legend', { position: 'right' })
    .setOption('hAxis', { title: '' })
    .setOption('vAxis', { title: '%', minValue: 0, maxValue: 100 })
    .setOption('colors', ORDEM_EXIBICAO_ESCOPOS.map(function (chave) { return CORES_DIVISOES[chave].hex; }))
    .setOption('pointSize', 6)
    .setOption('curveType', 'function')
    .setOption('width', 760)
    .setOption('height', 380)
    .build();
  s.insertChart(grafico);
}

// Uma aba por divisao (nao inclui Regional - a dela e so o resumo, acima).
// Topo: cada integrante e a % dele, desde sempre. Embaixo: cada evento
// daquela divisao e a % de presenca dele, com o nome em vermelho se o
// evento ja encerrou e em verde se ainda esta ativo.
var CHAVES_DIVISOES_DETALHE = ['barra', 'oeste', 'recreio', 'curicica', 'taquara', 'gardenia'];

// Emoji por status, so para a secao FICHAS (historico) - mesmo mapa do
// STATUS no index.html (STATUS.chave.emoji), so que aqui.
var STATUS_EMOJI = {
  aguardando: '⚠️', confirmado: '✅', familia: '❌', trabalho: '❌',
  justificada: '❌', infracional: '⭕'
};

function atualizarAbasDivisoes() {
  var estat = calcularEstatisticasPorEscopo(null);

  var todosEventos = lerEventos();
  var eventoPorId = {};
  var eventosPorCategoria = {};
  todosEventos.forEach(function (ev) {
    var cat = ev.categoria || 'barra';
    eventoPorId[ev.id] = ev;
    (eventosPorCategoria[cat] = eventosPorCategoria[cat] || []).push(ev);
  });

  // Uma leitura so da aba Presencas, reaproveitada pelas 6 divisoes - tanto
  // pro contador por evento (EVENTOS) quanto pro historico por pessoa
  // (FICHAS, ver abaixo).
  var presencasPorEvento = {};
  var presencasPorMembro = {};
  linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS)).forEach(function (l) {
    if (!l[0] || !l[2]) return;
    var eid = String(l[0]);
    var mid = String(l[2]);
    if (!presencasPorEvento[eid]) presencasPorEvento[eid] = { confirmados: 0, total: 0 };
    presencasPorEvento[eid].total++;
    var status = statusParaChave(l[4]);
    if (status === 'confirmado') presencasPorEvento[eid].confirmados++;
    (presencasPorMembro[mid] = presencasPorMembro[mid] || []).push({ eventoId: eid, status: status });
  });

  CHAVES_DIVISOES_DETALHE.forEach(function (chave) {
    var nomeAba = ESCOPOS_NOME[chave];
    var s = planilha().getSheetByName(nomeAba);
    if (!s) s = planilha().insertSheet(nomeAba);
    s.clear();

    var linhasSaida = [];
    var coresSaida = [];
    var formatos = [];

    formatos.push({ linha: linhasSaida.length + 1, tipo: 'titulo' });
    linhasSaida.push([nomeAba.toUpperCase(), '']);
    coresSaida.push([null, null]);
    formatos.push({ linha: linhasSaida.length + 1, tipo: 'detalhe' });
    linhasSaida.push(['Gerado em ' + agora(), '']);
    coresSaida.push([null, null]);
    linhasSaida.push(['', '']);
    coresSaida.push([null, null]);

    formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
    linhasSaida.push(['INTEGRANTES', '']);
    coresSaida.push([null, null]);
    var membrosDaDivisao = estat.membros
      .filter(function (m) { return m.divisao === nomeAba; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    if (!membrosDaDivisao.length) {
      linhasSaida.push(['(nenhum membro cadastrado)', '']);
      coresSaida.push([null, null]);
    } else {
      membrosDaDivisao.forEach(function (m) {
        linhasSaida.push([m.nome, m.percentual === null ? '-' : m.percentual + '%']);
        coresSaida.push([null, corSemaforo(m.percentual)]);
      });
    }

    linhasSaida.push(['', '']);
    coresSaida.push([null, null]);
    formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
    linhasSaida.push(['EVENTOS', '']);
    coresSaida.push([null, null]);

    var eventosDaDivisao = (eventosPorCategoria[chave] || []).slice()
      .sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });

    if (!eventosDaDivisao.length) {
      linhasSaida.push(['(nenhum evento criado)', '']);
      coresSaida.push([null, null]);
    } else {
      eventosDaDivisao.forEach(function (ev) {
        var c = presencasPorEvento[ev.id] || { confirmados: 0, total: 0 };
        var pct = c.total ? Math.round((c.confirmados / c.total) * 100) : 0;
        formatos.push({ linha: linhasSaida.length + 1, tipo: ev.status === 'encerrado' ? 'eventoEncerrado' : 'eventoAtivo' });
        linhasSaida.push([ev.nome, pct + '%']);
        // Aqui a % fica na cor padrao de proposito - o nome do evento ja usa
        // vermelho/verde pra status (encerrado/ativo), colorir a celula da %
        // tambem ia virar duas informacoes competindo no mesmo lugar.
        coresSaida.push([null, null]);
      });
    }

    // Espelho da "Ficha do membro" do app: por integrante, o historico
    // evento a evento (so os eventos desta divisao - um evento regional que
    // o integrante tambem participou fica de fora daqui, ja que a % do topo
    // desta aba tambem so conta os proprios eventos da divisao).
    linhasSaida.push(['', '']);
    coresSaida.push([null, null]);
    formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
    linhasSaida.push(['FICHAS (histórico por integrante)', '']);
    coresSaida.push([null, null]);

    if (!membrosDaDivisao.length) {
      linhasSaida.push(['(nenhum membro cadastrado)', '']);
      coresSaida.push([null, null]);
    } else {
      membrosDaDivisao.forEach(function (m) {
        formatos.push({ linha: linhasSaida.length + 1, tipo: 'fichaNome' });
        linhasSaida.push([m.nome, m.percentual === null ? '-' : m.percentual + '%']);
        coresSaida.push([null, corSemaforo(m.percentual)]);

        var historico = (presencasPorMembro[m.id] || [])
          .filter(function (p) { var ev = eventoPorId[p.eventoId]; return ev && (ev.categoria || 'barra') === chave; })
          .map(function (p) { return { ev: eventoPorId[p.eventoId], status: p.status }; })
          .sort(function (a, b) { return (b.ev.data || '').localeCompare(a.ev.data || ''); });

        if (!historico.length) {
          linhasSaida.push(['   (sem eventos)', '']);
          coresSaida.push([null, null]);
        } else {
          historico.forEach(function (h) {
            var rotuloData = h.ev.data ? formatarDataBR(h.ev.data) + ' - ' : '';
            formatos.push({ linha: linhasSaida.length + 1, tipo: 'fichaEvento' });
            linhasSaida.push(['   ' + rotuloData + (h.ev.tipo || h.ev.nome),
                              (STATUS_EMOJI[h.status] || '') + ' ' + (STATUS_ROTULO[h.status] || h.status)]);
            coresSaida.push([null, null]);
          });
        }
      });
    }

    s.getRange(1, 1, linhasSaida.length, 2).setValues(linhasSaida);
    s.getRange(1, 1, coresSaida.length, 2).setBackgrounds(coresSaida);
    formatos.forEach(function (f) {
      if (f.tipo === 'titulo') s.getRange(f.linha, 1, 1, 2).setFontWeight('bold').setFontSize(14);
      if (f.tipo === 'detalhe') s.getRange(f.linha, 1, 1, 2).setFontColor('#888888').setFontStyle('italic');
      if (f.tipo === 'secao') s.getRange(f.linha, 1, 1, 2).setFontWeight('bold').setFontColor('#666666');
      // So o nome do evento fica colorido - a % ao lado continua na cor padrao.
      if (f.tipo === 'eventoEncerrado') s.getRange(f.linha, 1).setFontColor('#c0392b');
      if (f.tipo === 'eventoAtivo') s.getRange(f.linha, 1).setFontColor('#1a7a3c');
      if (f.tipo === 'fichaNome') s.getRange(f.linha, 1, 1, 2).setFontWeight('bold');
      if (f.tipo === 'fichaEvento') s.getRange(f.linha, 1, 1, 2).setFontColor('#555555').setFontSize(10);
    });

    s.setColumnWidth(1, 260);
    s.setColumnWidth(2, 130);
  });
}

// ---------- CALENDARIO ----------
// Espelho na planilha da tela "Calendario" do app: uma grade por mes, igual
// a um calendario de parede, com o(s) evento(s) marcados em cada dia. So
// existe em forma de lista antes disso (aba Eventos crua) - sem visao
// nenhuma de "olhar o mes inteiro de uma vez" pra quem prefere a planilha
// ao app.
var DIAS_SEMANA_CALENDARIO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var NOMES_MESES_CALENDARIO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var EMOJI_TIPO_EVENTO_CALENDARIO = { 'Pub': '🍻', 'Bate e Volta': '🏍️', 'Ação Social': '🏥', 'Reunião': '📊' };

// Mistura uma cor com branco - fundo de celula do dia (a cor "crua" da
// divisao, igual usada no grafico da aba Regional RJ4, e forte demais pra
// ler texto preto em cima).
function tomClaro(hex, fator) {
  var h = hex.replace('#', '');
  var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  function misturar(c) { return Math.round(c + (255 - c) * fator); }
  function paraHex(c) { var s = misturar(c).toString(16); return s.length === 1 ? '0' + s : s; }
  return '#' + paraHex(r) + paraHex(g) + paraHex(b);
}

// O resto do arquivo evita sintaxe ES6 (Array.fill, arrow function, etc) de
// proposito - mais seguro assumir o motor antigo do Apps Script (Rhino) em
// vez do V8, entao mante-se ES5 aqui tambem.
function arrayRepetido(n, valor) {
  var a = [];
  for (var i = 0; i < n; i++) a.push(valor);
  return a;
}

function atualizarAbaCalendario() {
  var s = planilha().getSheetByName(ABA_CALENDARIO);
  if (!s) s = planilha().insertSheet(ABA_CALENDARIO);
  s.clear();

  var eventos = lerEventos().filter(function (ev) { return /^\d{4}-\d{2}-\d{2}$/.test(ev.data); });

  var porMes = {}; // 'yyyy-MM' -> eventos daquele mes
  eventos.forEach(function (ev) {
    var chave = ev.data.substring(0, 7);
    (porMes[chave] = porMes[chave] || []).push(ev);
  });
  // O mes atual sempre aparece, mesmo sem nenhum evento marcado ainda - pra
  // quem abre a planilha ver "estamos aqui" no calendario.
  var chaveHoje = Utilities.formatDate(new Date(), fuso(), 'yyyy-MM');
  if (!porMes[chaveHoje]) porMes[chaveHoje] = [];
  var mesesChaves = Object.keys(porMes).sort();

  var linhaAtual = 1;
  mesesChaves.forEach(function (chaveMes) {
    var partes = chaveMes.split('-');
    var ano = Number(partes[0]), mes = Number(partes[1]); // mes: 1-12

    s.getRange(linhaAtual, 1, 1, 7).merge()
      .setValue(NOMES_MESES_CALENDARIO[mes - 1].toUpperCase() + ' DE ' + ano)
      .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center')
      .setBackground(chaveMes === chaveHoje ? '#333333' : '#666666').setFontColor('#ffffff');
    linhaAtual++;

    s.getRange(linhaAtual, 1, 1, 7).setValues([DIAS_SEMANA_CALENDARIO])
      .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#eeeeee');
    linhaAtual++;

    var eventosPorDia = {};
    porMes[chaveMes].forEach(function (ev) {
      var dia = Number(ev.data.substring(8, 10));
      (eventosPorDia[dia] = eventosPorDia[dia] || []).push(ev);
    });

    var primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay(); // 0 = domingo
    var totalDias = new Date(ano, mes, 0).getDate(); // dia 0 do proximo mes = ultimo dia deste

    var linhasGrid = [];
    var coresGrid = [];
    var linhaSemana = arrayRepetido(7, '');
    var corSemana = arrayRepetido(7, '#ffffff');
    for (var i = 0; i < primeiroDiaSemana; i++) corSemana[i] = '#f5f5f5';

    var pos = primeiroDiaSemana;
    for (var dia = 1; dia <= totalDias; dia++) {
      var evsDoDia = eventosPorDia[dia] || [];
      var texto = String(dia);
      if (evsDoDia.length) {
        texto += '\n' + evsDoDia.map(function (ev) {
          var corDiv = CORES_DIVISOES[ev.categoria];
          return (EMOJI_TIPO_EVENTO_CALENDARIO[ev.tipo] || '📌') + ' ' + (ev.tipo || ev.nome) +
                 (corDiv ? ' ' + corDiv.emoji : '');
        }).join('\n');
      }
      linhaSemana[pos] = texto;
      corSemana[pos] = evsDoDia.length
        ? tomClaro((CORES_DIVISOES[evsDoDia[0].categoria] || { hex: '#999999' }).hex, 0.65)
        : '#ffffff';
      pos++;
      if (pos === 7 || dia === totalDias) {
        if (dia === totalDias) for (var f = pos; f < 7; f++) corSemana[f] = '#f5f5f5';
        linhasGrid.push(linhaSemana);
        coresGrid.push(corSemana);
        linhaSemana = arrayRepetido(7, '');
        corSemana = arrayRepetido(7, '#ffffff');
        pos = 0;
      }
    }

    s.getRange(linhaAtual, 1, linhasGrid.length, 7).setValues(linhasGrid)
      .setVerticalAlignment('top').setWrap(true).setFontSize(9);
    s.getRange(linhaAtual, 1, coresGrid.length, 7).setBackgrounds(coresGrid);
    for (var w = 0; w < linhasGrid.length; w++) s.setRowHeight(linhaAtual + w, 58);
    linhaAtual += linhasGrid.length + 1; // +1 = linha em branco antes do proximo mes
  });

  for (var c = 1; c <= 7; c++) s.setColumnWidth(c, 130);
}

var COR_ABA_REGIONAL = '#f1c232';
var COR_ABA_DIVISAO = '#4a86e8';
var COR_ABA_ESPELHO = '#cc0000';

// Reordena as abas (Calendario e Regional primeiro, depois divisoes em
// ordem alfabetica, depois os dados brutos) e colore as abas de resumo, pra
// quem abre a planilha direto achar as coisas sem precisar catar aba por
// aba.
function organizarAbas() {
  var ss = planilha();
  var ordem = [ABA_CALENDARIO].concat(ORDEM_EXIBICAO_ESCOPOS.map(function (chave) { return ESCOPOS_NOME[chave]; }))
    .concat([ABA_INSIGHT_RESUMO, 'Relatorio', 'Membros', 'Eventos', 'Presencas',
             ABA_INSIGHT_RODADAS, ABA_INSIGHT_PRESENCAS, ABA_INSIGHT_EXCLUIDOS, 'KV']);
  ordem.forEach(function (nome, i) {
    var s = ss.getSheetByName(nome);
    if (!s) return;
    ss.setActiveSheet(s);
    ss.moveActiveSheet(i + 1);
  });
  [ABA_CALENDARIO, ABA_INSIGHT_RESUMO].forEach(function (nome) {
    var s = ss.getSheetByName(nome);
    if (s) s.setTabColor(COR_ABA_ESPELHO);
  });
  CHAVES_DIVISOES_DETALHE.concat(['regional']).forEach(function (chave) {
    var s = ss.getSheetByName(ESCOPOS_NOME[chave]);
    if (!s) return;
    s.setTabColor(chave === 'regional' ? COR_ABA_REGIONAL : COR_ABA_DIVISAO);
  });
}

// A planilha devolve Date quando a celula esta formatada como data; o app
// espera sempre o texto ISO.
// O instanceof falha aqui: as datas vem do servico de planilhas, de outro
// contexto de execucao, entao a checagem e pelo formato do objeto.
function ehData(v) {
  return v && Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function formatarData(v) {
  if (ehData(v)) return Utilities.formatDate(v, fuso(), 'yyyy-MM-dd');
  return String(v || '');
}

function formatarHorario(v) {
  if (ehData(v)) return Utilities.formatDate(v, fuso(), 'HH:mm');
  return String(v || '');
}

function fuso() { return planilha().getSpreadsheetTimeZone() || 'America/Sao_Paulo'; }

function agora() {
  return Utilities.formatDate(new Date(), fuso(), 'dd/MM/yyyy HH:mm');
}

// ---------- ESCRITA ----------

function salvarPresenca(p) {
  if (!p.eventoId || !p.membroId) throw new Error('Faltou evento ou membro');
  var s = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  var achado = acharLinha(s, function (l) {
    return String(l[0]) === String(p.eventoId) && String(l[2]) === String(p.membroId);
  });

  var nomeEvento = nomeDe(ABA_EVENTOS, CAB_EVENTOS, p.eventoId);
  var nomeMembro = nomeDe(ABA_MEMBROS, CAB_MEMBROS, p.membroId);
  var linha = [
    p.eventoId, nomeEvento, p.membroId, nomeMembro,
    STATUS_ROTULO[p.status] || STATUS_ROTULO.aguardando,
    simNao(ehVerdadeiro(p.direto)),
    simNao(ehVerdadeiro(p.destacado)),
    simNao(ehVerdadeiro(p.acompanhado)),
    agora()
  ];

  if (achado) s.getRange(achado.indice, 1, 1, linha.length).setValues([linha]);
  else s.appendRow(linha);
  return { ok: true };
}

// Os parametros chegam como texto quando vem pela URL.
function ehVerdadeiro(v) {
  return v === true || v === 'true' || v === 'Sim' || v === 1 || v === '1';
}

function nomeDe(nomeAba, cabecalho, id) {
  var achado = acharLinha(aba(nomeAba, cabecalho), function (l) { return String(l[0]) === String(id); });
  return achado ? String(achado.valores[1]) : '';
}

function salvarMembro(p) {
  if (!p.nome) throw new Error('Faltou o nome');
  var s = aba(ABA_MEMBROS, CAB_MEMBROS);
  var id = p.id || novoId();
  var linha = [id, p.nome, p.grau || '', p.divisao || '', p.funcoes || ''];
  var achado = acharLinha(s, function (l) { return String(l[0]) === String(id); });
  if (achado) s.getRange(achado.indice, 1, 1, linha.length).setValues([linha]);
  else s.appendRow(linha);
  renomearEmPresencas(2, id, p.nome);
  return { ok: true, id: id };
}

function removerMembro(id) {
  apagarLinhas(aba(ABA_MEMBROS, CAB_MEMBROS), function (l) { return String(l[0]) === String(id); });
  apagarLinhas(aba(ABA_PRESENCAS, CAB_PRESENCAS), function (l) { return String(l[2]) === String(id); });
  return { ok: true };
}

function salvarEvento(p) {
  if (!p.nome) throw new Error('Faltou o nome do evento');
  var s = aba(ABA_EVENTOS, CAB_EVENTOS);
  var id = p.id || novoId();
  var achado = acharLinha(s, function (l) { return String(l[0]) === String(id); });
  var criadoEm = achado ? achado.valores[7] : agora();
  var categoria = String(p.categoria || 'barra');
  // So criarEventoDeTexto manda textoOriginal - o formulario manual do Modo
  // organizador (eventoSalvar) nao manda esse campo nenhuma vez, entao sem
  // esse fallback pro valor ja gravado, editar um evento por ali (ou so
  // encerrar/reabrir, que tambem passa por aqui) apagaria o texto original
  // guardado numa correcao anterior.
  var textoOriginal = p.textoOriginal !== undefined ? p.textoOriginal : (achado ? achado.valores[10] : '');
  var linha = [id, p.nome, p.data || '', p.horario || '', p.endereco || '',
               p.outros || '', p.status || 'ativo', criadoEm, categoria, p.tipo || '', textoOriginal || ''];
  if (achado) s.getRange(achado.indice, 1, 1, linha.length).setValues([linha]);
  else s.appendRow(linha);
  renomearEmPresencas(0, id, p.nome);
  if (p.membroIds !== undefined) ajustarParticipantes(id, p.nome, listaDe(p.membroIds));
  // Nao responder a convocacao e falta igual a uma falta sem justificativa
  // (decisao do clube) - so faz sentido continuar "Aguardando" enquanto o
  // evento ainda esta aberto, ja que a pessoa ainda pode responder. Ao
  // encerrar (aqui ou nascendo ja encerrado, via criarEventoDeTexto), quem
  // sobrou em "Aguardando" vira "Infracional" de vez na planilha. Rodar de
  // novo com o evento ja encerrado e inofensivo (nao sobra mais ninguem
  // "Aguardando" pra converter).
  if ((p.status || 'ativo') === 'encerrado') converterAguardandoParaInfracionalAoEncerrar(id);
  return { ok: true, id: id };
}

function converterAguardandoParaInfracionalAoEncerrar(eventoId) {
  var s = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  var dados = linhas(s);
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][0]) === String(eventoId) && String(dados[i][4]) === STATUS_ROTULO.aguardando) {
      s.getRange(i + 2, 5).setValue(STATUS_ROTULO.infracional);
      s.getRange(i + 2, 9).setValue(agora());
    }
  }
}

// Rodar UMA VEZ pelo editor do Apps Script, so se quiser corrigir na
// planilha os eventos que ja estavam encerrados ANTES dessa regra existir
// (o app ja trata isso na tela mesmo sem rodar isso - ver computeCounts/
// getReportGroups no index.html - mas a planilha em si so muda se rodar
// isto). Varre todo evento ja encerrado e converte quem ficou "Aguardando".
function migrarAguardandoDeEventosJaEncerrados() {
  var idsEncerrados = {};
  linhas(aba(ABA_EVENTOS, CAB_EVENTOS)).forEach(function (l) {
    if (l[0] && String(l[6]) === 'encerrado') idsEncerrados[String(l[0])] = true;
  });
  var s = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  var dados = linhas(s);
  var convertidos = 0;
  for (var i = 0; i < dados.length; i++) {
    if (idsEncerrados[String(dados[i][0])] && String(dados[i][4]) === STATUS_ROTULO.aguardando) {
      s.getRange(i + 2, 5).setValue(STATUS_ROTULO.infracional);
      s.getRange(i + 2, 9).setValue(agora());
      convertidos++;
    }
  }
  return 'Convertidos ' + convertidos + ' registros de Aguardando para Infracional.';
}

function removerEvento(id) {
  apagarLinhas(aba(ABA_EVENTOS, CAB_EVENTOS), function (l) { return String(l[0]) === String(id); });
  apagarLinhas(aba(ABA_PRESENCAS, CAB_PRESENCAS), function (l) { return String(l[0]) === String(id); });
  return { ok: true };
}

function listaDe(v) {
  if (Array.isArray(v)) return v.map(String);
  if (!v) return [];
  return String(v).split(',').filter(function (x) { return x; });
}

// Cada participante ganha uma linha em Presencas assim que entra no evento,
// para o organizador ver a lista completa antes de qualquer confirmacao.
function ajustarParticipantes(eventoId, nomeEvento, membroIds) {
  var s = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  var atuais = {};
  linhas(s).forEach(function (l) {
    if (String(l[0]) === String(eventoId)) atuais[String(l[2])] = true;
  });

  // Uma escrita so para todos os participantes novos, em vez de uma
  // appendRow por pessoa. Com eventos regionais grandes (dezenas de
  // membros), gravar um por um era lento o bastante pra: (1) estourar o
  // tempo limite no navegador, e (2) deixar uma janela longa em que uma
  // leitura concorrente (ex.: apos aquele timeout, o app tenta recarregar
  // sozinho) pegava a planilha no meio da escrita e via uma lista parcial.
  var linhasNovas = [];
  membroIds.forEach(function (mid) {
    if (atuais[mid]) return;
    linhasNovas.push([eventoId, nomeEvento, mid, nomeDe(ABA_MEMBROS, CAB_MEMBROS, mid),
                       STATUS_ROTULO.aguardando, 'Nao', 'Nao', 'Nao', agora()]);
  });
  if (linhasNovas.length) {
    var proximaLinha = s.getLastRow() + 1;
    s.getRange(proximaLinha, 1, linhasNovas.length, linhasNovas[0].length).setValues(linhasNovas);
  }

  var mantidos = {};
  membroIds.forEach(function (m) { mantidos[m] = true; });
  apagarLinhas(s, function (l) {
    return String(l[0]) === String(eventoId) && !mantidos[String(l[2])];
  });
}

// Igual a ajustarParticipantes, mas usada pela importacao de convocacao
// colada (criarEventoDeTexto): cada participante ja entra com o status e as
// flags que o parser leu do texto, em vez de sempre "Aguardando". membros e
// uma lista de { id, status, direto, destacado, acompanhado }.
//
// Tambem e o caminho usado pra CORRIGIR uma convocacao ja enviada (colar de
// novo por cima do mesmo evento, ver acao "corrigir-convocacao" no
// index.html) - por isso, diferente de uma versao anterior desta funcao, um
// membro que ja tem linha aqui tem o status/flags regravados quando o texto
// colado de novo traz algo diferente, em vez de so ser ignorado (que deixaria
// a correcao sem efeito nenhum pra quem ja estava na lista original).
function ajustarParticipantesComStatus(eventoId, nomeEvento, membros) {
  var s = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  var linhaPorMembro = {};
  linhas(s).forEach(function (l, i) {
    if (String(l[0]) === String(eventoId) && l[2]) linhaPorMembro[String(l[2])] = { indice: i + 2, valores: l };
  });

  var linhasNovas = [];
  membros.forEach(function (m) {
    var statusRotulo = STATUS_ROTULO[m.status] || STATUS_ROTULO.aguardando;
    var direto = simNao(ehVerdadeiro(m.direto));
    var destacado = simNao(ehVerdadeiro(m.destacado));
    var acompanhado = simNao(ehVerdadeiro(m.acompanhado));
    var existente = linhaPorMembro[m.id];
    if (!existente) {
      linhasNovas.push([eventoId, nomeEvento, m.id, nomeDe(ABA_MEMBROS, CAB_MEMBROS, m.id),
                         statusRotulo, direto, destacado, acompanhado, agora()]);
      return;
    }
    // So regrava se algo de fato mudou - uma correcao normalmente acerta
    // 1 ou 2 pessoas, nao a lista inteira, entao a maioria cai aqui sem
    // gerar escrita nenhuma.
    var v = existente.valores;
    var mudou = statusRotulo !== v[4] || direto !== v[5] || destacado !== v[6] || acompanhado !== v[7];
    if (mudou) {
      s.getRange(existente.indice, 1, 1, 9).setValues([[
        eventoId, nomeEvento, m.id, nomeDe(ABA_MEMBROS, CAB_MEMBROS, m.id),
        statusRotulo, direto, destacado, acompanhado, agora()
      ]]);
    }
  });
  if (linhasNovas.length) {
    var proximaLinha = s.getLastRow() + 1;
    s.getRange(proximaLinha, 1, linhasNovas.length, linhasNovas[0].length).setValues(linhasNovas);
  }

  var mantidos = {};
  membros.forEach(function (m) { mantidos[m.id] = true; });
  apagarLinhas(s, function (l) {
    return String(l[0]) === String(eventoId) && !mantidos[String(l[2])];
  });
}

// Acao unica usada pela tela "Relatorios" (colar convocacao): cria o evento
// e ja grava todas as presencas com o status lido do texto, numa unica
// trava/round-trip - se isso fosse feito como salvarEvento + N chamadas de
// presenca (uma por membro), uma falha de rede no meio deixaria o evento
// criado com so parte das presencas gravadas, sem meio de tentar de novo so
// o que faltou.
function criarEventoDeTexto(p) {
  if (!p.nome) throw new Error('Faltou o nome do evento');
  // Chega pelo doPost (corpo JSON de verdade, ver apiPost no index.html), nao
  // pela URL como as outras acoes - entao p.membros ja e um array, sem
  // precisar de parseOuVazio (que e para quando o dado vem como string).
  var membros = Array.isArray(p.membros) ? p.membros : parseOuVazio(p.membros, []);
  var eventoResp = salvarEvento({
    id: p.id, nome: p.nome, data: p.data, horario: p.horario,
    endereco: p.endereco, outros: p.outros, status: p.status, categoria: p.categoria, tipo: p.tipo,
    textoOriginal: p.textoOriginal
  });
  ajustarParticipantesComStatus(eventoResp.id, p.nome, membros);
  // salvarEvento ja tenta essa conversao, mas roda ANTES das linhas de
  // presenca existirem (evento novo) - se o evento nasce ja encerrado
  // (convocacao de algo que ja aconteceu) e o texto colado trouxe alguem
  // como "Aguardando" (raro - o parser ja usa Infracional como padrao pra
  // quem nao respondeu, ver statusDoResto), varre de novo agora que as
  // linhas existem.
  if ((p.status || 'ativo') === 'encerrado') converterAguardandoParaInfracionalAoEncerrar(eventoResp.id);
  return { ok: true, id: eventoResp.id };
}

// Cria varios eventos de uma vez, um por dia marcado na tela "Organizar" do
// Calendario (index.html) - chega por apiPost (corpo JSON de verdade),
// entao p.eventos ja e um array de { data, tipo } e p.membroIds ja e um
// array de ids, sem precisar de parseOuVazio. Todos os eventos criados
// aqui usam a mesma categoria e os mesmos convidados (a lista de membros
// elegiveis daquele escopo, calculada no index.html) - nascem sempre
// "ativo" (o calendario e pra marcar coisa futura, nao pra registrar
// presenca retroativa). O nome de cada evento e o proprio tipo (ex: "Pub"),
// ja que o texto colado so traz data+tipo, sem um nome proprio.
function criarEventosDeCalendario(p) {
  var eventos = Array.isArray(p.eventos) ? p.eventos : parseOuVazio(p.eventos, []);
  if (!eventos.length) throw new Error('Nenhum evento para criar');
  var categoria = String(p.categoria || 'barra');
  var membroIds = Array.isArray(p.membroIds) ? p.membroIds.map(String) : listaDe(p.membroIds);

  var criados = eventos.map(function (e) {
    var nome = String(e.tipo || 'Evento');
    var resp = salvarEvento({
      nome: nome, data: String(e.data || ''), categoria: categoria,
      tipo: String(e.tipo || ''), status: 'ativo'
    });
    ajustarParticipantes(resp.id, nome, membroIds);
    return { id: resp.id, data: e.data, tipo: e.tipo };
  });
  return { ok: true, criados: criados };
}

function renomearEmPresencas(coluna, id, nome) {
  var s = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  var dados = linhas(s);
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][coluna]) === String(id)) {
      s.getRange(i + 2, coluna + 2).setValue(nome);
    }
  }
}

// De tras para frente: apagar de cima muda o indice das linhas seguintes.
function apagarLinhas(s, teste) {
  var dados = linhas(s);
  for (var i = dados.length - 1; i >= 0; i--) {
    if (teste(dados[i])) s.deleteRow(i + 2);
  }
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- RELATORIO ----------

// Visao so de leitura, agrupada por evento e por situacao. E gerada do zero a
// cada alteracao: editar aqui na mao nao tem efeito, os dados vivem na aba
// Presencas.
//
// As 6 chaves de status batem 1 a 1 com as secoes - nenhuma cai no fallback
// "aguardando" por engano (bug corrigido em 13/09/2026: antes so existiam 4
// secoes aqui, entao "justificada" e "infracional" - que nem existiam
// quando isso foi escrito pela primeira vez - eram empurradas pra dentro de
// "MEMBROS NAO CONFIRMADOS", misturando quem so ainda nao respondeu com
// quem ja tem falta registrada de verdade).
var ORDEM_SECOES = [
  { chave: 'confirmado', titulo: 'MEMBROS CONFIRMADOS' },
  { chave: 'aguardando', titulo: 'MEMBROS NAO CONFIRMADOS' },
  { chave: 'familia', titulo: 'FALTA - FAMILIA' },
  { chave: 'trabalho', titulo: 'FALTA - TRABALHO' },
  { chave: 'justificada', titulo: 'FALTA - JUSTIFICADA' },
  { chave: 'infracional', titulo: 'FALTA - INFRACIONAL (inclui quem nao respondeu)' }
];

function atualizarRelatorio() {
  var s = planilha().getSheetByName(ABA_RELATORIO);
  if (!s) s = planilha().insertSheet(ABA_RELATORIO);
  s.clear();

  // Cada aba e lida uma unica vez: consultar por evento ou por membro dentro
  // do laco relia a planilha inteira a cada volta.
  var nomes = {};
  linhas(aba(ABA_MEMBROS, CAB_MEMBROS)).forEach(function (l) {
    if (l[0]) nomes[String(l[0])] = String(l[1] || '');
  });

  var porEvento = {};
  linhas(aba(ABA_PRESENCAS, CAB_PRESENCAS)).forEach(function (l) {
    if (!l[0] || !l[2]) return;
    var eid = String(l[0]);
    if (!porEvento[eid]) porEvento[eid] = [];
    porEvento[eid].push({
      membroId: String(l[2]),
      status: statusParaChave(l[4]),
      direto: ehSim(l[5]),
      destacado: ehSim(l[6]),
      acompanhado: ehSim(l[7])
    });
  });

  var eventos = linhas(aba(ABA_EVENTOS, CAB_EVENTOS))
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      return {
        id: String(l[0]), nome: String(l[1]), data: formatarData(l[2]),
        horario: formatarHorario(l[3]), endereco: String(l[4] || ''),
        status: String(l[6] || 'ativo')
      };
    });

  var linhasSaida = [];
  var formatos = [];   // {linha, tipo} para aplicar negrito e cor depois

  if (!eventos.length) {
    linhasSaida.push(['Nenhum evento cadastrado.', '']);
  }

  eventos.forEach(function (ev, indice) {
    if (indice) { linhasSaida.push(['', '']); linhasSaida.push(['', '']); }

    formatos.push({ linha: linhasSaida.length + 1, tipo: 'evento' });
    linhasSaida.push([ev.nome, ev.status === 'encerrado' ? 'ENCERRADO' : 'ATIVO']);

    var detalhes = [];
    if (ev.data) detalhes.push(formatarDataBR(ev.data));
    if (ev.horario) detalhes.push(ev.horario);
    if (ev.endereco) detalhes.push(ev.endereco);
    if (detalhes.length) {
      formatos.push({ linha: linhasSaida.length + 1, tipo: 'detalhe' });
      linhasSaida.push([detalhes.join('  -  '), '']);
    }

    var porStatus = { confirmado: [], aguardando: [], familia: [], trabalho: [], justificada: [], infracional: [] };
    (porEvento[ev.id] || []).forEach(function (p) {
      var selos = [];
      if (p.direto) selos.push('Direto');
      if (p.destacado) selos.push('Destacado');
      if (p.acompanhado) selos.push('Acompanhado');
      (porStatus[p.status] || porStatus.aguardando)
        .push({ nome: nomes[p.membroId] || p.membroId, selos: selos.join(', ') });
    });
    Object.keys(porStatus).forEach(function (k) {
      porStatus[k].sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    });

    // Cada participante tem uma linha em Presencas (ajustarParticipantes
    // garante isso ao criar/editar o evento), entao contar as linhas equivale
    // a contar os convidados - sem precisar reler a planilha de novo aqui.
    var totalConvidados = (porEvento[ev.id] || []).length;
    var percentualEvento = totalConvidados ? Math.round((porStatus.confirmado.length / totalConvidados) * 100) : 0;
    formatos.push({ linha: linhasSaida.length + 1, tipo: 'percentual' });
    linhasSaida.push([percentualEvento + '% DE PRESENCA (' + porStatus.confirmado.length + ' de ' + totalConvidados + ')', '']);

    // Mesmo resumo de 3 categorias que o app mostra ao salvar a convocacao
    // (Confirmados / Faltas justificadas / Faltas infracionais) - familia,
    // trabalho e justificada contam juntos como "justificada", igual la.
    var totalJustificadas = porStatus.familia.length + porStatus.trabalho.length + porStatus.justificada.length;
    formatos.push({ linha: linhasSaida.length + 1, tipo: 'resumo' });
    linhasSaida.push(['❌ Faltas justificadas: ' + totalJustificadas + '   ⭕ Faltas infracionais: ' + porStatus.infracional.length, '']);

    ORDEM_SECOES.forEach(function (secao) {
      var lista = porStatus[secao.chave];
      linhasSaida.push(['', '']);
      formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
      linhasSaida.push([secao.titulo + ' (' + lista.length + ')', '']);
      if (!lista.length) {
        linhasSaida.push(['   -', '']);
      } else {
        lista.forEach(function (m) { linhasSaida.push(['   ' + m.nome, m.selos]); });
      }
    });
  });

  s.getRange(1, 1, linhasSaida.length, 2).setValues(linhasSaida);

  formatos.forEach(function (f) {
    var linha = s.getRange(f.linha, 1, 1, 2);
    if (f.tipo === 'evento') linha.setFontWeight('bold').setFontSize(13);
    if (f.tipo === 'secao') linha.setFontWeight('bold').setFontColor('#666666');
    if (f.tipo === 'detalhe') linha.setFontColor('#888888').setFontStyle('italic');
    if (f.tipo === 'percentual') linha.setFontWeight('bold').setFontColor('#1a7a3c');
    if (f.tipo === 'resumo') linha.setFontColor('#666666').setFontStyle('italic');
  });

  s.setColumnWidth(1, 320);
  s.setColumnWidth(2, 200);
  return { ok: true };
}

function formatarDataBR(iso) {
  var p = String(iso).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
}

// Um menu na planilha, caso queira gerar sem passar pelo app.
// Roda tudo que a acao 'relatorio' roda (ver executar()) - usado pelo menu
// da planilha, pra quem preferir gerar por ali em vez do botao do app.
function gerarTudoManual() {
  atualizarRelatorio();
  atualizarAbaRegional();
  atualizarAbasDivisoes();
  atualizarAbaInsight();
  atualizarAbaCalendario();
  organizarAbas();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Confirmacao MC')
    .addItem('Gerar relatorio agora', 'gerarTudoManual')
    .addToUi();
}

// ---------- MIGRACAO ----------

// Roda uma vez so: se as abas novas estao vazias e a KV antiga tem dados,
// converte tudo. Depois disso a KV fica so como historico.
function migrarSePreciso() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migrado') === 'sim') return;

  var kv = planilha().getSheetByName(ABA_KV);
  var mMembros = aba(ABA_MEMBROS, CAB_MEMBROS);
  var mEventos = aba(ABA_EVENTOS, CAB_EVENTOS);
  var mPresencas = aba(ABA_PRESENCAS, CAB_PRESENCAS);

  if (!kv || linhas(mMembros).length || linhas(mEventos).length) {
    props.setProperty('migrado', 'sim');
    return;
  }

  var valores = {};
  linhas(kv).forEach(function (l) { if (l[0]) valores[String(l[0])] = String(l[1] || ''); });

  var roster = parseOuVazio(valores['mc-roster'], []);
  roster.forEach(function (m) {
    mMembros.appendRow([m.id, m.nome || '', m.grau || '', m.divisao || '']);
  });

  var eventos = parseOuVazio(valores['mc-events'], []);
  eventos.forEach(function (ev) {
    mEventos.appendRow([ev.id, ev.nome || '', ev.data || '', ev.horario || '',
                        ev.endereco || '', ev.outros || '', ev.status || 'ativo',
                        ev.createdAt ? Utilities.formatDate(new Date(ev.createdAt), fuso(), 'dd/MM/yyyy HH:mm') : agora()]);

    var status = parseOuVazio(valores['mc-status-' + ev.id], {});
    (ev.memberIds || []).forEach(function (mid) {
      var membro = null;
      for (var i = 0; i < roster.length; i++) if (roster[i].id === mid) membro = roster[i];
      var st = status[mid] || {};
      mPresencas.appendRow([
        ev.id, ev.nome || '', mid, membro ? membro.nome : '',
        STATUS_ROTULO[st.status] || STATUS_ROTULO.aguardando,
        simNao(st.direto), simNao(st.destacado), simNao(st.acompanhado), agora()
      ]);
    });
  });

  props.setProperty('migrado', 'sim');
}

function parseOuVazio(texto, padrao) {
  if (!texto) return padrao;
  try { return JSON.parse(texto); } catch (e) { return padrao; }
}

// Util para rodar na mao pelo editor, caso queira refazer a migracao.
function refazerMigracao() {
  PropertiesService.getScriptProperties().deleteProperty('migrado');
  migrarSePreciso();
}

// ---------- INSIGHTS ----------
// Rodadas feitas algumas vezes por semana, so com membros de divisao
// (Regional RJ4 fica de fora - quem faz insight e a base, nao a diretoria
// regional). Nem todo mundo participa - quem foi removido entra em
// InsightExcluidos; por padrao (sem linha la) todo membro de divisao
// participa, entao um membro novo ja cai na lista sem passo nenhum.

function membrosElegiveisInsight() {
  var excluidos = {};
  linhas(aba(ABA_INSIGHT_EXCLUIDOS, CAB_INSIGHT_EXCLUIDOS)).forEach(function (l) {
    if (l[0]) excluidos[String(l[0])] = true;
  });
  var nomeRegional = ESCOPOS_NOME.regional;
  return lerMembros().filter(function (m) {
    return m.divisao !== nomeRegional && !excluidos[m.id];
  });
}

// Uma rodada = uma linha em InsightRodadas + uma linha por membro elegivel
// em InsightPresencas, tudo em lote (uma unica escrita por aba) - mesmo
// motivo do ajustarParticipantes: um membro de cada vez, com quase 100
// membros, arrisca timeout e leitura no meio da escrita.
// dataEscolhida (opcional): 'yyyy-mm-dd' pra registrar uma rodada atrasada
// com a data certa, em vez da data de hoje - ver "Registrar com outra data"
// no index.html. Vazio ou formato invalido cai no dia de hoje, igual sempre foi.
function salvarInsightRodada(marcacoes, dataEscolhida) {
  var elegiveis = membrosElegiveisInsight();
  if (!elegiveis.length) throw new Error('Nenhum membro elegivel para o insight');

  var id = novoId();
  var dataValida = /^\d{4}-\d{2}-\d{2}$/.test(String(dataEscolhida || ''));
  var dataIso = dataValida ? dataEscolhida : Utilities.formatDate(new Date(), fuso(), 'yyyy-MM-dd');
  aba(ABA_INSIGHT_RODADAS, CAB_INSIGHT_RODADAS).appendRow([id, dataIso, agora()]);

  var totalSim = 0;
  var linhasPresenca = elegiveis.map(function (m) {
    var fez = !!(marcacoes && marcacoes[m.id]);
    if (fez) totalSim++;
    return [id, m.id, m.nome, m.divisao, fez ? 'Sim' : 'Nao'];
  });
  var s = aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS);
  s.getRange(s.getLastRow() + 1, 1, linhasPresenca.length, CAB_INSIGHT_PRESENCAS.length).setValues(linhasPresenca);

  var percentual = Math.round((totalSim / elegiveis.length) * 100);
  return { ok: true, id: id, percentual: percentual, totalSim: totalSim, totalElegiveis: elegiveis.length };
}

function divisaoDoMembro(id) {
  var achado = acharLinha(aba(ABA_MEMBROS, CAB_MEMBROS), function (l) { return String(l[0]) === String(id); });
  return achado ? String(achado.valores[3] || '') : '';
}

// Corrige uma rodada que ja foi registrada - marcacao errada sem querer, um
// integrante que respondeu depois, ou alguem que foi contado por engano
// (ou faltou contar). membroIds e a lista final de quem deve continuar
// nessa rodada - comparada com quem ja tem linha ali, decide quem entra
// (linha nova), quem sai (linha apagada) e quem so tem o "Fez" atualizado.
// Sem isso, "ajustar" so servia pra corrigir Sim/Nao de quem ja estava
// contado, nunca pra corrigir a propria lista de quem participou.
function ajustarInsightRodada(id, marcacoes, membroIds) {
  if (!id) throw new Error('Faltou o ID da rodada');
  // Confere ANTES de apagar linha nenhuma - senao uma tentativa de deixar a
  // rodada vazia (ex: removeu todo mundo sem querer) apagava tudo e so
  // depois avisava do erro, com o estrago ja feito.
  if (!membroIds || !membroIds.length) throw new Error('A rodada precisa ficar com pelo menos 1 integrante');
  var s = aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS);

  var desejados = {};
  (membroIds || []).forEach(function (mid) { desejados[String(mid)] = true; });

  // Sai da rodada quem nao esta mais na lista desejada - continua contado
  // normalmente em qualquer outra rodada, so sai desta.
  apagarLinhas(s, function (l) {
    return String(l[0]) === String(id) && !desejados[String(l[1])];
  });

  var existentes = {};
  linhas(s).forEach(function (l) {
    if (String(l[0]) === String(id)) existentes[String(l[1])] = true;
  });

  // Entra na rodada quem esta na lista desejada mas ainda nao tinha linha.
  var linhasNovas = [];
  (membroIds || []).forEach(function (mid) {
    if (existentes[String(mid)]) return;
    var fez = !!(marcacoes && marcacoes[mid]);
    linhasNovas.push([id, mid, nomeDe(ABA_MEMBROS, CAB_MEMBROS, mid), divisaoDoMembro(mid), fez ? 'Sim' : 'Nao']);
  });
  if (linhasNovas.length) {
    s.getRange(s.getLastRow() + 1, 1, linhasNovas.length, CAB_INSIGHT_PRESENCAS.length).setValues(linhasNovas);
  }

  // Regrava o "Fez" de quem ja estava e continua - so quem de fato mudou.
  var dados = linhas(s);
  var totalSim = 0, total = 0;
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][0]) !== String(id)) continue;
    total++;
    var mid = String(dados[i][1]);
    var fez = !!(marcacoes && marcacoes[mid]);
    if (fez) totalSim++;
    if (ehSim(dados[i][4]) !== fez) s.getRange(i + 2, 5).setValue(fez ? 'Sim' : 'Nao');
  }
  if (!total) throw new Error('A rodada ficaria sem nenhum integrante');
  return { ok: true, id: id, percentual: Math.round((totalSim / total) * 100), totalSim: totalSim, totalElegiveis: total };
}

// Ultimas N rodadas, mais recente primeiro, cada uma com o % calculado na
// hora a partir de InsightPresencas.
function listarInsightRodadas(limite) {
  var rodadas = linhas(aba(ABA_INSIGHT_RODADAS, CAB_INSIGHT_RODADAS))
    .filter(function (l) { return l[0]; })
    .map(function (l) { return { id: String(l[0]), data: formatarData(l[1]) }; })
    .reverse()
    .slice(0, limite || 5);

  var idsVisiveis = {};
  rodadas.forEach(function (r) { idsVisiveis[r.id] = true; });

  var porRodada = {};
  linhas(aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS)).forEach(function (l) {
    var rid = String(l[0]);
    if (!porRodada[rid]) porRodada[rid] = { total: 0, sim: 0, membros: [] };
    porRodada[rid].total++;
    var fez = ehSim(l[4]);
    if (fez) porRodada[rid].sim++;
    // So guarda a lista de nomes das rodadas que vao ser devolvidas (dentro
    // do limite) - sem essa checagem, rodadas antigas de fora tambem
    // acumulariam a lista de membros a toa.
    if (idsVisiveis[rid]) porRodada[rid].membros.push({ id: String(l[1] || ''), nome: String(l[2] || ''), divisao: String(l[3] || ''), fez: fez });
  });

  return rodadas.map(function (r) {
    var c = porRodada[r.id] || { total: 0, sim: 0, membros: [] };
    return {
      id: r.id, data: r.data, totalSim: c.sim, totalElegiveis: c.total,
      percentual: c.total ? Math.round((c.sim / c.total) * 100) : null,
      // Usado pelo botao "Copiar relatorio" de cada rodada, no index.html
      // (buildInsightReportText) - lista quem fez/nao fez pra colar no
      // WhatsApp, igual ja existe pra eventos.
      membros: c.membros
    };
  });
}

function removerInsightRodada(id) {
  apagarLinhas(aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS), function (l) { return String(l[0]) === String(id); });
  apagarLinhas(aba(ABA_INSIGHT_RODADAS, CAB_INSIGHT_RODADAS), function (l) { return String(l[0]) === String(id); });
  return { ok: true };
}

function removerMembroDoInsight(id) {
  var s = aba(ABA_INSIGHT_EXCLUIDOS, CAB_INSIGHT_EXCLUIDOS);
  var ja = acharLinha(s, function (l) { return String(l[0]) === String(id); });
  if (ja) return { ok: true };
  var nome = nomeDe(ABA_MEMBROS, CAB_MEMBROS, id);
  s.appendRow([id, nome, agora()]);
  return { ok: true };
}

function reincluirMembroNoInsight(id) {
  apagarLinhas(aba(ABA_INSIGHT_EXCLUIDOS, CAB_INSIGHT_EXCLUIDOS), function (l) { return String(l[0]) === String(id); });
  return { ok: true };
}

// Publica (sem PIN) - usada tanto na aba Insights do organizador (que
// precisa da % de cada um pra ordenar a lista de marcacao) quanto no Rank
// de Insights publico. So membros de divisao entram - ver
// membrosElegiveisInsight - e cada divisao mostra a media de participantes
// por rodada (nao a % media individual), que e o que foi pedido: quantos,
// em media, marcam presenca a cada rodada.
function calcularEstatisticasInsights() {
  var nomeRegional = ESCOPOS_NOME.regional;
  var membrosAtuais = lerMembros().filter(function (m) { return m.divisao !== nomeRegional; });
  var excluidos = {};
  linhas(aba(ABA_INSIGHT_EXCLUIDOS, CAB_INSIGHT_EXCLUIDOS)).forEach(function (l) {
    if (l[0]) excluidos[String(l[0])] = { nome: String(l[1] || '') };
  });

  var numRodadas = linhas(aba(ABA_INSIGHT_RODADAS, CAB_INSIGHT_RODADAS)).filter(function (l) { return l[0]; }).length;

  var porMembro = {};
  var porDivisaoSnapshot = {}; // chave -> { total: n, sim: n } - soma de todas as linhas, todas as rodadas
  linhas(aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS)).forEach(function (l) {
    var membroId = String(l[1]);
    var fez = ehSim(l[4]);
    if (!porMembro[membroId]) porMembro[membroId] = { convites: 0, confirmacoes: 0 };
    porMembro[membroId].convites++;
    if (fez) porMembro[membroId].confirmacoes++;

    var chaveDivisao = CHAVE_POR_NOME_DIVISAO[String(l[3])];
    if (chaveDivisao) {
      if (!porDivisaoSnapshot[chaveDivisao]) porDivisaoSnapshot[chaveDivisao] = { total: 0, sim: 0 };
      porDivisaoSnapshot[chaveDivisao].total++;
      if (fez) porDivisaoSnapshot[chaveDivisao].sim++;
    }
  });

  // So quem participa de verdade entra na lista de marcacao/rank - quem foi
  // removido so aparece em excluidosLista, mais abaixo.
  var membrosElegiveis = membrosAtuais.filter(function (m) { return !excluidos[m.id]; });

  var membros = membrosElegiveis.map(function (m) {
    var c = porMembro[m.id] || { convites: 0, confirmacoes: 0 };
    return {
      id: m.id, nome: m.nome, divisao: m.divisao, grau: m.grau, funcoes: m.funcoes,
      rodadas: c.convites, confirmacoes: c.confirmacoes,
      percentual: c.convites ? Math.round((c.confirmacoes / c.convites) * 100) : null
    };
  });

  var divisoes = CHAVES_DIVISOES_DETALHE.map(function (chave) {
    var d = porDivisaoSnapshot[chave] || { total: 0, sim: 0 };
    var membrosDaDivisao = membrosElegiveis.filter(function (m) { return m.divisao === ESCOPOS_NOME[chave]; });
    return {
      chave: chave, nome: ESCOPOS_NOME[chave],
      totalMembros: membrosDaDivisao.length,
      mediaPorRodada: numRodadas ? Math.round(d.sim / numRodadas) : 0,
      mediaTotalPorRodada: numRodadas ? Math.round(d.total / numRodadas) : membrosDaDivisao.length,
      percentual: d.total ? Math.round((d.sim / d.total) * 100) : null
    };
  });

  var excluidosLista = Object.keys(excluidos).map(function (id) {
    var m = membrosAtuais.filter(function (x) { return x.id === id; })[0];
    return { id: id, nome: m ? m.nome : excluidos[id].nome, divisao: m ? m.divisao : '' };
  });

  return { ok: true, rodadas: numRodadas, membros: membros, divisoes: divisoes, excluidos: excluidosLista };
}

// Espelho na planilha do "Rank de Insights" publico do app - ate aqui os
// dados de insight so existiam crus (InsightRodadas/InsightPresencas), sem
// nenhuma visao formatada, diferente do que ja existe pra presenca normal
// (aba Regional RJ4). Mesmo padrao visual: titulo, resumo, tabela colorida
// por semaforo e um grafico de tendencia - aqui ao longo das rodadas, nao
// dos meses (insight nao tem "janela de tempo", cada linha ja e uma rodada).
function atualizarAbaInsight() {
  var s = planilha().getSheetByName(ABA_INSIGHT_RESUMO);
  if (!s) s = planilha().insertSheet(ABA_INSIGHT_RESUMO);
  s.clear();
  s.getCharts().forEach(function (c) { s.removeChart(c); });

  var estat = calcularEstatisticasInsights();
  // Ate 20 rodadas mais recentes, mais antiga primeiro (pro grafico de
  // tendencia ler da esquerda pra direita em ordem cronologica).
  var rodadas = listarInsightRodadas(20).slice().reverse();

  var linhasSaida = [];
  var coresSaida = [];
  var formatos = [];

  // Toda linha, mesmo as de titulo/secao com so 2 colunas de texto, grava 4
  // cores (null = sem cor) - senao setBackgrounds() recusa o range inteiro
  // por causa de uma unica linha com menos colunas que as outras.
  function linha2(a, b) { linhasSaida.push([a, b]); coresSaida.push([null, null, null, null]); }

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'titulo' });
  linha2('INSIGHT RJ4 — RESUMO DE PARTICIPAÇÃO', '');
  formatos.push({ linha: linhasSaida.length + 1, tipo: 'detalhe' });
  linha2('Gerado em ' + agora(), '');
  linha2('Total de rodadas registradas: ' + estat.rodadas, '');
  linha2('', '');

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
  linha2('MÉDIA POR DIVISÃO (participantes por rodada)', '');
  formatos.push({ linha: linhasSaida.length + 1, tipo: 'cabecalho' });
  linhasSaida.push(['Divisão', 'Média / rodada', 'Elegíveis', '%']);
  coresSaida.push([null, null, null, null]);
  var linhaCabecalhoDivisoes = linhasSaida.length;
  estat.divisoes.forEach(function (d) {
    linhasSaida.push([CORES_DIVISOES[d.chave].emoji + ' ' + d.nome, d.mediaPorRodada, d.totalMembros, d.percentual === null ? '' : d.percentual]);
    coresSaida.push([null, null, null, corSemaforo(d.percentual)]);
  });
  var linhaFimDivisoes = linhasSaida.length;
  linha2('', '');

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
  linha2('RANKING DE MEMBROS (% de participação)', '');
  formatos.push({ linha: linhasSaida.length + 1, tipo: 'cabecalho' });
  linhasSaida.push(['Nome', 'Divisão', 'Rodadas', '%']);
  coresSaida.push([null, null, null, null]);
  var ranking = estat.membros.slice().sort(function (a, b) {
    if (a.percentual === null && b.percentual === null) return a.nome.localeCompare(b.nome);
    if (a.percentual === null) return 1;
    if (b.percentual === null) return -1;
    return b.percentual - a.percentual || a.nome.localeCompare(b.nome);
  });
  if (!ranking.length) {
    linha2('(nenhum membro elegível)', '');
  } else {
    ranking.forEach(function (m) {
      linhasSaida.push([m.nome, m.divisao, m.rodadas, m.percentual === null ? '' : m.percentual]);
      coresSaida.push([null, null, null, corSemaforo(m.percentual)]);
    });
  }
  linha2('', '');

  formatos.push({ linha: linhasSaida.length + 1, tipo: 'secao' });
  linha2('ÚLTIMAS RODADAS (até 20, mais recente primeiro)', '');
  formatos.push({ linha: linhasSaida.length + 1, tipo: 'cabecalho' });
  linhasSaida.push(['Data', 'Fizeram', 'Elegíveis', '%']);
  coresSaida.push([null, null, null, null]);
  if (!rodadas.length) {
    linha2('(nenhuma rodada registrada)', '');
  } else {
    rodadas.slice().reverse().forEach(function (r) {
      linhasSaida.push([formatarDataBR(r.data), r.totalSim, r.totalElegiveis, r.percentual === null ? '' : r.percentual]);
      coresSaida.push([null, null, null, corSemaforo(r.percentual)]);
    });
  }

  s.getRange(1, 1, linhasSaida.length, 4).setValues(linhasSaida.map(function (l) {
    return [l[0], l[1] === undefined ? '' : l[1], l[2] === undefined ? '' : l[2], l[3] === undefined ? '' : l[3]];
  }));
  s.getRange(1, 1, coresSaida.length, 4).setBackgrounds(coresSaida);

  formatos.forEach(function (f) {
    var r = s.getRange(f.linha, 1, 1, 4);
    if (f.tipo === 'titulo') r.setFontWeight('bold').setFontSize(14);
    if (f.tipo === 'detalhe') r.setFontColor('#888888').setFontStyle('italic');
    if (f.tipo === 'secao') r.setFontWeight('bold').setFontColor('#666666');
    if (f.tipo === 'cabecalho') r.setFontWeight('bold').setFontColor('#666666').setFontSize(10);
  });
  s.getRange(linhaCabecalhoDivisoes + 1, 4, Math.max(0, linhaFimDivisoes - linhaCabecalhoDivisoes), 1).setNumberFormat('0"%"');
  s.getRange(1, 4, linhasSaida.length, 1).setNumberFormat('0"%"');

  s.setColumnWidth(1, 240);
  s.setColumnWidth(2, 110);
  s.setColumnWidth(3, 90);
  s.setColumnWidth(4, 70);

  // Grafico de tendencia: % de participacao rodada a rodada, em ordem
  // cronologica (rodadas[] ja esta nessa ordem - mais antiga primeiro; a
  // tabela impressa acima e que mostra mais recente primeiro, por ser mais
  // facil de ler numa lista, mas o grafico precisa do sentido oposto).
  if (rodadas.length > 1) {
    var linhasGrafico = [['Rodada', '%']].concat(rodadas.map(function (r) {
      return [formatarDataBR(r.data), r.percentual === null ? 0 : r.percentual];
    }));
    var linhaInicioGrafico = linhasSaida.length + 2;
    s.getRange(linhaInicioGrafico, 1, linhasGrafico.length, 2).setValues(linhasGrafico);
    var rangeGrafico = s.getRange(linhaInicioGrafico, 1, linhasGrafico.length, 2);
    var grafico = s.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(rangeGrafico)
      .setPosition(linhaInicioGrafico, 4, 0, 0)
      .setOption('title', 'Tendência de participação por rodada')
      .setOption('legend', { position: 'none' })
      .setOption('vAxis', { title: '%', minValue: 0, maxValue: 100 })
      .setOption('colors', ['#4a86e8'])
      .setOption('pointSize', 6)
      .setOption('curveType', 'function')
      .setOption('width', 700)
      .setOption('height', 360)
      .build();
    s.insertChart(grafico);
  }
}

// ---------- DADOS FAKE (so pra pre-visualizar a planilha) ----------
// So pra rodar na mao pelo editor do Apps Script - de proposito NAO tem
// acao web correspondente em executar(), pra ninguem conseguir sujar a
// planilha real chamando isso de fora. Todo membro e evento criado aqui
// tem o nome comecando com PREFIXO_TESTE, entao removerDadosFakeTeste()
// consegue limpar so o que e fake sem tocar em nenhum dado real.
var PREFIXO_TESTE = 'TESTE-';

function gerarDadosFakeTeste() {
  var nomesFake = ['Silva', 'Costa', 'Souza', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Ramos', 'Dias', 'Nunes', 'Barros', 'Rocha'];
  // Precisa bater exatamente com TIPOS_EVENTO do index.html (inclusive
  // acentuacao/caixa) - senao o evento fake fica com um tipo que nenhuma
  // aba "Relatorio X" reconhece.
  var tipos = ['Bate e Volta', 'Ação Social', 'Pub', 'Reunião'];
  var statusPossiveis = ['Confirmado', 'Confirmado', 'Confirmado', 'Aguardando', 'Familia', 'Trabalho'];
  function sorteia(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  var novosMembros = [];
  var membrosPorChave = {};
  CHAVES_DIVISOES_DETALHE.forEach(function (chave) {
    var nomeDivisao = ESCOPOS_NOME[chave];
    var qtd = 4 + Math.floor(Math.random() * 5);
    membrosPorChave[chave] = [];
    for (var i = 0; i < qtd; i++) {
      var id = novoId();
      var nome = PREFIXO_TESTE + nomeDivisao.split(' ')[0] + ' ' + sorteia(nomesFake) + ' ' + (i + 1);
      novosMembros.push([id, nome, '', nomeDivisao, '']);
      membrosPorChave[chave].push({ id: id, nome: nome, divisao: nomeDivisao });
    }
  });
  var sMembros = aba(ABA_MEMBROS, CAB_MEMBROS);
  sMembros.getRange(sMembros.getLastRow() + 1, 1, novosMembros.length, CAB_MEMBROS.length).setValues(novosMembros);

  var todosMembros = [];
  Object.keys(membrosPorChave).forEach(function (chave) { todosMembros = todosMembros.concat(membrosPorChave[chave]); });

  var novosEventos = [];
  var novasPresencas = [];
  function criarEvento(nome, categoria, membros, diasAtras) {
    var id = novoId();
    var data = new Date();
    data.setDate(data.getDate() - diasAtras);
    var dataIso = Utilities.formatDate(data, fuso(), 'yyyy-MM-dd');
    var status = diasAtras > 2 ? 'encerrado' : 'ativo';
    novosEventos.push([id, nome, dataIso, '', '', '', status, agora(), categoria, sorteia(tipos)]);
    membros.forEach(function (m) {
      novasPresencas.push([id, nome, m.id, m.nome, sorteia(statusPossiveis),
        simNao(Math.random() < 0.5), simNao(Math.random() < 0.2), simNao(Math.random() < 0.3), agora()]);
    });
  }

  CHAVES_DIVISOES_DETALHE.forEach(function (chave) {
    var nomeDivisao = ESCOPOS_NOME[chave];
    var membros = membrosPorChave[chave];
    var numEventos = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < numEventos; i++) {
      criarEvento(PREFIXO_TESTE + nomeDivisao + ' - Evento ' + (i + 1), chave, membros, Math.floor(Math.random() * 380));
    }
  });
  for (var r = 0; r < 4; r++) {
    criarEvento(PREFIXO_TESTE + 'Regional RJ4 - Evento ' + (r + 1), 'regional', todosMembros, Math.floor(Math.random() * 380));
  }

  var sEventos = aba(ABA_EVENTOS, CAB_EVENTOS);
  sEventos.getRange(sEventos.getLastRow() + 1, 1, novosEventos.length, CAB_EVENTOS.length).setValues(novosEventos);
  var sPresencas = aba(ABA_PRESENCAS, CAB_PRESENCAS);
  sPresencas.getRange(sPresencas.getLastRow() + 1, 1, novasPresencas.length, CAB_PRESENCAS.length).setValues(novasPresencas);

  // Rodadas de Insight fake, uma por semana nos ultimos 2 meses ou so -
  // Regional fica de fora (mesma regra de membrosElegiveisInsight). O ID de
  // cada rodada tambem comeca com PREFIXO_TESTE, pra removerDadosFakeTeste
  // conseguir apagar so as rodadas/presencas fake sem mexer nas de verdade
  // (a linha de presenca de insight nao guarda nome com prefixo sozinha -
  // "Membro" ate tem o PREFIXO_TESTE por vir de um membro fake, mas e mais
  // direto/seguro filtrar pelo ID da rodada).
  var novasRodadas = [];
  var novasInsightPresencas = [];
  var numRodadasFake = 6 + Math.floor(Math.random() * 5);
  for (var rd = 0; rd < numRodadasFake; rd++) {
    var idRodada = PREFIXO_TESTE + novoId();
    var dataRodada = new Date();
    dataRodada.setDate(dataRodada.getDate() - rd * 7 - Math.floor(Math.random() * 3));
    var dataRodadaIso = Utilities.formatDate(dataRodada, fuso(), 'yyyy-MM-dd');
    novasRodadas.push([idRodada, dataRodadaIso, agora()]);

    todosMembros.forEach(function (m) {
      novasInsightPresencas.push([idRodada, m.id, m.nome, m.divisao, simNao(Math.random() < 0.65)]);
    });
  }
  var sInsightRodadas = aba(ABA_INSIGHT_RODADAS, CAB_INSIGHT_RODADAS);
  sInsightRodadas.getRange(sInsightRodadas.getLastRow() + 1, 1, novasRodadas.length, CAB_INSIGHT_RODADAS.length).setValues(novasRodadas);
  var sInsightPresencas = aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS);
  sInsightPresencas.getRange(sInsightPresencas.getLastRow() + 1, 1, novasInsightPresencas.length, CAB_INSIGHT_PRESENCAS.length).setValues(novasInsightPresencas);

  atualizarRelatorio();
  atualizarAbaRegional();
  atualizarAbasDivisoes();
  atualizarAbaInsight();
  atualizarAbaCalendario();
  organizarAbas();

  Logger.log(novosMembros.length + ' membros, ' + novosEventos.length + ' eventos, ' + novasPresencas.length +
    ' presencas, ' + novasRodadas.length + ' rodadas de insight fake criados. Rode removerDadosFakeTeste() quando terminar de olhar a planilha.');
}

function removerDadosFakeTeste() {
  apagarLinhas(aba(ABA_PRESENCAS, CAB_PRESENCAS), function (l) { return String(l[1]).indexOf(PREFIXO_TESTE) === 0; });
  apagarLinhas(aba(ABA_EVENTOS, CAB_EVENTOS), function (l) { return String(l[1]).indexOf(PREFIXO_TESTE) === 0; });
  apagarLinhas(aba(ABA_MEMBROS, CAB_MEMBROS), function (l) { return String(l[1]).indexOf(PREFIXO_TESTE) === 0; });
  // ID Rodada comeca com PREFIXO_TESTE nas rodadas fake (ver gerarDadosFakeTeste) -
  // filtra pelo ID em vez do nome do membro, ja que uma rodada de verdade
  // poderia, em teoria, ter um membro cujo nome comece igual por coincidencia.
  apagarLinhas(aba(ABA_INSIGHT_PRESENCAS, CAB_INSIGHT_PRESENCAS), function (l) { return String(l[0]).indexOf(PREFIXO_TESTE) === 0; });
  apagarLinhas(aba(ABA_INSIGHT_RODADAS, CAB_INSIGHT_RODADAS), function (l) { return String(l[0]).indexOf(PREFIXO_TESTE) === 0; });

  atualizarRelatorio();
  atualizarAbaRegional();
  atualizarAbasDivisoes();
  atualizarAbaInsight();
  atualizarAbaCalendario();
  organizarAbas();

  Logger.log('Dados fake removidos.');
}
