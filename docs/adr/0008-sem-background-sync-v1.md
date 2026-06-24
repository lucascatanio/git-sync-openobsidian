# 0008 — Sem sync em background no v1 (diferido)

- Status: Aceito
- Data: 2026-06-23

## Contexto

O objetivo de longo prazo é usar o repositório git como "nuvem" das notas, o
que sugere sync automático. Porém o código do plugin só executa enquanto o
painel está aberto: o painel é um `<iframe srcDoc>` e fechá-lo destrói o
contexto de execução. Sync de verdade em background (com o painel fechado, ou
agendado) exigiria rodar lógica no processo `main` do app — algo que a ponte
atual não oferece e que demandaria alterar o OpenObsidian.

## Decisão

**v1 não terá sync em background.** O sync no v1 é:

- manual, por botões (commit/push/pull/fetch), e
- opcionalmente auto-refresh/auto-sync por `setInterval` **enquanto o painel
  está aberto**.

Sync em background fica registrado no **backlog**.

## Consequências

Positivas: v1 é viável inteiramente como plugin externo (ADR-0001), sem tocar no
app; escopo enxuto e entregável.

Negativas: a promessa de "nuvem automática" é parcial no v1 (o usuário precisa
abrir o painel para sincronizar); a UX precisa deixar isso claro.

## Backlog (fase 2)

Sync em background exigirá: estender a ponte/`main` do app (agendamento, execução
fora do iframe), provavelmente via fork/PR no repositório principal, em paralelo
ao repo do plugin. Itens relacionados: agendamento configurável, retry/conflito
automático, notificação de sync.
