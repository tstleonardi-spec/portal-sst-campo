# Contrato UX — Diário de Campo

## Público e tarefa

Técnico em segurança do trabalho usando Android em campo. A pessoa precisa
selecionar o contexto antes de registrar uma evidência, guardar tudo mesmo sem
rede e saber se o item está somente neste aparelho ou já foi recebido na Inbox.

## Regras de interação

- Cliente, local e OS são obrigatórios antes de texto, ocorrência ou foto.
- O catálogo exibido nesta homologação é fictício e possui versão e validade
  visíveis.
- Trocar a conta não apaga registros locais; registros de outra conta não são
  exibidos na fila da conta atual.
- Fechar a tela durante o preenchimento não deve apagar o rascunho salvo.
- O registro local somente deixa de conter o binário depois de uma confirmação
  de recebimento válida.
- Catálogo expirado nunca apaga dados: permite salvar e bloqueia apenas o
  envio, usando o estado Revisão necessária.

## Estados da fila

Pendente → Enviando → Recebido na Inbox

Falhas permanecem no aparelho com Falha — tentar novamente. Dados sem contexto
legado ou impedidos por catálogo vencido ficam em Revisão necessária.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | index.html + app.mjs | UX-CONTRACT.md | Native HTML form with app-owned validation | Submit, draft persistence, duplicate-submit guard |
| Select/Listbox | Native select in index.html | app.mjs catalog projection | Dependent client → location → activity selects | Context cannot unlock before all three selections |
| Table Selection | Not used | N/A | N/A | No table selection in this mobile flow |
| Date | Not used | N/A | N/A | No date input; gateway owns receipt time |
| Scrollbar | field.css | DESIGN.md tokens | Global standards properties plus WebKit fallback | Narrow Android viewport review |
