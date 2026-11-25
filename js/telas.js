// As telas do app, sem DOM: o nome de cada uma (o mesmo na navegação e no título), a etapa da linha ou o grupo dela, quem a
// vê, a tela da abertura, o endereço (#/<tela>[/<item>])
const TODOS = ['operador', 'administrador', 'gestor', 'secretaria'];
const SEM_SECRETARIA = ['operador', 'administrador', 'gestor'];

// rotulo: a palavra da navegação, igual ao título da tela. secao: a <section> da tela, quando não é 's-<id>'; item: o lugar
// que a tela abre sem item no endereço (Aprovar mostra a aprovação na Escala até ter a tela dela)
export const TELAS = {
  age: { rotulo: 'Agenda', estagio: 'pedidos', perfis: TODOS },
  dem: { rotulo: 'Demanda', estagio: 'processamento', perfis: SEM_SECRETARIA },
  esc: { rotulo: 'Escala', estagio: 'escala', perfis: TODOS },
  apr: { rotulo: 'Aprovar', estagio: 'aprovar', perfis: TODOS, secao: 's-esc', item: 'aprovacao' },
  alu: { rotulo: 'Alunos', grupo: 'cadastros', perfis: TODOS },
  ins: { rotulo: 'Instrutores', grupo: 'cadastros', perfis: TODOS },
  rec: { rotulo: 'Recursos', grupo: 'cadastros', perfis: SEM_SECRETARIA },
  cur: { rotulo: 'Cursos', grupo: 'cadastros', perfis: TODOS },
  rod: { rotulo: 'Rodízio', grupo: 'mais', perfis: SEM_SECRETARIA },
  bi: { rotulo: 'BI', grupo: 'mais', perfis: SEM_SECRETARIA },
  manual: { rotulo: 'Manual', grupo: 'topo', perfis: TODOS },
  conta: { rotulo: 'Minha conta', grupo: 'conta', perfis: TODOS, soCompartilhado: true }
};

// As quatro etapas da linha, na ordem ("etapa" já é a missão do curso)
export const ESTAGIOS = ['pedidos', 'processamento', 'escala', 'aprovar'];

// O perfil da conta; null no modo local, que vê todas as telas menos a conta (que só existe com o servidor)
export function podeVer(tela, perfil) {
  const t = Object.hasOwn(TELAS, tela) ? TELAS[tela] : null;
  if (!t) return false;
  if (perfil === null || perfil === undefined) return !t.soCompartilhado;
  return t.perfis.includes(perfil);
}

export const telaDeAbertura = perfil => (perfil === 'secretaria' ? 'age' : 'esc');

// O item do endereço: um id, uma matrícula, um lugar da tela; nunca um nome (sem espaço nem acento), até 40 caracteres
const ITEM = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/;

// '#/alu/1012' → { tela: 'alu', item: '1012' }; '#/apr' → { tela: 'apr', item: null }; o que não é uma tela → null (a volta
// do login do Supabase, por exemplo, nunca começa com '#/')
export function destinoDoEndereco(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#/')) return null;
  const partes = hash.slice(2).split('/');
  if (partes.length > 2) return null;
  const [tela, item = null] = partes;
  if (!Object.hasOwn(TELAS, tela)) return null;
  if (item !== null && !ITEM.test(item)) return null;
  return { tela, item };
}

export const enderecoDoDestino = ({ tela, item = null }) => `#/${tela}${item ? `/${item}` : ''}`;

// A linha abre com as tarefas só quando cabe numa fileira e a janela é alta o bastante
export const linhaAbertaPorPadrao = (larguraDaLinha, alturaDaJanela) => larguraDaLinha >= 1540 && alturaDaJanela >= 760;
