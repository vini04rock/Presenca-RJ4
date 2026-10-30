// Imagens pra postar no grupo: o resultado de um evento encerrado e o Rank
// de Presenca. Desenhadas num <canvas>, no visual do app (foto de fundo,
// emblema, Rye), e mostradas numa previa com "Compartilhar" e "Baixar".
//
// A previa nao e so enfeite: o navegador so deixa compartilhar arquivo
// dentro de um toque recente da pessoa, e desenhar leva um instante (fontes
// e imagens carregando). Gerando antes e compartilhando no toque do botao
// da previa, o compartilhamento funciona em todo celular.

import { divisoesSemRegional, emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { IMG_FUNDO, LOGO_SRC } from '../nucleo/imagens.js';
import { diaDaSemana, formatDataBR, mostrarAviso } from '../nucleo/util.js';
import { formatReais, nomeCurtoDoMes, nomeDoMes } from '../dominio/caixinha.js';
import { formatKg } from '../dominio/doacoes.js';
import { destinoPorChave, numeroEstoque, resumoDaLinha, textoQuantidade } from '../dominio/estoque.js';
import { CONTEXTO_DOS_MESES, LEGENDA_CONTEXTO, MESES_NOMES, acoesDoMes, ehEscolhida, mesesDoAno, resumoDoAno, situacaoPorChave } from '../dominio/acoes-sociais.js';
import { divisaoCurta, soFalta } from '../dominio/funcoes-especiais.js';
import { posicoesDoPodio } from './comuns.js';

const L = 1080, A = 1350; // retrato 4:5, o formato que o WhatsApp mostra maior
const COR = {
  marfim: '#F3E6C4', ouro: '#D4A24C', ouroEscuro: '#8A6A2C', texto: '#F2EFE8', apagado: '#A8A49B',
  confirmado: '#5FC98D', justificada: '#E0B24D', infracional: '#D9635A', aguardando: '#9C9890', trilho: 'rgba(255,255,255,0.10)',
};
const MEDALHAS = ['🥇', '🥈', '🥉'];

function carregarImagem(src) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = falha;
    img.src = src;
  });
}

// As fontes do app vem do Google Fonts; o canvas so usa as que ja
// terminaram de carregar - sem esperar, o titulo sairia em fonte comum.
async function prepararFontes() {
  try {
    await Promise.all([
      document.fonts.load('64px Rye'),
      document.fonts.load('600 32px "IBM Plex Sans"'),
      document.fonts.load('700 32px "IBM Plex Sans"'),
    ]);
  } catch (e) { /* sem a fonte, sai na do sistema - melhor que nao sair */ }
}

// `altura`: 4:5 (A) por padrao. O relatorio do mes da Caixinha pede mais
// quando a lista de nomes nao cabe - a imagem cresce pra baixo, em vez de
// espremer os nomes ate ninguem ler.
export async function novaTela(altura = A, largura = L) {
  await prepararFontes();
  const [fundo, logo] = await Promise.all([carregarImagem(IMG_FUNDO), carregarImagem(LOGO_SRC)]);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  // A foto cobrindo tudo, escurecida por cima pra o texto ler bem.
  const escala = Math.max(largura / fundo.width, altura / fundo.height);
  const fw = fundo.width * escala, fh = fundo.height * escala;
  ctx.drawImage(fundo, (largura - fw) / 2, (altura - fh) * 0.35, fw, fh);
  const veu = ctx.createLinearGradient(0, 0, 0, altura);
  veu.addColorStop(0, 'rgba(10,10,10,0.78)');
  veu.addColorStop(0.45, 'rgba(10,10,10,0.70)');
  veu.addColorStop(1, 'rgba(10,10,10,0.92)');
  ctx.fillStyle = veu;
  ctx.fillRect(0, 0, largura, altura);
  return { canvas, ctx, logo };
}

// Retangulo de cantos arredondados (so o caminho - quem chama faz fill ou
// stroke). Feito a mao porque o ctx.roundRect nao existe em iPhone com
// sistema anterior ao iOS 16, e ali a imagem nem sairia.
function retangulo(ctx, x, y, l, a, r) {
  r = Math.min(r, l / 2, a / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + a, r);
  ctx.arcTo(x + l, y + a, x, y + a, r);
  ctx.arcTo(x, y + a, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

function fonte(ctx, tamanho, peso, familia) {
  ctx.font = `${peso || 400} ${tamanho}px ${familia === 'rye' ? 'Rye, serif' : '"IBM Plex Sans", sans-serif'}`;
}

// Texto centralizado que quebra em linhas; devolve o y logo abaixo dele.
// Quantas linhas um texto ocupa na largura dada (com a fonte ja escolhida).
function contarLinhas(ctx, texto, larguraMax) {
  let linhas = 1, atual = '';
  String(texto).split(/\s+/).forEach(p => {
    const tentativa = atual ? atual + ' ' + p : p;
    if (ctx.measureText(tentativa).width > larguraMax && atual) { linhas++; atual = p; } else atual = tentativa;
  });
  return linhas;
}

function textoCentral(ctx, texto, y, alturaLinha, larguraMax) {
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = '';
  palavras.forEach(p => {
    const tentativa = atual ? atual + ' ' + p : p;
    if (ctx.measureText(tentativa).width > larguraMax && atual) { linhas.push(atual); atual = p; } else atual = tentativa;
  });
  if (atual) linhas.push(atual);
  linhas.forEach((l, i) => ctx.fillText(l, L / 2, y + i * alturaLinha));
  return y + linhas.length * alturaLinha;
}

// O titulo no relevo de metal dos titulos do app: sombra escura embaixo e
// borda dourada, com o marfim por cima.
function tituloMetal(ctx, texto, y, tamanho, larguraMax) {
  fonte(ctx, tamanho, 400, 'rye');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#3D2C10';
  textoCentral(ctx, texto, y + 4, tamanho * 1.18, larguraMax);
  ctx.fillStyle = COR.ouroEscuro;
  textoCentral(ctx, texto, y + 2, tamanho * 1.18, larguraMax);
  ctx.fillStyle = COR.marfim;
  return textoCentral(ctx, texto, y, tamanho * 1.18, larguraMax);
}

// Centralizado na imagem, ou em `x` quando vier.
function rotuloEspacado(ctx, texto, y, tamanho, cor, x = L / 2) {
  fonte(ctx, tamanho, 700);
  ctx.textAlign = 'center';
  ctx.fillStyle = cor;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(tamanho * 0.22)}px`;
  ctx.fillText(texto, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function emblema(ctx, logo, y, tamanho) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.drawImage(logo, (L - tamanho) / 2, y, tamanho, tamanho);
  ctx.restore();
}

function rodape(ctx, altura = A) {
  ctx.strokeStyle = 'rgba(212,162,76,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L / 2 - 180, altura - 120);
  ctx.lineTo(L / 2 + 180, altura - 120);
  ctx.stroke();
  rotuloEspacado(ctx, 'INSANOS MC  ·  REGIONAL RJ4', altura - 72, 26, COR.ouro);
  fonte(ctx, 20, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText('DISCIPLINA · RESPEITO · IRMANDADE · SEMPRE', L / 2, altura - 38);
}

// A rosca: as fatias em ordem, comecando no topo, e o % grande no meio.
// fatias = [[valor, cor], ...]; total = a soma de referencia.
function rosca(ctx, cx, cy, r, fatias, total, textoCentro, rotulo) {
  const espessura = Math.round(r * 0.25);
  ctx.lineWidth = espessura;
  ctx.strokeStyle = COR.trilho;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  let inicio = -Math.PI / 2;
  fatias.forEach(([valor, cor]) => {
    if (!valor || !total) return;
    const fim = inicio + (valor / total) * Math.PI * 2;
    ctx.strokeStyle = cor;
    ctx.beginPath(); ctx.arc(cx, cy, r, inicio, fim); ctx.stroke();
    inicio = fim;
  });
  fonte(ctx, Math.round(r * 0.58), 400, 'rye');
  ctx.textAlign = 'center';
  ctx.fillStyle = COR.marfim;
  ctx.textBaseline = 'middle';
  ctx.fillText(textoCentro, cx, cy - r * 0.05);
  rotuloEspacado(ctx, rotulo, cy + r * 0.36, Math.max(16, Math.round(r * 0.12)), COR.apagado);
  ctx.textBaseline = 'alphabetic';
}

// A lista com pódio dos ranks: posicao (ou medalha), nome, barra e %. Cada
// linha e { nome, pct, detalhe } - detalhe e o "5 de 5" ao lado do nome.
// Ja chega ordenada do maior % pro menor.
//
// Quando o numero nao e um % (os kg das Doacoes), a linha traz tambem
// `texto` (o que vai a direita, "3 kg") e `pct` vira so o tamanho da barra
// e a ordem do pódio. `semPodio` desenha so a posicao, sem medalha nem
// brilho - pra uma lista que nao e disputa (os meses da Caixinha).
function listaRanking(ctx, linhas, y, alturaLinha, { semPodio } = {}) {
  const lugares = semPodio ? linhas.map(() => 0) : posicoesDoPodio(linhas.map(x => x.pct));
  linhas.forEach((x, i) => {
    const topo = y + i * alturaLinha;
    const meio = topo + alturaLinha / 2;
    if (lugares[i]) {
      const brilho = ['rgba(224,178,60,0.22)', 'rgba(200,204,212,0.18)', 'rgba(196,128,74,0.20)'][lugares[i] - 1];
      const g = ctx.createLinearGradient(110, 0, L - 110, 0);
      g.addColorStop(0, brilho); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); retangulo(ctx, 110, topo + 6, L - 220, alturaLinha - 12, 16); ctx.fill();
    }
    ctx.textBaseline = 'middle';
    fonte(ctx, 34, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = COR.apagado;
    ctx.fillText(lugares[i] ? MEDALHAS[lugares[i] - 1] : (semPodio ? '•' : `${i + 1}º`), 165, meio);
    fonte(ctx, 31, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    ctx.fillText(x.nome, 215, meio - 13);
    if (x.detalhe) {
      const larguraNome = ctx.measureText(x.nome).width;
      fonte(ctx, 22, 600);
      ctx.fillStyle = COR.apagado;
      ctx.fillText(x.detalhe, 215 + larguraNome + 14, meio - 12);
    }
    // A barra, embaixo do nome.
    const bx = 215, bl = 600, by = meio + 17;
    ctx.fillStyle = COR.trilho;
    ctx.beginPath(); retangulo(ctx, bx, by - 5, bl, 10, 5); ctx.fill();
    if (x.pct) {
      ctx.fillStyle = lugares[i] === 1 ? COR.ouro : COR.marfim;
      ctx.beginPath(); retangulo(ctx, bx, by - 5, Math.max(10, bl * x.pct / 100), 10, 5); ctx.fill();
    }
    fonte(ctx, 38, 400, 'rye');
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.marfim;
    ctx.fillText(x.texto !== undefined ? x.texto : (x.pct === null || x.pct === undefined ? '—' : `${x.pct}%`), L - 130, meio);
    ctx.textBaseline = 'alphabetic';
  });
  ctx.textAlign = 'center';
  return y + linhas.length * alturaLinha;
}

// ---------------------------------------------------------------------------
// Resultado de um evento encerrado. `contagem` e o computeCounts do evento.
export async function imagemResultadoEvento(ev, contagem) {
  const { canvas, ctx, logo } = await novaTela();
  const total = (ev.memberIds || []).length;
  const justificadas = contagem.familia + contagem.trabalho + contagem.justificada;
  // Evento ainda aberto: quem nao respondeu ainda pode responder, entao fica
  // na fatia cinza de Aguardando, e nao somado as faltas.
  const parcial = ev.status !== 'encerrado';
  const aguardando = parcial ? (contagem.aguardando || 0) : 0;
  const naoJustificadas = contagem.infracional + (parcial ? 0 : (contagem.aguardando || 0));
  const pct = total ? Math.round((contagem.confirmado / total) * 100) : 0;

  emblema(ctx, logo, 60, 200);
  rotuloEspacado(ctx, parcial ? 'PARCIAL DO EVENTO' : 'RESULTADO DO EVENTO', 330, 28, COR.ouro);
  // Nome comprido ("PUB REGIONAL & VISITAÇÃO DIVISÃO & ...") diminui a
  // letra ate caber em 3 linhas, em vez de empurrar a rosca pra baixo.
  let tamanhoTitulo = 62;
  for (const t of [62, 54, 46, 40]) {
    tamanhoTitulo = t;
    fonte(ctx, t, 400, 'rye');
    if (contarLinhas(ctx, ev.nome, 920) <= (t > 46 ? 2 : 3)) break;
  }
  let y = tituloMetal(ctx, ev.nome, 400, tamanhoTitulo, 920);

  fonte(ctx, 30, 600);
  ctx.fillStyle = COR.apagado;
  // `origem` troca a divisao pelo nome da funcao nos eventos de Batedor e
  // Caveira, que nao tem divisao nem tipo.
  const meta = [ev.tipo ? `${emojiTipoEvento(ev.tipo)} ${ev.tipo}` : '', [diaDaSemana(ev.data), ev.data ? formatDataBR(ev.data) : ''].filter(Boolean).join(', '),
    ev.origem || escopoPorChave(ev.categoria).nome].filter(Boolean).join('  ·  ');
  y = textoCentral(ctx, meta, y + 6, 40, 960);

  // A rosca: as tres fatias na ordem do app (confirmado, justificada, nao
  // justificada), comecando no topo. Ocupa o espaco entre o texto de cima e
  // a contagem de baixo, que tem lugar fixo acima do rodape - assim nada
  // se sobrepoe, seja o nome curto ou longo.
  const topoRosca = y + 30, baseRosca = A - 280;
  const r = Math.max(110, Math.min(190, (baseRosca - topoRosca) / 2 - 24));
  rosca(ctx, L / 2, (topoRosca + baseRosca) / 2, r,
    [[contagem.confirmado, COR.confirmado], [justificadas, COR.justificada], [naoJustificadas, COR.infracional], [aguardando, COR.aguardando]],
    total, `${pct}%`, parcial ? 'CONFIRMADOS' : 'PRESENÇA');

  y = A - 200;
  fonte(ctx, 40, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${contagem.confirmado} de ${total} ${parcial ? 'confirmados até agora' : 'compareceram'}`, L / 2, y);

  fonte(ctx, 28, 600);
  ctx.fillStyle = COR.apagado;
  // `soFalta`: os eventos de Caveira, que nao tem justificativa - a falta e
  // uma so, o ❌.
  ctx.fillText(ev.soFalta
    ? (parcial
      ? `✅ ${contagem.confirmado} presentes     ❌ ${naoJustificadas} faltaram     ⚠️ ${aguardando} sem marcação`
      : `✅ ${contagem.confirmado} presentes     ❌ ${naoJustificadas} faltaram`)
    : parcial
      ? `✅ ${contagem.confirmado} confirmados     ❌ ${justificadas} justificadas     ⚠️ ${aguardando} aguardando`
      : `✅ ${contagem.confirmado} confirmados     ❌ ${justificadas} justificadas     ⭕ ${naoJustificadas} não justificadas`, L / 2, y + 58);

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// Rank de Presenca: o total do Regional e as divisoes do maior % pro menor,
// com o pódio. `d` e o que o Code.gs devolve (rankPresenca).
export async function imagemRank(d, janela) {
  const { canvas, ctx, logo } = await novaTela();
  const porChave = chave => d.divisoes.find(x => x.chave === chave);
  const totalConvites = d.divisoes.reduce((s, x) => s + x.convites, 0);
  const totalConfirmacoes = d.divisoes.reduce((s, x) => s + x.confirmacoes, 0);
  const totalPct = totalConvites ? Math.round((totalConfirmacoes / totalConvites) * 100) : null;
  const linhas = escoposEmOrdemDeExibicao()
    .map(e => { const item = porChave(e.chave); return { nome: e.nome, pct: item && item.percentual !== undefined ? item.percentual : null }; })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  emblema(ctx, logo, 50, 170);
  let y = tituloMetal(ctx, '🏆 Rank de Presença', 300, 66, 980);
  rotuloEspacado(ctx, janela === '6meses' ? 'ÚLTIMOS 6 MESES' : 'DESDE SEMPRE', y + 4, 24, COR.ouro);

  // O total da RJ4 inteira, num quadro de vidro.
  y += 50;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.strokeStyle = 'rgba(212,162,76,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); retangulo(ctx, 110, y, L - 220, 110, 22); ctx.fill(); ctx.stroke();
  fonte(ctx, 34, 400, 'rye');
  ctx.textAlign = 'left';
  ctx.fillStyle = COR.marfim;
  ctx.fillText('Total Regional RJ4', 150, y + 68);
  fonte(ctx, 52, 400, 'rye');
  ctx.textAlign = 'right';
  ctx.fillText(totalPct === null ? '—' : `${totalPct}%`, L - 150, y + 74);

  // Uma linha por divisao.
  y += 160;
  listaRanking(ctx, linhas, y, Math.min(96, (A - 190 - y) / linhas.length));

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// Uma rodada de Insight: quantos fizeram e o ranking das divisoes NAQUELA
// rodada (o pódio e de quem foi melhor no dia). `r` e a rodada como vem do
// historico - cada membro com a divisao e o "fez" do dia. Sem nomes de
// quem nao fez: a imagem circula, e a cobranca individual e do texto.
export async function imagemRodadaInsight(r) {
  const { canvas, ctx, logo } = await novaTela();
  const membros = r.membros || [];
  const fizeram = membros.filter(m => m.fez).length;
  const total = membros.length || r.totalElegiveis || 0;
  const pct = total ? Math.round((fizeram / total) * 100) : 0;
  const linhas = divisoesSemRegional()
    .map(e => {
      const daDivisao = membros.filter(m => m.divisao === e.nome);
      const feitos = daDivisao.filter(m => m.fez).length;
      return { nome: e.nome, total: daDivisao.length, pct: daDivisao.length ? Math.round((feitos / daDivisao.length) * 100) : null, detalhe: `${feitos} de ${daDivisao.length}` };
    })
    .filter(x => x.total > 0)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  emblema(ctx, logo, 50, 160);
  let y = tituloMetal(ctx, '💡 Insight da Rodada', 290, 62, 980);
  const dataTexto = [diaDaSemana(r.data), r.data ? formatDataBR(r.data) : ''].filter(Boolean).join(', ');
  rotuloEspacado(ctx, dataTexto.toUpperCase(), y + 2, 24, COR.ouro);

  const raio = 125;
  const cy = y + 60 + raio;
  rosca(ctx, L / 2, cy, raio, [[fizeram, COR.confirmado], [total - fizeram, COR.infracional]], total, `${pct}%`, 'FIZERAM');
  y = cy + raio + 70;
  fonte(ctx, 36, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${fizeram} de ${total} fizeram`, L / 2, y);

  y += 40;
  listaRanking(ctx, linhas, y, Math.min(92, (A - 170 - y) / Math.max(1, linhas.length)));

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// O relatorio completo do Insight no periodo: a media geral, o ranking das
// divisoes e os destaques - quem mais fez. `d` e o mesmo objeto que a aba
// "Relatorio completo" desenha (o do servidor, ou o refeito pro periodo).
export async function imagemRelatorioInsight(d, rotuloPeriodo) {
  const { canvas, ctx, logo } = await novaTela();
  const totalMarcacoes = d.membros.reduce((s, m) => s + m.rodadas, 0);
  const totalFez = d.membros.reduce((s, m) => s + m.confirmacoes, 0);
  const pct = totalMarcacoes ? Math.round((totalFez / totalMarcacoes) * 100) : 0;
  const porChave = chave => d.divisoes.find(x => x.chave === chave);
  const linhas = divisoesSemRegional()
    .map(e => { const item = porChave(e.chave); return { nome: e.nome, pct: item && item.percentual !== undefined ? item.percentual : null }; })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  // Destaques: quem mais fez, entre quem teve rodada no periodo. Empate no %
  // desempata por quem fez mais rodadas.
  const destaques = d.membros
    .filter(m => m.rodadas > 0 && m.percentual !== null)
    .sort((a, b) => b.percentual - a.percentual || b.confirmacoes - a.confirmacoes || a.nome.localeCompare(b.nome))
    .slice(0, 5);

  emblema(ctx, logo, 45, 150);
  let y = tituloMetal(ctx, '💡 Rank de Insights', 275, 62, 980);
  const rodadasTexto = `${d.rodadas} ${d.rodadas === 1 ? 'RODADA' : 'RODADAS'}`;
  rotuloEspacado(ctx, `${rotuloPeriodo.toUpperCase()}  ·  ${rodadasTexto}`, y + 2, 22, COR.ouro);

  const raio = 105;
  const cy = y + 50 + raio;
  rosca(ctx, L / 2, cy, raio, [[totalFez, COR.confirmado], [totalMarcacoes - totalFez, COR.infracional]], totalMarcacoes, `${pct}%`, 'MÉDIA');
  y = cy + raio + 40;

  const espacoDestaques = destaques.length ? 150 : 0;
  y = listaRanking(ctx, linhas, y, Math.min(84, (A - 170 - espacoDestaques - y) / Math.max(1, linhas.length)));

  if (destaques.length) {
    rotuloEspacado(ctx, '⭐ DESTAQUES', y + 46, 24, COR.ouro);
    fonte(ctx, 28, 600);
    ctx.fillStyle = COR.texto;
    textoCentral(ctx, destaques.map(m => `${m.nome} ${m.percentual}%`).join('  ·  '), y + 92, 38, 940);
  }

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// O Relatorio individual de um integrante: a presenca na divisao (com a
// rosca), cada tipo, os eventos do Regional e o Insight, os mesmos numeros
// da tela e do texto. `r` e o montarRelatorioIndividual.
export async function imagemRelatorioIndividual(r, rotuloPeriodo) {
  const { canvas, ctx, logo } = await novaTela();
  const m = r.membro;
  emblema(ctx, logo, 45, 140);
  let tamanho = 60;
  fonte(ctx, tamanho, 400, 'rye');
  while (tamanho > 40 && ctx.measureText(m.nome).width > 940) { tamanho -= 4; fonte(ctx, tamanho, 400, 'rye'); }
  let y = tituloMetal(ctx, m.nome, 262, tamanho, 960);
  rotuloEspacado(ctx, [m.grau ? `GRAU ${m.grau}` : '', m.cargo, m.divisao].filter(Boolean).join('  ·  ').toUpperCase(), y + 2, 22, COR.ouro);
  fonte(ctx, 24, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`📄 Relatório individual · ${rotuloPeriodo}`, L / 2, y + 42);
  y += 42;

  const g = r.divisao && r.divisao.geral;
  const raio = 115;
  const cy = y + 50 + raio;
  if (g) {
    rosca(ctx, L / 2, cy, raio, [[g.confirmado, COR.confirmado], [g.justificada, COR.justificada], [g.infracional, COR.infracional]],
      g.convites, g.percentual === null ? '—' : `${g.percentual}%`, 'PRESENÇA');
  } else {
    rosca(ctx, L / 2, cy, raio, [], 0, '—', 'SEM EVENTOS');
  }
  y = cy + raio + 50;
  if (g) {
    fonte(ctx, 30, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText(`${g.confirmado} de ${g.convites} ${g.convites === 1 ? 'evento' : 'eventos'} da divisão`, L / 2, y);
    fonte(ctx, 26, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(`✅ ${g.confirmado}     ❌ ${g.justificada} justificadas     ⭕ ${g.infracional} não justificadas`, L / 2, y + 44);
    y += 80;
  }

  const linhas = [];
  if (r.divisao) r.divisao.porTipo.forEach(t => linhas.push({ nome: `${emojiTipoEvento(t.tipo)} ${t.tipo}`, pct: t.resumo.percentual, detalhe: `${t.resumo.confirmado} de ${t.resumo.convites}` }));
  if (r.regional) linhas.push({ nome: '🏛️ Eventos do Regional', pct: r.regional.geral.percentual, detalhe: `${r.regional.geral.confirmado} de ${r.regional.geral.convites}` });
  if (r.insight && r.insight.rodadas) linhas.push({ nome: '💡 Insight', pct: r.insight.percentual, detalhe: `${r.insight.fez} de ${r.insight.rodadas}` });
  if (linhas.length) listaRanking(ctx, linhas, y, Math.min(92, (A - 170 - y) / linhas.length), { semPodio: true });

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// A carteirinha do integrante (30/10/2026): a foto (ou o emblema) e o que o
// app sabe dele em cima; embaixo, num quadro, os dados da ficha. `c` traz
// tudo pronto: { nome, linhaGrau, funcoes, ingresso, pct, foto, campos }.
// `campos` sao linhas de um ou dois [rotulo, valor] (dois = duas colunas);
// valor vazio sai como "—".
export async function imagemCarteirinha(c) {
  const { canvas, ctx, logo } = await novaTela();
  const lado = 230, topo = 60;
  let foto = null;
  if (c.foto) { try { foto = await carregarImagem(c.foto); } catch (e) { /* sem a foto, vai o emblema */ } }
  if (foto) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(L / 2, topo + lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(foto, L / 2 - lado / 2, topo, lado, lado);
    ctx.restore();
    ctx.strokeStyle = COR.ouro;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(L / 2, topo + lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    emblema(ctx, logo, topo, lado);
  }

  let tamanho = 60;
  fonte(ctx, tamanho, 400, 'rye');
  while (tamanho > 40 && ctx.measureText(c.nome).width > 940) { tamanho -= 4; fonte(ctx, tamanho, 400, 'rye'); }
  let y = tituloMetal(ctx, c.nome, topo + lado + 80, tamanho, 960);
  if (c.linhaGrau) rotuloEspacado(ctx, c.linhaGrau.toUpperCase(), y + 2, 22, COR.ouro);
  y += 44;
  ctx.textAlign = 'center';
  if (c.funcoes) {
    fonte(ctx, 24, 600);
    ctx.fillStyle = COR.texto;
    ctx.fillText(caber(ctx, c.funcoes, 960), L / 2, y);
    y += 38;
  }
  fonte(ctx, 22, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(caber(ctx, `🗓️ ${c.ingresso}`, 960), L / 2, y);
  if (c.pct !== null && c.pct !== undefined) {
    fonte(ctx, 26, 700);
    ctx.fillStyle = COR.marfim;
    ctx.fillText(`📊 ${c.pct}% de presença`, L / 2, y + 40);
    y += 40;
  }

  // O quadro dos dados: rotulo em ouro, valor embaixo.
  const qx = 70, qy = y + 36, ql = L - 140, qa = A - 150 - qy;
  ctx.beginPath();
  retangulo(ctx, qx, qy, ql, qa, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,162,76,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const passo = Math.min(118, (qa - 30) / c.campos.length);
  const coluna = (ql - 72 - 40) / 2;
  ctx.textAlign = 'left';
  c.campos.forEach((linha, i) => {
    const ly = qy + 26 + i * passo;
    linha.forEach(([rotulo, valor], j) => {
      const x = qx + 36 + j * (coluna + 40);
      const largura = linha.length === 1 ? ql - 72 : coluna;
      fonte(ctx, 19, 700);
      ctx.fillStyle = COR.ouro;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText(caber(ctx, rotulo.toUpperCase(), largura), x, ly + 20);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      fonte(ctx, Math.min(32, passo * 0.34), 600);
      ctx.fillStyle = valor ? COR.texto : COR.apagado;
      ctx.fillText(caber(ctx, valor || '—', largura), x, ly + 20 + Math.min(44, passo * 0.46));
    });
  });
  ctx.textAlign = 'center';

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// O Resumo dos Relatorios: a presenca total e a de cada tipo, cada um no
// proprio periodo. Sem nomes - quem faltou e do texto. `d` e o mesmo
// objeto do textoResumoRelatorios.
export async function imagemResumoRelatorios(d) {
  const { canvas, ctx, logo } = await novaTela();
  const periodo = (m) => (m === 1 ? 'ÚLTIMO MÊS' : `ÚLTIMOS ${m} MESES`);
  const r = d.total.r;
  const sp = r.statusPeriodo;
  emblema(ctx, logo, 45, 150);
  let y = tituloMetal(ctx, '📋 Relatório de Presença', 275, 58, 980);
  rotuloEspacado(ctx, `${d.escopo.toUpperCase()}${d.filtro ? '  ·  ' + d.filtro.toUpperCase() : ''}`, y + 2, 22, COR.ouro);
  if (d.datas) {
    fonte(ctx, 24, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(d.datas, L / 2, y + 40);
    y += 30;
  }

  const raio = 115;
  const cy = y + 55 + raio;
  rosca(ctx, L / 2, cy, raio, [[sp.confirmado, COR.confirmado], [sp.justificada, COR.justificada], [sp.infracional, COR.infracional]],
    sp.confirmado + sp.justificada + sp.infracional, r.pct === null ? '—' : `${r.pct}%`, 'PRESENÇA');
  y = cy + raio + 50;
  fonte(ctx, 30, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`🏁 Total · ${periodo(d.total.meses).toLowerCase()} · ${r.eventosNoPeriodo} ${r.eventosNoPeriodo === 1 ? 'evento' : 'eventos'}`, L / 2, y);
  fonte(ctx, 26, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`✅ ${sp.confirmado}     ❌ ${sp.justificada} justificadas     ⭕ ${sp.infracional} não justificadas`, L / 2, y + 44);

  y += 80;
  const linhas = d.tipos.map(t => ({
    nome: `${t.emoji} ${t.tipo}`, pct: t.r.pct,
    detalhe: `${t.r.eventosNoPeriodo} ${t.r.eventosNoPeriodo === 1 ? 'evento' : 'eventos'} · ${t.meses === 1 ? '1 mês' : t.meses + ' meses'}`,
  }));
  listaRanking(ctx, linhas, y, Math.min(96, (A - 170 - y) / Math.max(1, linhas.length)), { semPodio: true });

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// As estatisticas de uma funcao especial (Batedores ou Caveiras) no
// periodo: a presenca geral e cada evento, do mais recente pro mais antigo,
// num cartao com data, nome e a pizza dele. Varias imagens do mesmo tamanho
// quando os eventos nao cabem numa (como o relatorio da Caixinha): a 1a com
// a rosca geral e 4 eventos, as seguintes com 6. Os integrantes ficam na
// imagem das individuais. `r` e o estatisticasFuncao.
const EVENTOS_NA_PRIMEIRA = 4, EVENTOS_POR_PAGINA = 6, ALTURA_CARTAO = 134, ESPACO_CARTAO = 12;

// Quebra o texto em linhas que cabem na largura (com a fonte ja escolhida).
function quebrarLinhas(ctx, texto, larguraMax) {
  const linhas = [];
  let atual = '';
  String(texto).split(/\s+/).forEach(p => {
    const tentativa = atual ? atual + ' ' + p : p;
    if (ctx.measureText(tentativa).width > larguraMax && atual) { linhas.push(atual); atual = p; } else atual = tentativa;
  });
  if (atual) linhas.push(atual);
  return linhas;
}

// O nome do evento em ate 2 linhas: diminui a letra ate caber e, se nem
// assim, corta a 2a linha com reticencias. Nunca passa da largura.
function nomeEmDuasLinhas(ctx, texto, larguraMax) {
  let tamanho = 30, linhas;
  do {
    fonte(ctx, tamanho, 700);
    linhas = quebrarLinhas(ctx, texto, larguraMax);
    if (linhas.length <= 2) return { tamanho, linhas };
    tamanho -= 2;
  } while (tamanho >= 22);
  let ultima = linhas.slice(1).join(' ');
  while (ultima.length > 1 && ctx.measureText(ultima + '…').width > larguraMax) ultima = ultima.slice(0, -1);
  return { tamanho: tamanho + 2, linhas: [linhas[0], ultima.trimEnd() + '…'] };
}

// A pizza pequena de um evento, com o % no meio.
function pizzaEvento(ctx, cx, cy, r, c) {
  const espessura = Math.round(r * 0.3);
  ctx.lineWidth = espessura;
  ctx.strokeStyle = COR.trilho;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  let inicio = -Math.PI / 2;
  [[c.confirmado, COR.confirmado], [c.justificadas, COR.justificada], [c.infracional, COR.infracional]].forEach(([valor, cor]) => {
    if (!valor || !c.total) return;
    const fim = inicio + (valor / c.total) * Math.PI * 2;
    ctx.strokeStyle = cor;
    ctx.beginPath(); ctx.arc(cx, cy, r, inicio, fim); ctx.stroke();
    inicio = fim;
  });
  const texto = c.pct === null ? '—' : `${c.pct}%`;
  fonteQueCabe(ctx, texto, (r - espessura / 2) * 1.7, Math.round(r * 0.55), 400, 'rye');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COR.marfim;
  ctx.fillText(texto, cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
}

function cartaoEvento(ctx, ev, c, y, emojiFalta) {
  const x = 90, largura = L - 180, h = ALTURA_CARTAO, meio = y + h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); retangulo(ctx, x, y, largura, h, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(212,162,76,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath(); retangulo(ctx, x, y, largura, h, 22); ctx.stroke();

  // A data, a esquerda, com o dia da semana embaixo.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fonte(ctx, 38, 400, 'rye');
  ctx.fillStyle = COR.marfim;
  ctx.fillText(ev.data ? formatDataBR(ev.data).slice(0, 5) : '—', x + 95, meio - 14);
  rotuloEspacado(ctx, ev.data ? diaDaSemana(ev.data).slice(0, 3).toUpperCase() : 'SEM DATA', meio + 26, 18, COR.ouro, x + 95);
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(212,162,76,0.30)';
  ctx.beginPath(); ctx.moveTo(x + 190, y + 24); ctx.lineTo(x + 190, y + h - 24); ctx.stroke();

  // O nome no meio (ate 2 linhas) e quantos foram.
  const xNome = x + 215, larguraNome = largura - 215 - 140;
  const nome = nomeEmDuasLinhas(ctx, ev.nome, larguraNome);
  const alturaLinha = nome.tamanho * 1.18;
  const detalhe = `${c.confirmado} de ${c.total} presentes`
    + (c.justificadas ? `  ·  ❌ ${c.justificadas}` : '') + (c.infracional ? `  ·  ${emojiFalta} ${c.infracional}` : '');
  const blocoAltura = nome.linhas.length * alturaLinha + 34;
  let ty = meio - blocoAltura / 2 + alturaLinha / 2;
  ctx.textAlign = 'left';
  fonte(ctx, nome.tamanho, 700);
  ctx.fillStyle = COR.texto;
  nome.linhas.forEach(l => { ctx.fillText(l, xNome, ty); ty += alturaLinha; });
  fonte(ctx, 21, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(detalhe, xNome, ty - alturaLinha / 2 + 22);
  ctx.textBaseline = 'alphabetic';

  // A pizza do evento, a direita.
  pizzaEvento(ctx, x + largura - 72, meio, 44, c);
}

export async function imagemEstatisticasFuncao(r, f, rotuloPeriodo) {
  const g = r.geral;
  // Nos Caveiras a falta e uma so (r ja vem com elas somadas).
  const semJustificativa = soFalta(f.chave);
  const grupos = [r.porEvento.slice(0, EVENTOS_NA_PRIMEIRA)];
  for (let i = EVENTOS_NA_PRIMEIRA; i < r.porEvento.length; i += EVENTOS_POR_PAGINA) grupos.push(r.porEvento.slice(i, i + EVENTOS_POR_PAGINA));
  const paginas = grupos.length;
  const subtitulo = `${rotuloPeriodo.toUpperCase()}  ·  ${r.eventos} ${r.eventos === 1 ? 'EVENTO' : 'EVENTOS'}`;
  const telas = [];

  for (let p = 0; p < paginas; p++) {
    const { canvas, ctx, logo } = await novaTela();
    let y;
    if (p === 0) {
      emblema(ctx, logo, 40, 130);
      y = tituloMetal(ctx, `${f.selo} ${f.nome}`, 245, 60, 980);
      rotuloEspacado(ctx, subtitulo, y + 2, 22, COR.ouro);
      const raio = 92;
      const cy = y + 42 + raio;
      rosca(ctx, L / 2, cy, raio, [[g.confirmados, COR.confirmado], [g.justificadas, COR.justificada], [g.naoJustificadas, COR.infracional]],
        g.convites, g.pct === null ? '—' : `${g.pct}%`, 'PRESENÇA');
      fonte(ctx, 24, 600);
      ctx.textAlign = 'center';
      ctx.fillStyle = COR.texto;
      ctx.fillText(semJustificativa
        ? `✅ ${g.confirmados} ${g.confirmados === 1 ? 'presença' : 'presenças'}    ❌ ${g.naoJustificadas} ${g.naoJustificadas === 1 ? 'falta' : 'faltas'}`
        : `✅ ${g.confirmados} ${g.confirmados === 1 ? 'presença' : 'presenças'}    ❌ ${g.justificadas} ${g.justificadas === 1 ? 'justificada' : 'justificadas'}    ⭕ ${g.naoJustificadas} não justif.`, L / 2, cy + raio + 44);
      y = cy + raio + 76;
    } else {
      emblema(ctx, logo, 34, 96);
      y = tituloMetal(ctx, `${f.selo} ${f.nome}`, 186, 50, 980);
      rotuloEspacado(ctx, subtitulo, y + 2, 20, COR.ouro);
      y += 36;
    }
    grupos[p].forEach(({ ev, c }, i) => cartaoEvento(ctx, ev, c, y + i * (ALTURA_CARTAO + ESPACO_CARTAO), semJustificativa ? '❌' : '⭕'));
    // A numeracao no canto de cima: embaixo, a 1a imagem ja esta cheia.
    if (paginas > 1) rotuloEspacado(ctx, `${p + 1} / ${paginas}`, 70, 22, COR.apagado, L - 100);
    rodape(ctx);
    telas.push(canvas);
  }
  return paginas === 1 ? telas[0] : telas;
}

// As estatisticas individuais de uma funcao: o pódio de quem mais foi. Como
// as outras imagens, sem nome de quem faltou - isso e do texto.
export async function imagemIndividuaisFuncao(r, f, rotuloPeriodo) {
  const { canvas, ctx, logo } = await novaTela();
  const linhas = r.porIntegrante.filter(p => p.pct > 0).slice(0, 8).map(p => ({
    nome: p.nome, pct: p.pct, detalhe: `${divisaoCurta(p.divisao)} · ${p.confirmados} de ${p.eventos}` }));

  emblema(ctx, logo, 45, 150);
  let y = tituloMetal(ctx, `${f.selo} ${f.nome}`, 275, 62, 980);
  rotuloEspacado(ctx, `ESTATÍSTICAS INDIVIDUAIS  ·  ${rotuloPeriodo.toUpperCase()}`, y + 2, 22, COR.ouro);
  y += 70;
  if (linhas.length) {
    listaRanking(ctx, linhas, y, Math.min(110, (A - 170 - y) / linhas.length));
  } else {
    fonte(ctx, 30, 600);
    ctx.fillStyle = COR.apagado;
    textoCentral(ctx, 'Nenhuma presença no período.', y + 120, 40, 900);
  }

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// Doacoes de alimento no periodo: o cumprimento da divisao (dos que foram,
// quantos levaram), o total arrecadado e quem mais levou. Como as outras,
// sem nome de quem nao levou - isso e do texto. `r` e o rankDoacoes.
export async function imagemDoacoes(r, nomeDivisao, rotuloPeriodo) {
  const { canvas, ctx, logo } = await novaTela();
  const pct = r.cumprimento === null ? 0 : r.cumprimento;
  const doaram = r.membros.filter(m => m.kg > 0).slice(0, 5);
  const maior = doaram.length ? doaram[0].kg : 0;
  const linhas = doaram.map(m => ({ nome: m.nome, pct: maior ? Math.round((m.kg / maior) * 100) : 0,
    texto: formatKg(m.kg), detalhe: m.grau || '' }));

  emblema(ctx, logo, 45, 150);
  let y = tituloMetal(ctx, '🥫 Doações de Alimento', 275, 58, 980);
  rotuloEspacado(ctx, `${nomeDivisao.toUpperCase()}  ·  ${rotuloPeriodo.toUpperCase()}`, y + 2, 22, COR.ouro);

  const raio = 105;
  const cy = y + 50 + raio;
  rosca(ctx, L / 2, cy, raio, [[r.presencasComDoacao, COR.confirmado], [r.presencas - r.presencasComDoacao, COR.infracional]],
    r.presencas, r.cumprimento === null ? '—' : `${pct}%`, 'CUMPRIMENTO');
  y = cy + raio + 62;
  fonte(ctx, 40, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${formatKg(r.totalKg)} arrecadados`, L / 2, y);
  fonte(ctx, 24, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`em ${r.eventosComDoacao} ${r.eventosComDoacao === 1 ? 'evento' : 'eventos'}  ·  regra: 1 kg por evento`, L / 2, y + 38);

  if (linhas.length) {
    y += 100;
    rotuloEspacado(ctx, '🏆 QUEM MAIS LEVOU', y, 24, COR.ouro);
    listaRanking(ctx, linhas, y + 14, Math.min(88, (A - 170 - y) / linhas.length));
  }

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// Caixinha no periodo: o % em dia da divisao e quantos pagaram em cada mes.
// Sem nome nenhum - nem de quem deve, nem de quem pagou: na caixinha o
// numero do grupo e o que interessa mostrar. `r` e o rankCaixinha.
// `v` e o vocabularioCaixinha: na caixinha do Regional, "divisoes" e
// "contribuiram" no lugar de "integrantes" e "pagaram".
const VOCAB_PADRAO = { quem: 'integrante', quemPlural: 'integrantes', pagou: 'pagou', pagaram: 'pagaram', naoPagou: 'não pagou', naoPagaram: 'não pagaram' };

export async function imagemCaixinha(r, nomeDivisao, rotuloPeriodo, v = VOCAB_PADRAO) {
  const { canvas, ctx, logo } = await novaTela();
  const meses = r.meses.slice(0, 6).reverse();
  const linhas = meses.map(m => ({ nome: nomeDoMes(m.mes), pct: m.pct, detalhe: `${m.pagaram} de ${m.total}` }));

  emblema(ctx, logo, 45, 150);
  let y = tituloMetal(ctx, '💰 Caixinha', 275, 62, 980);
  rotuloEspacado(ctx, `${nomeDivisao.toUpperCase()}  ·  ${rotuloPeriodo.toUpperCase()}`, y + 2, 22, COR.ouro);

  const raio = 115;
  const cy = y + 55 + raio;
  rosca(ctx, L / 2, cy, raio, [[r.pagamentos, COR.confirmado], [r.cobrancas - r.pagamentos, COR.infracional]],
    r.cobrancas, r.pct === null ? '—' : `${r.pct}%`, 'EM DIA');
  y = cy + raio + 62;
  fonte(ctx, 36, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${r.emDia.length} ${r.emDia.length === 1 ? v.quem : v.quemPlural} com tudo em dia`, L / 2, y);

  if (linhas.length) {
    y += 46;
    listaRanking(ctx, linhas, y, Math.min(90, (A - 170 - y) / linhas.length), { semPodio: true });
  }

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// O relatorio de UM mes da Caixinha: a pizza de quem pagou e quem nao pagou,
// e as duas listas de nomes - ✅ quem pagou, ❌ quem nao pagou, os emojis da
// confirmacao de presenca. Diferente das outras imagens, esta leva o nome de
// quem nao pagou: decisao do clube (18/10/2026), so pra este relatorio.
// `r` e o relatorioMesCaixinha.

// Corta o nome com "…" quando nao cabe na coluna (com a fonte ja escolhida).
function caber(ctx, texto, larguraMax) {
  if (ctx.measureText(texto).width <= larguraMax) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + '…').width > larguraMax) t = t.slice(0, -1);
  return t + '…';
}

// Pizza de verdade (fatias cheias), com uma linha escura separando as fatias.
function pizza(ctx, cx, cy, raio, fatias) {
  const total = fatias.reduce((s, [v]) => s + v, 0);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = COR.trilho;
  ctx.beginPath(); ctx.arc(cx, cy, raio, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (!total) return;
  let inicio = -Math.PI / 2;
  fatias.forEach(([valor, cor]) => {
    if (!valor) return;
    const fim = inicio + (valor / total) * Math.PI * 2;
    ctx.fillStyle = cor;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, raio, inicio, fim); ctx.closePath(); ctx.fill();
    inicio = fim;
  });
  // A divisa entre as fatias (so quando ha duas) e o aro dourado em volta.
  if (fatias.filter(([v]) => v).length > 1) {
    ctx.strokeStyle = 'rgba(10,10,10,0.85)';
    ctx.lineWidth = 5;
    let a = -Math.PI / 2;
    fatias.forEach(([valor]) => {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + raio * Math.cos(a), cy + raio * Math.sin(a)); ctx.stroke();
      a += (valor / total) * Math.PI * 2;
    });
  }
  ctx.strokeStyle = 'rgba(212,162,76,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, raio + 2, 0, Math.PI * 2); ctx.stroke();
}

// Uma coluna da lista: o painel de vidro, o titulo colorido e um nome por
// linha, cada um com o emoji do lado.
function colunaNomes(ctx, x, y, largura, alturaLinha, titulo, cor, emoji, membros) {
  const altura = 70 + Math.max(1, membros.length) * alturaLinha + 18;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); retangulo(ctx, x, y, largura, altura, 22); ctx.fill();
  ctx.strokeStyle = cor;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.beginPath(); retangulo(ctx, x, y, largura, altura, 22); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  fonte(ctx, 26, 700);
  ctx.fillStyle = cor;
  ctx.fillText(titulo, x + 26, y + 38);

  fonte(ctx, 28, 600);
  ctx.fillStyle = COR.texto;
  if (!membros.length) {
    ctx.fillStyle = COR.apagado;
    ctx.fillText('Ninguém', x + 26, y + 70 + alturaLinha / 2);
  }
  membros.forEach((m, i) => {
    const nome = m.nome + (m.grau ? ` (${m.grau})` : '');
    ctx.fillText(`${emoji} ${caber(ctx, nome, largura - 90)}`, x + 26, y + 70 + i * alturaLinha + alturaLinha / 2);
  });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  return y + altura;
}

export async function imagemMesCaixinha(r, nomeDivisao, v = VOCAB_PADRAO) {
  const alturaLinha = 46;
  const topoLista = 800;
  const maisLonga = Math.max(1, r.pagaram.length, r.naoPagaram.length);
  const altura = Math.max(A, topoLista + 70 + maisLonga * alturaLinha + 18 + 190);
  const { canvas, ctx, logo } = await novaTela(altura);

  emblema(ctx, logo, 40, 140);
  let y = tituloMetal(ctx, '💰 Caixinha', 255, 62, 980);
  rotuloEspacado(ctx, `${nomeDivisao.toUpperCase()}  ·  ${nomeDoMes(r.mes).toUpperCase()}`, y + 2, 24, COR.ouro);

  // A pizza a esquerda, o numero grande a direita.
  const cy = 560;
  pizza(ctx, 300, cy, 170, [[r.pagaram.length, COR.confirmado], [r.naoPagaram.length, COR.infracional]]);
  ctx.textAlign = 'center';
  fonte(ctx, 120, 400, 'rye');
  ctx.fillStyle = COR.marfim;
  ctx.fillText(r.pct === null ? '—' : `${r.pct}%`, 760, cy - 20);
  rotuloEspacado(ctx, v.pagaram.toUpperCase(), cy + 30, 24, COR.apagado, 760);
  fonte(ctx, 32, 700);
  ctx.fillStyle = COR.confirmado;
  ctx.fillText(`✅ ${r.pagaram.length} ${r.pagaram.length === 1 ? v.pagou : v.pagaram}`, 760, cy + 95);
  ctx.fillStyle = COR.infracional;
  ctx.fillText(`❌ ${r.naoPagaram.length} ${r.naoPagaram.length === 1 ? v.naoPagou : v.naoPagaram}`, 760, cy + 145);

  const largura = (L - 80 * 2 - 30) / 2;
  colunaNomes(ctx, 80, topoLista, largura, alturaLinha, `✅ ${v.pagaram.toUpperCase()} (${r.pagaram.length})`, COR.confirmado, '✅', r.pagaram);
  colunaNomes(ctx, 80 + largura + 30, topoLista, largura, alturaLinha, `❌ ${v.naoPagaram.toUpperCase()} (${r.naoPagaram.length})`, COR.infracional, '❌', r.naoPagaram);

  rodape(ctx, altura);
  return canvas;
}

// ---------------------------------------------------------------------------
// O relatorio da Caixinha em imagem, pro grupo: o que entrou, o que saiu, o
// saldo, e com o que se gastou - saida por saida, mes a mes. Decisao do clube
// (18/10/2026): vai pro grupo com as despesas e o saldo, e so as saidas sao
// detalhadas; as entradas ficam nos totais. Nome de integrante nao entra
// (isso e do relatorio de pagamentos).
//
// Sao varias imagens do mesmo tamanho, nao uma que cresce: a 1a e o resumo
// com os graficos, e as seguintes o detalhamento das saidas, quantas
// precisar. Imagem comprida demais o WhatsApp encolhe ate ninguem ler.
// `r` e o controleCaixinha.

// As cores das categorias na pizza e no detalhamento, sempre na mesma ordem
// (a da maior pra menor categoria do periodo).
const CORES_CATEGORIA = ['#D9635A', '#E0B24D', '#4C86D9', '#B57EDC', '#4CAF6E', '#E08A3C', '#5FA0C4', '#D46A9F', '#8FA3B8', '#C9A227'];

// Escolhe o maior tamanho de fonte (ate `inicial`) em que o texto cabe.
function fonteQueCabe(ctx, texto, larguraMax, inicial, peso, familia) {
  let t = inicial;
  fonte(ctx, t, peso, familia);
  while (t > 14 && ctx.measureText(texto).width > larguraMax) {
    t -= 2;
    fonte(ctx, t, peso, familia);
  }
  return t;
}

// O valor sem os centavos quando sao zero ("R$ 120" e nao "R$ 120,00") -
// so nos rotulos pequenos do grafico, onde o espaco e curto.
const reaisCurto = v => formatReais(v).replace(/,00$/, '');

// Entrou × Saiu em barras, mes a mes, e a linha dourada do saldo por cima,
// em escala propria (o saldo costuma ser bem maior que o movimento do mes,
// e na mesma escala as barras sumiriam). As barras ficam na metade de baixo
// e a linha na faixa de cima, pra um nunca cobrir o outro; os valores de
// cada mes vao embaixo do nome dele. No maximo os 12 ultimos meses.
// `fmt` escreve os valores (o estoque passa o dele, em kg/un).
function graficoCaixa(ctx, serie, x, y, largura, altura, fmt = reaisCurto) {
  const meses = serie.slice(-12);
  if (!meses.length) return;
  const n = meses.length;
  const passo = largura / n;
  const maior = Math.max(1, ...meses.map(m => Math.max(m.entradas, m.saidas)));
  const base = y + altura;
  const comValores = n <= 6;

  // O chao do grafico.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + largura, base); ctx.stroke();

  const bl = Math.min(44, passo * 0.3);
  meses.forEach((m, i) => {
    const cx = x + passo * i + passo / 2;
    [[m.entradas, COR.confirmado, cx - bl - 3], [m.saidas, COR.infracional, cx + 3]].forEach(([v, cor, bx]) => {
      const h = v ? Math.max(4, (v / maior) * altura * 0.55) : 0;
      if (h) {
        ctx.fillStyle = cor;
        ctx.beginPath(); retangulo(ctx, bx, base - h, bl, h, 6); ctx.fill();
      }
    });
    fonte(ctx, 20, 600);
    ctx.textAlign = 'center';
    ctx.fillStyle = COR.apagado;
    ctx.fillText(nomeCurtoDoMes(m.mes), cx, base + 28);
    if (comValores) {
      fonte(ctx, 18, 700);
      ctx.fillStyle = COR.confirmado;
      ctx.fillText('+' + fmt(m.entradas), cx, base + 54);
      ctx.fillStyle = COR.infracional;
      ctx.fillText('−' + fmt(m.saidas), cx, base + 77);
    }
  });

  // A linha do saldo, na faixa de cima (de 12% a 36% da altura), acima de
  // qualquer barra.
  const saldos = meses.map(m => m.saldo);
  const min = Math.min(...saldos), max = Math.max(...saldos);
  const ySaldo = v => y + altura * 0.36 - (max > min ? (v - min) / (max - min) : 0.5) * altura * 0.24;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = COR.ouro;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  meses.forEach((m, i) => {
    const px = x + passo * i + passo / 2, py = ySaldo(m.saldo);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
  meses.forEach((m, i) => {
    const px = x + passo * i + passo / 2, py = ySaldo(m.saldo);
    ctx.fillStyle = COR.ouro;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1A1408';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
    // O saldo escrito no ultimo ponto sempre, e em todos quando cabe.
    if (comValores || i === n - 1) {
      fonte(ctx, 19, 700);
      ctx.textAlign = 'center';
      ctx.fillStyle = COR.marfim;
      ctx.fillText(fmt(m.saldo), px, py - 18);
    }
  });
}

function legendaGrafico(ctx, y) {
  const itens = [['Entrou', COR.confirmado, 'barra'], ['Saiu', COR.infracional, 'barra'], ['Saldo', COR.ouro, 'linha']];
  fonte(ctx, 21, 600);
  const larguras = itens.map(([t]) => ctx.measureText(t).width + 40);
  let x = L / 2 - (larguras.reduce((s, w) => s + w, 0) + 30 * (itens.length - 1)) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  itens.forEach(([t, cor, forma], i) => {
    ctx.fillStyle = cor;
    if (forma === 'barra') { ctx.beginPath(); retangulo(ctx, x, y - 9, 18, 18, 4); ctx.fill(); }
    else { ctx.fillRect(x - 2, y - 2, 22, 5); ctx.beginPath(); ctx.arc(x + 9, y, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = COR.apagado;
    ctx.fillText(t, x + 28, y + 1);
    x += larguras[i] + 30;
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

// A pizza das categorias, a esquerda, e a legenda a direita: cor, nome,
// valor e %. Passando de 6 categorias, as menores viram "Outras".
function pizzaCategorias(ctx, cats, total, y, fmt = formatReais, cores = null) {
  let fatias = cats.map((c, i) => ({ nome: c.categoria, valor: c.valor, cor: (cores && cores[i]) || CORES_CATEGORIA[i % CORES_CATEGORIA.length] }));
  if (fatias.length > 6) {
    const resto = fatias.slice(5);
    fatias = fatias.slice(0, 5).concat({ nome: `Outras (${resto.length})`, valor: resto.reduce((s, f) => s + f.valor, 0), cor: COR.apagado });
  }
  pizza(ctx, 250, y + 105, 98, fatias.map(f => [f.valor, f.cor]));
  const alturaLinha = 34;
  const topo = y + 105 - (fatias.length * alturaLinha) / 2;
  ctx.textBaseline = 'middle';
  fatias.forEach((f, i) => {
    const meio = topo + i * alturaLinha + alturaLinha / 2;
    ctx.fillStyle = f.cor;
    ctx.beginPath(); retangulo(ctx, 420, meio - 9, 18, 18, 4); ctx.fill();
    const valor = `${fmt(f.valor)} · ${Math.round((f.valor / total) * 100)}%`;
    fonte(ctx, 22, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.marfim;
    ctx.fillText(valor, 975, meio);
    const larguraValor = ctx.measureText(valor).width;
    fonte(ctx, 22, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    ctx.fillText(caber(ctx, f.nome, 975 - 450 - larguraValor - 16), 450, meio);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

// O topo de cada pagina: emblema, titulo, divisao, periodo e "1/3".
function cabecalhoRelatorio(ctx, logo, titulo, nomeDivisao, rotuloPeriodo, pagina, paginas, topo = 'RELATÓRIO FINANCEIRO') {
  emblema(ctx, logo, 28, 104);
  const y = tituloMetal(ctx, titulo, 196, 50, 980);
  rotuloEspacado(ctx, `${topo}  ·  ${nomeDivisao.toUpperCase()}`, y + 4, 20, COR.ouro);
  const linha = rotuloPeriodo + (paginas > 1 ? `   ·   página ${pagina} de ${paginas}` : '');
  fonteQueCabe(ctx, linha, 960, 26, 600);
  ctx.fillStyle = COR.apagado;
  ctx.textAlign = 'center';
  ctx.fillText(linha, L / 2, y + 44);
}

function paginaResumo(ctx, logo, r, nomeDivisao, rotuloPeriodo, paginas, v) {
  cabecalhoRelatorio(ctx, logo, '💰 Caixinha', nomeDivisao, rotuloPeriodo, 1, paginas);

  // Saldo no inicio -> saldo no fim.
  [['NO INÍCIO', r.saldoAnterior, 290, 46, COR.apagado], ['NO FIM', r.saldoFinal, 790, 64, COR.marfim]].forEach(([rotulo, v, cx, tam, cor]) => {
    rotuloEspacado(ctx, rotulo, 366, 20, COR.ouro, cx);
    const t = formatReais(v);
    fonteQueCabe(ctx, t, 420, tam, 400, 'rye');
    ctx.fillStyle = v < 0 ? COR.infracional : cor;
    ctx.textAlign = 'center';
    ctx.fillText(t, cx, 440);
  });
  fonte(ctx, 52, 400, 'rye');
  ctx.fillStyle = COR.ouroEscuro;
  ctx.fillText('→', L / 2 - 10, 430);

  // Entrou e saiu, com a origem do que entrou embaixo.
  fonteQueCabe(ctx, `🟢 Entrou ${formatReais(r.entradas.total)}`, 440, 32, 700);
  ctx.fillStyle = COR.confirmado;
  ctx.fillText(`🟢 Entrou ${formatReais(r.entradas.total)}`, 290, 515);
  fonteQueCabe(ctx, `🔴 Saiu ${formatReais(r.saidas.total)}`, 440, 32, 700);
  ctx.fillStyle = COR.infracional;
  ctx.fillText(`🔴 Saiu ${formatReais(r.saidas.total)}`, 790, 515);
  const origem = [`${v && v.regional ? 'contribuições' : 'mensalidades'} ${formatReais(r.entradas.mensalidades)}`].concat(r.entradas.outras ? [`outras ${formatReais(r.entradas.outras)}`] : []).join(' · ');
  fonteQueCabe(ctx, origem, 460, 19, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(origem, 290, 548);
  const nSaidas = r.saidasPorMes.reduce((s, m) => s + m.itens.length, 0);
  fonte(ctx, 19, 600);
  ctx.fillText(`${nSaidas} ${nSaidas === 1 ? 'saída' : 'saídas'}${nSaidas ? ' · detalhadas adiante' : ''}`, 790, 548);

  rotuloEspacado(ctx, '📊 ENTROU × SAIU × SALDO', 615, 22, COR.ouro);
  if (r.serie.length) {
    graficoCaixa(ctx, r.serie, 120, 650, L - 240, 190);
    legendaGrafico(ctx, 952);
  } else {
    fonte(ctx, 26, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText('Nada no período', L / 2, 760);
  }

  rotuloEspacado(ctx, '🔴 COM O QUE GASTAMOS', 1004, 22, COR.ouro);
  if (r.saidas.porCategoria.length) pizzaCategorias(ctx, r.saidas.porCategoria, r.saidas.total, 1010);
  else {
    fonte(ctx, 26, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText('Nenhuma saída no período', L / 2, 1110);
  }
}

// O detalhamento das saidas, em linhas: o cabecalho de cada mes (com o
// total dele) e uma linha por saida. Reparte em paginas sem deixar um
// cabecalho de mes sozinho no pe da pagina; o mes que continua na pagina
// seguinte repete o cabecalho, com "(continua)".
const TOPO_DETALHE = 330, FIM_DETALHE = 1195, ALTURA_MES = 74, ALTURA_SAIDA = 58;
function paginasDeSaidas(saidasPorMes) {
  const paginas = [];
  let atual = [], y = TOPO_DETALHE;
  const novaPagina = () => { paginas.push(atual); atual = []; y = TOPO_DETALHE; };
  saidasPorMes.forEach(m => {
    if (y + ALTURA_MES + ALTURA_SAIDA > FIM_DETALHE) novaPagina();
    atual.push({ tipo: 'mes', mes: m });
    y += ALTURA_MES;
    m.itens.forEach(x => {
      if (y + ALTURA_SAIDA > FIM_DETALHE) {
        novaPagina();
        atual.push({ tipo: 'mes', mes: m, continua: true });
        y += ALTURA_MES;
      }
      atual.push({ tipo: 'saida', x });
      y += ALTURA_SAIDA;
    });
  });
  if (atual.length) paginas.push(atual);
  return paginas;
}

function paginaDetalhe(ctx, logo, linhas, cores, nomeDivisao, rotuloPeriodo, pagina, paginas) {
  cabecalhoRelatorio(ctx, logo, '🔴 Saídas detalhadas', nomeDivisao, rotuloPeriodo, pagina, paginas);
  let y = TOPO_DETALHE;
  ctx.textBaseline = 'middle';
  linhas.forEach(l => {
    if (l.tipo === 'mes') {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); retangulo(ctx, 90, y + 8, L - 180, ALTURA_MES - 16, 16); ctx.fill();
      fonte(ctx, 30, 400, 'rye');
      ctx.textAlign = 'left';
      ctx.fillStyle = COR.marfim;
      ctx.fillText(nomeDoMes(l.mes.mes) + (l.continua ? ' (continua)' : ''), 120, y + ALTURA_MES / 2);
      fonte(ctx, 28, 700);
      ctx.textAlign = 'right';
      ctx.fillStyle = COR.infracional;
      ctx.fillText(formatReais(l.mes.total), L - 120, y + ALTURA_MES / 2);
      y += ALTURA_MES;
      return;
    }
    const x = l.x;
    const meio = y + ALTURA_SAIDA / 2;
    ctx.fillStyle = cores[x.categoria] || COR.apagado;
    ctx.beginPath(); ctx.arc(126, meio, 8, 0, Math.PI * 2); ctx.fill();
    fonte(ctx, 22, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.ouro;
    ctx.fillText(formatDataBR(x.data).slice(0, 5), 148, meio);
    const valor = formatReais(x.valor);
    fonte(ctx, 26, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.marfim;
    ctx.fillText(valor, L - 120, meio);
    const espaco = L - 120 - ctx.measureText(valor).width - 30 - 225;
    fonte(ctx, 25, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    const categoria = caber(ctx, x.categoria, espaco);
    ctx.fillText(categoria, 225, meio);
    if (x.descricao) {
      const largura = ctx.measureText(categoria).width;
      fonte(ctx, 22, 600);
      ctx.fillStyle = COR.apagado;
      const resto = espaco - largura - 12;
      if (resto > 60) ctx.fillText(caber(ctx, '· ' + x.descricao, resto), 225 + largura + 12, meio);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(110, y + ALTURA_SAIDA); ctx.lineTo(L - 110, y + ALTURA_SAIDA); ctx.stroke();
    y += ALTURA_SAIDA;
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

export async function imagensRelatorioCaixinha(r, nomeDivisao, rotuloPeriodo, v) {
  const detalhe = paginasDeSaidas(r.saidasPorMes);
  const paginas = 1 + detalhe.length;
  // A mesma cor da categoria na pizza e no detalhamento.
  const cores = {};
  r.saidas.porCategoria.forEach((c, i) => { cores[c.categoria] = i < 5 || r.saidas.porCategoria.length <= 6 ? CORES_CATEGORIA[i % CORES_CATEGORIA.length] : COR.apagado; });

  const telas = [];
  const primeira = await novaTela();
  paginaResumo(primeira.ctx, primeira.logo, r, nomeDivisao, rotuloPeriodo, paginas, v);
  rodape(primeira.ctx);
  telas.push(primeira.canvas);
  for (let i = 0; i < detalhe.length; i++) {
    const t = await novaTela();
    paginaDetalhe(t.ctx, t.logo, detalhe[i], cores, nomeDivisao, rotuloPeriodo, i + 2, paginas);
    rodape(t.ctx);
    telas.push(t.canvas);
  }
  return telas;
}

// ---------------------------------------------------------------------------
// O Estoque do clube pro grupo - o resumo e a lista de itens
// com a quantidade, "acabou" em vermelho. Varias imagens do mesmo tamanho
// quando a lista nao cabe, como no relatorio da Caixinha. `itens` vem do
// saldo de hoje de cada item (aba Estoque), na ordem da tela.
const TOPO_ESTOQUE = 360, FIM_ESTOQUE = 1190, ALTURA_ITEM = 64;

function paginaEstoque(ctx, logo, itens, resumo, nomeDivisao, pagina, paginas) {
  emblema(ctx, logo, 28, 104);
  const y = tituloMetal(ctx, '📦 Estoque de doações', 196, 50, 980);
  rotuloEspacado(ctx, `ESTOQUE  ·  ${nomeDivisao.toUpperCase()}`, y + 4, 20, COR.ouro);
  const hoje = new Date();
  const data = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  const linha = `${resumo}  ·  ${data}` + (paginas > 1 ? `  ·  página ${pagina} de ${paginas}` : '');
  fonteQueCabe(ctx, linha, 960, 26, 600);
  ctx.fillStyle = COR.apagado;
  ctx.textAlign = 'center';
  ctx.fillText(linha, L / 2, y + 44);

  ctx.textBaseline = 'middle';
  itens.forEach((x, i) => {
    const topo = TOPO_ESTOQUE + i * ALTURA_ITEM;
    const meio = topo + ALTURA_ITEM / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); retangulo(ctx, 90, topo + 4, L - 180, ALTURA_ITEM - 8, 14); ctx.fill();
    }
    const acabou = !x.quantidade;
    const qtd = acabou ? 'acabou' : textoQuantidade(x.quantidade, x.medida);
    fonte(ctx, 30, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = acabou ? COR.infracional : COR.marfim;
    ctx.fillText(qtd, L - 120, meio);
    const larguraQtd = ctx.measureText(qtd).width;
    fonte(ctx, 30, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = acabou ? COR.apagado : COR.texto;
    ctx.fillText(caber(ctx, x.item, L - 240 - larguraQtd - 30), 120, meio);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

export async function imagensEstoqueDoacoes(itens, resumo, nomeDivisao) {
  const porPagina = Math.floor((FIM_ESTOQUE - TOPO_ESTOQUE) / ALTURA_ITEM);
  const paginas = [];
  for (let i = 0; i < itens.length; i += porPagina) paginas.push(itens.slice(i, i + porPagina));
  const telas = [];
  for (let p = 0; p < paginas.length; p++) {
    const t = await novaTela();
    paginaEstoque(t.ctx, t.logo, paginas[p], resumo, nomeDivisao, p + 1, paginas.length);
    rodape(t.ctx);
    telas.push(t.canvas);
  }
  return telas;
}

// ---------------------------------------------------------------------------
// O relatorio do Estoque das Doacoes, no molde do relatorio da Caixinha:
// varias imagens do mesmo tamanho. A 1a e o item escolhido (saldo no inicio
// -> no fim, entrou e saiu, o grafico Entrou x Saiu x Saldo e a pizza "Para
// onde foi"); a 2a, a tabela de todos os itens; as seguintes, as saidas do
// periodo, uma por linha, com o destino. `r` vem de relatorioEstoque.
const CORES_DESTINO_IMG = { acao_social: '#4CAF6E', familia: '#E0B24D', instituicao: '#4C86D9', outro: '#8FA3B8' };
const TOPO_TABELA_ESTOQUE = 330, FIM_TABELA_ESTOQUE = 1195, ALTURA_LINHA_ESTOQUE = 74;

function paginaResumoEstoque(ctx, logo, r, nomeDivisao, rotuloPeriodo, paginas) {
  const it = r.item;
  const q = v => textoQuantidade(v, it.medida);
  cabecalhoRelatorio(ctx, logo, '📦 Estoque', nomeDivisao, `${it.item}  ·  ${rotuloPeriodo}`, 1, paginas, 'ESTOQUE DE DOAÇÕES');

  [['NO INÍCIO', it.saldoAnterior, 290, 46, COR.apagado], ['NO FIM', it.saldoFinal, 790, 64, COR.marfim]].forEach(([rotulo, v, cx, tam, cor]) => {
    rotuloEspacado(ctx, rotulo, 366, 20, COR.ouro, cx);
    const t = q(v);
    fonteQueCabe(ctx, t, 420, tam, 400, 'rye');
    ctx.fillStyle = cor;
    ctx.textAlign = 'center';
    ctx.fillText(t, cx, 440);
  });
  fonte(ctx, 52, 400, 'rye');
  ctx.fillStyle = COR.ouroEscuro;
  ctx.fillText('→', L / 2 - 10, 430);

  fonteQueCabe(ctx, `🟢 Entrou ${q(r.entradas.total)}`, 440, 32, 700);
  ctx.fillStyle = COR.confirmado;
  ctx.fillText(`🟢 Entrou ${q(r.entradas.total)}`, 290, 515);
  fonteQueCabe(ctx, `🔴 Saiu ${q(r.saidas.total)}`, 440, 32, 700);
  ctx.fillStyle = COR.infracional;
  ctx.fillText(`🔴 Saiu ${q(r.saidas.total)}`, 790, 515);
  if (it.automatico && (r.entradas.eventos || r.entradas.avulsas)) {
    const origem = [`eventos ${q(r.entradas.eventos)}`].concat(r.entradas.avulsas ? [`avulsas ${q(r.entradas.avulsas)}`] : [])
      .concat(r.correcoes ? [`correções ${q(r.correcoes)}`] : []).join(' · ');
    fonteQueCabe(ctx, origem, 460, 19, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(origem, 290, 548);
  }

  rotuloEspacado(ctx, '📊 ENTROU × SAIU × SALDO', 615, 22, COR.ouro);
  if (r.serie.some(m => m.entradas || m.saidas)) {
    graficoCaixa(ctx, r.serie, 120, 650, L - 240, 190, v => numeroEstoque(v));
    legendaGrafico(ctx, 952);
  } else {
    fonte(ctx, 26, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText('Nada no período', L / 2, 760);
  }

  rotuloEspacado(ctx, '🔴 PARA ONDE FOI', 1004, 22, COR.ouro);
  const destinos = r.saidas.porDestino;
  if (destinos.length) {
    pizzaCategorias(ctx, destinos.map(d => ({ categoria: `${d.emoji} ${d.label}`, valor: d.valor })), r.saidas.total, 1010, q,
      destinos.map(d => CORES_DESTINO_IMG[d.chave]));
  } else {
    fonte(ctx, 26, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText('Nenhuma saída no período', L / 2, 1110);
  }
}

// A tabela de todos os itens: nome, inicio -> fim, e embaixo + e -.
function paginaTabelaEstoque(ctx, logo, linhas, nomeDivisao, rotuloPeriodo, pagina, paginas) {
  cabecalhoRelatorio(ctx, logo, '📦 Todos os itens', nomeDivisao, rotuloPeriodo, pagina, paginas, 'ESTOQUE DE DOAÇÕES');
  ctx.textBaseline = 'middle';
  linhas.forEach((t, i) => {
    const topo = TOPO_TABELA_ESTOQUE + i * ALTURA_LINHA_ESTOQUE;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); retangulo(ctx, 90, topo + 4, L - 180, ALTURA_LINHA_ESTOQUE - 8, 14); ctx.fill();
    }
    const fim = textoQuantidade(t.saldoFinal, t.medida);
    fonte(ctx, 30, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = t.saldoFinal ? COR.marfim : COR.infracional;
    ctx.fillText(fim, L - 120, topo + 28);
    const larguraFim = ctx.measureText(fim).width;
    fonte(ctx, 28, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    ctx.fillText(caber(ctx, t.item, L - 240 - larguraFim - 30), 120, topo + 28);
    fonte(ctx, 19, 600);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(caber(ctx, resumoDaLinha(t), L - 240), 120, topo + 56);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

// As saidas detalhadas: o cabecalho de cada mes e uma linha por saida -
// dia, item, destino e quantidade. A mesma reparticao do relatorio da
// Caixinha (paginasDeSaidas).
function paginaSaidasEstoque(ctx, logo, linhas, nomeDivisao, rotuloPeriodo, pagina, paginas) {
  cabecalhoRelatorio(ctx, logo, '🔴 Saídas', nomeDivisao, rotuloPeriodo, pagina, paginas, 'ESTOQUE DE DOAÇÕES');
  let y = TOPO_DETALHE;
  ctx.textBaseline = 'middle';
  linhas.forEach(l => {
    if (l.tipo === 'mes') {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); retangulo(ctx, 90, y + 8, L - 180, ALTURA_MES - 16, 16); ctx.fill();
      fonte(ctx, 30, 400, 'rye');
      ctx.textAlign = 'left';
      ctx.fillStyle = COR.marfim;
      ctx.fillText(nomeDoMes(l.mes.mes) + (l.continua ? ' (continua)' : ''), 120, y + ALTURA_MES / 2);
      fonte(ctx, 24, 700);
      ctx.textAlign = 'right';
      ctx.fillStyle = COR.infracional;
      ctx.fillText(`${l.mes.itens.length} ${l.mes.itens.length === 1 ? 'saída' : 'saídas'}`, L - 120, y + ALTURA_MES / 2);
      y += ALTURA_MES;
      return;
    }
    const x = l.x;
    const meio = y + ALTURA_SAIDA / 2;
    ctx.fillStyle = CORES_DESTINO_IMG[x.destino] || COR.apagado;
    ctx.beginPath(); ctx.arc(126, meio, 8, 0, Math.PI * 2); ctx.fill();
    fonte(ctx, 22, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.ouro;
    ctx.fillText(formatDataBR(x.data).slice(0, 5), 148, meio);
    const valor = textoQuantidade(x.quantidade, x.medida);
    fonte(ctx, 26, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.marfim;
    ctx.fillText(valor, L - 120, meio);
    const espaco = L - 120 - ctx.measureText(valor).width - 30 - 225;
    fonte(ctx, 25, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    const nome = caber(ctx, x.item, espaco);
    ctx.fillText(nome, 225, meio);
    const largura = ctx.measureText(nome).width;
    const destino = destinoPorChave(x.destino);
    fonte(ctx, 22, 600);
    ctx.fillStyle = COR.apagado;
    const resto = espaco - largura - 12;
    if (resto > 60) ctx.fillText(caber(ctx, `· ${destino.label}${x.descricao ? ' · ' + x.descricao : ''}`, resto), 225 + largura + 12, meio);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(110, y + ALTURA_SAIDA); ctx.lineTo(L - 110, y + ALTURA_SAIDA); ctx.stroke();
    y += ALTURA_SAIDA;
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

export async function imagensRelatorioEstoque(r, nomeDivisao, rotuloPeriodo) {
  const porPagina = Math.floor((FIM_TABELA_ESTOQUE - TOPO_TABELA_ESTOQUE) / ALTURA_LINHA_ESTOQUE);
  const tabela = [];
  if (r.tabela.length > 1) for (let i = 0; i < r.tabela.length; i += porPagina) tabela.push(r.tabela.slice(i, i + porPagina));
  const saidas = paginasDeSaidas(r.saidasPorMes);
  const paginas = 1 + tabela.length + saidas.length;
  const telas = [];
  const desenhar = async (fn) => { const t = await novaTela(); fn(t.ctx, t.logo); rodape(t.ctx); telas.push(t.canvas); };
  await desenhar((ctx, logo) => paginaResumoEstoque(ctx, logo, r, nomeDivisao, rotuloPeriodo, paginas));
  for (let i = 0; i < tabela.length; i++) {
    await desenhar((ctx, logo) => paginaTabelaEstoque(ctx, logo, tabela[i], nomeDivisao, rotuloPeriodo, 2 + i, paginas));
  }
  for (let i = 0; i < saidas.length; i++) {
    await desenhar((ctx, logo) => paginaSaidasEstoque(ctx, logo, saidas[i], nomeDivisao, rotuloPeriodo, 2 + tabela.length + i, paginas));
  }
  return telas;
}

// ---------------------------------------------------------------------------
// Entrada/Saida de integrantes. Os quatro numeros em placas lado a lado, e
// embaixo os nomes. Sem o motivo de ninguem: pode ser assunto pessoal (ver
// dominio/movimentos.js).
const COR_MOV = { entrada: '#5FC98D', afastamento: '#E0B24D', desligamento: '#D9635A', transferencia: '#5FA0C4' };

// `transferencias` = [rotulo, numero]: numa divisao, as que chegaram e
// sairam; no quadro da RJ4, so as pra outra regional.
function placasMovimento(ctx, y, entradas, afastados, desligamentos, transferencias) {
  const placas = [
    ['🟢 ENTRARAM', entradas, COR_MOV.entrada],
    ['⏸️ AFASTADOS', afastados, COR_MOV.afastamento],
    ['🚪 DESLIGADOS', desligamentos, COR_MOV.desligamento],
    [transferencias[0], transferencias[1], COR_MOV.transferencia],
  ];
  const largura = 222, gap = 18, x0 = (L - (largura * 4 + gap * 3)) / 2;
  placas.forEach(([rotulo, n, cor], i) => {
    const x = x0 + i * (largura + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); retangulo(ctx, x, y, largura, 180, 24); ctx.fill();
    ctx.strokeStyle = cor;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath(); retangulo(ctx, x, y, largura, 180, 24); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    fonte(ctx, 86, 400, 'rye');
    ctx.fillStyle = COR.marfim;
    ctx.fillText(String(n), x + largura / 2, y + 108);
    // O rotulo encolhe ate caber na placa ("🔁 TRANSFERÊNCIAS" e longo).
    let tamanho = 22;
    fonte(ctx, tamanho, 700);
    while (tamanho > 14 && ctx.measureText(rotulo).width > largura - 20) fonte(ctx, --tamanho, 700);
    ctx.fillStyle = cor;
    ctx.fillText(rotulo, x + largura / 2, y + 152);
  });
  return y + 180;
}

export async function imagemMovimentos(r, nomeDivisao, rotuloPeriodo) {
  const alturaLinha = 46;
  const comData = (m, data, prefixo = '') => ({ nome: `${m.nome}${m.grau ? ` (${m.grau})` : ''}${data ? ` · ${prefixo}${formatDataBR(data)}` : ''}`, grau: '' });
  const secoes = [
    [`🟢 ENTRARAM (${r.entradas.length})`, COR_MOV.entrada, '🟢', r.entradas.map(m => comData(m, m.data))],
    [`⏸️ AFASTADOS AGORA (${r.afastadosAgora.length})`, COR_MOV.afastamento, '⏸️', r.afastadosAgora.map(m => comData(m, m.situacaoDesde, 'desde '))],
    [`🚪 DESLIGADOS (${r.desligamentos.length})`, COR_MOV.desligamento, '🚪', r.desligamentos.map(m => comData(m, m.data))],
    [`🔁 CHEGARAM POR TRANSFERÊNCIA (${r.chegaram.length})`, COR_MOV.transferencia, '🔁', r.chegaram.map(m => comData(m, m.data, `de ${m.dePara} · `))],
    [`🔁 SAÍRAM POR TRANSFERÊNCIA (${r.sairam.length})`, COR_MOV.transferencia, '🔁', r.sairam.map(m => comData(m, m.data, `para ${m.dePara} · `))],
  ].filter(s => s[3].length);
  const topoListas = 690;
  const alturaListas = secoes.reduce((s, sec) => s + 70 + sec[3].length * alturaLinha + 18 + 24, 0);
  const altura = Math.max(A, topoListas + alturaListas + 190);
  const { canvas, ctx, logo } = await novaTela(altura);

  emblema(ctx, logo, 40, 140);
  const y = tituloMetal(ctx, '🔄 Entrada e Saída', 255, 58, 980);
  rotuloEspacado(ctx, `${nomeDivisao.toUpperCase()}  ·  ${rotuloPeriodo.toUpperCase()}`, y + 2, 24, COR.ouro);
  placasMovimento(ctx, 440, r.entradas.length, r.afastadosAgora.length, r.desligamentos.length,
    ['🔁 TRANSFERÊNCIAS', r.chegaram.length + r.sairam.length]);

  let yl = topoListas;
  if (!secoes.length) {
    fonte(ctx, 30, 600);
    ctx.fillStyle = COR.apagado;
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma movimentação no período', L / 2, yl + 60);
  }
  secoes.forEach(([titulo, cor, emoji, membros]) => {
    yl = colunaNomes(ctx, 80, yl, L - 160, alturaLinha, titulo, cor, emoji, membros) + 24;
  });

  rodape(ctx, altura);
  return canvas;
}

// O quadro do Regional: uma linha por divisao com os quatro numeros (a
// transferencia como "+chegaram −sairam"), e o total da RJ4 nas placas de
// cima - ali a transferencia e so a que foi pra outra regional. So numeros.
export async function imagemQuadroMovimentos(q, rotuloPeriodo) {
  const { canvas, ctx, logo } = await novaTela();
  emblema(ctx, logo, 40, 140);
  const y = tituloMetal(ctx, '🔄 Entrada e Saída', 255, 58, 980);
  rotuloEspacado(ctx, `REGIONAL RJ4  ·  ${rotuloPeriodo.toUpperCase()}`, y + 2, 24, COR.ouro);
  placasMovimento(ctx, 420, q.total.entradas, q.total.afastados, q.total.desligamentos,
    ['🔁 P/ OUTRA REGIONAL', q.total.sairamDaRJ4]);

  const colunas = [570, 690, 810, 945];
  let yl = 660;
  ctx.textBaseline = 'middle';
  fonte(ctx, 22, 700);
  ctx.fillStyle = COR.apagado;
  ctx.textAlign = 'left';
  ctx.fillText('DIVISÃO', 110, yl);
  ctx.textAlign = 'center';
  ['🟢', '⏸️', '🚪', '🔁'].forEach((e, i) => ctx.fillText(e, colunas[i], yl));
  yl += 34;
  const alturaLinha = Math.min(64, (A - 190 - yl) / q.linhas.length);
  q.linhas.forEach((l, i) => {
    const meio = yl + i * alturaLinha + alturaLinha / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath(); retangulo(ctx, 80, meio - alturaLinha / 2 + 3, L - 160, alturaLinha - 6, 14); ctx.fill();
    }
    fonte(ctx, 30, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    ctx.fillText(l.e.nome, 110, meio);
    fonte(ctx, 36, 400, 'rye');
    ctx.textAlign = 'center';
    [[l.entradas, COR_MOV.entrada], [l.afastados, COR_MOV.afastamento], [l.desligamentos, COR_MOV.desligamento]].forEach(([n, cor], k) => {
      ctx.fillStyle = n ? cor : COR.apagado;
      ctx.fillText(String(n), colunas[k], meio + 2);
    });
    fonte(ctx, 28, 400, 'rye');
    ctx.fillStyle = l.chegaram || l.sairam ? COR_MOV.transferencia : COR.apagado;
    ctx.fillText(`+${l.chegaram} −${l.sairam}`, colunas[3], meio + 2);
  });
  ctx.textBaseline = 'alphabetic';
  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// A previa: a imagem grande, com Compartilhar (onde o celular deixa),
// Baixar e Fechar. Fica fora do #app, que e redesenhado a cada toque.
//
// `gerar` pode devolver uma imagem ou varias (o relatorio da Caixinha em
// paginas). Varias aparecem uma embaixo da outra, e Compartilhar e Baixar
// levam todas juntas, numeradas: "caixinha-1.png", "caixinha-2.png"...
// ---------------------------------------------------------------------------
// A agenda do ano das Acoes Sociais: os 12 meses numa grade 3 x 4, cada
// quadro com o mes, o contexto (os emojis da legenda), a acao escolhida e
// quando - e a borda na cor da situacao. Mes sem nada escolhido diz "a
// definir" e quantas opcoes tem. Nenhum nome de integrante.
const COR_SITUACAO = { planejada: '#E0B24D', confirmada: '#5FC98D', realizada: '#D4A24C' };

// Quebra o texto em ate `max` linhas na largura; a ultima ganha "…" se sobrar.
function linhasCortadas(ctx, texto, largura, max) {
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = '';
  for (let i = 0; i < palavras.length; i++) {
    const tentativa = atual ? atual + ' ' + palavras[i] : palavras[i];
    if (ctx.measureText(tentativa).width <= largura || !atual) { atual = tentativa; continue; }
    linhas.push(atual);
    atual = palavras[i];
    if (linhas.length === max) { atual = ''; break; }
  }
  if (atual && linhas.length < max) linhas.push(atual);
  const usadas = linhas.join(' ').split(/\s+/).length;
  if (usadas < palavras.length && linhas.length) {
    let ultima = linhas[linhas.length - 1];
    while (ultima && ctx.measureText(ultima + '…').width > largura) ultima = ultima.slice(0, -1);
    linhas[linhas.length - 1] = ultima.trim() + '…';
  }
  return linhas;
}

export async function imagemAgendaAcoesSociais(agenda, ano, nomeDivisao) {
  const { canvas, ctx, logo } = await novaTela();
  const r = resumoDoAno(agenda, ano);

  emblema(ctx, logo, 36, 112);
  rotuloEspacado(ctx, 'AGENDA SOCIAL', 192, 24, COR.ouro);
  tituloMetal(ctx, `AÇÕES SOCIAIS ${ano}`, 256, 54, 960);
  fonte(ctx, 26, 600);
  ctx.textAlign = 'center';
  ctx.fillStyle = COR.texto;
  ctx.fillText(String(nomeDivisao).toUpperCase(), L / 2, 300);
  fonte(ctx, 22, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`${r.mesesComAcao} de 12 meses com a ação escolhida`, L / 2, 336);

  // A grade: 3 colunas x 4 linhas, entre o cabecalho e o rodape.
  const margem = 44, vao = 16, topo = 370, base = A - 150;
  const lq = (L - 2 * margem - 2 * vao) / 3;
  const aq = (base - topo - 3 * vao) / 4;
  mesesDoAno(ano).forEach((mes, i) => {
    const x = margem + (i % 3) * (lq + vao);
    const y = topo + Math.floor(i / 3) * (aq + vao);
    const doMes = acoesDoMes(agenda, mes);
    const escolhidas = doMes.filter(ehEscolhida);
    const a = escolhidas[0];
    const cor = a ? (COR_SITUACAO[a.situacao] || COR.ouro) : 'rgba(255,255,255,0.18)';

    // O quadro: fundo escuro e a borda na cor da situacao (tracejada sem acao).
    ctx.fillStyle = a ? 'rgba(20,18,14,0.82)' : 'rgba(20,18,14,0.55)';
    ctx.beginPath(); retangulo(ctx, x, y, lq, aq, 18); ctx.fill();
    ctx.strokeStyle = cor;
    ctx.lineWidth = a ? 3 : 2;
    if (!a && ctx.setLineDash) ctx.setLineDash([8, 7]);
    ctx.beginPath(); retangulo(ctx, x, y, lq, aq, 18); ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);

    // O mes e os emojis do contexto.
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    fonte(ctx, 26, 400, 'rye');
    ctx.fillStyle = COR.marfim;
    ctx.fillText(MESES_NOMES[i].toUpperCase(), x + 18, y + 40);
    fonte(ctx, 19, 400);
    ctx.textAlign = 'right';
    ctx.fillText(CONTEXTO_DOS_MESES[i].map(c => (LEGENDA_CONTEXTO[c] || {}).emoji || '').join(''), x + lq - 14, y + 38);

    ctx.textAlign = 'left';
    if (!a) {
      fonte(ctx, 22, 600);
      ctx.fillStyle = COR.apagado;
      ctx.fillText('a definir', x + 18, y + aq / 2 + 14);
      if (doMes.length) {
        fonte(ctx, 18, 600);
        ctx.fillText(`💡 ${doMes.length} ${doMes.length === 1 ? 'opção' : 'opções'}`, x + 18, y + aq / 2 + 44);
      }
      return;
    }
    // A acao escolhida: o emoji grande e o nome em ate 2 linhas.
    fonte(ctx, 34, 400);
    ctx.fillText(a.emoji || '🤝', x + 16, y + 92);
    fonte(ctx, 20, 700);
    ctx.fillStyle = COR.texto;
    linhasCortadas(ctx, a.acao, lq - 34, 2).forEach((linha, n) => ctx.fillText(linha, x + 18, y + 126 + n * 25));
    // Quando, embaixo; e a bolinha da situacao (mais de uma escolhida: "+1").
    const quandoTexto = [a.data ? `${diaDaSemana(a.data).slice(0, 3)} ${formatDataBR(a.data).slice(0, 5)}` : '', a.horario].filter(Boolean).join(' · ');
    fonte(ctx, 18, 600);
    ctx.fillStyle = cor;
    ctx.beginPath(); ctx.arc(x + 25, y + aq - 22, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COR.apagado;
    ctx.fillText([quandoTexto || situacaoPorChave(a.situacao).rotulo, escolhidas.length > 1 ? `+${escolhidas.length - 1}` : ''].filter(Boolean).join('  '), x + 40, y + aq - 16);
  });
  ctx.textAlign = 'center';

  // A legenda das cores, entre a grade e o rodape.
  const legenda = [['planejada', 'Planejada'], ['confirmada', 'Confirmada'], ['realizada', 'Realizada']];
  fonte(ctx, 19, 600);
  let lx = L / 2 - 250;
  legenda.forEach(([chave, rotulo]) => {
    ctx.fillStyle = COR_SITUACAO[chave];
    ctx.beginPath(); ctx.arc(lx, base + 26, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COR.apagado;
    ctx.textAlign = 'left';
    ctx.fillText(rotulo, lx + 14, base + 32);
    lx += 175;
  });
  ctx.textAlign = 'center';
  rodape(ctx);
  return canvas;
}

export async function mostrarPreviaImagem(gerar, nomeArquivo) {
  mostrarAviso('🖼️ Montando a imagem…');
  let canvases;
  try {
    const r = await gerar();
    canvases = Array.isArray(r) ? r : [r];
  } catch (e) {
    return mostrarAviso('Não consegui montar a imagem. Tente de novo.');
  }
  const blobs = await Promise.all(canvases.map(c => new Promise(ok => c.toBlob(ok, 'image/png'))));
  if (!blobs.length || blobs.some(b => !b)) return mostrarAviso('Não consegui montar a imagem. Tente de novo.');
  const varias = blobs.length > 1;
  const nomes = blobs.map((b, i) => (varias ? nomeArquivo.replace(/\.png$/, `-${i + 1}.png`) : nomeArquivo));
  const arquivos = blobs.map((b, i) => new File([b], nomes[i], { type: 'image/png' }));
  const urls = blobs.map(b => URL.createObjectURL(b));
  const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: arquivos }));

  fecharPrevia();
  const fundo = document.createElement('div');
  fundo.id = 'previa-imagem';
  const imagens = urls.map((u, i) => `<img src="${u}" alt="Prévia da imagem${varias ? ` ${i + 1} de ${urls.length}` : ''}">`).join('');
  fundo.innerHTML = `
    <div class="previa-caixa">
      ${varias ? `<div class="previa-imagens">${imagens}</div><div class="previa-contagem">${urls.length} imagens · role pra ver todas</div>` : imagens}
      <div class="previa-botoes">
        ${podeCompartilhar ? `<button class="btn" data-previa="compartilhar">📤 Compartilhar${varias ? ' todas' : ''}</button>` : ''}
        <button class="btn ${podeCompartilhar ? 'secondary' : ''}" data-previa="baixar">⬇️ Baixar ${varias ? 'imagens' : 'imagem'}</button>
        <button class="btn ghost" data-previa="fechar">Fechar</button>
      </div>
    </div>
  `;
  fundo.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-previa]');
    if (!botao && e.target !== fundo) return;
    const acao = botao ? botao.dataset.previa : 'fechar';
    if (acao === 'fechar') return fecharPrevia();
    if (acao === 'baixar') {
      urls.forEach((u, i) => {
        const a = document.createElement('a');
        a.href = u;
        a.download = nomes[i];
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
      return mostrarAviso(varias ? '⬇️ Imagens baixadas' : '⬇️ Imagem baixada');
    }
    if (acao === 'compartilhar') {
      try { await navigator.share({ files: arquivos }); } catch (err) { /* cancelou - tudo bem */ }
    }
  });
  document.body.appendChild(fundo);
  document.body.classList.add('com-previa');
  requestAnimationFrame(() => fundo.classList.add('visivel'));
}

function fecharPrevia() {
  const atual = document.getElementById('previa-imagem');
  if (!atual) return;
  atual.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  atual.remove();
  document.body.classList.remove('com-previa');
}
