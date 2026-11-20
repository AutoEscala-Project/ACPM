# AutoEscala - ACPM

Planejamento da escala diária de voo, simulador e Ground School do ACPM.
Publicada pelo GitHub Pages em https://gdruumond.github.io/ACPM/ (branch `main`, sem etapa de build).

A escala é automática: cada alteração refaz a escala da data na hora (o motor leva milissegundos) e grava os dados e
a escala juntos. O manual de uso está no botão "Manual", no topo do app.

## Modos de uso

- **Compartilhado (site publicado):** login com e-mail e senha; os dados ficam no Supabase e todos veem as mesmas escalas
  (uma por data).
  O perfil da conta define o acesso: **Operador** edita, **Gestor** só consulta, **Secretaria** registra pedidos na
  agenda de solicitações (a escala ela só consulta) e **Administrador** faz tudo o que o Operador faz e, além disso,
  cria e exclui contas (em "Minha conta" › Usuários) e muda os cursos e o programa de cada um (aba Cursos). O cadastro
  aberto é desligado. Em "Minha conta", cada pessoa troca a própria senha e o e-mail (o e-mail novo vale depois dos
  links de confirmação, que dependem do SMTP do Supabase). A primeira conta de administrador sai de
  `scripts/criar-conta.mjs`.
- **Local (`localhost`):** sem login, dados só no `localStorage` do navegador. Em localhost, `?supabase=previa` usa o
  projeto de prévia (com login).

| Endereço | Projeto Supabase |
|---|---|
| https://gdruumond.github.io/ACPM/ | `acpm-escala` (produção) |
| https://thephfernandes.github.io/ACPM/ (prévia) | `acpm-escala-preview` |

## Rodar localmente

A aplicação usa módulos ES, então precisa ser servida por HTTP (abrir o `index.html` direto do disco não funciona):

```sh
npm install
npm run serve      # http://localhost:4173
```

## Testes

```sh
npm test               # unitários + E2E
npm run test:unit      # motor de alocação, regras e camada de dados (node:test)
npm run test:e2e       # aplicação no navegador (Playwright)
```

- Na primeira vez, `npx playwright install chromium` baixa o navegador dos testes.
  Para usar o Google Chrome já instalado: `PW_CHANNEL=chrome npm run test:e2e`.
- Para testar uma versão publicada em vez do servidor local:
  `BASE_URL=https://gdruumond.github.io/ACPM/ npm run test:e2e` (com a barra final).
- Os testes E2E comparam a escala gerada com snapshots em `test/e2e/__snapshots__/`. Se uma mudança
  de comportamento for intencional, atualize-os com `npx playwright test --update-snapshots` e revise o diff.
- `test/fixtures/goldens-do-motor/` guarda a escala aprovada do motor para 40 cenários aleatórios e para o
  dia de exemplo (a entrada dele, a demanda do antigo botão "Preencher exemplo", fica congelada em
  `exemplo-estado.json`), um arquivo por cenário e um voo por linha. Depois de mudar uma regra do motor de propósito,
  regrave com `node scripts/capturar-goldens-motor.mjs` e revise o diff: ele mostra os voos que mudaram.
- Os testes usam somente nomes e pesos fictícios.
- A planilha do Excel (o modelo do aeroclube) é conferida por fora em `test/helpers/xlsx.js`: o ZIP é lido com o zlib
  do Node, a estrutura é comparada com a do modelo e o lugar de cada voo sai dos rótulos da própria planilha, em dias
  aleatórios (`test/unit/planilha.test.js`) e contra o CSV da mesma tela (`test/e2e/planilha.spec.js`).
- O modo compartilhado é testado com um servidor Supabase falso (`test/e2e/supabase-falso.js`) que segue o mesmo
  contrato do banco. `test/e2e/publicado.spec.js` entra no site publicado com login real (só roda com as senhas
  das contas no ambiente: veja o cabeçalho do arquivo).

## Banco de dados (Supabase)

- Esquema e regras de acesso em `supabase/migrations/`; testes pgTAP em `supabase/tests/database/`.
- Rode os testes do banco **somente no projeto de prévia** (o `supabase/` local fica vinculado a ele):
  `SUPABASE_DB_PASSWORD=... npm run test:db` (cada teste roda numa transação desfeita no final).
- Aplicar migrações: `supabase db push --remote` (prévia) ou `--remote=<ref de produção>`.
- Contas: `SUPABASE_DB_PASSWORD=... SENHA_NOVA=... node scripts/criar-conta.mjs <email> <operador|gestor|secretaria|administrador> "<nome>"`
  (depois da primeira conta de administrador, as outras saem de "Minha conta" › Usuários).
- Configuração do Auth (SMTP, senha mínima de 12 caracteres e o e-mail da troca de endereço, em
  `supabase/templates/`): `SUPABASE_AUTH_SMTP_USER=<gmail> SUPABASE_AUTH_SMTP_PASS=<senha de app> supabase config push`
  (prévia) ou com `--remote=<ref de produção>`. Confira antes com `supabase config diff`.
- Dados fictícios na prévia (só num banco sem dados): `node scripts/semear-previa.mjs`.
- Escalas fictícias nas próximas datas da prévia (só nas datas sem escala; usa o Supabase CLI autenticado, sem a
  senha do banco): `node scripts/semear-dias-previa.mjs [dias de operação] [data inicial]` (`SECO=1` só mostra).

## Formato dos dados

O cadastro e cada dia guardam a versão do formato (campo `esquema`). Para mudar o formato, acrescente um passo em
`js/migracoes.js` (com teste): as leituras aplicam os passos que faltam, o primeiro acesso de um operador regrava
no formato novo tudo o que estiver gravado (os dias e, por último, o cadastro) e o banco recusa conteúdo num formato
mais antigo do que o guardado. Nunca apague campos num passo: mantenha o que o passo não conhece.

Do formato 24 em diante, o formato dos cursos, o programa de cada curso vive em tabelas próprias. O número fica num
lugar só em cada ponta, `FORMATO_DOS_CURSOS` (`js/migracoes.js`) e `public.formato_dos_cursos()` (migração
`20261117200000_cursos_e_missoes.sql`), e `test/unit/espelho-do-banco.test.js` confere que é o mesmo. Se outro formato
chegar antes com o mesmo número, o aumento é essa linha em cada ponta, com o passo dos cursos (e o `ESQUEMA`)
renumerado em `js/migracoes.js`. O app lê os programas das tabelas e só o Administrador grava, por `salvar_curso` (no
modo local, os programas ficam em `acpm4_cursos`, e o Operador grava); o cadastro guarda a cópia de antes (`cursos`),
que ninguém mais grava. A conversão é única: no primeiro acesso de um Operador ou Administrador ao app no formato 24,
o programa do cadastro vai para as tabelas (`importar_cursos`, cada curso numa fase só, "Programa", com as missões na
ordem) depois dos dias e antes do cadastro, que, gravado no formato 24, a encerra. Até lá, quem só consulta vê o aviso
de que os programas ainda não foram trazidos do cadastro, com a próxima missão e o progresso desligados.

Para pôr o formato 24 no ar, nesta ordem:

1. a migração na prévia (`supabase db push --remote`) e `npm run test:db` na prévia;
2. a mesma migração na produção (`--remote=<ref de produção>`), **antes do merge**: ela acrescenta as tabelas e as
   funções e só alarga a regra dos resultados (PP, PC e INVA já vêm na tabela dos cursos, ainda sem programa), então o
   app no ar, no formato 23, continua como está;
3. o merge, e o GitHub Pages publica o app no formato 24;
4. **uma abertura do app como Operador ou Administrador**, que faz a conversão única.

Depois, num PR à parte, com a conversão feita e nenhuma aba de antes do formato 24 aberta: tirar `importar_cursos` do
banco (e a chamada dela no app). A cópia `cadastro.cursos` fica.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html` | Marcação das nove abas |
| `painel.html`, `js/painel.js` | TV da recepção: o painel de hoje na tela toda, no quadro e com as colunas da configuração do painel (com o servidor, por enquanto, o padrão: `painel_do_dia` ainda não entrega a configuração) |
| `css/app.css` | Estilos e temas claro/escuro |
| `js/config.js` | Janelas, missões, limites de peso e a frota inicial |
| `js/frota.js` | A frota no cadastro (matrícula, tipo e "Só Parafuso"): validação de um recurso novo e as matrículas de cada tipo |
| `js/categorias.js` | Categorias de recurso dos filtros (C152, C172, Simulador, PA-34 e Sala Ground) |
| `js/habilitacoes.js` | Habilitações individuais dos instrutores e o que cada missão exige |
| `js/rodizio.js` | Filas do rodízio (cheque, MLTE, noturno e C172) e a rotação de uma data para a seguinte |
| `js/cursos.js` | Os cursos iniciais (PP, PC e INVA), o formato da sigla e do código da missão, o curso de cada aluno e o programa guardado no cadastro (`cursos`, a cópia de antes do formato 24, que ninguém mais grava) |
| `js/programa.js` | O programa dos cursos em fases (as tabelas dos cursos; no modo local, `acpm4_cursos`): a regra de quando voar cada fase e cada missão, o Noturno em trechos, as operações do editor da aba Cursos e a gravação e a conversão única do cadastro, com as regras e os erros do servidor |
| `js/modelos-de-curso.js` | Os programas prontos que o Administrador põe num curso: o cronograma do Piloto Privado (P.I PPA 001A), com 9 fases e 47 missões |
| `js/progresso.js` | A próxima missão de cada aluno pelas regras do programa (a liberada; as fora da ordem, com o motivo) e o progresso no curso |
| `js/resultados.js` | Os resultados das missões (aprovado ou reprovado; pendente desfaz um engano): a situação de cada missão do aluno e as regras do registro, as do servidor |
| `js/agenda.js` | Prazo da agenda de solicitações (13:00 do dia anterior) e a importação para a demanda |
| `js/csv.js` | CSV da escala agrupado por avião, para o lançamento no portal do aeroclube |
| `js/planilha.js`, `modelos/escala-cavok.xlsx` | A escala na planilha do modelo do aeroclube (o Excel do lançamento no CAVOK): onde cada voo cai e o arquivo preenchido. O modelo é o arquivo da operação sem os dados do dia; as células que o app preenche estão em `BLOCOS` e `GROUND` (um modelo novo precisa delas nos mesmos lugares, e `test/unit/planilha.test.js` confere) |
| `js/zip.js` | Leitura e montagem do ZIP do .xlsx, com a compressão do navegador |
| `js/status.js` | Status do voo com detalhes: o novo horário do atraso, o motivo do cancelamento e o atraso que invade outro voo |
| `js/quadro.js` | As linhas do painel: os quadros Missões, Partidas e Chegadas (Escala e TV da recepção) |
| `js/config-do-painel.js` | A configuração do painel no cadastro (`painel`, do formato 25 em diante): o quadro com que ele abre e as colunas, ligadas ou não e na ordem |
| `js/dados-pessoais.js` | Dados pessoais de alunos e instrutores: validação (CPF, CANAC, nascimento, celular e e-mail) e formatos |
| `js/perfis.js` | Perfis de acesso e o que cada um pode fazer na tela |
| `js/rules.js` | Regras das missões (Ground School, precedência, disponibilidade do aluno) |
| `js/engine.js` | Motor de alocação (função pura) |
| `js/viabilidade.js` | O que torna possível um voo num horário, num recurso e com um instrutor (disponível, habilitado, livre, fora do "Não escalar com", dentro da lei e do peso; o saldo até a revisão): as mesmas regras no motor, na compactação, nas Sugestões e no agendamento |
| `js/fixos.js` | Os voos fixos (pela escala aprovada, pelo status, pelo instrutor escolhido e pelo agendamento na Escala): o que acontece com eles ao mudar o status, aprovar, reabrir e mudar a demanda, e o motivo do cadeado |
| `js/candidatos.js` | Os recursos e os instrutores que servem a um voo num horário, contra os outros voos do dia, cada um com o que o impede (as Sugestões e o agendamento) |
| `js/reparo.js` | As Sugestões para um conflito na escala aprovada: outro avião, outro instrutor, outro horário, soltar o voo ou cancelar |
| `js/instrutor-escolhido.js` | O instrutor escolhido pelo operador: na Demanda (o motor encaixa o voo com ele) e na Escala (o voo fica fixo onde está, com ele), as opções de cada lista e a reversão |
| `js/agendamento.js` | O voo agendado na Escala, em funções puras: o formulário do diálogo (a missão pelo progresso, o recurso e o instrutor que servem, o horário pelo clique, a duração e o peso; o voo de hoje do aluno que muda de lugar ou entra na escala; a turma de Ground), a conferência pelo motor numa cópia do estado (os bloqueios, com as alternativas, e os avisos que pedem confirmação), o pedido com o voo fixo (a marca `agendado`) e a reversão |
| `js/views/agendamento.js`, `js/eventos/agendamento.js` | O diálogo "Agendar voo" (`#dlg-agendar`), aberto pelo "+ Agendar voo" da barra da Escala, pelo "+" de cada linha do mapa e de cada horário da lista, pelo clique numa linha livre do mapa e pelo "+ Aluno na turma" da turma de Ground; a gravação, com "↶ Desfazer" no Histórico |
| `js/storage.js` | Escala por data, migrações de dados e os programas dos cursos (a leitura, a gravação e a conversão única do cadastro), sobre um backend (`js/backends/`: local ou Supabase) |
| `js/dias.js` | Cadastro separado do dia, cópia do dia anterior, conversão dos dados da fase 2 e BI das escalas |
| `js/migracoes.js` | Versões do formato dos dados guardados e os passos de uma versão para a seguinte |
| `js/sessao.js`, `js/config-supabase.js` | Login, perfil de acesso e projeto Supabase de cada endereço |
| `js/state.js`, `js/actions.js` | Estado da aplicação e ações (perfil, data, histórico e a escala refeita a cada alteração); `gravarAlteracao` é o único jeito de os eventos mudarem os dados, e nada grava antes de os dados da data aberta serem lidos (`lerData` lê uma data de cada vez; `aindaNaoAbriu` recusa a mudança com o aviso) |
| `js/manual.js` | Tabelas do manual geradas das regras (missões, habilitações exigidas, janelas, pesos e rodízio) |
| `js/views/` | Renderização de cada aba |
| `js/export.js` | CSV, PDF e a planilha (Excel) |
| `js/eventos/` | Os eventos de cada aba (um módulo por aba); `registro.js` recebe os botões com `data-act` e os campos das tabelas, com a trava de quem só consulta e a de antes de a data abrir, e `confirmacao.js` é o único jeito de confirmar (dois cliques) |
| `js/main.js` | A abertura do app (liga os eventos, lê a sessão e os dados e abre a data) |

## Fluxo de trabalho

Alterações entram por branch + pull request. O GitHub Actions roda todos os testes em cada push e PR;
ao entrar na `main`, o GitHub Pages publica a nova versão.
