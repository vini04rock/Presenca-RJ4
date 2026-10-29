// Funcoes especiais (28/10/2026): Batedores e Caveiras, so no Regional ->
// Operacional. Cada funcao tem os proprios eventos (so nome, data, horario
// e endereco - sem o tipo Pub/Acao/Reuniao), a marcacao de presenca feita
// pelo organizador, o relatorio de cada evento e as estatisticas.
//
// Tudo aqui vive em state.funcoesDados, que vem de abas proprias da
// planilha - nunca de state.events. Por isso nada daqui aparece no
// calendario, no mural, nos ranks ou no % do clube, e o contrario tambem.
// Regras e textos em dominio/funcoes-especiais.js.

import { api, apiPost } from '../nucleo/api.js';
import { STATUS } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { IMG_FUNCOES_ESPECIAIS } from '../nucleo/imagens.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, dataDoCampoOuAvisar, escapeHtml, formatDataBR, imprimirTexto, ordenarPorHierarquia } from '../nucleo/util.js';
import { carregarFuncoesEspeciais } from '../dados/carregar.js';
import { FUNCOES_ESPECIAIS, contagemEvento, divisaoCurta, dadosDaFuncao, estatisticasFuncao, integrantesDaFuncao, porDivisaoNaOrdemOficial, statusMarcaveis, statusNoEvento, textoEstatisticasFuncao, textoEventoFuncao, textoIndividuaisFuncao,
  EMOJI_CAVEIRAS, relatorioCaveiras, textoRelatorioCaveiras } from '../dominio/funcoes-especiais.js';
import { PERIODOS, rotuloPilula } from '../dominio/doacoes.js';
import { nomeCurtoDoMes, nomeDoMes } from '../dominio/caixinha.js';
import { rotuloPeriodoMovimentos } from '../dominio/movimentos.js';
import { botaoAbrirRelatorio, botaoGerarRelatorio, campoData, medalha, opcoesGerarRelatorio, posicoesDoPodio, selinhoIniciais } from '../ui/comuns.js';
import { renderDonutChart, segmentosDonutStatus } from '../ui/graficos.js';
import { imagemEstatisticasFuncao, imagemIndividuaisFuncao, imagemResultadoEvento, mostrarPreviaImagem } from '../ui/imagem.js';

const COR_FUNCAO = { batedor: '#5FA0C4', caveira: '#C9C2B4' };
// Os rotulos curtos dos botoes de marcacao: cinco por linha nao cabem com o
// nome inteiro num celular. O emoji e o do clube, sempre.
const ROTULO_CURTO = { confirmado: 'Presente', familia: 'Família', trabalho: 'Trabalho', justificada: 'Justificada', infracional: 'Não justif.' };
// Nos Caveiras so ha presente e falta, entao a falta e o ❌ Faltou, o mesmo
// emoji de falta do Relatorio Caveiras.
function rotuloMarcacao(st) {
  if (state.funcaoEspecial === 'caveira' && st === 'infracional') return '❌ Faltou';
  return `${STATUS[st].emoji} ${ROTULO_CURTO[st]}`;
}

function funcao() { return dadosDaFuncao(state.funcaoEspecial); }
function eventos() { return (state.funcoesDados && state.funcoesDados.eventos) || []; }
function eventoPorId(id) { return eventos().find(e => e.id === id); }

function aviso() {
  const m = state.funcoesMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''} no-print" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

function quando(ev) {
  return [ev.data ? formatDataBR(ev.data) : 'Sem data', ev.horario].filter(Boolean).join(' · ');
}

// ---------- a entrada: os dois cards ----------

function renderEntrada() {
  return `
    <div class="fin-explica" style="margin-bottom:14px;">Eventos só dos Batedores e só dos Caveiras. Os números daqui ficam à parte: não entram no calendário, nos ranks nem em nenhum outro relatório do app.</div>
    ${FUNCOES_ESPECIAIS.map(f => {
      const n = integrantesDaFuncao(state.roster, f.chave).length;
      const quantos = `${n} ${n === 1 ? f.singular.toLowerCase() : f.nome.toLowerCase()} no cadastro`;
      const arte = IMG_FUNCOES_ESPECIAIS[f.chave];
      // Com arte: o card e a arte inteira (sem corte), como os do menu, e
      // quantos tem a funcao vai numa linha embaixo dele.
      if (arte) {
        return `
          <div class="card event-card menu-org-card menu-org-secao-arte" role="button" aria-label="${escapeHtml(f.nome + ' - ' + quantos)}"
               data-action="abrir-funcao-especial" data-value="${f.chave}"
               style="background-image:url('${arte.src}'); aspect-ratio:${arte.largura} / ${arte.altura}; margin-bottom:4px;"></div>
          <div class="fin-explica" style="margin:0 0 14px 4px;">${f.selo} ${quantos}</div>
        `;
      }
      return `
        <div class="card event-card menu-org-card" style="border-left:3px solid ${COR_FUNCAO[f.chave]};" data-action="abrir-funcao-especial" data-value="${f.chave}">
          <div class="menu-org-linha">
            <div class="menu-org-icone" style="border-color:${COR_FUNCAO[f.chave]};">${f.selo}</div>
            <div><div class="name">${escapeHtml(f.nome)}</div><div class="meta">${quantos} · eventos, relatórios e estatísticas</div></div>
          </div>
          <div class="arrow">›</div>
        </div>
      `;
    }).join('')}
  `;
}

// ---------- o formulario de evento ----------

// Quem pode ser chamado: quem tem a funcao hoje e, num evento ja criado,
// tambem quem ja esta nele (pode ter perdido a funcao depois - fica a
// escolha de manter ou tirar).
function chamaveis(f) {
  const lista = integrantesDaFuncao(state.roster, state.funcaoEspecial)
    .map(m => ({ membroId: m.id, nome: m.nome, grau: m.grau, divisao: m.divisao }));
  const ev = f.id ? eventoPorId(f.id) : null;
  (ev ? ev.presencas : []).forEach(p => { if (!lista.some(x => x.membroId === p.membroId)) lista.push(p); });
  return porDivisaoNaOrdemOficial(lista);
}

function renderFormulario() {
  const f = state.funcoesForm;
  const fe = funcao();
  const grupos = chamaveis(f);
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);
  return `
    <div class="card no-print">
      <div class="painel-titulo">${f.id ? '✏️ Editar evento' : `${fe.selo} Novo evento dos ${escapeHtml(fe.nome)}`}</div>
      <div class="field"><label>Nome do evento</label><input type="text" maxlength="120" data-funcoes="nome" value="${escapeHtml(f.nome)}" placeholder="Ex: Escolta Bonde Serra"></div>
      <div class="row-gap">
        <div class="field" style="flex:1; min-width:130px;"><label>Data</label><input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="funcoes-data" data-funcoes="data" value="${escapeHtml(f.data)}" placeholder="dd/mm/aaaa" autocomplete="off"></div>
        <div class="field" style="flex:1; min-width:100px;"><label>Horário</label><input type="time" data-funcoes="horario" value="${escapeHtml(f.horario)}"></div>
      </div>
      <div class="field"><label>Endereço</label><input type="text" maxlength="200" data-funcoes="endereco" value="${escapeHtml(f.endereco)}" placeholder="Ex: Posto BR - Av. das Américas, 500"></div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:8px;">
        <label style="margin-bottom:0;">Quem é chamado (${f.membroIds.size} de ${total})</label>
        ${total ? `<div><span class="btn ghost" style="padding:0;" data-action="funcao-chamar-todos">Todos</span><span style="color:var(--text-muted);"> · </span><span class="btn ghost" style="padding:0;" data-action="funcao-chamar-nenhum">Nenhum</span></div>` : ''}
      </div>
      <div class="fin-explica" style="margin:4px 0 6px;">Só aparecem os integrantes com a função ${fe.selo} ${escapeHtml(fe.singular)} no cadastro de Membros (afastados ficam de fora).</div>
      <div style="max-height:300px; overflow-y:auto; margin:5px 0 12px;">
        ${total ? grupos.map(g => `
          <div class="division-subheader"><span>${escapeHtml(g.divisao.toUpperCase())}</span></div>
          ${g.itens.map(p => `
            <div class="checkbox-row" data-action="funcao-chamar" data-id="${escapeHtml(p.membroId)}" style="cursor:pointer;">
              <input type="checkbox" tabindex="-1" style="pointer-events:none;" ${f.membroIds.has(p.membroId) ? 'checked' : ''}>
              <label style="margin:0; font-size:14.5px; color:var(--text); pointer-events:none;">${escapeHtml(p.nome)}${p.grau ? ` (${escapeHtml(p.grau)})` : ''}</label>
            </div>
          `).join('')}
        `).join('') : `<div class="empty">Ninguém tem a função ${fe.selo} ${escapeHtml(fe.singular)} no cadastro ainda.<br>Marque a função no Editar de cada integrante, em Membros.</div>`}
      </div>
      <div class="row-gap">
        <button class="btn" data-action="funcao-salvar-evento" ${state.funcoesSalvando ? 'disabled' : ''}>${state.funcoesSalvando ? 'Salvando…' : f.id ? 'Salvar alterações' : 'Criar evento'}</button>
        <button class="btn secondary" data-action="funcao-cancelar-evento">Cancelar</button>
      </div>
    </div>
  `;
}

// ---------- a marcacao de presenca ----------

function linhaMarcacao(ev, p) {
  const atual = statusNoEvento(ev, p, state.funcoesRascunho);
  const mudou = state.funcoesRascunho[p.membroId] !== undefined;
  return `
    <div class="funcao-linha${mudou ? ' mudou' : ''}">
      <div class="funcao-linha-nome">${selinhoIniciais(p)}<span>${escapeHtml(p.nome)}${p.grau ? ` <span class="grade-box">${escapeHtml(p.grau)}</span>` : ''}</span></div>
      <div class="funcao-status">
        ${statusMarcaveis(state.funcaoEspecial).map(st => `<button class="chip-option ${atual === st ? 'active' : ''}" data-action="funcao-marcar" data-id="${escapeHtml(p.membroId)}" data-value="${st}" title="${escapeHtml(STATUS[st].label)}">${rotuloMarcacao(st)}</button>`).join('')}
      </div>
    </div>
  `;
}

function painelMarcacao(ev) {
  const naoSalvas = Object.keys(state.funcoesRascunho).length;
  const aberto = ev.status !== 'encerrado';
  return `
    <div class="no-print" style="border-top:1px solid var(--line); margin-top:12px; padding-top:12px;">
      <div class="fin-explica" style="margin-bottom:8px;">${aberto
        ? `Toque no status de cada um. Tocar de novo no marcado volta para ⚠️ sem marcação. Ao encerrar, quem ficar sem marcação vira ${state.funcaoEspecial === 'caveira' ? '❌ Faltou' : '⭕ Não justificada'}.`
        : 'Corrigindo a marcação de um evento encerrado.'}</div>
      ${aberto ? '<button class="btn ghost" style="padding:0; margin-bottom:8px;" data-action="funcao-todos-presentes">✅ Marcar todos os sem marcação como presentes</button>' : ''}
      ${porDivisaoNaOrdemOficial(ev.presencas).map(g => `
        <div class="division-subheader"><span>${escapeHtml(g.divisao.toUpperCase())}</span><span class="division-counts">${g.itens.length}</span></div>
        ${g.itens.map(p => linhaMarcacao(ev, p)).join('')}
      `).join('') || '<div class="empty">Ninguém chamado neste evento. Use o Editar para chamar.</div>'}
      ${naoSalvas ? `
        <div class="row-gap" style="margin-top:12px;">
          <button class="btn" style="flex:2;" data-action="funcao-salvar-marcacao" ${state.funcoesSalvando ? 'disabled' : ''}>${state.funcoesSalvando ? 'Salvando…' : `💾 Salvar marcação (${naoSalvas})`}</button>
          <button class="btn secondary" style="flex:1;" data-action="funcao-descartar-marcacao">Descartar</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ---------- o relatorio de um evento ----------

function detalheEvento(ev) {
  const c = contagemEvento(ev);
  const segmentos = segmentosDonutStatus({ confirmado: c.confirmado, justificada: c.justificadas, infracional: c.infracional });
  if (ev.status !== 'encerrado') segmentos.push({ label: 'Sem marcação', value: c.aguardando, cor: 'var(--status-aguardando)' });
  const nomes = (filtro) => porDivisaoNaOrdemOficial(ev.presencas).flatMap(g => g.itens)
    .filter(p => filtro(statusNoEvento(ev, p)))
    .map(p => {
      const st = statusNoEvento(ev, p);
      const motivo = ['familia', 'trabalho', 'justificada'].includes(st) ? ` - ${STATUS[st].label}` : '';
      return `${p.nome} (${divisaoCurta(p.divisao)})${motivo}`;
    });
  const secao = (rotulo, emoji, lista) => lista.length ? `
    <div style="margin-top:10px;">
      <div style="font-size:11px; color:var(--text-muted); letter-spacing:0.03em; margin-bottom:4px;">${emoji} ${rotulo.toUpperCase()} (${lista.length})</div>
      <div style="font-size:13.5px; color:var(--text); line-height:1.6;">${lista.map(escapeHtml).join(', ')}</div>
    </div>
  ` : '';
  return `
    <div style="border-top:1px solid var(--line); margin-top:12px; padding-top:12px;">
      ${renderDonutChart(segmentos, c.pct === null ? '—' : c.pct + '%', 'presença', 130)}
      ${secao('Presentes', '✅', nomes(st => st === 'confirmado'))}
      ${secao('Falta justificada', '❌', nomes(st => ['familia', 'trabalho', 'justificada'].includes(st)))}
      ${secao('Sem marcação', '⚠️', nomes(st => st === 'aguardando'))}
      ${secao('Falta não justificada', '⭕', nomes(st => st === 'infracional'))}
    </div>
  `;
}

function opcoesRelatorioEvento(ev) {
  return [
    { acao: 'funcao-copiar-evento', id: ev.id, rotulo: '📋 WhatsApp' },
    { acao: 'funcao-pdf-evento', id: ev.id, rotulo: '📄 PDF' },
    { acao: 'funcao-imagem-evento', id: ev.id, rotulo: '🖼️ Imagem' },
  ];
}

function excluirEvento(ev) {
  if (state.funcoesApagarId !== ev.id) {
    return `<button class="btn ghost block no-print" style="margin-top:8px;" data-action="funcao-apagar-pedir" data-id="${escapeHtml(ev.id)}">Excluir evento</button>`;
  }
  return `
    <div class="alert no-print" style="margin-top:10px;">
      <div class="alert-title">Excluir "${escapeHtml(ev.nome)}"?</div>
      <div class="alert-msg">Apaga o evento e a marcação de todos. Não dá para desfazer.</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn danger" data-action="funcao-apagar-confirmar" data-id="${escapeHtml(ev.id)}">Sim, excluir</button>
        <button class="btn secondary" data-action="funcao-apagar-cancelar">Cancelar</button>
      </div>
    </div>
  `;
}

// Um card de evento, ativo ou encerrado. Com o "Gerar relatorio" de um
// evento aberto, o PDF sai so com ele: os outros cards ficam no-print.
function cardEvento(ev, menuAberto) {
  const c = contagemEvento(ev);
  const aberto = state.funcoesAberto === ev.id;
  const encerrado = ev.status === 'encerrado';
  const esteMenu = state.gerarRelatorioAberto === 'funcao:' + ev.id;
  const corrigindo = encerrado && aberto && state.funcoesCorrigindo;
  const semRascunho = !aberto || !Object.keys(state.funcoesRascunho).length;
  return `
    <div class="card ${menuAberto && !esteMenu ? 'no-print' : ''}" style="border-left:3px solid ${COR_FUNCAO[state.funcaoEspecial]};">
      <div class="member-head">
        <div style="min-width:0;">
          <div class="nome-evento-card">${escapeHtml(ev.nome)}</div>
          <div style="color:var(--text-muted); font-size:12px; margin-top:5px;">🗓️ ${escapeHtml(quando(ev))}${ev.endereco ? ` · 📍 ${escapeHtml(ev.endereco)}` : ''}</div>
          <div style="color:var(--text-muted); font-size:12px; margin-top:3px;">${c.total} ${c.total === 1 ? 'chamado' : 'chamados'}${encerrado && c.pct !== null ? ` · <b style="color:var(--white-strong);">${c.pct}% de presença</b>` : !encerrado ? ` · ✅ ${c.confirmado} · ⚠️ ${c.aguardando} sem marcação` : ''}</div>
        </div>
        <button class="btn funcao-abrir no-print" data-action="funcao-abrir-evento" data-id="${escapeHtml(ev.id)}">${aberto ? '▴ Fechar' : encerrado ? '📊 Ver relatório' : '✅ Marcar presença'}</button>
      </div>
      ${encerrado ? `
        <div class="count-grid">
          <div class="count-box-report">✅ Presentes <b>${c.confirmado}</b></div>
          <div class="count-box-report">❌ Falta justificada <b>${c.justificadas}</b></div>
          <div class="count-box-report">⭕ Falta não justificada <b>${c.infracional}</b></div>
        </div>
      ` : ''}
      <div class="row-gap no-print funcao-acoes">
        ${semRascunho ? botaoAbrirRelatorio('funcao:' + ev.id, 'btn secondary btn-compacto') : ''}
        <button class="btn secondary btn-compacto" data-action="funcao-editar-evento" data-id="${escapeHtml(ev.id)}">✏️ Editar</button>
        ${encerrado && aberto ? `<button class="btn secondary btn-compacto" data-action="funcao-corrigir-marcacao" data-id="${escapeHtml(ev.id)}">${corrigindo ? '📊 Relatório' : '✅ Corrigir'}</button>` : ''}
        <button class="btn secondary btn-compacto" data-action="funcao-mudar-status" data-id="${escapeHtml(ev.id)}" ${state.funcoesSalvando ? 'disabled' : ''}>${encerrado ? '↩️ Reabrir' : '🏁 Encerrar'}</button>
      </div>
      ${semRascunho ? opcoesGerarRelatorio('funcao:' + ev.id, opcoesRelatorioEvento(ev)) : ''}
      ${esteMenu ? `<div class="print-only" style="margin-top:12px; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>` : ''}
      ${aberto && (!encerrado || corrigindo) ? painelMarcacao(ev) : ''}
      ${(aberto && encerrado && !corrigindo) || esteMenu ? detalheEvento(ev) : ''}
      ${encerrado ? excluirEvento(ev) : ''}
    </div>
  `;
}

function renderEventos(encerrados) {
  const fe = funcao();
  const lista = eventos().filter(e => (e.status === 'encerrado') === encerrados)
    .sort((a, b) => encerrados
      ? (b.data || '').localeCompare(a.data || '')
      : (a.data || '9999').localeCompare(b.data || '9999'));
  const menuAberto = lista.some(ev => state.gerarRelatorioAberto === 'funcao:' + ev.id);
  const vazio = encerrados
    ? `<div class="empty">Nenhum evento dos ${escapeHtml(fe.nome)} encerrado ainda.<br>Os relatórios aparecem aqui depois que você encerrar um evento.</div>`
    : `<div class="empty">Nenhum evento dos ${escapeHtml(fe.nome)} em aberto.</div>`;
  return `
    <div class="${menuAberto ? 'no-print' : ''}">
      ${aviso()}
      ${state.funcoesForm ? renderFormulario() : encerrados ? '' : `<button class="btn block no-print" style="margin-bottom:14px;" data-action="funcao-novo-evento">＋ Novo evento dos ${escapeHtml(fe.nome)}</button>`}
    </div>
    ${lista.length ? lista.map(ev => cardEvento(ev, menuAberto)).join('') : vazio}
  `;
}

// ---------- as estatisticas ----------

function pilulasPeriodo() {
  const p = state.funcoesPeriodo;
  const livre = p && typeof p === 'object' ? p : null;
  return `
    <div class="no-print">
      <div class="pilulas-periodo">
        ${PERIODOS.map(m => `<button class="pilula ${p === m ? 'active' : ''}" data-action="funcao-periodo" data-value="${m}">${rotuloPilula(m)}</button>`).join('')}
      </div>
      <div class="fin-ou-mes">ou por período${livre ? `: <b>${escapeHtml(rotuloPeriodoMovimentos(livre))}</b>` : ''}</div>
      <div class="row-gap">
        ${campoData({ id: 'funcoes-periodo-de', rotulo: 'De', valor: livre ? livre.de : '', estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'funcoes-periodo-ate', rotulo: 'Até', valor: livre ? livre.ate : '', estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <button class="btn secondary block" style="margin:8px 0 14px;" data-action="funcao-aplicar-periodo">Aplicar período</button>
    </div>
  `;
}

function linhaPct(nome, detalhe, pct, extra) {
  return `
    <div class="card presenca-row">
      <div class="presenca-info">
        <div class="presenca-nome">${nome}</div>
        <div class="presenca-contagem">${detalhe}</div>
      </div>
      <div class="presenca-pct-wrap">
        <div class="presenca-barra"><div class="presenca-barra-fill" style="width:${pct || 0}%" data-anima="barra:${pct || 0}"></div></div>
        <div class="presenca-pct">${extra || ''}${pct === null ? '—' : pct + '%'}</div>
      </div>
    </div>
  `;
}

function barrasPorMes(porMes) {
  if (!porMes.length) return '';
  return `
    <div class="barras-meses" data-anima="barras-funcoes:${porMes.map(m => m.pct).join(',')}">
      ${porMes.map(m => `
        <div class="barra-mes" title="${escapeHtml(nomeDoMes(m.mes))}: ${m.confirmados} de ${m.convites} · ${m.eventos} ${m.eventos === 1 ? 'evento' : 'eventos'}">
          <div class="barra-mes-pct">${m.pct === null ? '—' : m.pct + '%'}</div>
          <div class="barra-mes-trilho"><div class="barra-mes-cheia" style="height:${m.pct || 0}%;"></div></div>
          <div class="barra-mes-nome">${escapeHtml(nomeCurtoDoMes(m.mes))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function semEventosNoPeriodo(fe) {
  return `${pilulasPeriodo()}<div class="empty">Nenhum evento dos ${escapeHtml(fe.nome)} encerrado ${state.funcoesPeriodo ? 'nesse período' : 'ainda'}.<br>As estatísticas contam só os eventos encerrados.</div>`;
}

function cabecalhoImpressao(fe, titulo) {
  return `<div class="print-only" style="margin-bottom:10px;">${fe.selo} ${escapeHtml(fe.nome)}${titulo ? ` · ${titulo}` : ''} · ${escapeHtml(rotuloPeriodoMovimentos(state.funcoesPeriodo))} · gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>`;
}

// Um evento nas estatisticas: a rosca dele e o proprio Gerar relatorio (o
// mesmo da aba Encerrados). Com o menu dele aberto, o resto da aba e
// no-print e o card mostra o detalhe com os nomes - o PDF sai so com ele.
function cardEventoEstatisticas(ev, c, menuAberto) {
  const esteMenu = state.gerarRelatorioAberto === 'funcao:' + ev.id;
  return `
    <div class="card ${menuAberto && !esteMenu ? 'no-print' : ''}" style="border-left:3px solid ${COR_FUNCAO[state.funcaoEspecial]};">
      <div class="nome-evento-card">${escapeHtml(ev.nome)}</div>
      <div style="color:var(--text-muted); font-size:12px; margin-top:5px;">🗓️ ${escapeHtml(quando(ev))} · ${c.confirmado} de ${c.total} · <b style="color:var(--white-strong);">${c.pct === null ? '—' : c.pct + '%'} de presença</b></div>
      ${esteMenu ? detalheEvento(ev) : `<div style="margin-top:10px;">${renderDonutChart(segmentosDonutStatus({ confirmado: c.confirmado, justificada: c.justificadas, infracional: c.infracional }), c.pct === null ? '—' : c.pct + '%', 'presença', 100)}</div>`}
      ${botaoGerarRelatorio('funcao:' + ev.id, opcoesRelatorioEvento(ev))}
      ${esteMenu ? `<div class="print-only" style="margin-top:12px; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>` : ''}
    </div>
  `;
}

function renderEstatisticas() {
  const fe = funcao();
  const r = estatisticasFuncao(eventos(), state.funcoesPeriodo);
  const g = r.geral;
  if (!r.eventos) return semEventosNoPeriodo(fe);
  const menuEvento = r.porEvento.some(({ ev }) => state.gerarRelatorioAberto === 'funcao:' + ev.id);
  return `
    <div class="${menuEvento ? 'no-print' : ''}">
      ${pilulasPeriodo()}
      ${cabecalhoImpressao(fe, '')}
      <div class="card donut-card donut-card-total">
        <div class="painel-titulo">${fe.selo} Presença dos ${escapeHtml(fe.nome)}</div>
        <div class="fin-explica">${escapeHtml(rotuloPeriodoMovimentos(state.funcoesPeriodo))} · ${r.eventos} ${r.eventos === 1 ? 'evento encerrado' : 'eventos encerrados'} · ${g.confirmados} de ${g.convites} presenças</div>
        ${renderDonutChart(segmentosDonutStatus({ confirmado: g.confirmados, justificada: g.justificadas, infracional: g.naoJustificadas }), g.pct + '%', 'presença', 130)}
        ${botaoGerarRelatorio('funcoes-estatisticas', [
          { acao: 'funcao-copiar-estatisticas', rotulo: '📋 WhatsApp' },
          { acao: 'funcao-pdf-estatisticas', rotulo: '📄 PDF' },
          { acao: 'funcao-imagem-estatisticas', rotulo: '🖼️ Imagem' },
        ])}
      </div>
      ${r.porMes.length > 1 ? `<div class="card"><div class="painel-titulo">📅 Mês a mês</div>${barrasPorMes(r.porMes)}</div>` : ''}
      <div class="painel-titulo" style="margin-top:6px;">Por evento</div>
    </div>
    ${r.porEvento.map(({ ev, c }) => cardEventoEstatisticas(ev, c, menuEvento)).join('')}
  `;
}

// A aba das estatisticas individuais: cada integrante, no mesmo periodo da
// aba Estatisticas (state.funcoesPeriodo e um so).
function renderIndividuais() {
  const fe = funcao();
  const r = estatisticasFuncao(eventos(), state.funcoesPeriodo);
  if (!r.eventos) return semEventosNoPeriodo(fe);
  const lugares = posicoesDoPodio(r.porIntegrante.map(p => (p.pct > 0 ? p.pct : null)));
  return `
    ${pilulasPeriodo()}
    ${cabecalhoImpressao(fe, 'Estatísticas individuais')}
    <div class="card">
      <div class="painel-titulo">📊 Estatísticas individuais</div>
      <div class="fin-explica">${escapeHtml(rotuloPeriodoMovimentos(state.funcoesPeriodo))} · ${r.eventos} ${r.eventos === 1 ? 'evento encerrado' : 'eventos encerrados'} · ${r.porIntegrante.length} ${r.porIntegrante.length === 1 ? escapeHtml(fe.singular.toLowerCase()) : escapeHtml(fe.nome.toLowerCase())}</div>
      ${botaoGerarRelatorio('funcoes-individuais', [
        { acao: 'funcao-copiar-individuais', rotulo: '📋 WhatsApp' },
        { acao: 'funcao-pdf-individuais', rotulo: '📄 PDF' },
        { acao: 'funcao-imagem-individuais', rotulo: '🖼️ Imagem' },
      ])}
    </div>
    ${r.porIntegrante.map((p, i) => linhaPct(
      `${medalha(lugares[i])}${escapeHtml(p.nome)}${p.grau ? ` <span class="grade-box">${escapeHtml(p.grau)}</span>` : ''}`,
      `${escapeHtml(divisaoCurta(p.divisao))} · ${p.confirmados} de ${p.eventos} ${p.eventos === 1 ? 'evento' : 'eventos'}${p.justificadas ? ` · ❌ ${p.justificadas}` : ''}${p.naoJustificadas ? ` · ⭕ ${p.naoJustificadas}` : ''}`,
      p.pct)).join('')}
  `;
}

// ---------- o Relatorio Caveiras (so nos Caveiras) ----------

function caveira01() { return (state.funcoesDados && state.funcoesDados.config && state.funcoesDados.config.caveira01) || ''; }
function modeloCaveiras() { return relatorioCaveiras(eventos(), state.roster, state.funcoesPeriodo, caveira01()); }

// O quadro de escolher quem abre a lista. A escolha fica gravada na
// planilha (FuncoesConfig), pra valer em qualquer celular.
function quadroCaveira01() {
  const titulares = ordenarPorHierarquia((state.roster || []).filter(m => (m.funcoes || []).includes('caveira')));
  const atual = titulares.find(m => m.id === caveira01());
  const aberto = state.funcoesCaveira01Aberto;
  return `
    <div class="card no-print">
      <div class="member-head">
        <div style="min-width:0;">
          <div style="font-size:11px; color:var(--text-muted); letter-spacing:0.03em;">💀 CAVEIRA 01</div>
          <div class="nome-evento-card" style="margin-top:3px;">${atual ? escapeHtml(atual.nome) : '<span style="color:var(--text-muted);">Ninguém escolhido</span>'}</div>
        </div>
        <button class="btn secondary btn-compacto" data-action="funcao-caveira01-abrir" ${state.funcoesSalvando ? 'disabled' : ''}>${aberto ? '▴ Fechar' : atual ? 'Trocar' : 'Escolher'}</button>
      </div>
      ${aberto ? `
        <div class="fin-explica" style="margin-top:10px;">Quem ficar no 01 abre a lista; o resto segue a hierarquia.</div>
        ${titulares.length ? `<div class="chip-row" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
          ${titulares.map(m => `<button class="chip-option ${atual && atual.id === m.id ? 'active' : ''}" data-action="funcao-caveira01-escolher" data-id="${escapeHtml(m.id)}" ${state.funcoesSalvando ? 'disabled' : ''}>${escapeHtml(m.nome)}</button>`).join('')}
          ${atual ? `<button class="chip-option" data-action="funcao-caveira01-escolher" data-id="" ${state.funcoesSalvando ? 'disabled' : ''}>Ninguém (só a hierarquia)</button>` : ''}
        </div>` : '<div class="empty">Nenhum integrante com a função 💀 Caveira no cadastro.</div>'}
      ` : ''}
    </div>
  `;
}

function linhaCaveira(rotulo, l) {
  return `
    <div style="display:flex; align-items:center; gap:10px; padding:7px 0; border-top:1px solid var(--line);">
      <div style="flex:1; min-width:0;">
        <div style="font-size:14px; color:var(--text);"><b>${rotulo}</b> ${escapeHtml(l.nome)}</div>
        <div style="font-size:15px; letter-spacing:1px; margin-top:2px;">${l.emojis.join('') || '<span style="color:var(--text-muted); font-size:12px;">sem evento no período</span>'}</div>
      </div>
      <div style="font-weight:700; color:var(--white-strong); min-width:46px; text-align:right;">${l.pct === null ? '—' : l.pct + '%'}</div>
    </div>
  `;
}

function renderRelatorioCaveiras() {
  if (state.funcaoEspecial !== 'caveira') return renderEventos(false);
  const r = modeloCaveiras();
  const n2 = i => String(i).padStart(2, '0');
  return `
    ${pilulasPeriodo()}
    ${aviso()}
    ${quadroCaveira01()}
    <div class="card">
      <div class="painel-titulo">💀 Relatório Caveiras</div>
      <div class="fin-explica">Avaliação ${escapeHtml(r.avaliacao)} · ${r.eventos.length} ${r.eventos.length === 1 ? 'evento encerrado' : 'eventos encerrados'} · ${EMOJI_CAVEIRAS.presente} Missão concluída · ${EMOJI_CAVEIRAS.falta} Não participação · ${EMOJI_CAVEIRAS.fora} Não estava na equipe</div>
      <div class="painel-titulo" style="margin-top:12px;">💀 Caveira titular</div>
      ${r.titulares.length ? r.titulares.map((l, i) => linhaCaveira(`💀${n2(i + 1)}-`, l)).join('') : '<div class="empty">Nenhum titular no cadastro.</div>'}
      <div class="painel-titulo" style="margin-top:14px;">🪖 Suplentes</div>
      ${r.suplentes.length ? r.suplentes.map(l => linhaCaveira('🪖', l)).join('') : '<div class="empty">Nenhum suplente no cadastro.</div>'}
      <div class="fin-explica" style="margin-top:10px;">No texto, cada lista é completada até 10 linhas, como no modelo do clube.</div>
    </div>
    <div class="card">
      <div class="painel-titulo">📋 Reuniões / Missão</div>
      ${r.eventos.length ? r.eventos.map((ev, i) => `
        <div style="padding:7px 0; border-top:1px solid var(--line);">
          <div style="font-size:14px; color:var(--text);"><b>${i + 1}.</b> ${escapeHtml(ev.nome)}</div>
          <div style="color:var(--text-muted); font-size:12px; margin-top:2px;">🗓️ ${escapeHtml(quando(ev))}${ev.endereco ? ` · 📍 ${escapeHtml(ev.endereco)}` : ''}</div>
        </div>
      `).join('') : '<div class="empty">Nenhum evento encerrado no período.</div>'}
    </div>
    <div class="card no-print">
      <div class="field" style="margin-bottom:10px;">
        <label>Patchs caveiras em uso</label>
        <input type="number" inputmode="numeric" min="0" id="funcoes-patchs" value="${escapeHtml(state.funcoesPatchs)}" placeholder="Quantos patchs estão em uso hoje" autocomplete="off">
      </div>
      <div class="row-gap">
        <button class="btn" style="flex:1;" data-action="funcao-copiar-caveiras">📋 Copiar pro WhatsApp</button>
        <button class="btn secondary" style="flex:1;" data-action="funcao-pdf-caveiras">📄 PDF</button>
      </div>
    </div>
  `;
}

// ---------- a aba ----------

export function renderAdminFuncoesEspeciais() {
  if (state.adminTab === 'funcoes-especiais') return renderEntrada();
  if (state.funcoesCarregando && !state.funcoesDados) return '<div class="loading">Carregando eventos…</div>';
  if (state.funcoesErro) {
    return `<div class="alert"><div class="alert-msg">${escapeHtml(state.funcoesErro)}.</div><button class="btn secondary block" style="margin-top:10px;" data-action="funcao-recarregar">Tentar de novo</button></div>`;
  }
  if (state.adminTab === 'funcoes-encerrados') return renderEventos(true);
  if (state.adminTab === 'funcoes-estatisticas') return renderEstatisticas();
  if (state.adminTab === 'funcoes-individuais') return renderIndividuais();
  if (state.adminTab === 'funcoes-relatorio-caveiras') return renderRelatorioCaveiras();
  return renderEventos(false);
}

// O titulo da secao de uma funcao ("🛡️ Batedores"), pro esqueleto.
export function tituloFuncaoEspecial() {
  const f = funcao();
  return `${f.selo} ${f.nome}`;
}

// Os campos do formulario so lembram, sem redesenhar - redesenhar fecharia
// o teclado do celular. Devolve true se o campo era daqui.
export function atualizarCampoFuncoes(el) {
  if (el.id === 'funcoes-patchs') { state.funcoesPatchs = el.value; return true; }
  const chave = el.dataset && el.dataset.funcoes;
  if (!chave || !state.funcoesForm) return false;
  state.funcoesForm[chave] = el.value;
  return true;
}

export function fecharFuncoesEspeciais() {
  state.funcoesForm = null;
  state.funcoesAberto = null;
  state.funcoesRascunho = {};
  state.funcoesCorrigindo = false;
  state.funcoesApagarId = null;
  state.funcoesMsg = null;
}

function novoForm(ev) {
  if (ev) {
    return { id: ev.id, nome: ev.nome, data: formatDataBR(ev.data) || '', horario: ev.horario || '', endereco: ev.endereco || '',
      membroIds: new Set(ev.presencas.map(p => p.membroId)) };
  }
  return { id: '', nome: '', data: '', horario: '', endereco: '',
    membroIds: new Set(integrantesDaFuncao(state.roster, state.funcaoEspecial).map(m => m.id)) };
}

// Os "Patchs caveiras em uso" do campo, ou null (e avisa) se estiver vazio.
function textoDosPatchs() {
  const v = String(state.funcoesPatchs || '').trim();
  if (!/^\d+$/.test(v)) {
    alert('Preencha quantos patchs caveiras estão em uso.');
    const el = document.getElementById('funcoes-patchs');
    if (el) el.focus();
    return null;
  }
  return v;
}

// Ha marcacao nao salva: confirma antes de perder.
export function podeDescartar() {
  return !Object.keys(state.funcoesRascunho).length || confirm('Há marcação não salva neste evento. Descartar?');
}

async function gravarMarcacao(ev) {
  const marcacoes = { ...state.funcoesRascunho };
  if (!Object.keys(marcacoes).length) return true;
  await apiPost('funcaoPresencasSalvar', { eventoId: ev.id, marcacoes });
  ev.presencas.forEach(p => { if (marcacoes[p.membroId]) p.status = marcacoes[p.membroId]; });
  state.funcoesRascunho = {};
  return true;
}

// Toda gravacao: trava os botoes, grava e recarrega da planilha (que e
// quem tem a palavra final - o encerrar converte status la).
async function gravar(tarefa, sucesso) {
  if (state.funcoesSalvando) return;
  state.funcoesSalvando = true;
  state.funcoesMsg = null;
  render();
  try {
    await tarefa();
    state.funcoesMsg = sucesso ? { ok: true, texto: sucesso } : null;
    state.funcoesSalvando = false;
    await carregarFuncoesEspeciais();
  } catch (e) {
    state.funcoesMsg = { ok: false, texto: e.message };
    state.funcoesSalvando = false;
    render();
  }
}

export const acoes = {
  'funcao-recarregar': async (id, target, action, e) => carregarFuncoesEspeciais(),

  'funcao-novo-evento': async (id, target, action, e) => {
    state.funcoesForm = novoForm(null);
    state.funcoesMsg = null;
    return render();
  },
  'funcao-editar-evento': async (id, target, action, e) => {
    const ev = eventoPorId(id);
    if (!ev || !podeDescartar()) return;
    state.funcoesRascunho = {};
    state.funcoesForm = novoForm(ev);
    state.funcoesMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'funcao-cancelar-evento': async (id, target, action, e) => { state.funcoesForm = null; return render(); },
  'funcao-chamar': async (id, target, action, e) => {
    const s = state.funcoesForm.membroIds;
    if (s.has(id)) s.delete(id); else s.add(id);
    return render();
  },
  'funcao-chamar-todos': async (id, target, action, e) => {
    chamaveis(state.funcoesForm).forEach(g => g.itens.forEach(p => state.funcoesForm.membroIds.add(p.membroId)));
    return render();
  },
  'funcao-chamar-nenhum': async (id, target, action, e) => { state.funcoesForm.membroIds = new Set(); return render(); },
  'funcao-salvar-evento': async (id, target, action, e) => {
    const f = state.funcoesForm;
    if (!String(f.nome).trim()) { state.funcoesMsg = { ok: false, texto: 'Escreva o nome do evento.' }; return render(); }
    const data = dataDoCampoOuAvisar('funcoes-data', 'A data do evento');
    if (data === null) return;
    if (!f.membroIds.size) { state.funcoesMsg = { ok: false, texto: `Chame pelo menos um dos ${funcao().nome}.` }; return render(); }
    const novo = !f.id;
    return gravar(async () => {
      await api('funcaoEventoSalvar', {
        id: f.id, funcao: state.funcaoEspecial, nome: String(f.nome).trim(), data, horario: f.horario || '',
        endereco: String(f.endereco || '').trim(), membroIds: [...f.membroIds].join(','),
      });
      state.funcoesForm = null;
    }, novo ? 'Evento criado. Toque nele para marcar a presença.' : 'Evento atualizado.');
  },

  'funcao-abrir-evento': async (id, target, action, e) => {
    if (!podeDescartar()) return;
    state.funcoesAberto = state.funcoesAberto === id ? null : id;
    state.funcoesRascunho = {};
    state.funcoesCorrigindo = false;
    return render();
  },
  'funcao-marcar': async (id, target, action, e) => {
    const ev = eventoPorId(state.funcoesAberto);
    const p = ev && ev.presencas.find(x => x.membroId === id);
    if (!p) return;
    const st = target.dataset.value;
    const atual = statusNoEvento(ev, p, state.funcoesRascunho);
    // Tocar de novo no marcado desmarca - so no evento aberto; no
    // encerrado nao existe "sem marcacao".
    const novo = atual === st && ev.status !== 'encerrado' ? 'aguardando' : st;
    if (novo === p.status) delete state.funcoesRascunho[id]; else state.funcoesRascunho[id] = novo;
    return render();
  },
  'funcao-todos-presentes': async (id, target, action, e) => {
    const ev = eventoPorId(state.funcoesAberto);
    if (!ev) return;
    ev.presencas.forEach(p => {
      if (statusNoEvento(ev, p, state.funcoesRascunho) === 'aguardando') state.funcoesRascunho[p.membroId] = 'confirmado';
    });
    return render();
  },
  'funcao-descartar-marcacao': async (id, target, action, e) => { state.funcoesRascunho = {}; return render(); },
  'funcao-salvar-marcacao': async (id, target, action, e) => {
    const ev = eventoPorId(state.funcoesAberto);
    if (!ev) return;
    return gravar(() => gravarMarcacao(ev), 'Marcação salva.');
  },
  'funcao-corrigir-marcacao': async (id, target, action, e) => {
    if (state.funcoesCorrigindo && !podeDescartar()) return;
    state.funcoesCorrigindo = !state.funcoesCorrigindo;
    state.funcoesRascunho = {};
    return render();
  },
  // Encerrar salva antes o que estiver marcado; quem sobrar sem marcacao
  // vira Nao justificada na planilha. Reabrir devolve so esses.
  'funcao-mudar-status': async (id, target, action, e) => {
    const ev = eventoPorId(id);
    if (!ev) return;
    const encerrar = ev.status !== 'encerrado';
    if (encerrar) {
      const c = contagemEvento(ev, state.funcoesAberto === id ? state.funcoesRascunho : null);
      if (c.aguardando && !confirm(`${c.aguardando} ${c.aguardando === 1 ? 'integrante está' : 'integrantes estão'} sem marcação e ${c.aguardando === 1 ? 'vai virar' : 'vão virar'} ⭕ Não justificada. Encerrar mesmo assim?`)) return;
    } else if (!podeDescartar()) return;
    return gravar(async () => {
      if (encerrar && state.funcoesAberto === id) await gravarMarcacao(ev);
      state.funcoesRascunho = {};
      await api('funcaoEventoStatus', { id, status: encerrar ? 'encerrado' : 'ativo' });
      state.funcoesAberto = null;
      state.funcoesCorrigindo = false;
    }, encerrar ? 'Evento encerrado: ele está agora na aba Encerrados.' : 'Evento reaberto: ele voltou para a aba Eventos.');
  },
  'funcao-apagar-pedir': async (id, target, action, e) => { state.funcoesApagarId = id; return render(); },
  'funcao-apagar-cancelar': async (id, target, action, e) => { state.funcoesApagarId = null; return render(); },
  'funcao-apagar-confirmar': async (id, target, action, e) => {
    return gravar(async () => {
      await api('funcaoEventoRemover', { id });
      state.funcoesApagarId = null;
      if (state.funcoesAberto === id) state.funcoesAberto = null;
    }, 'Evento excluído.');
  },

  'funcao-copiar-evento': async (id, target, action, e) => {
    const ev = eventoPorId(id);
    if (ev) return copiarTexto(textoEventoFuncao(ev, state.funcaoEspecial));
  },
  // A impressao do navegador: com o menu do evento aberto, os outros cards
  // ja estao no-print, e o detalhe dele ja aparece.
  'funcao-pdf-evento': async (id, target, action, e) => { window.print(); },
  'funcao-imagem-evento': async (id, target, action, e) => {
    const ev = eventoPorId(id);
    if (!ev) return;
    const fe = funcao();
    const c = contagemEvento(ev);
    // O formato que o resultado de evento do clube espera: memberIds e as
    // contagens; a "origem" no lugar da divisao.
    const comoEvento = { ...ev, tipo: '', memberIds: ev.presencas.map(p => p.membroId), origem: `${fe.selo} ${fe.nome}` };
    return mostrarPreviaImagem(() => imagemResultadoEvento(comoEvento, c), `${fe.chave}-${ev.data || 'evento'}.png`);
  },

  'funcao-periodo': async (id, target, action, e) => { state.funcoesPeriodo = Number(target.dataset.value); return render(); },
  // De em branco = desde o comeco; Ate em branco = ate hoje.
  'funcao-aplicar-periodo': async (id, target, action, e) => {
    const de = dataDoCampoOuAvisar('funcoes-periodo-de', 'A data "De"');
    if (de === null) return;
    const ate = dataDoCampoOuAvisar('funcoes-periodo-ate', 'A data "Até"');
    if (ate === null) return;
    if (de && ate && de > ate) { alert('A data "De" não pode ser depois da data "Até".'); return; }
    state.funcoesPeriodo = de || ate ? { de, ate } : 0;
    return render();
  },
  'funcao-copiar-estatisticas': async (id, target, action, e) => {
    const r = estatisticasFuncao(eventos(), state.funcoesPeriodo);
    return copiarTexto(textoEstatisticasFuncao(r, state.funcaoEspecial, state.funcoesPeriodo));
  },
  'funcao-pdf-estatisticas': async (id, target, action, e) => { window.print(); },
  'funcao-imagem-estatisticas': async (id, target, action, e) => {
    const fe = funcao();
    const r = estatisticasFuncao(eventos(), state.funcoesPeriodo);
    return mostrarPreviaImagem(() => imagemEstatisticasFuncao(r, fe, rotuloPeriodoMovimentos(state.funcoesPeriodo)), `${fe.chave}-estatisticas.png`);
  },
  'funcao-caveira01-abrir': async (id, target, action, e) => {
    state.funcoesCaveira01Aberto = !state.funcoesCaveira01Aberto;
    return render();
  },
  // Grava na planilha e fecha a lista. A resposta ja traz os ajustes.
  'funcao-caveira01-escolher': async (id, target, action, e) => {
    if (state.funcoesSalvando) return;
    state.funcoesSalvando = true;
    state.funcoesMsg = null;
    render();
    try {
      const r = await api('funcaoConfigSalvar', { chave: 'caveira01', valor: target.dataset.id || '' });
      if (state.funcoesDados) state.funcoesDados.config = r.config || {};
      state.funcoesCaveira01Aberto = false;
    } catch (err) {
      state.funcoesMsg = { ok: false, texto: err.message };
    }
    state.funcoesSalvando = false;
    return render();
  },
  'funcao-copiar-caveiras': async (id, target, action, e) => {
    const patchs = textoDosPatchs();
    if (patchs !== null) return copiarTexto(textoRelatorioCaveiras(modeloCaveiras(), patchs));
  },
  // O PDF leva o mesmo texto do WhatsApp, numa folha limpa.
  'funcao-pdf-caveiras': async (id, target, action, e) => {
    const patchs = textoDosPatchs();
    if (patchs !== null) return imprimirTexto(textoRelatorioCaveiras(modeloCaveiras(), patchs));
  },
  'funcao-copiar-individuais': async (id, target, action, e) => {
    const r = estatisticasFuncao(eventos(), state.funcoesPeriodo);
    return copiarTexto(textoIndividuaisFuncao(r, state.funcaoEspecial, state.funcoesPeriodo));
  },
  'funcao-pdf-individuais': async (id, target, action, e) => { window.print(); },
  'funcao-imagem-individuais': async (id, target, action, e) => {
    const fe = funcao();
    const r = estatisticasFuncao(eventos(), state.funcoesPeriodo);
    return mostrarPreviaImagem(() => imagemIndividuaisFuncao(r, fe, rotuloPeriodoMovimentos(state.funcoesPeriodo)), `${fe.chave}-individuais.png`);
  },
};
