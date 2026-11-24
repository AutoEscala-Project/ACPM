// Os cliques nos botões com data-act e as mudanças nos campos das tabelas (data-f, data-a) passam por aqui: cada aba
// registra o que faz com eles (js/eventos/), e quem só consulta não muda nada, nem quem muda antes de a escala abrir
import { aindaNaoAbriu } from '../actions.js';
import { redesenhar } from '../redesenho.js';
import { isGestor } from '../state.js';

const acoes = new Map();
// Uma ação de botão (data-act). Ela recebe o botão, o id e a missão (mid) da linha da tabela (data-k) ou do próprio
// botão. confereAPermissao: a ação confere quem pode por conta própria (cancelar um pedido da agenda, excluir uma conta),
// e quem só consulta também chega a ela
export function aoAcionar(nomes, fazer, { confereAPermissao = false } = {}) {
  for (const nome of [].concat(nomes)) acoes.set(nome, { fazer, confereAPermissao });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const acao = acoes.get(b.dataset.act);
  if (!acao) return;
  if (!acao.confereAPermissao && (isGestor() || aindaNaoAbriu())) { e.preventDefault(); return; }
  const c = b.closest('[data-k]'), id = c ? +c.dataset.id : +b.dataset.id || 0;
  const mid = b.dataset.mid !== undefined ? +b.dataset.mid : (c && c.dataset.mid !== undefined ? +c.dataset.mid : 0);
  acao.fazer(b, { id, mid });
});

const campos = new Map();
// A mudança num campo: o campo avulso (data-a: 'win', 'av' e 'horas'), o status do voo ('fstatus') ou a linha da tabela
// (data-k: 'i' instrutor, 's' aluno, 'd' pedido da demanda)
export function aoMudarCampo(tipo, mudar) {
  campos.set(tipo, mudar);
}

document.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f, a = t.dataset.a;
  if (!a && !f) return;
  // Quem só consulta não muda nada, nem antes de a escala abrir: a tela volta a mostrar os dados
  if (isGestor() || aindaNaoAbriu()) {
    e.preventDefault();
    redesenhar('consulta');
    return;
  }
  if (f === 'fstatus') { campos.get('fstatus')(t); return; }
  if (a) { if (campos.has(a)) campos.get(a)(t); return; }
  const c = t.closest('[data-k]');
  if (!c || !campos.has(c.dataset.k)) return;
  campos.get(c.dataset.k)(t, { f, c, id: +c.dataset.id, mid: c.dataset.mid !== undefined ? +c.dataset.mid : 0 });
});
