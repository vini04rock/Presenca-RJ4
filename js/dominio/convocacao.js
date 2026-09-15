// Monta o texto da convocação para colar no grupo do WhatsApp.
//
// O molde veio de convocações reais do clube. Cada parte tem uma origem:
//   fixo        - faixa, seções, legendas, Respaldo RDI, ATENÇÃO/BRIEFING
//   do app      - título, data, divisão, lista de integrantes
//   do formulário - roteiro, pontos, horários, contato: o que só o
//                 organizador sabe na hora. O app não tenta adivinhar.
//
// Este módulo só LÊ e devolve texto - não grava nada em lugar nenhum.

import { MESES_ABREV, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { ordenarPorHierarquia } from '../nucleo/util.js';
import { agruparPorDivisao } from './divisoes.js';

// Medidas conferidas contra as convocações reais: a faixa tem 5 pares
// preto/branco e o separador, 44 pontos. Mudar aqui muda em toda convocação.
const FAIXA = '⚫⚪'.repeat(5);
const SEPARADOR = '.'.repeat(44);

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Blocos que saem iguais em toda convocação. Ficam aqui, e não espalhados
// pelo montador, pra dar pra corrigir um texto sem caçar onde ele entra.
const LEGENDA_PARTICIPACAO = [
  'Participação',
  '⚠️ Aguardando confirmação',
  '✅ Presença confirmada',
  '❌ Falta justificada',
  '⭕ Falta infracional',
];
const LEGENDA_OPERACAO = [
  'Operação',
  '🚧 Voluntário destacado',
];
// O Bate e Volta usa "Legenda" no lugar de "Participação", e não tem o
// bloco de Operação. É assim nas convocações reais - não é descuido.
const LEGENDA_BATE_VOLTA = [
  'Legenda',
  '⚠️ Aguardando confirmação',
  '✅ Presença confirmada',
  '❌ Falta justificada',
  '⭕ Falta infracional',
];
const RESPALDO = [
  'Prazo para a justificativa: 1 dia antes do evento.',
  '',
  'Respaldo RDI',
  '',
  'Art. 14°  São infrações de natureza grave:',
  '',
  'X - Faltar sem motivo justificado a evento oficial do MC.',
];
// Só em Bate e Volta: é estrada, então entra o checklist da moto e as
// regras do comboio.
const ATENCAO = [
  '⚠️ ATENÇÃO ⚠️',
  '',
  '🏍️ Fazer inspeção na moto antes de pegar estrada.',
  '🏍️ Não esquecer de abastecer.',
  '🏍️ Calibrar os pneus.',
  '🏍️ Conferir e ajustar equipamentos de segurança pessoal.',
];
const BRIEFING = [
  '⚫ BRIEFING ⚫',
  '',
  '♦️ Formação do comboio.',
  '♦️ Manter a formação do comboio.',
  '♦️ Cumprir a velocidade de cruzeiro estabelecida.',
  '♦️ Repassar sinais de gestos.',
  '♦️ Diretrizes gerais.',
];

// Quem assina o rodapé, por decisão do clube: na divisão é o Subdiretor;
// no Regional, o Operacional. Não é o cargo mais alto - é quem de fato
// responde pela convocação.
const CARGO_QUE_ASSINA = { divisao: 'Subdiretor', regional: 'Operacional' };

// Os campos do formulário, por modelo. A tela desenha a partir daqui, então
// acrescentar um campo é mexer só nesta lista. `linhas > 1` vira caixa de
// várias linhas.
export const MODELOS = {
  simples: {
    nome: 'Simples',
    para: 'Pub, Reunião, Ação Social',
    campos: [
      { chave: 'subtitulo', rotulo: 'Subtítulo (opcional)', dica: 'Ex: Aniversariantes do mês' },
      { chave: 'destino', rotulo: 'Destino', linhas: 4, dica: 'Uma linha por parte do endereço' },
      { chave: 'linkMapa', rotulo: 'Link do mapa', dica: 'https://maps.app.goo.gl/…' },
      { chave: 'destacamento', rotulo: 'Destacamento', dica: '18h30', curto: true },
      { chave: 'briefing', rotulo: 'Briefing', dica: '19h15', curto: true },
      { chave: 'inicio', rotulo: 'Início', dica: '19h30', curto: true },
      { chave: 'informacoes', rotulo: 'Informações (rodapé)', linhas: 6 },
    ],
  },
  'bate-volta': {
    nome: 'Bate e Volta',
    para: 'saída de estrada, com roteiro',
    campos: [
      { chave: 'subtitulo', rotulo: 'Subtítulo (opcional)', dica: 'Ex: Bonde da Independência' },
      { chave: 'horarios', rotulo: 'Horários', linhas: 4,
        dica: 'Concentração: 05h00\nBriefing: 05h15\nSaída: 05h30' },
      { chave: 'concentracao', rotulo: 'Concentração (ponto de encontro)', linhas: 5,
        dica: 'Uma linha por parte do endereço' },
      { chave: 'linkMapa', rotulo: 'Link do mapa', dica: 'https://maps.app.goo.gl/…' },
      { chave: 'roteiro', rotulo: 'Roteiro', linhas: 6,
        dica: 'Paradas, trechos e destino' },
      { chave: 'informacoes', rotulo: 'Informações (rodapé)', linhas: 6 },
    ],
  },
};

// Qual modelo o evento pede. Bate e Volta tem roteiro; o resto é simples.
export function modeloPadrao(ev) {
  return (ev && ev.tipo === 'Bate e Volta') ? 'bate-volta' : 'simples';
}

// "Barra - RJ4" -> "DIVISÃO BARRA - RJ4"; o Regional não leva o prefixo.
export function rotuloDivisao(categoria) {
  const e = escopoPorChave(categoria);
  return e.chave === 'regional' ? e.nome.toUpperCase() : 'DIVISÃO ' + e.nome.toUpperCase();
}

// '2026-09-09' -> 'Quarta: 09SET26', o formato que o clube usa.
// A data é montada por partes de propósito: new Date('2026-09-09') é lido
// como UTC e, no fuso do Brasil, voltaria o dia anterior.
export function dataDaConvocacao(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const [, ano, mes, dia] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  const diaSemana = DIAS_SEMANA[(d.getDay() + 6) % 7];   // getDay: 0 = domingo
  return `${diaSemana}: ${dia}${MESES_ABREV[Number(mes) - 1]}${ano.slice(2)}`;
}

// '19:30' -> '19h30'. Devolve o que veio se não reconhecer.
function comoHora(valor) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor || '').trim());
  return m ? `${m[1].padStart(2, '0')}h${m[2]}` : String(valor || '').trim();
}

// A lista numerada, na ordem hierárquica (grau, depois cargo, depois nome).
export function listaDeIntegrantes(membros) {
  return ordenarPorHierarquia(membros).map((m, i) =>
    `${String(i + 1).padStart(2, '0')}. ${m.nome.toUpperCase()}${m.grau ? ` (${m.grau})` : ''}`);
}

// Num evento regional a lista vem agrupada por divisão, com um cabeçalho
// antes de cada bloco e a numeração recomeçando - é como o clube escreve.
function listaAgrupada(membros) {
  const fora = [];
  agruparPorDivisao(membros).forEach((g, i) => {
    if (i) fora.push('');
    fora.push(g.divisao.toUpperCase());
    fora.push('');
    fora.push(...listaDeIntegrantes(g.membros));
  });
  return fora;
}

// Junta as linhas tirando as vazias do começo/fim e nunca deixando duas
// linhas em branco seguidas - assim um campo não preenchido apenas some,
// em vez de abrir um buraco no meio da mensagem.
function juntar(linhas) {
  const fora = [];
  for (const l of linhas) {
    if (l === '' && (fora.length === 0 || fora[fora.length - 1] === '')) continue;
    fora.push(l);
  }
  while (fora.length && fora[fora.length - 1] === '') fora.pop();
  return fora.join('\n');
}

// Texto de várias linhas do formulário -> linhas, sem as vazias.
function linhasDe(valor) {
  return String(valor || '').split('\n').map(l => l.trimEnd()).filter(l => l.trim());
}

// Sugestões para o formulário: tudo que dá pra deduzir do evento e do
// cadastro. O organizador ajusta antes de copiar.
export function camposIniciais(ev, roster, modelo) {
  const qual = modelo || modeloPadrao(ev);
  const outros = String(ev.outros || '');
  const link = (outros.match(/https?:\/\/\S+/) || [''])[0];
  const achaHora = (rotulo) => {
    const m = new RegExp(rotulo + '\\s*:\\s*(\\d{1,2}[:h]\\d{2})', 'i').exec(outros);
    return m ? comoHora(m[1].replace('h', ':')) : '';
  };
  // O endereço é guardado numa linha só, separado por vírgula (ver o
  // parser). Aqui ele volta uma parte por linha, que é como aparece na
  // convocação - o organizador arruma se a quebra cair no lugar errado.
  const endereco = String(ev.endereco || '').split(', ').join('\n');
  const informacoes = blocoInformacoes(ev.categoria, roster);

  if (qual === 'bate-volta') {
    const horas = [
      ['Concentração', achaHora('concentração') || achaHora('destacamento')],
      ['Briefing', achaHora('briefing')],
      ['Saída', achaHora('saída') || comoHora(ev.horario)],
    ].filter(([, v]) => v).map(([nome, v]) => `${nome}: ${v}`);
    return {
      subtitulo: '', horarios: horas.join('\n'), concentracao: endereco,
      linkMapa: link, roteiro: '', informacoes,
    };
  }
  return {
    subtitulo: '', destino: endereco, linkMapa: link,
    destacamento: achaHora('destacamento'), briefing: achaHora('briefing'),
    inicio: comoHora(ev.horario), informacoes,
  };
}

// O rodapé de contato. O app sabe quem é a diretoria (nome, grau e cargo),
// mas NÃO guarda telefone - por isso ele entra como um espaço pra preencher.
// O Regional usa outra forma, em itálico do WhatsApp, que é como já sai
// hoje no grupo.
//
// Se ninguém estiver cadastrado naquele cargo, os campos saem como
// "(nome)" / "(cargo)" para o organizador preencher. É de propósito: uma
// mensagem que vai pro clube inteiro assinada pela pessoa errada é pior do
// que uma com um espaço em branco visível.
export function blocoInformacoes(categoria, roster) {
  const e = escopoPorChave(categoria);
  const ehRegional = e.chave === 'regional';
  const cargoAlvo = ehRegional ? CARGO_QUE_ASSINA.regional : CARGO_QUE_ASSINA.divisao;
  const quem = (roster || []).find(m => m.divisao === e.nome && m.cargo === cargoAlvo);

  if (ehRegional) {
    const linha = quem ? `${quem.nome} - ${quem.cargo} RJ4` : '(nome) - (cargo) RJ4';
    return ['_Informações:_', `_${linha}_`, '_Contato: (telefone)_'].join('\n');
  }
  return [
    'ℹ️ INFORMAÇÕES ℹ️',
    '',
    quem ? `${quem.nome.toUpperCase()}${quem.grau ? ` (${quem.grau})` : ''}` : '(nome)',
    quem ? quem.cargo.toUpperCase() : '(cargo)',
    rotuloDivisao(categoria),
    '(telefone)',
  ].join('\n');
}

// O cabeçalho, igual nos dois modelos.
function cabecalho(ev, campos) {
  const emoji = emojiTipoEvento(ev.tipo);
  const titulo = [emoji, String(ev.nome || '').toUpperCase(), emoji].filter(Boolean).join(' ');
  return [
    FAIXA, '',
    '*CONVOCAÇÃO GERAL*',
    '*TODOS OS GRAUS*', '',
    titulo, '',
    'Evento',
    `🗓 ${dataDaConvocacao(ev.data)}`, '',
    ...(campos.subtitulo ? [String(campos.subtitulo).toUpperCase()] : []),
    rotuloDivisao(ev.categoria),
  ];
}

// A lista de convocados, com o cabeçalho da seção. Evento regional sai
// agrupado por divisão; evento de divisão, numa lista só.
function secaoMembros(ev, membros) {
  const ehRegional = escopoPorChave(ev.categoria).chave === 'regional';
  return [
    '👥 MEMBROS 👥', '',
    ...(ehRegional ? listaAgrupada(membros) : [rotuloDivisao(ev.categoria), '', ...listaDeIntegrantes(membros)]),
  ];
}

// O texto completo. `membros` são os convocados já resolvidos do cadastro.
export function montarConvocacao(ev, membros, campos, modelo) {
  const c = campos || {};
  const qual = modelo || modeloPadrao(ev);

  if (qual === 'bate-volta') {
    return juntar([
      ...cabecalho(ev, c), '',
      ...(c.horarios ? ['Horários', ...linhasDe(c.horarios).map(l => `⏰ ${l}`), ''] : []),
      SEPARADOR, '',
      '🫂 CONCENTRAÇÃO 🫂', '',
      ...linhasDe(c.concentracao),
      ...(c.linkMapa ? [c.linkMapa] : []), '',
      ...(c.roteiro ? [SEPARADOR, '', '🧭 ROTEIRO 🧭', '', ...linhasDe(c.roteiro), ''] : []),
      SEPARADOR, '',
      ...secaoMembros(ev, membros), '',
      ...LEGENDA_BATE_VOLTA, '',
      SEPARADOR, '',
      ...RESPALDO, '',
      SEPARADOR, '',
      ...ATENCAO, '',
      ...BRIEFING, '',
      SEPARADOR, '',
      ...String(c.informacoes || '').split('\n'),
    ]);
  }

  const horarios = [
    ['Destacamento', c.destacamento],
    ['Briefing', c.briefing],
    ['Início', c.inicio],
  ].filter(([, v]) => v).map(([nome, v]) => `⏰ ${nome}: ${v}`);

  return juntar([
    ...cabecalho(ev, c), '',
    SEPARADOR, '',
    '🎯 DESTINO 🎯', '',
    ...linhasDe(c.destino),
    ...(c.linkMapa ? [c.linkMapa] : []),
    ...(horarios.length ? ['', 'Horários', ...horarios] : []), '',
    SEPARADOR, '',
    ...secaoMembros(ev, membros), '',
    ...LEGENDA_PARTICIPACAO, '',
    ...LEGENDA_OPERACAO, '',
    SEPARADOR, '',
    ...RESPALDO, '',
    SEPARADOR, '',
    ...String(c.informacoes || '').split('\n'),
  ]);
}
