// Regras do estoque administrativo do Regional. A quantidade atual vem do
// livro de entradas e saidas; nunca e editada diretamente.

export const QUANTIDADE_MAXIMA_ESTOQUE_ADM = 100000;

export function quantidadeEstoqueAdm(texto) {
  const t = String(texto || '').replace(/\D/g, '').slice(0, 6);
  const n = Number(t);
  return Number.isInteger(n) && n > 0 && n <= QUANTIDADE_MAXIMA_ESTOQUE_ADM ? n : 0;
}

export function resumoEstoqueAdm(itens) {
  const lista = itens || [];
  return {
    materiais: lista.length,
    unidades: lista.reduce((s, x) => s + (Number(x.quantidade) || 0), 0),
    zerados: lista.filter(x => !Number(x.quantidade)).length,
  };
}

export function textoResumoEstoqueAdm(r) {
  const partes = [
    `${r.materiais} ${r.materiais === 1 ? 'material' : 'materiais'}`,
    `${r.unidades} ${r.unidades === 1 ? 'unidade' : 'unidades'}`,
  ];
  if (r.zerados) partes.push(`${r.zerados} ${r.zerados === 1 ? 'zerado' : 'zerados'}`);
  return partes.join(' · ');
}

export function filtrarMovimentosEstoqueAdm(movimentos, tipo) {
  const lista = movimentos || [];
  return tipo && tipo !== 'todos' ? lista.filter(x => x.tipo === tipo) : lista;
}
