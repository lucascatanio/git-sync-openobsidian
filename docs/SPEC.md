# SPEC — OpenObsidian Git Sync

Versão: 0.1 (rascunho) · Status: em definição · Alvo: v1

Documento-fonte da feature. Decisões em `docs/adr/`. Guia operacional em
`CLAUDE.md`.

---

## 1. Visão geral e contexto

Extensão para o OpenObsidian que oferece um **cliente git visual do vault**: o
usuário gerencia um repositório git diretamente pela interface (status,
stage/unstage, commit, push, pull, fetch, init, diff, histórico, conflito),
usando um repositório remoto como "nuvem" das suas notas.

O OpenObsidian carrega plugins de `userData/plugins/<id>/` em runtime e injeta o
painel num `<iframe srcDoc sandbox>`. Isso impõe restrições fortes de ambiente
(seção 3) que moldam toda a arquitetura. A extensão é construída do zero, como
plugin externo num repositório próprio (ADR-0001).

## 2. Objetivos e não-objetivos

### Objetivos (v1)

- Mostrar o estado do repositório do vault: branch, ahead/behind, arquivos
  modificados (staged e unstaged).
- Operações git por botão: stage/unstage por arquivo, commit, commit+push,
  push, pull, fetch, init.
- Diff por arquivo e histórico de commits.
- UI de conflito básica (detectar, listar arquivos em conflito, orientar).
- Auto-refresh por timer **enquanto o painel está aberto** (opcional, configurável).
- Config de preferências persistida.

### Não-objetivos (v1 — ver backlog, seção 18)

- Sync em background com o painel fechado (ADR-0008).
- Gestão de credenciais dentro do plugin (ADR-0005).
- Resolução de conflito assistida (merge tool embutida).
- Marketplace, instalação por URL, auto-update.
- Suporte a múltiplos remotes/worktrees.

## 3. Restrições do ambiente

Resumo das restrições impostas pelo host (detalhe e justificativa nos ADRs):

1. **Artefato final = um `panel.html` estático auto-contido.** Sem bundler do
   app, sem `import` em runtime, sem assets externos. Todo JS/CSS inlinado
   (ADR-0002).
2. **Iframe sandboxed sem `allow-same-origin`.** Sem Node, sem DOM do host. A
   única ponte é `window.pluginApi` via postMessage.
3. **A ponte tem 4 verbos fixos:** `exec`, `readFile`, `writeFile`, `notify`.
4. **FS pela ponte é texto UTF-8.** Sem listar diretório, sem `stat`, sem
   binário. Contornar via `exec`.
5. **Código só roda com o painel aberto.** Fechar destrói o contexto → sem
   background no v1.

## 4. Arquitetura

Ports & Adapters em escala pequena, com **functional core / imperative shell**:
o núcleo (domínio git) é puro e testável; a casca (adapter da ponte + UI) faz
I/O e renderização.

```
┌─────────────────────────────────────────────┐
│  UI (Preact)                  imperative shell│
│   └─ chama ► GitService (aplicação)           │
│                 └─ usa ► domínio git (puro)    │
│                             core funcional     │
│                 └─ depende de ► Ports (ifaces) │
│                                    ▲           │
│  Adapter da ponte (bridge.ts) ─────┘           │
│   implementa os ports sobre o postMessage RPC  │
└─────────────────────────────────────────────┘
```

Regra de dependência (de fora para dentro): `ui → state → application → domain →
ports`. Nada interno importa de camada externa. O concreto (adapter) é injetado
na borda, num único **composition root** (entry point).

Princípios aplicados: **SRP** (uma razão de mudança por camada), **DIP**
(domínio depende de interfaces, não da ponte concreta). Sem DDD pesado
(agregados, repositories, eventos): o domínio é "git, com botões".

### Estrutura de arquivos

```
src/
  main.tsx                 # composition root: wire bridge → service → UI
  bridge.ts                # adapter: implementa os ports sobre postMessage
  ports.ts                 # interfaces (CommandRunner, FileStore, Notifier, Environment)
  result.ts                # Result<T,E> e helpers
  domain/
    types.ts               # linguagem ubíqua (RepoStatus, FileChange, Commit, ...)
    errors.ts              # GitError
    args.ts                # funções puras que montam argumentos de git
    parse.ts               # funções puras que parseiam saída machine-readable
  application/
    git-service.ts         # GitService: orquestra args+exec+parse → Result
    config-service.ts      # carrega/salva PluginConfig no vault
  state/
    sync-state.ts          # SyncState (discriminated union) + transições
  ui/
    App.tsx
    StatusHeader.tsx
    ChangesTab.tsx
    HistoryTab.tsx
    FileRow.tsx
    DiffView.tsx
    ConflictBanner.tsx
build/                     # script que inlina tudo em dist/panel.html
manifest.json
```

## 5. Contrato da ponte

### O que o host fornece (o que o adapter encapsula)

O host **já injeta** `window.pluginApi` com métodos que retornam Promise
(`exec`, `readFile`, `writeFile`, `notify`). O envelope postMessage
(`__pt`/`__pi`/`__pr`) é resolvido por um script do host dentro do iframe — **nós
não implementamos RPC**. Nosso `bridge.ts` é um wrapper **tipado e fino** sobre
esse `window.pluginApi` não tipado: adapta as respostas (`{...}` vs `{ error }`)
aos ports e expõe o `Environment`.

Também injetados pelo host: `window.VAULT_PATH` (root do vault) e as CSS vars de
tema: `--bg`, `--bg2`, `--bg3`, `--text`, `--text2`, `--border`, `--accent`,
`--accent-hover`, `--success`, `--danger`. Use-as para integrar com dark/light.

### Ports (`src/ports.ts`)

```typescript
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Executa um binário do sistema (ex.: git) via a ponte. */
export interface CommandRunner {
  exec(cmd: string, args: string[], cwd: string): Promise<ExecResult>;
}

/** Leitura/escrita de texto UTF-8 pela ponte. */
export interface FileStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

/** Toast nativo do app. */
export interface Notifier {
  notify(message: string): void;
}

/** Ambiente injetado pelo host. */
export interface Environment {
  readonly vaultPath: string;
}
```

O adapter `bridge.ts` implementa `CommandRunner`, `FileStore`, `Notifier` e
expõe `Environment`. Em testes, fakes implementam as mesmas interfaces.

## 6. Tipos do domínio (`src/domain/types.ts`)

```typescript
export type FileStatusKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface FileChange {
  path: string;
  origPath?: string;        // presente em rename
  kind: FileStatusKind;
  staged: boolean;          // há mudança no index para este caminho
  unstaged: boolean;        // há mudança na working tree para este caminho
}

export interface RepoStatus {
  initialized: boolean;     // false = não é um repositório git
  branch: string | null;    // null se HEAD destacado
  detached: boolean;
  upstream: string | null;  // ex.: "origin/main"; null se sem upstream
  ahead: number;
  behind: number;
  changes: FileChange[];
  hasConflicts: boolean;
}

export interface Commit {
  hash: string;
  author: string;
  timestamp: number;        // unix seconds
  subject: string;
}

export interface FileDiff {
  path: string;
  staged: boolean;
  patch: string;            // diff unificado cru (sem cor)
}
```

## 7. Tratamento de erros

Operações falíveis retornam `Result<T, GitError>` em vez de lançar exceção
(erros de git são frequentes e esperados: sem remote, sem upstream, conflito,
auth, não-repo). Discriminated unions tornam o tratamento exaustivo.

```typescript
// src/result.ts
export type Result<T, E = GitError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

```typescript
// src/domain/errors.ts
export type GitError =
  | { kind: 'git-not-found' }                              // binário git ausente
  | { kind: 'not-a-repo' }                                 // vault não inicializado
  | { kind: 'no-remote' }                                  // nenhum remote configurado
  | { kind: 'no-upstream'; branch: string }                // branch sem upstream
  | { kind: 'auth-failed'; detail: string }                // push/pull/fetch sem auth
  | { kind: 'conflict'; files: string[] }                  // merge/pull em conflito
  | { kind: 'nothing-to-commit' }
  | { kind: 'command-failed'; code: number; stderr: string }; // fallback
```

O adapter/serviço classifica o `stderr`/`code` do git nesses `kind`s; o
fallback `command-failed` carrega o erro cru para exibição.

## 8. Camada de domínio git (pura)

Duas famílias de funções **puras**, sem I/O — testáveis isoladamente.

### Construção de argumentos (`src/domain/args.ts`)

Sem magic string: subcomandos e flags como constantes. Exemplos de assinatura:

```typescript
export const gitArgs = {
  isRepo:        (): string[] => ['rev-parse', '--is-inside-work-tree'],
  status:        (): string[] => ['status', '--porcelain=v2', '--branch', '-z'],
  stage:    (paths: string[]): string[] => ['add', '--', ...paths],
  unstage:  (paths: string[]): string[] => ['restore', '--staged', '--', ...paths],
  commit:    (message: string): string[] => ['commit', '-m', message],
  push:          (): string[] => ['push'],
  pushSetUpstream: (branch: string): string[] => ['push', '-u', 'origin', branch],
  pull:          (): string[] => ['pull', '--no-edit'],
  fetch:         (): string[] => ['fetch'],
  init:          (): string[] => ['init'],
  diff: (path: string, staged: boolean): string[] =>
    staged ? ['diff', '--no-color', '--cached', '--', path]
           : ['diff', '--no-color', '--', path],
  log: (limit: number): string[] =>
    ['log', `--max-count=${limit}`, '--format=%H%x1f%an%x1f%at%x1f%s'],
} as const;
```

### Parsers (`src/domain/parse.ts`)

Apenas saída machine-readable (ADR-0006). Assinaturas:

```typescript
export function parseStatus(stdout: string): RepoStatus;
export function parseLog(stdout: string): Commit[];
// diff é texto cru: vira FileDiff sem parse estrutural no v1.
```

Notas de formato:
- `status --porcelain=v2 --branch -z`: cabeçalhos `# branch.head`,
  `# branch.upstream`, `# branch.ab +A -B`; entradas `1`/`2` (alteração),
  `u` (unmerged → conflito), `?` (untracked), terminadas por NUL.
- `log --format=%H%x1f%an%x1f%at%x1f%s`: campos separados por `\x1f`, registros
  por `\n`.

## 9. Camada de aplicação (`GitService`)

Interface que a UI consome. Orquestra `args → CommandRunner.exec → parse`,
classifica erros em `GitError` e retorna `Result`. É a fronteira entre o núcleo
puro e a casca.

```typescript
// src/application/git-service.ts
export interface GitService {
  getStatus(): Promise<Result<RepoStatus>>;
  stage(paths: string[]): Promise<Result<void>>;
  unstage(paths: string[]): Promise<Result<void>>;
  commit(message: string): Promise<Result<Commit>>;
  /** push; se não houver upstream, retorna GitError 'no-upstream' para a UI decidir set-upstream. */
  push(): Promise<Result<void>>;
  pushSetUpstream(branch: string): Promise<Result<void>>;
  pull(): Promise<Result<RepoStatus>>;   // status atualizado; ou GitError 'conflict'
  fetch(): Promise<Result<void>>;
  init(): Promise<Result<void>>;
  diff(path: string, staged: boolean): Promise<Result<FileDiff>>;
  log(limit: number): Promise<Result<Commit[]>>;
}

export function createGitService(
  runner: CommandRunner,
  env: Environment,
): GitService;   // factory; recebe os ports por injeção (composition root)
```

## 10. Estado da UI (`src/state/sync-state.ts`)

Estado modelado como discriminated union para tornar **estados ilegais
irrepresentáveis** (sem combos como "carregando E em erro" via flags soltas).

```typescript
export type GitOperation =
  | 'refresh' | 'stage' | 'unstage' | 'commit'
  | 'push' | 'pull' | 'fetch' | 'init';

export type SyncState =
  | { phase: 'loading' }                                       // primeiro carregamento
  | { phase: 'uninitialized' }                                 // não é repo git
  | { phase: 'ready'; status: RepoStatus }
  | { phase: 'busy'; status: RepoStatus; op: GitOperation }
  | { phase: 'conflict'; status: RepoStatus; files: string[] }
  | { phase: 'error'; status: RepoStatus | null; error: GitError };
```

Transições são funções puras `(state, event) => state`, fáceis de testar.

## 11. Fluxos (v1)

Cada fluxo: ação na UI → `GitService` → `Result` → transição de `SyncState` →
re-render. Resumo:

- **Refresh/status:** `getStatus()`. Se `not-a-repo` → `uninitialized`. Senão →
  `ready`. Dispara no mount e em timer (se auto-refresh ligado) enquanto aberto.
- **Stage/unstage:** `busy('stage'|'unstage')` → `stage/unstage(paths)` →
  `getStatus()` → `ready`.
- **Commit:** valida mensagem não vazia (UI) → `busy('commit')` →
  `commit(msg)`; `nothing-to-commit` vira aviso via `notify`.
- **Commit + push:** `commit` então `push` (aborta push se commit falhar).
- **Push:** `busy('push')` → `push()`. Em `no-upstream`, UI oferece "publicar
  branch" → `pushSetUpstream(branch)`. Em `auth-failed`, mensagem clara
  (ADR-0005). Em `no-remote`, orienta configurar remote.
- **Pull:** `busy('pull')` → `pull()`. Em `conflict` → `conflict` (lista
  arquivos). Senão atualiza status.
- **Fetch:** `busy('fetch')` → `fetch()` → `getStatus()` (atualiza ahead/behind).
- **Init:** só visível em `uninitialized`. Confirmação inline → `init()` →
  `getStatus()`.

## 12. UI (Preact)

Árvore de componentes (a UI nunca chama a ponte direto; só `GitService` via
estado):

```
App
├─ StatusHeader        branch pill, ↑ahead/↓behind, botões pull/push/fetch
├─ ConflictBanner      (só em phase 'conflict')
├─ Tabs
│  ├─ ChangesTab
│  │  ├─ FileRow[]     staged (stage/unstage, abre DiffView)
│  │  ├─ FileRow[]     unstaged
│  │  └─ CommitBox     textarea + commit / commit+push
│  └─ HistoryTab
│     └─ Commit[]      lista do log
└─ DiffView            painel/modal com o patch cru do arquivo selecionado
```

Diretrizes: usar as CSS vars de tema do host para dark/light; ações destrutivas
(force push, discard, reset, init sobre repo existente) com confirmação **inline**
+ `notify`, nunca `window.confirm/prompt` (bug de foco no Electron).

## 13. Config e persistência

```typescript
export interface PluginConfig {
  autoRefreshSeconds: number | null;   // null = desligado
  defaultCommitMessage: string;
  confirmDestructive: boolean;         // default true
}
```

Persistência (ADR-0007): arquivo oculto na raiz do vault
(`.openobsidian-git-sync.json`) via `FileStore`. O serviço de config garante que
esse arquivo esteja no `.gitignore` do vault (acrescenta se faltar). Config de
git "real" (remote, upstream) não é duplicada — vem do próprio git.

## 14. Segurança

- **Zero armazenamento de credenciais** (ADR-0005). Push/pull/fetch usam o
  ambiente git do usuário (credential helper/SSH/cache). `auth-failed` é tratado
  como erro com mensagem orientando o usuário, nunca pedindo segredo.
- A ponte é permissiva (exec/FS irrestritos); o plugin não amplia esse alcance e
  confirma ações que reescrevem histórico ou descartam trabalho.
- O arquivo de config é local e fica fora do versionamento.

## 15. Estados de borda e erros

A UI precisa cobrir explicitamente: git ausente (`git-not-found`); vault não é
repo (`uninitialized` → oferecer init); sem remote; branch sem upstream
(oferecer publicar); HEAD destacado (`detached` — desabilitar push/pull com
explicação); auth falhou; conflito após pull; "nada a commitar"; remote
inacessível/offline (cai em `command-failed` com stderr). Cada um mapeia para um
`GitError.kind` (seção 7) e a UI decide a mensagem/ação.

## 16. Build e empacotamento

- TS + Preact compilados e **inlinados** num único `dist/panel.html` (ADR-0002).
- Scripts: `dev` (watch), `build` (gera `panel.html`), `test` (domínio com
  fakes), `package` (zipa `manifest.json` + `panel.html` em `dist/git-sync.zip`,
  manifesto na raiz).
- `manifest.json`: `id`, `name`, `version` (obrigatórios), `icon`,
  `panel: "panel.html"`, `author`, `description`.

## 17. Testes

- **Núcleo puro** (`args.ts`, `parse.ts`, transições de `sync-state.ts`):
  testes unitários diretos, sem I/O.
- **`GitService`**: testado com um **fake `CommandRunner`** que devolve fixtures
  de saída real do git (sem Electron). Preferir fakes a mocks.
- Cobrir os estados de borda da seção 15 com fixtures de `stderr` reais.

## 18. Escopo v1 e backlog

**v1:** seções 2 (objetivos), fluxos da 11, sem background.

**Backlog (fase 2+):**
- Sync em background com painel fechado → exige estender o `main`/ponte do app
  (fork/PR no repo principal) (ADR-0008).
- Agendamento configurável; retry; notificação de sync.
- Gestão assistida de credenciais.
- Resolução de conflito assistida.
- Verbo de config por-plugin na ponte (revisaria ADR-0007).
- Múltiplos remotes; seleção de branch/checkout.

## 19. Decisões relacionadas

ADR-0001 (repo separado) · ADR-0002 (single-file) · ADR-0003 (Preact) ·
ADR-0004 (Ports & Adapters) · ADR-0005 (credenciais) · ADR-0006 (parsing
machine-readable) · ADR-0007 (config no vault) · ADR-0008 (sem background v1).
