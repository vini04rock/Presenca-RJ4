// Agenda mensal em paginas de tamanho fixo: grade inteira e lista lateral.
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

export async function imagensCalendario({ ano, mes, escopo, eventos }) {
  const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}-`;
  const lista = eventos.filter(ev => ev.data && ev.data.startsWith(prefixo))
    .slice().sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || '') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const primeira = await novaTela(1000, 1600);
  const paginas = [[]];
  let usado = 0;
  fonte(primeira.ctx, 28, 600);
  lista.forEach(ev => {
    const linhas = linhasTexto(primeira.ctx, ev.nome || ev.tipo, 650);
    // Um nome excepcionalmente longo continua na pagina seguinte.
    for (let i = 0; i < linhas.length; i += 10) {
      const trecho = linhas.slice(i, i + 10);
      const altura = 84 + trecho.length * 34;
      if (usado + altura > 580 && paginas[paginas.length - 1].length) {
        paginas.push([]);
        usado = 0;
      }
      paginas[paginas.length - 1].push({ ev, linhas: trecho, continuacao: i > 0 });
      usado += altura;
    }
  });
  const grade = construirGradeCalendario(ano, mes);
  const telas = [];
  for (let pagina = 0; pagina < paginas.length; pagina++) {
    const { canvas, ctx, logo } = pagina ? await novaTela(1000, 1600) : primeira;
    ctx.textBaseline = 'alphabetic';
    ctx.drawImage(logo, 60, 40, 130, 130);
    ctx.fillStyle = '#F3E6C4';
    ctx.font = '42px Rye, serif';
    ctx.fillText(`${NOMES_MESES[mes]} ${ano}`, 220, 100);
    fonte(ctx, 30, 600);
    ctx.fillStyle = '#F2EFE8';
    ctx.fillText(escopoPorChave(escopo).nome, 220, 150);
    fonte(ctx, 22);
    ctx.fillStyle = '#BBB6AC';
    ctx.fillText('AGENDA DO MÊS', 60, 224);
    ctx.fillText(`EVENTOS DO MÊS · ${lista.length}`, 840, 224);
    ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].forEach((dia, i) => {
      ctx.textAlign = 'center';
      ctx.fillText(dia, 110 + i * 100, 280);
    });
    grade.forEach((dia, i) => {
      if (dia === null) return;
      const x = 60 + (i % 7) * 100, y = 305 + Math.floor(i / 7) * 90;
      const data = prefixo + String(dia).padStart(2, '0');
      const doDia = lista.filter(ev => ev.data === data);
      ctx.fillStyle = doDia.length ? '#29251E' : 'rgba(20,20,20,0.85)';
      ctx.fillRect(x, y, 94, 84);
      ctx.strokeStyle = doDia.length ? corTipoEvento(doDia[0].tipo) : '#45433E';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 94, 84);
      ctx.textAlign = 'center';
      fonte(ctx, 28, 700);
      ctx.fillStyle = '#F2EFE8';
      ctx.fillText(String(dia), x + 47, y + 32);
      if (doDia.length) {
        fonte(ctx, 22);
        const tipos = [...new Set(doDia.map(ev => ev.tipo))];
        ctx.fillText(tipos.slice(0, 2).map(emojiTipoEvento).join(' '), x + 47, y + 58);
        if (doDia.length > 1) {
          fonte(ctx, 14, 600);
          ctx.fillText(`${doDia.length} eventos`, x + 47, y + 76);
        }
      }
    });
    ctx.textAlign = 'left';
    let y = 310;
    if (!lista.length) {
      fonte(ctx, 28);
      ctx.fillStyle = '#F2EFE8';
      ctx.fillText('Nenhum evento cadastrado neste mês.', 840, y);
    }
    paginas[pagina].forEach(({ ev, linhas, continuacao }) => {
      ctx.fillStyle = corTipoEvento(ev.tipo);
      ctx.fillRect(810, y - 23, 5, 56 + linhas.length * 34);
      fonte(ctx, 23, 700);
      ctx.fillStyle = '#D4A24C';
      ctx.fillText(`${formatDataBR(ev.data)} · ${diaDaSemana(ev.data)}${continuacao ? ' · continua' : ''}`, 840, y);
      fonte(ctx, 28, 600);
      ctx.fillStyle = '#F2EFE8';
      linhas.forEach((linha, i) => ctx.fillText(linha, 840, y + 36 + i * 34));
      fonte(ctx, 21);
      ctx.fillStyle = '#BBB6AC';
      ctx.fillText(`${emojiTipoEvento(ev.tipo)} ${ev.tipo} · ${escopoPorChave(ev.categoria).nome}`, 840, y + 40 + linhas.length * 34);
      y += 84 + linhas.length * 34;
    });
    fonte(ctx, 21);
    TIPOS_EVENTO.forEach((tipo, i) => {
      ctx.fillStyle = corTipoEvento(tipo);
      ctx.fillText(`${emojiTipoEvento(tipo)} ${tipo}`, 60 + i * 190, 915);
    });
    fonte(ctx, 19);
    ctx.fillStyle = '#BBB6AC';
    ctx.fillText('Consulte o app para acompanhar atualizações da programação.', 60, 965);
    ctx.textAlign = 'right';
    ctx.fillText(`Página ${pagina + 1} de ${paginas.length}`, 1540, 965);
    telas.push(canvas);
  }
  return telas;
}
