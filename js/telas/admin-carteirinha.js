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
// a pedido, ha Imagem, PDF e WhatsApp no topo da carteirinha aberta - e no
// topo da lista, pra varias de uma vez (marcando quem vai, ou todos).

import { api, apiPost } from '../nucleo/api.js';
import { LOGO_SRC } from '../nucleo/imagens.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, dataISOdeBR, escapeHtml, formatDataBR, hojeISO, mostrarAviso, ordenarPorHierarquia } from '../nucleo/util.js';
import { montarRelatorioIndividual } from '../dominio/relatorio-individual.js';
import { estaAfastado, textoIngresso } from '../dominio/movimentos.js';
import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { idadeEm, TIPOS_SANGUINEOS, linkWhatsApp, telefoneParaLink, textoCarteirinha } from '../dominio/carteirinha.js';
import { escopoPorChave, escoposEmOrdemDeExibicao, funcaoPorChave } from '../nucleo/config.js';
import { linhaFuncoes, nivelDoGrau, selinhoIniciais } from '../ui/comuns.js';
import { imagemCarteirinha, mostrarPreviaImagem } from '../ui/imagem.js';

function membro() { return state.roster.find(m => m.id === state.carteirinhaMembroId); }
function ficha() { return state.carteirinhaFicha || {}; }

// A aba Carteirinhas: com uma carteirinha aberta, ela toma a aba inteira;
// sem, a lista dos irmaos, um card por grau, na ordem hierarquica (a mesma
// do cadastro). No Regional (30/10/2026) a lista e de todas as divisoes: um
// card por divisao, fechado, e tocar no nome dela abre os integrantes, por
// grau. "Marcar todos" marca todas as divisoes juntas.
export function renderAdminCarteirinhas() {
  if (state.carteirinhaMembroId) return renderCarteirinhaMembro();
  if (state.carteirinhasProntas) return renderProntas();
  const membros = membrosDaLista();
  if (!membros.length) return '<div class="empty">Nenhum membro cadastrado ainda.</div>';
  const topo = state.carteirinhasExportar ? topoSelecao(membros) : topoLista();
  if (state.adminEscopo !== 'regional') {
    return topo + gruposPorGrau(membrosDoEscopo()).map(g => `
      <div class="card lista-cadastro">${blocoGrau(state.adminEscopo, g)}</div>
    `).join('');
  }
  return topo + escoposEmOrdemDeExibicao().map(e => {
    const doEscopo = membrosDe(e);
    const aberto = state.carteirinhasDivisoesAbertas.has(e.chave);
    return `
      <div class="card lista-cadastro">
        <div class="division-subheader clicavel" data-action="carteirinhas-abrir-divisao" data-value="${e.chave}">
          <span style="display:flex; align-items:center;">${state.carteirinhasExportar && doEscopo.length ? caixa(doEscopo, 'carteirinhas-marcar-grupo', e.chave) : ''}${aberto ? '▾' : '▸'} ${escapeHtml(e.nome.toUpperCase())}</span>
          <span class="division-counts">${contagem(doEscopo)}</span>
        </div>
        ${aberto ? (doEscopo.length
          ? gruposPorGrau(doEscopo).map(g => `<div class="carteirinhas-grau">${blocoGrau(e.chave, g)}</div>`).join('')
          : '<div class="empty">Nenhum integrante cadastrado.</div>') : ''}
      </div>
    `;
  }).join('');
}

// Quem esta na lista: os da divisao, ou - no Regional - os de todas, na
// ordem da tela (divisao por divisao, cada uma por grau).
function membrosDe(e) { return state.roster.filter(m => m.divisao === e.nome); }
function membrosDaLista() {
  if (state.adminEscopo !== 'regional') return membrosDoEscopo();
  return escoposEmOrdemDeExibicao().flatMap(e => gruposPorGrau(membrosDe(e)).flatMap(g => g.membros));
}

// O cabecalho de um grau (com a caixa, na selecao) e as linhas dele.
function blocoGrau(chave, g) {
  return `
    <div class="division-subheader">
      <span style="display:flex; align-items:center;">${state.carteirinhasExportar ? caixa(g.membros, 'carteirinhas-marcar-grupo', `${chave}|${g.grau}`) : ''}${g.grau ? `GRAU ${escapeHtml(g.grau)}` : 'SEM GRAU'}</span>
      <span class="division-counts">${contagem(g.membros)}</span>
    </div>
    ${g.membros.map(linhaLista).join('')}
  `;
}

function contagem(membros) {
  const n = membros.length;
  if (state.carteirinhasExportar) return `${membros.filter(m => state.carteirinhasMarcados.has(m.id)).length}/${n} ${n === 1 ? 'marcado' : 'marcados'}`;
  return `${n} ${n === 1 ? 'membro' : 'membros'}`;
}

// Os integrantes de um grupo da lista: 'barra' (a divisao inteira) ou
// 'barra|VI' (um grau dela).
function membrosDoGrupo(valor) {
  const [chave, grau] = String(valor).split('|');
  const e = escopoPorChave(chave);
  const doEscopo = e ? membrosDe(e) : [];
  return grau === undefined ? doEscopo : doEscopo.filter(m => (m.grau || '') === grau);
}

// Um card por grau, na ordem hierarquica (a mesma do cadastro).
function gruposPorGrau(membros) {
  const grupos = [];
  ordenarPorHierarquia(membros).forEach(m => {
    const grau = m.grau || '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grau === grau) ultimo.membros.push(m);
    else grupos.push({ grau, membros: [m] });
  });
  return grupos;
}

// ---------- exportar varias ----------------------------------------------
// Tocar num dos tres botoes liga a selecao: tocar na linha marca (em vez de
// abrir), a caixa do grau marca o grau inteiro e "Marcar todos" marca a
// lista. Exportar busca as fichas e a presenca de todos numa chamada so de
// cada (fichasVarias e relatorioIndividualVarios) e mostra as carteirinhas
// prontas, com o botao do formato - o toque nele e que gera a imagem, abre a
// impressao ou copia (o navegador so deixa copiar logo depois de um toque).
const FORMATOS = {
  imagem: { rotulo: '🖼️ Imagem', nome: 'imagem' },
  pdf: { rotulo: '📄 PDF', nome: 'PDF' },
  whatsapp: { rotulo: '📋 WhatsApp', nome: 'texto pro WhatsApp' },
};

function topoLista() {
  return `
    <div class="row-gap no-print" style="margin-bottom:8px;">
      ${Object.keys(FORMATOS).map(k => `<button class="btn secondary" style="flex:1;" data-action="carteirinhas-exportar" data-value="${k}">${FORMATOS[k].rotulo}</button>`).join('')}
    </div>
    <div class="info-line" style="padding:0 0 10px; color:var(--text-muted); font-size:12px; text-align:center;">Toque no nome para abrir a carteirinha, ou num botão acima para exportar várias.</div>
  `;
}

function topoSelecao(membros) {
  const n = state.carteirinhasMarcados.size;
  const todos = n === membros.length;
  const carregando = state.carteirinhasCarregando;
  const formato = FORMATOS[state.carteirinhasExportar];
  const rotulo = carregando ? `Buscando ${n} ${n === 1 ? 'carteirinha' : 'carteirinhas'}…`
    : n ? `${formato.rotulo} · exportar ${n} ${n === 1 ? 'carteirinha' : 'carteirinhas'}` : 'Marque quem vai';
  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:4px;">Exportar carteirinhas em ${formato.nome}</div>
      <div style="color:var(--text-muted); font-size:12.5px; margin-bottom:10px;">Marque cada integrante, um grau inteiro ou todos. Telefone e saúde vão junto.</div>
      <div class="row-gap" style="margin-bottom:8px;">
        <button class="btn secondary" style="flex:1;" data-action="carteirinhas-marcar-todos" ${carregando ? 'disabled' : ''}>${todos ? '☐ Desmarcar todos' : `☑️ Marcar todos (${membros.length})`}</button>
        ${state.carteirinhasExportar === 'whatsapp' ? botaoSimplificado() : ''}
      </div>
      ${state.carteirinhasErro ? `
        <div class="alert" style="margin-bottom:10px;">
          <div class="alert-title">Não consegui buscar as carteirinhas</div>
          <div class="alert-msg">${escapeHtml(state.carteirinhasErro)}.</div>
        </div>` : ''}
      <button class="btn block" data-action="carteirinhas-gerar" style="margin-bottom:8px;" ${n && !carregando ? '' : 'disabled'}>${rotulo}</button>
      <button class="btn secondary block" data-action="carteirinhas-cancelar" ${carregando ? 'disabled' : ''}>Cancelar</button>
    </div>
  `;
}

// So no texto pro WhatsApp: sem ingresso, sem % e sem o nome de colete
// repetido embaixo (ver textoCarteirinha).
function botaoSimplificado() {
  const ativo = state.carteirinhasSimplificado;
  return `<button class="toggle-chip carteirinhas-simplificado ${ativo ? 'active' : ''}" data-action="carteirinhas-simplificado" aria-pressed="${ativo}">${ativo ? '✅' : '⬜'} Simplificado</button>`;
}

// A caixa de um grupo (um grau, ou a divisao inteira no Regional): marcada
// com todos dele. Tem acao propria - no Regional, marcar a divisao nao abre
// nem fecha o card.
function caixa(membros, acao, valor) {
  const todos = membros.every(m => state.carteirinhasMarcados.has(m.id));
  return `<input type="checkbox" class="relind-check" data-action="${acao}" data-value="${escapeHtml(valor)}" ${todos ? 'checked' : ''}>`;
}

// As prontas: o botao do formato e, embaixo, as carteirinhas - que sao
// tambem a folha do PDF, uma por bloco, sem quebrar no meio.
function renderProntas() {
  const lista = state.carteirinhasProntas;
  const k = state.carteirinhasExportar;
  const botao = k === 'imagem' ? `<button class="btn block" data-action="carteirinhas-imagens">🖼️ Gerar ${lista.length === 1 ? 'a imagem' : `as ${lista.length} imagens`}</button>`
    : k === 'pdf' ? '<button class="btn block" data-action="imprimir-carteirinha">🖨️ Imprimir / Exportar PDF</button>'
    : `<button class="btn block" data-action="carteirinhas-copiar">${state.carteirinhasCopiado ? 'Copiado ✓' : `📋 Copiar ${lista.length === 1 ? 'a carteirinha' : `as ${lista.length} carteirinhas`}`}</button>`;
  return `
    <button class="btn ghost no-print" style="margin-bottom:10px;" data-action="carteirinhas-voltar">‹ Voltar à lista</button>
    <div class="card no-print" style="margin-bottom:14px;">
      <div style="font-weight:600; margin-bottom:10px;">${lista.length} ${lista.length === 1 ? 'carteirinha pronta' : 'carteirinhas prontas'}</div>
      ${k === 'whatsapp' ? `<div class="row-gap" style="margin-bottom:10px;">${botaoSimplificado()}</div>` : ''}
      ${botao}
    </div>
    ${lista.length ? lista.map(x => `<div class="carteirinha-pagina">${cartao(x.membro, x.ficha, x.pct, true)}</div>`).join('')
      : '<div class="empty">Nenhum dos marcados foi encontrado na planilha.</div>'}
  `;
}

function linhaLista(m) {
  const sel = !!state.carteirinhasExportar;
  return `
    <div class="member-row lista-carteirinha${estaAfastado(m) ? ' afastado' : ''}" data-action="${sel ? 'carteirinhas-marcar' : 'abrir-carteirinha'}" data-id="${m.id}">
      ${sel ? `<input type="checkbox" class="relind-check" ${state.carteirinhasMarcados.has(m.id) ? 'checked' : ''}>` : ''}
      <div class="member-info">
        ${selinhoIniciais(m)}
        <span class="member-name">${escapeHtml(m.nome)}</span>
        ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
        ${m.cargo ? `<span class="member-cargo-inline">${escapeHtml(m.cargo)}</span>` : ''}
      </div>
      ${sel ? '' : '<span class="lista-carteirinha-seta" aria-hidden="true">🪪 ›</span>'}
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
    ${cartao(m, state.carteirinhaForm ? { ...ficha(), foto: state.carteirinhaForm.foto } : ficha(), state.carteirinhaPct, pronta)}
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
// embaixo, e salvar atualiza a carteirinha. `f` e a ficha, `pct` a % total.
function cartao(m, f, pct, comDados) {
  const detalhe = [m.cargo, m.divisao].filter(Boolean).map(escapeHtml).join(' · ');
  const foto = f.foto;
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
      ${comDados ? dadosNoCartao(m, f) : ''}
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
function dadosNoCartao(m, f) {
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
    state.carteirinhaPct = pctDoRelatorio(rel);
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
  sairDaSelecao();
}

function sairDaSelecao() {
  state.carteirinhasExportar = null;
  state.carteirinhasMarcados = new Set();
  state.carteirinhasCarregando = false;
  state.carteirinhasErro = null;
  state.carteirinhasProntas = null;
  state.carteirinhasCopiado = false;
}

// A % total de presenca, a partir do relatorio individual (sem periodo).
function pctDoRelatorio(rel) {
  const r = montarRelatorioIndividual(rel, '', '');
  const bloco = r.divisao || r.regional;
  return bloco && bloco.geral.percentual !== null ? bloco.geral.percentual : null;
}

// O que a imagem precisa de um integrante, ja escrito.
function dadosDaImagem(m, f, pct) {
  const idade = idadeEm(f.nascimento, hojeISO());
  const emergencia = f.emergenciaNome ? f.emergenciaNome + (f.emergenciaParentesco ? ` (${f.emergenciaParentesco})` : '') : '';
  return {
    nome: m.nome,
    linhaGrau: [m.grau ? `Grau ${m.grau}` : '', m.cargo, m.divisao].filter(Boolean).join('  ·  '),
    funcoes: (m.funcoes || []).map(funcaoPorChave).filter(Boolean).map(x => `${x.selo} ${x.label}`).join('   '),
    ingresso: textoIngresso(m.entrada || ''),
    pct,
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
}

function nomeDeArquivo(m) {
  return String(m.nome || 'integrante').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// Os marcados, na ordem da lista - e a ordem do PDF, das imagens e do texto.
function marcadosEmOrdem() {
  return membrosDaLista().filter(m => state.carteirinhasMarcados.has(m.id));
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
    const c = dadosDaImagem(m, ficha(), state.carteirinhaPct);
    return mostrarPreviaImagem(() => imagemCarteirinha(c), `carteirinha-${nomeDeArquivo(m)}.png`);
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

  // ---- exportar varias ----
  'carteirinhas-exportar': async (id, target, action, e) => {
    sairDaSelecao();
    state.carteirinhasExportar = target.dataset.value;
    return render();
  },
  'carteirinhas-simplificado': async (id, target, action, e) => {
    state.carteirinhasSimplificado = !state.carteirinhasSimplificado;
    state.carteirinhasCopiado = false;
    return render();
  },
  'carteirinhas-cancelar': async (id, target, action, e) => { sairDaSelecao(); return render(); },
  'carteirinhas-marcar': async (id, target, action, e) => {
    if (state.carteirinhasCarregando) return;
    if (state.carteirinhasMarcados.has(id)) state.carteirinhasMarcados.delete(id);
    else state.carteirinhasMarcados.add(id);
    return render();
  },
  'carteirinhas-marcar-grupo': async (id, target, action, e) => {
    if (state.carteirinhasCarregando) return;
    const membros = membrosDoGrupo(target.dataset.value);
    if (!membros.length) return;
    const todos = membros.every(m => state.carteirinhasMarcados.has(m.id));
    membros.forEach(m => (todos ? state.carteirinhasMarcados.delete(m.id) : state.carteirinhasMarcados.add(m.id)));
    return render();
  },
  'carteirinhas-abrir-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.carteirinhasDivisoesAbertas.has(chave)) state.carteirinhasDivisoesAbertas.delete(chave);
    else state.carteirinhasDivisoesAbertas.add(chave);
    return render();
  },
  'carteirinhas-marcar-todos': async (id, target, action, e) => {
    if (state.carteirinhasCarregando) return;
    const membros = membrosDaLista();
    state.carteirinhasMarcados = state.carteirinhasMarcados.size === membros.length ? new Set() : new Set(membros.map(m => m.id));
    return render();
  },
  'carteirinhas-gerar': async (id, target, action, e) => {
    if (state.carteirinhasCarregando) return;
    const membros = marcadosEmOrdem();
    if (!membros.length) return;
    const ids = membros.map(m => m.id).join(',');
    state.carteirinhasCarregando = true;
    state.carteirinhasErro = null;
    render();
    try {
      const [f, rel] = await Promise.all([api('fichasVarias', { membroIds: ids }), api('relatorioIndividualVarios', { membroIds: ids })]);
      if (!state.carteirinhasExportar) return;
      const fichas = f.fichas || {};
      const pcts = {};
      (rel.relatorios || []).forEach(r => { if (r.membro) pcts[r.membro.id] = pctDoRelatorio(r); });
      state.carteirinhasProntas = membros.filter(m => fichas[m.id])
        .map(m => ({ membro: m, ficha: fichas[m.id], pct: pcts[m.id] === undefined ? null : pcts[m.id] }));
      window.scrollTo(0, 0);
    } catch (err) {
      state.carteirinhasErro = err.message;
    }
    state.carteirinhasCarregando = false;
    return render();
  },
  'carteirinhas-voltar': async (id, target, action, e) => {
    state.carteirinhasProntas = null;
    state.carteirinhasCopiado = false;
    return render();
  },
  // Uma imagem por integrante, uma depois da outra (todas juntas pesariam
  // demais num celular), e a previa com todas.
  'carteirinhas-imagens': async (id, target, action, e) => {
    const lista = state.carteirinhasProntas;
    if (!lista || !lista.length) return;
    return mostrarPreviaImagem(async () => {
      const telas = [];
      for (const x of lista) telas.push(await imagemCarteirinha(dadosDaImagem(x.membro, x.ficha, x.pct)));
      return telas;
    }, lista.length === 1 ? `carteirinha-${nomeDeArquivo(lista[0].membro)}.png` : 'carteirinhas.png');
  },
  'carteirinhas-copiar': async (id, target, action, e) => {
    const lista = state.carteirinhasProntas;
    if (!lista || !lista.length) return;
    const hoje = hojeISO();
    const ok = await copiarTexto(lista.map(x => textoCarteirinha(x.membro, x.ficha, x.pct, hoje, { simplificado: state.carteirinhasSimplificado })).join('\n\n━━━━━━━━━━━━━━━━\n\n'));
    if (!ok) return;
    state.carteirinhasCopiado = true;
    render();
    setTimeout(() => {
      if (!state.carteirinhasCopiado) return;
      state.carteirinhasCopiado = false;
      render();
    }, 1600);
  },
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
