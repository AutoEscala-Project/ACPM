// Os casos do nome completo nos dados pessoais e de quem grava (a migração 20261128100000_nome_completo_nos_dados_pessoais),
// os mesmos no banco e nas três cópias das regras dele em JavaScript:
// - no banco, cada caso é uma verificação de supabase/tests/database/dados-pessoais.test.sql, com o nome do caso na
//   descrição (test/unit/espelho-do-banco.test.js confere);
// - no app, a regra pura (js/dados-pessoais.js, gravarDadosPessoais), o modo local (js/backends/local.js), o servidor falso
//   dos testes de ponta a ponta (test/e2e/falso/dados-pessoais.js) e o cliente falso de test/unit/backend-supabase.test.js
//   recebem os mesmos dados.
// Cada caso parte dos dados guardados do Caio (antes; null: nenhum) e grava os dados do caso a partir da versão lida.
// Aceito: o nome completo guardado depois (null: nenhum), se a linha fica e, quando o caso diz, a descrição do histórico.
// Recusado: o código do erro e o campo (a dica do servidor).
// As regras: sem a chave nome_completo, fica o gravado (o app de antes do passo A nunca a manda); a chave vazia apaga; o
// texto é gravado sem os espaços das pontas e com um espaço só entre as palavras; mais de 120 caracteres é recusado
// (22023, nome_completo); o histórico diz "Nome completo" primeiro; a linha sai só com os seis campos vazios.

export const ALUNO_DOS_CASOS = 1002;
// O cadastro dos casos: o nome do Caio vai para o histórico
export const CADASTRO_DOS_CASOS = Object.freeze({ esquema: 18, stu: [{ id: ALUNO_DOS_CASOS, nm: 'Caio' }], ins: [{ id: 7, nm: 'Instrutor 07' }] });
export const LIMITE_DO_NOME_COMPLETO = 120;
// A versão dos dados guardados antes de cada caso
export const VERSAO_DOS_CASOS = '2026-11-11T12:00:00.000Z';

const aceito = (nome, outros = {}) => ({ gravado: { nome_completo: nome, linha: true, ...outros } });

export const CASOS_DOS_DADOS_PESSOAIS = [
  {
    nome: 'o nome completo: o texto grava, com um espaço só entre as palavras',
    antes: null, dados: { nome_completo: '  Caio   da  Silva ', canac: '222333' }, ...aceito('Caio da Silva')
  },
  {
    nome: 'o histórico registra Nome completo',
    antes: null, dados: { nome_completo: 'Caio da Silva', canac: '222333' }, ...aceito('Caio da Silva', { historico: 'Dados pessoais de Caio atualizados: Nome completo, CANAC' })
  },
  {
    nome: 'o nome completo: sem a chave, fica o gravado',
    antes: { nome_completo: 'Caio da Silva', canac: '222333' }, dados: { canac: '222333', email: 'caio@exemplo.com' }, ...aceito('Caio da Silva')
  },
  {
    nome: 'o nome completo: a chave vazia apaga',
    antes: { nome_completo: 'Caio da Silva', canac: '222333' }, dados: { nome_completo: '', canac: '222333' }, ...aceito(null)
  },
  {
    nome: 'o nome completo: mais de 120 caracteres é recusado',
    antes: null, dados: { nome_completo: 'x'.repeat(LIMITE_DO_NOME_COMPLETO + 1) }, erro: { code: '22023', campo: 'nome_completo' }
  },
  {
    nome: 'com só o nome completo, a linha fica',
    antes: { canac: '222333' }, dados: { nome_completo: 'Caio da Silva' }, ...aceito('Caio da Silva')
  }
];

// Quem grava: operador e administrador; a secretaria lê e não grava (aluno nem instrutor); o gestor nem lê
export const QUEM_GRAVA_OS_DADOS_PESSOAIS = [
  { nome: 'operador grava os dados pessoais de um aluno', perfil: 'operador', tipo: 'aluno', id: ALUNO_DOS_CASOS, grava: true },
  { nome: 'administrador grava', perfil: 'administrador', tipo: 'instrutor', id: 7, grava: true },
  { nome: 'secretaria não grava os dados de um aluno', perfil: 'secretaria', tipo: 'aluno', id: ALUNO_DOS_CASOS, grava: false },
  { nome: 'secretaria não grava os dados de um instrutor', perfil: 'secretaria', tipo: 'instrutor', id: 7, grava: false },
  { nome: 'gestor não grava dados pessoais', perfil: 'gestor', tipo: 'aluno', id: ALUNO_DOS_CASOS, grava: false }
];

// Os dados guardados antes do caso, como a tabela do modo local e do servidor falso os têm ('aluno:1002' → campos)
export const tabelaDoCaso = caso => (caso.antes ? { [`aluno:${ALUNO_DOS_CASOS}`]: { ...caso.antes, atualizado_em: VERSAO_DOS_CASOS, atualizado_por: 'Operador' } } : {});
// A versão que o app leu antes de gravar (null: nenhum dado)
export const versaoLidaDoCaso = caso => (caso.antes ? VERSAO_DOS_CASOS : null);
