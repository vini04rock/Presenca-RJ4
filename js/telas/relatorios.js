// Painel de Relatorios: as 7 abas, os filtros e o fluxo de colar convocacao.

import { estatisticasMembrosPorPeriodo, estatisticasMembrosPorTipo, eventosDoRelatorioEscopo, resumoDonutPeriodo } from '../dominio/estatisticas.js';
import { computeCounts, statusEfetivo } from '../dominio/status.js';
import { ABAS_COM_FILTRO_DIVISAO, RELATORIO_TABS, STATUS, STATUS_TOTAIS_LABEL, TIPOS_EVENTO, TIPOS_EVENTO_TABS_ORDEM, emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { dataCorteMeses, dataDoCampoOuAvisar, escapeHtml, formatDataBR } from '../nucleo/util.js';
import { campoData, renderFichaMembro, renderListaEstatisticasPorDivisao } from '../ui/comuns.js';
import { renderDonutCard, renderRankingFaltasInfracionais } from '../ui/graficos.js';
import { loadReportData } from '../dados/carregar.js';
import { analisarConvocacao, confirmarEventoParseado, iniciarCorrecaoConvocacao } from '../fluxos/convocacao.js';
import { render } from '../nucleo/render.js';

function renderRelatorioFiltroDivisao() {
  if (state.adminEscopo !== 'regional' || !ABAS_COM_FILTRO_DIVISAO.includes(state.relatorioTab)) return '';
  const opcoes = [{ chave: 'todas', nome: 'Todas as divisões' }].concat(escoposEmOrdemDeExibicao());
  const nomeFiltroAtivo = opcoes.find(o => o.chave === state.relatorioFiltroDivisao).nome;
  return `
    <div class="card no-print" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">Filtrar por divisão</div>
      <div class="chip-grid wide">
        ${opcoes.map(o => `
          <button class="chip-option ${state.relatorioFiltroDivisao === o.chave ? 'active' : ''}" data-action="set-relatorio-filtro-divisao" data-value="${o.chave}">${escapeHtml(o.nome)}</button>
        `).join('')}
      </div>
    </div>
    <div class="print-only" style="margin-bottom:10px; font-size:13px; color:var(--text-muted);">Filtro: ${escapeHtml(nomeFiltroAtivo)}</div>
  `;
}

// Filtro de periodo (data inicial/final) - mesmas abas do filtro de
// divisao, mas visivel pra qualquer escopo (Barra ou Regional), ja que
// tirar um relatorio de um mes especifico e util pras duas situacoes. Vazio
// nos dois campos = sem filtro (comportamento de sempre).
function renderRelatorioFiltroPeriodo() {
  if (!ABAS_COM_FILTRO_DIVISAO.includes(state.relatorioTab)) return '';
  const ativo = state.relatorioFiltroDataInicio || state.relatorioFiltroDataFim;
  const textoAtivo = ativo
    ? `${state.relatorioFiltroDataInicio ? formatDataBR(state.relatorioFiltroDataInicio) : 'início'} até ${state.relatorioFiltroDataFim ? formatDataBR(state.relatorioFiltroDataFim) : 'hoje'}`
    : 'Desde sempre';
  return `
    <div class="card no-print" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">Filtrar por período</div>
      <div class="row-gap">
        ${campoData({ id: 'relatorio-filtro-data-inicio', rotulo: 'Data inicial', valor: state.relatorioFiltroDataInicio, estilo: 'margin-bottom:0; flex:1;' })}
        ${campoData({ id: 'relatorio-filtro-data-fim', rotulo: 'Data final', valor: state.relatorioFiltroDataFim, estilo: 'margin-bottom:0; flex:1;' })}
      </div>
      <button class="btn secondary block" data-action="aplicar-relatorio-filtro-periodo" style="margin-top:10px;">Atualizar</button>
      ${ativo ? `<div class="btn ghost" data-action="limpar-relatorio-filtro-periodo" style="margin-top:8px; padding:2px 0; font-size:12px;">Limpar (voltar a mostrar tudo)</div>` : ''}
    </div>
    <div class="print-only" style="margin-bottom:10px; font-size:13px; color:var(--text-muted);">Período: ${escapeHtml(textoAtivo)}</div>
  `;
}

// Entra nos Relatorios com tudo zerado, na divisao que o organizador ja
// escolheu (state.adminEscopo) e com o PIN que ele ja digitou. Antes isto
// era um fluxo proprio - card na tela inicial, escolhe divisao, PIN - e os
// dois blocos de reset viviam separados nas acoes "go-relatorio-divisoes"
// e "check-relatorio-pin".
export async function entrarNosRelatorios() {
  // Padrao: a categoria alvo comeca igual a divisao em que se entrou
  // (Regional -> "Regional", Barra -> "Barra") - so muda se a pessoa clicar
  // num botao de divisao especifica na tela de colar, ver
  // "set-relatorio-categoria".
  state.relatorioCategoriaAlvo = state.adminEscopo;
  state.relatorioTextoBruto = '';
  state.relatorioParsed = null;
  state.relatorioSalvarErro = null;
  state.relatorioDuplicidadeAviso = null;
  state.relatorioDuplicidadeConfirmada = false;
  state.relatorioEditandoEventoId = null;
  state.relatorioTipoEscolhido = null;
  state.relatorioEstatisticasExpandidas = new Set();
  state.relatorioMembroFichaId = null;
  // A pagina principal depois do PIN e o "Resumo Relatorio" (os 5 donuts) -
  // as outras 6 abas ficam a um clique de distancia.
  state.relatorioTab = 'resumo';
  state.relatorioColarStep = 'texto';
  state.relatorioTipoDetalhe = null;
  state.relatorioFiltroDivisao = 'todas';
  state.relatorioFiltroDataInicio = '';
  state.relatorioFiltroDataFim = '';
  state.view = 'relatorio';
  render();
  await loadReportData();
}

export function renderRelatorioShell(app) {
  // Ficha do membro fica "por cima" de qualquer aba - abre com o nome de
  // onde a pessoa veio (Resumo ou uma aba fixa de tipo) e o "Voltar" fecha
  // ela, devolvendo pra mesma aba/filtro, sem trocar state.relatorioTab.
  if (state.relatorioMembroFichaId) {
    app.innerHTML = `
      <div class="back-link on-photo no-print" data-action="fechar-ficha-membro">‹ Voltar ao relatório</div>
      ${renderFichaMembro(state.relatorioMembroFichaId)}
    `;
    return;
  }

  const conteudo = state.relatorioTab === 'resumo' ? conteudoRelatorioPresenca()
    : state.relatorioTab === 'enviar' ? conteudoRelatorioColar()
    : TIPOS_EVENTO_TABS_ORDEM.includes(state.relatorioTab) ? conteudoRelatorioTipoFixo(state.relatorioTab)
    : conteudoRelatorioColar();

  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="go-menu-organizador">‹ Menu</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Relatórios</h1>
      <div class="sub">${escapeHtml(escopoPorChave(state.adminEscopo).nome)}</div>
    </div>
    <div class="tabs tabs-wrap no-print">
      ${RELATORIO_TABS.map(t => `<div class="tab ${state.relatorioTab === t.chave ? 'active' : ''}" data-action="relatorio-tab" data-tab="${t.chave}">${t.label}</div>`).join('')}
    </div>
    ${renderRelatorioFiltroDivisao()}
    ${renderRelatorioFiltroPeriodo()}
    ${conteudo}
  `;
}

function conteudoRelatorioColar() {
  if (state.relatorioColarStep === 'revisao') return conteudoRelatorioRevisao();
  if (state.relatorioColarStep === 'resultado') return conteudoRelatorioResultado();
  // So faz sentido escolher a divisao do relatorio quando o acesso foi pelo
  // PIN Regional - ele e chave-mestra, entao da pra colar tanto a
  // convocacao regional inteira (varias divisoes juntas) quanto a
  // convocacao de uma divisao especifica sem precisar do PIN dela. Fora do
  // Regional so existe uma opcao (a propria divisao), entao nao mostra nada.
  const seletorDivisao = state.adminEscopo === 'regional' && !state.relatorioEditandoEventoId ? `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">Essa convocação é de qual divisão?</div>
      <div class="chip-grid wide">
        ${escoposEmOrdemDeExibicao().map(e => `
          <button class="chip-option ${state.relatorioCategoriaAlvo === e.chave ? 'active' : ''}" data-action="set-relatorio-categoria" data-value="${e.chave}">${escapeHtml(e.nome)}</button>
        `).join('')}
      </div>
    </div>
  ` : '';
  const eventoEmCorrecao = state.relatorioEditandoEventoId ? state.events.find(e => e.id === state.relatorioEditandoEventoId) : null;
  const bannerCorrecao = eventoEmCorrecao ? `
    <div class="alert info" style="margin-bottom:14px;">
      <div class="alert-title">✏️ Corrigindo: ${escapeHtml(eventoEmCorrecao.nome)}</div>
      <div class="alert-msg">Cole a convocação corrigida abaixo. Ela substitui a lista de presença desse evento - não cria outro.</div>
      <div class="btn ghost" style="margin-top:8px; padding:2px 0;" data-action="cancelar-correcao-convocacao">Cancelar correção</div>
    </div>
  ` : '';
  return `
    ${bannerCorrecao}
    ${seletorDivisao}
    <div class="card" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">Tipo de evento</div>
      <div class="chip-grid wide">
        ${TIPOS_EVENTO.map(t => `
          <button class="chip-option ${state.relatorioTipoEscolhido === t ? 'active' : ''}" data-action="set-relatorio-tipo" data-value="${escapeHtml(t)}">${emojiTipoEvento(t)} ${escapeHtml(t.toUpperCase())}</button>
        `).join('')}
      </div>
    </div>
    <div class="card">
      <div class="field">
        <label>Cole aqui a convocação inteira (a mesma que vai pro WhatsApp)</label>
        <textarea id="relatorio-texto-field" rows="14" placeholder="Cole o texto da convocação, com a lista de membros e os status de cada um…">${escapeHtml(state.relatorioTextoBruto)}</textarea>
      </div>
      <button class="btn block" data-action="analisar-convocacao">Analisar</button>
    </div>
  `;
}

function conteudoRelatorioRevisao() {
  const parsed = state.relatorioParsed;
  if (!parsed) { state.relatorioColarStep = 'texto'; return conteudoRelatorioColar(); }
  const ev = parsed.evento;
  const membros = parsed.membrosParsed;
  const naoResolvidos = membros.filter(r => !r.membroId && !r.ignorado);
  const totais = {};
  membros.forEach(r => { if (!r.ignorado) totais[r.status] = (totais[r.status] || 0) + 1; });
  const categoriaAlvo = state.relatorioCategoriaAlvo || state.adminEscopo;
  const escopoNome = escopoPorChave(categoriaAlvo).nome;
  const candidatosDropdown = categoriaAlvo === 'regional'
    ? state.roster
    : state.roster.filter(m => m.divisao === escopoNome);

  return `
    <div class="btn ghost" style="margin-bottom:10px;" data-action="go-relatorio-texto">‹ Colar de novo</div>
    <div style="font-weight:600; font-size:15px; margin-bottom:2px;">Revisar antes de salvar</div>
    <div style="color:var(--text-muted); font-size:12.5px; margin-bottom:10px;">Divisão: ${escapeHtml(escopoNome)}</div>

    ${parsed.avisos.length ? `
      <div class="alert info" style="margin-bottom:14px;">
        ${parsed.avisos.map(a => `<div class="alert-msg">⚠️ ${escapeHtml(a)}</div>`).join('')}
      </div>
    ` : ''}

    <div class="card">
      <div class="field">
        <label>Nome do evento</label>
        <input type="text" id="rev-evento-nome" value="${escapeHtml(ev.nome)}">
      </div>
      <div id="rev-secao-tipo">
        <label>Tipo de evento</label>
        <div class="chip-grid wide" style="margin-bottom: 14px;">
          ${TIPOS_EVENTO.map(t => `
            <button class="chip-option ${ev.tipo === t ? 'active' : ''}" data-action="set-revisao-tipo" data-value="${escapeHtml(t)}">${emojiTipoEvento(t)} ${escapeHtml(t)}</button>
          `).join('')}
        </div>
        ${!ev.tipo ? '<div style="color:#C9A29C; font-size:12.5px; margin:-8px 0 14px;">Obrigatório — escolha o tipo antes de confirmar.</div>' : ''}
      </div>
      <div class="row-gap" style="margin-bottom: 0;">
        <div class="field" style="flex: 1; min-width: 130px;">
          <label>Data</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="rev-evento-data" placeholder="dd/mm/aaaa" autocomplete="off" value="${escapeHtml(formatDataBR(ev.data) || '')}">
        </div>
        <div class="field" style="flex: 1; min-width: 100px;">
          <label>Horário</label>
          <input type="time" id="rev-evento-horario" value="${escapeHtml(ev.horario)}">
        </div>
      </div>
      ${!ev.data ? '<div style="color:#C9A29C; font-size:12.5px; margin:-8px 0 14px;">Sem data no texto colado — preencha antes de confirmar.</div>' : ''}
      <div class="field">
        <label>Endereço</label>
        <input type="text" id="rev-evento-endereco" value="${escapeHtml(ev.endereco)}">
      </div>
      <div class="field">
        <label>Outros (opcional)</label>
        <textarea id="rev-evento-outros" rows="2">${escapeHtml(ev.outros)}</textarea>
      </div>
    </div>

    <div class="card" id="rev-membros-lista" style="margin-top:14px;">
      <div style="font-weight:600; margin-bottom:4px;">Membros lidos da lista (${membros.length})</div>
      <div style="font-size:12.5px; margin-bottom:10px; color:${parsed.autoResolvidos === membros.length ? 'var(--status-confirmado)' : 'var(--text-muted)'};">
        ${parsed.autoResolvidos === membros.length ? '✅' : '⚠️'} ${parsed.autoResolvidos} de ${membros.length} nomes reconhecidos automaticamente${parsed.autoResolvidos < membros.length ? ' — confira os demais abaixo' : ''}
      </div>
      <div class="revisao-list">
        ${membros.map((r, i) => renderLinhaRevisao(r, i, candidatosDropdown)).join('')}
      </div>
    </div>

    ${naoResolvidos.length ? `
      <div class="alert" style="margin-top:14px;">
        <div class="alert-title">${naoResolvidos.length} nome(s) sem correspondência</div>
        <div class="alert-msg">Escolha o membro certo (ou "Ignorar") na lista acima antes de confirmar.</div>
      </div>
    ` : ''}

    <div class="card" style="margin-top:14px;">
      <div style="font-weight:600; margin-bottom:6px;">Resumo</div>
      ${Object.keys(STATUS_TOTAIS_LABEL).map(k => `<div class="info-line">${totais[k] || 0} ${STATUS_TOTAIS_LABEL[k]}</div>`).join('')}
    </div>

    ${state.relatorioSalvarErro ? `
      <div class="alert" style="margin-top:14px;">
        <div class="alert-title">Não consegui salvar</div>
        <div class="alert-msg">${escapeHtml(state.relatorioSalvarErro)}</div>
      </div>
    ` : ''}

    ${state.relatorioDuplicidadeAviso && state.relatorioDuplicidadeAviso.length ? `
      <div class="alert" style="margin-top:14px;">
        <div class="alert-title">${state.relatorioDuplicidadeAviso.length === 1 ? 'Já existe um evento nessa data' : 'Já existem eventos nessa data'}</div>
        <div class="alert-msg">
          Em ${formatDataBR(ev.data)}, nessa divisão: ${state.relatorioDuplicidadeAviso.map(d => escapeHtml(d.nome)).join(', ')}. Confira se não é o mesmo evento antes de criar outro.
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn ghost" style="flex:1;" data-action="cancelar-duplicidade-relatorio">Cancelar</button>
          <button class="btn block" style="flex:1;" data-action="confirmar-duplicidade-relatorio" ${state.relatorioSalvando ? 'disabled' : ''}>${state.relatorioSalvando ? 'Salvando…' : 'Criar mesmo assim'}</button>
        </div>
      </div>
    ` : `
      <button class="btn block" style="margin-top:14px;" data-action="confirmar-evento-parseado" ${state.relatorioSalvando ? 'disabled' : ''}>
        ${state.relatorioSalvando ? 'Salvando…' : 'Confirmar e criar evento'}
      </button>
    `}
  `;
}

function renderLinhaRevisao(r, i, candidatos) {
  const s = STATUS[r.status];
  return `
    <div class="revisao-row${r.ignorado ? ' ignorado' : ''}">
      <div class="revisao-row-top">
        <div class="revisao-nome">${escapeHtml(r.nomeTexto)} <span style="color:var(--text-muted);">(${escapeHtml(r.grauTexto)})</span></div>
        <div class="revisao-status">${s.emoji} ${s.label}</div>
      </div>
      <div class="revisao-row-bottom">
        ${r.ignorado ? '<span style="color:var(--text-muted); font-size:13px;">Ignorado</span>' : `
          <select data-action="resolver-membro" data-index="${i}">
            <option value="">— selecionar —</option>
            ${candidatos.map(m => `<option value="${m.id}" ${r.membroId === m.id ? 'selected' : ''}>${escapeHtml(m.nome)}${m.grau ? ' (' + escapeHtml(m.grau) + ')' : ''}</option>`).join('')}
          </select>
        `}
        <span class="btn ghost" style="padding:2px 8px; font-size:12px;" data-action="${r.ignorado ? 'reincluir-membro-parseado' : 'ignorar-membro-parseado'}" data-index="${i}">
          ${r.ignorado ? 'Reincluir' : 'Ignorar'}
        </span>
      </div>
      ${!r.ignorado && !r.membroId && r.sugestoes.length ? `
        <div class="revisao-sugestoes">
          ${r.sugestoes.map(m => `<span class="chip-option" data-action="aceitar-sugestao" data-index="${i}" data-id="${m.id}">Quis dizer ${escapeHtml(m.nome)}?</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function conteudoRelatorioResultado() {
  const ev = state.events.find(e => e.id === state.relatorioSalvoEventoId);
  if (!ev) {
    return `
      <div class="card"><div class="empty">Não encontrei o evento recém-criado na lista — confira na aba Eventos.</div></div>
      <button class="btn block" data-action="go-home">Ir para a tela inicial</button>
    `;
  }
  const statusPorMembro = {};
  (state.relatorioParsed ? state.relatorioParsed.membrosParsed : []).forEach(r => {
    if (r.membroId) statusPorMembro[r.membroId] = r.status;
  });
  const groups = { confirmado: [], familia: [], trabalho: [], aguardando: [], justificada: [], infracional: [] };
  ev.memberIds.forEach(mid => {
    const m = state.roster.find(r => r.id === mid);
    if (!m) return;
    const st = statusEfetivo(ev, statusPorMembro[mid] || 'aguardando');
    (groups[st] || groups.aguardando).push(m.nome);
  });
  const total = ev.memberIds.length;
  const pct = total ? Math.round((groups.confirmado.length / total) * 100) : 0;

  return `
    <div style="font-weight:600; font-size:15px; margin-bottom:10px;">✅ Evento ${state.relatorioEditandoEventoId ? 'corrigido' : 'criado'}: ${escapeHtml(ev.nome)}</div>
    <div class="card">
      <div class="info-line"><b>${pct}% de presença</b> (${groups.confirmado.length} de ${total})</div>
      <div class="info-line">✅ Confirmados: ${groups.confirmado.length}</div>
      ${ev.status !== 'encerrado' ? `<div class="info-line">⚠️ Aguardando: ${groups.aguardando.length}</div>` : ''}
      <div class="info-line">❌ Faltas justificadas: ${groups.familia.length + groups.trabalho.length + groups.justificada.length}</div>
      <div class="info-line">⭕ Faltas infracionais (inclui quem não respondeu): ${groups.infracional.length}</div>
      ${groups.infracional.length ? `<div class="info-line" style="white-space:pre-wrap; color:var(--text-muted);">${groups.infracional.map(n => '- ' + n).join('\n')}</div>` : ''}
    </div>
    <div class="row-gap" style="margin-top:14px;">
      <button class="btn" data-action="open-event" data-id="${ev.id}">Ver evento</button>
      <button class="btn secondary" data-action="nova-convocacao">Colar outra convocação</button>
    </div>
  `;
}

// Drill-down de um card (chave = 'total' ou um tipo): grafico de barras +
// tabela dos eventos que entraram na janela escolhida naquele card.
function conteudoRelatorioTipoDetalhe(encerrados, chave) {
  const meses = state.relatorioPeriodoPorGrafico[chave] || 3;
  const r = resumoDonutPeriodo(encerrados, chave, meses);
  const titulo = chave === 'total' ? 'Presença total' : chave;
  const emoji = chave === 'total' ? '🏁' : emojiTipoEvento(chave);
  return `
    <div class="card" style="margin-bottom:14px;">
      <div class="btn ghost" style="margin-bottom:10px;" data-action="fechar-relatorio-tipo-detalhe">‹ Voltar ao painel</div>
      <div style="font-weight:600; margin-bottom:8px;">${emoji} ${escapeHtml(titulo)}</div>
      ${!r.itens.length ? '<div class="empty">Nenhum evento encerrado nesse período.</div>' : `
        ${r.itens.map(({ ev, pct }) => `
          <div class="chart-row">
            <div class="chart-row-label" title="${escapeHtml(ev.nome)}">${escapeHtml(ev.nome)}</div>
            <div class="chart-row-track"><div class="chart-row-fill" style="width:${pct || 0}%"></div></div>
            <div class="chart-row-value">${pct === null ? '…' : pct + '%'}</div>
          </div>
        `).join('')}
        <div style="overflow-x:auto; margin-top:10px;">
          <table class="relatorio-tabela">
            <thead><tr><th>Evento</th><th>Data</th><th style="text-align:right;">Confirmados</th><th style="text-align:right;">%</th></tr></thead>
            <tbody>
              ${r.itens.map(({ ev, pct, confirmado, total }) => `
                <tr>
                  <td>${escapeHtml(ev.nome)}</td>
                  <td>${ev.data ? formatDataBR(ev.data) : '—'}</td>
                  <td class="num">${confirmado === null ? '…' : confirmado + '/' + total}</td>
                  <td class="num">${pct === null ? '…' : pct + '%'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// Uma das 4 abas fixas "Relatorio Pub/Bate e Volta/Reuniao/Acao Social":
// so a tabela de % por evento daquele tipo (sem grafico, sem chips de
// periodo - todo o historico) + a % de cada integrante so naquele tipo.
function conteudoRelatorioTipoFixo(tipo) {
  const eventosTipo = eventosDoRelatorioEscopo()
    .filter(e => e.status === 'encerrado' && e.tipo === tipo)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const faltaCarregar = eventosTipo.some(e => !(e.id in state.reportData));

  const linhas = eventosTipo.map(ev => {
    const c = state.reportData[ev.id] ? computeCounts(ev) : null;
    const total = ev.memberIds.length;
    return { ev, confirmado: c ? c.confirmado : null, total, pct: c && total ? Math.round((c.confirmado / total) * 100) : null };
  });

  const membros = estatisticasMembrosPorTipo(tipo);

  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:8px;">${emojiTipoEvento(tipo)} Relatório ${escapeHtml(tipo)}</div>
      ${!eventosTipo.length ? `<div class="empty">Nenhum evento encerrado do tipo "${escapeHtml(tipo)}" ainda.</div>` : faltaCarregar ? '<div class="empty">Carregando…</div>' : `
        <div style="overflow-x:auto;">
          <table class="relatorio-tabela">
            <thead><tr><th>Evento</th><th>Data</th><th style="text-align:right;">Confirmados</th><th style="text-align:right;">%</th></tr></thead>
            <tbody>
              ${linhas.map(({ ev, confirmado, total, pct }) => `
                <tr>
                  <td>${escapeHtml(ev.nome)}</td>
                  <td>${ev.data ? formatDataBR(ev.data) : '—'}</td>
                  <td class="num">${confirmado === null ? '…' : confirmado + '/' + total}</td>
                  <td class="num">${pct === null ? '…' : pct + '%'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div class="card">
      <div style="font-weight:600; margin-bottom:6px;">% de cada integrante em ${escapeHtml(tipo)}</div>
      ${faltaCarregar ? '<div class="empty">Carregando…</div>' : !membros.length ? '<div class="empty">Nenhum membro cadastrado ainda.</div>' : renderListaEstatisticasPorDivisao(membros)}
    </div>
  `;
}

// Pagina principal da tela "Relatorios" depois do PIN: painel com 5 donuts
// (Presenca total, em destaque no topo, + um por TIPOS_EVENTO alinhados
// embaixo), cada um com seu proprio periodo (1/3/6/12 meses) e contagem de
// eventos. Clicar em "Ver eventos" de um card abre o grafico+tabela so
// daquele grupo (conteudoRelatorioTipoDetalhe).
function conteudoRelatorioPresenca() {
  const encerrados = eventosDoRelatorioEscopo().filter(e => e.status === 'encerrado');

  // % de cada integrante no mesmo periodo do card "Presença total" (em vez
  // de sempre "desde sempre") - antes essa lista vinha de uma acao propria
  // no Code.gs (lerEstatisticasMembros) que ignorava o periodo escolhido
  // nos donuts acima; agora usa o mesmo state.reportData ja carregado pra
  // aba inteira, sem round-trip novo ao servidor.
  const mesesLista = state.relatorioPeriodoPorGrafico.total || 3;
  const corteLista = dataCorteMeses(mesesLista);
  const faltaCarregarLista = encerrados.some(e => e.data && e.data >= corteLista && !(e.id in state.reportData));
  const listaMembros = faltaCarregarLista ? null : estatisticasMembrosPorPeriodo(mesesLista);

  const corpoPrincipal = state.relatorioTipoDetalhe
    ? conteudoRelatorioTipoDetalhe(encerrados, state.relatorioTipoDetalhe)
    : `
      ${renderDonutCard('Presença total', 'total', encerrados, true)}
      <div class="donut-grid">
        ${TIPOS_EVENTO.map(tipo => renderDonutCard(tipo, tipo, encerrados, false)).join('')}
      </div>
      ${renderRankingFaltasInfracionais(encerrados)}
    `;

  return `
    <div class="print-only" style="margin-bottom:10px; font-size:12px; color:var(--text-muted);">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
    <button class="btn secondary block no-print" style="margin-bottom:14px;" data-action="imprimir-relatorio">🖨️ Imprimir / Exportar PDF</button>

    ${corpoPrincipal}

    <div class="card" style="margin-top:14px;">
      <div style="font-weight:600; margin-bottom:6px;">% de cada integrante <span style="color:var(--text-muted); font-weight:400; font-size:12px;">(últimos ${mesesLista === 1 ? 'mês' : mesesLista + ' meses'})</span></div>
      ${!listaMembros ? '<div class="empty">Carregando…</div>' : !listaMembros.length ? '<div class="empty">Nenhum membro cadastrado ainda.</div>' : renderListaEstatisticasPorDivisao(listaMembros)}
    </div>
  `;
}

// Acoes do painel de Relatorios (abas, filtros e colar convocacao).
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'retry-report': async (id, target, action, e) => {
    return loadReportData();
  },
  'fechar-ficha-membro': async (id, target, action, e) => {
    state.relatorioMembroFichaId = null; return render();
  },
  'set-relatorio-filtro-divisao': async (id, target, action, e) => {
    state.relatorioFiltroDivisao = target.dataset.value;
    state.relatorioTipoDetalhe = null;
    return render();
  },
  // As datas so sao lidas aqui, no toque do botao - ver o comentario no
  // app.js sobre por que nao da pra acompanhar a digitacao.
  'aplicar-relatorio-filtro-periodo': async (id, target, action, e) => {
    const inicio = dataDoCampoOuAvisar('relatorio-filtro-data-inicio', 'A data inicial');
    if (inicio === null) return;
    const fim = dataDoCampoOuAvisar('relatorio-filtro-data-fim', 'A data final');
    if (fim === null) return;
    state.relatorioFiltroDataInicio = inicio;
    state.relatorioFiltroDataFim = fim;
    return render();
  },
  'limpar-relatorio-filtro-periodo': async (id, target, action, e) => {
    state.relatorioFiltroDataInicio = '';
    state.relatorioFiltroDataFim = '';
    return render();
  },
  'fechar-relatorio-tipo-detalhe': async (id, target, action, e) => {
    state.relatorioTipoDetalhe = null;
    return render();
  },
  'retry-relatorio-eventos': async (id, target, action, e) => {
    return loadReportData();
  },
  'imprimir-relatorio': async (id, target, action, e) => {
    window.print(); return;
  },
  'set-relatorio-categoria': async (id, target, action, e) => {
    state.relatorioCategoriaAlvo = target.dataset.value;
    return render();
  },
  'set-revisao-tipo': async (id, target, action, e) => {
    state.relatorioParsed.evento.tipo = state.relatorioParsed.evento.tipo === target.dataset.value ? '' : target.dataset.value;
    return render();
  },
  'set-relatorio-tipo': async (id, target, action, e) => {
    state.relatorioTipoEscolhido = state.relatorioTipoEscolhido === target.dataset.value ? null : target.dataset.value;
    return render();
  },
  'relatorio-tab': async (id, target, action, e) => {
    state.relatorioTab = target.dataset.tab;
    render();
    // Eventos, Resumo e as 4 abas de tipo dependem dos dados por evento -
    // sem isso quem for direto numa dessas abas (sem passar por outra que
    // ja carregou) fica com "Carregando…" pra sempre, ja que nada mais
    // dispara essa busca.
    const precisaReportData = ['eventos', 'resumo', ...TIPOS_EVENTO_TABS_ORDEM].includes(target.dataset.tab);
    if (precisaReportData) await loadReportData();
    return;
  },
  'go-relatorio-texto': async (id, target, action, e) => {
    state.relatorioColarStep = 'texto';
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    return render();
  },
  'analisar-convocacao': async (id, target, action, e) => {
    return analisarConvocacao();
  },
  'aceitar-sugestao': async (id, target, action, e) => {
    const row = state.relatorioParsed.membrosParsed[Number(target.dataset.index)];
    row.membroId = target.dataset.id;
    row.sugestoes = [];
    return render();
  },
  'ignorar-membro-parseado': async (id, target, action, e) => {
    state.relatorioParsed.membrosParsed[Number(target.dataset.index)].ignorado = true;
    return render();
  },
  'reincluir-membro-parseado': async (id, target, action, e) => {
    state.relatorioParsed.membrosParsed[Number(target.dataset.index)].ignorado = false;
    return render();
  },
  'confirmar-evento-parseado': async (id, target, action, e) => {
    return confirmarEventoParseado();
  },
  'cancelar-duplicidade-relatorio': async (id, target, action, e) => {
    state.relatorioDuplicidadeAviso = null; return render();
  },
  'confirmar-duplicidade-relatorio': async (id, target, action, e) => {
    state.relatorioDuplicidadeConfirmada = true;
    return confirmarEventoParseado();
  },
  'nova-convocacao': async (id, target, action, e) => {
    state.relatorioTextoBruto = '';
    state.relatorioParsed = null;
    state.relatorioSalvarErro = null;
    state.relatorioDuplicidadeAviso = null;
    state.relatorioDuplicidadeConfirmada = false;
    state.relatorioEditandoEventoId = null;
    state.relatorioColarStep = 'texto';
    return render();
  },
  'corrigir-convocacao': async (id, target, action, e) => {
    return iniciarCorrecaoConvocacao(id);
  },
  'toggle-texto-original': async (id, target, action, e) => {
    if (state.relatorioTextoOriginalExpandido.has(id)) state.relatorioTextoOriginalExpandido.delete(id);
    else state.relatorioTextoOriginalExpandido.add(id);
    return render();
  },
  'ignore-click': async (id, target, action, e) => {
    return;
  },
  'cancelar-correcao-convocacao': async (id, target, action, e) => {
    state.relatorioEditandoEventoId = null;
    state.relatorioCategoriaAlvo = null;
    state.relatorioTipoEscolhido = null;
    state.relatorioTextoBruto = '';
    return render();
  },
};
