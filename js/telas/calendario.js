// Calendario do mes e a tela Organizar (marcar/editar eventos).

import { construirGradeCalendario, eventosCalendarioVisiveis, marcacoesVisiveisCalendario, membrosElegiveisCalendario, parseTextoOrganizarCalendario } from '../dominio/estatisticas.js';
import { apiPost } from '../nucleo/api.js';
import { DIAS_SEMANA_LETRA, NOMES_MESES, TIPOS_EVENTO, corTipoEvento, emojiTipoEvento, escopoPorChave, escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { escapeHtml, hexParaRgba } from '../nucleo/util.js';
import { renderEscolhaDivisao, renderTelaPin } from '../ui/comuns.js';
import { loadInitial, salvarOuAvisar } from '../dados/carregar.js';
import { conferirPin } from '../dados/pin.js';
import { paramsDeEvento } from '../fila/presenca.js';

// Tela "Calendario" - escolhe a divisao/regional (sem PIN, igual Eventos),
// depois mostra a grade do mes daquele escopo. Por enquanto so mostra os
// dias - o que cada dia vai destacar (eventos, etc.) fica pra depois.
export function renderCalendarioDivisoes(app) {
  renderEscolhaDivisao(app, {
    titulo: 'Calendário',
    escopos: escoposEmOrdemDeExibicao(),
    acao: 'select-calendario-escopo',
  });
}

export function renderCalendario(app) {
  if (state.calendarioOrganizarEtapa === 'pin') return renderCalendarioOrganizarPin(app);
  if (state.calendarioOrganizarEtapa === 'texto') return renderCalendarioOrganizarTexto(app);

  const hoje = new Date();
  if (state.calendarioAno === null) state.calendarioAno = hoje.getFullYear();
  if (state.calendarioMes === null) state.calendarioMes = hoje.getMonth();

  const escopo = escopoPorChave(state.calendarioEscopo);
  const celulas = construirGradeCalendario(state.calendarioAno, state.calendarioMes);
  const ehHoje = (dia) => dia === hoje.getDate() && state.calendarioMes === hoje.getMonth() && state.calendarioAno === hoje.getFullYear();
  const marcacoesEscopo = marcacoesVisiveisCalendario(state.calendarioEscopo);

  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-calendario-divisoes">‹ Trocar divisão</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Calendário</h1>
      <div class="sub">${escapeHtml(escopo.nome)}</div>
    </div>
    ${state.calendarioMarcarAviso ? `
      <div class="alert" style="margin-bottom:14px;">
        <div class="alert-msg" style="white-space:pre-wrap;">${escapeHtml(state.calendarioMarcarAviso)}</div>
      </div>
    ` : ''}
    <div class="card calendario-card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="calendario-mes-anterior">‹</button>
        <div class="calendario-titulo">${NOMES_MESES[state.calendarioMes]} de ${state.calendarioAno}</div>
        <button class="btn ghost" data-action="calendario-mes-seguinte">›</button>
      </div>
      <div class="calendario-grade">
        ${DIAS_SEMANA_LETRA.map(l => `<div class="calendario-dia-semana">${l}</div>`).join('')}
        ${celulas.map(dia => {
          if (dia === null) return '<div class="calendario-dia calendario-dia-vazio"></div>';
          const dataIso = `${state.calendarioAno}-${String(state.calendarioMes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const marcacao = marcacoesEscopo[dataIso];
          const tipo = marcacao && marcacao.tipo;
          const estilo = tipo ? `border-color:${corTipoEvento(tipo)}; background:${hexParaRgba(corTipoEvento(tipo), 0.18)};` : '';
          // Mostra de onde o evento veio sempre que a origem for diferente
          // de quem esta olhando - no Regional, aparece o nome da divisao
          // (ex: "Barra"); numa divisao, um evento vindo do Regional
          // aparece com "Regional" embaixo. O proprio evento da divisao,
          // visto por ela mesma, nao precisa de rotulo nenhum.
          const nomeOrigem = tipo && marcacao.origem !== state.calendarioEscopo
            ? (marcacao.origem === 'regional' ? 'Regional' : escopoPorChave(marcacao.origem).nome.split(' - ')[0])
            : '';
          return `
            <div class="calendario-dia${ehHoje(dia) ? ' calendario-dia-hoje' : ''}" style="${estilo}" title="${tipo ? escapeHtml(tipo + (nomeOrigem ? ' - ' + nomeOrigem : '')) : ''}">
              <span class="calendario-dia-numero">${dia}</span>
              ${tipo ? `<span class="calendario-dia-emoji">${emojiTipoEvento(tipo)}</span>` : ''}
              ${nomeOrigem ? `<span class="calendario-dia-origem">${escapeHtml(nomeOrigem)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
      <div class="calendario-legenda">
        ${TIPOS_EVENTO.map(t => `
          <div class="calendario-legenda-item">
            <span class="calendario-legenda-emoji">${emojiTipoEvento(t)}</span>
            <span>${escapeHtml(t)}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <button class="btn secondary block" style="margin-top:14px;" data-action="abrir-calendario-organizar">🗂️ Organizar</button>
  `;
}

function renderCalendarioOrganizarPin(app) {
  renderTelaPin(app, {
    titulo: 'Organizar',
    subtitulo: escopoPorChave(state.calendarioEscopo).nome,
    voltar: 'fechar-calendario-organizar',
    campo: 'calendario-pin-field',
    acao: 'check-calendario-pin',
    verificando: state.calendarioPinVerificando,
    erro: state.calendarioPinErro,
    aoEnter: checkCalendarioPin,
  });
}

// Cola uma lista de "DD/MM - Tipo" (um evento por linha) e marca cada data
// no calendario do ano em exibicao (state.calendarioAno) - so em memoria por
// enquanto, sem criar evento de verdade nenhum (ver marcarCalendarioDeTexto).
function renderCalendarioOrganizarTexto(app) {
  const escopo = escopoPorChave(state.calendarioEscopo);
  app.innerHTML = `
    <div class="back-link on-photo" data-action="fechar-calendario-organizar">‹ Voltar ao calendário</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Organizar</h1>
      <div class="sub">${escapeHtml(escopo.nome)}</div>
    </div>
    <div class="tabs" style="margin-bottom:14px;">
      <div class="tab ${state.calendarioOrganizarSubTab === 'adicionar' ? 'active' : ''}" data-action="calendario-organizar-subtab" data-tab="adicionar">Adicionar</div>
      <div class="tab ${state.calendarioOrganizarSubTab === 'editar' ? 'active' : ''}" data-action="calendario-organizar-subtab" data-tab="editar">Editar / Remover</div>
    </div>
    ${state.calendarioOrganizarSubTab === 'editar' ? conteudoCalendarioOrganizarEditar() : conteudoCalendarioOrganizarAdicionar()}
  `;
}

function conteudoCalendarioOrganizarAdicionar() {
  const erro = state.calendarioOrganizarTextoErro;
  return `
    <div class="card">
      <div style="font-weight:600; margin-bottom:8px;">Adicionar evento</div>
      <div class="alert info" style="margin-bottom:12px;">
        <div class="alert-msg">Cole uma linha por evento, com a data e o tipo. Aceita com ou sem separador entre os dois. Exemplos:<br>01/09 - Pub<br>05/09 Ação Social<br>15/09Bate e Volta</div>
      </div>
      ${erro ? `
        <div class="alert" style="margin-bottom:12px;">
          <div class="alert-title">Não reconheci ${erro.length === 1 ? 'esta linha' : 'estas linhas'}</div>
          <div class="alert-msg">Corrija abaixo e tente marcar de novo - nenhum evento foi marcado ainda.<br>${erro.map(l => '- ' + escapeHtml(l)).join('<br>')}</div>
        </div>
      ` : ''}
      ${state.calendarioOrganizarErroSalvar ? `
        <div class="alert" style="margin-bottom:12px;">
          <div class="alert-title">Não consegui salvar</div>
          <div class="alert-msg">${escapeHtml(state.calendarioOrganizarErroSalvar)}.<br>Nenhum evento foi criado - o texto continua aqui embaixo, tente de novo.</div>
        </div>
      ` : ''}
      <textarea id="calendario-organizar-texto" rows="8" placeholder="01/09 - Pub&#10;15/09 - Bate e Volta&#10;20/09 - Ação Social&#10;30/09 - Reunião">${escapeHtml(state.calendarioOrganizarTextoValor)}</textarea>
      <button class="btn block" style="margin-top:10px;" data-action="marcar-calendario-texto" ${state.calendarioSalvando ? 'disabled' : ''}>${state.calendarioSalvando ? 'Salvando…' : 'Marcar no calendário'}</button>
    </div>
  `;
}

// Calendario replicado, so com os eventos que a propria divisao/regional
// criou (categoria === o proprio escopo, sem o merge de
// eventosCalendarioVisiveis/marcacoesVisiveisCalendario) - so da pra
// editar/excluir o que essa mesma divisao criou, igual so da pra ver isso
// na tela normal do calendario; um evento do Regional nao pode ser editado
// a partir de uma divisao, e vice-versa.
function conteudoCalendarioOrganizarEditar() {
  const hoje = new Date();
  if (state.calendarioAno === null) state.calendarioAno = hoje.getFullYear();
  if (state.calendarioMes === null) state.calendarioMes = hoje.getMonth();

  const celulas = construirGradeCalendario(state.calendarioAno, state.calendarioMes);
  // O Regional enxerga e edita/exclui QUALQUER evento (o proprio + o de
  // qualquer divisao) - o PIN Regional ja e chave-mestra no resto do app
  // (verificarPin), entao faz sentido valer aqui tambem. Uma divisao so
  // edita/exclui o que ela propria criou (categoria === o proprio escopo) -
  // nunca um evento do Regional nem de outra divisao.
  const marcacoesProprias = {};
  (state.calendarioEscopo === 'regional'
    ? eventosCalendarioVisiveis('regional')
    : eventosCalendarioVisiveis(state.calendarioEscopo).filter(ev => ev.categoria === state.calendarioEscopo)
  ).forEach(ev => { marcacoesProprias[ev.data] = ev; });
  const ehHoje = (dia) => dia === hoje.getDate() && state.calendarioMes === hoje.getMonth() && state.calendarioAno === hoje.getFullYear();
  const dataSelecionada = state.calendarioEditandoData;
  const eventoSelecionado = dataSelecionada ? marcacoesProprias[dataSelecionada] : null;

  return `
    <div class="card calendario-card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="calendario-mes-anterior">‹</button>
        <div class="calendario-titulo">${NOMES_MESES[state.calendarioMes]} de ${state.calendarioAno}</div>
        <button class="btn ghost" data-action="calendario-mes-seguinte">›</button>
      </div>
      <div class="calendario-grade">
        ${DIAS_SEMANA_LETRA.map(l => `<div class="calendario-dia-semana">${l}</div>`).join('')}
        ${celulas.map(dia => {
          if (dia === null) return '<div class="calendario-dia calendario-dia-vazio"></div>';
          const dataIso = `${state.calendarioAno}-${String(state.calendarioMes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const evento = marcacoesProprias[dataIso];
          const tipo = evento && evento.tipo;
          const estilo = tipo ? `border-color:${corTipoEvento(tipo)}; background:${hexParaRgba(corTipoEvento(tipo), 0.18)};` : '';
          const classes = ['calendario-dia'];
          if (ehHoje(dia)) classes.push('calendario-dia-hoje');
          if (tipo) classes.push('calendario-dia-clicavel');
          if (dataIso === dataSelecionada) classes.push('calendario-dia-selecionado');
          // So aparece no Regional (unico escopo que edita evento de outra
          // origem) - pra saber de qual divisao e o evento antes de tocar.
          const nomeOrigem = tipo && evento.categoria !== state.calendarioEscopo
            ? (evento.categoria === 'regional' ? 'Regional' : escopoPorChave(evento.categoria).nome.split(' - ')[0])
            : '';
          return `
            <div class="${classes.join(' ')}" style="${estilo}" ${tipo ? `data-action="calendario-editar-selecionar-dia" data-value="${dataIso}"` : ''} title="${tipo ? escapeHtml(tipo + (nomeOrigem ? ' - ' + nomeOrigem : '')) : ''}">
              <span class="calendario-dia-numero">${dia}</span>
              ${tipo ? `<span class="calendario-dia-emoji">${emojiTipoEvento(tipo)}</span>` : ''}
              ${nomeOrigem ? `<span class="calendario-dia-origem">${escapeHtml(nomeOrigem)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ${eventoSelecionado ? renderCalendarioEditorPainel(eventoSelecionado) : `
      <div class="empty" style="margin-top:10px;">Toque num dia marcado pra ajustar a data ou remover.</div>
    `}
  `;
}

function renderCalendarioEditorPainel(evento) {
  const [ano, mes, dia] = evento.data.split('-');
  const tipo = evento.tipo;
  // So o Regional edita evento de outra origem - mostra de qual divisao e,
  // pra nao confundir "excluir o evento errado" com um evento parecido da
  // propria divisao.
  const origemTexto = evento.categoria !== state.calendarioEscopo
    ? ` (${evento.categoria === 'regional' ? 'Regional' : escopoPorChave(evento.categoria).nome.split(' - ')[0]})`
    : '';
  const titulo = `${emojiTipoEvento(tipo)} ${escapeHtml(tipo)} - ${dia}/${mes}/${ano}${escapeHtml(origemTexto)}`;
  if (state.calendarioAjustandoData) {
    return `
      <div class="card" style="margin-top:12px;">
        <div style="font-weight:600; margin-bottom:8px;">${titulo}</div>
        <label>Nova data</label>
        <input type="date" id="calendario-editar-data-field" value="${evento.data}">
        <div class="row-gap" style="margin-top:10px;">
          <button class="btn block" data-action="calendario-editar-confirmar-data" data-id="${evento.id}">Confirmar</button>
          <button class="btn secondary" data-action="calendario-editar-cancelar-ajuste">Cancelar</button>
        </div>
      </div>
    `;
  }
  if (state.calendarioConfirmandoExclusao) {
    return `
      <div class="alert" style="margin-top:12px;">
        <div class="alert-title">Excluir ${escapeHtml(tipo)} de ${dia}/${mes}/${ano}${escapeHtml(origemTexto)}?</div>
        <div class="alert-msg">Apaga o evento e as confirmações de todos os membros. Não dá para desfazer.</div>
        <div class="row-gap" style="margin-top:10px;">
          <button class="btn danger" data-action="calendario-editar-excluir" data-id="${evento.id}">Sim, excluir</button>
          <button class="btn secondary" data-action="calendario-editar-cancelar-exclusao">Cancelar</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="card" style="margin-top:12px;">
      <div style="font-weight:600; margin-bottom:8px;">${titulo}</div>
      <div class="row-gap">
        <button class="btn secondary" data-action="calendario-editar-abrir-ajuste">📅 Ajustar data</button>
        <button class="btn danger" data-action="calendario-editar-pedir-exclusao">🗑️ Excluir</button>
      </div>
    </div>
  `;
}

export async function checkCalendarioPin() {
  return conferirPin({
    campo: 'calendario-pin-field',
    escopo: state.calendarioEscopo,
    chaveVerificando: 'calendarioPinVerificando',
    chaveErro: 'calendarioPinErro',
    aoEntrar: () => { state.calendarioOrganizarEtapa = 'texto'; },
  });
}

// Acoes do Calendario e da tela Organizar.
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'go-calendario-divisoes': async (id, target, action, e) => {
    state.view = 'calendario-divisoes';
    state.calendarioEscopo = null;
    state.calendarioOrganizarEtapa = null;
    state.calendarioPinErro = null;
    state.calendarioMarcarAviso = null;
    return render();
  },
  'select-calendario-escopo': async (id, target, action, e) => {
    state.calendarioEscopo = target.dataset.value;
    state.view = 'calendario';
    return render();
  },
  'calendario-mes-anterior': async (id, target, action, e) => {
    state.calendarioMes--;
    if (state.calendarioMes < 0) { state.calendarioMes = 11; state.calendarioAno--; }
    return render();
  },
  'calendario-mes-seguinte': async (id, target, action, e) => {
    state.calendarioMes++;
    if (state.calendarioMes > 11) { state.calendarioMes = 0; state.calendarioAno++; }
    return render();
  },
  'abrir-calendario-organizar': async (id, target, action, e) => {
    state.calendarioOrganizarEtapa = 'pin';
    state.calendarioPinErro = null;
    state.calendarioOrganizarTextoValor = '';
    state.calendarioOrganizarTextoErro = null;
    state.calendarioOrganizarErroSalvar = null;
    state.calendarioOrganizarSubTab = 'adicionar';
    state.calendarioEditandoData = null;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  },
  'fechar-calendario-organizar': async (id, target, action, e) => {
    state.calendarioOrganizarEtapa = null;
    state.calendarioOrganizarTextoValor = '';
    state.calendarioOrganizarTextoErro = null;
    state.calendarioOrganizarErroSalvar = null;
    state.calendarioEditandoData = null;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  },
  'check-calendario-pin': async (id, target, action, e) => {
    return checkCalendarioPin();
  },
  'marcar-calendario-texto': async (id, target, action, e) => {
    if (state.calendarioSalvando) return;
    const texto = document.getElementById('calendario-organizar-texto').value;
    if (!texto.trim()) return;
    const { marcacoes, naoReconhecidas } = parseTextoOrganizarCalendario(texto, state.calendarioAno);
    // Tudo ou nada: uma linha so que nao seja reconhecida ja trava a marcacao
    // inteira - sem isso, um typo numa linha fazia o resto entrar quieto e a
    // linha ruim sumir sem ninguem perceber que faltou marcar aquele dia.
    if (naoReconhecidas.length) {
      state.calendarioOrganizarTextoValor = texto;
      state.calendarioOrganizarTextoErro = naoReconhecidas;
      return render();
    }
    // Nao duplica se a mesma data ja tiver um evento criado por esse mesmo
    // escopo (ex: colar o mesmo texto duas vezes sem querer).
    const existentes = new Set(
      eventosCalendarioVisiveis(state.calendarioEscopo)
        .filter(ev => ev.categoria === state.calendarioEscopo)
        .map(ev => ev.data)
    );
    const novos = Object.entries(marcacoes).filter(([data]) => !existentes.has(data));
    const duplicados = Object.keys(marcacoes).length - novos.length;
    if (!novos.length) {
      state.calendarioMarcarAviso = `⚠️ ${duplicados === 1 ? 'Essa data já tinha' : 'Essas datas já tinham'} evento marcado - nada novo foi criado.`;
      state.calendarioOrganizarEtapa = null;
      state.calendarioOrganizarTextoValor = '';
      state.calendarioOrganizarTextoErro = null;
      return render();
    }

    state.calendarioSalvando = true;
    state.calendarioOrganizarErroSalvar = null;
    render();
    try {
      const membroIds = membrosElegiveisCalendario(state.calendarioEscopo).map(m => m.id);
      await apiPost('criarEventosDeCalendario', {
        categoria: state.calendarioEscopo,
        membroIds,
        eventos: novos.map(([data, tipo]) => ({ data, tipo }))
      });
      await loadInitial();
      state.calendarioMarcarAviso = `✅ ${novos.length} ${novos.length === 1 ? 'evento criado' : 'eventos criados'} no calendário.` +
        (duplicados ? ` (${duplicados} ${duplicados === 1 ? 'já existia e foi mantido' : 'já existiam e foram mantidos'} sem duplicar)` : '');
      state.calendarioOrganizarEtapa = null;
      state.calendarioOrganizarTextoValor = '';
      state.calendarioOrganizarTextoErro = null;
    } catch (e) {
      // Mantem o texto colado (senao a pessoa perde tudo e tem que colar de
      // novo) e mostra o erro na propria tela do Adicionar, nao so no aviso
      // do calendario - que so aparece depois de sair desta tela, e sem
      // sucesso a gente nunca sai dela.
      state.calendarioOrganizarTextoValor = texto;
      state.calendarioOrganizarErroSalvar = e.message;
    }
    state.calendarioSalvando = false;
    return render();
  },
  'calendario-organizar-subtab': async (id, target, action, e) => {
    state.calendarioOrganizarSubTab = target.dataset.tab;
    state.calendarioEditandoData = null;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  },
  'calendario-editar-selecionar-dia': async (id, target, action, e) => {
    state.calendarioEditandoData = state.calendarioEditandoData === target.dataset.value ? null : target.dataset.value;
    state.calendarioAjustandoData = false;
    state.calendarioConfirmandoExclusao = false;
    return render();
  },
  'calendario-editar-abrir-ajuste': async (id, target, action, e) => {
    state.calendarioAjustandoData = true;
    return render();
  },
  'calendario-editar-cancelar-ajuste': async (id, target, action, e) => {
    state.calendarioAjustandoData = false;
    return render();
  },
  'calendario-editar-pedir-exclusao': async (id, target, action, e) => {
    state.calendarioConfirmandoExclusao = true;
    return render();
  },
  'calendario-editar-cancelar-exclusao': async (id, target, action, e) => {
    state.calendarioConfirmandoExclusao = false;
    return render();
  },
  'calendario-editar-excluir': async (id, target, action, e) => {
    state.events = state.events.filter(ev => ev.id !== id);
    state.calendarioEditandoData = null;
    state.calendarioConfirmandoExclusao = false;
    render();
    await salvarOuAvisar('eventoRemover', { id });
    return;
  },
  'calendario-editar-confirmar-data': async (id, target, action, e) => {
    const novaData = document.getElementById('calendario-editar-data-field').value;
    if (!novaData) return;
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    state.events = state.events.map(e => e.id === id ? { ...e, data: novaData } : e);
    // Pula direto pro mes/ano da nova data, pra ja mostrar o quadrado certo
    // sem precisar navegar manualmente ate lá.
    const [ano, mes] = novaData.split('-').map(Number);
    state.calendarioAno = ano;
    state.calendarioMes = mes - 1;
    state.calendarioEditandoData = novaData;
    state.calendarioAjustandoData = false;
    render();
    await salvarOuAvisar('eventoSalvar', paramsDeEvento({ ...ev, data: novaData }));
    return;
  },
};
