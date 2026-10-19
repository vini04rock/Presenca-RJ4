// Outras doacoes: o estoque do clube (roupas, cobertores, sapatos...). Nao e
// de cada integrante - e o que o clube tem guardado, item por item, com a
// quantidade de hoje. A obrigacao de cada um (1 kg por evento) continua em
// dominio/doacoes.js.
//
// Cada item: { item, quantidade, medida } - medida 'un', 'par' ou 'kg' (so
// o kg aceita uma casa decimal: 2,5 kg). Os dados
// chegam do Code.gs (lerEstoque) na ordem em que foram salvos, que e a
// ordem da tela.

import { normalizarBusca } from '../nucleo/util.js';

// A ordem e a do toque na medida: un -> par -> kg -> un.
export const MEDIDAS = ['un', 'par', 'kg'];
export function proximaMedida(medida) {
  return MEDIDAS[(MEDIDAS.indexOf(medida) + 1) % MEDIDAS.length];
}
export const QUANTIDADE_MAXIMA = 100000;

// O que se conta em pares, e o que se pesa. Quem digitar "Tênis infantil"
// ja ve "par"; quem digitar "Arroz", "kg".
const DE_PAR = /\b(sapato|tenis|chinelo|sandalia|bota|meia)s?\b/;
const DE_KG = /\b(arroz|feijao|acucar|macarrao|farinha|fuba|cafe|sal|alimentos?)\b/;
export function sugerirMedida(nome) {
  const n = normalizarBusca(nome);
  if (DE_PAR.test(n)) return 'par';
  return DE_KG.test(n) ? 'kg' : 'un';
}

// "2,5" - a quantidade no jeito brasileiro (so o kg tem decimal).
export function numeroEstoque(q) {
  return (Number(q) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1, useGrouping: false });
}

// O que se digitou na quantidade -> numero. kg aceita uma casa decimal
// (virgula ou ponto); un e par, so inteiro. Vazio = 0.
export function lerQuantidade(texto, medida) {
  const t = String(texto || '').replace(',', '.').trim();
  if (!t) return 0;
  const n = Number(t);
  if (!isFinite(n) || n < 0) return 0;
  return medida === 'kg' ? Math.round(n * 10) / 10 : Math.floor(n);
}

// "12 un", "1 par", "6 pares", "2,5 kg".
export function textoQuantidade(quantidade, medida) {
  if (medida === 'par') return `${quantidade} ${quantidade === 1 ? 'par' : 'pares'}`;
  if (medida === 'kg') return `${numeroEstoque(quantidade)} kg`;
  return `${quantidade} un`;
}

// Um card sem nome e sem quantidade e o card vazio do fim da lista - nao e
// item, e nao vai pra planilha.
export function cardVazio(c) {
  return !String(c.item || '').trim() && !c.quantidade;
}

// "Cobertor" e "cobertôr " sao o mesmo item.
const chaveDoItem = nome => normalizarBusca(nome).replace(/\s+/g, ' ');

// Confere a lista da tela antes de salvar. Devolve { itens } limpos (sem o
// card vazio, nomes aparados) ou { erro } dizendo o que acertar. O Code.gs
// confere de novo.
export function conferirEstoque(cards) {
  const itens = [];
  const vistos = {};
  for (const c of cards) {
    if (cardVazio(c)) continue;
    const item = String(c.item || '').trim().replace(/\s+/g, ' ');
    if (!item) return { erro: `Um card tem quantidade (${c.quantidade}) mas está sem o nome do item.` };
    if (item.length > 60) return { erro: `O nome "${item.slice(0, 20)}…" passou de 60 letras.` };
    const medida = MEDIDAS.includes(c.medida) ? c.medida : sugerirMedida(item);
    const q = medida === 'kg' ? Math.round(Number(c.quantidade) * 10) / 10 : Number(c.quantidade);
    if (!isFinite(q) || q < 0 || q > QUANTIDADE_MAXIMA || (medida !== 'kg' && !Number.isInteger(q))) {
      return { erro: `A quantidade de "${item}" não está certa.` };
    }
    const chave = chaveDoItem(item);
    if (vistos[chave]) return { erro: `"${item}" aparece duas vezes. Junte as quantidades num card só.` };
    vistos[chave] = true;
    itens.push({ item, quantidade: q, medida });
  }
  return { itens };
}

// "12 itens · 87 unidades · 6 pares · 40 kg" - e quantos acabaram.
export function resumoEstoque(itens) {
  const validos = itens.filter(c => !cardVazio(c) && String(c.item || '').trim());
  const soma = medida => validos.filter(c => c.medida === medida).reduce((s, c) => s + (Number(c.quantidade) || 0), 0);
  return {
    itens: validos.length,
    unidades: soma('un'),
    pares: soma('par'),
    kg: Math.round(soma('kg') * 10) / 10,
    acabaram: validos.filter(c => !Number(c.quantidade)).length,
  };
}

export function textoResumoEstoque(r) {
  const partes = [`${r.itens} ${r.itens === 1 ? 'item' : 'itens'}`];
  if (r.unidades) partes.push(`${r.unidades} ${r.unidades === 1 ? 'unidade' : 'unidades'}`);
  if (r.pares) partes.push(`${r.pares} ${r.pares === 1 ? 'par' : 'pares'}`);
  if (r.kg) partes.push(`${numeroEstoque(r.kg)} kg`);
  return partes.join(' · ');
}

// Quantas mudancas a tela tem em relacao ao que esta salvo: item novo,
// mudado ou tirado conta 1 cada. 0 = nada pra salvar.
export function mudancasNoEstoque(salvos, cards) {
  const atuais = cards.filter(c => !cardVazio(c));
  const porChave = lista => Object.fromEntries(lista.map(c => [chaveDoItem(c.item), c]));
  const antes = porChave(salvos || []);
  const agora = porChave(atuais);
  let n = 0;
  atuais.forEach(c => {
    const a = antes[chaveDoItem(c.item)];
    if (!a || a.item !== String(c.item).trim() || Number(a.quantidade) !== Number(c.quantidade) || a.medida !== c.medida) n++;
  });
  Object.keys(antes).forEach(k => { if (!agora[k]) n++; });
  return n;
}
