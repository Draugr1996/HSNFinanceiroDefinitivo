-- HSN 8.6 | Fluxo de programação e assinatura de pagamentos
-- Execute UMA VEZ no SQL Editor do Supabase do Financeiro HSN.
-- Não altera os valores, boletos, comprovantes nem situações de pagamento existentes.
-- Mantém as políticas RLS da tabela public.payables.
BEGIN;

ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS workflow_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_scheduled_date date,
  ADD COLUMN IF NOT EXISTS workflow_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payables_workflow_status_check'
      AND conrelid = 'public.payables'::regclass
  ) THEN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_workflow_status_check
      CHECK (workflow_status IN (
        'pending',
        'awaiting_signature',
        'scheduled_signature',
        'scheduled',
        'approved',
        'cancelled'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payables_workflow_status
ON public.payables(owner_id, workflow_status);

COMMIT;

-- Verificação opcional:
-- SELECT workflow_status, count(*) FROM public.payables GROUP BY workflow_status ORDER BY workflow_status;
