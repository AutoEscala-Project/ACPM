// O trilho: o calendário (um clique, Enter ou Espaço abre a data; as setas, Home, End, PageUp e PageDown andam pela grade),
// as setas do mês e os dois botões que recolhem: o do trilho (ao lado da tela, uma faixa estreita com a data e o número de
// avisos; em cima dela, abaixo de 1024 px, uma linha) e o dos avisos da data. Os dois ficam guardados neste navegador
// (acpm_trilho). É o único que troca a data depois da abertura (carregarData). Os desenhos: o nome da data no alto do
// trilho, o mês da data aberta, o calendário com os avisos da data e os pedidos de cada dia
import { carregarData, dadosLidos } from '../actions.js';
import { ehDomingo } from '../agenda.js';
import { $, showToast, anunciar } from '../dom.js';
import { dataIsoValida, hojeISO, rotuloDaData } from '../format.js';
import { diaDaTecla, somarMeses } from '../calendario.js';
import { DATA } from '../state.js';
import { lerPreferencias } from '../telas.js';
import { registrarDesenho } from '../redesenho.js';
import {
  rTrilho, rRotuloDaData, mostrarTrilho, mostrarMes, mesDoTrilho, marcarAbrindo, diaAbrindo,
  semanasAVista, focarNoCalendario, lerContagemDosDias, contarComOsDados
} from '../views/trilho.js';

const CHAVE = 'acpm_trilho';
const DOMINGO = 'O aeroclube não opera aos domingos: não há escala nem pedidos.';

// O aviso do domingo (um link para um domingo abre a segunda)
export const avisoDeDomingo = segunda => `O aeroclube não opera aos domingos: abrimos segunda-feira, ${segunda.slice(8, 10)}/${segunda.slice(5, 7)}.`;

// Os desenhos (js/redesenho.js): ao abrir uma data, o nome dela no alto do trilho e o mês dela no calendário; o calendário
// em todos os momentos; os pedidos de cada dia quando os dados chegam (se o mês à vista ainda não foi contado)
registrarDesenho('rotulo-da-data', rRotuloDaData, { em: ['data-aberta'], ordem: 1 });
registrarDesenho('mes-do-trilho', () => { if (DATA) mostrarMes(DATA.slice(0, 7)); }, { em: ['data-aberta'], ordem: 3 });
registrarDesenho('trilho', rTrilho, { em: ['data-aberta', 'dados', 'consulta', 'releitura', 'escala', 'perfil', 'pedidos'], ordem: 97 });
registrarDesenho('contagem-do-trilho', contarComOsDados, { em: ['dados'], ordem: 98 });

// O que está guardado: { calendario?: 'aberto' | 'recolhido', avisos?: 'abertos' | 'recolhidos' }. Sem o armazenamento do
// navegador, os padrões: os avisos abertos; o calendário aberto ao lado da tela (a partir de 1024 px) e recolhido numa linha
// em cima dela (abaixo disso, no celular e no tablet: a tela fica logo embaixo da linha de produção), na largura de quando
// a página abre (mudar a largura depois não o recolhe com o foco num dia). O que a pessoa escolhe vale em todas as larguras
function preferencias() {
  try {
    return lerPreferencias(localStorage.getItem(CHAVE));
  } catch {
    return {};
  }
}
// Guarda só o que a pessoa escolheu (o padrão que ela não mudou continua o da largura) e devolve o estado em uso
function guardar(mudanca) {
  const novas = { ...preferencias(), ...mudanca };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novas));
  } catch {
    // Sem o armazenamento do navegador, a escolha vale até recarregar
  }
  return { ...estado, ...novas };
}
const calendarioDePartida = () => (matchMedia('(min-width: 1024px)').matches ? 'aberto' : 'recolhido');
let estado = { calendario: calendarioDePartida(), ...preferencias() };
mostrarTrilho(estado);

// Abre a data escolhida no calendário. Até os dados dela chegarem, a data aberta, o anel e o alto do trilho continuam na de
// antes; o dia escolhido fica "abrindo". Aberta, ela é anunciada, e o foco fica no dia (quem foi para outro lugar enquanto
// ela abria, um campo da tela, continua lá). Vale a última escolha: o clique na data que continua aberta, com outra abrindo
// ou depois de outra não abrir, a lê de novo (e ela volta a gravar)
let escolhas = 0;
async function escolherData(dia) {
  if ((dia === DATA && dadosLidos) || dia === diaAbrindo() || !dataIsoValida(dia)) return;
  if (ehDomingo(dia)) { showToast(DOMINGO); return; }
  const vez = ++escolhas;
  marcarAbrindo(dia);
  rTrilho();
  let falhou = false;
  try {
    await carregarData(dia);
  } catch {
    falhou = true;
  }
  // Outra data foi escolhida depois desta (ou esta, de novo): a marca e o aviso são dela
  if (vez !== escolhas) return;
  marcarAbrindo(null);
  rTrilho();
  if (falhou) { showToast('Não foi possível abrir essa data. Verifique a conexão e tente de novo.'); return; }
  anunciar(`Data aberta: ${rotuloDaData(dia, hojeISO()).dia}`);
  const foco = document.activeElement;
  if (!foco || foco === document.body) focarNoCalendario(dia);
}

function mudarMes(meses) {
  mostrarMes(somarMeses(mesDoTrilho(), meses));
  rTrilho();
  lerContagemDosDias();
}

$('#trilho').addEventListener('click', e => {
  const botao = e.target.closest('.cal-dia');
  if (botao) escolherData(botao.dataset.dia);
});
$('#cal-mes-ant').onclick = () => mudarMes(-1);
$('#cal-mes-prox').onclick = () => mudarMes(1);

// Recolher e abrir o calendário: aberto de novo, ele mostra o mês da data aberta, com os números lidos de novo
$('#btn-recolher-trilho').onclick = () => {
  const abrir = estado.calendario === 'recolhido';
  estado = guardar({ calendario: abrir ? 'aberto' : 'recolhido' });
  if (abrir && DATA) mostrarMes(DATA.slice(0, 7));
  mostrarTrilho(estado);
  if (!abrir) return;
  rTrilho();
  lerContagemDosDias();
};
// Recolher e abrir os avisos da data (o número continua no cabeçalho deles)
$('#btn-avisos').onclick = () => {
  estado = guardar({ avisos: estado.avisos === 'recolhidos' ? 'abertos' : 'recolhidos' });
  mostrarTrilho(estado);
};

$('#cal').addEventListener('keydown', e => {
  // Alt e ← ou Cmd e ← (Voltar), Ctrl e Home: do navegador
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const botao = e.target.closest('.cal-dia');
  const alvo = botao && diaDaTecla(botao.dataset.dia, e.key);
  if (!alvo) return;
  e.preventDefault();
  // PageUp e PageDown vão sempre ao mês do dia; as outras, só quando ele não está à vista
  if (e.key.startsWith('Page') ? alvo.slice(0, 7) !== mesDoTrilho() : !semanasAVista().flat().includes(alvo)) {
    mostrarMes(alvo.slice(0, 7));
    rTrilho();
    lerContagemDosDias();
  }
  focarNoCalendario(alvo);
});
