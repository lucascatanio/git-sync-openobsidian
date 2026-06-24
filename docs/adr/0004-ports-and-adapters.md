# 0004 — Arquitetura Ports & Adapters (domínio git puro + adapter da ponte)

- Status: Aceito
- Data: 2026-06-23

## Contexto

O usuário quer "padrões de código" no sentido de SOLID/DDD/Clean Code. O
domínio real é estreito ("git, com botões"), e o runtime é hostil a testes
(iframe sandboxed). Precisamos de uma arquitetura que dê testabilidade e
separação clara sem cair em cerimônia (DDD pesado seria overkill aqui).

## Decisão

Adotar **Ports & Adapters (hexagonal) em escala pequena**, com:

- **Domínio puro** (`git.ts`): semântica do git em funções puras que montam
  argumentos e fazem parse de saída machine-readable, retornando tipos do
  domínio. Depende de **interfaces** (`CommandRunner`, `FileStore`), nunca da
  ponte concreta.
- **Linguagem ubíqua tipada** (`types.ts`): `RepoStatus`, `FileChange`,
  `Commit`, `SyncState`, `Conflict`.
- **Adapter** (`bridge.ts`): implementa os ports sobre o postMessage RPC do
  host. Único lugar que conhece o protocolo.
- **UI/estado** orquestram o domínio; a UI nunca chama a ponte direto para git.

Princípios aplicados: **SRP** (uma razão de mudança por camada) e **DIP** (alto
nível depende de abstração). OCP/LSP/ISP só onde surgem naturalmente. **Não**
adotamos DDD pesado (agregados, repositories como pattern, domain events).

## Consequências

Positivas: `git.ts` é testável injetando um `CommandRunner` falso, sem Electron;
trocar o mecanismo de IPC no futuro toca só o adapter; código legível e com
fronteiras claras.

Negativas: uma indireção a mais (interfaces) que, mal usada, vira boilerplate —
mantê-la mínima é responsabilidade contínua.
