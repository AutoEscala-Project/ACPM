// Os casos da aprovação dos pedidos da agenda (a migração 20261129100000_aprovacao_dos_pedidos, o passo D1), os mesmos no
// banco e nas cópias das regras dele em JavaScript:
// - no banco, cada caso é uma verificação de supabase/tests/database/agenda-aprovacao.test.sql (ou de
//   agenda-preferencias.test.sql), com o nome do caso na descrição (test/unit/espelho-do-banco.test.js confere);
// - no app, o servidor falso dos testes de ponta a ponta (test/e2e/falso/agenda.js) roda todos os casos, e o modo local
//   (js/backends/local.js), que não tem contas (quem usa tem os direitos de operador), os que só operadores e
//   administradores fazem (paraOModoLocal).
// Cada caso parte dos pedidos existentes (gravados direto na tabela, como o banco os teria: uma data que já passou não
// recebe pedido novo) e faz os passos em ordem, cada um por uma conta (como); o passo recusado diz o código e o campo (a
// dica do servidor; null: sem dica). No fim, a situação de cada pedido (fica) e, quando o caso diz, quem aprovou (o perfil
// da conta).
// As regras que os casos fixam:
// - registrar: a secretaria registra o pedido que aguarda; aprovar ao registrar é dos operadores (42501, aprovar); a
//   exceção da coordenação (só dos operadores: 42501, excecao) registra o pedido já aprovado; o domingo (PT403, domingo)
//   e a data que já passou (PT403, passada) são recusados antes do prazo (PT403, prazo), mesmo pela exceção; o limite de
//   voos locais conta os pedidos que aguardam e os aprovados;
// - aprovar: só os operadores (42501, aprovar), de 1 a 200 ids (22023, ids); a resposta são os ids aprovados agora, em
//   ordem: o já aprovado, o cancelado, o de uma data que já passou e o id que não existe ficam fora; quem aprovou primeiro
//   fica;
// - retirar a aprovação: só os operadores (42501, aprovar); o pedido sem aprovação ou cancelado não tem o que retirar
//   (P0002); a de uma data que já passou fica (PT403, passada); a próxima aprovação apaga a retirada;
// - cancelar: a secretaria e os operadores, o que aguarda e o aprovado; o aprovado de uma data que já passou, não (PT403,
//   passada);
// - contar: por data, os que aguardam e os aprovados, sem os cancelados e sem as datas sem pedidos; quem lê a agenda (o
//   gestor e a secretaria também) recebe a contagem, a conta sem perfil recebe {}.
import { pedidoDosCasos } from './casos-da-agenda.js';

// O relógio dos casos (o das páginas dos testes: uma terça, 10/11/2026, ao meio-dia em São Paulo) e as datas deles
export const AGORA_DOS_CASOS = '2026-11-10T12:00:00-03:00';
export const DATAS_DOS_CASOS = Object.freeze({
  aberta: '2026-11-16',   // no prazo (a segunda: até sábado às 10:00)
  fechada: '2026-11-10',  // hoje: fora do prazo, mas não passou
  passada: '2026-11-09',
  domingo: '2026-11-15'
});
// O id que não existe
export const ID_QUE_NAO_EXISTE = 999999;

// O pedido de um passo "registrar" (o que o app manda), na data do caso
export const pedidoDoPasso = (registrar, aluno) => pedidoDosCasos({ aluno, aluno_nome: `Aluno ${aluno}`, ...registrar, data: DATAS_DOS_CASOS[registrar.data] });

// A linha de um pedido existente, como a tabela a guarda (as datas e quem, no relógio dos casos)
export function linhaDoCaso({ data, aprovada = false, cancelada = false, missao = 'Navegação', horario = '08:20', aluno = 1000 }, id) {
  const em = new Date(AGORA_DOS_CASOS).toISOString();
  return {
    id, data: DATAS_DOS_CASOS[data], aluno, aluno_nome: `Aluno ${aluno}`, missao, janela: 'horario', horario, horario2: null, horas: 1,
    recurso: 'C152', missao_do_curso: null, observacao: null, registrado_por: 'Maria', registrado_em: em, usuario: null, conta: null,
    excecao: false, limite_confirmado_por: null, limite_confirmado_em: null,
    aprovada_em: aprovada ? em : null, aprovada_por: aprovada ? 'Operador de teste' : null, aprovada_usuario: null,
    aprovacao_retirada_em: null, aprovacao_retirada_por: null, aprovacao_retirada_usuario: null,
    cancelada_em: cancelada ? em : null, cancelada_por: cancelada ? 'Maria' : null, cancelada_usuario: null
  };
}

// A situação de um pedido (as três do D2, e a aprovação retirada, que volta a aguardar com o rastro)
export const situacaoDoCaso = s => (s.cancelada_em ? 'cancelada' : s.aprovada_em ? 'aprovada' : s.aprovacao_retirada_em ? 'retirada' : 'aguardando');

// Os casos que o modo local faz: ele não tem contas, e quem usa tem os direitos de operador
export const paraOModoLocal = caso => caso.passos.every(p => ['operador', 'administrador'].includes(p.como));

const recusa = (code, campo = null) => ({ erro: { code, campo } });
const aguardando = (n, ...chaves) => Array.from({ length: n }, (_, i) => ({ chave: chaves[i] || `l${i}`, data: 'aberta', missao: 'Voo Local' }));

export const CASOS_DAS_SOLICITACOES = [
  // Registrar
  { nome: 'a secretaria registra: o pedido fica aguardando aprovação', passos: [{ como: 'secretaria', registrar: { data: 'aberta' }, chave: 'n' }], fica: { n: 'aguardando' } },
  { nome: 'a secretaria não registra já aprovado', passos: [{ como: 'secretaria', registrar: { data: 'aberta', aprovar: true }, ...recusa('42501', 'aprovar') }], fica: {} },
  { nome: 'o operador registra e aprova de uma vez', passos: [{ como: 'operador', registrar: { data: 'aberta', aprovar: true }, chave: 'n' }], fica: { n: 'aprovada' }, aprovadaPor: { n: 'operador' } },
  { nome: 'o operador registra sem aprovar: o pedido aguarda', passos: [{ como: 'operador', registrar: { data: 'aberta' }, chave: 'n' }], fica: { n: 'aguardando' } },
  {
    nome: 'pela exceção da coordenação, o pedido nasce aprovado mesmo sem pedir',
    passos: [{ como: 'operador', registrar: { data: 'fechada', excecao: true }, chave: 'n' }], fica: { n: 'aprovada' }, aprovadaPor: { n: 'operador' }
  },
  { nome: 'a exceção não registra num domingo', passos: [{ como: 'operador', registrar: { data: 'domingo', excecao: true }, ...recusa('PT403', 'domingo') }], fica: {} },
  { nome: 'a exceção não registra numa data que já passou', passos: [{ como: 'operador', registrar: { data: 'passada', excecao: true }, ...recusa('PT403', 'passada') }], fica: {} },
  { nome: 'fora do prazo, sem a exceção: recusado (prazo)', passos: [{ como: 'secretaria', registrar: { data: 'fechada' }, ...recusa('PT403', 'prazo') }], fica: {} },
  { nome: 'a secretaria não usa a exceção da coordenação', passos: [{ como: 'secretaria', registrar: { data: 'fechada', excecao: true }, ...recusa('42501', 'excecao') }], fica: {} },
  {
    nome: 'o limite conta os pedidos que aguardam e os aprovados',
    existentes: [...aguardando(3), ...aguardando(3, 'a0', 'a1', 'a2').map(e => ({ ...e, aprovada: true }))],
    passos: [{ como: 'secretaria', registrar: { data: 'aberta', missao: 'Voo Local' }, ...recusa('PT422', 'locais') }], fica: {}
  },
  // Aprovar
  {
    nome: 'o operador aprova os pedidos da lista', existentes: [{ chave: 'a', data: 'aberta' }, { chave: 'b', data: 'aberta' }],
    passos: [{ como: 'operador', aprovar: ['b', 'a'], devolve: ['a', 'b'] }], fica: { a: 'aprovada', b: 'aprovada' }, aprovadaPor: { a: 'operador', b: 'operador' }
  },
  {
    nome: 'aprovar de novo não muda nada e guarda quem aprovou primeiro', existentes: [{ chave: 'a', data: 'aberta' }],
    passos: [{ como: 'administrador', aprovar: ['a'], devolve: ['a'] }, { como: 'operador', aprovar: ['a'], devolve: [] }],
    fica: { a: 'aprovada' }, aprovadaPor: { a: 'administrador' }
  },
  {
    nome: 'o cancelado, o de uma data que já passou e o id que não existe ficam fora da resposta',
    existentes: [{ chave: 'c', data: 'aberta', cancelada: true }, { chave: 'p', data: 'passada' }, { chave: 'a', data: 'aberta' }],
    passos: [{ como: 'operador', aprovar: ['c', 'p', 'a', 'x'], devolve: ['a'] }], fica: { c: 'cancelada', p: 'aguardando', a: 'aprovada' }
  },
  { nome: 'a secretaria não aprova', existentes: [{ chave: 'a', data: 'aberta' }], passos: [{ como: 'secretaria', aprovar: ['a'], ...recusa('42501', 'aprovar') }], fica: { a: 'aguardando' } },
  { nome: 'o gestor não aprova', existentes: [{ chave: 'a', data: 'aberta' }], passos: [{ como: 'gestor', aprovar: ['a'], ...recusa('42501', 'aprovar') }], fica: { a: 'aguardando' } },
  { nome: 'conta sem perfil não aprova', existentes: [{ chave: 'a', data: 'aberta' }], passos: [{ como: 'semPerfil', aprovar: ['a'], ...recusa('42501', 'aprovar') }], fica: { a: 'aguardando' } },
  { nome: 'aprovar uma lista vazia: recusado (ids)', passos: [{ como: 'operador', aprovar: [], ...recusa('22023', 'ids') }], fica: {} },
  { nome: 'aprovar mais de 200 de uma vez: recusado (ids)', passos: [{ como: 'operador', aprovar: Array.from({ length: 201 }, () => 'x'), ...recusa('22023', 'ids') }], fica: {} },
  // Retirar a aprovação
  {
    nome: 'o operador retira a aprovação: o pedido volta a aguardar', existentes: [{ chave: 'a', data: 'aberta', aprovada: true }],
    passos: [{ como: 'operador', retirar: 'a' }], fica: { a: 'retirada' }
  },
  {
    nome: 'aprovar de novo apaga a retirada', existentes: [{ chave: 'a', data: 'aberta', aprovada: true }],
    passos: [{ como: 'operador', retirar: 'a' }, { como: 'administrador', aprovar: ['a'], devolve: ['a'] }], fica: { a: 'aprovada' }, aprovadaPor: { a: 'administrador' }
  },
  { nome: 'retirar a aprovação do pedido que aguarda: recusado', existentes: [{ chave: 'a', data: 'aberta' }], passos: [{ como: 'operador', retirar: 'a', ...recusa('P0002') }], fica: { a: 'aguardando' } },
  {
    nome: 'retirar a aprovação do pedido cancelado: recusado', existentes: [{ chave: 'c', data: 'aberta', aprovada: true, cancelada: true }],
    passos: [{ como: 'operador', retirar: 'c', ...recusa('P0002') }], fica: { c: 'cancelada' }
  },
  {
    nome: 'a aprovação de uma data que já passou não é retirada', existentes: [{ chave: 'p', data: 'passada', aprovada: true }],
    passos: [{ como: 'operador', retirar: 'p', ...recusa('PT403', 'passada') }], fica: { p: 'aprovada' }
  },
  {
    nome: 'a secretaria não retira a aprovação', existentes: [{ chave: 'a', data: 'aberta', aprovada: true }],
    passos: [{ como: 'secretaria', retirar: 'a', ...recusa('42501', 'aprovar') }], fica: { a: 'aprovada' }
  },
  // Cancelar
  { nome: 'a secretaria cancela o pedido que aguarda', existentes: [{ chave: 'a', data: 'aberta' }], passos: [{ como: 'secretaria', cancelar: 'a' }], fica: { a: 'cancelada' } },
  { nome: 'a secretaria cancela o pedido aprovado', existentes: [{ chave: 'a', data: 'aberta', aprovada: true }], passos: [{ como: 'secretaria', cancelar: 'a' }], fica: { a: 'cancelada' } },
  { nome: 'o operador cancela o pedido aprovado', existentes: [{ chave: 'a', data: 'aberta', aprovada: true }], passos: [{ como: 'operador', cancelar: 'a' }], fica: { a: 'cancelada' } },
  {
    nome: 'o pedido aprovado de uma data que já passou não é cancelado', existentes: [{ chave: 'p', data: 'passada', aprovada: true }],
    passos: [{ como: 'operador', cancelar: 'p', ...recusa('PT403', 'passada') }], fica: { p: 'aprovada' }
  },
  { nome: 'o que aguarda numa data que já passou é cancelado', existentes: [{ chave: 'p', data: 'passada' }], passos: [{ como: 'operador', cancelar: 'p' }], fica: { p: 'cancelada' } },
  // Contar
  {
    nome: 'os pedidos por dia: aguardando e aprovados, sem os cancelados',
    existentes: [{ chave: 'a', data: 'aberta' }, { chave: 'b', data: 'aberta', aprovada: true }, { chave: 'c', data: 'aberta', cancelada: true }, { chave: 'd', data: 'fechada', aprovada: true }],
    passos: [{ como: 'operador', contar: ['fechada', 'aberta'], devolve: { fechada: { aguardando: 0, aprovadas: 1 }, aberta: { aguardando: 1, aprovadas: 1 } } }], fica: {}
  },
  {
    nome: 'um dia só com pedidos cancelados não aparece na contagem', existentes: [{ chave: 'a', data: 'aberta' }, { chave: 'c', data: 'fechada', cancelada: true }],
    passos: [{ como: 'operador', contar: ['fechada', 'fechada'], devolve: {} }], fica: {}
  },
  {
    nome: 'o gestor e a secretaria leem a contagem', existentes: [{ chave: 'a', data: 'aberta' }],
    passos: ['gestor', 'secretaria'].map(como => ({ como, contar: ['aberta', 'aberta'], devolve: { aberta: { aguardando: 1, aprovadas: 0 } } })), fica: {}
  },
  {
    nome: 'conta sem perfil recebe a contagem vazia', existentes: [{ chave: 'a', data: 'aberta' }],
    passos: [{ como: 'semPerfil', contar: ['aberta', 'aberta'], devolve: {} }], fica: {}
  }
];
