// Modo organizador, secao Doacoes, aba "Estoque": o que o clube tem guardado
// (alimentos, roupas, cobertores, sapatos...). Um card por item, com a
// quantidade de hoje em unidades, pares ou kg, e sempre um card vazio so no
// fim - comecou a escrever nele, aparece outro embaixo. "Salvar estoque"
// grava a lista inteira de uma vez. As regras moram em dominio/estoque.js.
//
// Nas divisoes, o primeiro card e o dos alimentos dos eventos: o Code.gs
// soma nele sozinho cada doacao salva em "Por evento". Aqui ele so tem a
// quantidade (pra quando o alimento sai) - nome, medida e lixeira, nao.
//
// O rascunho (state.estoqueCards) nasce do que esta salvo na primeira vez
// que a aba desenha, e fica ate salvar, desfazer ou entrar de novo na secao.

import { ITEM_ALIMENTOS, cardVazio, lerQuantidade, mudancasNoEstoque, numeroEstoque, proximaMedida, resumoEstoque, sugerirMedida, textoResumoEstoque, conferirEstoque, QUANTIDADE_MAXIMA } from '../dominio/estoque.js';
import { salvarEstoque } from '../fluxos/doacoes-caixinha.js';
import { escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { escapeHtml } from '../nucleo/util.js';
import { imagensEstoqueDoacoes, mostrarPreviaImagem } from '../ui/imagem.js';

const novoCard = () => ({ item: '', quantidade: 0, medida: 'un', medidaManual: false });

function salvos() {
  return (state.doacoesDados && state.doacoesDados.estoque) || [];
}

// O rascunho, montado do que esta salvo se ainda nao existe, e sempre com
// exatamente um card vazio - o ultimo. Cards vazios no meio (alguem apagou
// o nome e a quantidade) saem aqui.
function cards() {
  if (!state.estoqueCards) {
    // `base`: quanto o card dos alimentos tinha ao abrir (ver salvarEstoque
    // no Code.gs).
    state.estoqueCards = salvos().map(x => ({ item: x.item, quantidade: x.quantidade, medida: x.medida, medidaManual: true,
      ...(x.automatico ? { automatico: true, base: x.quantidade } : {}) }));
  }
  const cheios = state.estoqueCards.filter(c => c.automatico || !cardVazio(c));
  state.estoqueCards = cheios.concat(novoCard());
  return state.estoqueCards;
}

function aviso() {
  const m = state.estoqueMsg;
  if (!m) return '';
  return `<div class="alert ${m.ok ? 'ok' : ''}" style="margin-bottom:14px;"><div class="alert-msg">${escapeHtml(m.texto)}</div></div>`;
}

function resumoHtml(lista) {
  const r = resumoEstoque(lista);
  if (!r.itens) return 'Nenhum item ainda.';
  return `<b>${escapeHtml(textoResumoEstoque(r))}</b>${r.acabaram ? ` · <span class="estoque-acabou-texto">${r.acabaram} ${r.acabaram === 1 ? 'acabou' : 'acabaram'}</span>` : ''}`;
}

function textoMudancas(n) {
  return n ? `⚠️ ${n} ${n === 1 ? 'mudança não salva' : 'mudanças não salvas'}` : 'Tudo salvo';
}

const LIXEIRA = i => `<button class="estoque-remover" data-action="estoque-remover" data-id="${i}" aria-label="Tirar o item da lista">🗑️</button>`;

// O card dos alimentos dos eventos: nome e medida fixos, sem lixeira.
function cardAlimentos(c, i) {
  return `
    <div class="card estoque-card estoque-alimentos" data-i="${i}">
      <div class="estoque-alimentos-titulo">🥫 ${escapeHtml(ITEM_ALIMENTOS)}</div>
      <div class="estoque-alimentos-explica">Soma sozinho cada doação salva em "Por evento". Quando o alimento sair, diminua aqui.</div>
      <div class="estoque-controles">
        <span class="estoque-medida" style="cursor:default;">kg</span>
        <button class="kg-botao" data-action="estoque-menos" data-id="${i}" aria-label="Menos 1 kg">−</button>
        <input type="text" inputmode="decimal" class="estoque-qtd" data-i="${i}" maxlength="8" autocomplete="off"
               value="${numeroEstoque(c.quantidade)}" placeholder="0" aria-label="Quilos de alimento">
        <button class="kg-botao" data-action="estoque-mais" data-id="${i}" aria-label="Mais 1 kg">+</button>
      </div>
    </div>
  `;
}

function cardItem(c, i, lista) {
  if (c.automatico) return cardAlimentos(c, i);
  const vazio = i === lista.length - 1 && cardVazio(c);
  const acabou = !vazio && String(c.item).trim() && !c.quantidade;
  return `
    <div class="card estoque-card${vazio ? ' vazio' : ''}${acabou ? ' acabou' : ''}" data-i="${i}">
      <input type="text" class="estoque-nome" data-i="${i}" maxlength="60" autocomplete="off"
             value="${escapeHtml(c.item)}" placeholder="${vazio ? '+ Novo item (ex.: Cobertor)' : 'Nome do item'}">
      <div class="estoque-controles">
        <button class="estoque-medida" data-action="estoque-medida" data-id="${i}" aria-label="Trocar a medida: unidade, par ou kg">${escapeHtml(c.medida || 'un')}</button>
        <button class="kg-botao" data-action="estoque-menos" data-id="${i}" aria-label="Menos 1">−</button>
        <input type="text" inputmode="${c.medida === 'kg' ? 'decimal' : 'numeric'}" class="estoque-qtd" data-i="${i}" maxlength="8" autocomplete="off"
               value="${vazio && !c.quantidade ? '' : numeroEstoque(c.quantidade)}" placeholder="0" aria-label="Quantidade">
        <button class="kg-botao" data-action="estoque-mais" data-id="${i}" aria-label="Mais 1">+</button>
        ${vazio ? '' : LIXEIRA(i)}
      </div>
      ${acabou ? '<div class="estoque-acabou-texto">acabou</div>' : ''}
    </div>
  `;
}

export function renderEstoque() {
  const lista = cards();
  const mudancas = mudancasNoEstoque(salvos(), lista);
  return `
    ${aviso()}
    <div class="card">
      <div class="painel-titulo">📦 Estoque</div>
      <div class="fin-explica">O que o clube tem guardado hoje: alimentos, roupas, cobertores, sapatos… item por item.${state.adminEscopo === 'regional' ? '' : ' Os alimentos dos eventos entram sozinhos, pelo "Por evento".'}</div>
      <div class="doacao-total" id="estoque-resumo">${resumoHtml(lista)}</div>
      <button class="btn secondary block no-print" style="margin-top:12px;" data-action="imagem-estoque">🖼️ Imagem pro grupo</button>
    </div>
    <div class="estoque-lista" id="estoque-lista">${lista.map((c, i) => cardItem(c, i, lista)).join('')}</div>
    <div class="card estoque-salvar no-print">
      <div class="estoque-mudancas${mudancas ? ' pendente' : ''}" id="estoque-mudancas">${textoMudancas(mudancas)}</div>
      <button class="btn block" data-action="salvar-estoque" ${state.estoqueSalvando ? 'disabled' : ''}>${state.estoqueSalvando ? 'Salvando…' : '💾 Salvar estoque'}</button>
      <button class="btn ghost block" style="margin-top:6px;" data-action="desfazer-estoque" ${state.estoqueSalvando ? 'disabled' : ''}>Desfazer (voltar ao que está salvo)</button>
    </div>
  `;
}

// Enquanto se digita o nome ou a quantidade: guarda no rascunho e acerta o
// resto por fora, sem redesenhar - redesenhar fecharia o teclado do celular.
// Quando o card vazio do fim deixa de ser vazio, um novo aparece embaixo.
export function atualizarCampoEstoque(campo, raiz) {
  const lista = state.estoqueCards;
  const i = Number(campo.dataset.i);
  const c = lista && lista[i];
  if (!c) return;
  const card = campo.closest ? campo.closest('.estoque-card') : null;
  if (campo.classList.contains('estoque-nome')) {
    c.item = campo.value;
    if (!c.medidaManual) {
      c.medida = sugerirMedida(campo.value);
      const botao = card && card.querySelector('.estoque-medida');
      if (botao) botao.textContent = c.medida;
    }
  } else {
    // kg aceita uma casa decimal (com virgula); un e par, so digitos.
    const limpo = c.medida === 'kg'
      ? campo.value.replace(/[^\d,.]/g, '').replace('.', ',').replace(/(,\d?).*$/, '$1').slice(0, 8)
      : campo.value.replace(/\D/g, '').slice(0, 6);
    if (limpo !== campo.value) campo.value = limpo;
    c.quantidade = Math.min(QUANTIDADE_MAXIMA, lerQuantidade(limpo, c.medida));
  }
  if (i === lista.length - 1 && !cardVazio(c)) {
    lista.push(novoCard());
    if (card) {
      card.classList.remove('vazio');
      const controles = card.querySelector('.estoque-controles');
      if (controles) controles.insertAdjacentHTML('beforeend', LIXEIRA(i));
    }
    const lugar = raiz.querySelector('#estoque-lista');
    if (lugar) lugar.insertAdjacentHTML('beforeend', cardItem(lista[lista.length - 1], lista.length - 1, lista));
  }
  const resumo = raiz.querySelector('#estoque-resumo');
  if (resumo) resumo.innerHTML = resumoHtml(lista);
  const mudancas = raiz.querySelector('#estoque-mudancas');
  if (mudancas) {
    const n = mudancasNoEstoque(salvos(), lista);
    mudancas.textContent = textoMudancas(n);
    mudancas.classList.toggle('pendente', !!n);
  }
}

export const acoes = {
  'estoque-mais': async (id, target, action, e) => {
    const c = cards()[Number(id)];
    if (c) c.quantidade = Math.min(QUANTIDADE_MAXIMA, Math.round(((Number(c.quantidade) || 0) + 1) * 10) / 10);
    return render();
  },
  'estoque-menos': async (id, target, action, e) => {
    const c = cards()[Number(id)];
    if (c) c.quantidade = Math.max(0, Math.round(((Number(c.quantidade) || 0) - 1) * 10) / 10);
    return render();
  },
  'estoque-medida': async (id, target, action, e) => {
    const c = cards()[Number(id)];
    // un -> par -> kg -> un. Saindo do kg, a quantidade perde a casa decimal.
    if (c && !c.automatico) {
      c.medida = proximaMedida(c.medida);
      c.quantidade = lerQuantidade(String(c.quantidade), c.medida);
      c.medidaManual = true;
    }
    return render();
  },
  'estoque-remover': async (id, target, action, e) => {
    const lista = cards();
    if (lista[Number(id)] && lista[Number(id)].automatico) return;
    lista.splice(Number(id), 1);
    return render();
  },
  'salvar-estoque': async (id, target, action, e) => {
    return salvarEstoque();
  },
  'desfazer-estoque': async (id, target, action, e) => {
    state.estoqueCards = null;
    state.estoqueMsg = null;
    return render();
  },
  // A imagem mostra o que esta SALVO - com mudanca pendente, pede pra salvar
  // antes, pra imagem do grupo nunca mostrar um estoque que nao existe.
  'imagem-estoque': async (id, target, action, e) => {
    const lista = cards();
    if (mudancasNoEstoque(salvos(), lista)) {
      state.estoqueMsg = { ok: false, texto: 'Salve o estoque antes de gerar a imagem: ela mostra o que está salvo.' };
      return render();
    }
    const c = conferirEstoque(lista);
    if (c.erro || !c.itens.length) {
      state.estoqueMsg = { ok: false, texto: c.erro || 'O estoque está vazio: nada pra mostrar na imagem.' };
      return render();
    }
    const resumo = textoResumoEstoque(resumoEstoque(c.itens));
    return mostrarPreviaImagem(() => imagensEstoqueDoacoes(c.itens, resumo, escopoPorChave(state.adminEscopo).nome), 'estoque-doacoes.png');
  },
};
