// O rascunho do Social da Barra ("Social ISSI", 21/10/2026), pronto pra
// carregar no planejador de Acoes Sociais: o banco de ideias (as 12 acoes
// do esboco anual + as 16 "outras ideias"), a agenda de 2027 (uma acao por
// mes, todas como Ideia) e os 3 textos. Os textos estao como o Social
// escreveu. A parte do churrasco/feijoada beneficente com os calculos
// ficou de fora, por decisao dele.
//
// So e usado uma vez, pelo "Comecar com o rascunho" (ver
// importarAcoesSociais no Code.gs, que recusa se a divisao ja tem algo).

export const ANO_DO_RASCUNHO = 2027;

const ideia = (emoji, nome, descricao, precisa) => ({ emoji, nome, descricao: descricao || '', precisa: precisa || '' });

export const RASCUNHO_IDEIAS = [
  // O esboco anual, na ordem dos meses.
  ideia('🏖️', 'Limpeza de praia', 'A prefeitura já faz; o foco é dar mais visibilidade ao clube.'),
  ideia('🩸', 'Doação de sangue', 'Época de alto índice de acidentes.'),
  ideia('🧺', 'Doação de cestas básicas'),
  ideia('🍫', 'Entrega de chocolate para crianças humildes', 'Páscoa.'),
  ideia('💐', 'Ação social relacionada às mães', 'Dia das Mães.'),
  ideia('🪁', 'Conscientização e entrega de antena de linha de pipa para motociclistas', 'Férias e época de pipas.'),
  ideia('🧥', 'Doação de agasalhos'),
  ideia('👔', 'Ação social relacionada ao Dia dos Pais', 'Dia dos Pais.'),
  ideia('🐾', 'Doação de recursos para abrigos de animais'),
  ideia('🧸', 'Doação de brinquedos para crianças humildes', 'Dia das Crianças.'),
  ideia('👴', 'Doação de recursos ao asilo'),
  ideia('🎅', 'Visitação do Papai Noel e presentes para crianças de orfanato', 'Natal.'),
  // Outras ideias.
  ideia('🦷', 'Instrução de higiene oral'),
  ideia('🪥', 'Doação de kits para higiene oral'),
  ideia('🩸', 'Doação de plaquetas'),
  ideia('🌎', 'Conscientização ambiental'),
  ideia('🍲', 'Feijoada beneficente', 'Para arrecadar fundos.'),
  ideia('🍖', 'Churrasco beneficente', 'Para arrecadar fundos.'),
  ideia('🍱', 'Entrega de marmitas para moradores de rua'),
  ideia('🏪', 'Doação/levantamento de comércio local'),
  ideia('👴', 'Visitação ao asilo'),
  ideia('🐶', 'Visitação ao abrigo de animais'),
  ideia('🏠', 'Visitação ao orfanato'),
  ideia('❤️', 'Distribuição de preservativos e conscientização de doenças sexualmente transmissíveis', '', 'Irmãos da área da saúde, ou contratar alguém'),
  ideia('✂️', 'Cortar cabelo de moradores de rua', '', 'Irmão que saiba cortar cabelo, ou contratar alguém'),
  ideia('🌳', 'Plantio de árvores', '', 'A prefeitura doa as mudas'),
  ideia('🎨', 'Revitalização da cidade', 'Pintura de muro, calçada ou limpeza de praça.'),
  ideia('🎱', 'Bingo no asilo'),
];

// A agenda: a ideia de cada mes, pelo nome (indice 0 = janeiro).
export const RASCUNHO_AGENDA = RASCUNHO_IDEIAS.slice(0, 12).map((i, n) => ({
  mes: `${ANO_DO_RASCUNHO}-${String(n + 1).padStart(2, '0')}`, ideia: i.nome,
}));

export const RASCUNHO_TEXTOS = [
  { titulo: 'Arrecadação Pub', texto: `Vamos la senhores, está chegando o dia de mais um Pub da nossa divisão. Vamos curtir muito e aproveitar bem esse dia, mas também lembrar das nossas obrigações com o clube, nosso foco é, e sempre será ajudar o próximo, dito isso não vamos esquecer de levar nossa contribuição minima de 1Kg de alimento não perecível. Para algumas pessoas essa “contribuição minima” faz uma Grande diferença na vida. 💀 I.S.S.I

Almeida. VI
Social. Barra RJ4` },
  { titulo: 'Reflexivo', texto: `Nosso cargo chefe é ajudar quem precisa, as vezes focamos nas pessoas mais humildes e esquecemos dos mais próximos, um vizinho, um amigo, um familiar distante ou até mesmo um irmão INSANOS.
Uma ajuda nem sempre será monetária, as vezes um frase como “bom dia” ja tem poder de melhorar o dia de alguém.  Eae já pensaram nisso?
Juntos somos mais fortes I.S.S.I

Almeida. VI
Social. Barra RJ4` },
  { titulo: 'Motivacional', texto: `Nunca se esqueçam senhores, somos o maior Moto Clube do mundo por 1 motivo, a IRMANDADE.
Sozinhos não somos nada, Juntos fazemos a diferença, juntos mudamos o mundo. I.S.S.I

Almeida. VI
Social. Barra RJ4.` },
];
