// Monta o texto da chamada para colar no grupo do WhatsApp.
//
// O molde é a chamada oficial do Bonde Regional (Paraíba do Sul, 19/09),
// numa versão limpa: mesmo separador sempre, acentos certos, "PE 1" com
// espaço, sem espaço duplo. A chamada é dividida nos mesmos 8 quadros que a
// tela mostra, na ordem em que aparecem no texto:
//
//   1. Tipo de chamada   tipo do evento + "BONDE REGIONAL - RJ4"
//   2. Informações       destino, data, horário
//   3. Roteiro           os P.E., o destino final e o roteiro do bonde,
//                        montado dos P.E. (cada trecho com as próprias vias)
//   4. Membros           regional: em branco por divisão; divisão: os convocados
//   5. Legenda           fixo
//   6. Regras do clube   padrão do clube; o Regional pode personalizar
//   7. Atenção           idem (checklist da moto + briefing do comboio)
//   8. Responsável       quem assina, salvo por divisão na planilha
//
// Todo evento tem um bonde para chegar até ele - Pub, Reunião, Bate e Volta
// ou Ação Social. Por isso não há mais um modelo por tipo: o tipo só muda a
// primeira linha.
//
// Este módulo só LÊ e devolve texto - não grava nada em lugar nenhum.

import { emojiTipoEvento, escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { ordenarPorHierarquia } from '../nucleo/util.js';

const SEPARADOR = '.'.repeat(44);

// A "estrada" logo abaixo do subtítulo, como na chamada oficial.
const MOTOS = [
  '🏍️       🏍️       🏍️       🏍️',
  '     🏍️       🏍️       🏍️       🏍️',
];

// Quantas linhas em branco cada bloco ganha na lista do Bonde Regional.
const LINHAS_EM_BRANCO = { regional: 5, divisao: 3 };

// Os blocos fixos (quadros 5, 6 e 7). A tela mostra estes mesmos textos,
// então corrigir uma palavra aqui corrige nos dois lugares.
export const LEGENDA = [
  '🐯 Esposa',
  '👨‍👩‍👦 Família',
  '✅ Confirmado',
  '🚘 De carro',
  '⚠️ Aguardando confirmação',
  '❌ Desistência',
];
export const REGRAS = [
  'Prazo para a justificativa: 1 dia antes do evento.',
  '',
  'Respaldo RDI',
  '',
  'Art. 14° São infrações de natureza grave:',
  '',
  'X - Faltar sem motivo justificado a evento oficial do MC.',
];
export const ATENCAO = [
  '⚠️ ATENÇÃO ⚠️',
  '',
  '🏍️ Fazer inspeção na moto antes de pegar estrada.',
  '🏍️ Não esquecer de abastecer.',
  '🏍️ Calibrar os pneus.',
  '🏍️ Conferir e ajustar equipamentos de segurança pessoal.',
  '',
  '⚫ BRIEFING ⚫',
  '',
  '♦️ Formação do comboio.',
  '♦️ Manter a formação do comboio.',
  '♦️ Cumprir a velocidade de cruzeiro estabelecida.',
  '♦️ Repassar sinais de gestos.',
  '♦️ Diretrizes gerais.',
];
const DESPEDIDA = 'Bora rodar!!!!!! 🏍️🌪️';

// Quem assina, por decisão do clube: na divisão é o Subdiretor; no
// Regional, o Operacional. Só serve de sugestão enquanto ninguém salvou um
// responsável para aquela divisão (ver o quadro 8 da tela).
const CARGO_QUE_ASSINA = { divisao: 'Subdiretor', regional: 'Operacional' };

function ehRegional(categoria) {
  return escopoPorChave(categoria).chave === 'regional';
}

// 'Barra - RJ4' -> 'Barra'. É como a chamada escreve o nome da divisão.
function nomeCurto(escopo) {
  return escopo.nome.replace(/\s*-\s*RJ4$/i, '').replace(/\s*RJ4$/i, '').trim();
}

// Cabeçalho de um bloco da lista: "REGIONAL" ou "Divisão Oeste".
function tituloDoBloco(escopo) {
  return escopo.chave === 'regional' ? 'REGIONAL' : 'Divisão ' + nomeCurto(escopo);
}

// A linha do bonde, logo abaixo do tipo.
export function linhaDoBonde(categoria) {
  const e = escopoPorChave(categoria);
  const texto = e.chave === 'regional' ? 'BONDE REGIONAL - RJ4' : 'DIVISÃO ' + e.nome.toUpperCase();
  return `⚙️ ${texto} ⚙️`;
}

// '2026-09-19' -> '19/09'. A chamada oficial não leva o ano.
export function dataDaChamada(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}` : '';
}

// '7', '7h', '7:00', '07h30' -> '07:00h' / '07:30h'. O que não reconhecer
// sai como foi digitado - melhor que sumir com o que a pessoa escreveu.
export function comoHora(valor) {
  const texto = String(valor || '').trim();
  const m = /^(\d{1,2})(?:\s*[:hH]\s*(\d{2})?)?\s*[hH]?$/.exec(texto);
  if (!m || Number(m[1]) > 23) return texto;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}h`;
}

// Texto de várias linhas do formulário -> linhas, sem espaço sobrando no
// fim. As linhas em branco ficam: o juntar() abaixo só não deixa duas
// seguidas.
function linhasDe(valor) {
  return String(valor || '').split('\n').map(l => l.trim());
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

// Um P.E. vazio. A tela começa com um, e "+ Adicionar P.E." acrescenta.
// `vias` são as vias do trecho que SAI deste P.E. (até o próximo, ou até o
// destino) - guardadas no próprio P.E., assim remover um P.E. leva o trecho
// dele junto e não embaralha as vias dos outros.
export function peVazio() {
  return { nome: '', endereco: '', maps: '', concentracao: '', briefing: '', saida: '', vias: '' };
}

// As vias não contam: um P.E. só com vias e sem nome não é um ponto.
function peTemAlgo(pe) {
  return Object.entries(pe || {}).some(([k, v]) => k !== 'vias' && String(v || '').trim());
}

// Os P.E. que entram na chamada, já numerados como saem no texto.
export function pesDaChamada(campos) {
  return ((campos && campos.pes) || []).filter(peTemAlgo);
}

// Para onde vai o trecho que sai do P.E. de índice i: o próximo P.E., ou o
// destino final. É o rótulo do trecho, na tela e no texto.
export function fimDoTrecho(campos, i) {
  const pes = pesDaChamada(campos);
  if (i + 1 < pes.length) return `PE ${i + 2}`;
  return String((campos && campos.destino) || '').trim().toUpperCase() || 'DESTINO';
}

// Regras do clube e Atenção: o texto que o Regional salvou, ou o padrão. Um
// texto salvo vazio volta pro padrão - é assim que "Restaurar padrão" grava.
export const TEXTOS_PADRAO = { regras: REGRAS.join('\n'), atencao: ATENCAO.join('\n') };
export function textoEfetivo(textos, chave) {
  const salvo = String((textos && textos[chave]) || '').trim();
  return salvo ? linhasDe(salvo) : TEXTOS_PADRAO[chave].split('\n');
}

// Sugestões para o formulário: tudo que dá pra deduzir do evento. O
// organizador ajusta antes de copiar.
export function camposIniciais(ev) {
  const outros = String(ev.outros || '');
  const link = (outros.match(/https?:\/\/\S+/) || [''])[0];
  const achaHora = (rotulo) => {
    const m = new RegExp(rotulo + '\\s*:\\s*(\\d{1,2}[:h]\\d{2})', 'i').exec(outros);
    return m ? comoHora(m[1]) : '';
  };
  // O endereço é guardado numa linha só, separado por vírgula, e a primeira
  // parte costuma ser o nome do lugar: ela vira o destino, e o resto, o
  // endereço - senão o nome sairia duas vezes no bloco do 🏁.
  const partes = String(ev.endereco || '').split(',').map(p => p.trim()).filter(Boolean);
  const pe = peVazio();
  pe.concentracao = achaHora('concentração') || achaHora('destacamento');
  pe.briefing = achaHora('briefing');
  pe.saida = achaHora('saída');
  return {
    tipo: ev.tipo || '',
    subtitulo: String(ev.nome || '').trim(),
    destino: partes[0] || '',
    horario: comoHora(ev.horario),
    pes: [pe],
    destinoEndereco: partes.slice(1).join(', '),
    destinoMaps: link,
    roteiro: '',
  };
}

// ---------- a chamada guardada no evento ------------------------------------
// O evento guarda os quadros 1 a 3 (menos o tipo e o horário, que já são
// campos do evento) na coluna "Chamada" da planilha. Assim a chamada abre
// pronta, e o que se muda nela volta pro evento pelo "Salvar no evento".

const CAMPOS_GUARDADOS = ['subtitulo', 'destino', 'destinoEndereco', 'destinoMaps', 'roteiro'];

// Os campos dos quadros a partir do evento. Evento sem chamada guardada
// (os antigos, e os que vieram de convocação colada) cai nas sugestões de
// sempre, deduzidas do endereço e do "Outros".
export function camposDoEvento(ev) {
  const ch = ev && ev.chamada;
  if (!ch || typeof ch !== 'object') return camposIniciais(ev || {});
  const c = { tipo: ev.tipo || '', horario: comoHora(ev.horario) };
  CAMPOS_GUARDADOS.forEach(k => { c[k] = String(ch[k] || ''); });
  // Subtítulo em branco é o nome do evento, como nas sugestões.
  if (!c.subtitulo.trim()) c.subtitulo = String(ev.nome || '').trim();
  c.pes = (Array.isArray(ch.pes) ? ch.pes : []).map(pe => ({ ...peVazio(), ...pe }));
  if (!c.pes.length) c.pes = [peVazio()];
  return c;
}

// O que vai pra coluna "Chamada": só o que tem conteúdo, sem espaço sobrando.
// P.E. totalmente vazio (nem nome, nem vias) não é guardado.
export function chamadaParaGuardar(campos) {
  const c = campos || {};
  const fora = {};
  CAMPOS_GUARDADOS.forEach(k => { fora[k] = String(c[k] || '').trim(); });
  fora.pes = (c.pes || [])
    .map(pe => {
      const limpo = {};
      Object.keys(peVazio()).forEach(k => { limpo[k] = String((pe && pe[k]) || '').trim(); });
      return limpo;
    })
    .filter(pe => Object.values(pe).some(Boolean));
  return fora;
}

// O endereço "de uma linha" do evento, que o resto do app (tela do membro
// antiga, relatórios, planilha) continua lendo: nome do destino + endereço.
export function enderecoDoEvento(campos) {
  return [campos && campos.destino, campos && campos.destinoEndereco]
    .map(v => String(v || '').trim()).filter(Boolean).join(', ');
}

// '07:00h', '7h', '7' -> '07:00', o formato do campo Horário do evento.
// O que não for hora vira vazio.
export function horaParaEvento(texto) {
  const m = /^(\d{2}):(\d{2})h$/.exec(comoHora(texto));
  return m ? `${m[1]}:${m[2]}` : '';
}

// O que o integrante vê na tela do evento: só o essencial, sem o texto
// inteiro da chamada. Onde é, e onde e quando encontrar o bonde. As vias do
// roteiro ficam de fora - são detalhe de quem puxa o bonde, e no celular
// virariam uma parede de texto. null quando o evento não tem chamada
// guardada (aí a tela mostra o endereço de sempre).
export function resumoDoEvento(ev) {
  if (!ev || !ev.chamada || typeof ev.chamada !== 'object') return null;
  const c = camposDoEvento(ev);
  const pes = pesDaChamada(c).map((pe, i) => ({
    numero: i + 1,
    nome: linhasDe(pe.nome).filter(Boolean).join(' · '),
    endereco: String(pe.endereco || '').trim(),
    maps: String(pe.maps || '').trim(),
    horarios: [['Concentração', pe.concentracao], ['Briefing', pe.briefing], ['Saída', pe.saida]]
      .filter(([, v]) => String(v || '').trim())
      .map(([rotulo, v]) => ({ rotulo, hora: comoHora(v) })),
  }));
  return {
    destino: c.destino.trim(),
    endereco: c.destinoEndereco.trim(),
    maps: c.destinoMaps.trim(),
    pes,
  };
}

// O responsável sugerido pelo cadastro, para quando nada foi salvo ainda.
// Sem ninguém no cargo, vem vazio - o texto então sai com "(nome)", que é
// melhor do que uma chamada assinada pela pessoa errada.
export function responsavelDoCadastro(categoria, roster) {
  const e = escopoPorChave(categoria);
  const cargo = ehRegional(categoria) ? CARGO_QUE_ASSINA.regional : CARGO_QUE_ASSINA.divisao;
  const quem = (roster || []).find(m => m.divisao === e.nome && m.cargo === cargo);
  if (!quem) return { nome: '', cargo: '', telefone: '' };
  const sufixo = ehRegional(categoria) ? 'RJ4' : 'Divisão ' + nomeCurto(e);
  return { nome: quem.nome, cargo: `${quem.cargo} ${sufixo}`, telefone: '' };
}

// ---------- os quadros, um por função --------------------------------------

function quadroTipo(ev, c) {
  const tipo = c.tipo || '';
  const emoji = emojiTipoEvento(tipo);
  return [
    ...(tipo ? [[emoji, tipo.toUpperCase(), emoji].filter(Boolean).join(' ')] : []),
    linhaDoBonde(ev.categoria), '',
    ...(c.subtitulo ? [String(c.subtitulo).trim()] : []),
    ...MOTOS,
  ];
}

function quadroInformacoes(ev, c) {
  const data = dataDaChamada(ev.data);
  const hora = comoHora(c.horario);
  return [
    ...(c.destino ? [`🎯 ${String(c.destino).trim()}`] : []),
    ...(data ? [`📅 Data: ${data}`] : []),
    ...(hora ? [`⏰ Horário: ${hora}`] : []),
  ];
}

// Cada P.E. vira um bloco próprio, separado dos outros. A primeira linha
// do nome vai na linha do 📍; as seguintes, logo abaixo (a chamada oficial
// tem "Integração com Bonde RJ3" e o nome do lugar embaixo).
function blocoPe(pe, numero) {
  const [primeira, ...resto] = linhasDe(pe.nome).filter(Boolean);
  const horarios = [
    ['Concentração', pe.concentracao], ['Briefing', pe.briefing], ['Saída', pe.saida],
  ].filter(([, v]) => String(v || '').trim()).map(([nome, v]) => `⏰ ${nome}: ${comoHora(v)}`);
  return [
    `📍 PE ${numero}:${primeira ? ' ' + primeira : ''}`,
    ...resto,
    ...(pe.endereco ? [`📌 Endereço: ${String(pe.endereco).trim()}`] : []),
    ...(pe.maps ? [`🌐 Maps: ${String(pe.maps).trim()}`] : []),
    ...(horarios.length ? ['', ...horarios] : []),
  ];
}

// "* Av. Ayrton Senna" - uma via por linha, com o marcador da chamada
// oficial. Quem já digitou o marcador não ganha um segundo.
function comoVia(linha) {
  return '* ' + linha.replace(/^[*\-•]\s*/, '');
}

// O roteiro do bonde é montado dos P.E.: a sequência no topo, e um trecho
// por P.E. com as vias que a pessoa preencheu. Só entra na chamada quando
// alguém escreveu alguma via ou observação - sem isso seria um roteiro de
// mentira, só com os nomes que já estão nos blocos de cima.
//
// Trecho sem via sai com "* (vias)": o espaço em branco fica visível, igual
// ao "(telefone)" do rodapé.
export function roteiroDoBonde(c) {
  const pes = pesDaChamada(c);
  const obs = linhasDe(c.roteiro);
  const temVia = pes.some(pe => String(pe.vias || '').trim());
  if (!temVia && !obs.some(Boolean)) return [];
  if (!pes.length) return ['🎯 Roteiro do Bonde:', ...obs];

  const destino = String(c.destino || '').trim();
  const fora = [
    '🎯 Roteiro do Bonde:',
    [...pes.map((_, i) => `PE ${i + 1}`), fimDoTrecho(c, pes.length - 1)].join(' → '),
  ];
  pes.forEach((pe, i) => {
    const nome = linhasDe(pe.nome).filter(Boolean);
    const vias = linhasDe(pe.vias).filter(Boolean);
    fora.push('',
      i === 0 ? `📍 PE 1 — Saída` : `📍 PE ${i + 1}`,
      ...nome,
      '',
      `🛣️ TRECHO ${i + 1} — PE ${i + 1} → ${fimDoTrecho(c, i)}`,
      'Sequência das vias:',
      ...(vias.length ? vias.map(comoVia) : ['* (vias)']));
  });
  if (destino) fora.push('', `🏁 ${destino}`);
  if (obs.some(Boolean)) fora.push('', ...obs);
  return fora;
}

function quadroRoteiro(c) {
  const blocos = [];
  pesDaChamada(c).forEach((pe, i) => blocos.push(blocoPe(pe, i + 1)));
  if (c.destino || c.destinoEndereco || c.destinoMaps) {
    blocos.push([
      `🏁 Destino:${c.destino ? ' ' + String(c.destino).trim() : ''}`,
      ...(c.destinoEndereco ? [`📌 Endereço: ${String(c.destinoEndereco).trim()}`] : []),
      ...(c.destinoMaps ? [`🌐 Maps: ${String(c.destinoMaps).trim()}`] : []),
    ]);
  }
  const roteiro = roteiroDoBonde(c);
  if (roteiro.length) blocos.push(roteiro);
  // Os blocos são separados entre si pela mesma linha de pontos do resto.
  const fora = [];
  blocos.forEach((b, i) => {
    if (i) fora.push('', SEPARADOR, '');
    fora.push(...b);
  });
  return fora;
}

// Bonde Regional: a lista sai EM BRANCO, um bloco por divisão, e cada
// integrante se coloca no grupo. Evento de divisão: os convocados daquela
// divisão, em "Nome (Grau)", na ordem hierárquica.
export function quadroMembros(ev, membros) {
  if (ehRegional(ev.categoria)) {
    const fora = ['👥 MEMBROS 👥', 'Colocar NOME e GRAU'];
    // A ordem dos blocos é a da chamada oficial (escoposNaOrdemOficial).
    escoposNaOrdemOficial().forEach(e => {
      const n = e.chave === 'regional' ? LINHAS_EM_BRANCO.regional : LINHAS_EM_BRANCO.divisao;
      fora.push('', tituloDoBloco(e));
      for (let i = 1; i <= n; i++) fora.push(`${i}.`);
    });
    return fora;
  }
  const e = escopoPorChave(ev.categoria);
  const daDivisao = (membros || []).filter(m => m.divisao === e.nome);
  return [
    '👥 MEMBROS 👥', '',
    tituloDoBloco(e),
    ...ordenarPorHierarquia(daDivisao).map((m, i) => `${i + 1}. ${m.nome}${m.grau ? ` (${m.grau})` : ''}`),
  ];
}

// Campo vazio sai como "(nome)" / "(telefone)": um espaço em branco visível
// é melhor que uma chamada que parece completa e não está.
function quadroResponsavel(r) {
  const resp = r || {};
  const nome = String(resp.nome || '').trim() || '(nome)';
  const cargo = String(resp.cargo || '').trim() || '(cargo)';
  const telefone = String(resp.telefone || '').trim() || '(telefone)';
  return [DESPEDIDA, '', 'Informações:', `${nome} - ${cargo}`, `Contato: ${telefone}`];
}

// O texto completo. `membros` são os convocados já resolvidos do cadastro;
// `responsavel` é { nome, cargo, telefone }; `textos` é { regras, atencao },
// o que o Regional personalizou (vazio = o padrão).
export function montarConvocacao(ev, membros, campos, responsavel, textos) {
  const c = campos || {};
  const quadros = [
    quadroTipo(ev, c),
    quadroInformacoes(ev, c),
    quadroRoteiro(c),
    quadroMembros(ev, membros),
    LEGENDA,
    textoEfetivo(textos, 'regras'),
    textoEfetivo(textos, 'atencao'),
  ].filter(q => q.some(l => l));
  const fora = [];
  quadros.forEach(q => fora.push(...q, '', SEPARADOR, ''));
  fora.push(...quadroResponsavel(responsavel));
  return juntar(fora);
}
