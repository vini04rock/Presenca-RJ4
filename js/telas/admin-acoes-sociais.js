// Acoes Sociais (area Social do organizador): o planejador de cada divisao.
// So planeja - nada daqui mexe em evento, presenca ou obrigatoriedade.
// Cada divisao tem o seu (ver lerAcoesSociais no Code.gs).
//
// Tres abas:
//   Agenda do ano - os 12 meses, cada um com a(s) acao(oes) e a situacao;
//     o contexto do mes (frio, calor, ferias, datas) e a legenda; o
//     relatorio do ano, a convocacao de cada acao e o "Criar evento" - a
//     unica ponte com o resto do app, e so quando a pessoa toca nele;
//   Banco de ideias - as acoes que a divisao pode fazer;
//   Textos - os textos prontos do Social, pra copiar pro WhatsApp.

import { api, apiPost } from '../nucleo/api.js';
import { escopoPorChave } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, dataISOdeBR, escapeHtml, formatDataBR, hojeISO, mostrarAviso } from '../nucleo/util.js';
import { carregarAcoesSociais, salvarOuAvisar } from '../dados/carregar.js';
import { membrosElegiveisEvento } from '../dominio/estatisticas.js';
import { paramsDeEvento } from '../fila/presenca.js';
import { botaoGerarRelatorio } from '../ui/comuns.js';
import { ANO_DO_RASCUNHO, RASCUNHO_AGENDA, RASCUNHO_IDEIAS, RASCUNHO_TEXTOS } from '../dominio/acoes-sociais-rascunho.js';
import { CONTEXTO_DOS_MESES, EMOJIS_SUGERIDOS, ehEscolhida, LEGENDA_CONTEXTO, MESES_NOMES, ROTINA_SOCIAL, SITUACOES_ACAO, acoesDoMes, anoInicialDaAgenda, aplicarIdeiaSalva, horarioNormalizado, mesesDaIdeia, mesesDoAno, ordenarAgenda, quandoEOnde, resumoDoAno, rotuloMesCurto, situacaoPorChave, textoAgendaDoAno, textoConvocacaoAcaoSocial } from '../dominio/acoes-sociais.js';

function dados() { return state.acoesSociaisDados || { ideias: [], agenda: [], textos: [] }; }
function nomeDaDivisao() { return escopoPorChave(state.adminEscopo).nome; }
function anoDaAgenda() { return state.acoesSociaisAno || anoInicialDaAgenda(dados().agenda, hojeISO()); }

export function renderAdminAcoesSociais() {
  if (state.acoesSociaisErro) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui buscar as ações sociais</div>
        <div class="alert-msg">${escapeHtml(state.acoesSociaisErro)}.</div>
        <button class="btn secondary block" data-action="acoes-sociais-recarregar" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (state.acoesSociaisCarregando || state.acoesSociaisDadosEscopo !== state.adminEscopo) {
    return '<div class="loading">Carregando as ações sociais…</div>';
  }
  if (state.adminTab === 'acoes-sociais-ideias') return renderBancoDeIdeias();
  if (state.adminTab === 'acoes-sociais-textos') return renderTextos();
  return renderAgenda();
}

// ---------------------------------------------------------------------------
// AGENDA DO ANO

function renderAgenda() {
  const ano = anoDaAgenda();
  const { agenda } = dados();
  const r = resumoDoAno(agenda, ano);
  const placar = SITUACOES_ACAO.map(s => `<span class="acao-placar-item">${s.emoji} ${r.porSituacao[s.chave]} ${s.rotulo.toLowerCase()}${r.porSituacao[s.chave] === 1 ? '' : 's'}</span>`).join('');
  return `
    ${cardRascunho()}
    <div class="card no-print acao-rotina">
      <div class="painel-titulo">📌 Rotina do Social</div>
      ${ROTINA_SOCIAL.map(l => `<div class="acao-rotina-linha">${escapeHtml(l)}</div>`).join('')}
    </div>
    <div class="card">
      <div class="acao-ano no-print">
        <button class="btn secondary" data-action="acao-social-ano" data-value="${ano - 1}" aria-label="Ano anterior">‹</button>
        <div class="acao-ano-titulo">${ano}</div>
        <button class="btn secondary" data-action="acao-social-ano" data-value="${ano + 1}" aria-label="Próximo ano">›</button>
      </div>
      <div class="print-only" style="margin-bottom:8px;">
        <b>Ações Sociais ${ano}</b> · ${escapeHtml(nomeDaDivisao())} · gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}
      </div>
      <div class="acao-resumo"><b>${r.mesesComAcao}</b> de 12 meses com a ação escolhida</div>
      <div class="acao-placar">${placar}</div>
      ${botaoGerarRelatorio('acoes-sociais-ano', [
        { acao: 'acao-social-texto-ano', rotulo: '📋 WhatsApp' },
        { acao: 'acao-social-pdf-ano', rotulo: '📄 PDF' },
      ])}
      <button class="btn ghost block no-print" style="margin-top:6px; font-size:12.5px;" data-action="acao-social-legenda">
        ${state.acoesSociaisLegenda ? '▴ Esconder a legenda' : 'ℹ️ O que significam as etiquetas dos meses'}
      </button>
      ${state.acoesSociaisLegenda ? renderLegenda() : ''}
    </div>
    ${avisoErro()}
    ${mesesDoAno(ano).map((mes, i) => renderMes(mes, i)).join('')}
  `;
}

// O rascunho do Social da Barra (dominio/acoes-sociais-rascunho.js): so na
// Barra, e so com o planejador vazio - o Code.gs recusa de novo se nao estiver.
function podeCarregarRascunho() {
  const d = dados();
  return state.adminEscopo === 'barra' && !d.ideias.length && !d.agenda.length && !d.textos.length;
}

function cardRascunho() {
  if (!podeCarregarRascunho()) return '';
  const confirmando = state.acaoSocialRascunhoConfirmar;
  return `
    <div class="card acao-rascunho no-print">
      <div class="painel-titulo">📥 Começar com o rascunho do Social</div>
      <div class="acao-ideia-desc">O planejamento do Social da Barra: a agenda de ${ANO_DO_RASCUNHO} (uma ação por mês, todas como 💡 Ideia), ${RASCUNHO_IDEIAS.length} ideias no banco e ${RASCUNHO_TEXTOS.length} textos prontos. Depois é só ir ajustando.</div>
      ${confirmando ? `
        <div class="alert" style="margin-top:10px;">
          <div class="alert-title">Carregar o rascunho na Barra?</div>
          <div class="alert-msg">Entram ${RASCUNHO_AGENDA.length} meses na agenda de ${ANO_DO_RASCUNHO}, ${RASCUNHO_IDEIAS.length} ideias e os textos ${RASCUNHO_TEXTOS.map(t => '"' + escapeHtml(t.titulo) + '"').join(', ')}. Só funciona uma vez, com o planejador vazio.</div>
          <div class="row-gap" style="margin-top:10px;">
            <button class="btn" data-action="acao-social-rascunho-sim" ${state.acoesSociaisSalvando ? 'disabled' : ''}>${state.acoesSociaisSalvando ? 'Carregando…' : 'Carregar'}</button>
            <button class="btn secondary" data-action="acao-social-rascunho">Cancelar</button>
          </div>
        </div>
      ` : `<button class="btn block" style="margin-top:12px;" data-action="acao-social-rascunho">📥 Carregar o rascunho</button>`}
    </div>
  `;
}

function etiqueta(chave) {
  const c = LEGENDA_CONTEXTO[chave];
  return c ? `<span class="acao-etiqueta">${c.emoji} ${escapeHtml(c.rotulo)}</span>` : '';
}

function renderLegenda() {
  return `
    <div class="acao-legenda">
      ${Object.keys(LEGENDA_CONTEXTO).map(k => {
        const c = LEGENDA_CONTEXTO[k];
        return `
          <div class="acao-legenda-item">
            ${etiqueta(k)}
            <span class="acao-legenda-porque">${c.porque ? c.porque.map(escapeHtml).join(' · ') : 'Data comemorativa'}</span>
          </div>`;
      }).join('')}
    </div>
  `;
}

function renderMes(mes, i) {
  const aberto = state.acaoSocialMesAberto === mes;
  const doMes = acoesDoMes(dados().agenda, mes);
  const f = state.acaoSocialAgendaForm;
  const formAqui = f && f.mes === mes;
  // As escolhidas em cima; as opcoes (ainda "Ideia") embaixo, cada uma com
  // o "Escolher" ao lado - continuam ali pra trocar quando quiser.
  const escolhidas = doMes.filter(ehEscolhida);
  const opcoes = doMes.filter(a => !ehEscolhida(a));
  const linha = (a) => formAqui && f.id === a.id ? formAgenda(f) : linhaAgenda(a, aberto);
  return `
    <div class="card acao-mes ${aberto ? 'aberto' : ''}">
      <div class="acao-mes-cabeca" data-action="acao-social-abrir-mes" data-value="${mes}">
        <div class="acao-mes-nome">${MESES_NOMES[i].toUpperCase()}</div>
        <div class="acao-mes-etiquetas">${CONTEXTO_DOS_MESES[i].map(etiqueta).join('')}</div>
        <span class="acao-mes-sinal no-print">${aberto ? '−' : '+'}</span>
      </div>
      ${escolhidas.map(linha).join('')}
      ${!escolhidas.length && !(formAqui && !f.id && !opcoes.length) ? '<div class="acao-vazia">— a definir —</div>' : ''}
      ${opcoes.length ? `<div class="acao-opcoes-titulo">💡 ${escolhidas.length ? 'Outras opções' : 'Opções'} · toque em <b>Escolher</b> na que vai ser feita</div>${opcoes.map(linha).join('')}` : ''}
      ${formAqui && !f.id ? formAgenda(f) : ''}
      ${aberto && !formAqui ? `<button class="btn secondary block no-print" style="margin-top:10px;" data-action="acao-social-nova-agenda" data-value="${mes}">${doMes.length ? '+ Adicionar outra ideia neste mês' : '+ Adicionar ideia para este mês'}</button>` : ''}
    </div>
  `;
}

function linhaAgenda(a, aberto) {
  const s = situacaoPorChave(a.situacao);
  const onde = quandoEOnde(a);
  const escolhida = ehEscolhida(a);
  return `
    <div class="acao-linha ${escolhida ? 'acao-escolhida' : 'acao-opcao'}">
      <div class="acao-linha-topo" data-action="acao-social-editar-agenda" data-id="${escapeHtml(a.id)}">
        <div class="acao-ideia-emoji">${escapeHtml(a.emoji || '🤝')}</div>
        <div class="acao-ideia-corpo">
          <div class="member-name">${escapeHtml(a.acao)}</div>
          ${onde ? `<div class="acao-ideia-desc">${escapeHtml(onde)}</div>` : ''}
          ${a.observacao ? `<div class="acao-ideia-extra">📝 ${escapeHtml(a.observacao)}</div>` : ''}
        </div>
        ${escolhida
          ? `<span class="acao-situacao acao-situacao-${s.chave}">${s.emoji} ${s.rotulo}</span>`
          : `<button class="btn secondary acao-btn-escolher no-print" data-action="acao-social-escolher" data-id="${escapeHtml(a.id)}" ${state.acoesSociaisSalvando ? 'disabled' : ''}>Escolher</button>`}
      </div>
      ${aberto && escolhida ? `
        <div class="row-gap no-print" style="margin-top:8px;">
          <button class="btn secondary" style="flex:1;" data-action="acao-social-convocacao" data-id="${escapeHtml(a.id)}">📣 Convocação</button>
          ${a.eventoId
            ? `<span class="acao-virou-evento">🏍️ Já virou evento (Eventos → Ativos)</span>`
            : `<button class="btn secondary" style="flex:1;" data-action="acao-social-criar-evento" data-id="${escapeHtml(a.id)}">🏍️ Criar evento</button>`}
        </div>
        <button class="btn ghost block no-print" style="margin-top:4px; font-size:12px;" data-action="acao-social-desmarcar" data-id="${escapeHtml(a.id)}" ${state.acoesSociaisSalvando ? 'disabled' : ''}>Desmarcar (volta a ser opção)</button>
        ${state.acaoSocialCriarEventoId === a.id ? confirmarCriarEvento(a) : ''}
      ` : ''}
    </div>
  `;
}

function confirmarCriarEvento(a) {
  if (!a.data) {
    return `<div class="alert" style="margin-top:10px;"><div class="alert-msg">Coloque a <b>data</b> da ação antes de criar o evento (toque nela para editar).</div></div>`;
  }
  const n = membrosElegiveisEvento().length;
  return `
    <div class="alert" style="margin-top:10px;">
      <div class="alert-title">Criar o evento "Ação Social - ${escapeHtml(a.acao)}"?</div>
      <div class="alert-msg">Em ${escapeHtml(formatDataBR(a.data))}${a.horario ? ' às ' + escapeHtml(a.horario) : ''}, com os ${n} integrantes ativos da divisão convocados. Ele aparece em Eventos → Ativos, com confirmação de presença, e conta para a obrigatoriedade do mês. Os convocados e a chamada se ajustam lá, no Editar.</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn" data-action="acao-social-criar-evento-sim" data-id="${escapeHtml(a.id)}" ${state.acoesSociaisSalvando ? 'disabled' : ''}>Criar evento</button>
        <button class="btn secondary" data-action="acao-social-criar-evento-nao">Cancelar</button>
      </div>
    </div>
  `;
}

function formAgenda(f) {
  const { ideias } = dados();
  const outra = f.ideiaId === '' && f.escrevendo;
  return `
    <div class="acao-agenda-form no-print">
      <div class="painel-titulo" style="margin-top:6px;">${f.id ? '✏️ Editar ação' : '➕ Ação do mês'}</div>
      <div class="field">
        <label>Qual ação</label>
        <div class="acao-escolha">
          ${ideias.map(i => `<button class="acao-escolha-opcao ${f.ideiaId === i.id ? 'ativo' : ''}" data-action="acao-social-escolher-ideia" data-id="${escapeHtml(i.id)}">${escapeHtml(i.emoji || '🤝')} ${escapeHtml(i.nome)}</button>`).join('')}
          <button class="acao-escolha-opcao ${outra ? 'ativo' : ''}" data-action="acao-social-escolher-ideia" data-id="">✏️ Outra (escrever)</button>
        </div>
        ${!ideias.length ? '<div class="acao-ideia-extra">O banco de ideias está vazio — escreva a ação, ou cadastre ideias na aba Banco de ideias.</div>' : ''}
      </div>
      ${outra || (!ideias.length) ? `
        <div class="row-gap">
          <div class="field" style="flex:0 0 64px;"><label>Emoji</label><input type="text" class="acao-emoji-campo" maxlength="8" data-acao-social-agenda="emoji" value="${escapeHtml(f.emoji || '')}"></div>
          <div class="field" style="flex:1;"><label>Nome da ação</label><input type="text" maxlength="80" data-acao-social-agenda="acao" value="${escapeHtml(f.acao || '')}" placeholder="Ex.: Bingo no asilo"></div>
        </div>
      ` : ''}
      <div class="row-gap">
        <div class="field" style="flex:1;">
          <label>Data</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="acao-social-data" value="${escapeHtml(f.dataTexto || '')}" placeholder="dd/mm/aaaa" autocomplete="off">
        </div>
        <div class="field" style="flex:0 0 96px;">
          <label>Horário</label>
          <input type="text" inputmode="numeric" maxlength="5" data-acao-social-agenda="horario" value="${escapeHtml(f.horario || '')}" placeholder="09:00">
        </div>
      </div>
      <div class="field"><label>Local</label><input type="text" maxlength="200" data-acao-social-agenda="local" value="${escapeHtml(f.local || '')}" placeholder="Ex.: Sede da Barra"></div>
      <div class="field"><label>Observação</label><textarea rows="2" maxlength="500" data-acao-social-agenda="observacao" placeholder="Parceiros, o que falta resolver…">${escapeHtml(f.observacao || '')}</textarea></div>
      <div class="field">
        <label>Situação</label>
        <div class="acao-escolha">
          ${SITUACOES_ACAO.map(s => `<button class="acao-escolha-opcao ${f.situacao === s.chave ? 'ativo' : ''}" data-action="acao-social-situacao" data-value="${s.chave}">${s.emoji} ${s.rotulo}</button>`).join('')}
        </div>
      </div>
      <div class="row-gap">
        <button class="btn" style="flex:1;" data-action="acao-social-salvar-agenda" ${state.acoesSociaisSalvando ? 'disabled' : ''}>${state.acoesSociaisSalvando ? 'Salvando…' : 'Salvar'}</button>
        <button class="btn secondary" style="flex:1;" data-action="acao-social-cancelar">Cancelar</button>
      </div>
      ${f.id ? apagarAgenda(f) : ''}
    </div>
  `;
}

function apagarAgenda(f) {
  if (state.acaoSocialApagarId !== f.id) {
    return `<button class="btn ghost block" style="margin-top:8px;" data-action="acao-social-apagar-agenda" data-id="${escapeHtml(f.id)}">Tirar esta ação do mês</button>`;
  }
  return `
    <div class="alert" style="margin-top:10px;">
      <div class="alert-title">Tirar "${escapeHtml(f.acao || 'esta ação')}" de ${escapeHtml(rotuloMesCurto(f.mes))}?</div>
      <div class="alert-msg">A ideia continua no banco${f.eventoId ? ', e o evento já criado continua em Eventos' : ''}.</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn danger" data-action="acao-social-apagar-agenda-sim" data-id="${escapeHtml(f.id)}" ${state.acoesSociaisSalvando ? 'disabled' : ''}>Sim, tirar</button>
        <button class="btn secondary" data-action="acao-social-apagar-ideia-nao">Cancelar</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// TEXTOS PRONTOS

function renderTextos() {
  const { textos } = dados();
  const f = state.acaoSocialTextoForm;
  return `
    <div class="card">
      <div class="painel-titulo">📝 Textos prontos</div>
      <div class="info-line" style="padding:0; color:var(--text-muted); font-size:12.5px;">
        Os textos do Social para o grupo — arrecadação, motivacional, reflexivo. Toque em 📋 para copiar e colar no WhatsApp.
      </div>
      ${f && !f.id ? '' : `<button class="btn block" style="margin-top:12px;" data-action="acao-social-novo-texto">+ Novo texto</button>`}
    </div>
    ${avisoErro()}
    ${f && !f.id ? formTexto(f) : ''}
    ${textos.map(t => f && f.id === t.id ? formTexto(f) : cardTexto(t)).join('')}
    ${!textos.length && !f ? '<div class="empty">Nenhum texto ainda.<br>Toque em <b>+ Novo texto</b> para guardar o primeiro.</div>' : ''}
  `;
}

function cardTexto(t) {
  return `
    <div class="card">
      <div class="painel-titulo">${escapeHtml(t.titulo)}</div>
      <div class="acao-texto-previa">${escapeHtml(t.texto)}</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn" style="flex:1;" data-action="acao-social-copiar-texto" data-id="${escapeHtml(t.id)}">📋 Copiar</button>
        <button class="btn secondary" style="flex:1;" data-action="acao-social-editar-texto" data-id="${escapeHtml(t.id)}">✏️ Editar</button>
      </div>
    </div>
  `;
}

function formTexto(f) {
  const apagar = !f.id ? '' : state.acaoSocialApagarId !== f.id
    ? `<button class="btn ghost block" style="margin-top:8px;" data-action="acao-social-apagar-texto" data-id="${escapeHtml(f.id)}">Apagar texto</button>`
    : `
      <div class="alert" style="margin-top:10px;">
        <div class="alert-title">Apagar "${escapeHtml(f.titulo)}"?</div>
        <div class="row-gap" style="margin-top:10px;">
          <button class="btn danger" data-action="acao-social-apagar-texto-sim" data-id="${escapeHtml(f.id)}" ${state.acoesSociaisSalvando ? 'disabled' : ''}>Sim, apagar</button>
          <button class="btn secondary" data-action="acao-social-apagar-ideia-nao">Cancelar</button>
        </div>
      </div>`;
  return `
    <div class="card acao-ideia-form">
      <div class="painel-titulo">${f.id ? '✏️ Editar texto' : '📝 Novo texto'}</div>
      <div class="field"><label>Título</label><input type="text" maxlength="60" data-acao-social-texto="titulo" value="${escapeHtml(f.titulo || '')}" placeholder="Ex.: Arrecadação Pub"></div>
      <div class="field"><label>Texto (com a assinatura)</label><textarea rows="9" maxlength="4000" data-acao-social-texto="texto">${escapeHtml(f.texto || '')}</textarea></div>
      <div class="row-gap">
        <button class="btn" style="flex:1;" data-action="acao-social-salvar-texto" ${state.acoesSociaisSalvando ? 'disabled' : ''}>${state.acoesSociaisSalvando ? 'Salvando…' : 'Salvar'}</button>
        <button class="btn secondary" style="flex:1;" data-action="acao-social-cancelar">Cancelar</button>
      </div>
      ${apagar}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// BANCO DE IDEIAS

function avisoErro() {
  return state.acoesSociaisMsg
    ? `<div class="alert" style="margin-bottom:12px;"><div class="alert-msg">${escapeHtml(state.acoesSociaisMsg)}</div></div>`
    : '';
}

function renderBancoDeIdeias() {
  const { ideias, agenda } = dados();
  const f = state.acaoSocialIdeiaForm;
  const lista = ideias.map(i => f && f.id === i.id ? formIdeia(f, agenda) : linhaIdeia(i, agenda)).join('');
  return `
    <div class="card">
      <div class="painel-titulo">💡 Banco de ideias</div>
      <div class="info-line" style="padding:0; color:var(--text-muted); font-size:12.5px;">
        As ações que a divisão pode fazer. Cada mês da agenda escolhe uma daqui, e dá para trocar quando quiser.
      </div>
      ${f && !f.id ? '' : `<button class="btn block" style="margin-top:12px;" data-action="acao-social-nova-ideia">+ Nova ideia</button>`}
    </div>
    ${avisoErro()}
    ${f && !f.id ? formIdeia(f, agenda) : ''}
    ${ideias.length ? `
      <div class="card" style="padding:4px 16px;">
        <div class="division-subheader" style="padding-top:12px;"><span>${ideias.length} ${ideias.length === 1 ? 'IDEIA' : 'IDEIAS'}</span></div>
        ${lista}
      </div>
    ` : (f ? '' : '<div class="empty">Nenhuma ideia ainda.<br>Toque em <b>+ Nova ideia</b> para começar.</div>')}
  `;
}

function linhaIdeia(i, agenda) {
  const meses = mesesDaIdeia(agenda, i.id);
  return `
    <div class="member-row acao-ideia" data-action="acao-social-editar-ideia" data-id="${escapeHtml(i.id)}">
      <div class="acao-ideia-emoji">${escapeHtml(i.emoji || '🤝')}</div>
      <div class="acao-ideia-corpo">
        <div class="member-name">${escapeHtml(i.nome)}</div>
        ${i.descricao ? `<div class="acao-ideia-desc">${escapeHtml(i.descricao)}</div>` : ''}
        ${i.precisa ? `<div class="acao-ideia-extra">🧰 Precisa: ${escapeHtml(i.precisa)}</div>` : ''}
        ${meses.length ? `<div class="acao-ideia-extra">📅 Na agenda: ${meses.map(rotuloMesCurto).join(', ')}</div>` : ''}
      </div>
      <span class="acao-ideia-seta">›</span>
    </div>
  `;
}

function formIdeia(f, agenda) {
  const editando = !!f.id;
  const meses = editando ? mesesDaIdeia(agenda, f.id) : [];
  const campo = (chave, rotulo, placeholder, multilinha) => `
    <div class="field">
      <label>${rotulo}</label>
      ${multilinha
        ? `<textarea rows="2" maxlength="300" data-acao-social="${chave}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(f[chave] || '')}</textarea>`
        : `<input type="text" maxlength="80" data-acao-social="${chave}" value="${escapeHtml(f[chave] || '')}" placeholder="${escapeHtml(placeholder)}">`}
    </div>`;
  return `
    <div class="card acao-ideia-form">
      <div class="painel-titulo">${editando ? '✏️ Editar ideia' : '💡 Nova ideia'}</div>
      <div class="field">
        <label>Emoji</label>
        <div class="acao-emoji-linha">
          <input type="text" class="acao-emoji-campo" maxlength="8" data-acao-social="emoji" value="${escapeHtml(f.emoji || '')}">
          <div class="acao-emoji-opcoes">
            ${EMOJIS_SUGERIDOS.map(e => `<button class="acao-emoji-opcao ${f.emoji === e ? 'ativo' : ''}" data-action="acao-social-emoji" data-value="${e}">${e}</button>`).join('')}
          </div>
        </div>
      </div>
      ${campo('nome', 'Nome da ação', 'Ex.: Doação de agasalhos')}
      ${campo('descricao', 'Descrição', 'O que é a ação, em uma ou duas frases', true)}
      ${campo('precisa', 'O que precisa', 'Ex.: ponto de coleta, irmão que saiba cortar cabelo…', true)}
      ${meses.length ? `<div class="info-line" style="padding:0 0 10px; color:var(--text-muted); font-size:12px;">📅 Na agenda em ${meses.map(rotuloMesCurto).join(', ')}. Mudar o nome ou o emoji muda lá também.</div>` : ''}
      <div class="row-gap">
        <button class="btn" style="flex:1;" data-action="acao-social-salvar-ideia" ${state.acoesSociaisSalvando ? 'disabled' : ''}>${state.acoesSociaisSalvando ? 'Salvando…' : 'Salvar'}</button>
        <button class="btn secondary" style="flex:1;" data-action="acao-social-cancelar">Cancelar</button>
      </div>
      ${editando ? apagarIdeia(f) : ''}
    </div>
  `;
}

function apagarIdeia(f) {
  if (state.acaoSocialApagarId !== f.id) {
    return `<button class="btn ghost block" style="margin-top:8px;" data-action="acao-social-apagar-ideia" data-id="${escapeHtml(f.id)}">Apagar ideia</button>`;
  }
  return `
    <div class="alert" style="margin-top:10px;">
      <div class="alert-title">Apagar "${escapeHtml(f.nome)}"?</div>
      <div class="alert-msg">Sai do banco de ideias. Os meses da agenda que já usam essa ação continuam com ela.</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="btn danger" data-action="acao-social-apagar-ideia-sim" data-id="${escapeHtml(f.id)}" ${state.acoesSociaisSalvando ? 'disabled' : ''}>Sim, apagar</button>
        <button class="btn secondary" data-action="acao-social-apagar-ideia-nao">Cancelar</button>
      </div>
    </div>
  `;
}

// O que se digita no formulario vai pro state sem redesenhar (o teclado do
// celular fecharia a cada letra). Devolve true se o campo era daqui.
// Vale pros tres formularios (ideia, acao do mes e texto) e pra data da
// acao, que e o campo de data com mascara (o app.js poe as barras).
export function atualizarCampoAcaoSocial(el) {
  const ds = el.dataset || {};
  const pares = [[ds.acaoSocial, state.acaoSocialIdeiaForm], [ds.acaoSocialAgenda, state.acaoSocialAgendaForm],
    [ds.acaoSocialTexto, state.acaoSocialTextoForm]];
  for (const [chave, f] of pares) {
    if (chave && f) { f[chave] = el.value; return true; }
  }
  if (el.id === 'acao-social-data' && state.acaoSocialAgendaForm) {
    state.acaoSocialAgendaForm.dataTexto = el.value;
    return true;
  }
  return false;
}

function fecharForm() {
  state.acaoSocialIdeiaForm = null;
  state.acaoSocialAgendaForm = null;
  state.acaoSocialTextoForm = null;
  state.acaoSocialApagarId = null;
  state.acaoSocialCriarEventoId = null;
  state.acoesSociaisMsg = null;
}

// Grava, e se a divisao mudou no meio do caminho joga a resposta fora. A
// mensagem de erro fica na tela; o acerto, no aviso flutuante.
async function gravar(acao, params, aoGravar, avisoOk) {
  if (state.acoesSociaisSalvando) return;
  const escopo = state.adminEscopo;
  state.acoesSociaisSalvando = true;
  state.acoesSociaisMsg = null;
  render();
  try {
    const r = await api(acao, { divisao: escopo, ...params });
    if (state.adminEscopo !== escopo) return;
    aoGravar(r);
    if (avisoOk) mostrarAviso(avisoOk);
  } catch (e) {
    if (state.adminEscopo !== escopo) return;
    state.acoesSociaisMsg = 'Não consegui salvar na planilha: ' + e.message + '.';
  } finally {
    state.acoesSociaisSalvando = false;
  }
  return render();
}

function acaoDaAgenda(id) { return dados().agenda.find(a => a.id === id); }

function mudarSituacao(id, situacao, avisoOk) {
  const a = acaoDaAgenda(id);
  if (!a) return;
  return gravar('acaoSocialAgendaSalvar', { ...semMarcadores(a), situacao }, () => {
    state.acoesSociaisDados = { ...dados(), agenda: dados().agenda.map(x => x.id === id ? { ...x, situacao } : x) };
    state.acaoSocialMesAberto = a.mes;
  }, avisoOk);
}
function semMarcadores(a) { const { dataTexto, escrevendo, ...resto } = a; return resto; }

// A mesma arrumacao que o Code.gs faz (linhaCurta), pra lista local bater
// com a planilha sem precisar buscar tudo de novo.
const limpo = (v, max) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);

export const acoes = {
  'acoes-sociais-recarregar': async (id, target, action, e) => carregarAcoesSociais(),

  // --- agenda ---
  'acao-social-ano': async (id, target, action, e) => {
    fecharForm();
    state.acaoSocialMesAberto = null;
    state.acoesSociaisAno = Number(target.dataset.value);
    return render();
  },
  'acao-social-legenda': async (id, target, action, e) => {
    state.acoesSociaisLegenda = !state.acoesSociaisLegenda;
    return render();
  },
  'acao-social-abrir-mes': async (id, target, action, e) => {
    const mes = target.dataset.value;
    fecharForm();
    state.acaoSocialMesAberto = state.acaoSocialMesAberto === mes ? null : mes;
    return render();
  },
  'acao-social-nova-agenda': async (id, target, action, e) => {
    const mes = target.dataset.value;
    fecharForm();
    state.acaoSocialMesAberto = mes;
    state.acaoSocialAgendaForm = { id: '', mes, ideiaId: '', emoji: '🤝', acao: '', dataTexto: '', horario: '', local: '', observacao: '', situacao: 'ideia', escrevendo: !dados().ideias.length };
    return render();
  },
  'acao-social-editar-agenda': async (id, target, action, e) => {
    const a = acaoDaAgenda(id);
    if (!a) return;
    fecharForm();
    state.acaoSocialMesAberto = a.mes;
    // A ideia pode ter sido apagada do banco depois: o mes continua com o
    // nome dela, agora como acao escrita.
    const ideiaExiste = dados().ideias.some(i => i.id === a.ideiaId);
    state.acaoSocialAgendaForm = { ...a, ideiaId: ideiaExiste ? a.ideiaId : '', dataTexto: formatDataBR(a.data), escrevendo: !ideiaExiste };
    return render();
  },
  'acao-social-escolher-ideia': async (id, target, action, e) => {
    const f = state.acaoSocialAgendaForm;
    if (!f) return;
    const ideia = dados().ideias.find(i => i.id === id);
    if (ideia) Object.assign(f, { ideiaId: ideia.id, emoji: ideia.emoji, acao: ideia.nome, escrevendo: false });
    else Object.assign(f, { ideiaId: '', escrevendo: true });
    return render();
  },
  'acao-social-situacao': async (id, target, action, e) => {
    if (!state.acaoSocialAgendaForm) return;
    state.acaoSocialAgendaForm.situacao = target.dataset.value;
    return render();
  },
  'acao-social-salvar-agenda': async (id, target, action, e) => {
    const f = state.acaoSocialAgendaForm;
    if (!f) return;
    const data = f.dataTexto ? dataISOdeBR(f.dataTexto) : '';
    const horario = f.horario ? horarioNormalizado(f.horario) : '';
    const acao = limpo(f.acao, 80);
    let erro = '';
    if (!f.ideiaId && !acao) erro = 'Escolha a ação do mês (ou escreva uma).';
    else if (f.dataTexto && !data) erro = `"${f.dataTexto}" não é uma data válida. Escreva como 10/07/2027.`;
    else if (data && data.slice(0, 7) !== f.mes) erro = `A data tem que ser em ${rotuloMesCurto(f.mes)}.`;
    else if (f.horario && !horario) erro = `"${f.horario}" não é um horário válido. Escreva como 09:00.`;
    if (erro) { state.acoesSociaisMsg = erro; return render(); }
    const salvo = semMarcadores({ ...f, data, horario, acao, emoji: limpo(f.emoji, 16), local: limpo(f.local, 200), observacao: limpo(f.observacao, 500) });
    const params = { id: salvo.id, mes: salvo.mes, ideiaId: salvo.ideiaId, acao: salvo.acao, emoji: salvo.emoji, data, horario, local: salvo.local, observacao: salvo.observacao, situacao: salvo.situacao };
    return gravar('acaoSocialAgendaSalvar', params, (r) => {
      const linha = { eventoId: '', ...salvo, id: r.id };
      state.acoesSociaisDados = { ...dados(), agenda: ordenarAgenda(dados().agenda.filter(a => a.id !== r.id).concat(linha)) };
      fecharForm();
    }, '✅ Agenda salva');
  },
  // Escolher uma opcao do mes e so mudar a situacao: de Ideia pra Planejada
  // (e desmarcar, de volta pra Ideia). As outras opcoes ficam onde estao.
  'acao-social-escolher': async (id, target, action, e) => mudarSituacao(id, 'planejada', '✔ Escolhida'),
  'acao-social-desmarcar': async (id, target, action, e) => mudarSituacao(id, 'ideia', 'Voltou a ser opção'),
  'acao-social-apagar-agenda': async (id, target, action, e) => { state.acaoSocialApagarId = id; return render(); },
  'acao-social-apagar-agenda-sim': async (id, target, action, e) => gravar('acaoSocialAgendaRemover', { id }, () => {
    state.acoesSociaisDados = { ...dados(), agenda: dados().agenda.filter(a => a.id !== id) };
    fecharForm();
  }, 'Ação tirada do mês'),

  'acao-social-texto-ano': async (id, target, action, e) => copiarTexto(textoAgendaDoAno(dados().agenda, anoDaAgenda(), nomeDaDivisao())),
  'acao-social-pdf-ano': async (id, target, action, e) => {
    // O papel leva os 12 meses, sem formulario aberto.
    fecharForm();
    state.acaoSocialMesAberto = null;
    render();
    window.print();
  },
  'acao-social-convocacao': async (id, target, action, e) => {
    const a = acaoDaAgenda(id);
    if (!a) return;
    return copiarTexto(textoConvocacaoAcaoSocial(a, dados().ideias.find(i => i.id === a.ideiaId), nomeDaDivisao()));
  },

  // "Criar evento": a unica ponte com o resto do app, e so com a confirmacao.
  'acao-social-criar-evento': async (id, target, action, e) => {
    state.acaoSocialCriarEventoId = state.acaoSocialCriarEventoId === id ? null : id;
    return render();
  },
  'acao-social-criar-evento-nao': async (id, target, action, e) => { state.acaoSocialCriarEventoId = null; return render(); },
  'acao-social-criar-evento-sim': async (id, target, action, e) => {
    const a = acaoDaAgenda(id);
    if (!a || !a.data || state.acoesSociaisSalvando) return;
    const escopo = state.adminEscopo;
    const evento = {
      id: genId(), nome: `Ação Social - ${a.acao}`, data: a.data, horario: a.horario || '',
      endereco: a.local || '', outros: a.observacao || '', tipo: 'Ação Social', categoria: escopo, status: 'ativo',
      memberIds: membrosElegiveisEvento().map(m => m.id),
    };
    state.acoesSociaisSalvando = true;
    render();
    const ok = await salvarOuAvisar('eventoSalvar', paramsDeEvento(evento));
    state.acoesSociaisSalvando = false;
    if (!ok || state.adminEscopo !== escopo) return render();
    state.events = [...state.events, evento];
    // Guarda no mes qual evento ele virou - e o que esconde o botao.
    return gravar('acaoSocialAgendaSalvar', { ...semMarcadores(a), eventoId: evento.id }, () => {
      state.acoesSociaisDados = { ...dados(), agenda: dados().agenda.map(x => x.id === a.id ? { ...x, eventoId: evento.id } : x) };
      state.acaoSocialCriarEventoId = null;
    }, '🏍️ Evento criado · está em Eventos → Ativos');
  },

  // --- o rascunho do Social ---
  'acao-social-rascunho': async (id, target, action, e) => {
    state.acaoSocialRascunhoConfirmar = !state.acaoSocialRascunhoConfirmar;
    return render();
  },
  'acao-social-rascunho-sim': async (id, target, action, e) => {
    if (state.acoesSociaisSalvando || !podeCarregarRascunho()) return;
    const escopo = state.adminEscopo;
    state.acoesSociaisSalvando = true;
    state.acoesSociaisMsg = null;
    render();
    try {
      // POST: as 28 ideias e os textos nao cabem numa URL.
      const r = await apiPost('acoesSociaisImportar', { divisao: escopo, ideias: RASCUNHO_IDEIAS, agenda: RASCUNHO_AGENDA, textos: RASCUNHO_TEXTOS });
      if (state.adminEscopo !== escopo) return;
      state.acoesSociaisDados = { ideias: r.ideias || [], agenda: r.agenda || [], textos: r.textos || [] };
      state.acoesSociaisAno = ANO_DO_RASCUNHO;
      state.acaoSocialRascunhoConfirmar = false;
      mostrarAviso('✅ Rascunho carregado');
    } catch (e) {
      if (state.adminEscopo !== escopo) return;
      state.acoesSociaisMsg = 'Não consegui carregar o rascunho: ' + e.message + '.';
    } finally {
      state.acoesSociaisSalvando = false;
    }
    return render();
  },

  // --- textos ---
  'acao-social-novo-texto': async (id, target, action, e) => {
    fecharForm();
    state.acaoSocialTextoForm = { id: '', titulo: '', texto: '' };
    return render();
  },
  'acao-social-editar-texto': async (id, target, action, e) => {
    const t = dados().textos.find(x => x.id === id);
    if (!t) return;
    fecharForm();
    state.acaoSocialTextoForm = { ...t };
    return render();
  },
  'acao-social-copiar-texto': async (id, target, action, e) => {
    const t = dados().textos.find(x => x.id === id);
    if (t) return copiarTexto(t.texto);
  },
  'acao-social-salvar-texto': async (id, target, action, e) => {
    const f = state.acaoSocialTextoForm;
    if (!f) return;
    const titulo = limpo(f.titulo, 60);
    const texto = String(f.texto || '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
    if (!titulo || !texto) { state.acoesSociaisMsg = !titulo ? 'Escreva o título do texto.' : 'O texto está vazio.'; return render(); }
    return gravar('acaoSocialTextoSalvar', { id: f.id, titulo, texto }, (r) => {
      const t = { id: r.id, titulo, texto };
      const textos = dados().textos.some(x => x.id === r.id) ? dados().textos.map(x => x.id === r.id ? t : x) : dados().textos.concat(t);
      state.acoesSociaisDados = { ...dados(), textos };
      fecharForm();
    }, '✅ Texto salvo');
  },
  'acao-social-apagar-texto': async (id, target, action, e) => { state.acaoSocialApagarId = id; return render(); },
  'acao-social-apagar-texto-sim': async (id, target, action, e) => gravar('acaoSocialTextoRemover', { id }, () => {
    state.acoesSociaisDados = { ...dados(), textos: dados().textos.filter(t => t.id !== id) };
    fecharForm();
  }, 'Texto apagado'),

  // --- ideias ---

  'acao-social-nova-ideia': async (id, target, action, e) => {
    fecharForm();
    state.acaoSocialIdeiaForm = { id: '', emoji: '🤝', nome: '', descricao: '', precisa: '' };
    return render();
  },
  'acao-social-editar-ideia': async (id, target, action, e) => {
    const i = dados().ideias.find(x => x.id === id);
    if (!i) return;
    fecharForm();
    state.acaoSocialIdeiaForm = { ...i };
    return render();
  },
  'acao-social-cancelar': async (id, target, action, e) => { fecharForm(); return render(); },
  'acao-social-emoji': async (id, target, action, e) => {
    if (!state.acaoSocialIdeiaForm) return;
    state.acaoSocialIdeiaForm.emoji = target.dataset.value;
    return render();
  },

  'acao-social-salvar-ideia': async (id, target, action, e) => {
    const f = state.acaoSocialIdeiaForm;
    if (!f || state.acoesSociaisSalvando) return;
    const ideia = { id: f.id, emoji: limpo(f.emoji, 16), nome: limpo(f.nome, 80), descricao: limpo(f.descricao, 300), precisa: limpo(f.precisa, 300) };
    if (!ideia.nome) { state.acoesSociaisMsg = 'Escreva o nome da ação.'; return render(); }
    const escopo = state.adminEscopo;
    state.acoesSociaisSalvando = true;
    state.acoesSociaisMsg = null;
    render();
    try {
      const r = await api('acaoSocialIdeiaSalvar', { divisao: escopo, ...ideia });
      if (state.adminEscopo !== escopo) return;
      state.acoesSociaisDados = aplicarIdeiaSalva(dados(), { ...ideia, id: r.id });
      fecharForm();
      mostrarAviso('✅ Ideia salva');
    } catch (e) {
      if (state.adminEscopo !== escopo) return;
      state.acoesSociaisMsg = 'Não consegui salvar: ' + e.message + '.';
    }
    state.acoesSociaisSalvando = false;
    return render();
  },

  'acao-social-apagar-ideia': async (id, target, action, e) => { state.acaoSocialApagarId = id; return render(); },
  'acao-social-apagar-ideia-nao': async (id, target, action, e) => { state.acaoSocialApagarId = null; return render(); },
  'acao-social-apagar-ideia-sim': async (id, target, action, e) => {
    if (state.acoesSociaisSalvando) return;
    const escopo = state.adminEscopo;
    state.acoesSociaisSalvando = true;
    render();
    try {
      await api('acaoSocialIdeiaRemover', { divisao: escopo, id });
      if (state.adminEscopo !== escopo) return;
      state.acoesSociaisDados = { ...dados(), ideias: dados().ideias.filter(i => i.id !== id) };
      fecharForm();
      mostrarAviso('Ideia apagada');
    } catch (e) {
      if (state.adminEscopo !== escopo) return;
      state.acoesSociaisMsg = 'Não consegui apagar: ' + e.message + '.';
    }
    state.acoesSociaisSalvando = false;
    return render();
  },
};
