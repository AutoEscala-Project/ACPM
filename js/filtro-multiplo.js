// O filtro de vários valores (o botão e o painel: js/views/filtro-multiplo.js): as marcas e a regra de cada uso. Na regra
// "todas", a linha passa se tem todas as marcadas: as habilitações dos instrutores, que uma missão pede juntas (o Noturno
// no C172 pede Noturno e C172). Na regra "alguma", se tem alguma delas: um valor só por linha, como o curso do aluno. Sem
// nenhuma marcada, todas passam. A frase vai no painel e a junção, no texto do botão: quem só consulta não lê um
// resultado vazio como "ninguém tem nenhuma"
export const REGRAS_DO_FILTRO = {
  todas: { frase: 'Mostra quem tem todas as marcadas.', junta: ' + ' },
  alguma: { frase: 'Mostra quem tem alguma das marcadas.', junta: ' ou ' }
};

// Se a linha passa no filtro: os valores dela (as habilitações do instrutor) e os marcados
export function passaNoFiltro(valores, marcados, regra = 'todas') {
  if (!marcados.length) return true;
  const tem = new Set(valores);
  return regra === 'alguma' ? marcados.some(v => tem.has(v)) : marcados.every(v => tem.has(v));
}

// O texto do botão: sem marca, o de todas ("Todas as habilitações"); com marcas, o nome e os rótulos delas, juntados pela
// regra ("Habilitações: Noturno + C172"; "Curso: PP ou PC")
export const resumoDoFiltro = (rotulos, { nome, todas, regra = 'todas' }) =>
  (rotulos.length ? `${nome}: ${rotulos.join(REGRAS_DO_FILTRO[regra].junta)}` : todas);
