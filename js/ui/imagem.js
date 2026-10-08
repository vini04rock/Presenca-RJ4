// Imagens pra postar no grupo: o resultado de um evento encerrado e o Rank
// de Presenca. Desenhadas num <canvas>, no visual do app (foto de fundo,
// emblema, Rye), e mostradas numa previa com "Compartilhar" e "Baixar".
//
// A previa nao e so enfeite: o navegador so deixa compartilhar arquivo
// dentro de um toque recente da pessoa, e desenhar leva um instante (fontes
// e imagens carregando). Gerando antes e compartilhando no toque do botao
// da previa, o compartilhamento funciona em todo celular.

import { emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { IMG_FUNDO, LOGO_SRC } from '../nucleo/imagens.js';
import { diaDaSemana, formatDataBR, mostrarAviso } from '../nucleo/util.js';
import { posicoesDoPodio } from './comuns.js';

const L = 1080, A = 1350; // retrato 4:5, o formato que o WhatsApp mostra maior
const COR = {
  marfim: '#F3E6C4', ouro: '#D4A24C', ouroEscuro: '#8A6A2C', texto: '#F2EFE8', apagado: '#A8A49B',
  confirmado: '#5FC98D', justificada: '#E0B24D', infracional: '#D9635A', trilho: 'rgba(255,255,255,0.10)',
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

async function novaTela() {
  await prepararFontes();
  const [fundo, logo] = await Promise.all([carregarImagem(IMG_FUNDO), carregarImagem(LOGO_SRC)]);
  const canvas = document.createElement('canvas');
  canvas.width = L;
  canvas.height = A;
  const ctx = canvas.getContext('2d');
  // A foto cobrindo tudo, escurecida por cima pra o texto ler bem.
  const escala = Math.max(L / fundo.width, A / fundo.height);
  const fw = fundo.width * escala, fh = fundo.height * escala;
  ctx.drawImage(fundo, (L - fw) / 2, (A - fh) * 0.35, fw, fh);
  const veu = ctx.createLinearGradient(0, 0, 0, A);
  veu.addColorStop(0, 'rgba(10,10,10,0.78)');
  veu.addColorStop(0.45, 'rgba(10,10,10,0.70)');
  veu.addColorStop(1, 'rgba(10,10,10,0.92)');
  ctx.fillStyle = veu;
  ctx.fillRect(0, 0, L, A);
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

function rotuloEspacado(ctx, texto, y, tamanho, cor) {
  fonte(ctx, tamanho, 700);
  ctx.textAlign = 'center';
  ctx.fillStyle = cor;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(tamanho * 0.22)}px`;
  ctx.fillText(texto, L / 2, y);
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

function rodape(ctx) {
  ctx.strokeStyle = 'rgba(212,162,76,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L / 2 - 180, A - 120);
  ctx.lineTo(L / 2 + 180, A - 120);
  ctx.stroke();
  rotuloEspacado(ctx, 'INSANOS MC  ·  REGIONAL RJ4', A - 72, 26, COR.ouro);
  fonte(ctx, 20, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText('DISCIPLINA · RESPEITO · IRMANDADE · SEMPRE', L / 2, A - 38);
}

// ---------------------------------------------------------------------------
// Resultado de um evento encerrado. `contagem` e o computeCounts do evento.
export async function imagemResultadoEvento(ev, contagem) {
  const { canvas, ctx, logo } = await novaTela();
  const total = (ev.memberIds || []).length;
  const justificadas = contagem.familia + contagem.trabalho + contagem.justificada;
  const naoJustificadas = contagem.infracional + (contagem.aguardando || 0);
  const pct = total ? Math.round((contagem.confirmado / total) * 100) : 0;

  emblema(ctx, logo, 60, 200);
  rotuloEspacado(ctx, 'RESULTADO DO EVENTO', 330, 28, COR.ouro);
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
  const meta = [ev.tipo ? `${emojiTipoEvento(ev.tipo)} ${ev.tipo}` : '', [diaDaSemana(ev.data), ev.data ? formatDataBR(ev.data) : ''].filter(Boolean).join(', '),
    escopoPorChave(ev.categoria).nome].filter(Boolean).join('  ·  ');
  y = textoCentral(ctx, meta, y + 6, 40, 960);

  // A rosca: as tres fatias na ordem do app (confirmado, justificada, nao
  // justificada), comecando no topo. Ocupa o espaco entre o texto de cima e
  // a contagem de baixo, que tem lugar fixo acima do rodape - assim nada
  // se sobrepoe, seja o nome curto ou longo.
  const espessura = 48;
  const topoRosca = y + 30, baseRosca = A - 280;
  const r = Math.max(110, Math.min(190, (baseRosca - topoRosca) / 2 - espessura / 2));
  const cx = L / 2, cy = (topoRosca + baseRosca) / 2;
  ctx.lineWidth = espessura;
  ctx.strokeStyle = COR.trilho;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  let inicio = -Math.PI / 2;
  [[contagem.confirmado, COR.confirmado], [justificadas, COR.justificada], [naoJustificadas, COR.infracional]].forEach(([valor, cor]) => {
    if (!valor || !total) return;
    const fim = inicio + (valor / total) * Math.PI * 2;
    ctx.strokeStyle = cor;
    ctx.beginPath(); ctx.arc(cx, cy, r, inicio, fim); ctx.stroke();
    inicio = fim;
  });
  fonte(ctx, Math.round(r * 0.58), 400, 'rye');
  ctx.fillStyle = COR.marfim;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${pct}%`, cx, cy - r * 0.05);
  rotuloEspacado(ctx, 'PRESENÇA', cy + r * 0.33, 22, COR.apagado);
  ctx.textBaseline = 'alphabetic';

  y = A - 200;
  fonte(ctx, 40, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${contagem.confirmado} de ${total} compareceram`, L / 2, y);

  fonte(ctx, 28, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`✅ ${contagem.confirmado} confirmados     ❌ ${justificadas} justificadas     ⭕ ${naoJustificadas} não justificadas`, L / 2, y + 58);

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
  const lugares = posicoesDoPodio(linhas.map(x => x.pct));

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

  // Uma linha por divisao: posicao (ou medalha), nome, barra e %.
  y += 160;
  const alturaLinha = Math.min(96, (A - 190 - y) / linhas.length);
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
    fonte(ctx, 36, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = COR.apagado;
    ctx.fillText(lugares[i] ? MEDALHAS[lugares[i] - 1] : `${i + 1}º`, 165, meio);
    fonte(ctx, 32, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    ctx.fillText(x.nome, 215, meio - 14);
    // A barra, embaixo do nome.
    const bx = 215, bl = 600, by = meio + 18;
    ctx.fillStyle = COR.trilho;
    ctx.beginPath(); retangulo(ctx, bx, by - 5, bl, 10, 5); ctx.fill();
    if (x.pct) {
      ctx.fillStyle = lugares[i] === 1 ? COR.ouro : COR.marfim;
      ctx.beginPath(); retangulo(ctx, bx, by - 5, Math.max(10, bl * x.pct / 100), 10, 5); ctx.fill();
    }
    fonte(ctx, 40, 400, 'rye');
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.marfim;
    ctx.fillText(x.pct === null ? '—' : `${x.pct}%`, L - 130, meio);
    ctx.textBaseline = 'alphabetic';
  });
  ctx.textAlign = 'center';

  rodape(ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// A previa: a imagem grande, com Compartilhar (onde o celular deixa),
// Baixar e Fechar. Fica fora do #app, que e redesenhado a cada toque.
export async function mostrarPreviaImagem(gerar, nomeArquivo) {
  mostrarAviso('🖼️ Montando a imagem…');
  let canvas;
  try {
    canvas = await gerar();
  } catch (e) {
    return mostrarAviso('Não consegui montar a imagem. Tente de novo.');
  }
  const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
  if (!blob) return mostrarAviso('Não consegui montar a imagem. Tente de novo.');
  const arquivo = new File([blob], nomeArquivo, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [arquivo] }));

  fecharPrevia();
  const fundo = document.createElement('div');
  fundo.id = 'previa-imagem';
  fundo.innerHTML = `
    <div class="previa-caixa">
      <img src="${url}" alt="Prévia da imagem">
      <div class="previa-botoes">
        ${podeCompartilhar ? '<button class="btn" data-previa="compartilhar">📤 Compartilhar</button>' : ''}
        <button class="btn ${podeCompartilhar ? 'secondary' : ''}" data-previa="baixar">⬇️ Baixar imagem</button>
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
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return mostrarAviso('⬇️ Imagem baixada');
    }
    if (acao === 'compartilhar') {
      try { await navigator.share({ files: [arquivo] }); } catch (err) { /* cancelou - tudo bem */ }
    }
  });
  document.body.appendChild(fundo);
  document.body.classList.add('com-previa');
  requestAnimationFrame(() => fundo.classList.add('visivel'));
}

function fecharPrevia() {
  const atual = document.getElementById('previa-imagem');
  if (!atual) return;
  const img = atual.querySelector('img');
  if (img) URL.revokeObjectURL(img.src);
  atual.remove();
  document.body.classList.remove('com-previa');
}
