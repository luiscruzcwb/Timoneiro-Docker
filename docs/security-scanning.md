# Varredura de Segurança

O Timoneiro verifica automaticamente novas versões de imagens em busca de CVEs (Common Vulnerabilities and Exposures) conhecidas, usando o [Trivy](https://github.com/aquasecurity/trivy) da Aqua Security.

## Como Funciona

Quando uma atualização pendente é detectada, o Timoneiro aciona uma varredura Trivy da nova versão da imagem em segundo plano. Os resultados são anexados à entrada de atualização pendente e exibidos nas páginas **Atualizações** e **Segurança**.

As contagens de CVEs são exibidas por severidade:

| Badge | Severidade | Descrição |
|-------|-----------|-----------|
| 🔴 Crítico | CRITICAL | Ativamente explorado, ação imediata necessária |
| 🟠 Alto | HIGH | Alto impacto, priorize a correção |
| 🟡 Médio | MEDIUM | Impacto moderado, corrija quando possível |
| 🔵 Baixo | LOW | Baixo impacto, informativo |

## Requisitos

O Trivy deve estar disponível no container do Timoneiro. Há duas formas de satisfazer esse requisito:

### Opção 1: Binário Trivy (Recomendado)

Se o binário `trivy` estiver presente no `PATH` dentro do container, ele é utilizado diretamente. A imagem oficial `ghcr.io/luiscruzcwb/timoneiro` não inclui o Trivy por padrão para manter o tamanho da imagem reduzido.

Para criar uma imagem personalizada com Trivy:

```dockerfile
FROM ghcr.io/luiscruzcwb/timoneiro:latest
RUN apk add --no-cache curl && \
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```

### Opção 2: Varredura via Docker (Alternativa)

Se `trivy` não for encontrado no PATH, o Timoneiro utiliza o Trivy como container Docker como alternativa:

```bash
docker run --rm aquasec/trivy image <nome-da-imagem>
```

Isso requer que o socket Docker esteja montado:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

A alternativa via Docker faz o pull da imagem Trivy no primeiro uso e a armazena em cache localmente.

## Visualizando os Resultados

### Página de Atualizações

Cada card de atualização pendente exibe um badge com o resumo de CVEs, caso vulnerabilidades sejam encontradas. Clique na atualização para ver o detalhamento completo por severidade e pacote.

### Página de Segurança

A página **Segurança** agrega todos os dados de CVEs das atualizações pendentes. Filtre por severidade e ordene por container ou quantidade de vulnerabilidades para priorizar o que corrigir.

## Desativando a Varredura de CVEs

A varredura de CVEs está habilitada por padrão. Ela é executada de forma assíncrona e não bloqueia o fluxo de atualização. Se a varredura falhar (por exemplo, sem acesso à rede para o banco de dados de vulnerabilidades do Trivy), a atualização ainda é listada normalmente, sem os dados de CVE.

Atualmente não há opção de configuração para desativar a varredura de CVEs globalmente; ela simplesmente é executada quando o Trivy está disponível e ignorada silenciosamente quando não está.
