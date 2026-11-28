// As recusas do motor, cada uma ligada ao pedido dela. Os alertas de recusa ('err') não trazem o aluno, só o rótulo (o
// nome, e a missão nas extras), e dois alunos de mesmo nome, ou duas extras da mesma missão, têm o mesmo rótulo: o
// pedido de cada recusa vem da ordem. O motor percorre os pedidos que voam numa ordem só (js/engine.js) e recusa cada um
// no máximo uma vez; os que entram ficam com uma linha, e os fixos são conferidos à parte (ficam em conflito, não são
// recusados). Então a i-ésima recusa é a do i-ésimo pedido que voa sem pino e sem linha, na ordem do motor
import { isGroundMission } from './rules.js';
import { chaveDoVoo, pedidoDoAluno, statusDoVoo } from './voo.js';

// Os voos da escala na ordem em que o motor confere os fixos (js/engine.js): a volta do noturno de ontem, os fixos pelo
// status, pela escala aprovada e pelo instrutor escolhido, os agendados e os outros; em cada grupo, a ordem dos pedidos do
// motor (o Ground antes, o instrutor escolhido, a prioridade, a agenda, o cadastro e a missão; o "Priorizar com" não
// entra: ele escolhe o instrutor, não o horário). A turma de Ground ocupa a sala e o instrutor pelo primeiro aluno dela
// que o motor confere (js/candidatos.js)
export function naOrdemDoMotor(estado, out) {
  const fixos = estado.fixos || {};
  const alunos = new Map(estado.stu.map((s, i) => [s.id, { s, i }]));
  const noCadastro = new Set(estado.ins.map(x => x.id));
  const chave = o => {
    const { s, i } = alunos.get(o.stuId) || {};
    const ref = s && !o.trecho ? pedidoDoAluno(s, o.mid || 0) : null;
    if (!ref) return [o.trecho ? 0 : 4];
    const pino = fixos[o.fKey];
    return [
      !pino ? 3 : pino.agendado ? 2 : 1, isGroundMission(ref.mis) ? 0 : 1, ref.insId && noCadastro.has(ref.insId) ? 0 : 1, -(ref.pr || 3),
      Number.isInteger(ref.solicitacao) ? ref.solicitacao : Infinity, i,
      o.mid ? (s.extra || []).findIndex(ex => ex.mid === o.mid) + 1 : 0
    ];
  };
  const comparar = (p, q) => {
    for (let k = 0; k < Math.max(p.length, q.length); k++) {
      const x = p[k] ?? 0, y = q[k] ?? 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
  return out.map((o, k) => ({ o, k, c: chave(o) })).sort((p, q) => comparar(p.c, q.c) || p.k - q.k).map(p => p.o);
}

// Os pedidos que voam no estado (o principal e as extras com fly), como as chaves dos voos que eles seriam
function pedidosQueVoam(estado) {
  const pedidos = [];
  for (const s of estado.stu || []) {
    if (s.fly) pedidos.push({ stuId: s.id, mid: 0, fKey: chaveDoVoo(s.id, 0) });
    for (const ex of Array.isArray(s.extra) ? s.extra : []) if (ex.fly) pedidos.push({ stuId: s.id, mid: ex.mid, fKey: chaveDoVoo(s.id, ex.mid) });
  }
  return pedidos;
}

// A recusa de cada pedido recusado: um Map da chave do voo (aluno_missão_1) para o alerta 'err' do motor. estado: o que o
// motor leu (o da escala, js/state.js estadoDaEscala); resultado: o que ele devolveu. Sem recusas (ou numa escala gravada
// que não bate mais com os pedidos, quando há mais recusas que pedidos sem linha), as que sobram ficam sem pedido
export function rejeicoesDosPedidos(estado, resultado) {
  const mapa = new Map();
  if (!estado || !resultado) return mapa;
  const recusas = (resultado.al || []).filter(a => a.t === 'err');
  if (!recusas.length) return mapa;
  const fixos = estado.fixos || {};
  const comLinha = new Set((resultado.out || []).map(o => o.fKey));
  const semLugar = pedidosQueVoam(estado).filter(p => !Object.hasOwn(fixos, p.fKey) && !comLinha.has(p.fKey));
  naOrdemDoMotor(estado, semLugar).forEach((p, i) => { if (recusas[i]) mapa.set(p.fKey, recusas[i]); });
  return mapa;
}

// O 1º da lista de espera do horário que o voo do pedido da agenda cancelado deixa (F1h, N14; o aviso das novidades dos
// pedidos, D3), como a escala diz (a espera das recusas dela, também depois de recarregar ou noutro computador): o voo do
// registro que leva o pedido (o principal do aluno ou uma missão extra, com solicitacao = o id, voando), na escala e sem o
// status Cancelado (cancelado, ele já não ocupa nada), e a recusa que espera no minuto dele com o menor lugar. estado: o
// que o motor leu (js/state.js, estadoDaEscala); resultado: a escala. naoEspera: o pedido (o id) que não espera mais (o
// cancelado ou sem aprovação na lista lida agora, com a escala ainda não refeita): quem espera por ele não é o 1º, o
// seguinte da lista é; o que espera sem pedido (posto à mão na Demanda) espera. { minuto, aluno } (o nome) ou null: sem
// voo, sem ninguém esperando nesse minuto, ou a escala sem a espera (a de antes do F1h)
export function primeiroDaListaDeEspera(solicitacao, estado, resultado, { naoEspera = () => false } = {}) {
  if (!estado || !resultado || !Array.isArray(resultado.out)) return null;
  const doAluno = (estado.stu || []).find(x => x.id === solicitacao.aluno);
  const registro = doAluno && [doAluno, ...(doAluno.extra || [])].find(p => p && p.solicitacao === solicitacao.id);
  if (!registro || !registro.fly) return null;
  const fKey = chaveDoVoo(doAluno.id, registro === doAluno ? 0 : registro.mid);
  const voo = resultado.out.find(o => o.fKey === fKey && !o.trecho);
  if (!voo || statusDoVoo(voo, estado.fStatus) === 'Cancelado') return null;
  // O aluno e o registro da chave do voo de quem espera (aluno_missão_1)
  const deQuemEspera = chave => {
    const [id, mid] = chave.split('_').map(Number);
    const aluno = (estado.stu || []).find(x => x.id === id);
    return { aluno, registro: aluno && pedidoDoAluno(aluno, mid) };
  };
  const espera = ([chave, a]) => {
    if (!a.espera || a.espera.minuto !== voo.a) return false;
    const { registro } = deQuemEspera(chave);
    return !(registro && registro.solicitacao != null && naoEspera(registro.solicitacao));
  };
  const primeiro = [...rejeicoesDosPedidos(estado, resultado)].filter(espera).sort((p, q) => p[1].espera.lugar - q[1].espera.lugar)[0];
  if (!primeiro) return null;
  // O nome do aluno; sem ele no estado, o rótulo da recusa
  const [chave, recusa] = primeiro;
  const { aluno } = deQuemEspera(chave);
  return { minuto: voo.a, aluno: aluno ? aluno.nm : recusa.s };
}
