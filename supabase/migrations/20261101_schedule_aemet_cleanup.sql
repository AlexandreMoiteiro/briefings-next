-- Uma execução diária, sem recursos novos: aproveita pg_cron, pg_net e o
-- segredo no Vault já usados por outros processos deste projeto.
-- 04:45 UTC evita coincidir com a recolha das cartas às xx:20.
select cron.schedule(
  'cleanup-aemet-charts-daily',
  '45 4 * * *',
  $$
    select net.http_post(
      url := 'https://xyyodgojcrdkleuyicjn.supabase.co/functions/v1/cleanup-aemet-charts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-briefings-cron-token', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'briefings_aemet_runner_token'
        )
      ),
      body := '{"dry_run":false}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
