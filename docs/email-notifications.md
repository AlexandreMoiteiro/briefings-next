# Notificações por email do Briefings

## Serviços de envio

**Brevo** é utilizado para todos os emails enviados pelo Briefings:

- notificações administrativas de feedback (sugestões, perguntas e problemas);
- notificações de criação de conta NavLog e falhas operacionais no registo;
- alertas de atualização e recuperação das cartas AEMET;
- confirmação de conta e recuperação de PIN NavLog (implementação separada).

O website guarda as mensagens de feedback no Supabase antes de tentar enviar
uma notificação administrativa. Se o envio falhar, a mensagem continua
disponível no painel Admin. O envio de uma notificação de registo não deve
impedir o registo de utilizadores.

## Configuração (Vercel)

Em **briefings-next → Settings → Environment Variables**, configurar:

| Nome | Destino |
| --- | --- |
| `BREVO_API_KEY` | API key REST privada do Brevo; produção e Preview |
| `ADMIN_NOTIFICATION_EMAIL` | Email que recebe os alertas administrativos |
| `ADMIN_NOTIFICATION_FROM` | Opcional, remetente verificado no Brevo; por defeito `Briefings <noreply.briefings@gmail.com>` |

`RESEND_API_KEY` deixou de ser utilizada pelo código das notificações; removê-la
da Vercel é uma operação separada a executar depois da migração e verificação.
Nunca guardar chaves de API no repositório.

Os emails de confirmação e recuperação de PIN mantêm `noreply.briefings@gmail.com`
como remetente.

### Duplicação e fiabilidade

As notificações de feedback e registo mantêm uma chave lógica de evento.
A função converte essa chave num UUID determinístico para o parâmetro
`headers.idempotencyKey` do Brevo. Segundo a documentação do Brevo, a janela de
idempotência é limitada a 30 minutos e refere-se a envios batch; **isto não
constitui garantia de entrega exatamente uma vez** em todos os cenários.
Para uma garantia maior seria necessário um mecanismo persistente de outbox
e acompanhamento de eventos de entrega.

Uma resposta HTTP de sucesso do Brevo significa que o serviço aceitou o pedido,
não que a mensagem tenha chegado à caixa de entrada. Consultar os eventos
transacionais no Brevo para diagnosticar mensagens em Spam ou rejeitadas.

## Monitor das cartas AEMET

O endpoint `POST /api/internal/aemet-monitor` usa `AEMET_MONITOR_TOKEN`, uma
credencial privada partilhada entre a Vercel e o Supabase Vault, e consulta
os ficheiros do bucket privado.

- Atrasos da execução Wind/Temp com cobertura disponível: aviso informativo.
- Falta de cobertura suficiente para o período atual/próximas 3 horas:
  alerta crítico.
- Recuperação ou alteração da gravidade: email de transição.
- Lembretes durante o mesmo incidente: no máximo uma vez a cada 24 horas.
- O estado do alerta é guardado em `public.aemet_alert_state`, sem acessos
  anónimos ou de utilizadores finais.

O cron ativo no Supabase verifica de duas em duas horas, aos 35 minutos UTC.
Para diagnóstico sem envio de email ou escrita do estado, utilizar um POST
autenticado com `{"dry_run":true}`.

O monitor não substitui a consulta de fontes meteorológicas oficiais nem
confirma a validade operacional das cartas.
