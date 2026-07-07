# Registries Privados

O Timoneiro pode monitorar containers que usam imagens de registries privados. As credenciais são armazenadas no banco de dados e usadas automaticamente ao verificar digests de imagem.

## Tipos de Registry Suportados

### Docker Hub (Repositórios Privados)

O Docker Hub permite repositórios privados em planos pagos. Use um **Access Token** do Docker Hub (não a senha da conta) para autenticação.

1. Crie um token em [hub.docker.com/settings/security](https://hub.docker.com/settings/security)
2. No Timoneiro, acesse **Configurações** → **Registries** → **Adicionar**
3. Selecione **Docker Hub**
4. Insira seu nome de usuário do Docker Hub e o access token como senha
5. Clique em **Testar conexão** e depois **Salvar**

### GitHub Container Registry (GHCR)

O GHCR é o registry OCI do GitHub em `ghcr.io`. A autenticação usa um **Personal Access Token** do GitHub com o escopo `read:packages`.

1. Crie um token em [github.com/settings/tokens](https://github.com/settings/tokens) com permissão `read:packages`
2. No Timoneiro, acesse **Configurações** → **Registries** → **Adicionar**
3. Selecione **GitHub GHCR**
4. Insira seu nome de usuário do GitHub e o PAT como senha
5. Clique em **Testar conexão** e depois **Salvar**

### Registry Genérico / Auto-hospedado

Para qualquer registry compatível com OCI (Harbor, Nexus, Gitea, etc.):

1. No Timoneiro, acesse **Configurações** → **Registries** → **Adicionar**
2. Selecione **Registry Genérico**
3. Insira o hostname do registry (ex: `registry.exemplo.com.br:5000`)
4. Insira o usuário e a senha
5. Clique em **Testar conexão** e depois **Salvar**

## Como as Credenciais São Usadas

Quando o engine verifica uma imagem em busca de atualizações, as credenciais são resolvidas nesta ordem:

1. Variáveis de ambiente `REPO_USER` / `REPO_PASS` (credencial global única, legado)
2. **Credenciais de registry armazenadas no Timoneiro** (correspondidas pelo hostname do registry)
3. Arquivo de configuração do Docker (`~/.docker/config.json` montado no container)

As credenciais armazenadas no Timoneiro têm prioridade sobre o arquivo de configuração do Docker, então você pode gerenciar tudo pela interface sem precisar modificar arquivos no host.

## Usando as Credenciais do Docker do Host

Se preferir gerenciar credenciais fora do Timoneiro (via `docker login` no host), monte o diretório de configuração do Docker:

```yaml
volumes:
  - /root/.docker/config.json:/root/.docker/config.json:ro
```

ou via variável de ambiente `DOCKER_CONFIG`:

```yaml
environment:
  - DOCKER_CONFIG=/docker-config
volumes:
  - /root/.docker:/docker-config:ro
```

## Segurança

- As senhas dos registries são armazenadas no banco de dados SQLite sem criptografia adicional. Proteja o volume do banco de dados.
- Use tokens com as permissões mínimas necessárias (acesso somente leitura aos registries é suficiente para o Timoneiro).
- As senhas são mascaradas na interface (`••••••••`) e não são retornadas pela API após serem salvas.
