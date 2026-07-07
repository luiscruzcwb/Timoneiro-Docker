# Notificações

O Timoneiro envia notificações por meio do [Shoutrrr](https://containrrr.dev/shoutrrr/), com suporte a uma ampla gama de serviços. Configure os canais em **Configurações** → **Notificações**.

## Quando as Notificações São Enviadas

### Resumo por Ciclo de Verificação (batch)

Ao final de cada ciclo de verificação (padrão: a cada 5 minutos), o Timoneiro envia **uma única notificação consolidada** com o resultado de todos os containers, semelhante ao formato do Watchtower:

```
Timoneiro — ciclo de verificacao · 13 containers
----------------------------------------------------

Atualizacoes disponiveis (1):
  prometheus   prom/prometheus:latest

Em dia (12):
  influxdb · alertmanager · portainer · cadvisor
  node-exporter · grafana · uptime-kuma · jaeger
  ...
```

O resumo **só é enviado quando há algo acionável** — atualizações disponíveis ou erros. Se todos os containers estiverem em dia, nenhuma notificação é enviada, evitando spam.

### Notificações Imediatas (por evento)

Enviadas na hora, individualmente:

- Uma atualização **aprovada manualmente** na interface é concluída ou falha
- Uma atualização disparada pelo botão **Atualizar** de um container é concluída ou falha
- Um **rollback** é executado

Atualizações aplicadas pelo modo automático são reportadas apenas no resumo do ciclo, sem e-mail individual.

## Serviços Suportados

### Discord

1. Crie um Webhook no seu servidor Discord: **Configurações do Canal → Integrações → Webhooks → Novo Webhook**
2. Copie a URL do Webhook (formato: `https://discord.com/api/webhooks/ID/TOKEN`)
3. No Timoneiro, adicione um canal **Discord** e cole a URL do webhook
4. Clique em **Salvar e Testar**

### Telegram

1. Crie um bot com o [@BotFather](https://t.me/botfather) e obtenha o token
2. Obtenha seu chat ID enviando uma mensagem ao bot e verificando `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. No Timoneiro, adicione um canal **Telegram** com o token do bot e o chat ID
4. Clique em **Salvar e Testar**

### Slack

1. Crie um Incoming Webhook no seu workspace Slack: **Apps → Incoming Webhooks → Adicionar ao Slack**
2. Copie a URL do Webhook (formato: `https://hooks.slack.com/services/T.../B.../...`)
3. No Timoneiro, adicione um canal **Slack** e cole a URL do webhook
4. Clique em **Salvar e Testar**

### E-mail (SMTP)

Configure um servidor SMTP para enviar alertas por e-mail:

| Campo | Descrição |
|-------|-----------|
| Host SMTP | Hostname do servidor de e-mail (ex: `smtp.gmail.com`) |
| Porta | Geralmente `587` (STARTTLS) ou `465` (SSL/TLS) |
| Usuário | Nome de usuário da conta SMTP |
| Senha | Senha da conta SMTP ou senha de aplicativo |
| Remetente | Endereço de envio |
| Destinatário | Endereço(s) de destino, separados por vírgula |
| Criptografia | Nenhuma / STARTTLS / SSL-TLS |

Para o Gmail, use uma [Senha de Aplicativo](https://myaccount.google.com/apppasswords) com a verificação em duas etapas ativada.

### Gotify

1. Crie um aplicativo na sua instância Gotify e copie o token
2. No Timoneiro, adicione um canal **Gotify** com o host e o token
3. Clique em **Salvar e Testar**

### ntfy

O [ntfy](https://ntfy.sh) é um serviço simples de notificações pub/sub.

1. Escolha um nome de tópico (ex: `timoneiro-alertas`)
2. No Timoneiro, adicione um canal **ntfy** com o tópico e, opcionalmente, um host auto-hospedado
3. Clique em **Salvar e Testar**

### Webhook Genérico

Envia um payload JSON para qualquer endpoint HTTP:

```json
{
  "message": "Container nginx atualizado de sha256:abc para sha256:def"
}
```

### Outros Serviços

O Timoneiro também suporta via URL Shoutrrr direta:

- **Pushover**
- **Pushbullet**
- **Rocket.Chat**
- **Mattermost**
- **Matrix**
- **Microsoft Teams**
- **Google Chat**
- **OpsGenie**
- **Zulip**

Para esses serviços, informe a URL de conexão Shoutrrr diretamente. Consulte a [documentação do Shoutrrr](https://containrrr.dev/shoutrrr/services/overview/) para os formatos de URL.

## Testando um Canal

Cada canal possui um botão **Salvar e Testar** que salva a configuração e envia imediatamente uma notificação de teste. Use-o para verificar as credenciais antes de depender do canal para alertas reais.

## Múltiplos Canais

Você pode configurar múltiplos canais simultaneamente. Quando um evento ocorre, o Timoneiro tenta a entrega em todos os canais habilitados. Uma falha em um canal não impede a entrega nos demais.
