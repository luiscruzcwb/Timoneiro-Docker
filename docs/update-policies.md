# Políticas de Atualização

As políticas de atualização controlam **quando** e **como** o Timoneiro aplica as atualizações de imagem detectadas. Configure em **Políticas** na interface web.

## Modos de Atualização

### Manual

O modo padrão. Quando uma nova imagem é detectada, o Timoneiro cria uma entrada de atualização pendente e envia uma notificação (se configurado). Nenhuma ação é tomada até que você revise e aprove a atualização na página **Atualizações**.

Use este modo quando quiser controle total sobre cada atualização.

### Automático

As atualizações são aplicadas imediatamente quando uma nova imagem é detectada, sem nenhuma intervenção manual. O Timoneiro faz pull da nova imagem, para o container e inicia um novo.

Use este modo para serviços não críticos onde você confia no registry e quer uma experiência totalmente autônoma.

### Agendado

As atualizações são enfileiradas como pendentes quando detectadas, mas só são aplicadas durante as **janelas de manutenção** configuradas. Fora de uma janela, as atualizações pendentes aguardam. Quando uma janela de manutenção é aberta, todas as atualizações pendentes aprovadas são aplicadas automaticamente.

Use este modo para serviços que devem ser atualizados apenas fora do horário de pico ou em horários específicos.

## Política de Versão

Controle quais tipos de incremento de versão são elegíveis para atualização:

| Tipo | Exemplo | Descrição |
|------|---------|-----------|
| **Patch** | `1.2.3` → `1.2.4` | Correções de bugs e patches de segurança; recomendado ativar |
| **Minor** | `1.2.3` → `1.3.0` | Novas funcionalidades, retrocompatível; ativar com cuidado |
| **Major** | `1.2.3` → `2.0.0` | Mudanças incompatíveis; desativado por padrão, revisar manualmente |

!!! warning "Ainda não aplicada pelo engine"
    A política de versão pode ser configurada na interface, mas **ainda não é aplicada** na versão atual: a detecção de atualizações é feita por comparação de digest da imagem, independente da tag. A aplicação por semver (major/minor/patch) está planejada para uma versão futura. Imagens usando `latest` ou tags sem semver sempre serão verificadas por mudança de digest.

## Janelas de Manutenção

As janelas de manutenção definem os intervalos de tempo em que as atualizações agendadas podem ser executadas.

Cada janela possui:

- **Nome**: um rótulo descritivo
- **Dias**: quais dias da semana a janela se aplica
- **Horário de início / fim**: o intervalo de tempo (UTC)
- **Escopo**: `Todos os containers`, um ambiente específico ou um conjunto específico de containers
- **Ativada**: alternar para desativar temporariamente sem excluir

Exemplo: uma janela noturna das 02:00 às 04:00 todo domingo:

```
Nome:    Manutenção de Domingo
Dias:    Domingo
Início:  02:00
Fim:     04:00
Escopo:  Todos os containers
```

O Timoneiro verifica a cada minuto se o horário atual está dentro de alguma janela ativa.

## Exceções por Container

Sobrescreva o modo global de atualização para containers específicos:

1. Acesse **Políticas** → **Exceções de Container**
2. Selecione o container e o ambiente
3. Escolha o modo de exceção:
   - `Automático`: sempre atualizar este container imediatamente
   - `Manual`: sempre exigir aprovação para este container
   - `Agendado`: atualizar apenas dentro das janelas de manutenção
   - `Ignorar`: nunca atualizar este container

## Exceções por Stack

Se seus containers são gerenciados pelo Docker Compose, o Timoneiro detecta o label `com.docker.compose.project` e permite configurar uma exceção para toda a stack de uma vez. Todos os containers da stack herdam o modo da exceção da stack (exceto se sobrescritos por uma exceção por container).
