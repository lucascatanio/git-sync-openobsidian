# LESSONS — ambiente, build e debug

Aprendizados acumulados durante o desenvolvimento.

## Ambiente do OpenObsidian (runtime de plugins)

- O `userData` real (Linux/AppImage) é `~/.config/open-obsidian/` — **minúsculo,
  com hífen**, não `OpenObsidian`. Plugins ficam em `.../plugins/<id>/`, onde
  `<id>` é o campo `id` do `manifest.json`. O estado habilitado fica em
  `.../plugins-enabled.json` (lista de ids).
- O painel é um `<iframe srcdoc sandbox="allow-scripts allow-forms">` **sem**
  `allow-same-origin` → origin opaca.
- O host injeta, **depois** do nosso HTML: `window.pluginApi`
  (`exec`/`readFile`/`writeFile`/`notify`, envelope `__pt`/`__pi`/`__pr`),
  `window.VAULT_PATH`, e um `<style>` com `:root{...}` definindo as CSS vars de
  tema. Esse `<style>` é o que tematiza o fundo **independente** do nosso JS —
  por isso o fundo pode mudar de cor mesmo com o painel "vazio".

## Armadilhas de build (single-file) — ver ADR-0002

- **ES modules não executam no iframe srcdoc** (origin opaca). O script precisa
  ser **clássico inline**. O `vite-plugin-singlefile` emite `type="module"` por
  padrão → removido no `postbuild` (`build/strip-module-type.mjs`).
- **Script clássico no `<head>` roda durante o parse**, antes de `<body>` e do
  `#root` existirem. `getElementById('root')` retorna `null` e o mount falha
  **em silêncio** (curto-circuito `_e && ...`, nenhum erro no console). Solução:
  `defer` na tag **e** guard `DOMContentLoaded` no entry. (Com `type="module"` o
  defer era implícito; ao virar script clássico perdemos isso.)
- Verificação obrigatória pós-build no `panel.html`: sem
  `type="module"`/`crossorigin`/`modulepreload`, com `<script defer>`, sem
  `src=`/`href=` externos. O `deploy:local` faz esse grep e aborta se falhar.

## Bug do app (NÃO é nosso) — reportado ao mantenedor

- O botão do plugin vive na `toolbar-right`, que só é montada no ramo
  "tem nota aberta" de um ternário (`App.tsx` ~342–353; botão em `:380`/`:397`).
  **Sem nota aberta, nenhum botão de plugin aparece no DOM.** Workaround de dev:
  abrir/criar uma nota. Afeta qualquer plugin, não só o nosso.

## Ciclo de teste no app

- O app **não recarrega plugin automaticamente** (sem hot-reload; a lista é
  lida no mount e guardada em estado React). Depois de cada deploy: reabrir o
  app (ou toggle off/on nas Configurações) **e** abrir uma nota antes de clicar
  no ícone.
- Ordem segura: `build → grep de sanidade → deploy → grep → reabrir app → abrir
  nota → clicar no ícone`. O `npm run dev:install` cobre build+strip+deploy+grep.

## Debug dentro do iframe

- No DevTools, o contexto padrão é `top` (o app). Para inspecionar o painel,
  troque o contexto no dropdown **`top ▾`** (topo do Console) para o
  `about:srcdoc` do painel. Erros do plugin **não** aparecem no contexto `top`.
- `await window.api.pluginList()` (contexto `top`) mostra como o app enxerga o
  plugin (`enabled`, `panelPath`). Serve para separar "app não reconhece o
  plugin" de "app reconhece mas não renderiza".

## Versão do app

- `package.json` do app = 0.5.8; `CLAUDE.md` do app = 0.5.2 (doc provavelmente
  só desatualizada). Antes de assumir um bug, confirme o comportamento contra o
  **código atual do master**, não só contra o AppImage publicado (que pode estar
  atrás do fonte).

## Locale do git e classificação de erros

A ponte `exec` **não aceita variáveis de ambiente** (`execFileAsync` só recebe
`{ cwd, timeout }` — ver `plugin-manager.ts:execPlugin`). Isso impede forçar
`LC_ALL=C` a partir do plugin, então o git pode responder em qualquer locale do
sistema do usuário.

Consequências e mitigações adotadas:

- **`classifyGitError`** opera sobre strings de stderr em inglês (ex.: "not a
  git repository", "Authentication failed"). É **best-effort**: funciona para a
  maioria dos usuários (git em inglês por padrão), mas pode cair em
  `command-failed` para outros.
- **Conflito após pull**: sinal mais confiável é via `git status --porcelain=v2`
  (entradas 'u' = unmerged). `GitService.pull()` executa o status após falha do
  pull e detecta conflitos por porcelain antes de tentar classificar o stderr. As
  strings "CONFLICT"/"Automatic merge failed" ficam como fallback secundário
  dentro de `classifyGitError`, mas o caminho primário não depende de locale.
- **Migração futura**: se a ponte ganhar suporte a `env`, passar `LC_ALL=C` no
  `exec` de git elimina a dependência de locale para todos os casos. O lugar
  certo é `bridge.ts` (único ponto que toca `window.pluginApi`).

## Contrato da ponte (confirmado em runtime, bate com a SPEC §5)

- `exec(cmd,args,cwd) → Promise<{stdout,stderr,code} | {error}>`
- `readFile(path) → Promise<{content} | {error}>`
- `writeFile(path,content) → Promise<{} | {error}>`
- `notify(msg) → Promise` (toast do host)
- `window.VAULT_PATH`: string. Nosso `bridge.ts` é só um wrapper tipado disso.