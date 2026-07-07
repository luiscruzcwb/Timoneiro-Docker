# Ambientes

O Timoneiro pode monitorar containers em múltiplos hosts Docker a partir de uma única instância. Cada host é configurado como um **Ambiente** na página de Configurações.

## Tipos de Ambiente

### Local (Socket Unix)

O ambiente padrão conecta ao daemon Docker local por meio do socket Unix. Esta é a configuração mais comum e não requer nenhuma configuração de rede.

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

Na página de Configurações, defina **Tipo** como `Socket` e **Host** como `unix:///var/run/docker.sock`.

### TCP

Conecta a um daemon Docker remoto exposto via TCP. O Docker Engine remoto deve estar configurado para escutar em uma porta TCP.

```
Host: tcp://192.168.1.100:2375
```

!!! warning
    Expor o socket Docker via TCP puro (porta 2375) é inseguro. Use sempre TLS (`tcp://host:2376`) em produção.

### Agente Remoto

O **Agente Timoneiro** é um binário leve que roda em um host remoto, conecta ao socket Docker local e expõe uma API HTTP mínima que o Timoneiro consulta. Esta é a abordagem recomendada para hosts remotos, pois evita expor o socket Docker diretamente.

```
Host: https://agente.exemplo.com.br:1895
Token: seu-token-secreto
```

Veja [Agente Remoto](agent.md) para instruções de configuração.

## Adicionando um Ambiente

1. Acesse **Configurações** → **Ambientes**
2. Clique em **Adicionar Ambiente**
3. Escolha o tipo de conexão
4. Preencha o endereço do host e as credenciais necessárias
5. Clique em **Testar conexão** para verificar a conectividade
6. Salve

Após salvo, o Timoneiro incluirá este ambiente no próximo ciclo de verificação.

## Ambiente Padrão

Quando o Timoneiro inicia pela primeira vez sem nenhum ambiente cadastrado, ele cria automaticamente um ambiente **Local** apontando para `unix:///var/run/docker.sock`. Isso cobre o caso de uso mais comum de host único sem nenhuma configuração adicional.

## Removendo um Ambiente

Excluir um ambiente remove todos os registros de containers associados a ele do banco de dados. O histórico de atualizações é preservado.
