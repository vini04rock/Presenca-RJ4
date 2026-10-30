// A carteirinha do integrante (21/10/2026). Desde 30/10/2026 mora na aba
// "Carteirinhas" de Membros: a lista dos irmaos em ordem de grau, e tocar no
// nome abre a carteirinha dele (antes era um botao 🪪 em cada card do
// cadastro).
//
// Em cima, a mesma carteirinha do Relatorio individual - emblema (ou a
// foto), nome, grau, cargo, divisao, funcoes, tempo de clube e a % total de
// presenca. Embaixo, os dados pessoais: telefone, contato de emergencia,
// nascimento e saude.
//
// Os dados pessoais vem de uma aba a parte (fichaMembro, no Code.gs), lida
// so com o PIN da divisao do integrante - a lista de membros e publica e
// nao pode levar isso. Ate 30/10/2026 nada daqui saia do app; desde entao,
// a pedido, ha Imagem, PDF e WhatsApp no topo da carteirinha aberta.

import { api, apiPost } from '../nucleo/api.js';
import { LOGO_SRC } from '../nucleo/imagens.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, dataISOdeBR, escapeHtml, formatDataBR, hojeISO, mostrarAviso, ordenarPorHierarquia } from '../nucleo/util.js';
import { montarRelatorioIndividual } from '../dominio/relatorio-individual.js';
import { estaAfastado, textoIngresso } from '../dominio/movimentos.js';
import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { idadeEm, TIPOS_SANGUINEOS, linkWhatsApp, telefoneParaLink, textoCarteirinha } from '../dominio/carteirinha.js';
import { funcaoPorChave } from '../nucleo/config.js';
import { linhaFuncoes, nivelDoGrau, selinhoIniciais } from '../ui/comuns.js';
import { imagemCarteirinha, mostrarPreviaImagem } from '../ui/imagem.js';

function membro() { return state.roster.find(m => m.id === state.carteirinhaMembroId); }
function ficha() { return state.carteirinhaFicha || {}; }

// A aba Carteirinhas: com uma carteirinha aberta, ela toma a aba inteira;
// sem, a lista dos irmaos da divisao, um card por grau, na ordem
// hierarquica (a mesma do cadastro).
export function renderAdminCarteirinhas() {
  if (state.carteirinhaMembroId) return renderCarteirinhaMembro();
  const membros = membrosDoEscopo();
  if (!membros.length) return '<div class="empty">Nenhum membro cadastrado ainda.</div>';
  const grupos = [];
  ordenarPorHierarquia(membros).forEach(m => {
    const grau = m.grau || '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grau === grau) ultimo.membros.push(m);
    else grupos.push({ grau, membros: [m] });
  });
  return `
    <div class="info-line" style="padding:0 0 10px; color:var(--text-muted); font-size:12px; text-align:center;">Toque no nome para abrir a carteirinha.</div>
    ${grupos.map(g => `
      <div class="card lista-cadastro">
        <div class="division-subheader">
          <span>${g.grau ? `GRAU ${escapeHtml(g.grau)}` : 'SEM GRAU'}</span>
          <span class="division-counts">${g.membros.length} ${g.membros.length === 1 ? 'membro' : 'membros'}</span>
        </div>
        ${g.membros.map(linhaLista).join('')}
      </div>
    `).join('')}
  `;
}

function linhaLista(m) {
  return `
    <div class="member-row lista-carteirinha${estaAfastado(m) ? ' afastado' : ''}" data-action="abrir-carteirinha" data-id="${m.id}">
      <div class="member-info">
        ${selinhoIniciais(m)}
        <span class="member-name">${escapeHtml(m.nome)}</span>
        ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        ${m.cargo ? `<span class="member-cargo-inline">${escapeHtml(m.cargo)}</span>` : ''}
      </div>
      <span class="lista-carteirinha-seta" aria-hidden="true">🪪 ›</span>
    </div>
  `;
}

export function renderCarteirinhaMembro() {
  const m = membro();
  if (!m) return '<div class="empty">Integrante não encontrado.</div>';
  const pronta = !state.carteirinhaErro && !state.carteirinhaCarregando;
  return `
    <button class="btn ghost no-print" style="margin-bottom:10px;" data-action="fechar-carteirinha">‹ Voltar à lista</button>
    ${pronta && !state.carteirinhaForm ? `
      <div class="row-gap no-print" style="margin-bottom:12px;">
        <button class="btn secondary" style="flex:1;" data-action="imagem-carteirinha">🖼️ Imagem</button>
        <button class="btn secondary" style="flex:1;" data-action="imprimir-carteirinha">📄 PDF</button>
        <button class="btn secondary" style="flex:1;" data-action="copiar-carteirinha">${state.carteirinhaCopiado ? 'Copiado ✓' : '📋 WhatsApp'}</button>
      </div>` : ''}
    ${cartao(m, pronta)}
    ${state.carteirinhaErro ? `
      <div class="alert">
        <div class="alert-title">Não consegui buscar a carteirinha</div>
        <div class="alert-msg">${escapeHtml(state.carteirinhaErro)}.</div>
        <button class="btn secondary block" data-action="recarregar-carteirinha" style="margin-top:10px;">Tentar de novo</button>
      </div>` : state.carteirinhaCarregando
        ? '<div class="loading">Buscando os dados do irmão…</div>'
        : (state.carteirinhaForm ? formulario() : `
          <button class="btn block no-print" data-action="editar-carteirinha">✏️ Editar dados</button>
          <div class="info-line no-print" style="padding:10px 0 0; color:var(--text-muted); font-size:11.5px; text-align:center;">🔒 Só quem entra com o PIN da divisão vê estes dados. Cuidado ao exportar: telefone e saúde vão junto.</div>
        `)}
  `;
}

// A carteirinha inteira, num cartao so: em cima, igual a do Relatorio
// individual (mesmas classes), com a foto no lugar do emblema quando
// houver e a % total de presenca; embaixo, os dados do irmao, no estilo de
// documento. Editando, ela mostra o que ja estava salvo - o formulario vem
// embaixo, e salvar atualiza a carteirinha.
function cartao(m, comDados) {
  const detalhe = [m.cargo, m.divisao].filter(Boolean).map(escapeHtml).join(' · ');
  const pct = state.carteirinhaPct;
  const foto = state.carteirinhaForm ? state.carteirinhaForm.foto : ficha().foto;
  return `
    <div class="carteirinha carteirinha-${nivelDoGrau(m.grau)} carteirinha-membro">
      ${foto
        ? `<img class="carteirinha-emblema carteirinha-foto" src="${escapeHtml(foto)}" alt="Foto de ${escapeHtml(m.nome)}">`
        : `<img class="carteirinha-emblema" src="${LOGO_SRC}" alt="">`}
      <div class="carteirinha-dados">
        <div class="carteirinha-clube">Insanos MC · Regional RJ4</div>
        <div class="carteirinha-nome">${escapeHtml(m.nome)}</div>
        <div class="carteirinha-detalhe">${m.grau ? `<span class="carteirinha-grau">${escapeHtml(m.grau)}</span>` : ''}${detalhe || '—'}</div>
        ${linhaFuncoes(m.funcoes)}
        <div class="carteirinha-periodo">🗓️ ${escapeHtml(textoIngresso(m.entrada || ''))}</div>
      </div>
      ${pct === null || pct === undefined ? '' : `
        <div class="carteirinha-pct" data-anima="carteirinha-membro:${m.id}:${pct}">
          <b data-conta="${pct}" data-sufixo="%">${pct}%</b>
          <span>presença</span>
        </div>
      `}
      ${comDados ? dadosNoCartao(m) : ''}
    </div>
  `;
}

const vazio = '<span class="cart-vazio">—</span>';

// O telefone e, ao lado, os dois botoes pequenos: ligar e WhatsApp.
function telefone(numero) {
  if (!numero) return vazio;
  return `
    <span class="cart-valor">${escapeHtml(numero)}</span>
    <a class="cart-acao" href="tel:${escapeHtml(telefoneParaLink(numero))}" title="Ligar" aria-label="Ligar">📞</a>
    <a class="cart-acao" href="${escapeHtml(linkWhatsApp(numero))}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">💬</a>
  `;
}

function campoCartao(rotulo, valor, largo) {
  return `<div class="cart-campo${largo ? ' cart-campo-largo' : ''}"><div class="cart-rotulo">${rotulo}</div><div class="cart-conteudo">${valor}</div></div>`;
}

// O nome de colete e o nome do cadastro (o que o app inteiro usa); o nome
// completo e o plano de saude moram so na ficha (30/10/2026).
function dadosNoCartao(m) {
  const f = ficha();
  const idade = idadeEm(f.nascimento, hojeISO());
  const texto = v => (v ? `<span class="cart-valor">${escapeHtml(v)}</span>` : vazio);
  const emergencia = f.emergenciaNome
    ? `<span class="cart-valor">${escapeHtml(f.emergenciaNome)}${f.emergenciaParentesco ? ` <small>(${escapeHtml(f.emergenciaParentesco)})</small>` : ''}</span>`
    : vazio;
  return `
    <div class="cart-info">
      ${campoCartao('🧥 Nome de colete', texto(m.nome))}
      ${campoCartao('👤 Nome completo', texto(f.nomeCompleto))}
      ${campoCartao('📞 Telefone', telefone(f.telefone))}
      ${campoCartao('🎂 Nascimento', f.nascimento ? `<span class="cart-valor">${escapeHtml(formatDataBR(f.nascimento))}${idade !== null ? ` <small>· ${idade} anos</small>` : ''}</span>` : vazio)}
      ${campoCartao('🆘 Emergência', emergencia)}
      ${campoCartao('🆘 Tel. emergência', telefone(f.emergenciaTelefone))}
      ${campoCartao('🩸 Tipo sanguíneo', f.tipoSanguineo ? `<span class="cart-valor cart-sangue">${escapeHtml(f.tipoSanguineo)}</span>` : vazio)}
      ${campoCartao('🏥 Plano de saúde', texto(f.planoSaude))}
      ${campoCartao('⚕️ Alergias e condições', f.saude ? `<span class="cart-valor">${escapeHtml(f.saude)}</span>` : vazio, true)}
    </div>
  `;
}

function formulario() {
  const f = state.carteirinhaForm;
  const campo = (chave, rotulo, extra) => `
    <div class="field"><label>${rotulo}</label><input type="text" data-carteirinha="${chave}" value="${escapeHtml(f[chave] || '')}" ${extra || ''}></div>`;
  return `
    <div class="card acao-ideia-form">
      <div class="painel-titulo">✏️ Dados do irmão</div>
      <div class="field">
        <label>Foto</label>
        <div class="cart-foto-linha">
          ${f.foto ? `<img class="cart-foto-previa" src="${escapeHtml(f.foto)}" alt="">` : '<div class="cart-foto-previa cart-foto-vazia">sem foto</div>'}
          <div class="cart-foto-botoes">
            <label class="btn secondary cart-foto-escolher">${state.carteirinhaFotoProcessando ? 'Preparando…' : (f.foto ? '📷 Trocar foto' : '📷 Tirar ou escolher foto')}
              <input type="file" accept="image/*" data-carteirinha-foto="1" hidden>
            </label>
            ${f.foto ? '<button class="btn ghost" data-action="tirar-foto-carteirinha">Tirar a foto</button>' : ''}
          </div>
        </div>
      </div>
      <div class="field"><label>Nome de colete</label><div style="padding:4px 0; color:var(--text-muted);">${escapeHtml((membro() || {}).nome || '')} <small>(muda no Cadastro)</small></div></div>
      ${campo('nomeCompleto', 'Nome completo', 'maxlength="120" placeholder="Ex.: João Carlos da Costa" autocomplete="off"')}
      ${campo('telefone', 'Telefone / WhatsApp', 'inputmode="tel" maxlength="30" placeholder="(21) 99999-0000"')}
      <div class="painel-titulo" style="margin-top:6px; font-size:14px;">🆘 Contato de emergência</div>
      ${campo('emergenciaNome', 'Nome', 'maxlength="80" placeholder="Ex.: Maria Costa"')}
      <div class="row-gap">
        <div style="flex:1;">${campo('emergenciaParentesco', 'Parentesco', 'maxlength="40" placeholder="Esposa, mãe…"')}</div>
        <div style="flex:1;">${campo('emergenciaTelefone', 'Telefone', 'inputmode="tel" maxlength="30" placeholder="(21) 98888-0000"')}</div>
      </div>
      <div class="field">
        <label>Data de nascimento</label>
        <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="cart-nascimento" value="${escapeHtml(f.nascimentoTexto || '')}" placeholder="dd/mm/aaaa" autocomplete="off">
      </div>
      <div class="field">
        <label>Tipo sanguíneo</label>
        <div class="acao-escolha">
          ${TIPOS_SANGUINEOS.map(t => `<button class="acao-escolha-opcao ${f.tipoSanguineo === t ? 'ativo' : ''}" data-action="tipo-sanguineo-carteirinha" data-value="${t}">${t}</button>`).join('')}
          <button class="acao-escolha-opcao ${!f.tipoSanguineo ? 'ativo' : ''}" data-action="tipo-sanguineo-carteirinha" data-value="">Não sei</button>
        </div>
      </div>
      ${campo('planoSaude', 'Plano de saúde', 'maxlength="80" placeholder="Ex.: Unimed, Amil, não tem…" autocomplete="off"')}
      <div class="field"><label>Alergias e condições de saúde</label><textarea rows="2" maxlength="300" data-carteirinha="saude" placeholder="Ex.: alérgico a dipirona, diabético…">${escapeHtml(f.saude || '')}</textarea></div>
      ${state.carteirinhaMsg ? `<div class="alert" style="margin-bottom:10px;"><div class="alert-msg">${escapeHtml(state.carteirinhaMsg)}</div></div>` : ''}
      <div class="row-gap">
        <button class="btn" style="flex:1;" data-action="salvar-carteirinha" ${state.carteirinhaSalvando || state.carteirinhaFotoProcessando ? 'disabled' : ''}>${state.carteirinhaSalvando ? 'Salvando…' : 'Salvar'}</button>
        <button class="btn secondary" style="flex:1;" data-action="cancelar-carteirinha">Cancelar</button>
      </div>
    </div>
  `;
}

// A foto: reduzida no proprio celular pra um quadrado de 320 px em JPEG,
// abaixando a qualidade ate caber no limite da celula da planilha.
const LADO_FOTO = 320, FOTO_MAX = 48000;
function lerArquivo(arquivo) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(leitor.result);
    leitor.onerror = falha;
    leitor.readAsDataURL(arquivo);
  });
}
function carregar(src) {
  return new Promise((ok, falha) => { const img = new Image(); img.onload = () => ok(img); img.onerror = falha; img.src = src; });
}
async function reduzirFoto(arquivo) {
  const img = await carregar(await lerArquivo(arquivo));
  const lado = Math.min(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LADO_FOTO;
  // O quadrado do meio, um pouco puxado pra cima (onde costuma estar o rosto).
  canvas.getContext('2d').drawImage(img, (img.width - lado) / 2, Math.max(0, (img.height - lado) * 0.3), lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= FOTO_MAX) return url;
  }
  throw new Error('a foto ficou grande demais');
}

// Digitacao do formulario (sem redesenhar) e a foto escolhida. Devolve true
// se o campo era daqui.
export function atualizarCampoCarteirinha(el) {
  const f = state.carteirinhaForm;
  if (!f || !el.dataset) return false;
  if (el.dataset.carteirinha) { f[el.dataset.carteirinha] = el.value; return true; }
  if (el.id === 'cart-nascimento') { f.nascimentoTexto = el.value; return true; }
  if (el.dataset.carteirinhaFoto && el.files && el.files[0]) {
    state.carteirinhaFotoProcessando = true;
    render();
    reduzirFoto(el.files[0])
      .then(url => { if (state.carteirinhaForm) state.carteirinhaForm.foto = url; })
      .catch(e => mostrarAviso('Não consegui usar essa foto: ' + e.message))
      .finally(() => { state.carteirinhaFotoProcessando = false; render(); });
    return true;
  }
  return false;
}

// Busca a carteirinha e a presenca do integrante, juntas.
async function buscar(id) {
  state.carteirinhaCarregando = true;
  state.carteirinhaErro = null;
  render();
  try {
    const [f, rel] = await Promise.all([api('fichaMembro', { membroId: id }), api('relatorioIndividual', { membroId: id })]);
    if (state.carteirinhaMembroId !== id) return;
    state.carteirinhaFicha = f.ficha || {};
    const r = montarRelatorioIndividual(rel, '', '');
    const bloco = r.divisao || r.regional;
    state.carteirinhaPct = bloco && bloco.geral.percentual !== null ? bloco.geral.percentual : null;
  } catch (e) {
    if (state.carteirinhaMembroId !== id) return;
    state.carteirinhaErro = e.message;
  }
  state.carteirinhaCarregando = false;
  render();
}

export function fecharCarteirinha() {
  state.carteirinhaMembroId = null;
  state.carteirinhaFicha = null;
  state.carteirinhaForm = null;
  state.carteirinhaPct = null;
  state.carteirinhaErro = null;
  state.carteirinhaMsg = null;
  state.carteirinhaCopiado = false;
}

export const acoes = {
  'abrir-carteirinha': async (id, target, action, e) => {
    fecharCarteirinha();
    state.carteirinhaMembroId = id;
    window.scrollTo(0, 0);
    return buscar(id);
  },
  'recarregar-carteirinha': async (id, target, action, e) => buscar(state.carteirinhaMembroId),
  // As tres saidas (30/10/2026, a pedido - antes a carteirinha nao saia do
  // app). O PDF e a impressao da propria tela, como no Relatorio individual.
  'imprimir-carteirinha': async (id, target, action, e) => { window.print(); },
  'imagem-carteirinha': async (id, target, action, e) => {
    const m = membro();
    if (!m) return;
    const f = ficha();
    const idade = idadeEm(f.nascimento, hojeISO());
    const emergencia = f.emergenciaNome ? f.emergenciaNome + (f.emergenciaParentesco ? ` (${f.emergenciaParentesco})` : '') : '';
    const c = {
      nome: m.nome,
      linhaGrau: [m.grau ? `Grau ${m.grau}` : '', m.cargo, m.divisao].filter(Boolean).join('  ·  '),
      funcoes: (m.funcoes || []).map(funcaoPorChave).filter(Boolean).map(x => `${x.selo} ${x.label}`).join('   '),
      ingresso: textoIngresso(m.entrada || ''),
      pct: state.carteirinhaPct,
      foto: f.foto || '',
      // Em linhas de um ou dois campos, na mesma ordem da tela.
      campos: [
        [['🧥 Nome de colete', m.nome], ['👤 Nome completo', f.nomeCompleto]],
        [['📞 Telefone', f.telefone], ['🎂 Nascimento', f.nascimento ? formatDataBR(f.nascimento) + (idade !== null ? ` · ${idade} anos` : '') : '']],
        [['🆘 Emergência', emergencia], ['🆘 Tel. emergência', f.emergenciaTelefone]],
        [['🩸 Tipo sanguíneo', f.tipoSanguineo], ['🏥 Plano de saúde', f.planoSaude]],
        [['⚕️ Alergias e condições', f.saude]],
      ],
    };
    const nome = String(m.nome || 'integrante').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return mostrarPreviaImagem(() => imagemCarteirinha(c), `carteirinha-${nome}.png`);
  },
  'copiar-carteirinha': async (id, target, action, e) => {
    const m = membro();
    if (!m) return;
    const ok = await copiarTexto(textoCarteirinha(m, ficha(), state.carteirinhaPct, hojeISO()));
    if (!ok) return;
    state.carteirinhaCopiado = true;
    render();
    setTimeout(() => {
      if (!state.carteirinhaCopiado) return;
      state.carteirinhaCopiado = false;
      render();
    }, 1600);
  },
  'fechar-carteirinha': async (id, target, action, e) => { fecharCarteirinha(); return render(); },
  'editar-carteirinha': async (id, target, action, e) => {
    const f = ficha();
    state.carteirinhaForm = { ...f, nascimentoTexto: formatDataBR(f.nascimento || '') };
    state.carteirinhaMsg = null;
    return render();
  },
  'cancelar-carteirinha': async (id, target, action, e) => { state.carteirinhaForm = null; state.carteirinhaMsg = null; return render(); },
  'tipo-sanguineo-carteirinha': async (id, target, action, e) => {
    if (!state.carteirinhaForm) return;
    state.carteirinhaForm.tipoSanguineo = target.dataset.value;
    return render();
  },
  'tirar-foto-carteirinha': async (id, target, action, e) => {
    if (!state.carteirinhaForm) return;
    state.carteirinhaForm.foto = '';
    return render();
  },
  'salvar-carteirinha': async (id, target, action, e) => {
    const f = state.carteirinhaForm;
    const mid = state.carteirinhaMembroId;
    if (!f || state.carteirinhaSalvando) return;
    const nascimento = f.nascimentoTexto ? dataISOdeBR(f.nascimentoTexto) : '';
    if (f.nascimentoTexto && !nascimento) { state.carteirinhaMsg = `"${f.nascimentoTexto}" não é uma data válida. Escreva como 12/03/1985.`; return render(); }
    if (nascimento && nascimento > hojeISO()) { state.carteirinhaMsg = 'A data de nascimento não pode ser no futuro.'; return render(); }
    const salvo = {
      telefone: f.telefone || '', emergenciaNome: f.emergenciaNome || '', emergenciaParentesco: f.emergenciaParentesco || '',
      emergenciaTelefone: f.emergenciaTelefone || '', nascimento, tipoSanguineo: f.tipoSanguineo || '', saude: f.saude || '', foto: f.foto || '',
      nomeCompleto: f.nomeCompleto || '', planoSaude: f.planoSaude || '',
    };
    state.carteirinhaSalvando = true;
    state.carteirinhaMsg = null;
    render();
    try {
      // POST: a foto nao cabe numa URL. So manda a foto se ela mudou.
      const params = { membroId: mid, ...salvo };
      if (salvo.foto === (ficha().foto || '')) delete params.foto;
      await apiPost('fichaMembroSalvar', params);
      if (state.carteirinhaMembroId !== mid) return;
      state.carteirinhaFicha = salvo;
      state.aniversariosEscopo = null;
      state.carteirinhaForm = null;
      mostrarAviso('✅ Carteirinha salva');
    } catch (err) {
      state.carteirinhaMsg = 'Não consegui salvar: ' + err.message + '.';
    } finally {
      state.carteirinhaSalvando = false;
    }
    return render();
  },
};
