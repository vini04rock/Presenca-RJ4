// A Ficha de Admissao (14/11/2026): o que o pretendente preenche pelo link
// da divisao (ficha.html?divisao=...) - os campos, as escolhas, as mascaras e
// a conferencia antes de enviar. A pagina da ficha e o card Pretendentes do
// organizador leem daqui, entao os dois falam dos mesmos campos.
//
// Os campos vieram do PDF editavel do clube (Ficha_de_admissao_Regional_RJ4),
// na mesma ordem das 7 partes, ajustados pro celular: o que era "Sim ou Nao"
// virou botao, e a origem da admissao tambem.
//
// O Code.gs confere tudo de novo (receberFichaAdmissao): o link e publico, e
// a conferencia daqui so poupa o pretendente de uma ida a planilha a toa. As
// listas de opcoes estao escritas nos dois lados - mudou aqui, muda la.

import { escopoPorChave } from '../nucleo/config.js';

export const SIM_NAO = ['Sim', 'Nao'];
export const TAMANHOS = ['P', 'M', 'G', 'GG', 'XG', 'XGG'];
// Os do colete sao outros (14/11/2026): do GG vai ao G8.
export const TAMANHOS_COLETE = ['P', 'M', 'G', 'GG', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];
export const MATERIAIS_COLETE = [
  { valor: 'Jeans', rotulo: 'Jeans', detalhe: 'R$ 400,00' },
  { valor: 'Couro', rotulo: 'Couro', detalhe: 'R$ 900,00' },
];
export const FORMAS_PAGAMENTO = ['À vista', 'Parcelado'];
export const ORIGENS = ['Redes Sociais', 'Ação Social', 'Expansão', 'Evento', 'Indicado'];
export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB',
  'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
export const PARCELAS_MAX = 10;
// O que fica escrito quando a caixinha "nao tem" e marcada. O Code.gs aceita
// esses dois textos no lugar do complemento e do telefone residencial.
export const SEM_COMPLEMENTO = 'Não tem';
export const SEM_TELEFONE = 'Não tenho';

// As 7 partes da ficha. Cada campo:
//   tipo  - texto, cpf, data, cep, uf, telefone, email, numero, escolha
//   meia  - divide a linha com o vizinho (numero e complemento, cidade e UF)
//   obrig - obrigatorio. Tudo o que estava no PDF e (decisao do clube,
//           14/11/2026); o que depende de outro campo, so com o `soSe`
//   dica  - o texto clarinho dentro do campo vazio
//   sem   - a caixinha "Não tem" ao lado do rotulo: marcada, o campo fica
//           riscado e o valor e esse texto, que vai assim pra planilha
//           (complemento e telefone residencial, 14/11/2026)
//   soSe  - so aparece (e so e cobrado) quando outro campo tem aquele valor
// A ordem dos campos aqui e a ordem na tela e na planilha.
export const PARTES_FICHA = [
  { titulo: '1. Identificação', campos: [
    { chave: 'nomeColete', rotulo: 'Nome no colete / apelido', tipo: 'texto', obrig: true, max: 60, auto: 'nickname' },
    { chave: 'nomeCompleto', rotulo: 'Nome completo', tipo: 'texto', obrig: true, max: 120, auto: 'name' },
    { chave: 'cpf', rotulo: 'CPF', tipo: 'cpf', obrig: true },
    { chave: 'rg', rotulo: 'RG (número)', tipo: 'texto', obrig: true, max: 20 },
    { chave: 'nascimento', rotulo: 'Data de nascimento', tipo: 'data', obrig: true, auto: 'bday' },
    { chave: 'profissao', rotulo: 'Profissão', tipo: 'texto', obrig: true, max: 60, auto: 'organization-title' },
  ] },
  { titulo: '2. Veículos', campos: [
    { chave: 'moto', rotulo: 'Possui moto?', tipo: 'escolha', opcoes: SIM_NAO, obrig: true, meia: true },
    { chave: 'carro', rotulo: 'Possui carro?', tipo: 'escolha', opcoes: SIM_NAO, obrig: true, meia: true },
  ] },
  { titulo: '3. Endereço', campos: [
    { chave: 'cep', rotulo: 'CEP', tipo: 'cep', obrig: true, auto: 'postal-code',
      ajuda: 'Digite o CEP e o endereço aparece sozinho.' },
    { chave: 'endereco', rotulo: 'Endereço (rua, avenida...)', tipo: 'texto', obrig: true, max: 120, auto: 'address-line1' },
    { chave: 'numero', rotulo: 'Número', tipo: 'texto', obrig: true, max: 10, meia: true },
    { chave: 'complemento', rotulo: 'Complemento', tipo: 'texto', obrig: true, max: 60, auto: 'address-line2', meia: true,
      sem: SEM_COMPLEMENTO },
    { chave: 'bairro', rotulo: 'Bairro', tipo: 'texto', obrig: true, max: 60 },
    { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto', obrig: true, max: 60, auto: 'address-level2', meia: true },
    { chave: 'uf', rotulo: 'UF', tipo: 'uf', obrig: true, auto: 'address-level1', meia: true },
  ] },
  { titulo: '4. Contatos', campos: [
    { chave: 'celular', rotulo: 'Celular / WhatsApp', tipo: 'telefone', obrig: true, auto: 'tel' },
    { chave: 'telResidencial', rotulo: 'Telefone residencial', tipo: 'telefone', obrig: true,
      sem: SEM_TELEFONE },
    { chave: 'email', rotulo: 'E-mail', tipo: 'email', obrig: true, max: 120, auto: 'email',
      ajuda: 'É por ele que chega a senha do site do M.C.' },
  ] },
  { titulo: '5. Contato de emergência', campos: [
    { chave: 'emergenciaNome', rotulo: 'Nome do contato', tipo: 'texto', obrig: true, max: 80 },
    { chave: 'emergenciaParentesco', rotulo: 'Grau de parentesco', tipo: 'texto', obrig: true, max: 40 },
    { chave: 'emergenciaTelefone', rotulo: 'Telefone do contato', tipo: 'telefone', obrig: true },
  ] },
  { titulo: '6. Entrada no clube', campos: [
    { chave: 'camisa', rotulo: 'Tamanho da camisa', tipo: 'escolha', opcoes: TAMANHOS, obrig: true },
    { chave: 'colete', rotulo: 'Tamanho do colete novo', tipo: 'escolha', opcoes: TAMANHOS_COLETE, obrig: true },
    { chave: 'coleteMaterial', rotulo: 'Material do colete', tipo: 'escolha', opcoes: MATERIAIS_COLETE.map(m => m.valor), obrig: true },
    { chave: 'pagamento', rotulo: 'Forma de pagamento do colete', tipo: 'escolha', opcoes: FORMAS_PAGAMENTO, obrig: true },
    { chave: 'parcelas', rotulo: 'Em quantas vezes?', tipo: 'numero', obrig: true, soSe: ['pagamento', 'Parcelado'], max: 2,
      ajuda: 'Até 10x, com juros da operadora.' },
    { chave: 'coletePagamento', rotulo: 'Data possível de pagamento do colete', tipo: 'data', obrig: true },
  ] },
  { titulo: '7. Origem da admissão', campos: [
    { chave: 'origem', rotulo: 'Como chegou até o clube?', tipo: 'escolha', opcoes: ORIGENS, obrig: true },
    // Quem indica vira o padrinho (decisao do clube, 14/11/2026): o campo
    // "Padrinho" da parte 6 saiu, e e este que diz quem e.
    { chave: 'quemIndicou', rotulo: 'Quem te indicou ao clube (seu futuro padrinho)', tipo: 'texto', obrig: true, soSe: ['origem', 'Indicado'], max: 80 },
  ] },
];

export const CAMPOS_FICHA = PARTES_FICHA.flatMap(p => p.campos);

// As observacoes do fim da ficha (a versao nova do PDF, com o site do M.C.),
// mostradas depois que a ficha e enviada.
export const OBSERVACOES_ADMISSAO = [
  'Verifique se o seu WhatsApp está desbloqueado para que um de nossos integrantes possa adicioná-lo aos grupos oficiais. Para liberar, acesse Configurações > Privacidade > Grupos e deixe habilitada a opção que permite que todos possam adicioná-lo a grupos.',
  'Após finalizar o cadastro no sistema, você receberá um e-mail com a senha para login no site do M.C. (18mc.com.br). Use essa senha junto com o seu e-mail para fazer o primeiro acesso e aceitar os termos. Ao aceitar os termos, seu cadastro será concluído e o seu ADM poderá gerar o seu primeiro boleto.',
  'O primeiro boleto será no valor de R$ 100,00, incluindo a 1ª mensalidade e o direito de uso de 1 camisa oficial do INSANOS M.C. Após esse primeiro pagamento, a mensalidade será no valor de R$ 75,00.',
];

// ---------- mascaras (vao pondo a pontuacao enquanto se digita) ----------

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

export function mascaraCpf(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascaraCep(v) {
  const d = soDigitos(v).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

// (21) 99999-9999 no celular, (21) 2222-2222 no fixo.
export function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2), resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

// ---------- conferencias ----------

// Os dois digitos verificadores do CPF. Sequencia repetida (111.111.111-11)
// passa na conta, mas nao existe.
export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export const telefoneValido = (v) => { const n = soDigitos(v).length; return n === 10 || n === 11; };
export const cepValido = (v) => soDigitos(v).length === 8;
export const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

// O campo aparece? So quando a condicao dele bate (parcelas so no
// Parcelado, quem indicou so no Indicado).
export function campoVisivel(campo, valores) {
  return !campo.soSe || valores[campo.soSe[0]] === campo.soSe[1];
}

// Confere a ficha inteira. `valores` vem com as datas ja em ISO (ou o texto
// como foi digitado, se nao virou data) e `hoje` em ISO. Devolve a lista de
// problemas, cada um com o campo e a frase - vazia, pode enviar.
export function conferirFicha(valores, hoje) {
  const erros = [];
  const erro = (campo, msg) => erros.push({ chave: campo.chave, msg });
  CAMPOS_FICHA.forEach(campo => {
    if (!campoVisivel(campo, valores)) return;
    const v = String(valores[campo.chave] == null ? '' : valores[campo.chave]).trim();
    if (!v) {
      if (campo.obrig) erro(campo, campo.tipo === 'escolha' ? `Escolha: ${campo.rotulo}`
        : `Preencha: ${campo.rotulo}${campo.sem ? ` (ou marque "${campo.sem}")` : ''}`);
      return;
    }
    // Marcou "nao tem": nada a conferir.
    if (campo.sem && v === campo.sem) return;
    if (campo.tipo === 'cpf' && !cpfValido(v)) erro(campo, 'CPF inválido - confira os números.');
    if (campo.tipo === 'cep' && !cepValido(v)) erro(campo, 'CEP precisa ter 8 números.');
    if (campo.tipo === 'telefone' && !telefoneValido(v)) erro(campo, `${campo.rotulo}: coloque o DDD e o número.`);
    if (campo.tipo === 'email' && !emailValido(v)) erro(campo, 'E-mail inválido.');
    if (campo.tipo === 'uf' && !UFS.includes(v.toUpperCase())) erro(campo, 'UF inválida (ex.: RJ).');
    if (campo.tipo === 'escolha' && !campo.opcoes.includes(v)) erro(campo, `Escolha: ${campo.rotulo}`);
    if (campo.tipo === 'data') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) erro(campo, `${campo.rotulo}: escreva dia/mês/ano, como 21/09/1990.`);
      else if (campo.chave === 'nascimento' && (v > hoje || v < '1920-01-01')) erro(campo, 'Data de nascimento inválida.');
    }
    if (campo.chave === 'parcelas') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 2 || n > PARCELAS_MAX) erro(campo, `Parcelas: de 2 a ${PARCELAS_MAX} vezes.`);
    }
  });
  return erros;
}

// O que vai pra planilha: so os campos visiveis, sem espaco sobrando, e com
// a UF em maiuscula. Campo escondido vai vazio (escolheu Parcelado, digitou
// 3 e voltou pra A vista: as 3 parcelas nao valem).
export function fichaParaEnvio(valores) {
  const saida = {};
  CAMPOS_FICHA.forEach(campo => {
    let v = campoVisivel(campo, valores) ? String(valores[campo.chave] == null ? '' : valores[campo.chave]).trim().replace(/\s+/g, ' ') : '';
    if (campo.tipo === 'uf') v = v.toUpperCase();
    saida[campo.chave] = v;
  });
  return saida;
}

// ---------- o card Pretendentes (o organizador le as fichas) ----------

// O caminho do pretendente (14/11/2026). Novo: acabou de enviar. Em analise:
// esperando entrar no sistema do clube. (Aprovado e Desistiu sao a Etapa 3.)
export const SITUACAO_NOVO = 'Novo';
export const SITUACAO_ANALISE = 'Em análise';
export const SITUACOES_PRETENDENTE = {
  [SITUACAO_NOVO]: { emoji: '🆕', rotulo: 'Novo' },
  [SITUACAO_ANALISE]: { emoji: '🔎', rotulo: 'Em análise' },
};

// 'curicica' -> 'Divisão Curicica'; 'regional' -> 'Regional RJ4'.
export function nomeDivisaoAdmissao(chave) {
  if (chave === 'regional') return 'Regional RJ4';
  return `Divisão ${escopoPorChave(chave).nome.replace(' - RJ4', '')}`;
}

// O link da ficha de uma divisao, a partir do endereco do app (funciona no
// servidor local e no GitHub Pages sem mudar nada).
export function linkDaFicha(enderecoDoApp, chave) {
  const caminho = `ficha.html?divisao=${encodeURIComponent(chave)}`;
  try { return new URL(caminho, enderecoDoApp).href; } catch (e) { return caminho; }
}

// Os Novos primeiro (sao os que pedem acao), e dentro de cada situacao o
// mais recente em cima. "Enviado em" vem como dd/mm/aaaa hh:mm.
const instante = (t) => { const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(String(t || '')); return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}` : ''; };
export function ordenarPretendentes(lista) {
  return [...lista].sort((a, b) => (a.situacao === SITUACAO_NOVO ? 0 : 1) - (b.situacao === SITUACAO_NOVO ? 0 : 1)
    || instante(b.enviadoEm).localeCompare(instante(a.enviadoEm)));
}

// O valor de um campo como se le: data em dd/mm/aaaa, "Nao" com acento,
// parcelas com o "x".
export function valorLegivel(campo, v) {
  const t = String(v == null ? '' : v);
  if (!t) return '';
  if (campo.tipo === 'data') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); return m ? `${m[3]}/${m[2]}/${m[1]}` : t; }
  if (t === 'Nao') return 'Não';
  if (campo.chave === 'parcelas') return `${t}x (com juros da operadora)`;
  if (campo.chave === 'coleteMaterial') { const m = MATERIAIS_COLETE.find(x => x.valor === t); return m ? `${t} (${m.detalhe})` : t; }
  return t;
}

// As partes da ficha com os valores de um pretendente, so os campos que
// valem (as parcelas so no Parcelado, quem indicou so no Indicado).
export function partesDoPretendente(p) {
  return PARTES_FICHA.map(parte => ({
    titulo: parte.titulo,
    linhas: parte.campos.filter(c => campoVisivel(c, p)).map(c => ({ campo: c, rotulo: c.rotulo, valor: valorLegivel(c, p[c.chave]) })),
  }));
}

// A ficha inteira em texto, pro WhatsApp e pro PDF (o mesmo texto nos dois).
// E o que se usa pra passar os dados pro sistema do clube.
export function textoFichaAdmissao(p) {
  const s = SITUACOES_PRETENDENTE[p.situacao] || SITUACOES_PRETENDENTE[SITUACAO_NOVO];
  const linhas = [
    '📝 *FICHA DE ADMISSÃO*',
    `*${p.nomeColete || ''}*${p.nomeCompleto ? ` · ${p.nomeCompleto}` : ''}`,
    `${nomeDivisaoAdmissao(p.divisao)}${p.enviadoEm ? ` · enviada em ${p.enviadoEm}` : ''}`,
    `${s.emoji} ${s.rotulo}`,
  ];
  partesDoPretendente(p).forEach(parte => {
    linhas.push('', `*${parte.titulo}*`);
    parte.linhas.forEach(l => linhas.push(`${l.rotulo}: ${l.valor || '-'}`));
  });
  return linhas.join('\n');
}
