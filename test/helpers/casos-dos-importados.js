// Os casos da regra (a) de novo (G2: a migração 20261129100100_importados_ja_aprovados, que chama
// aprovar_solicitacoes_de_antes_da_aprovacao(false); no modo local, aprovarOsImportadosDeNovo, js/agenda.js). Cada caso é um
// pedido com as colunas da aprovação (registrado depois do D1, importado por uma aba de antes do D2): a data ('passada' ou
// 'aberta'), se ele está em "importadas" do dia, o registro do dia que o leva ('principal', 'extra' ou null), o estado
// ('aguardando', 'retirada', 'cancelada', 'aprovada') e se a conversão o aprova. O pgTAP
// (supabase/tests/database/importados-ja-aprovados.test.sql) tem uma verificação com o nome de cada um, e o espelho local
// roda os mesmos (test/unit/backend-local.test.js); test/unit/espelho-do-banco.test.js confere os nomes
export const CASOS_DOS_IMPORTADOS = [
  { nome: 'importado e levado pelo registro principal, aguardando: aprovado', data: 'aberta', importada: true, registro: 'principal', estado: 'aguardando', aprovado: true },
  { nome: 'importado e levado por uma missão extra, aguardando: aprovado', data: 'aberta', importada: true, registro: 'extra', estado: 'aguardando', aprovado: true },
  { nome: 'importado numa data que já passou, sem registro: aprovado', data: 'passada', importada: true, registro: null, estado: 'aguardando', aprovado: true },
  { nome: 'só em importadas, sem registro, de hoje em diante: continua aguardando', data: 'aberta', importada: true, registro: null, estado: 'aguardando', aprovado: false },
  { nome: 'não importado: continua aguardando', data: 'aberta', importada: false, registro: null, estado: 'aguardando', aprovado: false },
  { nome: 'com a aprovação retirada: não volta pela conversão', data: 'aberta', importada: true, registro: 'principal', estado: 'retirada', aprovado: false },
  { nome: 'cancelado: continua cancelado, sem aprovação', data: 'aberta', importada: true, registro: 'principal', estado: 'cancelada', aprovado: false },
  { nome: 'já aprovado: fica com quem aprovou', data: 'aberta', importada: true, registro: 'principal', estado: 'aprovada', aprovado: false }
];
