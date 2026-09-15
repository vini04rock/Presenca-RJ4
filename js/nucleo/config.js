// Configuracao da RJ4: divisoes, status, graus, tipos de evento e funcoes.

// ========================================================================
// CONFIGURACAO DA RJ4
// Cada item vira um botao proprio no Modo organizador, com o proprio PIN
// (guardado no Code.gs, nao aqui - ver verificarPin). A chave e o que fica
// gravado como categoria dos eventos e divisao dos membros criados dali.
// Para acrescentar uma divisao nova, e so um item a mais nesta lista, mais
// o PIN dela nas Propriedades do Script - nao precisa mexer em mais nada.
// ========================================================================
const CLUBE_NOME = 'Insanos MC';
const ESCOPOS = [
  { chave: 'barra', nome: 'Barra - RJ4' },
  { chave: 'oeste', nome: 'Oeste - RJ4' },
  { chave: 'recreio', nome: 'Recreio - RJ4' },
  { chave: 'curicica', nome: 'Curicica - RJ4' },
  { chave: 'taquara', nome: 'Taquara - RJ4' },
  { chave: 'gardenia', nome: 'Gardênia - RJ4' },
  { chave: 'regional', nome: 'Regional RJ4' },
];
export function escopoPorChave(chave) { return ESCOPOS.find(e => e.chave === chave) || ESCOPOS[0]; }

// Ordem pra listar as divisoes nas telas (organizador, tela inicial, rank):
// Regional no topo, depois as demais em ordem alfabetica do nome. Separado
// da ordem de declaracao de ESCOPOS, que fica com Barra primeiro por ser o
// valor padrao seguro (escopoPorChave cai nela se receber uma chave invalida).
export function escoposEmOrdemDeExibicao() {
  return [...ESCOPOS].sort((a, b) => {
    if (a.chave === 'regional') return -1;
    if (b.chave === 'regional') return 1;
    return a.nome.localeCompare(b.nome);
  });
}

// So as 6 divisoes, sem Regional - o Insight e coisa de quem esta na base,
// nao da diretoria regional (ver calcularEstatisticasInsights no Code.gs).
export function divisoesSemRegional() {
  return escoposEmOrdemDeExibicao().filter(e => e.chave !== 'regional');
}

// So Regional e Barra na tela de Relatorios (decisao do clube) - Modo
// organizador e a tela inicial continuam com as 7 divisoes normalmente
// (escoposEmOrdemDeExibicao). Nada e apagado no backend/planilha, e so
// filtro de exibicao aqui.
export function escoposAtivos() {
  return escoposEmOrdemDeExibicao().filter(e => e.chave === 'regional' || e.chave === 'barra');
}

export const STATUS = {
  aguardando: { emoji: '⚠️', label: 'Aguardando' },
  confirmado: { emoji: '✅', label: 'Confirmado' },
  familia: { emoji: '❌', label: 'Família' },
  trabalho: { emoji: '❌', label: 'Trabalho' },
  // So aparecem em eventos criados pela tela "Relatorios" (colar convocacao) -
  // o picker manual continua limitado a STATUS_PICKER_KEYS, os 4 de cima.
  // "infracional" cobre tanto falta sem justificativa quanto quem nao
  // respondeu a convocacao (mesmo tratamento, decisao do clube).
  justificada: { emoji: '❌', label: 'Justificada' },
  infracional: { emoji: '⭕', label: 'Infracional' }
};
export const STATUS_PICKER_KEYS = ['aguardando', 'confirmado', 'familia', 'trabalho'];
export const GRAUS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Cargos dos graus VI e V, JA NA ORDEM HIERARQUICA - a posicao na lista e a
// ordem, entao mexer aqui muda a ordem em que os integrantes aparecem.
//
// So esses dois graus tem cargo: sao os "graus de cargo", em que varios
// integrantes dividem o mesmo grau ocupando funcoes diferentes. Nos outros
// (VIII, IX, X) a ordem de verdade e a antiguidade, que o app nao guarda -
// ali fica alfabetica mesmo. Ver ordenarPorHierarquia em util.js.
//
// Nao confundir com FUNCOES (mais abaixo): funcao e atribuicao operacional,
// acumulavel e sem hierarquia; cargo e um so por pessoa e tem ordem.
export const CARGOS = {
  'VI': ['Diretor', 'Subdiretor', 'Social', 'ADM', 'Sgt de Armas de Divisão'],
  'V': ['Diretor Regional', 'Operacional', 'Social Regional', 'ADM Regional', 'Comunicação'],
};

// Lista de cargos de um grau, ou vazia se aquele grau nao tem cargo.
export function cargosDoGrau(grau) { return CARGOS[grau] || []; }

// Tipos de evento do clube. Escolha unica por evento. Para acrescentar um
// tipo novo, e so um item a mais em cada uma destas duas listas.
export const TIPOS_EVENTO = ['Bate e Volta', 'Pub', 'Ação Social', 'Reunião'];
const EMOJI_TIPO_EVENTO = {
  'Pub': '🍻',
  'Bate e Volta': '🏍️',
  'Ação Social': '🏥',
  'Reunião': '📊'
};
export function emojiTipoEvento(tipo) { return EMOJI_TIPO_EVENTO[tipo] || ''; }

// "Personalidade" visual de cada tipo, usada nos cards de evento da aba
// Eventos dos Relatorios (renderCardEvento). O fundo/borda de cada tipo vive
// no CSS como classe (.tipo-pub etc, ver logo abaixo de .event-card) - se
// fosse so cor inline no elemento, o toque em celular (.event-card:active)
// pararia de escurecer o card ao tocar, porque um estilo inline sempre
// ganha de qualquer regra do CSS, pseudo-classe incluida. So a cor "crua"
// (pro texto/borda do selinho de tipo, que nao tem estado de toque) fica
// aqui como hex.
const TIPO_EVENTO_CLASSE = {
  'Pub': 'tipo-pub',
  'Bate e Volta': 'tipo-bate-e-volta',
  'Ação Social': 'tipo-acao-social',
  'Reunião': 'tipo-reuniao'
};
export function classeTipoEvento(tipo) { return TIPO_EVENTO_CLASSE[tipo] || ''; }

const TIPO_EVENTO_COR = {
  'Pub': '#E0B23C',
  'Bate e Volta': '#D9573C',
  'Ação Social': '#4CAF6E',
  'Reunião': '#4C86D9'
};
export function corTipoEvento(tipo) { return TIPO_EVENTO_COR[tipo] || 'var(--line-strong)'; }
// Cor do "Todos os eventos" na tela de escolha de tipo (renderHomeTipos) -
// so existe ali, nao e um TIPOS_EVENTO de verdade, entao fica fora do mapa
// acima (que so cobre os 4 tipos reais).
export const COR_TODOS_EVENTOS = '#D4A24C';

// Funcoes destacadas dentro do clube. Um membro pode acumular quantas fizerem
// sentido (ou nenhuma). Para acrescentar uma nova no futuro, e so adicionar
// um item aqui - o cadastro de membro e os selos ao lado do nome leem direto
// desta lista, nao precisa mexer em mais nada.
export const FUNCOES = [
  { chave: 'sargento_armas', label: 'Sargento de Armas', selo: '⚔️' },
  { chave: 'caveira', label: 'Caveira', selo: '💀' },
  { chave: 'combate_insanos', label: 'Combate Insanos', selo: '🥋' },
  { chave: 'batedor', label: 'Batedor', selo: '🛡️' },
];
export function funcaoPorChave(chave) { return FUNCOES.find(f => f.chave === chave); }

export const COR_DIVISAO = '#5FA0C4';

export const TIPO_HOME_TAGLINE = {
  todos: 'Juntos na estrada sempre',
  'Bate e Volta': 'Estrada • Liberdade • Irmãos',
  'Pub': 'Boa companhia • Boas histórias',
  'Ação Social': 'Mais que motos • Pessoas',
  'Reunião': 'Planejamento • Evolução • União'
};

export const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

// Seg,Ter,Qua,Qui,Sex,Sab,Dom - so a primeira letra, igual pedido (repete
// letra pra Q e S de proposito, o cabecalho da coluna ja deixa claro qual
// dia da semana e cada uma pela posicao).
export const DIAS_SEMANA_LETRA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
export const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Painel unico da tela "Relatorios": cabecalho + 7 abas + o conteudo da aba
// ativa. E o analogo do renderAdmin() do Modo organizador, so que focado no
// fluxo de colar convocacao. As 4 ultimas abas (uma por TIPOS_EVENTO, nessa
// ordem especifica pedida) sao paginas fixas so de tabela - sem chips de
// periodo, sem grafico - filtradas aquele tipo.
export const TIPOS_EVENTO_TABS_ORDEM = ['Pub', 'Bate e Volta', 'Reunião', 'Ação Social'];
export const RELATORIO_TABS = [
  { chave: 'resumo', label: 'Resumo Relatório' },
  { chave: 'enviar', label: 'Enviar Relatório' },
  { chave: 'eventos', label: 'Eventos' },
  ...TIPOS_EVENTO_TABS_ORDEM.map(t => ({ chave: t, label: 'Relatório ' + t })),
];

// Nas abas que mostram dados agregados (tudo, exceto "Enviar", que ja tem
// seu proprio seletor de divisao pra convocacao colada), o Regional ganha
// um filtro por divisao no topo - "Todas" agrega o clube inteiro, uma
// divisao especifica restringe so aquela categoria. Ver
// eventosDoRelatorioEscopo()/membrosVisiveisRelatorio().
export const ABAS_COM_FILTRO_DIVISAO = ['resumo', 'eventos', ...TIPOS_EVENTO_TABS_ORDEM];

export const STATUS_TOTAIS_LABEL = {
  confirmado: 'confirmados', aguardando: 'aguardando', trabalho: 'faltas (trabalho)',
  familia: 'faltas (família)', justificada: 'faltas justificadas', infracional: 'faltas infracionais'
};

export const RELATORIO_PERIODOS = [1, 3, 6, 12];
