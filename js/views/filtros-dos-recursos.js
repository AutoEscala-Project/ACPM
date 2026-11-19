// Os filtros da aba Recursos, nas duas vistas: a matrícula buscada e as categorias marcadas (aparece o recurso de uma
// delas: uma ou outra; nenhuma marcada, todas). Eles valem para a tabela dos aviões e simuladores, para a frota e para os
// horários de decolagem, que são por categoria (os das categorias marcadas e, com a busca, os das categorias dos recursos
// achados). Nunca para a ordem no hangar: Subir e Descer trocariam o avião com os escondidos (js/hangar.js, moverNoHangar
// anda na lista inteira). Os filtros ficam aqui, e não só nos campos, e valem de novo a cada redesenho
// (js/views/recursos.js, js/views/horarios.js). O recurso acrescentado agora e a categoria dos horários editados agora
// continuam à vista mesmo fora dos filtros, até eles mudarem: é ali que está quem acabou de mexer (e o foco do teclado)
import { CATEGORIAS, categoriaDoTipo } from '../categorias.js';
import { chaveDeBusca, esc } from '../format.js';
import { S } from '../state.js';

const filtros = { matricula: '', categorias: [] };
const mantidos = { recursos: new Set(), horarios: new Set() };

// A chave da matrícula: a da busca (sem acentos, em minúsculas), sem os hífens e os espaços: “vob”, “PR VOB” e “prvob”
// acham o PR-VOB
const chaveDaMatricula = texto => chaveDeBusca(texto).replace(/[\s-]/g, '');
const buscada = () => chaveDaMatricula(filtros.matricula);
const matriculaPassa = reg => chaveDaMatricula(reg).includes(buscada());
const categoriaPassa = id => !filtros.categorias.length || filtros.categorias.includes(id);

export const filtrandoRecursos = () => Boolean(buscada()) || filtros.categorias.length > 0;

// O recurso aparece na tabela e na frota: passa nos filtros, ou acabou de ser acrescentado
export const recursoAVista = f => mantidos.recursos.has(f.reg) || (categoriaPassa(categoriaDoTipo(f.tipo)) && matriculaPassa(f.reg));

// Os horários de decolagem de uma categoria aparecem: a categoria passa e, com a busca, algum recurso dela foi achado; ou
// eles acabaram de ser editados
export const horariosAVista = cat => mantidos.horarios.has(cat)
  || (categoriaPassa(cat) && (!buscada() || (S.frota || []).some(f => categoriaDoTipo(f.tipo) === cat && matriculaPassa(f.reg))));

// Um filtro mudou ({ matricula } ou { categorias }): vale para todos, também o que acabou de ser acrescentado ou editado
export function filtrarRecursos(mudanca) {
  Object.assign(filtros, mudanca);
  mantidos.recursos.clear();
  mantidos.horarios.clear();
}

// "Limpar filtros": a busca vazia e nenhuma categoria marcada
export const limparFiltrosDosRecursos = () => filtrarRecursos({ matricula: '', categorias: [] });

export const manterRecursoAVista = reg => { mantidos.recursos.add(reg); };
export const manterHorariosAVista = cat => { mantidos.horarios.add(cat); };

// TODO(abas-2): trocar estas caixas por "Categoria ▾", o filtro de vários valores do passo 2 (criarFiltroMultiplo, em
// js/views/filtro-multiplo.js no ramo abas-2-habilitacoes, com a regra 'alguma'), quando as pilhas se juntarem. Até lá,
// as categorias (sem a Sala Ground, que não está em Recursos) são caixas de marcar na barra, e só esta função as desenha
// e as lê: lugar é o grupo (#flt-rec-cat, com o rótulo), aoMudar recebe as categorias marcadas, e limpar() desmarca as
// caixas sem avisar ("Limpar filtros", como o limpar() do componente). As caixas têm flt-ctrl (js/somente-leitura.js não
// as desliga para o Gestor) e nenhum data-f ou data-a (não são alterações dos dados)
export function filtroDasCategorias(lugar, aoMudar) {
  lugar.innerHTML = `<span id="${lugar.id}-rotulo">Categoria</span>` + CATEGORIAS.filter(c => c.id !== 'ground')
    .map(c => `<label class="chk"><input type="checkbox" class="flt-ctrl" value="${esc(c.id)}">${esc(c.nome)}</label>`).join('');
  const caixas = [...lugar.querySelectorAll('input')];
  lugar.addEventListener('change', () => aoMudar(caixas.filter(c => c.checked).map(c => c.value)));
  return { limpar: () => caixas.forEach(c => { c.checked = false; }) };
}
