// Estado da aplicação compartilhado entre os módulos. As variáveis são ligações vivas (ES modules):
// leia-as diretamente e use os setters para substituí-las.
import { ApiClient } from './storage.js';
import { pedidoDoAluno } from './voo.js';
import { hojeISO } from './format.js';
import { ligada } from './funcionalidades.js';
import { estadoParaEscalar, inativo, inativoValeEm } from './inativos.js';
import { comAPrioridadePadrao } from './rules.js';
import { runAllocationEngine, semAPrioridadeNosMotivos } from './engine.js';
import { comExigenciasDasMissoes } from './programa.js';
import { comLimitacoesDaData } from './limitacoes.js';

export let S = ApiClient.createFreshState();
export let RES = null;
export let AUDIT_LOG = [];
export let BI_HISTORY = {};
export let TL_MODE = 'eq'; // visão da escala: 'eq' (por recurso, a que abre), 'ins' (por instrutor), 'lista' ou 'painel' (o quadro do dia)
// O mapa abre com os recursos (ou os instrutores) nas colunas e as horas descendo nas linhas; Inverter eixo X:Y liga isto:
// as horas nas colunas e um recurso (ou instrutor) por linha. Vale até recarregar a página (não fica guardado)
export let HORAS_NAS_COLUNAS = false;
export let OCULTAR_INDISPONIVEIS = false; // no mapa Por recurso, sem os recursos indisponíveis na data que não têm voo (as colunas ou, com Inverter eixo X:Y, as linhas)
// Data (AAAA-MM-DD) da escala aberta na tela. O campo de data pode já mostrar outra enquanto ela carrega
// (ou ficar vazio): as alterações vão sempre para esta data
export let DATA = '';

export const setS = v => { S = v; };
export const setRES = v => { RES = v; };
export const setAuditLog = v => { AUDIT_LOG = v; };
export const setBIHistory = v => { BI_HISTORY = v; };
export const setTLMode = v => { TL_MODE = v; };
export const setHorasNasColunas = v => { HORAS_NAS_COLUNAS = Boolean(v); };
export const setOcultarIndisponiveis = v => { OCULTAR_INDISPONIVEIS = Boolean(v); };
export const setData = v => { DATA = v; };

// O que não foi lido ao abrir a data: 'horas' (dos instrutores), 'resultados' (dos cursos), 'cursos' (os programas, das
// tabelas dos cursos) e 'cursos-pendentes' (os programas que ainda estão no cadastro, esperando a conversão)
export const dadoIndisponivel = parte => Boolean(S.indisponiveis && S.indisponiveis.includes(parte));
export const isGestor = () => ApiClient.readOnly || document.body.getAttribute('data-role') === 'gestor';
// No site publicado os dados ficam no servidor (Supabase), com login; em localhost, só neste navegador
export const modoCompartilhado = () => document.body.dataset.backend === 'supabase';

// Os voos da escala desta data que voam: o cancelado não conta nos contadores das abas
export const voosQueVoam = () => ((RES && RES.out) || []).filter(o => ((S.fStatus || {})[o.fKey] || o.status) !== 'Cancelado');

export const insBy = id => S.ins.find(x => x.id === id);
export const stuBy = id => S.stu.find(x => x.id === id);

// Utilitário para acessar missão principal (mid = 0) ou missão extra (mid > 0) de um aluno
export function getMissionTarget(stuId, mid = 0) {
  const s = stuBy(stuId);
  return s ? pedidoDoAluno(s, mid) || null : null;
}

// O estado que a escala da data aberta lê (o motor, a simulação do agendamento, as listas da Escala, da Demanda e das
// Sugestões): de hoje em diante, sem os inativos do cadastro (js/inativos.js); com o hangar desligado
// (js/funcionalidades.js), sem a ordem guardada (hangar: null é a ordem da frota), que continua em S. Também numa data
// passada: a ordem guardada passa de uma data para a outra mesmo desligada, e com ela a data feita na ordem da frota
// mudaria de aviões ao ser alterada no dia seguinte. Cada pedido com a missão do curso leva o que ela exige do INVA
// (exige, de S.programa, também com o progresso desligado; sem os programas lidos, nada: habilitacoesNaoConferidas).
// Com a prioridade desligada, todos os pedidos na prioridade padrão (js/rules.js, comAPrioridadePadrao): valem a ordem dos
// agendamentos e a do cadastro, e a guardada continua em S. As limitações do aluno com horários de alguns dias da semana
// (L) chegam com os horários da data aberta (js/limitacoes.js, comLimitacoesDaData). Nunca é gravado: quem muda os dados
// muda S. base: o dia de onde ele sai (S; a conciliação passa uma cópia de S com a escala de antes fixa, para a vez da
// lista de espera: js/processamento.js, vezDaListaDeEspera)
export function estadoDaEscala(base = S) {
  const estado = comLimitacoesDaData(comExigenciasDasMissoes(estadoParaEscalar(base, { data: DATA, hoje: hojeISO() }), programaLido()), DATA);
  const comHangar = ligada('hangar') ? estado : { ...estado, hangar: null };
  return ligada('prioridade') ? comHangar : comAPrioridadePadrao(comHangar);
}
// O resultado do motor (a escala da data, a gravada e a da simulação do agendamento) como a tela o mostra: com a prioridade
// desligada, o motivo do avião ocupado não fala dela (js/engine.js, semAPrioridadeNosMotivos)
export const comOsMotivosDaTela = resultado => (ligada('prioridade') ? resultado : semAPrioridadeNosMotivos(resultado));
// O motor das telas, com os motivos da tela: a escala calculada da data, a prévia do agendamento, as Sugestões e o motor
// que a escala aprovada pede para o pedido que entra no dia sem lugar (R5, js/edicao-do-voo.js, escalaDaAlteracao)
export const escalaDoMotor = estado => comOsMotivosDaTela(runAllocationEngine(estado));
// Os programas dos cursos lidos (null quando a leitura falhou ou eles ainda esperam a conversão do cadastro)
export const programaLido = () => (dadoIndisponivel('cursos') || dadoIndisponivel('cursos-pendentes') ? null : S.programa || null);
// Sem os programas lidos, o que as missões do curso dos pedidos que voam exigem do INVA não foi conferido: quantos
// pedidos com missão do curso (o aviso da Escala)
export function habilitacoesNaoConferidas() {
  if (programaLido()) return 0;
  return S.stu.flatMap(s => [s, ...(Array.isArray(s.extra) ? s.extra : [])]).filter(d => d && d.fly && typeof d.etapa === 'string').length;
}
// O aluno, o instrutor ou o recurso inativo no cadastro, na data aberta (de hoje em diante)
export const inativoNaDataAberta = item => inativo(item) && inativoValeEm(DATA, hojeISO());
