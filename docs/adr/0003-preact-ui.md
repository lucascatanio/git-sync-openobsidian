# 0003 — Preact para a UI do painel

- Status: Aceito
- Data: 2026-06-23

## Contexto

O painel tem estado reativo não-trivial: abas (Changes/History), listas de
arquivos staged/unstaged que mudam, indicadores ahead/behind, diff por arquivo
e estados de conflito. Fazer isso em DOM imperativo puro gera muito boilerplate
e bugs de sincronização de estado. Ao mesmo tempo, o artefato precisa caber num
único `panel.html` (ADR-0002), então peso importa.

## Decisão

Usar **Preact** para a camada de UI.

## Consequências

Positivas: API tipo React (familiar, componível) com ~4kb, que bundla limpo num
arquivo só; reatividade declarativa para as listas e abas; tipagem boa com TS.

Negativas: uma dependência a inlinar; ecossistema menor que o do React (raramente
um problema neste escopo).

## Alternativas consideradas

- **Vanilla TS**: zero dependência e mais aprendizado de DOM, mas boilerplate de
  estado considerável para a UI reativa que precisamos.
- **React**: peso desproporcional para um painel pequeno embutido.

Preact equilibra ergonomia e tamanho. A UI nunca chama a ponte diretamente para
git; sempre via a camada de domínio (ADR-0004).
