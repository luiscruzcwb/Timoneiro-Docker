# Timoneiro

**Mantendo seus containers no rumo certo.**

O Timoneiro é um gerenciador de atualizações de containers Docker auto-hospedado. Ele monitora seus containers em execução e te avisa, ou os atualiza automaticamente, sempre que uma versão mais nova de imagem estiver disponível no registry.

Diferente de ferramentas apenas de linha de comando, o Timoneiro vem com uma interface web completa para visualizar o status dos containers, aprovar atualizações, revisar resultados de scan de CVEs, configurar políticas de atualização, gerenciar canais de notificação e auditar cada mudança.

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

Acesse [http://localhost:8080](http://localhost:8080). No primeiro acesso, crie a conta de administrador (veja [Autenticação](authentication.md)); depois disso, o Timoneiro já começa a monitorar o host Docker local imediatamente.

## Funcionalidades

| Funcionalidade | Descrição |
|----------------|-----------|
| **Interface Web** | Dashboard completo com status em tempo real, fila de atualizações e trilha de auditoria |
| **Autenticação** | Login protegendo toda a interface e API, conta única de administrador |
| **Políticas de atualização** | Automática, aprovação manual ou agendada dentro de janelas de manutenção |
| **Scan de CVEs** | Relatórios de vulnerabilidades com Trivy para cada atualização pendente |
| **Rollback** | Reversão com um clique para a imagem anterior |
| **Registries privados** | Credenciais para Docker Hub, GHCR e qualquer registry OCI |
| **Notificações** | Discord, Telegram, Slack, SMTP, Gotify, ntfy, Webhook e mais |
| **Multi-ambiente** | Gerencie múltiplos hosts Docker a partir de uma única instância |

## Documentação

- [Introdução](introduction.md): Como o Timoneiro funciona
- [Início Rápido](quick-start.md): Coloque tudo para rodar em minutos
- [Autenticação](authentication.md): Conta de administrador, sessão e troca de senha
- [Configuração](configuration.md): Variáveis de ambiente e opções
- [Ambientes](environments.md): Socket local, TCP e agente remoto
- [Políticas de Atualização](update-policies.md): Modos automático, manual e agendado
- [Registries Privados](private-registries.md): Credenciais para registries privados
- [Notificações](notifications.md): Canais de alerta e configuração
- [Scan de Segurança](security-scanning.md): Scan de CVEs com Trivy
- [Agente Remoto](agent.md): Monitore containers em outros hosts
- [HTTP API](api.md): Referência da API REST
