# Contribuindo com o Timoneiro

Obrigado pelo interesse em contribuir! Este documento cobre o processo para reportar problemas, propor funcionalidades e enviar código.

## Reportando Problemas

Antes de abrir uma issue, verifique as [issues existentes](https://github.com/luiscruzcwb/Timoneiro-Docker/issues) para evitar duplicatas.

Ao reportar um bug, inclua:

- Versão do Timoneiro (exibida ao lado do logo no menu superior)
- Versão do Docker (`docker version`)
- Como você instalou o Timoneiro (docker run, Compose, etc.)
- Passos para reproduzir
- Comportamento esperado vs. comportamento real
- Logs relevantes (`docker logs timoneiro`)

## Propondo Funcionalidades

Abra uma [discussão no GitHub](https://github.com/luiscruzcwb/Timoneiro-Docker/discussions) ou uma issue com a tag `enhancement` informando:

- O problema que você quer resolver
- Sua solução proposta
- Alternativas que considerou

## Configuração do Ambiente de Desenvolvimento

**Requisitos:** Go 1.22+, Node.js 18+, Docker

```bash
git clone https://github.com/luiscruzcwb/Timoneiro-Docker.git
cd Timoneiro-Docker

# Backend
go build ./...

# Frontend
cd web && npm install && npm run dev

# Execução completa com Docker (recomendado para integração)
docker compose up --build
```

### Estrutura do Projeto

```
cmd/timoneiro/:    entrypoint principal
cmd/agent/:        binário do agente remoto
internal/
  api/:            handlers HTTP e WebSocket hub
  db/:             schema SQLite e queries
  engine/:         loop de monitoramento, CVE scanning, execução de atualizações
  notifications/:  gerenciador de notificações via Shoutrrr
pkg/
  container/:      wrapper do cliente Docker
  registry/:       autenticação e comparação de digest de registry
  types/:          interfaces e tipos compartilhados
web/:              frontend React + TypeScript (Vite)
docs/:             documentação (MkDocs)
```

## Enviando Pull Requests

1. Faça um fork do repositório e crie uma branch a partir de `main`
2. Faça suas alterações com commits claros e focados
3. Verifique se o backend compila: `go build ./...`
4. Verifique se o frontend passa na checagem de tipos: `cd web && npx tsc --noEmit`
5. Abra um pull request descrevendo o que mudou e por quê

### Estilo de Código

- **Go**: formatação padrão `gofmt`; siga os padrões existentes nos handlers
- **TypeScript/React**: consistente com o estilo dos componentes existentes (sem novas bibliotecas de UI externas sem discussão prévia)
- **Commits**: escreva mensagens de commit concisas e precisas

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE.md).
