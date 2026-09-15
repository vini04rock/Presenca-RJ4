// Le a convocacao colada do WhatsApp e casa os nomes com o roster.

import { GRAUS, MESES_ABREV, TIPOS_EVENTO, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';

const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu;
function stripEmoji(s) { return s.replace(EMOJI_RE, ''); }

export function normalizarNome(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distancia de edicao simples (Levenshtein) - nomes de membro sao curtos, o
// custo O(n*m) nao pesa.
function distanciaLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const linha = new Array(n + 1);
  for (let j = 0; j <= n; j++) linha[j] = j;
  for (let i = 1; i <= m; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = linha[j];
      linha[j] = a[i - 1] === b[j - 1]
        ? anterior
        : 1 + Math.min(anterior, linha[j], linha[j - 1]);
      anterior = temp;
    }
  }
  return linha[n];
}

// Sugestoes de "quer dizer" para um nome que nao bateu exato - so serve para
// erro de digitacao/apelido parecido; apelido sem nada em comum com o nome
// cadastrado (ex.: alcunha pura) nao e pego, e precisa de escolha manual.
function sugerirCorrespondencias(nomeParsedNorm, candidatos) {
  return candidatos
    .map(m => ({ membro: m, dist: distanciaLevenshtein(nomeParsedNorm, normalizarNome(m.nome)) }))
    .filter(c => c.dist <= Math.max(2, Math.ceil(nomeParsedNorm.length * 0.4)))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map(c => c.membro);
}

// Palavra reconhecida manda sobre o emoji quando os dois aparecem e nao
// batem (ex.: "✅ aguardando" na lista real - erro de digitacao humano, a
// palavra e que vale). Quem nao tem emoji nem palavra nenhuma cai em
// "infracional" junto com quem tem ⭕ explicito - decisao do clube: nao
// responder a convocacao e tratado igual a falta sem justificativa.
function statusDoResto(resto) {
  const semEmoji = stripEmoji(resto).trim();
  const palavra = normalizarNome(semEmoji);
  if (palavra.includes('confirmad')) return 'confirmado';
  if (palavra.includes('aguardand')) return 'aguardando';
  if (palavra.includes('trabalho')) return 'trabalho';
  if (palavra.includes('famil')) return 'familia';
  if (palavra.includes('infracional')) return 'infracional';
  if (palavra.includes('justificad')) return 'justificada';

  const temCheck = resto.includes('✅');
  const temX = resto.includes('❌');
  const temCirculo = resto.includes('⭕');
  const temAlerta = resto.includes('⚠️');

  if (!palavra && !temCheck && !temX && !temCirculo && !temAlerta) return 'infracional'; // nao respondeu
  if (temCheck) return 'confirmado';
  if (temCirculo) return 'infracional';
  if (temX) return 'justificada';
  if (temAlerta) return 'aguardando';
  return 'aguardando';
}

export function parseConvocacaoTexto(texto) {
  const linhas = String(texto || '').split('\n').map(l => l.trim());
  const avisos = [];
  const evento = { nome: '', tipo: '', data: '', horario: '', endereco: '', outros: '' };

  // --- Titulo do evento: a ultima linha nao-vazia antes de uma linha
  // "Evento" (formato com secoes tipo "🎯 DESTINO 🎯"); sem essa linha
  // (formato mais simples, ex.: "Bate volta divisão Barra" logo na
  // primeira linha), usa a primeira linha nao vazia do texto inteiro.
  const idxEvento = linhas.findIndex(l => l.toLowerCase() === 'evento');
  if (idxEvento > 0) {
    for (let i = idxEvento - 1; i >= 0; i--) {
      if (linhas[i]) { evento.nome = stripEmoji(linhas[i]).trim(); break; }
    }
  } else {
    const primeiraLinha = linhas.find(l => l);
    if (primeiraLinha) evento.nome = stripEmoji(primeiraLinha).trim();
  }
  if (evento.nome) {
    const nomeNorm = normalizarNome(evento.nome);
    // Bate por palavra, nao pela frase inteira - "Bate volta" (sem o "e")
    // ainda precisa reconhecer o tipo "Bate e Volta".
    const tipoAchado = TIPOS_EVENTO.find(t => {
      const tokens = normalizarNome(t).split(' ').filter(tok => tok && tok !== 'e' && tok !== 'de');
      return tokens.every(tok => nomeNorm.includes(tok));
    });
    if (tipoAchado) evento.tipo = tipoAchado;
  }

  // --- Data: token tipo "09SET26" (dia+mes abreviado+ano) em qualquer
  // linha, ou "19/07/2026"/"19/07/26" (numerica, com barra) - tenta o
  // primeiro formato antes, ja que "SET" nunca bate com o padrao numerico.
  const matchData = texto.match(/(\d{1,2})\s*([A-ZÇ]{3})\s*(\d{2})\b/i);
  if (matchData) {
    const dia = matchData[1].padStart(2, '0');
    const mesIdx = MESES_ABREV.indexOf(matchData[2].toUpperCase());
    if (mesIdx !== -1) {
      const ano = 2000 + Number(matchData[3]);
      evento.data = `${ano}-${String(mesIdx + 1).padStart(2, '0')}-${dia}`;
    } else {
      avisos.push('Não reconheci o mês na data — confira o campo Data.');
    }
  } else {
    const matchDataNumerica = texto.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
    if (matchDataNumerica) {
      const dia = matchDataNumerica[1].padStart(2, '0');
      const mes = Number(matchDataNumerica[2]);
      const anoBruto = matchDataNumerica[3];
      const ano = anoBruto.length === 2 ? String(2000 + Number(anoBruto)) : anoBruto;
      if (mes >= 1 && mes <= 12) {
        evento.data = `${ano}-${String(mes).padStart(2, '0')}-${dia}`;
      } else {
        avisos.push('Não reconheci a data (mês inválido) — confira o campo Data.');
      }
    }
  }

  // --- Endereco: "Destino: X" numa linha so, ou (formato com secoes) entre
  // a linha "🎯 DESTINO 🎯" e a proxima secao ---
  const idxDestino = linhas.findIndex(l => /destino/i.test(l));
  if (idxDestino !== -1) {
    const matchDestinoInline = linhas[idxDestino].match(/destino\s*:\s*(.+)/i);
    if (matchDestinoInline && matchDestinoInline[1].trim()) {
      evento.endereco = stripEmoji(matchDestinoInline[1]).trim();
    } else {
      const enderecoLinhas = [];
      for (let i = idxDestino + 1; i < linhas.length; i++) {
        const l = linhas[i];
        if (!l) continue;
        if (/^\.{4,}$/.test(l) || /horários/i.test(l) || /⏰/.test(l) || /^resposta\s*:?\s*$/i.test(l)) break;
        if (/^https?:\/\//i.test(l)) { evento.outros = evento.outros ? evento.outros + '\n' + l : l; continue; }
        enderecoLinhas.push(l);
      }
      evento.endereco = enderecoLinhas.join(', ');
    }
  }

  // --- Horarios: Destacamento / Briefing / Inicio ---
  const normalizaHora = (h) => {
    const m = h.match(/(\d{1,2})h(\d{0,2})/i);
    if (!m) return h;
    return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
  };
  const extrasHorario = [];
  linhas.forEach(l => {
    const mIni = l.match(/in[íi]cio[:\s]*([0-9]{1,2}h[0-9]{0,2})/i);
    if (mIni) { evento.horario = normalizaHora(mIni[1]); return; }
    const mDest = l.match(/destacamento[:\s]*([0-9]{1,2}h[0-9]{0,2})/i);
    if (mDest) { extrasHorario.push('Destacamento: ' + normalizaHora(mDest[1])); return; }
    const mBrief = l.match(/briefing[:\s]*([0-9]{1,2}h[0-9]{0,2})/i);
    if (mBrief) { extrasHorario.push('Briefing: ' + normalizaHora(mBrief[1])); return; }
  });
  if (extrasHorario.length) {
    evento.outros = evento.outros ? evento.outros + '\n' + extrasHorario.join(' · ') : extrasHorario.join(' · ');
  }

  // --- Lista de membros ---
  // Duas convencoes vistas na pratica: um cabecalho "👥 MEMBROS 👥" (com
  // numeracao "01. Nome (Grau) status") ou simplesmente uma linha "Lista:"
  // seguida dos nomes sem numero (ex.: "Costa(VI)✅").
  const idxMembros = linhas.findIndex(l => /membros/i.test(l) || /^lista\s*:?\s*$/i.test(l));
  const membrosParsed = [];
  if (idxMembros !== -1) {
    let divisaoAtual = '';
    // Nome tolera qualquer caixa (maiuscula/minuscula/acentuada) - a
    // convocacao real vem toda em CAIXA ALTA, mas um nome digitado errado
    // (ou colado de outro lugar) nao pode sumir da lista silenciosamente.
    // O numero antes do nome e opcional (algumas listas nao numeram); o
    // grau aceita qualquer texto entre parenteses, nao so numeral romano -
    // um grau fora do padrao (ex.: "camisa") ainda entra na lista, so com
    // aviso pra conferir na revisao, em vez de sumir sem explicacao.
    const memberRe = /^(?:(\d{1,3})\.\s*)?([A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 .'\-]*?)\s*\(([^)]+)\)\s*(.*)$/;
    for (let i = idxMembros + 1; i < linhas.length; i++) {
      const l = linhas[i];
      // Fim da lista. Precisa cobrir as duas convenções: Pub e Reunião
      // fecham com "Participação", Bate e Volta fecha com "Legenda". Sem o
      // "Legenda" aqui, a varredura seguia até o fim do texto e lia o
      // contato do rodapé (que tem o formato "NOME (GRAU)") como se fosse
      // mais um integrante - uma lista de 15 voltava com 16.
      // A linha de pontos entra como rede de segurança: toda seção termina
      // numa, então qualquer convenção de legenda futura já para aqui.
      if (/^(participa[çc][ãa]o|legenda|prazo para)/i.test(l)) break;
      if (/^\.{4,}$/.test(l)) break;
      if (/^divis[ãa]o\s+/i.test(l)) { divisaoAtual = l.replace(/^divis[ãa]o\s+/i, 'Divisão ').trim(); continue; }
      const m = l.match(memberRe);
      if (!m) continue;
      const [, numeroBruto, nomeTexto, grauBruto, resto] = m;
      const numero = numeroBruto || String(membrosParsed.length + 1).padStart(2, '0');
      const grau = grauBruto.trim().toUpperCase();
      if (GRAUS.indexOf(grau) === -1) avisos.push(`Grau "${grauBruto.trim()}" (${nomeTexto.trim()}) não reconhecido — confira antes de confirmar.`);
      membrosParsed.push({
        numero,
        nomeTexto: nomeTexto.trim(),
        grauTexto: grau,
        divisaoTexto: divisaoAtual,
        status: statusDoResto(resto),
        direto: resto.includes('🚀'),
        destacado: resto.includes('🚧'),
        acompanhado: resto.includes('🐯'),
        membroId: null,
        ignorado: false,
        sugestoes: []
      });
    }
  } else {
    avisos.push('Não encontrei a lista de membros (procure por uma seção "MEMBROS" ou "Lista:") no texto colado.');
  }

  return { evento, membrosParsed, avisos };
}

// Casa cada membro lido do texto com o cadastro (state.roster), por nome
// normalizado; quem nao bate exato recebe sugestoes por semelhanca. Nao
// muda nada em state.roster - so preenche membroId/sugestoes de cada linha.
export function resolverParsedComRoster(membrosParsed, escopoChave) {
  const candidatosBase = escopoChave === 'regional'
    ? state.roster
    : state.roster.filter(m => m.divisao === escopoPorChave(escopoChave).nome);

  return membrosParsed.map(row => {
    const candidatos = escopoChave === 'regional' && row.divisaoTexto
      ? state.roster.filter(m => normalizarNome(m.divisao).includes(normalizarNome(row.divisaoTexto).replace('divisao ', '')))
      : candidatosBase;
    const pool = candidatos.length ? candidatos : candidatosBase;
    const alvoNorm = normalizarNome(row.nomeTexto);
    const exato = pool.find(m => normalizarNome(m.nome) === alvoNorm);
    if (exato) return { ...row, membroId: exato.id };
    return { ...row, membroId: null, sugestoes: sugerirCorrespondencias(alvoNorm, pool) };
  });
}
