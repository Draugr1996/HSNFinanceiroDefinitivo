# Financeiro HSN 9.7 — DDA + conciliação com baixa automática controlada

**Comece em `LEIA-ME-HSN-9-7-BAIXA-AUTOMATICA.txt`.** Esta versão amplia o Financeiro HSN 9.6 e mantém a conciliação OFX/CSV.

## O que mudou

- Central DDA com caminho direto para conciliação, mantendo importação XLS/XLSX/CSV e classificação informada pela origem.
- Conciliação OFX/CSV com triagem indexada, indicadores por situação e botão de registro em lote para correspondências documentalmente fortes.
- Validação de débito com valor real exato, referência bancária estável, título DDA único, conta existente e dados de beneficiário/código de barras presentes no extrato.
- CSV com movimentações liquidadas: exige saldo da movimentação ou situação liquidada com identificador explícito de transação. Um simples CSV de DDA/agendamento não desencadeia baixa.
- Baixas gravadas por função SQL transacional com bloqueio de duplicidade, trilha de auditoria e consulta do histórico no painel.
- Coluna `dda_charges.linked_payable_id` para vincular cobrança DDA a conta preexistente, sem converter em nova conta duplicada.

## Instalação

1. Faça backup dos arquivos e do banco.
2. No Supabase SQL Editor, aplique a migração **`sql/HSN-9-7-conciliacao-automatica.sql`**, após as migrações 8.6 e 9.6.
3. Atualize o site no GitHub Pages, incluindo `js/hsn97-auto-reconcile.js`, `js/hsn90-modules.js`, `css/hsn97-auto-reconcile.css`, `index.html`, `service-worker.js`, `js/phase4.js` e `js/hsn96-dda-intel.js`.
4. Na Central DDA, importe o relatório do banco. Depois clique **Conciliar DDA + extrato**, importe OFX/CSV e confirme as baixas identificadas no painel.

## Limites e controles

O DDA **não** é comprovante de pagamento. Não há acesso em tempo real ao Sicoob, nem autorização/execução de transferências: o aplicativo trabalha com os arquivos importados. A baixa **não ocorre silenciosamente ao importar**: o operador confirma um lote com evidência bancária; situações ambíguas seguem para revisão manual. O backend verifica novamente os dados e rejeita operações duplicadas.

Testes locais: `node tests/test-auto-reconcile.cjs`, `node tests/test-bank-file-proof.cjs`, `node tests/test-dda-status.cjs`. A migração SQL e a operação contra o Supabase do hotel **não foram executadas/testadas** nesta sessão.
