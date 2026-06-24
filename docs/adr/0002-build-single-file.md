# 0002 — Build single-file: TS + Preact compilados num `panel.html` inlinado

- Status: Aceito
- Data: 2026-06-23

## Contexto

O host injeta o painel do plugin num `<iframe srcDoc>` lendo o `panel.html`
como string crua. Não há bundler do lado do app, não há resolução de `import`
em runtime, e o iframe (sem `allow-same-origin`) não pode buscar assets
externos de forma confiável. Ao mesmo tempo, decidimos escrever em TypeScript
(tipagem do domínio git e da ponte) e usar Preact (ADR-0003).

## Decisão

Ter um **build próprio** que compila o TypeScript + Preact e **inlina** todo o
JS e CSS num único `dist/panel.html` auto-contido. O app nunca vê nosso TS,
apenas o HTML final.

## Consequências

Positivas: mantemos DX moderno (TS, componentes, lint, testes) apesar do runtime
ser HTML cru; o artefato satisfaz a restrição do host; um só arquivo simplifica
o empacotamento.

Negativas: precisamos manter um passo de build que inlina tudo (sem
`<script src>`, sem CDN); o tamanho do `panel.html` cresce com o código; source
maps no iframe são limitados, então o domínio precisa ser testável fora do
runtime (ver ADR-0004/0006).

## Notas de implementação

Qualquer asset (ícones, fontes) precisa ser inlinado (data URI) ou evitado.
Nada de `fetch` para recursos do plugin.

Restrição de execução de script (descoberta no Bloco 0, ver `docs/LESSONS.md`):
o `panel.html` roda num `<iframe srcdoc>` de origin opaca, onde **ES modules não
executam**. O bundle precisa ser emitido como **script clássico inline** (o
`vite-plugin-singlefile` emite `type="module"` por padrão; removemos no
`postbuild`). Como script clássico no `<head>` executa durante o parse — antes
do `#root` existir — o entry precisa de `defer` na tag **e** de um guard
`DOMContentLoaded` antes de montar, senão o mount falha em silêncio. Verificação
pós-build: sem `type="module"`/`crossorigin`/`modulepreload`, com `<script
defer>`, sem refs externas.