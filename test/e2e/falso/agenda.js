// A agenda do servidor falso (test/e2e/supabase-falso.js): a tabela solicitacoes e as funções registrar_solicitacao e
// cancelar_solicitacao, com as regras do banco (o prazo, a exceção da coordenação, a duração e o limite de voos locais
// no horário). O roteador lê a tabela (GET /rest/v1/solicitacoes) e manda as duas funções para cá
import { prazoDaAgendaPermite } from '../../../js/agenda.js';

export const FUNCOES_DA_AGENDA = ['registrar_solicitacao', 'cancelar_solicitacao'];

// agora: o relógio do servidor para o prazo da agenda. atender devolve [status, corpo] (corpo undefined: sem corpo)
export function criarAgenda({ agora }) {
  const solicitacoes = [];

  function atender(funcao, args, conta) {
    // Agenda: secretaria e operadores registram; fora do prazo, só operadores pela exceção da coordenação
    if (!conta || !['secretaria', 'operador', 'administrador'].includes(conta.perfil)) return [403, { code: '42501', message: 'sem permissão na agenda' }];
    if (funcao === 'cancelar_solicitacao') {
      const s = solicitacoes.find(x => x.id === args.p_id && !x.cancelada_em);
      if (!s) return [404, { code: 'P0002', message: 'pedido não encontrado' }];
      Object.assign(s, { cancelada_em: agora.toISOString(), cancelada_por: args.p_cancelada_por.trim() });
      return [204];
    }
    // A função com a duração (p_horas): só horário específico e duração de 0,1 a 5 h
    let horas = null;
    if (Object.hasOwn(args, 'p_horas')) {
      if (args.p_janela !== 'horario' || !args.p_horario) return [400, { code: '22023', message: 'o pedido é num horário específico' }];
      horas = String(args.p_missao).startsWith('Ground') ? 1.5 : Math.round(+args.p_horas * 10) / 10;
      if (!(horas > 0 && horas <= 5)) return [400, { code: '22023', message: 'a duração vai de 0,1 h a 5 h' }];
    }
    // No máximo 6 voos locais no mesmo horário
    const locais = ['Voo Local', 'Voo Solo', 'TGL (TMA)'];
    if (Object.hasOwn(args, 'p_horas') && locais.includes(args.p_missao)
        && solicitacoes.filter(s => s.data === args.p_data && !s.cancelada_em && s.horario === args.p_horario && locais.includes(s.missao)).length >= 6) {
      return [400, { code: 'PT422', message: 'já há 6 voos locais no horário', hint: 'locais' }];
    }
    const noPrazo = prazoDaAgendaPermite(args.p_data, agora);
    if (!noPrazo && !args.p_excecao) return [403, { code: 'PT403', message: 'prazo encerrado' }];
    if (!noPrazo && !['operador', 'administrador'].includes(conta.perfil)) return [403, { code: '42501', message: 'exceção só para operadores' }];
    const id = solicitacoes.length + 1;
    solicitacoes.push({
      id, data: args.p_data, aluno: args.p_aluno, aluno_nome: args.p_aluno_nome.trim(), missao: args.p_missao, janela: args.p_janela,
      horario: args.p_horario, horas, observacao: (args.p_observacao || '').trim() || null, registrado_por: args.p_registrado_por.trim(),
      registrado_em: agora.toISOString(), usuario: conta.id, conta: conta.nome, excecao: !noPrazo, cancelada_em: null, cancelada_por: null
    });
    return [200, id];
  }

  return { solicitacoes, atender };
}
