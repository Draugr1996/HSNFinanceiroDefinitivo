# Cobranças Sicoob — reenvio manual

Permite enviar e reenviar cobranças pendentes ou já cobradas, antes ou depois do vencimento. Cada operação exige prévia e confirmação. Títulos pagos/cancelados e tentativas incertas permanecem bloqueados. O histórico combina os envios antigos com os novos registros de hsn_send_jobs.

## Instalação
1. No Supabase, execute sql/HSN-sicoob-reenvio.sql no SQL Editor.
2. Substitua o código da Edge Function zoho-send-mail pelo arquivo supabase/functions/zoho-send-mail/index.ts e publique a função.
3. Atualize os arquivos do site e recarregue com Ctrl+F5.
4. Em Cobranças Sicoob → Cobrados, clique em Reenviar cobrança. Confira os dados e confirme.

A função usa as tabelas e rotinas já referenciadas pelo código fornecido: hsn_send_jobs, hsn_send_claim e hsn_send_finish, além dos cadastros Sicoob e credenciais Zoho existentes. A migração adiciona uma reserva serializada para cobranças e não modifica as rotinas de faturamento. Caso a infraestrutura hsn_send_jobs/hsn_send_claim/hsn_send_finish ainda não esteja instalada, será necessário fornecer sua migração original; esta entrega não recria essas estruturas sem conhecer o esquema atual.

## Verificação
Testes locais de regras de cobrança, assinatura de aprovação e histórico; verificação de sintaxe JavaScript e TypeScript. A implantação, a compatibilidade das rotinas SQL existentes e o envio real precisam ser verificados no Supabase do hotel. Nenhum e-mail real foi enviado.

Não apague registros anteriores para liberar reenvios. Tentativas incertas precisam de conferência na pasta Enviados do Zoho.
