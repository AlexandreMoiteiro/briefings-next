-- Ativar APENAS depois de publicar a versão do site que inclui
-- /api/internal/aemet-monitor e configurar os endereços e a chave Resend.
-- O segredo privado já existe no Supabase Vault.
-- Não confundir com o cron diário que apaga cartas caducadas.
select cron.schedule(
  'monitor-aemet-email-every-two-hours',
  '15 */2 * * *',
  $$
    select net.http_post(
      url := 'https://briefings-next-delta.vercel.app/api/internal/aemet-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'briefings_aemet_monitor_token'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
