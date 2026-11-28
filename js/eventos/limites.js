// Limites da lei, no cadastro dos instrutores: só o Administrador muda (neste navegador, o Operador). Vazio é sem limite;
// os campos em horas viram minutos onde o limite é guardado em minutos
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { showToast } from '../dom.js';
import { numeroBr } from '../format.js';
import { LIMITES_DA_LEI, normalizarLimites } from '../limites.js';
import { S } from '../state.js';
import { confirmado } from './confirmacao.js';
import { rLimites, podeEditarLimites } from '../views/limites.js';

const ROTULOS_DOS_LIMITES = { vooPorJornadaMin: 'voo por jornada', jornadaMin: 'jornada', vooMesH: 'voo no mês', vooSemestreH: 'voo no semestre', vooAnoH: 'voo no ano', repousoMin: 'repouso' };
const emHoras = (chave, valor) => (valor === null ? 'sem limite' : `${numeroBr(chave.endsWith('Min') ? valor / 60 : valor)} h`);
document.addEventListener('change', e => {
  const campo = e.target.closest('[data-limite]');
  if (!campo || !podeEditarLimites()) return;
  // O valor recusado volta ao gravado no próprio campo (o redesenho não troca o campo em foco)
  const voltar = () => { const v = normalizarLimites(S.limites)[campo.dataset.limite]; campo.value = v === null ? '' : String(v / +campo.dataset.divisor); rLimites(); };
  if (aindaNaoAbriu()) { voltar(); return; }
  const chave = campo.dataset.limite, divisor = +campo.dataset.divisor;
  const antes = normalizarLimites(S.limites);
  const valor = campo.value.trim() === '' ? null : +campo.value * divisor;
  if (valor !== null && !Number.isFinite(valor)) { voltar(); return; }
  // O limite é maior que zero; vazio é sem limite
  if (valor !== null && valor <= 0) { showToast('O limite precisa ser maior que zero (vazio é sem limite).'); voltar(); return; }
  S.limites = normalizarLimites({ ...antes, [chave]: valor });
  gravarAlteracao('mod', `Limites da lei: ${ROTULOS_DOS_LIMITES[chave]} ${emHoras(chave, antes[chave])} → ${emHoras(chave, S.limites[chave])}`);
  rLimites();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-limites-padrao]');
  if (!b || !podeEditarLimites() || aindaNaoAbriu() || !confirmado(b, 'Confirmar valores da lei')) return;
  S.limites = { ...LIMITES_DA_LEI };
  gravarAlteracao('mod', 'Limites da lei: de volta aos valores da lei');
  rLimites();
});
