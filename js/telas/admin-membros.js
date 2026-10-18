// Modo organizador, secao Membros: as abas "Cadastro" e "Presencas".
//
// Cadastro e quem escreve o membro; Presencas e o retrato do que ele fez.
// Mesma gente vista dos dois lados, entao moram no mesmo arquivo.

import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { TIPOS_MOVIMENTO, estaAfastado } from '../dominio/movimentos.js';
import { confirmarMovimento, fecharPainelMovimento } from '../fluxos/movimentos.js';
import { FUNCOES, GRAUS, cargosDoGrau, escopoPorChave } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { dataISOdeBR, escapeHtml, formatDataBR, hojeISO, ordenarPorHierarquia } from '../nucleo/util.js';
import { linhaFuncoes, selinhoIniciais } from '../ui/comuns.js';
import { loadEstatisticas, salvarOuAvisar } from '../dados/carregar.js';
import { render } from '../nucleo/render.js';

export function renderAdminPresencas() {
  if (state.estatisticasError) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar</div>
        <div class="alert-msg">${escapeHtml(state.estatisticasError)}.</div>
        <button class="btn secondary block" data-action="retry-estatisticas" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (state.estatisticasLoading || !state.estatisticas) {
    return '<div class="alert info"><div class="alert-msg">Calculando presença de cada membro…</div></div>';
  }
  if (!state.estatisticas.length) {
    return '<div class="empty">Nenhum membro cadastrado ainda.</div>';
  }

  // Quem nunca teve evento encerrado (percentual null) fica no fim, sem
  // competir com quem ja tem historico de verdade.
  const lista = [...state.estatisticas].sort((a, b) => {
    if (a.percentual === null && b.percentual === null) return a.nome.localeCompare(b.nome);
    if (a.percentual === null) return 1;
    if (b.percentual === null) return -1;
    return b.percentual - a.percentual || a.nome.localeCompare(b.nome);
  });

  return `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Percentual de presença nos eventos já encerrados de ${escapeHtml(escopoPorChave(state.adminEscopo).nome)}. Quem entrou depois de um evento não é contado nele.</div>
    </div>
    ${lista.map(m => {
      if (m.percentual === null) {
        return `
          <div class="card presenca-row">
            <div class="presenca-nome">${escapeHtml(m.nome)}</div>
            <div class="presenca-sem-dados">Sem eventos encerrados ainda</div>
          </div>
        `;
      }
      return `
        <div class="card presenca-row">
          <div class="presenca-info">
            <div class="presenca-nome">${escapeHtml(m.nome)}</div>
            <div class="presenca-contagem">${m.confirmacoes} de ${m.convites} eventos</div>
          </div>
          <div class="presenca-pct-wrap">
            <div class="presenca-barra"><div class="presenca-barra-fill" style="width:${m.percentual}%" data-anima="barra:${m.percentual}"></div></div>
            <div class="presenca-pct">${m.percentual}%</div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// Os chips de cargo so existem nos graus que tem cargo (VI e V). Devolve
// string vazia nos outros - sem deixar linha em branco no meio do
// formulario, por isso a montagem aqui fora em vez de um ternario solto no
// meio do template.
function blocoCargo() {
  const lista = cargosDoGrau(state.newMemberGrau);
  if (lista.length) {
    return `<label>Cargo (grau ${escapeHtml(state.newMemberGrau)})</label>
      <div class="chip-grid wide">
        ${lista.map(c => `<button class="chip-option ${state.newMemberCargo === c ? 'active' : ''}" data-action="pick-cargo" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
      `;
  }
  // Grau sem cargo (ou nenhum grau escolhido ainda): mostra o rotulo assim
  // mesmo, explicando. Antes essa parte simplesmente sumia, e nao havia como
  // descobrir que existe cargo sem antes acertar o grau por acaso.
  return `<label>Cargo</label>
      <div class="info-line" style="color:var(--text-muted); margin-bottom:14px;">
        Só os graus <strong>VI</strong> e <strong>V</strong> têm cargo. Escolha um deles acima para marcar.
      </div>
      `;
}

export function renderAdminMembros() {
  const membros = membrosDoEscopo();
  const editando = !!state.editingMemberId;
  return `
    <div class="card">
      ${editando ? '<label style="display:block; margin-bottom:8px; color:var(--text-muted); font-size:12px;">Editando membro</label>' : ''}
      <div class="field">
        <label>Nome</label>
        <input type="text" id="new-member-nome" placeholder="Ex: Costa" value="${escapeHtml(state.newMemberNome)}">
      </div>
      <label>Grau (opcional)</label>
      <div class="chip-grid">
        ${GRAUS.map(g => `<button class="chip-option ${state.newMemberGrau === g ? 'active' : ''}" data-action="pick-grau" data-value="${g}">${g}</button>`).join('')}
      </div>
      ${blocoCargo()}<label>Função (opcional, pode marcar mais de uma)</label>
      <div class="row-gap" style="margin-bottom: 14px;">
        ${FUNCOES.map(f => `<button class="toggle-chip ${state.newMemberFuncoes.has(f.chave) ? 'active' : ''}" data-action="toggle-funcao" data-value="${f.chave}" style="flex: none; padding: 8px 12px;">${f.selo} ${escapeHtml(f.label)}</button>`).join('')}
      </div>
      ${editando ? `
        <div class="row-gap">
          <button class="btn" data-action="save-member-edit">Salvar alterações</button>
          <button class="btn secondary" data-action="cancel-member-edit">Cancelar</button>
        </div>
      ` : `
        <div class="field">
          <label>Data de entrada no clube</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="new-member-entrada"
                 value="${escapeHtml(state.newMemberEntrada || formatDataBR(hojeISO()))}" placeholder="dd/mm/aaaa" autocomplete="off">
        </div>
        <button class="btn block" data-action="add-member">+ Adicionar membro</button>
      `}
    </div>
    ${membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado ainda.</div>' : blocosPorGrau(membros)}
  `;
}

// A lista do cadastro, um card por grau, na ordem hierarquica (a mesma da
// convocacao). A divisao nao aparece na linha: e a propria tela.
function blocosPorGrau(membros) {
  const grupos = [];
  ordenarPorHierarquia(membros).forEach(m => {
    const grau = m.grau || '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grau === grau) ultimo.membros.push(m);
    else grupos.push({ grau, membros: [m] });
  });
  return grupos.map(g => `
    <div class="card lista-cadastro">
      <div class="division-subheader">
        <span>${g.grau ? `GRAU ${escapeHtml(g.grau)}` : 'SEM GRAU'}</span>
        <span class="division-counts">${g.membros.length} ${g.membros.length === 1 ? 'membro' : 'membros'}</span>
      </div>
      ${g.membros.map(linhaCadastro).join('')}
    </div>
  `).join('');
}

// Os botoes de movimentacao, logo depois do grau: Afastamento (ou Retorno,
// pra quem ja esta afastado) e Desligamento.
function botoesMovimento(m) {
  const afastado = estaAfastado(m);
  return `
    <span class="acoes-movimento">
      ${afastado
        ? `<button class="btn-mov" data-action="abrir-movimento" data-id="${m.id}" data-value="retorno">▶️ Retorno</button>`
        : `<button class="btn-mov" data-action="abrir-movimento" data-id="${m.id}" data-value="afastamento">⏸️ Afastamento</button>`}
      <button class="btn-mov perigo" data-action="abrir-movimento" data-id="${m.id}" data-value="desligamento">🚪 Desligamento</button>
    </span>
  `;
}

// O painel que abre embaixo da linha: data (hoje, se nada for escrito),
// motivo opcional e o que vai acontecer, dito antes de confirmar.
const EXPLICA_MOVIMENTO = {
  afastamento: 'Enquanto afastado, não entra em evento novo, na caixinha de mês novo nem no Insight. Sai dos eventos ainda abertos, pra não levar falta. O histórico fica como está.',
  retorno: 'Volta a entrar nos eventos novos, na caixinha e no Insight. Os eventos já abertos não recebem ele de volta sozinhos — inclua pelo Editar do evento, se for o caso.',
  desligamento: 'Sai do cadastro e dos eventos ainda abertos. As presenças dos eventos encerrados continuam valendo, então os percentuais antigos não mudam. Fica registrado no Entrada/Saída.',
};
function painelMovimento(m) {
  const t = TIPOS_MOVIMENTO[state.movTipo];
  const verbo = { afastamento: 'Afastar', retorno: 'Registrar o retorno de', desligamento: 'Desligar' }[state.movTipo];
  return `
    <div class="mov-painel mov-${state.movTipo}">
      <div class="mov-titulo">${t.emoji} ${escapeHtml(verbo)} ${escapeHtml(m.nome)}</div>
      <div class="mov-explica">${escapeHtml(EXPLICA_MOVIMENTO[state.movTipo])}</div>
      <div class="field" style="margin-bottom:10px;">
        <label>Data</label>
        <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="mov-data"
               value="${escapeHtml(state.movData || formatDataBR(hojeISO()))}" placeholder="dd/mm/aaaa" autocomplete="off">
      </div>
      <div class="field" style="margin-bottom:10px;">
        <label>Motivo (opcional — só aparece aqui no app)</label>
        <input type="text" id="mov-motivo" maxlength="300" value="${escapeHtml(state.movMotivo)}" placeholder="Ex: trabalho fora do estado" autocomplete="off">
      </div>
      ${state.movErro ? `<div class="alert" style="margin-bottom:10px;"><div class="alert-msg">${escapeHtml(state.movErro)}</div></div>` : ''}
      <div class="row-gap">
        <button class="btn ${state.movTipo === 'desligamento' ? 'danger' : ''}" style="flex:1;" data-action="confirmar-movimento" ${state.movSalvando ? 'disabled' : ''}>
          ${state.movSalvando ? 'Registrando…' : `Confirmar ${t.label.toLowerCase()}`}
        </button>
        <button class="btn secondary" style="flex:1;" data-action="cancelar-movimento" ${state.movSalvando ? 'disabled' : ''}>Cancelar</button>
      </div>
    </div>
  `;
}

function linhaCadastro(m) {
  const afastado = estaAfastado(m);
  return `
    <div class="member-row linha-cadastro${state.editingMemberId === m.id ? ' editando' : ''}${afastado ? ' afastado' : ''}">
      <div class="member-head">
        <div class="member-info-wrap">
          <div class="member-info">
            ${selinhoIniciais(m)}
            <span class="member-name">${escapeHtml(m.nome)}</span>
            ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
            ${botoesMovimento(m)}
          </div>
          ${afastado ? `<div class="selo-afastado">⏸️ Afastado${m.situacaoDesde ? ` desde ${escapeHtml(formatDataBR(m.situacaoDesde))}` : ''}</div>` : ''}
          ${m.cargo ? `<div class="confirmado-divisao">${escapeHtml(m.cargo)}</div>` : ''}
          ${linhaFuncoes(m.funcoes)}
        </div>
        <div class="acoes-cadastro">
          <button class="btn-mini" data-action="edit-member" data-id="${m.id}">✏️ Editar</button>
          <button class="btn-mini perigo" data-action="remove-member" data-id="${m.id}" title="Para cadastro feito errado: apaga também o histórico. Quem saiu do clube é Desligamento.">Remover</button>
        </div>
      </div>
      ${state.movMembroId === m.id ? painelMovimento(m) : ''}
    </div>
  `;
}

// Acoes das abas Cadastro e Presencas: o formulario do membro (grau, cargo,
// funcoes) e o retry da carga de estatisticas.
export const acoes = {
  'retry-estatisticas': async (id, target, action, e) => {
    return loadEstatisticas();
  },

  'pick-grau': async (id, target, action, e) => {
    state.newMemberGrau = state.newMemberGrau === target.dataset.value ? null : target.dataset.value;
    // Cargo pertence a um grau - trocar de grau derruba o que estava marcado,
    // senao sobraria um "Diretor" (grau VI) preso num membro grau X.
    state.newMemberCargo = null;
    return render();
  },

  'pick-cargo': async (id, target, action, e) => {
    state.newMemberCargo = state.newMemberCargo === target.dataset.value ? null : target.dataset.value;
    return render();
  },

  'toggle-funcao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.newMemberFuncoes.has(chave)) state.newMemberFuncoes.delete(chave);
    else state.newMemberFuncoes.add(chave);
    return render();
  },

  'add-member': async (id, target, action, e) => {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    // A data de entrada: vazia = hoje; escrita, tem que ser uma data de
    // verdade e nao pode ser no futuro. E ela que conta no Entrada/Saida.
    const brutoEntrada = (state.newMemberEntrada || '').trim();
    const entrada = brutoEntrada ? dataISOdeBR(brutoEntrada) : hojeISO();
    if (!entrada || entrada > hojeISO()) {
      alert(entrada ? 'A data de entrada não pode ser no futuro.' : `"${brutoEntrada}" não é uma data válida - escreva como 18/10/2026.`);
      return;
    }
    // O membro herda a divisao de onde o organizador entrou - inclusive
    // Regional, que tem os proprios membros (mesa regional).
    const member = {
      id: genId(), nome, grau: state.newMemberGrau || '', divisao: escopoPorChave(state.adminEscopo).nome,
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || '',
      situacao: '', situacaoDesde: '', entrada,
    };
    state.roster = [...state.roster, member];
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    state.newMemberEntrada = '';
    state.movimentosDados = null;
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  },

  // O painel de afastamento/retorno/desligamento, na linha do integrante.
  // Tocar de novo no mesmo botao fecha.
  'abrir-movimento': async (id, target, action, e) => {
    const tipo = target.dataset.value;
    const mesmo = state.movMembroId === id && state.movTipo === tipo;
    fecharPainelMovimento();
    if (!mesmo) {
      state.movMembroId = id;
      state.movTipo = tipo;
    }
    return render();
  },
  'cancelar-movimento': async (id, target, action, e) => {
    fecharPainelMovimento();
    return render();
  },
  'confirmar-movimento': async (id, target, action, e) => {
    return confirmarMovimento();
  },

  'edit-member': async (id, target, action, e) => {
    const m = state.roster.find(x => x.id === id);
    if (!m) return;
    state.editingMemberId = id;
    state.newMemberNome = m.nome;
    state.newMemberGrau = m.grau || null;
    state.newMemberCargo = m.cargo || null;
    state.newMemberFuncoes = new Set(m.funcoes || []);
    return render();
  },

  'cancel-member-edit': async (id, target, action, e) => {
    state.editingMemberId = null;
    state.newMemberNome = '';
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    return render();
  },

  'save-member-edit': async (id, target, action, e) => {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    const original = state.roster.find(x => x.id === state.editingMemberId);
    if (!original) return;
    // Divisao nao muda por aqui - so nome, grau e funcoes.
    const member = {
      ...original, nome, grau: state.newMemberGrau || '',
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || ''
    };
    state.roster = state.roster.map(x => x.id === member.id ? member : x);
    state.editingMemberId = null;
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  },

  'remove-member': async (id, target, action, e) => {
    state.roster = state.roster.filter(m => m.id !== id);
    render();
    await salvarOuAvisar('membroRemover', { id });
  },
};
