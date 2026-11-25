// O inativo no cadastro (formato 26): um aluno, um instrutor ou um recurso com inativo: true (sem o campo, ativo). Vale na
// data aberta quando ela é hoje ou depois; uma data passada é vista como se ninguém estivesse inativo (ela não é refeita
// com o cadastro de hoje). Funções puras: quem escala lê o estado derivado (estadoParaEscalar), nunca gravado; as listas
// de escolha leem os ativos da data (ativosNaData); a Escala avisa dos voos de quem ficou inativo (voosComInativos)

export const inativo = item => Boolean(item) && typeof item === 'object' && item.inativo === true;

// O inativo vale na data: hoje ou depois (datas AAAA-MM-DD comparadas como texto)
export const inativoValeEm = (data, hoje) => typeof data === 'string' && typeof hoje === 'string' && data >= hoje;

// A lista sem os inativos, na data em que o inativo vale; senão, a lista como está
export const ativosNaData = (lista, data, hoje) => (Array.isArray(lista) && inativoValeEm(data, hoje) ? lista.filter(x => !inativo(x)) : lista);

// O estado que o motor, a simulação do agendamento e as listas da escala leem: na data em que o inativo vale, o instrutor
// inativo está lá sem vir (on: false), o recurso inativo indisponível (av: false) e nenhum "Priorizar com" cita um instrutor
// inativo. Os voos fixos com eles continuam (em conflito, com as Sugestões); os pedidos do aluno inativo também (a Escala
// avisa). Sem inativos, ou numa data passada, devolve o próprio estado
export function estadoParaEscalar(estado, { data, hoje }) {
  if (!estado || !inativoValeEm(data, hoje)) return estado;
  const ins = Array.isArray(estado.ins) ? estado.ins : [];
  const frota = Array.isArray(estado.frota) ? estado.frota : [];
  const instrutoresInativos = new Set(ins.filter(inativo).map(x => x.id));
  const recursosInativos = frota.filter(inativo).map(f => f.reg);
  if (!instrutoresInativos.size && !recursosInativos.length) return estado;
  return {
    ...estado,
    ins: ins.map(x => (instrutoresInativos.has(x.id) ? { ...x, on: false } : x)),
    av: { ...(estado.av || {}), ...Object.fromEntries(recursosInativos.map(reg => [reg, false])) },
    stu: (Array.isArray(estado.stu) ? estado.stu : []).map(s => {
      if (!Array.isArray(s.voaCom) || !s.voaCom.some(id => instrutoresInativos.has(id))) return s;
      const voaCom = s.voaCom.filter(id => !instrutoresInativos.has(id));
      const { voaCom: _, ...resto } = s;
      return voaCom.length ? { ...resto, voaCom } : resto;
    })
  };
}

// Os voos da escala da tela com um aluno, um instrutor ou um recurso inativo, na data em que o inativo vale: um item por
// pessoa ou recurso, com quantos voos (sem os cancelados). Ordem: instrutores, recursos, alunos, cada grupo pelo nome
export function voosComInativos(estado, resultado, { data, hoje }) {
  if (!estado || !resultado || !Array.isArray(resultado.out) || !inativoValeEm(data, hoje)) return [];
  const status = estado.fStatus || {};
  const voos = resultado.out.filter(o => (status[o.fKey] || o.status) !== 'Cancelado');
  const contar = (lista, chave, deVoo, tipo, nome) => lista.filter(inativo).map(item => {
    const n = voos.filter(o => deVoo(o) === item[chave]).length;
    return n ? { tipo, id: item[chave], nome: nome(item), voos: n } : null;
  }).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [
    ...contar(estado.ins || [], 'id', o => o.insId, 'instrutor', x => x.nm),
    ...contar(estado.frota || [], 'reg', o => o.r, 'recurso', f => f.reg),
    ...contar(estado.stu || [], 'id', o => o.stuId, 'aluno', s => s.nm)
  ];
}

// O texto de um item: "2 voos com Instrutor 02 (inativo) na escala desta data"
export const textoDoVooComInativo = ({ tipo, nome, voos }) =>
  `${voos} ${voos === 1 ? 'voo' : 'voos'} com ${tipo === 'aluno' ? 'o aluno ' : ''}${nome} (inativo) na escala desta data`;
