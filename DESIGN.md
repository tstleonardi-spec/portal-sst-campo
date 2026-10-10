# Diário de Campo — contexto visual local

## Objetivo

Interface móvel de captura para colaboradores da JC Ramos em homologação. O
fluxo precisa ser compreensível com uma mão, funcionar com conectividade
intermitente e deixar claro o que está apenas neste aparelho e o que chegou à
Inbox.

## Direção visual

- Manter a identidade já existente: tela escura azul-petróleo, ciano para ação
  primária e amarelo de segurança para foco e avisos.
- Usar cartões compactos, títulos curtos, campos com rótulos visíveis e uma
  única ação primária por etapa.
- Priorizar leitura em Android estreito; nenhuma informação operacional depende
  apenas de cor.

## Hierarquia

1. Acesso e estado da sessão.
2. Contexto obrigatório: cliente demonstrativo, local demonstrativo e OS
   fictícia.
3. Registro da evidência: descrição, tipo, foto e etapa.
4. Fila local: pendente, enviando, recebido, falha ou revisão necessária.

## Estados essenciais

- Catálogo válido: operação normal.
- Catálogo desatualizado: aviso discreto, sem bloquear o salvamento.
- Catálogo expirado: permite salvar localmente, mas bloqueia o envio e marca
  revisão necessária.
- Offline: preserva o rascunho e mantém a fila local.

## Dados

Esta cópia usa somente catálogo fictício de HOMOLOG. O OAuth, o gateway, o
Google Drive e o Portal local permanecem contratos externos e não são
reconfigurados nesta fase.
