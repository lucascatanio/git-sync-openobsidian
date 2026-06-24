# CLAUDE.md — OpenObsidian Git Sync (plugin)

Este é o guia de trabalho para o Claude Code **neste repositório** (o plugin),
não o do app OpenObsidian. Leia inteiro antes de escrever código.

## O que é

Uma extensão para o OpenObsidian que dá ao usuário um cliente git visual do
vault (status, stage/unstage, commit, push, pull, fetch, init, conflito),
para usar um repositório git como "nuvem" das notas. Construída do zero.

Fonte da verdade da feature: `docs/SPEC.md`. Decisões: `docs/adr/`.

## Restrições inegociáveis do ambiente (leia primeiro)

O app carrega o plugin de um jeito muito específico. Violar qualquer item
abaixo quebra o plugin no runtime:

1. **O artefato final é UM único `panel.html` estático e auto-contido.** O app
   injeta o HTML como string crua num `<iframe srcDoc sandbox="allow-scripts
   allow-forms">`. Não há bundler do lado do app, não há resolução de módulo,
   não há `import` de runtime. Todo JS e CSS precisam estar **inlinados** no
   `panel.html` no fim do build. Nada de `<script src>` externo, nada de CDN,
   nada de fetch de assets. **O JS precisa ser script CLÁSSICO inline com
   `defer`** (ES modules não executam em iframe srcdoc de origin opaca) **e o
   entry precisa de guard `DOMContentLoaded`** (script clássico no `<head>` roda
   antes do `#root` existir → mount falha em silêncio). Ver ADR-0002 e
   `docs/LESSONS.md`.
2. **Sem acesso a Node/DOM do host.** O iframe é sandboxed sem
   `allow-same-origin`: não há `window.parent`, `window.api`, `require`,
   `fs`, `child_process`. A única ponte para o mundo é `window.pluginApi`
   (postMessage RPC injetado pelo host).
3. **A API da ponte é fixa.** São só quatro verbos (ver "Contrato da ponte").
   Não invente capacidades novas — se faltar algo, é mudança no app (outro
   repo / fork), não aqui.
4. **FS pela ponte é texto UTF-8 apenas.** `readFile`/`writeFile` só lidam com
   texto. Não há listar diretório, `stat`, nem leitura binária. Quando
   precisar, contorne via `exec` (ex.: `git`, `ls`).
5. **Código só roda com o painel aberto.** Fechar o painel destrói o contexto.
   Logo, **sem background sync no v1** (ver ADR-0008). Auto-refresh por timer
   só vale enquanto o painel está aberto.

## Arquitetura (Ports & Adapters, escala pequena)

```
UI (Preact)  ─►  Domínio (git.ts, puro)  ─►  Ports (interfaces)
                                                 ▲
                                       Adapter (bridge.ts) implementa
                                       os ports sobre o postMessage RPC
```

Camadas e responsabilidade única (SRP):

- `src/bridge.ts` — **único** lugar que toca o `window.pluginApi` (não tipado,
  fornecido pelo host). O envelope postMessage é resolvido pelo host; nós só
  envolvemos a API já exposta num wrapper tipado que implementa os ports
  `CommandRunner`, `FileStore`, `Notifier` e expõe `Environment` (`VAULT_PATH`).
  Mais nada do plugin toca `window.pluginApi`.
- `src/domain/git.ts` — semântica do git em **funções puras**: monta arrays
  de argumentos e faz parse de saída machine-readable. Depende dos *ports*
  (interfaces), nunca de `bridge.ts` concreto (DIP). Não conhece UI.
- `src/domain/types.ts` — linguagem ubíqua: `RepoStatus`, `FileChange`,
  `Commit`, `SyncState`, `Conflict`, etc.
- `src/state/` — store pequeno do estado do painel (branch, ahead/behind,
  changes, history, conflito).
- `src/ui/` — componentes Preact. **Nunca** chamam a ponte para git
  diretamente; sempre via `git.ts`.
- `build/` — script que compila TS+Preact e produz `dist/panel.html` inlinado.

Regra de dependência: UI → estado → domínio → ports. O adapter (`bridge.ts`)
é injetado na borda. Nada de baixo importa de cima.

## Padrões de código

- **TypeScript strict** (`strict: true`, `noUncheckedIndexedAccess`).
- **ESLint + Prettier** configurados neste repo (o app não tem; nós temos).
- **SRP e DIP** como já descrito. Não force OCP/LSP/ISP onde não aparece
  naturalmente; não introduza DDD pesado (agregados, repositories, eventos) —
  o domínio é "git, com botões".
- **Zero magic string de git.** Subcomandos e flags viram constantes nomeadas.
- **Parse só de output machine-readable** (`status --porcelain=v2`,
  `rev-list ... --count`, `log --format=...`). Nunca faça parse de texto
  pensado para humano (ADR-0006).
- **Sem `window.confirm` / `window.prompt`** (bug de foco no Electron).
  Confirmação de ação destrutiva (force push, discard, reset, init sobre repo
  existente) é UI inline + `pluginApi.notify()`.
- Nomes em inglês no código; comentários podem ser PT.

## Padrões

Adotados (use por padrão):

- **Result\<T,E\> (railway errors).** Operações falíveis retornam
  `Result<T, GitError>`, não lançam exceção. Erros de git são esperados (sem
  remote, sem upstream, conflito, auth) — trate-os como dados, exaustivamente.
  Ver `src/result.ts` e `src/domain/errors.ts` na SPEC.
- **Discriminated unions — "make illegal states unrepresentable".** Modele
  estado e erro como união discriminada (`SyncState`, `GitError`, `FileChange`),
  nunca como flags booleanas soltas (`isLoading`, `hasError`...). Faça o
  `switch` no campo discriminante cobrir todos os casos.
- **Functional core / imperative shell.** Núcleo puro (`domain/`) sem I/O e
  testável; casca (`bridge.ts`, `ui/`) faz I/O e renderização. Lógica de git
  vive no core; a casca só orquestra.
- **Composition root.** Um único ponto (`src/main.tsx`) instancia o adapter
  concreto e injeta os ports no `GitService` e na UI. Nenhuma outra parte
  instancia dependências concretas; tudo recebe ports por parâmetro (DI manual).
- **Fakes \> mocks nos testes.** Teste o `GitService` com um `CommandRunner`
  falso que devolve fixtures de saída real do git. Sem mocking library; preso ao
  comportamento, não à implementação.

Não fazer (overengineering para este escopo):

- **Repository pattern** — é DDD pesado (já descartado) e o nome colide com "git
  repository". O domínio é "git, com botões".
- **State-machine library** (XState etc.) — `SyncState` + transições puras já
  bastam.
- **Command pattern objetificado** — funções em `git.ts`/`args.ts` resolvem;
  objetificar é boilerplate.
- **Event bus / observer** além do que o Preact já oferece.
- **Forçar OCP/LSP/ISP** onde não surgem naturalmente. As vigas são SRP e DIP.

## Segurança

- **Nunca armazene credenciais** (token, senha, SSH key). O git do sistema já
  usa o credential helper / SSH / cache do usuário. O plugin só documenta que
  o usuário precisa ter o git autenticado (ADR-0005).
- A ponte é permissiva (exec irrestrito, FS irrestrito). Não amplie esse
  alcance; trate qualquer comando como potencialmente destrutivo e confirme
  ações que reescrevem histórico ou descartam trabalho.
- Config do plugin vai num arquivo oculto no vault (ex.:
  `.openobsidian-git-sync.json`) e **deve** ser adicionada ao `.gitignore` do
  vault automaticamente, para não se auto-sincronizar (ADR-0007).

## Contrato da ponte (a única "API" que existe)

Disponível dentro do iframe como `window.pluginApi` (já fornecido pelo host,
métodos retornam Promise; envolva em `bridge.ts`):

- `exec(cmd, args, cwd) → { stdout, stderr, code } | { error }` — roda binário
  via `execFile` no main, timeout ~30s. Para git: `exec('git', args, VAULT_PATH)`.
- `readFile(path) → { content } | { error }` — texto UTF-8. Caminho relativo
  resolve contra `VAULT_PATH`; absoluto passa direto.
- `writeFile(path, content) → {} | { error }` — texto UTF-8.
- `notify(msg)` — toast nativo do app.

Injetados pelo host: `window.VAULT_PATH` (root do vault) e CSS vars de tema:
`--bg`, `--bg2`, `--bg3`, `--text`, `--text2`, `--border`, `--accent`,
`--accent-hover`, `--success`, `--danger`. Use as CSS vars para integrar com
dark/light.

## Manifesto

`manifest.json` na raiz do pacote, campos obrigatórios `id`, `name`,
`version`; mais `icon` (emoji da toolbar), `panel: "panel.html"`, `author`,
`description`.

## Build, teste e empacotamento

- `npm run dev` — build em watch do `panel.html`.
- `npm run build` — gera `dist/panel.html` (tudo inlinado) + copia
  `manifest.json`.
- `npm run test` — testes do domínio (`git.ts`) com um bridge **falso**
  implementando os ports; sem Electron.
- `npm run package` — zipa `manifest.json` + `panel.html` em
  `dist/git-sync.zip` (manifesto na raiz do ZIP).
- Para testar no app: Settings → plugins → "Install from ZIP" com o
  `git-sync.zip`, ou "Open plugins folder" e copiar a pasta. Reabrir Settings
  / reiniciar para recarregar (não há hot-reload no app).

## Escopo

**v1 (agora):** status/refresh, stage/unstage por arquivo, commit, commit+push,
push, pull, fetch, init, diff por arquivo, histórico, UI de conflito básica,
auto-refresh por timer com painel aberto, config persistida no vault.

**Fora do v1 (backlog):** sync em background com painel fechado (exige mudar o
`main` do app — fork/PR separado), agendamento, gestão avançada de credenciais,
resolução de conflito assistida, marketplace/auto-update.

## Antes de marcar uma tarefa como pronta

1. O build produz um `panel.html` único sem referências externas?
2. A UI não chama a ponte para git direto (só via `git.ts`)?
3. Todo parse de git usa flag machine-readable e tem teste?
4. Nenhuma credencial é tocada/armazenada?
5. Ações destrutivas têm confirmação inline (sem `confirm/prompt`)?
6. Decisão arquitetural nova? Registre um ADR em `docs/adr/`.