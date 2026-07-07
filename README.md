<div align="center">
  <img src="web/public/timoneiro-icon.svg" width="120" />

  # Timoneiro

  Gerenciador moderno de atualizações de containers Docker com interface web completa.

  [![Go Report Card](https://goreportcard.com/badge/github.com/luiscruzcwb/timoneiro)](https://goreportcard.com/report/github.com/luiscruzcwb/timoneiro)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
  [![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go&logoColor=white)](go.mod)

</div>

O Timoneiro monitora seus containers Docker em execução e te avisa, ou os atualiza automaticamente, sempre que uma nova imagem estiver disponível no registry.

Diferente de ferramentas apenas de linha de comando, o Timoneiro vem com uma interface web completa para visualizar o status dos containers, aprovar atualizações, revisar resultados de scan de CVEs, configurar políticas de atualização, gerenciar canais de notificação e auditar cada mudança.

> **"Mantendo seus containers no rumo certo."**

## Funcionalidades

- **Interface Web**: Dashboard, tabela de containers, fila de atualizações e trilha de auditoria acessíveis pelo navegador
- **Políticas de atualização**: Automática, aprovação manual ou agendada dentro de janelas de manutenção
- **Scan de CVEs**: Varredura de vulnerabilidades com Trivy para cada atualização detectada
- **Rollback**: Reversão com um clique para a imagem anterior
- **Registries privados**: Armazene credenciais para Docker Hub, GHCR e qualquer registry OCI
- **Notificações**: Discord, Telegram, Slack, e-mail (SMTP), Gotify, ntfy, Webhook e mais via [Shoutrrr](https://containrrr.dev/shoutrrr/)
- **Multi-ambiente**: Conecte-se a múltiplos hosts Docker via socket Unix, TCP ou o Agente Timoneiro
- **Exceções por container**: Sobrescreva a política global para containers ou stacks Docker Compose específicos
- **Atualizações em tempo real**: A interface reflete mudanças de status via WebSocket sem necessidade de recarregar

## Início Rápido

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

### Docker Compose

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
      - TIMONEIRO_CHECK_INTERVAL=300

volumes:
  timoneiro_data:
```

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `TIMONEIRO_PORT` | `8080` | Porta do servidor HTTP |
| `TIMONEIRO_DB_PATH` | `./timoneiro.db` | Caminho do banco de dados SQLite |
| `TIMONEIRO_CHECK_INTERVAL` | `300` | Intervalo de verificação de imagens em segundos |
| `TIMONEIRO_DEBUG` | `false` | Ativa log detalhado para depuração |

## Documentação

Documentação completa disponível em **[https://timoneiro.dev](https://timoneiro.dev)** (em breve).

Tópicos:

- [Introdução](docs/introduction.md)
- [Início Rápido](docs/quick-start.md)
- [Configuração](docs/configuration.md)
- [Ambientes](docs/environments.md)
- [Políticas de Atualização](docs/update-policies.md)
- [Registries Privados](docs/private-registries.md)
- [Notificações](docs/notifications.md)
- [Scan de Segurança](docs/security-scanning.md)
- [Agente Remoto](docs/agent.md)
- [HTTP API](docs/api.md)

## Contribuindo

Contribuições são bem-vindas! Veja [CONTRIBUTING.md](CONTRIBUTING.md) para as diretrizes.

## License

Timoneiro is released under the [MIT License](LICENSE.md).
