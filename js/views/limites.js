// Os limites da Lei do Aeronauta, no cadastro dos instrutores: só o Administrador muda (neste navegador, o Operador);
// vazio é sem limite
import { botaoDeDica } from '../dicas.js';
import { $ } from '../dom.js';
import { normalizarLimites } from '../limites.js';
import { gerenciaContas } from '../perfis.js';
import { S, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';

// O Administrador muda os limites (neste navegador, o Operador)
// Depois de um conflito a tela fica só para consulta, também para o Administrador
export const podeEditarLimites = () => !ApiClient.readOnly && (ApiClient.perfil ? gerenciaContas(ApiClient.perfil) : !isGestor());

const CAMPOS_DOS_LIMITES = [
  ['vooPorJornadaMin', 'Voo por jornada (h)', 60], ['jornadaMin', 'Jornada (h)', 60], ['vooMesH', 'Voo no mês (h)', 1],
  ['vooSemestreH', 'Voo no semestre (h)', 1], ['vooAnoH', 'Voo no ano (h)', 1], ['repousoMin', 'Repouso entre jornadas (h)', 60]
];
export function rLimites() {
  const quadro = $('#limites-lei');
  if (!quadro) return;
  const limites = normalizarLimites(S.limites);
  const desligado = podeEditarLimites() ? '' : ' disabled';
  quadro.innerHTML = `<h3>Limites da Lei do Aeronauta${botaoDeDica('limites-da-lei', 'limites da lei')}</h3>
    <p class="h">Lei 13.475/2017 e RBAC 117 (Apêndice A): a escala não põe um instrutor além destes limites e avisa a partir de 90% do mês, do semestre e do ano. As horas de voo contam só avião (simulador e Ground contam na jornada). A jornada vai de 30 minutos antes do primeiro compromisso a 30 minutos depois do último. Vazio é sem limite; só o Administrador muda.</p>
    <div class="limites-grade">
      ${CAMPOS_DOS_LIMITES.map(([chave, rotulo, divisor]) => `<label>${rotulo} <input type="number" min="0.5" step="0.5" data-limite="${chave}" data-divisor="${divisor}" value="${limites[chave] === null ? '' : String(limites[chave] / divisor)}"${desligado}></label>`).join('')}
    </div>
    <button type="button" class="btn quiet" data-limites-padrao${desligado}>Voltar aos valores da lei</button>`;
}
