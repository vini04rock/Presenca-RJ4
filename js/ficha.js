// A pagina da Ficha de Admissao (ficha.html?divisao=curicica): o link que a
// divisao manda pro pretendente. E uma pagina A PARTE do app - nao tem
// calendario, rank nem menu, so a ficha. As regras (campos, mascaras,
// conferencia) moram em dominio/admissao.js; aqui e so a tela.
//
// Ao contrario do app, esta tela e desenhada UMA vez: e um formulario, e
// redesenhar a cada toque fecharia o teclado do celular. Os botoes de
// escolha e as mascaras mexem direto no elemento.
//
// O que o pretendente envia vai pra aba Pretendentes da planilha
// (admissaoEnviar, no Code.gs) - a unica gravacao sem PIN alem da presenca.
// Depois de enviar, ele nao ve nem edita mais a ficha: quem tem o link nao
// pode ler a ficha de ninguem. Corrigir e com o ADM da divisao.

import { escoposNaOrdemOficial } from './nucleo/config.js';
import { escapeHtml, mascaraData, dataISOdeBR, hojeISO } from './nucleo/util.js';
import { apiPost } from './nucleo/api.js';
import { PARTES_FICHA, CAMPOS_FICHA, MATERIAIS_COLETE, OBSERVACOES_ADMISSAO, nomeDivisaoAdmissao,
  mascaraCpf, mascaraCep, mascaraTelefone, campoVisivel, conferirFicha, fichaParaEnvio } from './dominio/admissao.js';

const raiz = document.getElementById('app');
const chaveDivisao = new URLSearchParams(location.search).get('divisao') || '';
const divisao = escoposNaOrdemOficial().find(e => e.chave === chaveDivisao) || null;
const nomeDivisao = divisao ? nomeDivisaoAdmissao(divisao.chave) : '';

const escolhas = {};
let sujo = false, enviando = false, enviado = false;

const cabecalho = (sub) => `
  <div class="crest-wrap">
    <img src="img/logo.webp" alt="Insanos MC">
    <h1>Ficha de Admissão</h1>
    <div class="sub">${escapeHtml(sub)}</div>
  </div>`;

// ---------- o formulario ----------

const ROTULO_OPCAO = { Nao: 'Não' };
// A linha pequena embaixo do botao (o preco do colete vem de MATERIAIS_COLETE).
const DETALHE_OPCAO = { Parcelado: 'Até 10x · com juros da operadora' };

function htmlEscolha(campo) {
  const material = (v) => MATERIAIS_COLETE.find(m => m.valor === v);
  const larga = campo.opcoes.length === 2 || campo.chave === 'origem';
  // 10 tamanhos de colete: 5 por linha, senao sobra um sozinho embaixo.
  const estreita = campo.opcoes.length === 10;
  return `<div class="ficha-escolhas${larga ? ' larga' : ''}${estreita ? ' estreita' : ''}">${campo.opcoes.map(op => {
    const m = campo.chave === 'coleteMaterial' ? material(op) : null;
    const detalhe = m ? m.detalhe : (DETALHE_OPCAO[op] || '');
    return `<button type="button" class="chip-option" data-campo="${campo.chave}" data-valor="${escapeHtml(op)}">${escapeHtml(ROTULO_OPCAO[op] || op)}${detalhe ? `<span class="ficha-opcao-detalhe">${escapeHtml(detalhe)}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

function htmlEntrada(campo) {
  const a = [`id="f-${campo.chave}"`, `data-campo="${campo.chave}"`, `autocomplete="${campo.auto || 'off'}"`];
  if (campo.tipo === 'cpf') a.push('type="text" inputmode="numeric" maxlength="14" placeholder="000.000.000-00"');
  else if (campo.tipo === 'data') a.push('type="text" inputmode="numeric" maxlength="10" class="campo-data" placeholder="dd/mm/aaaa"');
  else if (campo.tipo === 'cep') a.push('type="text" inputmode="numeric" maxlength="9" placeholder="00000-000"');
  else if (campo.tipo === 'telefone') a.push('type="tel" maxlength="15" placeholder="(21) 99999-9999"');
  else if (campo.tipo === 'email') a.push(`type="email" maxlength="${campo.max}" autocapitalize="off" placeholder="seu@email.com"`);
  else if (campo.tipo === 'uf') a.push('type="text" maxlength="2" autocapitalize="characters" placeholder="RJ"');
  else if (campo.tipo === 'numero') a.push(`type="text" inputmode="numeric" maxlength="${campo.max}"`);
  else a.push(`type="text" maxlength="${campo.max}"`);
  if (campo.dica) a.push(`placeholder="${escapeHtml(campo.dica)}"`);
  return `<input ${a.join(' ')}>`;
}

function htmlCampo(campo) {
  const ajuda = campo.ajuda ? `<div class="ficha-ajuda" id="ajuda-${campo.chave}">${escapeHtml(campo.ajuda)}</div>` : '';
  return `
    <div class="field ficha-campo${campo.meia ? ' meia' : ''}" data-bloco="${campo.chave}"${campo.soSe ? ' hidden' : ''}>
      <div class="ficha-rotulo">
        <label${campo.tipo === 'escolha' ? '' : ` for="f-${campo.chave}"`}>${escapeHtml(campo.rotulo)}</label>
        ${campo.sem ? `<label class="ficha-sem"><input type="checkbox" id="sem-${campo.chave}" data-sem="${campo.chave}">${escapeHtml(campo.sem)}</label>` : ''}
      </div>
      ${campo.tipo === 'escolha' ? htmlEscolha(campo) : htmlEntrada(campo)}
      ${ajuda}
      <div class="ficha-erro-msg"></div>
    </div>`;
}

// O texto do fim do PDF: no fim da ficha (como no PDF, antes de enviar) e de
// novo na confirmacao, depois de enviar.
// O site do M.C. citado nas observacoes vira link (abre em outra aba, pra
// ficha nao se perder). O texto e escapado antes; so o endereco ganha a tag.
const SITE_MC = '18mc.com.br';
function comLinkDoSite(texto) {
  return escapeHtml(texto).replace(SITE_MC, `<a class="ficha-link" href="https://${SITE_MC}" target="_blank" rel="noopener noreferrer">${SITE_MC}</a>`);
}

function htmlObservacoes() {
  return `
    <div class="card ficha-observacoes">
      <h2 class="ficha-parte-titulo">Algumas observações importantes</h2>
      ${OBSERVACOES_ADMISSAO.map(t => `<p>${comLinkDoSite(t)}</p>`).join('')}
      <p><strong>Seja bem-vindo à Regional RJ4!</strong><br>Em caso de dúvidas, entre em contato com o seu ADM.</p>
      <p class="ficha-assinatura">Regional RJ4</p>
    </div>`;
}

function desenharFicha() {
  raiz.innerHTML = `
    ${cabecalho(`Novo integrante · ${nomeDivisao}`)}
    <div class="card ficha-intro">
      <h2 class="ficha-intro-titulo">Irmão, bem-vindo à Regional RJ4.</h2>
      <p>Entrar no Insanos MC é mais do que vestir um colete: é ganhar irmãos de
      estrada, de evento e de vida. ${escapeHtml(nomeDivisao.replace(/^Divisão/, 'A Divisão').replace(/^Regional/, 'A Regional'))} está te esperando.</p>
      <div class="ficha-intro-nota">Seus dados ficam só com a administração do clube.</div>
    </div>
    <form id="ficha" novalidate autocomplete="on">
      ${PARTES_FICHA.map(parte => `
        <section class="card ficha-parte">
          <h2 class="ficha-parte-titulo">${escapeHtml(parte.titulo)}</h2>
          <div class="ficha-campos">${parte.campos.map(htmlCampo).join('')}</div>
        </section>`).join('')}
      ${htmlObservacoes()}
      <!-- Campo-isca: invisivel pra gente, robo preenche. Com ele preenchido,
           o Code.gs finge que recebeu e nao grava nada. -->
      <div class="ficha-isca" aria-hidden="true">
        <label for="f-site">Site</label><input id="f-site" type="text" tabindex="-1" autocomplete="off">
      </div>
      <div id="ficha-resumo-erros" class="ficha-resumo-erros" hidden></div>
      <button type="submit" class="btn block ficha-enviar" id="ficha-enviar">Enviar ficha</button>
    </form>
    <div class="footer-admin"><div class="brand-tag">INSANOS MC · REGIONAL RJ4</div></div>`;
  ligarEventos();
}

// ---------- o que acontece ao digitar e tocar ----------

function marcarEscolha(chave, valor) {
  escolhas[chave] = valor;
  raiz.querySelectorAll(`.chip-option[data-campo="${chave}"]`).forEach(b => b.classList.toggle('active', b.dataset.valor === valor));
  limparErro(chave);
  // Parcelas so no Parcelado; quem indicou so no Indicado.
  CAMPOS_FICHA.filter(c => c.soSe && c.soSe[0] === chave).forEach(c => {
    const blocoCampo = raiz.querySelector(`[data-bloco="${c.chave}"]`);
    if (blocoCampo) blocoCampo.hidden = !campoVisivel(c, escolhas);
  });
}

function limparErro(chave) {
  const blocoCampo = raiz.querySelector(`[data-bloco="${chave}"]`);
  if (!blocoCampo || !blocoCampo.classList.contains('com-erro')) return;
  blocoCampo.classList.remove('com-erro');
  blocoCampo.querySelector('.ficha-erro-msg').textContent = '';
}

const MASCARA = { cpf: mascaraCpf, cep: mascaraCep, telefone: mascaraTelefone, data: mascaraData };

function ligarEventos() {
  const form = document.getElementById('ficha');
  form.addEventListener('click', (e) => {
    const b = e.target.closest('.chip-option[data-campo]');
    if (!b) return;
    sujo = true;
    marcarEscolha(b.dataset.campo, b.dataset.valor);
  });
  form.addEventListener('input', (e) => {
    const chave = e.target.dataset.campo;
    if (!chave) return;
    sujo = true;
    const campo = CAMPOS_FICHA.find(c => c.chave === chave);
    if (campo && MASCARA[campo.tipo]) e.target.value = MASCARA[campo.tipo](e.target.value);
    if (campo && campo.tipo === 'uf') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (chave === 'parcelas') e.target.value = e.target.value.replace(/\D/g, '');
    limparErro(chave);
    if (chave === 'cep') buscarCep(e.target.value);
  });
  // A caixinha "Não tem": marcada, o campo fica riscado e vazio (e travado);
  // desmarcada, volta a ser digitavel.
  form.addEventListener('change', (e) => {
    const chave = e.target.dataset.sem;
    if (!chave) return;
    sujo = true;
    const entrada = document.getElementById(`f-${chave}`);
    const blocoCampo = raiz.querySelector(`[data-bloco="${chave}"]`);
    entrada.disabled = e.target.checked;
    if (e.target.checked) {
      entrada.value = '';
      entrada.dataset.exemplo = entrada.placeholder;
      entrada.placeholder = e.target.parentElement.textContent.trim();
    } else {
      entrada.placeholder = entrada.dataset.exemplo || '';
    }
    blocoCampo.classList.toggle('sem-valor', e.target.checked);
    limparErro(chave);
    if (!e.target.checked) entrada.focus();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
  window.addEventListener('beforeunload', (e) => {
    if (sujo && !enviado) { e.preventDefault(); e.returnValue = ''; }
  });
}

// ---------- o CEP preenche o endereco ----------
// ViaCEP: gratuito, sem cadastro, e so recebe o CEP. Preenche so o que esta
// vazio ou o que ele mesmo preencheu antes - nunca apaga o que a pessoa
// escreveu. Se falhar, o endereco e digitado a mao, como sempre.

const doCep = {};
let cepBuscado = '';

async function buscarCep(valor) {
  const cep = String(valor).replace(/\D/g, '');
  const ajuda = document.getElementById('ajuda-cep');
  if (cep.length !== 8 || cep === cepBuscado) return;
  cepBuscado = cep;
  if (ajuda) ajuda.textContent = 'Buscando o endereço…';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (cep !== cepBuscado) return;
    if (!d || d.erro) { if (ajuda) ajuda.textContent = 'CEP não encontrado - preencha o endereço abaixo.'; return; }
    const preencher = { endereco: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf };
    Object.keys(preencher).forEach(chave => {
      const el = document.getElementById(`f-${chave}`);
      const novo = String(preencher[chave] || '');
      if (!el || !novo) return;
      if (!el.value.trim() || el.value === doCep[chave]) { el.value = novo; doCep[chave] = novo; limparErro(chave); }
    });
    if (ajuda) ajuda.textContent = 'Endereço encontrado. Confira e coloque o número.';
    const numero = document.getElementById('f-numero');
    if (numero && !numero.value) numero.focus();
  } catch (e) {
    if (cep === cepBuscado && ajuda) ajuda.textContent = 'Não deu pra buscar o CEP agora - preencha o endereço abaixo.';
  }
}

// ---------- enviar ----------

function lerValores() {
  const valores = {};
  CAMPOS_FICHA.forEach(campo => {
    if (campo.tipo === 'escolha') { valores[campo.chave] = escolhas[campo.chave] || ''; return; }
    const sem = document.getElementById(`sem-${campo.chave}`);
    if (sem && sem.checked) { valores[campo.chave] = campo.sem; return; }
    const bruto = (document.getElementById(`f-${campo.chave}`) || {}).value || '';
    // A data vai em ISO; o que nao virou data fica como foi escrito, pra
    // conferencia acusar em vez de sumir calado.
    valores[campo.chave] = campo.tipo === 'data' && bruto.trim() ? (dataISOdeBR(bruto) || bruto) : bruto;
  });
  return valores;
}

function mostrarErros(erros) {
  raiz.querySelectorAll('.ficha-campo.com-erro').forEach(c => {
    c.classList.remove('com-erro');
    c.querySelector('.ficha-erro-msg').textContent = '';
  });
  erros.forEach(({ chave, msg }) => {
    const blocoCampo = raiz.querySelector(`[data-bloco="${chave}"]`);
    if (!blocoCampo || blocoCampo.classList.contains('com-erro')) return;
    blocoCampo.classList.add('com-erro');
    blocoCampo.querySelector('.ficha-erro-msg').textContent = msg;
  });
  const resumo = document.getElementById('ficha-resumo-erros');
  resumo.hidden = !erros.length;
  resumo.textContent = erros.length === 1 ? 'Falta 1 coisa - está marcada em vermelho.' : `Faltam ${erros.length} coisas - estão marcadas em vermelho.`;
  if (erros.length) {
    const primeira = raiz.querySelector('.ficha-campo.com-erro');
    if (primeira) primeira.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function avisoDeEnvio(texto) {
  const resumo = document.getElementById('ficha-resumo-erros');
  resumo.hidden = !texto;
  resumo.textContent = texto;
}

async function enviar() {
  if (enviando) return;
  const valores = lerValores();
  const erros = conferirFicha(valores, hojeISO());
  mostrarErros(erros);
  if (erros.length) return;

  const botao = document.getElementById('ficha-enviar');
  enviando = true;
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  try {
    await apiPost('admissaoEnviar', {
      ...fichaParaEnvio(valores),
      divisao: divisao.chave,
      site: document.getElementById('f-site').value,
    });
    enviado = true;
    desenharRecebida(valores.nomeColete);
  } catch (e) {
    const semRede = e instanceof TypeError;
    avisoDeEnvio(semRede
      ? 'Não deu pra enviar. Confira a internet e toque em "Enviar ficha" de novo - nada do que você escreveu se perdeu.'
      : `Não deu pra enviar: ${e.message}`);
    botao.disabled = false;
    botao.textContent = 'Enviar ficha';
  } finally {
    enviando = false;
  }
}

// ---------- depois de enviar ----------

function desenharRecebida(nome) {
  raiz.innerHTML = `
    ${cabecalho(nomeDivisao)}
    <div class="card ficha-recebida">
      <div class="ficha-recebida-titulo">✅ Ficha recebida</div>
      <p>Valeu, <strong>${escapeHtml(String(nome || '').trim())}</strong>! Sua ficha chegou na ${escapeHtml(nomeDivisao)}.
      O ADM vai seguir com a sua entrada.</p>
    </div>
    ${htmlObservacoes()}
    <div class="footer-admin"><div class="brand-tag">INSANOS MC · REGIONAL RJ4</div></div>`;
  window.scrollTo(0, 0);
}

function desenharLinkErrado() {
  raiz.innerHTML = `
    ${cabecalho('Regional RJ4')}
    <div class="card ficha-intro">
      <strong>Este link está incompleto.</strong><br>
      Ele não diz de qual divisão é a ficha. Peça o link certo ao ADM da sua divisão.
    </div>`;
}

if (divisao) desenharFicha();
else desenharLinkErrado();
