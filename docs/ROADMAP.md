# ROADMAP — OpenObsidian Git Sync

Guia de implementação em blocos, para você e o Claude Code. A ordem é
**inside-out**: o núcleo puro (testável sem o app) primeiro, a UI por último.
Cada bloco é entregável de forma independente, com critério de aceite. Entregue
um bloco por prompt; só avance quando o aceite passar.

Referências: `docs/SPEC.md` (contratos) · `docs/adr/` (decisões) · `CLAUDE.md`
(regras operacionais).

Legenda: ⬜ pendente · 🔧 testável sem o app · 🖥 precisa do app rodando.

---

## Bloco 0 — Scaffolding 🔧

⬜ Setup do repositório e do build single-file.

- `package.json`, `tsconfig.json` (strict, `noUncheckedIndexedAccess`).
- Build que compila TS + Preact e **inlina tudo** em `dist/panel.html`
  (sem `<script src>`, sem CDN) — ADR-0002.
- ESLint + Prettier configurados.
- Runner de testes (núcleo puro).
- `manifest.json` (`id`, `name`, `version`, `icon`, `panel: "panel.html"`).
- Script `package` que zipa `manifest.json` + `panel.html`.
- `panel.html` mínimo (um "Hello" usando uma CSS var de tema).

**Aceite:** `npm run build` gera `dist/panel.html`; o ZIP instala no OpenObsidian
(Install from ZIP) e o painel abre mostrando o "Hello" com o tema correto. 🖥

## Bloco 1 — Ports, Result e adapter da ponte 🔧

⬜ A borda de I/O, tipada.

- `src/ports.ts` (`CommandRunner`, `FileStore`, `Notifier`, `Environment`).
- `src/result.ts` (`Result<T,E>`, `ok`, `err`).
- `src/bridge.ts` — wrapper tipado sobre o `window.pluginApi` do host (NÃO
  reimplementa postMessage); adapta `{...}|{error}` aos ports; expõe `VAULT_PATH`.
- Um `FakeCommandRunner`/`FakeFileStore` para testes.

**Aceite:** teste roda `git --version` pelo bridge tipado e recebe um
`ExecResult`; os fakes existem e são usados num teste smoke. 🖥 (o real) / 🔧 (fakes)

## Bloco 2 — Domínio git puro 🔧

⬜ O coração funcional, sem I/O.

- `src/domain/types.ts` (`RepoStatus`, `FileChange`, `Commit`, `FileDiff`).
- `src/domain/errors.ts` (`GitError`).
- `src/domain/args.ts` (construção de argumentos; sem magic string).
- `src/domain/parse.ts` (`parseStatus` para `--porcelain=v2 --branch -z`,
  `parseLog`).
- **Capturar fixtures de saída real** de um repo de teste (status com
  staged/unstaged/untracked/rename/conflito; log) e testar os parsers contra elas.

**Aceite:** parsers passam nos testes contra fixtures reais de `porcelain=v2`,
incluindo rename, untracked e conflito. 🔧

## Bloco 3 — GitService (aplicação) 🔧

⬜ Orquestra `args → exec → parse → Result` e classifica erros.

- `src/application/git-service.ts` (interface `GitService` + factory
  `createGitService(runner, env)`).
- Classificação de `stderr`/`code` nos `GitError.kind` (not-a-repo, no-remote,
  no-upstream, auth-failed, conflict, nothing-to-commit, command-failed).

**Aceite:** com `FakeCommandRunner` devolvendo fixtures, cada método retorna o
`Result` certo, incluindo os caminhos de erro. 🔧

## Bloco 4 — Estado + composition root 🔧

⬜ Estado da UI e wiring.

- `src/state/sync-state.ts` (`SyncState` union + transições puras).
- `src/main.tsx` (composition root: instancia `bridge` → `GitService` →
  monta a UI; injeta ports).

**Aceite:** transições de `SyncState` testadas; o app monta um componente raiz
vazio sem erro no console. 🔧 / 🖥

## Bloco 5 — UI shell read-only 🖥

⬜ Mostrar estado, sem ações ainda.

- `src/ui/App.tsx`, `StatusHeader.tsx` (branch pill, ↑ahead/↓behind), `Tabs`.
- Lista de arquivos (staged/unstaged) só leitura.
- Integração de tema via CSS vars.
- Estado `loading`/`uninitialized`/`ready` refletido na UI.

**Aceite:** abrir o painel num vault que é repo git mostra branch, ahead/behind
e a lista de mudanças reais; num vault sem git mostra o estado `uninitialized`. 🖥

## Bloco 6 — Ações de Changes 🖥

⬜ Stage/unstage, commit, push.

- Stage/unstage por arquivo e "stage all" / "unstage all".
- Caixa de commit (Ctrl/Cmd+Enter), Commit, Commit & Push, Push.
- `nothing-to-commit` e mensagem vazia tratadas via `notify`.

**Aceite:** dá pra stage, commitar e dar push de um arquivo real pela UI; estado
atualiza após cada ação. 🖥

## Bloco 7 — Diff e History 🖥

⬜ Visualização.

- `DiffView` (patch cru por arquivo, staged/unstaged), com realce simples.
- `HistoryTab` (lista do `log`), detalhe de commit.

**Aceite:** clicar num arquivo mostra o diff; a aba History lista commits reais. 🖥

## Bloco 8 — Remote ops e estados de borda 🖥

⬜ Pull/fetch e os erros que importam.

- Pull, Fetch; atualização de ahead/behind.
- Tratamento explícito de cada `GitError.kind`: no-remote, no-upstream (oferecer
  publicar branch), auth-failed (mensagem clara, sem pedir segredo — ADR-0005),
  detached HEAD, conflito após pull (`phase: 'conflict'` + lista de arquivos),
  git-not-found.
- Fluxo de Init (só em `uninitialized`), com confirmação inline.

**Aceite:** cada estado de borda da SPEC §15 produz uma mensagem/ação clara na
UI; conflito é detectado e listado. 🖥

## Bloco 9 — Config e auto-refresh 🖥

⬜ Persistência e atualização automática.

- `src/application/config-service.ts` (`PluginConfig` em
  `.openobsidian-git-sync.json` no vault; garante entrada no `.gitignore` —
  ADR-0007).
- Auto-refresh por timer **enquanto o painel está aberto** (intervalo da config).

**Aceite:** config persiste entre aberturas do painel; auto-refresh atualiza o
status no intervalo configurado; o arquivo de config está no `.gitignore`. 🖥

## Bloco 10 — Polimento e empacotamento 🖥

⬜ Acabamento.

- Confirmação inline para ações destrutivas (force push, discard, reset, init
  sobre repo existente) — sem `window.confirm/prompt`.
- README com instruções de instalação; revisão de acessibilidade/tema.
- `npm run package` final → `dist/git-sync.zip`.

**Aceite:** plugin instalável e usável ponta a ponta; ações destrutivas pedem
confirmação; README cobre instalação. 🖥

---

## Backlog (pós-v1)

Itens que exigem mudar o app (fork/PR no repo principal) ou ampliam escopo:

- **Sync em background** com painel fechado (ADR-0008) — agendamento no `main`.
- Retry/notificação de sync; agendamento configurável avançado.
- Gestão assistida de credenciais.
- Resolução de conflito assistida (merge tool).
- Verbo de config por-plugin na ponte (revisaria ADR-0007).
- Múltiplos remotes; checkout/troca de branch.

---

## Como trabalhar cada bloco com o Claude Code

1. Aponte o Claude Code para o bloco atual e diga para seguir `CLAUDE.md` +
   `docs/SPEC.md`.
2. Peça os testes junto com o código (núcleo puro: testes obrigatórios).
3. Rode o aceite. Só marque ⬜ → ✅ quando passar.
4. Decisão arquitetural nova no meio do caminho? Registre um ADR antes de seguir.
