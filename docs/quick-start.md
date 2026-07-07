# Início Rápido

## Pré-requisitos

- Docker Engine 20.10+
- Uma máquina com acesso à internet para alcançar os registries de containers

## Opção 1: Docker Run

```bash
docker run -d \
  --name timoneiro \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v timoneiro_data:/data \
  ghcr.io/luiscruzcwb/timoneiro
```

Acesse [http://localhost:8080](http://localhost:8080).

No primeiro acesso, a interface pede a criação de uma conta de administrador (usuário + senha). Veja [Autenticação](authentication.md) para detalhes sobre login, troca de senha e como redefinir a senha caso seja perdida.

Depois de criar a conta, o Timoneiro vai descobrir todos os containers em execução no host Docker local e começar a verificar atualizações.

## Opção 2: Docker Compose

Crie um arquivo `docker-compose.yml`:

```yaml
services:
  timoneiro:
    image: ghcr.io/luiscruzcwb/timoneiro:latest
    container_name: timoneiro
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - timoneiro_data:/data
    environment:
      - TIMONEIRO_CHECK_INTERVAL=300   # 5 minutos

volumes:
  timoneiro_data:
```

Depois:

```bash
docker compose up -d
```

## Primeiros Passos na Interface

### 1. Visão Geral (Dashboard)

O Dashboard mostra:

- Total de containers monitorados e distribuição de status
- Atividade recente de atualizações
- Taxa de sucesso das atualizações

### 2. Containers

A página de **Containers** exibe todos os containers em execução com sua imagem, status atual e quando foi a última verificação. Use a barra de busca e os filtros de status para navegar.

### 3. Atualizações

A página de **Atualizações** mostra as atualizações detectadas aguardando revisão. Se a política de atualização estiver em modo **Manual**, você aprova ou ignora cada atualização por aqui.

### 4. Configurações

Em **Configurações**, configure:

- **Canais de notificação**: onde o Timoneiro envia alertas
- **Ambientes**: adicione hosts Docker adicionais para monitorar

Em **Políticas**, configure:

- O modo global de atualização (Automático / Manual / Agendado)
- Quais versões de imagem rastrear — major, minor, patch (configurável; aplicação por semver planejada)
- Janelas de manutenção para atualizações agendadas
- Exceções por container ou por stack

## Excluindo o Próprio Timoneiro

Adicione o label abaixo ao container do Timoneiro para evitar que ele tente se atualizar:

```yaml
labels:
  - "dev.timoneiro.enable=false"
```

## Próximos Passos

- [Autenticação](authentication.md): conta de administrador, sessão e troca de senha
- [Configuração](configuration.md): variáveis de ambiente
- [Ambientes](environments.md): monitorar hosts Docker remotos
- [Políticas de Atualização](update-policies.md): ajustar quando e como as atualizações são aplicadas
- [Notificações](notifications.md): configurar Discord, Telegram, e-mail e mais
