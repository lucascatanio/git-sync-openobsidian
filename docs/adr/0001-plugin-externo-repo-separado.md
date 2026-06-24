# 0001 — Distribuir como plugin externo em repositório separado

- Status: Aceito
- Data: 2026-06-23

## Contexto

O OpenObsidian carrega plugins de `userData/plugins/<id>/` em runtime, a partir
de um ZIP instalado pelo usuário ("Install from ZIP") ou copiado manualmente.
Plugins não fazem parte do build do app (`build.files` só inclui `out/**/*`) nem
da árvore do repositório principal. Um plugin é apenas um diretório com
`manifest.json` + `panel.html`; o `panel.html` é injetado como string crua e não
passa pelo electron-vite do app. Precisamos decidir onde nosso código mora:
fork do app ou repositório próprio.

## Decisão

Manter a extensão em um **repositório separado**, com seu próprio toolchain,
produzindo um ZIP (`manifest.json` + `panel.html`) como artefato distribuível.
Não forkar o app.

## Consequências

Positivas: artefato independente; nada no fluxo de carregamento depende de
estarmos dentro do repo do app; toolchain (TS, Preact, lint, testes) é nosso;
release e versionamento desacoplados do app.

Negativas: não herdamos CI nem convenções do app automaticamente; se um dia a
feature virar "oficial", será preciso uma conversa de integração à parte.

## Alternativa considerada

Fork do app: só se justifica quando precisarmos de capacidades novas na ponte
(ex.: sync em background, ver ADR-0008). Nesse caso o fork/PR no app é um
trabalho **paralelo** ao repo do plugin, não um substituto.
