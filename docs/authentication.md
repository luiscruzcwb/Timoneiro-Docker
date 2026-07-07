# Autenticação

O Timoneiro protege toda a interface e a API por trás de login. Sem uma sessão válida, nenhuma página, configuração, credencial de registry ou ação de atualização fica acessível.

## Primeiro Acesso

Na primeira vez que você abrir o Timoneiro (banco de dados novo, sem nenhuma conta criada), a interface mostra a tela **"Criar conta de administrador"** em vez da tela de login. Escolha um usuário e uma senha (mínimo de 8 caracteres) — essa será a única conta do sistema.

!!! warning "Guarde a senha em local seguro"
    O Timoneiro não tem recuperação de senha por e-mail. Se a senha for perdida, é necessário redefini-la diretamente no banco de dados (veja [Redefinindo a senha](#redefinindo-a-senha-perdida) abaixo).

Depois de criada, a tela de setup não aparece mais — qualquer acesso subsequente mostra a tela de login normal.

## Modelo de Conta

- **Um único administrador.** O Timoneiro não tem múltiplos usuários, papéis ou permissões nesta versão — é uma ferramenta de operação única, pensada para um administrador ou uma equipe pequena compartilhando a mesma conta.
- **Sessão por cookie.** O login cria uma sessão de 7 dias, armazenada como cookie `HttpOnly` (não acessível via JavaScript, reduzindo risco de XSS).
- **Sem token de API por enquanto.** Automação externa via API precisa reutilizar o cookie de sessão; não há chave de API separada nesta versão (veja [HTTP API](api.md#autenticação)).

## Trocando a Senha

Em **Configurações → Conta**, informe a senha atual e a nova senha. Ao confirmar, todas as sessões ativas são encerradas (inclusive a que você está usando) e é necessário fazer login novamente com a nova senha.

## Saindo

O botão **Sair** em Configurações → Conta encerra a sessão atual e retorna à tela de login.

## Redefinindo a Senha Perdida

Se a senha for perdida e não houver como recuperá-la pela UI, apague a conta diretamente no banco SQLite para que a tela de "Criar conta de administrador" volte a aparecer:

```bash
docker exec -it timoneiro sh -c "apk add --no-cache sqlite && sqlite3 /data/timoneiro.db 'DELETE FROM sessions; DELETE FROM users;'"
```

Recarregue a página — o Timoneiro vai pedir a criação de uma nova conta.

## Proxy Reverso e HTTPS

Se o Timoneiro estiver atrás de um proxy reverso (Nginx, Traefik, Caddy) fazendo terminação TLS, garanta que o proxy envie o cabeçalho `X-Forwarded-Proto: https`. O Timoneiro usa esse cabeçalho para marcar o cookie de sessão como `Secure` mesmo sem enxergar TLS diretamente na conexão.
