# Introdução

## O que é o Timoneiro?

O Timoneiro é um serviço auto-hospedado que monitora seus containers Docker em execução e detecta quando uma nova versão de imagem está disponível para qualquer um deles.

Quando uma nova imagem é encontrada, o Timoneiro pode:

- **Te notificar** por um ou mais canais configurados (Discord, Telegram, e-mail, etc.)
- **Aguardar aprovação manual** na interface web antes de atualizar
- **Atualizar automaticamente** o container imediatamente
- **Atualizar em um horário agendado**, somente durante janelas de manutenção configuradas

Após uma atualização, o Timoneiro armazena a referência da imagem anterior para que você possa fazer rollback com um único clique caso algo dê errado.

## Como Funciona

```
┌─────────────────────────────────────────────────────────────────┐
│                         Timoneiro                               │
│                                                                 │
│  ┌──────────┐   verifica digest   ┌──────────────────┐         │
│  │  Engine  │ ──────────────────▶ │  Registry (OCI)  │         │
│  │  (loop)  │ ◀────────────────── │  Docker Hub etc. │         │
│  └──────────┘   novo digest?      └──────────────────┘         │
│       │                                                         │
│       │ desatualizado?                                          │
│       ▼                                                         │
│  ┌──────────┐   aplica política   ┌──────────────────┐         │
│  │ Updates  │ ──────────────────▶ │  Docker Engine   │         │
│  │Pendentes │                     │  (pull & restart) │        │
│  └──────────┘                     └──────────────────┘         │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────┐   notifica          ┌──────────────────┐         │
│  │ Histórico│ ──────────────────▶ │  Notificações    │         │
│  │  & CVEs  │                     │  (Shoutrrr)      │         │
│  └──────────┘                     └──────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

1. **Ciclo de verificação**: a cada intervalo configurado (padrão: 5 minutos), o engine consulta cada host Docker pelos containers em execução.
2. **Comparação de digest**: para cada container, compara o digest da imagem atual com o digest mais recente do registry.
3. **Avaliação de política**: se a imagem estiver desatualizada, a política de atualização configurada é aplicada (automática / manual / agendada / ignorar).
4. **Execução da atualização**: para atualizações aprovadas, o Timoneiro faz pull da nova imagem, para o container e inicia um novo com as mesmas configurações (portas, volumes, variáveis de ambiente, labels).
5. **Notificação e auditoria**: cada evento é registrado na trilha de auditoria e enviado para os canais de notificação configurados.

## Como o Timoneiro se Diferencia do Watchtower?

O Watchtower é um daemon de linha de comando sem estado persistente, sem interface e sem fluxo de aprovação. O Timoneiro é uma camada de gerenciamento mais completa sobre o mesmo conceito:

| | Watchtower | Timoneiro |
|---|---|---|
| Interface Web | ❌ | ✅ |
| Aprovação manual | ❌ | ✅ |
| Janelas de manutenção | ❌ | ✅ |
| Scan de CVEs | ❌ | ✅ |
| Rollback | ❌ | ✅ |
| Trilha de auditoria | ❌ | ✅ |
| Multi-ambiente | Limitado | ✅ |
| Interface para registries privados | ❌ | ✅ |
| Exceções por container | Via labels | ✅ Interface + labels |

## Para Quem é o Timoneiro?

O Timoneiro foi desenvolvido para:

- Homelabs e infraestrutura auto-hospedada
- Times pequenos que gerenciam um conjunto de serviços de longa duração
- Ambientes onde você quer visibilidade e controle sobre o que atualiza e quando

Para orquestração de containers em produção em larga escala, considere soluções baseadas em Kubernetes.
