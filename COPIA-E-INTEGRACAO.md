# Agenda Ana — cópia local integrada

> Registro histórico da primeira cópia. O estado atual do painel, Supabase e
> publicação está documentado em README.md.

## Origem preservada

Origem: https://github.com/Domingodecafe/Agenda, branch `main`, commit
`d4051cc283bda20674e9e579bdfadc24f8feaf3c`.

O app foi clonado na pasta `Agenda-Ana`, ao lado de `Sec.Ana`. A branch de
trabalho é `codex/ana-control`, sem upstream. O push da cópia aponta para
`DISABLED-LOCAL-ONLY` e `push.default=nothing`. Não houve commit, push, merge ou
publicação. A branch local `main` e `origin/main` mantêm o commit original.
O laboratório anterior e a pasta `Agenda Original` não foram modificados.

## Executar a cópia

Nesta pasta, execute `node preview.mjs`.

- Agenda: http://127.0.0.1:43189/ana-app/
- Controle da Ana: http://127.0.0.1:43189/ana-app/ana-console.html

O processo escuta somente em `127.0.0.1`. SQL, Git, documentação, backups e
funções do servidor não são servidos. CSP restringe scripts e conexões à origem
local. Não foram importados dados reais ou backups da agenda original.

Identidades próprias: IndexedDB `ana-app-agenda-db-v1`, store `ana-app-agenda`,
chave `ana-app-main`, cache `ana-app-pwa-v2`, escopo `/ana-app/`, manifesto
`/ana-app/agenda-ana-local`. Não há leitura/migração das chaves da original ou
do laboratório Ana DEV, nem remoção dos seus caches ou workers.

## Mudanças necessárias no app

O layout, o CSS, o ícone, as visões de calendário, os cadastros, as recorrências
e o fluxo financeiro vêm do app original. Nos arquivos existentes, foram
alterados apenas `app.js`, `index.html`, o manifesto e o Service Worker:

- Agenda e Ana usam o mesmo estado, com revisão, auditoria e transação única.
  Bloqueios, sessões, valores individuais e pagamentos passam a ser compartilhados.
- Uma edição manual com revisão antiga é recusada; a UI recarrega o estado atual,
  preserva o formulário para revisão e não confirma uma gravação inexistente.
- Outras abas são notificadas. Formulários abertos não são substituídos no meio
  da edição; o salvamento verifica novamente a revisão.
- O cadastro tem modalidade, marcação de menor e permissão financeira. Os demais
  vínculos e o controle humano são gerenciados no painel da Ana.
- Cancelamentos da Ana preservam histórico, somem da agenda ativa e não recriam
  sessões ao editar uma série. Pagamentos registrados continuam disponíveis.
- Reservas impedem ocupação por outro paciente, inclusive no app manual.
  Bloqueios encerram ofertas afetadas; marcação manual compatível retira da fila.
- Corrigido o fechamento de uma `div` do formulário original que escondia os
  botões ao criar bloqueios. Incluído backup JSON da cópia.

## Supabase escolhido como backend

Confirmado via plugin: projeto DEV **Secretaria Ana** (`dpdxzbbzymkygutwefww`),
ativo, PostgreSQL 17.11, tabela `agenda_snapshots` com RLS. Foram consultados
apenas metadados e estrutura; nenhum payload de pacientes foi lido. Nenhum SQL
foi executado no projeto nem houve publicação de função.

Preparação local incluída:

- `supabase/functions/agenda-ana/`: API administrativa de leitura, gravação e
  comandos, usando as mesmas regras e o mesmo mapeamento do navegador.
- O proprietário vem de Supabase Auth (`getUser`), nunca do corpo do pedido.
  A sessão do administrador também é usada no banco para manter RLS. Não há
  chave `service_role` no fluxo nem credenciais salvas no código.
- A gravação usa o RPC existente `write_agenda_snapshot` e a revisão esperada.
  Concorrência gera conflito; reenvio do mesmo comando não duplica operação.
- `ana-supabase-adapter.js` implementa a interface `read/save/dispatch/subscribe`
  para essa API. Criar o adaptador não faz conexão automática.

**Estado atual: a cópia continua usando IndexedDB.** A função e o adaptador não
estão publicados/ativados. A próxima etapa de conexão exige validar a conta de
homologação, configurar login administrativo e ligar o adaptador no bootstrap,
revisar CORS/CSP e a verificação JWT do gateway, testar o bundle Deno e só então
ativar a API. O CLI Supabase/Docker não está disponível neste ambiente; a entrada
Deno não foi executada. Os testes atuais validam o handler com repositório local
substituto, não uma integração remota. Nenhuma migração foi necessária nesta etapa.

Esta API é exclusiva para o administrador autenticado, não é um endpoint para
pacientes. Um futuro WhatsApp ou modelo deverá passar por um canal autenticado e
com permissões próprias; não poderá receber a sessão administrativa ou acessar
snapshots integrais. O número digitável do simulador não autentica um paciente.

Referências verificadas:
[Supabase Auth e Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt),
[chaves da API](https://supabase.com/docs/guides/getting-started/api-keys).

## Verificação e limites

Execute `node --test tests/*.test.mjs` para validar regras, compartilhamento,
concorrência, histórico financeiro, isolamento e contrato da API Supabase.

O fluxo de navegador utilizou exclusivamente `TESTE Agenda Integrada`, número
fictício, uma sessão e um bloqueio fictício: cadastro no app, agendamento pela
Ana, sessão visível no calendário, mudança manual de horário, nova consulta
pela Ana e recusa de agendar em horário bloqueado. Nenhuma mensagem foi enviada.

Ainda não existem modelo de linguagem, WhatsApp, agendador persistente de
lembretes ou servidor remoto ativo para esta cópia. O interpretador local é
limitado; as operações estruturadas permitem testar as regras disponíveis.
Não houve alteração da publicação da Agenda original.
