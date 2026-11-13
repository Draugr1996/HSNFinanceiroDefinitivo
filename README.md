# Financeiro Hotel Serra Negra — versão 10

Atualização do sistema existente: contas a receber integradas ao Sicoob, baixas parciais, estornos, conferência bancária e controle da hospedagem/faturamento. Aplicativo estático; não exige Node em produção. Mantém Supabase, Zoho e os módulos existentes.

## Instalação

1. Exporte o banco Supabase e o bucket privado `hsn-documentos`. O ZIP analisado contém código, não o banco nem os PDFs do hotel.
2. Leia `docs/RELATORIO-DA-REVISAO.md`. Execute a consulta `sql/HSN-10-diagnostico.sql` para conferir os dados reais.
3. Em cópia de homologação do projeto existente, execute `sql/HSN-10-integridade-financeira.sql` pelo SQL Editor como administrador. A migração é aditiva, transacional e guarda os registros originais em `hsn10_backup` antes de alterar colunas. As tabelas, configurações e políticas originais precisam existir; não é uma instalação do zero.
4. Confira os testes/fluxos do relatório e as políticas de acesso das tabelas originais. A migração adiciona RLS ao livro financeiro e preserva as políticas existentes.
5. Instale a migração no projeto do hotel e publique o conteúdo da pasta do sistema, com JS, CSS e service worker juntos. Guarde o backup fora da pasta pública. Recarregue com Ctrl+F5; se usar PWA, feche todas as janelas e reabra.

Não apague títulos/histórico. Não restaure apenas o código antigo após usar parcelas: ele não entende esses saldos. Para reverter, use uma cópia separada do banco e confira movimentos posteriores à instalação.

## Uso pela equipe

- **Painel financeiro:** vencimento para obrigações e data efetiva para caixa. Valores previstos e dinheiro recebido são separados.
- **Contas a receber:** complete o título existente com hóspede, reserva, período, documentos e baixas efetivas.
- **Histórico e baixas:** corrija pagamentos por estorno com motivo, preservando o evento original.
- **Faturamento do hotel:** confira documentos e envio pendente no check-out. Os campos de documentos guardam referências conferidas, não anexos. O envio de PDFs continua no módulo Zoho, agora com tipo explícito para cada arquivo.
- **Cobranças Sicoob:** confira o CSV por linha antes de importar. Reenvio usa o mesmo título. Títulos parciais/cancelados são bloqueados para evitar cobrança indevida do valor original.
- **Conferir recebimentos:** importe CSV/OFX, confira conta/referência e confirme o vínculo ao título. Aceita créditos e débitos. Importação não confirma pagamento por semelhança.
- **Contas a pagar:** confirme o valor real da obrigação antes de registrar cada parcela. A baixa não substitui o total original.
- **Cópia dos dados financeiros:** o painel exporta JSON com títulos, baixas, banco, importações e histórico. Exporte também os PDFs/imagens no módulo de backups existente.

## Testes

`npm install` instala dependências de desenvolvimento. `npm test` executa regras, PostgreSQL WASM/PGlite e formulários/DOM ligados ao mesmo banco simulado. Não acessa o banco do hotel nem envia e-mails. Resultados em `docs/sql-results.json` e `docs/dom-results.json`.

`npm run test:browser` é opcional e exige Chromium (`CHROMIUM_PATH`). O ambiente da revisão bloqueou inicialização/conexão do navegador. Layout renderizado, PWA, banco real e e-mails precisam de homologação.

## Infraestrutura externa ausente no ZIP

O README anterior citava `sql/HSN-sicoob-reenvio.sql` e `supabase/functions/zoho-send-mail/index.ts`; esses arquivos não vieram. O aplicativo usa as funções publicadas `zoho-send-mail` e `zoho-billing-mail`, `hsn_send_jobs` e rotinas auxiliares. Os contratos foram preservados; confira essa instalação no Supabase do hotel antes de homologar reenvios reais. Não foram inventadas credenciais nem substituídas funções de produção desconhecidas.
