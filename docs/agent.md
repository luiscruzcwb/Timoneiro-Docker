# Agente Remoto

O Agente Timoneiro é um binário leve que roda em um host Docker remoto e expõe uma API HTTP mínima. A instância principal do Timoneiro se conecta a essa API para monitorar containers naquele host sem precisar expor o socket Docker diretamente pela rede.

## Por Que Usar o Agente?

Expor o socket Docker via TCP (porta 2375) sem TLS é um sério risco de segurança: concede acesso root completo ao host. O Agente resolve isso ao:

- Rodar localmente no host remoto com acesso ao socket Docker via socket Unix
- Expor apenas uma API mínima e orientada a leitura (listar containers, inspecionar, verificar manifests)
- Exigir um Bearer token em cada requisição
- Limitar as requisições (60/minuto por IP) para prevenir abusos

## Configuração

### No Host Remoto

Faça o pull e execute o agente:

```bash
docker run -d \
  --name timoneiro-agent \
  --restart unless-stopped \
  -p 1895:1895 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e TIMONEIRO_AGENT_TOKEN=seu-token-secreto \
  ghcr.io/luiscruzcwb/timoneiro-agent
```

Ou com Docker Compose:

```yaml
services:
  timoneiro-agent:
    image: ghcr.io/luiscruzcwb/timoneiro-agent:latest
    container_name: timoneiro-agent
    restart: unless-stopped
    ports:
      - "1895:1895"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - TIMONEIRO_AGENT_TOKEN=seu-token-secreto
```

### Variáveis de Ambiente do Agente

| Variável | Obrigatório | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `TIMONEIRO_AGENT_TOKEN` | ✅ | - | Bearer token para autenticação |
| `TIMONEIRO_AGENT_PORT` | ❌ | `1895` | Porta em que o agente escuta |

### No Timoneiro

1. Acesse **Configurações** → **Ambientes** → **Adicionar**
2. Selecione **Tipo: Agente**
3. Defina o **Host** como `http://host-remoto:1895` (ou `https://` com proxy reverso)
4. Insira o mesmo token configurado no agente
5. Clique em **Testar conexão** → **Salvar**

## Recomendações de Segurança

1. **Use HTTPS**: Coloque o agente atrás de um proxy reverso com TLS. Nunca use HTTP puro pela internet pública.
2. **Gere um token forte**: Use no mínimo 32 bytes aleatórios: `openssl rand -hex 32`
3. **Bloqueie a porta no firewall**: Permita conexões de entrada apenas a partir do IP do servidor Timoneiro

## Referência da API do Agente

O agente expõe os seguintes endpoints (todos requerem `Authorization: Bearer <token>`):

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/health` | Verificação de saúde: retorna a versão da API Docker |
| `GET` | `/containers` | Listar containers em execução |
| `GET` | `/containers/{id}/inspect` | Inspecionar um container (variáveis de ambiente removidas) |
| `GET` | `/images/{name}/manifest` | Verificar manifest/digest de imagem |
