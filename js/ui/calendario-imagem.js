// Uma imagem com o calendario e, depois, paginas so com os eventos.
import { construirGradeCalendario } from '../dominio/estatisticas.js';
import { NOMES_MESES, TIPOS_EVENTO, corTipoEvento, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { diaDaSemana, formatDataBR } from '../nucleo/util.js';
import { novaTela } from './imagem.js';

function fonte(ctx, tamanho, peso = 400) {
  ctx.font = `${peso} ${tamanho}px "IBM Plex Sans", sans-serif`;
}

// Quebra inclusive palavras sem espacos, sem cortar nomes na borda.
function linhasTexto(ctx, texto, largura) {
  const linhas = [];
  let linha = '';
  for (const palavra of String(texto).trim().split(/\s+/)) {
    if (linha && ctx.measureText(linha + ' ' + palavra).width <= largura) {
      linha += ' ' + palavra;
      continue;
    }
    if (linha) linhas.push(linha);
    linha = '';
    for (const letra of palavra) {
      if (linha && ctx.measureText(linha + letra).width > largura) {
        linhas.push(linha);
        linha = '';
      }
      linha += letra;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

function cabecalho(ctx, logo, ano, mes, escopo, titulo) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.drawImage(logo, 60, 40, 130, 130);
  ctx.fillStyle = '#F3E6C4';
  ctx.font = '42px Rye, serif';
  ctx.fillText(`${NOMES_MESES[mes]} ${ano}`, 220, 100);
  fonte(ctx, 30, 600);
  ctx.fillStyle = '#F2EFE8';
  ctx.fillText(escopoPorChave(escopo).nome, 220, 150);
  fonte(ctx, 24, 600);
  ctx.fillStyle = '#D4A24C';
  ctx.fillText(titulo, 60, 224);
}

function rodape(ctx, pagina, total) {
  fonte(ctx, 20);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#BBB6AC';
  ctx.fillText('Consulte o app para acompanhar atualizações.', 60, 1305);
  ctx.textAlign = 'right';
  ctx.fillText(`${pagina} / ${total}`, 1020, 1305);
}

export async function imagensCalendario({ ano, mes, escopo, eventos }) {
  const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}-`;
  const lista = eventos.filter(ev => ev.data && ev.data.startsWith(prefixo))
    .slice().sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || '') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const primeira = await novaTela();
  const paginas = [];
  let usado = 0;
  fonte(primeira.ctx, 30, 600);
  lista.forEach(ev => {
    const linhas = linhasTexto(primeira.ctx, ev.nome || ev.tipo, 900);
    // Um nome excepcionalmente longo continua sem ser cortado.
    for (let i = 0; i < linhas.length; i += 23) {
      const trecho = linhas.slice(i, i + 23);
      const altura = 66 + trecho.length * 36;
      if (!paginas.length || usado + altura > 980) {
        paginas.push([]);
        usado = 0;
      }
      paginas[paginas.length - 1].push({ ev, linhas: trecho, continuacao: i > 0, altura });
      usado += altura;
    }
  });

  const { canvas, ctx, logo } = primeira;
  cabecalho(ctx, logo, ano, mes, escopo, `CALENDÁRIO DO MÊS · ${lista.length} ${lista.length === 1 ? 'EVENTO' : 'EVENTOS'}`);
  const grade = construirGradeCalendario(ano, mes);
  const larguraDia = 960 / 7;
  const alturaDia = 810 / (grade.length / 7);
  ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].forEach((dia, i) => {
    ctx.textAlign = 'center';
    fonte(ctx, 23, 600);
    ctx.fillStyle = '#BBB6AC';
    ctx.fillText(dia, 60 + (i + 0.5) * larguraDia, 282);
  });
  grade.forEach((dia, i) => {
    if (dia === null) return;
    const x = 60 + (i % 7) * larguraDia, y = 310 + Math.floor(i / 7) * alturaDia;
    const data = prefixo + String(dia).padStart(2, '0');
    const doDia = lista.filter(ev => ev.data === data);
    ctx.fillStyle = doDia.length ? '#29251E' : 'rgba(20,20,20,0.85)';
    ctx.fillRect(x, y, larguraDia - 8, alturaDia - 8);
    ctx.strokeStyle = doDia.length ? corTipoEvento(doDia[0].tipo) : '#45433E';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, larguraDia - 8, alturaDia - 8);
    ctx.textAlign = 'center';
    fonte(ctx, 38, 700);
    ctx.fillStyle = '#F2EFE8';
    ctx.fillText(String(dia), x + (larguraDia - 8) / 2, y + 46);
    if (doDia.length) {
      fonte(ctx, 24);
      const tipos = [...new Set(doDia.map(ev => ev.tipo))];
      ctx.fillText(tipos.map(emojiTipoEvento).join(''), x + (larguraDia - 8) / 2, y + 82);
      if (doDia.length > 1) {
        fonte(ctx, 18, 600);
        ctx.fillText(`${doDia.length} eventos`, x + (larguraDia - 8) / 2, y + 109);
      }
    }
  });
  ctx.textAlign = 'left';
  fonte(ctx, 23);
  TIPOS_EVENTO.forEach((tipo, i) => {
    ctx.fillStyle = corTipoEvento(tipo);
    ctx.fillText(`${emojiTipoEvento(tipo)} ${tipo}`, 60 + (i % 2) * 490, 1170 + Math.floor(i / 2) * 40);
  });
  fonte(ctx, 22);
  ctx.fillStyle = '#F2EFE8';
  ctx.fillText(lista.length ? 'Datas e nomes dos eventos nas próximas imagens.' : 'Nenhum evento cadastrado neste mês.', 60, 1255);
  rodape(ctx, 1, paginas.length + 1);
  const telas = [canvas];

  for (let pagina = 0; pagina < paginas.length; pagina++) {
    const detalhe = await novaTela();
    const c = detalhe.ctx;
    cabecalho(c, detalhe.logo, ano, mes, escopo, 'PROGRAMAÇÃO · DETALHES DOS EVENTOS');
    let y = 265;
    paginas[pagina].forEach(({ ev, linhas, continuacao, altura }) => {
      c.fillStyle = 'rgba(16,16,16,0.8)';
      c.fillRect(60, y, 960, altura - 8);
      c.fillStyle = corTipoEvento(ev.tipo);
      c.fillRect(60, y, 5, altura - 8);
      fonte(c, 22, 700);
      c.fillStyle = '#D4A24C';
      c.fillText(`${formatDataBR(ev.data)} · ${diaDaSemana(ev.data)}${continuacao ? ' · continua' : ''}`, 85, y + 24);
      fonte(c, 30, 600);
      c.fillStyle = '#F2EFE8';
      linhas.forEach((linha, i) => c.fillText(linha, 85, y + 61 + i * 36));
      fonte(c, 21);
      c.fillStyle = '#BBB6AC';
      c.fillText(`${emojiTipoEvento(ev.tipo)} ${ev.tipo} · ${escopoPorChave(ev.categoria).nome}`, 85, y + 54 + linhas.length * 36);
      y += altura;
    });
    rodape(c, pagina + 2, paginas.length + 1);
    telas.push(detalhe.canvas);
  }
  return telas;
}
