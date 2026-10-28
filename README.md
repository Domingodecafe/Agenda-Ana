# Agenda Ana

Agenda administrativa com painel de encaminhamentos, Supabase Auth, armazenamento
isolado e sincronização entre dispositivos. A execução dos agentes e o modelo de
IA serão configurados posteriormente no Ubuntu/WSL.

## Acesso

Site: **https://domingodecafe.github.io/Agenda-Ana/**

Entre com o e-mail administrativo autorizado e sua senha do Supabase Auth.
O perfil exibido é HenriqueFerreira. Para o primeiro acesso, use **Criar minha
conta**, confirme o e-mail e entre. O código não contém e-mail privado, senha
administrativa, chave privilegiada ou token de acesso.

O painel **Ana** reúne pendências, atendimentos assumidos e histórico. Assumir
um atendimento pausa a automação daquele contato; devolver aguarda uma nova
mensagem. Os agentes ainda não estão ativos e nenhuma mensagem externa é enviada.

## Sincronização e consulta offline

- Uma gravação só é confirmada após a resposta do servidor.
- Cada aparelho mantém um canal Realtime com avisos contendo somente proprietário,
  revisão e data. Os dados são buscados separadamente pela API autenticada.
- Ao voltar ao aplicativo ou reconectar, a versão do servidor é consultada.
- Eventos próximos são agrupados por 100 ms; falhas usam espera progressiva
  de 1 a 30 segundos, sem consultas contínuas.
- O cache offline é separado por conta, identifica a última sincronização e
  permite somente consulta. Salvar exige conexão. O logout remove o cache da conta.
- Formulários abertos são preservados; uma gravação baseada em revisão antiga é
  recusada. Revise e reaplique a alteração sobre os dados atuais.

## Desenvolvimento no Ubuntu/WSL

1. Instale Ubuntu pelo WSL no Windows e abra a pasta do projeto no Cursor conectado
   ao Ubuntu. Não copie `node_modules` do Windows para o Linux.
2. Instale Git, Node.js 24 e pnpm 11.25.0. Com Node/npm disponível:
   `npm install --global pnpm@11.25.0`.
3. Clone este repositório e execute:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm build
pnpm preview
```

Prévia: http://127.0.0.1:43189/ana-app/. O servidor escuta apenas no próprio
computador e entrega somente o pacote público em `site/`.

O Supabase continua acessível quando o computador dos agentes está desligado.
Essa máquina futura executará os agentes; ela não será necessária para manter
a interface e a agenda disponíveis. Pedidos permanecem pendentes até resolução.

## Estrutura e segurança

`ana-public-config.js` contém somente URL e chave **publishable**, que são públicas.
O proprietário é validado no servidor. A chave privilegiada existe somente no
ambiente da Edge Function, nunca no navegador ou no agente.

As novas tabelas `ana_app_state`, `ana_app_events`, `ana_app_agents` e
`ana_app_tool_contexts` têm RLS. O estado integral não pode ser consultado
diretamente pelo cliente. `ana_private.admin_emails` é uma autorização privada;
somente contas com e-mail confirmado podem obter acesso administrativo.

As consultas administrativas usam um RPC protegido que reúne autorização e leitura
em uma ida ao banco. As gravações passam pelas regras da aplicação e pelo CAS
`ana_app_commit`, que salva estado e evento atomicamente. Não há alteração de
`agenda_snapshots`, da publicação ou do armazenamento da Agenda original.

As ferramentas dos futuros agentes aceitam apenas operações autorizadas. A
identidade do contato vem de `ana_app_tool_contexts`, criado por um canal confiável;
número, paciente e papel não podem ser escolhidos pelo modelo. Agentes não recebem
o snapshot, observações ou sessão administrativa. Nenhum agente vem habilitado.

O número digitável no painel de configuração é um simulador exclusivo do
administrador. Ele não autentica contatos reais.

## Implantação

A função `agenda-ana` utiliza os arquivos em `supabase/functions/agenda-ana/` e os
módulos compartilhados da raiz. A autenticação é realizada dentro da função com
validação criptográfica do JWT e autorização atual no banco. O gateway pode ter
`verify_jwt=false` porque a função faz sua própria verificação; pedidos sem sessão
ou sem autorização são recusados.

Para outra implantação, aplicar primeiro os SQLs `ana-app-schema.sql` e
`ana-app-fast-read.sql` em um projeto dedicado. Inserir o e-mail administrativo
somente no cadastro privado do servidor. Nunca colocar essa autorização em uma
migração pública com o e-mail real.

Configuração de Auth: Site URL `https://domingodecafe.github.io/Agenda-Ana/` e
redirects permitidos para esse endereço e `http://127.0.0.1:43189/ana-app/`.
Esses valores devem ser conferidos no painel do projeto antes dos fluxos de
confirmação de e-mail e recuperação de senha. Não mudar a conta administrativa
ou a senha através de arquivos do projeto.

GitHub Actions publica exclusivamente `site/`. O pacote não inclui testes,
SQL, configuração privada, backups, documentação interna ou dados de pacientes.
O GitHub Pages contém apenas a interface estática; dados permanecem no Supabase.

## Custos e operação

O projeto utiliza o plano Free. Não há serviços pagos nem modelos de IA ativados.
Realtime inclui 2 milhões de mensagens/mês e 200 conexões simultâneas no plano
gratuito. Monitorar consumo no painel; o código não faz upgrades automáticos.
Projetos gratuitos podem pausar após uma semana sem atividade.

Notificações com o aplicativo fechado, WhatsApp, modelo de linguagem, execução
contínua dos agentes e agendador persistente de lembretes ficam para a próxima fase.
O fluxo de relatos de sofrimento do simulador não é um protocolo clínico validado.

## Testes

`pnpm test` executa as verificações locais sem credenciais remotas. Os testes
incluem privacidade, concorrência, permissões dos agentes, offline, cache por conta,
idempotência e preservação de pagamentos.

`tests/database-isolation.sql` usa fixtures dentro de uma transação revertida.
`tests/cloud.integration.mjs` é um teste manual separado: exige duas contas
fictícias descartáveis e um arquivo local ignorado em `test-results/`. Não se
executa automaticamente no CI e nunca deve usar pacientes reais. As contas de
teste devem ser revogadas e removidas após a validação.

No teste inicial completo, 13 verificações reais passaram. A propagação Realtime
com busca dos dados no segundo cliente levou 1,81 segundo em uma medição; o tempo
varia com a rede e não constitui garantia.

Referências: [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes),
[preços](https://supabase.com/docs/guides/realtime/pricing),
[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
