# Configuração

O Timoneiro é configurado por variáveis de ambiente. Todas as configurações possuem valores padrão e o serviço funciona sem nenhuma configuração adicional.

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `TIMONEIRO_PORT` | `8080` | Porta HTTP onde a interface web e a API ficam disponíveis |
| `TIMONEIRO_DB_PATH` | `./timoneiro.db` | Caminho para o arquivo de banco de dados SQLite |
| `TIMONEIRO_CHECK_INTERVAL` | `300` | Frequência de verificação de novas imagens (em segundos) |
| `TIMONEIRO_DEBUG` | `false` | Defina como `true` para ativar log detalhado de depuração |

## Configuração Recomendada para Produção

```yaml
services:
  timoneiro:
    image: ghcr.io/luiscruzcwb/timoneiro:latest
    container_name: timoneiro
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"   # bind local, expor via proxy reverso
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - timoneiro_data:/data
    environment:
      - TIMONEIRO_DB_PATH=/data/timoneiro.db
      - TIMONEIRO_PORT=8080
      - TIMONEIRO_CHECK_INTERVAL=300

volumes:
  timoneiro_data:
```

## Intervalo de Verificação

O valor de `TIMONEIRO_CHECK_INTERVAL` controla com que frequência o Timoneiro consulta cada registry em busca de novos digests de imagem. Valores menores significam detecção mais rápida de atualizações, porém mais chamadas à API do registry.

| Valor | Descrição |
|-------|-----------|
| `60`  | 1 minuto: agressivo, pode atingir limites de requisição do Docker Hub |
| `300` | 5 minutos: padrão, adequado para a maioria dos ambientes |
| `3600` | 1 hora: baixa frequência, ideal para ambientes de produção estáveis |

O Docker Hub aplica limites de requisições para pulls não autenticados. Se você monitora muitos containers, aumente o intervalo ou adicione credenciais do Docker Hub na seção **Registries** das Configurações.

## Persistência de Dados

O Timoneiro armazena todo o estado em um único arquivo SQLite:

- Histórico e status atual dos containers
- Histórico de atualizações e trilha de auditoria
- Atualizações pendentes aguardando aprovação
- Configurações de canais de notificação
- Credenciais de registries
- Configurações de políticas de atualização

Sempre monte um volume nomeado (ou bind mount) em `TIMONEIRO_DB_PATH` para persistir os dados entre reinicializações do container.

## Logs

O Timoneiro usa logging estruturado (logrus). Por padrão, apenas o nível `INFO` e acima é registrado. Defina `TIMONEIRO_DEBUG=true` para ativar o nível `DEBUG`, que inclui comparações de digest de imagem, requisições ao registry e decisões de política.

```bash
docker logs -f timoneiro
```
