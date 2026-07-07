# API HTTP

!!! info "Para desenvolvedores e automação"
    Esta seção **não corresponde a uma página na interface do Timoneiro**. A API REST é usada internamente pela interface web e está disponível para quem quiser automatizar tarefas, integrar com outras ferramentas ou criar scripts de monitoramento próprios.
    Para usar o Timoneiro como aplicação, acesse a interface em `http://seu-host:8080`.

O Timoneiro expõe uma API REST em `/api/v1` utilizada pela interface web. Você também pode utilizá-la diretamente para automação ou integração com outras ferramentas.

## URL Base

```
http://seu-host-timoneiro:8080/api/v1
```

## Autenticação

Todas as rotas sob `/api/v1` (exceto `/auth/status`, `/auth/setup`, `/auth/login` e `/auth/logout`) exigem uma sessão autenticada. A sessão é um cookie `HttpOnly` (`timoneiro_session`), definido pelo próprio servidor após login — não há token de `Authorization` para automação externa nesta versão.

### Status do Setup

```
GET /auth/status
```

**Resposta:**
```json
{ "needsSetup": true }
```

`needsSetup: true` significa que nenhuma conta de administrador foi criada ainda.

### Criar Conta de Administrador (primeiro acesso)

```
POST /auth/setup
```

```json
{ "username": "admin", "password": "senha-forte-aqui" }
```

Só funciona enquanto nenhuma conta existir (retorna `403` depois da primeira vez). Cria a conta única de administrador e já autentica, definindo o cookie de sessão.

### Login

```
POST /auth/login
```

```json
{ "username": "admin", "password": "senha-forte-aqui" }
```

Define o cookie de sessão (válido por 7 dias) em caso de sucesso. Retorna `401` para credenciais inválidas.

### Logout

```
POST /auth/logout
```

Invalida a sessão atual e limpa o cookie.

### Usuário Atual

```
GET /auth/me
```

Requer sessão válida. Retorna `{ "username": "admin" }` ou `401` se não autenticado.

### Trocar Senha

```
POST /auth/change-password
```

```json
{ "currentPassword": "senha-atual", "newPassword": "nova-senha-forte" }
```

Requer sessão válida e a senha atual correta. Ao trocar a senha, todas as sessões ativas (incluindo a atual) são invalidadas — é necessário logar novamente.

## Containers

### Listar Containers

```
GET /containers
```

Retorna todos os containers monitorados em todos os ambientes.

**Resposta:**

```json
[
  {
    "id": "abc123...",
    "environmentId": 1,
    "name": "nginx",
    "image": "nginx:latest",
    "status": "update_available",
    "currentDigest": "sha256:...",
    "latestDigest": "sha256:...",
    "tags": "[]",
    "lastChecked": "2025-01-15T10:00:00Z",
    "lastUpdated": "2025-01-14T08:30:00Z"
  }
]
```

**Valores de status:** `up_to_date` | `update_available` | `updating` | `failed` | `unknown` | `local`

### Disparar Verificação

```
POST /containers/check
```

Dispara um ciclo de verificação imediato para todos os ambientes, fora do intervalo normal.

### Atualizar um Container

```
POST /containers/{id}/update
```

Faz imediatamente o pull e aplica a imagem mais recente para o container especificado.

### Reverter um Container

```
POST /containers/{id}/rollback
```

Reverte o container para a sua imagem anterior (da última atualização bem-sucedida).

### Atualizar Tags do Container

```
PATCH /containers/{id}/tags
```

**Body:**
```json
{ "tags": ["produção", "crítico"] }
```

Tags definidas pelo usuário para filtragem e rotulagem na interface.

## Atualizações (Pendentes)

### Listar Atualizações Pendentes

```
GET /updates?status=pending&environmentId=1
```

**Parâmetros de consulta:**

| Parâmetro | Valores | Descrição |
|-----------|---------|-----------|
| `status` | `pending`, `approved`, `ignored`, `deploying`, `deployed`, `failed` | Filtrar por status |
| `environmentId` | inteiro | Filtrar por ambiente |

### Aprovar uma Atualização

```
POST /updates/{id}/approve
```

Move a atualização para o status aprovado e dispara a implantação.

### Ignorar uma Atualização

```
POST /updates/{id}/ignore
```

Marca a atualização como ignorada; ela não será aplicada a menos que uma nova atualização seja detectada.

### Salvar Observações de uma Atualização

```
PATCH /updates/{id}/notes
```

**Body:**
```json
{ "notes": "Security patch para CVE-2026-1234; validado em staging." }
```

Campo de texto livre para registrar contexto, motivo ou riscos da atualização. O valor é retornado no campo `notes` de `GET /updates`.

## Ambientes

### Listar Ambientes

```
GET /environments
```

### Criar Ambiente

```
POST /environments
```

```json
{
  "name": "Produção",
  "host": "tcp://prod-server:2376",
  "type": "tcp",
  "token": ""
}
```

### Testar Conexão

```
POST /environments/test
```

```json
{
  "host": "unix:///var/run/docker.sock",
  "type": "socket"
}
```

**Resposta:**
```json
{ "ok": true, "host": "unix:///var/run/docker.sock", "apiVersion": "1.43" }
```

### Atualizar Ambiente

```
PUT /environments/{id}
```

### Excluir Ambiente

```
DELETE /environments/{id}
```

### Listar Containers de um Ambiente

```
GET /environments/{id}/containers
```

Retorna apenas os containers monitorados do ambiente especificado.

## Histórico

### Listar Histórico de Atualizações

```
GET /history?limit=50&offset=0&environment=1&container=abc123
```

**Parâmetros de consulta:**

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `limit` | `50` | Número de registros a retornar |
| `offset` | `0` | Deslocamento para paginação |
| `environment` | — | Filtrar por ID de ambiente |
| `container` | — | Filtrar por ID de container |

## Configurações

### Obter Configurações de Política

```
GET /settings
```

### Atualizar Configurações de Política

```
PUT /settings
```

```json
{
  "updateMode": "manual",
  "versionPolicy": {
    "major": false,
    "minor": true,
    "patch": true
  },
  "containerExceptions": [],
  "stackExceptions": [],
  "maintenanceWindows": []
}
```

## Notificações

### Listar Canais

```
GET /notifications/channels
```

### Criar Canal

```
POST /notifications/channels
```

```json
{
  "name": "Alertas Discord",
  "type": "discord",
  "config": "discord://token@channel",
  "enabled": true
}
```

### Atualizar Canal

```
PUT /notifications/channels/{id}
```

### Excluir Canal

```
DELETE /notifications/channels/{id}
```

### Testar Canal

```
POST /notifications/channels/{id}/test
```

Envia uma notificação de teste para o canal configurado.

## Registries

### Listar Registries

```
GET /registries
```

As senhas são mascaradas na resposta.

### Criar Registry

```
POST /registries
```

```json
{
  "name": "Docker Hub",
  "type": "dockerhub",
  "username": "meuusuario",
  "password": "dckr_pat_..."
}
```

### Testar Credenciais de Registry

```
POST /registries/test
```

```json
{
  "type": "dockerhub",
  "username": "meuusuario",
  "password": "dckr_pat_..."
}
```

**Resposta:**
```json
{ "ok": true, "message": "Credenciais válidas" }
```

### Atualizar Registry

```
PUT /registries/{id}
```

### Excluir Registry

```
DELETE /registries/{id}
```

## WebSocket

### Conectar

```
GET /api/v1/ws
```

Faça o upgrade para WebSocket. O servidor transmite eventos em tempo real como mensagens JSON:

```json
{
  "type": "container.status_changed",
  "data": {
    "containerId": "abc123",
    "containerName": "nginx",
    "status": "update_available",
    "environmentId": 1
  }
}
```

**Tipos de eventos:**

| Tipo | Descrição |
|------|-----------|
| `container.status_changed` | Status do container foi atualizado |
| `update.started` | Uma atualização ou rollback foi iniciado |
| `update.completed` | Uma atualização ou rollback foi concluído com sucesso |
| `update.failed` | Uma atualização ou rollback falhou |
| `cve.scan_completed` | Resultados de varredura CVE disponíveis para uma atualização |
