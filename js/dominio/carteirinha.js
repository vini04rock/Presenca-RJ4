// A carteirinha do integrante: as contas (idade, aniversario) e os links
// de telefone. Os dados vem da aba MembrosFicha (Code.gs), atras do PIN.

export const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Quantos anos completos tem em `diaDeHoje` quem nasceu em `nascimentoISO`.
export function idadeEm(nascimentoISO, diaDeHoje) {
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nascimentoISO || ''));
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(diaDeHoje || ''));
  if (!n || !h) return null;
  let idade = Number(h[1]) - Number(n[1]);
  if (h[2] + h[3] < n[2] + n[3]) idade--;
  return idade;
}

// '(21) 99999-0000' -> '+5521999990000' (o Brasil quando nao vier o pais).
export function telefoneParaLink(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (!d) return '';
  return '+' + (d.length <= 11 ? '55' + d : d);
}
export function linkWhatsApp(numero) {
  return 'https://wa.me/' + telefoneParaLink(numero).replace('+', '');
}

// Os aniversarios do mural: de `diasAntes` dias antes ate o proprio dia.
// Cada um com quantos dias faltam (0 = hoje) e a idade que vai fazer. Quem
// nasceu em 29/02 faz aniversario em 28/02 nos anos que nao sao bissextos
// (a mesma regra das honrarias).
export function aniversariosProximos(lista, diaDeHoje, diasAntes = 7) {
  const [ha, hm, hd] = String(diaDeHoje).split('-').map(Number);
  const hoje = new Date(ha, hm - 1, hd);
  const saida = [];
  (lista || []).forEach(p => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.nascimento || ''));
    if (!m) return;
    for (const ano of [ha, ha + 1]) {
      let mes = Number(m[2]) - 1, dia = Number(m[3]);
      const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
      if (mes === 1 && dia === 29 && !bissexto) dia = 28;
      const dias = Math.round((new Date(ano, mes, dia) - hoje) / 86400000);
      if (dias >= 0 && dias <= diasAntes) {
        saida.push({ ...p, dias, idade: ano - Number(m[1]) });
        return;
      }
    }
  });
  return saida.sort((a, b) => a.dias - b.dias || String(a.nome).localeCompare(String(b.nome)));
}
