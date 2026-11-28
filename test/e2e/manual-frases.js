// As frases que o Manual não diz mais e as que ele precisa dizer (app.spec.js, "o botão Manual abre…"), em um bloco por
// tela: o passo que muda uma tela muda o Manual dela e só o bloco dela aqui (A: Alunos; B: Recursos; C: Instrutores; D2:
// Pedidos; G1, G2: a Demanda; H: a Escala e Aprovar)

// Nada das regras e dos nomes antigos ("Desfazer", o botão que a Demanda teve, só nela: o dos dados pessoais, F2, é outro)
const ANTIGAS = {
  // J (N11): as janelas de operação deixam de ser uma entidade; os horários fechados nesta data no lugar delas
  janelas: ['Janelas de operação:', 'Desligar uma janela tira da escala', 'dentro das janelas de operação abertas', 'Janelas do dia', 'valem por janela'],
  geral: ['A01', 'A09', 'Gerar escala', 'Preencher exemplo', 'Link Blindado', 'Importar Solicitações da Agenda',
    'Vai voar?', 'Início pref', 'Exportar CSV', 'Emitir PDF', 'Turno rápido', 'Cada cartão', 'campo Data', 'Equipamento', 'Bloquear',
    'Sessões', 'sessão', 'Desfazer da Demanda', 'Escala de Voo', 'Por avião e sala', 'Avião / sala', 'Aviões e salas', 'o botão ao lado de Alunos', 'As abas seguem a ordem de uso', 'ao lado do nome das abas'],
  // A data aberta é escolhida no calendário do trilho (sem as setas e sem o calendário da Agenda), e um domingo não abre
  casca: ['setas ‹ ›', 'use as setas', 'com um calendário', 'o app pula o domingo'],
  // O "+" do mapa fica ao lado do nome do recurso; o mapa abre com os recursos nas colunas, e o Manual não fala dele
  // como linhas
  escala: ['no fim de cada linha', 'ao lado do nome de cada linha', 'as linhas livres', 'de uma linha do mapa', 'a linha dele não agenda'],
  // O Operador não muda os Cursos nem os limites da lei
  perfis: ['altera tudo e opera a escala'],
  // A coluna de quem vem é "Vem" (a data aberta não é sempre hoje); o filtro das habilitações tem várias marcas
  instrutores: ['o interruptor de quem vem', 'filtro por habilitação'],
  // O 7º voo local não fica mais indisponível: o app avisa e pede a confirmação (F1c). D2: a tela é Pedidos (lista e
  // detalhe, por estado), sem a coluna Situação; importa-se só o aprovado
  pedidos: ['o horário fica indisponível, e o app diz o próximo horário possível', 'Ainda não importado', 'a coluna Situação', 'Importar pedidos da agenda',
    'Importar da agenda',
    // E: a importação também tira os cancelados (a conciliação), e o voo do cancelado não se tira mais no Voa
    'só acrescenta, nunca apaga nem repete', 'o aviso diz para tirá-lo no Voa'],
  // O peso vem antes do curso em Alunos; Alunos é lista e detalhe (F2): sem as colunas de Instrutores, sem o cartão no
  // celular, os dados pessoais na seção do aluno (o painel fica para os instrutores)
  // A: sem o link para a Demanda (os voos da data ficam em "Nesta data"), e a secretaria não altera os dados pessoais
  alunos: ['Nome, CANAC, curso e peso', 'Nome, CANAC, peso e curso', 'as três primeiras colunas', 'A barra é a de Instrutores',
    'o cadastro de Alunos e o de Instrutores mostram', 'o botão na linha do aluno ou do instrutor', 'Abrir a Demanda',
    'também as alterações da secretaria', 'grava os cinco de uma vez'],
  // Cursos mostra um curso de cada vez (sem "todos")
  cursos: ['mostra um curso só ou todos'],
  // G1: as colunas do tipo, do instrutor, das preferências, da duração e da prioridade saíram da Demanda para as restrições
  // do pedido, com a missão do curso ("Usar a do programa", "Trocar…")
  demanda: ['Próxima: PP-07 · Usar', 'Outra missão…', 'Missão e Recurso (só aparecem', 'sem os de Não escalar com do aluno',
    'na Demanda para o dia vale mais'],
  // Recursos em duas vistas (não mais em duas partes), com as categorias marcadas na barra
  recursos: ['3 de 26 recursos', 'A aba tem duas partes', 'Escolha uma categoria para ver só a frota dela', 'na Frota, em “Vale para todas as datas”',
    'Veja na aba Recursos se ele está ligado',
    // B: Recursos é lista e detalhe; sem as duas vistas, sem o filtro das categorias e sem a tabela da Disponibilidade do dia
    'Duas vistas, com a busca e as categorias valendo nas duas', 'os recursos de alguma das marcadas', 'Categoria: C152 ou PA-34',
    'abre o Cadastro com o formulário', 'cujo botão mostra o mesmo número', 'Veja em Recursos, na Disponibilidade do dia', 'A tabela da Disponibilidade do dia']
};

// Os nomes dos botões e das vistas, e as regras em vigor
const NOVAS = {
  casca: ['menu da conta', 'Fixar o calendário ao lado da tela', 'ou no botão da data, no topo', 'os avisos da data',
    'os aviões parados ou perto da revisão de 50 horas, os pedidos', 'leva à tela onde se resolve, quando você a vê'],
  perfis: ['na primeira data que ainda aceita pedidos'],
  escala: ['Atualizada às', 'Ver todos', 'Compartilhar', 'Por recurso',
    // Os horários fechados nesta data, no alto da Escala (B): o bloco, o aviso do trilho e a pergunta
    'no alto da Escala, entre a barra das vistas e a dos critérios', 'Na escala que não está aprovada, Fechar e o ✕ perguntam antes',
    // O agendamento na Escala (mover e encaixar, as turmas, as alternativas, a prévia, os avisos), o voo agendado na
    // Demanda, as alterações dos cursos fora do Histórico e o peso aceito
    'Encaixar o voo', 'Mover o voo', 'Entrar na turma das', 'Horários livres', 'O que muda na escala', 'Agendar mesmo assim',
    'agendado 10:10 · PR-VOB', 'fora da regra', 'ao lado do nome de cada recurso (ou instrutor)', 'não entram no Histórico da data', 'de 1 a 300 kg',
    // Acima do limite de voos locais do horário, todo voo local agendado pede a confirmação (não só o 7º)
    'mais de 6 voos locais no mesmo horário',
    // O voo com resultado não é desfeito, também com o progresso desligado
    'o que já tem resultado nem o pedido que mudou depois na Demanda'],
  demanda: ['Pôr um aluno na demanda',
    // G1: as restrições do pedido, de onde abrem, o que mostram (o horário exato da agenda, o tipo e o horário contra as
    // limitações, o INVA de Não escalar com desligado) e a regra que solta o voo agendado
    'O resto do pedido fica em Restrições, na linha', 'é a gaveta com o que o app lê para encaixar o pedido na escala',
    'do aviso da missão que não entrou (no trilho)', 'Usar C152 mesmo assim', 'ficam na lista, desligados',
    'sem as preferências: o app só o escala nele', 'A missão que não entrou tem Restrições, embaixo do aviso',
    'a mesma missão, o mesmo tipo e as mesmas horas', 'Restrições, no editor, abre o que o app lê'],
  // A missão espera o aluno e vem do curso dele; o 7º voo local pede a confirmação (F1c)
  // D2: a lista por estado, "Aprovar" e "Aprovar todos", a entrada na hora (só na data já gravada) e "Importar", o detalhe
  // só de leitura com as ações, as duas preferências exatas, os dois botões e o 7º voo local, "Registrar na lista de espera"
  pedidos: ['Data do pedido', 'prazo encerrado', 'as missões do curso dele', 'NAV-150NM · Navegação · C152 · 3 h', '(nenhum ativo)',
    'Aguardando aprovação, Aprovados e Cancelados', 'Aprovar todos (N), que aprova só os que a busca mostra',
    'O pedido aprovado da data aberta entra na demanda na hora quando a escala dessa data já está gravada', 'Importar os põe lá',
    'O pedido escolhido é só de leitura', 'Registrar de novo…', '2ª preferência é outro horário exato',
    'Registrar e aprovar', 'Registrar sem aprovar', 'Com Registrar na lista de espera',
    'Com Registrar mesmo assim, o pedido guarda quem confirmou e quando',
    // E: o cancelado sai pela conciliação, e a vaga vai ao 1º da lista de espera; o voo que fica diz por quê, e reverter não
    // põe de volta o que saiu (a revisão do E)
    'continua na demanda até Tirar da escala', 'dá a vaga ao 1º da lista de espera daquele horário', 'fica na escala, e o aviso diz por quê',
    'não põe de volta o voo de um pedido que saiu da demanda'],
  // A busca sem acentos, quantos aparecem e o "Limpar filtros"; a coluna Vem (a data aberta não é sempre hoje); o filtro
  // das habilitações, com várias marcas e a regra ("todas as marcadas")
  instrutores: ['Editar habilitações', 'sem os acentos', '12 de 40 instrutores', 'Limpar filtros', 'o interruptor Vem', 'Filtro das habilitações',
    'que têm todas as marcadas', 'Habilitações: Noturno + C172'],
  // Alunos como lista e detalhe (F2): a escolha no endereço, os campos no lugar, Anterior e Próximo, o filtro dos cursos (a
  // regra "algum dos marcados"; um só nas duas telas) e os dados pessoais na seção do aluno, com Salvar e Desfazer; o
  // cadastro relido depois de um conflito. A: as seções do detalhe (Nesta data, Curso e missões), o nome completo (também
  // na busca), a secretaria que consulta e "Apagar os dados pessoais"
  // L: as limitações do aluno (os tipos e os horários), duras para a escala, e o que os Pedidos desligam
  alunos: ['Não escalar com', 'Só voa no', 'Pode voar', 'a escala nunca passa por cima delas', 'C152 (o aluno só voa no C172)', 'A lista dos alunos fica à esquerda e o aluno escolhido à direita', '#/alu/1000', '‹ Alunos',
    'gravado ao sair dele', 'Ctrl+, e Ctrl+.', 'Filtro dos cursos', 'aparecem os alunos de algum dos marcados', 'Curso: PP ou PC',
    'aparecem os pedidos dos alunos de algum dos cursos marcados', 'O filtro dos cursos é um só nas duas telas',
    'um cartão por pessoa', 'e Desfazer volta ao que está gravado', 'Outra pessoa alterou o cadastro enquanto você editava',
    'desligue Ativo, na linha dele', 'Mostrar inativos', 'Nesta data', 'Sem voo nesta data.', 'Curso e missões', 'Curso matriculado',
    'Nome (na escala)', 'Nome completo', 'o nome completo e o CANAC', 'a secretaria consulta, em texto', 'Apagar os dados pessoais'],
  // Recursos: as duas vistas, a busca pela matrícula, o filtro das categorias (a regra "alguma das marcadas") e o
  // cadastro da frota e os horários de decolagem
  // B: a lista por categoria e o detalhe (Nesta data, depois todas as datas), o cabeçalho da categoria com os horários de
  // decolagem, o "Disponível" e o "Ativo" na linha, "Agendar voo no", "+ Novo recurso" no detalhe, "Retirar da frota…"
  recursos: ['Novo recurso', 'Retirar da frota…', 'Horários de decolagem', 'de 30 em 30 minutos', 'divide as horas do dia',
    'A lista dos recursos fica à esquerda, por categoria', 'um clique no nome da categoria abre o detalhe dela', 'Buscar matrícula', '3 de 27 recursos',
    'desligue Disponível, na linha do recurso', 'Agendar voo no PR-VOB', 'Mostrar inativos', 'o ponto da linha',
    'Veja em Recursos se ele está disponível nesta data', 'Exigir também…', 'Quem pode operar',
    // O "Disponível" da Sala Ground (J, S4; revisão do J)
    'A Sala Ground também tem Disponível em cada data', 'A Sala Ground está indisponível nesta data', 'a Sala Ground indisponível'],
  // Cursos: um de cada vez, o índice das fases, as fases recolhidas e os alunos por fase
  cursos: ['um curso de cada vez', 'índice das fases', 'Recolher todas', 'Abrir todas']
};

// As do que pode ficar desligado (js/funcionalidades.js): o Manual só as diz com a funcionalidade ligada
export const FRASES_DAS_FUNCIONALIDADES = {
  hangar: ['a busca não vale na ordem no hangar', 'Ordem no hangar', 'a ordem no hangar.', 'depois o da frente do hangar', 'as saídas do hangar', 'menos saídas do hangar'],
  progresso: ['agrupados pela fase em que estão', 'Próxima do programa: PP-07', 'Usar a do programa', 'Trocar…', 'próxima missão', 'progresso', 'Aprovado ou Reprovado',
    '12/40 · próxima PP-13', 'fora da ordem', 'com quantos alunos estão em cada uma',
    'o resultado do voo vai para o código do pedido',
    // Alunos (A): as missões do aluno, o resultado sem voo e a colocação no curso
    'Missão anterior', 'Missão atual', 'Também liberadas', 'Registrar resultado sem voo', 'Colocar no curso até…', 'o ↶ dela volta cada missão'],
  prioridade: ['duração e prioridade', 'de 1 a 5, e 1 é a mais alta', 'as preferências, a prioridade ou o instrutor', 'por prioridade (1 primeiro)',
    'a 1ª preferência pesa mais para quem tem mais prioridade', 'seguindo as prioridades', 'Como dar preferência a um aluno?',
    'aumente a prioridade dele (1 é a mais alta)']
};
// E as que ele só diz com ela desligada
export const FRASES_SEM_AS_FUNCIONALIDADES = {
  hangar: ['sai o primeiro livre na ordem da frota', 'uma parada de 2 h ou mais pesa mais'],
  progresso: ['o código da missão do curso que o pedido já tem', 'para o aluno de um curso, escolha a missão na lista', 'oferece esse voo', 'e um clique leva à fase'],
  prioridade: ['horários preferidos e duração.', 'Depois os voos e simuladores: quem', 'seguindo a ordem dos pedidos']
};

export const FRASES_QUE_SAIRAM = Object.values(ANTIGAS).flat();
export const FRASES_DO_MANUAL = Object.values(NOVAS).flat();
