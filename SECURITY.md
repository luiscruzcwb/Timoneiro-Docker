# Política de Segurança

## Versões com Suporte

Apenas a versão mais recente do Timoneiro recebe correções de segurança.

| Versão | Suportada |
|--------|-----------|
| latest | ✅ |
| antigas | ❌ |

## Reportando uma Vulnerabilidade

**Por favor, não reporte vulnerabilidades de segurança através de issues públicas no GitHub.**

Para reportar uma vulnerabilidade, envie um e-mail para **contato@luiscruz.com.br** com:

- Descrição da vulnerabilidade
- Passos para reproduzir
- Impacto potencial
- Sugestão de correção (se houver)

Você receberá uma resposta em até 72 horas. Se a vulnerabilidade for confirmada, uma correção será lançada o mais rápido possível e você será creditado nas notas da versão (a menos que prefira permanecer anônimo).

## Considerações de Segurança

### Acesso ao Socket Docker

O Timoneiro requer acesso de leitura ao socket Docker (`/var/run/docker.sock`) para listar e atualizar containers. Isso concede privilégios significativos no sistema host. Instale o Timoneiro apenas em redes confiáveis.

Para ambientes remotos, use o **Agente Timoneiro** em vez de expor o socket Docker diretamente via TCP.

### Armazenamento de Dados

O Timoneiro armazena configurações, incluindo credenciais de registries e tokens de notificação, em um banco de dados SQLite local. Proteja o arquivo do banco de dados e o volume onde ele reside.

### Exposição de Rede

Por padrão, o Timoneiro escuta na porta `8080` sem autenticação. É fortemente recomendado colocá-lo atrás de um proxy reverso (nginx, Caddy, Traefik) com HTTPS e autenticação ao expô-lo fora de uma rede local confiável.
