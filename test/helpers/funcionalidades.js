// As funcionalidades (js/funcionalidades.js) ligadas num teste do Node, pelo mesmo caminho dos testes no navegador: a lista
// da janela, que só vale no localhost. lista: os nomes separados por vírgula ('' desliga todas). Sem a lista, sai: valem as
// do app
export function ligarFuncionalidades(lista) {
  if (lista === undefined) {
    delete globalThis.location;
    delete globalThis.FUNCIONALIDADES_LIGADAS;
    return;
  }
  globalThis.location = { hostname: 'localhost', search: '' };
  globalThis.FUNCIONALIDADES_LIGADAS = lista;
}
