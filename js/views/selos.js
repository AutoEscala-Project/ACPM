// Os pedidos da data aberta (a linha, o trilho, a Agenda e a Demanda leem daqui) e o selo que ainda não é da linha: o
// número de pedidos no botão de importar, na Demanda
import { $ } from '../dom.js';
import { S, DATA, isGestor, inativoNaDataAberta, stuBy } from '../state.js';
import { ApiClient } from '../storage.js';
import { redesenhar } from '../redesenho.js';

// Pedidos da agenda para a data aberta: lidos ao abrir a data e depois de mudanças na agenda. leitura: 'lendo', 'lidos' ou
// 'erro' (sem conexão: a linha diz que falhou)
let pedidosDaData = { data: null, lista: null, leitura: 'lendo' };
let leituras = 0;
let emCurso = null;

export function lerPedidosDaData() {
  const leitura = { data: DATA, vez: ++leituras };
  emCurso = leitura;
  leitura.fim = ler(leitura);
  return leitura.fim;
}

async function ler({ data, vez }) {
  let lista = null, leitura = 'lidos';
  try {
    lista = await ApiClient.agenda(data, data);
  } catch {
    leitura = 'erro';
  }
  // Outra data aberta, ou uma leitura pedida depois desta (a resposta dela é a que vale)
  if (vez !== leituras) return;
  emCurso = null;
  if (data !== DATA) return;
  pedidosDaData = { data, lista, leitura };
  redesenhar('pedidos');
}

// Os pedidos da data aberta e o estado da leitura (de outra data: ainda lendo)
export const pedidosDaDataAberta = () => (pedidosDaData.data === DATA ? pedidosDaData : { data: DATA, lista: null, leitura: 'lendo' });

// Os mesmos, depois da leitura em curso (a data que acabou de abrir, um pedido que acabou de ser registrado)
export async function pedidosDaDataAbertaLidos() {
  while (emCurso && emCurso.data === DATA) await emCurso.fim;
  if (pedidosDaDataAberta().leitura === 'lendo') await lerPedidosDaData();
  return pedidosDaDataAberta();
}

const pedidosPendentes = () => (pedidosDaDataAberta().lista || [])
  .filter(s => !s.cancelada_em && !(S.importadas || []).includes(s.id) && !inativoNaDataAberta(stuBy(s.aluno)));

// (O número dos aviões parados ou perto da revisão, que a Disponibilidade do dia de Recursos tinha, foi para os pontos das
// linhas de Recursos e para o trilho no B)
export function atualizarSelos() {
  // Na Demanda, o botão diz quantos pedidos há para importar (e só se destaca quando há). Quem consulta não importa
  const n = isGestor() ? 0 : pedidosPendentes().length;
  const botao = $('#importar-agenda');
  if (!botao) return;
  botao.textContent = n ? `Importar ${n} ${n === 1 ? 'pedido' : 'pedidos'} da agenda` : 'Importar da agenda';
  botao.classList.toggle('sec', !n);
}
