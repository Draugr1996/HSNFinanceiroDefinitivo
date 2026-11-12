# Financeiro HSN 9.9 — Cobrança manual e reenvio controlado

Esta atualização preserva a central DDA e a conciliação da versão 9.7/9.8 e libera a cobrança manual no módulo Sicoob.

## O que mudou

- Você pode iniciar uma cobrança antes ou depois do vencimento.
- Um boleto já cobrado pode receber novo aviso quando você solicitar novamente.
- O botão passa a mostrar **Reenviar cobrança** para títulos marcados como cobrados.
- O sistema identifica o último envio confirmado no histórico novo ou no histórico legado e registra cada novo envio como uma operação separada.
- Cada envio continua exigindo prévia e duas confirmações na tela.
- O servidor valida os dados do título, destinatários, histórico e autorização assinada antes de chamar o Zoho.
- Títulos marcados como pagos ou cancelados continuam bloqueados.
- Tentativas em processamento ou com resultado incerto continuam bloqueadas até conferência manual no Zoho.
- Após o Zoho confirmar o envio, o título fica com status `sent` e `sent_at` atualizado.

## Arquivos alterados

- `index.html`
- `js/sicoob-collections.js`
- `service-worker.js`
- `supabase/functions/zoho-send-mail/index.ts`

## Instalação

1. Faça backup do repositório e do Supabase.
2. Atualize o site no GitHub Pages com os arquivos do projeto.
3. No Supabase, abra **Edge Functions → zoho-send-mail**.
4. Substitua o código da função pelo conteúdo de `supabase/functions/zoho-send-mail/index.ts` e faça o deploy.
5. Não é necessária uma nova variável de ambiente nem migração SQL para estas alterações. A função usa as mesmas tabelas, variáveis e credenciais já presentes no código recebido.
6. Atualize o site com recarga forçada (Ctrl+F5) ou feche e abra novamente o navegador.

## Como usar

1. Entre em **Cobranças Sicoob**.
2. Abra a aba **Pendentes** ou **Cobrados**.
3. Clique em **Enviar cobrança individual** ou **Reenviar cobrança**.
4. Confira empresa, documento, vencimento, valor e destinatários.
5. Confirme o envio na segunda etapa.

O lote também aceita títulos já cobrados, respeitando o limite atual de até 5 por operação.

## Regras de segurança

- O DDA ou a data de vencimento não disparam e-mails automaticamente.
- O operador decide quando enviar ou reenviar e confirma cada operação.
- Títulos pagos/cancelados não podem ser cobrados enquanto permanecerem nesses status.
- Se uma tentativa estiver `processing` ou `review`, ou o resultado do Zoho for incerto, o sistema exige conferência na pasta **Enviados** antes de nova tentativa.
- O histórico não é apagado nem reescrito; cada reenvio confirmado ganha seu próprio registro em `hsn_send_jobs`.

## Validação desta entrega

- Testes locais: `node tests/test-sicoob-recovery.cjs`, `node tests/test-zoho-manual-resend.cjs`, `node tests/test-dda-status.cjs`, `node tests/test-auto-reconcile.cjs`, `node tests/test-bank-file-proof.cjs`.
- Sintaxe TypeScript da Edge Function verificada por transpilation.
- Sintaxe JavaScript do módulo de cobranças verificada com Node.
- Regras locais verificadas: vencimento futuro permitido, status `sent` permitido, `paid` e `cancelled` bloqueados.
- A implantação no Supabase e o envio real pelo Zoho ainda precisam ser validados no ambiente do hotel. Nenhum e-mail foi enviado durante a preparação deste pacote.
