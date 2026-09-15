// Monta o texto da convocação para colar no grupo do WhatsApp.
//
// O molde veio de convocações reais do clube: o que é fixo (faixa, seções,
// legendas, Respaldo RDI) vira constante aqui; o que o app sabe (título,
// data, divisão, lista de integrantes) ele preenche; e o que só o
// organizador sabe na hora (roteiro, pontos de encontro, horários,
// contato) chega em `campos`, preenchido no formulário.
//
// Este módulo só LÊ e devolve texto - não grava nada em lugar nenhum.

import { MESES_ABREV, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { ordenarPorHierarquia } from '../nucleo/util.js';

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
const RESPALDO = [
  'Prazo para a justificativa: 1 dia antes do evento.',
  '',
  'Respaldo RDI',
  '',
  'Art. 14°  São infrações de natureza grave:',
  '',
  'X - Faltar sem motivo justificado a evento oficial do MC.',
];

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

// '19:30' -> '19h30'. Devolve vazio se não houver horário.
function comoHora(valor) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor || '').trim());
  return m ? `${m[1].padStart(2, '0')}h${m[2]}` : String(valor || '').trim();
}

// A lista numerada, na ordem hierárquica (grau, depois cargo, depois nome).
export function listaDeIntegrantes(membros) {
  return ordenarPorHierarquia(membros).map((m, i) =>
    `${String(i + 1).padStart(2, '0')}. ${m.nome.toUpperCase()}${m.grau ? ` (${m.grau})` : ''}`);
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

// Sugestões para o formulário: tudo que dá pra deduzir do evento e do
// cadastro. O organizador ajusta antes de copiar.
export function camposIniciais(ev, roster) {
  const outros = String(ev.outros || '');
  const link = (outros.match(/https?:\/\/\S+/) || [''])[0];
  const achaHora = (rotulo) => {
    const m = new RegExp(rotulo + '\\s*:\\s*(\\d{1,2}[:h]\\d{2})', 'i').exec(outros);
    return m ? comoHora(m[1].replace('h', ':')) : '';
  };
  return {
    subtitulo: '',
    // O endereço é guardado numa linha só, separado por vírgula (ver o
    // parser). Aqui ele volta uma parte por linha, que é como aparece na
    // convocação - o organizador arruma se a quebra cair no lugar errado.
    destino: String(ev.endereco || '').split(', ').join('\n'),
    linkMapa: link,
    destacamento: achaHora('destacamento'),
    briefing: achaHora('briefing'),
    inicio: comoHora(ev.horario),
    informacoes: blocoInformacoes(ev.categoria, roster),
  };
}

// Quem assina o rodapé, por decisão do clube: na divisão é o Subdiretor;
// no Regional, o Operacional. Não é o cargo mais alto - é quem de fato
// responde pela convocação.
const CARGO_QUE_ASSINA = { divisao: 'Subdiretor', regional: 'Operacional' };

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

// O texto completo. `membros` são os convocados já resolvidos do cadastro.
export function montarConvocacao(ev, membros, campos) {
  const c = campos || {};
  const emoji = emojiTipoEvento(ev.tipo);
  const titulo = [emoji, String(ev.nome || '').toUpperCase(), emoji].filter(Boolean).join(' ');
  const rotulo = rotuloDivisao(ev.categoria);
  const horarios = [
    ['Destacamento', c.destacamento],
    ['Briefing', c.briefing],
    ['Início', c.inicio],
  ].filter(([, v]) => v).map(([nome, v]) => `⏰ ${nome}: ${v}`);

  return juntar([
    FAIXA,
    '',
    '*CONVOCAÇÃO GERAL*',
    '*TODOS OS GRAUS*',
    '',
    titulo,
    '',
    'Evento',
    `🗓 ${dataDaConvocacao(ev.data)}`,
    '',
    ...(c.subtitulo ? [String(c.subtitulo).toUpperCase()] : []),
    rotulo,
    '',
    SEPARADOR,
    '',
    '🎯 DESTINO 🎯',
    '',
    ...String(c.destino || '').split('\n').filter(l => l.trim()),
    ...(c.linkMapa ? [c.linkMapa] : []),
    ...(horarios.length ? ['', 'Horários', ...horarios] : []),
    '',
    SEPARADOR,
    '',
    '👥 MEMBROS 👥',
    '',
    rotulo,
    '',
    ...listaDeIntegrantes(membros),
    '',
    ...LEGENDA_PARTICIPACAO,
    '',
    ...LEGENDA_OPERACAO,
    '',
    SEPARADOR,
    '',
    ...RESPALDO,
    '',
    SEPARADOR,
    '',
    ...String(c.informacoes || '').split('\n'),
  ]);
}
