// Modo organizador, secao Membros: as abas "Cadastro" e "Presencas".
//
// Cadastro e quem escreve o membro; Presencas e o retrato do que ele fez.
// Mesma gente vista dos dois lados, entao moram no mesmo arquivo.

import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { FUNCOES, GRAUS, cargosDoGrau, escopoPorChave } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { escapeHtml } from '../nucleo/util.js';
import { selosFuncoes } from '../ui/comuns.js';
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
            <div class="presenca-barra"><div class="presenca-barra-fill" style="width:${m.percentual}%"></div></div>
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
      ` : `<button class="btn block" data-action="add-member">+ Adicionar membro</button>`}
    </div>
    ${membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado ainda.</div>' : membros.map(m => `
      <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 16px;">
        <div>
          <div style="font-weight:500; font-size:15px;">${escapeHtml(m.nome)} ${selosFuncoes(m.funcoes)}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${[m.grau, m.cargo, m.divisao].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</div>
        </div>
        <div class="row-gap" style="margin-bottom:0;">
          <button class="btn ghost" data-action="edit-member" data-id="${m.id}">Editar</button>
          <button class="btn ghost" data-action="remove-member" data-id="${m.id}">Remover</button>
        </div>
      </div>
    `).join('')}
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
    // O membro herda a divisao de onde o organizador entrou - inclusive
    // Regional, que tem os proprios membros (mesa regional).
    const member = {
      id: genId(), nome, grau: state.newMemberGrau || '', divisao: escopoPorChave(state.adminEscopo).nome,
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || ''
    };
    state.roster = [...state.roster, member];
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
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
