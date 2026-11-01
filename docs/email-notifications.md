# Notificações por e-mail do Briefings

## Envio de mensagens de utilizadores

O website envia as mensagens do formulário Feedback e os pedidos de desbloqueio
através do serviço Resend. A mensagem é **sempre guardada no Supabase primeiro**;
se o Resend estiver temporariamente indisponível, a mensagem permanece visível no
painel Admin. O envio foi tornado idempotente por identificador da mensagem.

## Configuração (Vercel)

Em **briefings-next → Settings → Environment Variables**, configurar:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `RESEND_API_KEY` | Secret/Sensitive | Chave `re_...` criada no Resend com permissão *Sending access* |
| `ADMIN_NOTIFICATION_EMAIL` | Secret/Config | Endereço onde o administrador recebe os alertas |
| `ADMIN_NOTIFICATION_FROM` | Secret/Config | Ex.: `Briefings <avisos@dominio-verificado.pt>` |

Usar os ambientes **Preview** e **Production** para ensaio e operação.
Nunca guardar a chave no GitHub nem num ficheiro `.env` versionado. Depois de
alterar variáveis Vercel, fazer um novo deployment para as aplicar.

O domínio do remetente precisa de estar verificado no Resend para utilização
normal. O endereço de teste `onboarding@resend.dev` tem restrições de entrega.

## Monitor das cartas AEMET

O endpoint interno `POST /api/internal/aemet-monitor` usa uma credencial própria
(`AEMET_MONITOR_TOKEN`) partilhada entre a Vercel e o Supabase Vault, nunca
exposta ao browser. Consulta os ficheiros já existentes no bucket privado.

- SIGWX: alerta se a validade mais recente tiver mais de 9 horas de atraso.
- Wind/Temp: alerta se um dos níveis FL020/050/100/150 não tiver uma execução
  de modelo nos últimos 18 horas.
- Uma mensagem ao detetar anomalia; durante uma falha persistente, lembrete no
  máximo uma vez a cada 24 horas; mensagem adicional quando recuperar.
- O estado do alerta fica guardado em `public.aemet_alert_state`, sem acessos
  anónimos ou de utilizadores finais.

As margens evitam tratar o 404 normal de uma carta ainda não publicada pela
AEMET como falha. O monitor verifica a **atualidade dos dados disponíveis**,
não garante que todas as tentativas isoladas do Collector tenham sucesso.

**Ativação do cron:** após confirmar Resend e publicar o endpoint em Produção,
executar `supabase/aemet_email_monitor_cron.sql` (agendamento de 2 em 2 horas,
às xx:15 UTC). Enquanto a funcionalidade estiver apenas em Preview, o cron
não deverá ser ativado contra a Produção antiga, que ainda não contém a rota.

**Teste manual:** fazer POST autenticado à rota com `{"dry_run":true}` para
obter o diagnóstico sem alterar o estado ou enviar e-mails. Depois testar o
envio real com uma mensagem no formulário e uma simulação controlada de falha
e recuperação antes de depender dos alertas.
