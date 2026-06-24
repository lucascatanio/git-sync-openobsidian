# 0007 — Persistência de config em arquivo oculto no vault + `.gitignore`

- Status: Aceito
- Data: 2026-06-23

## Contexto

O plugin precisa persistir preferências próprias (intervalo de auto-refresh,
mensagem de commit padrão, etc.). O ambiente limita as opções: não há API
dedicada de config de plugin; o plugin **não conhece o próprio diretório** (a
ponte só injeta `VAULT_PATH`); e `localStorage` no iframe `srcDoc` (origin
opaca) é não confiável. Parte da config "real" (remote, branch) já vive no
`.git/config` do vault.

## Decisão

- Config de **git** (remote, branch upstream): ler/gravar via comandos git,
  não duplicar.
- Config de **preferências do plugin**: gravar um arquivo oculto na raiz do
  vault, ex.: `.openobsidian-git-sync.json`, via `pluginApi.writeFile`.
- **Adicionar esse arquivo ao `.gitignore` do vault automaticamente**, para que
  a config local não seja versionada/sincronizada entre máquinas.

## Consequências

Positivas: persistência funciona só com os verbos existentes da ponte; sem
storage frágil; sem duplicar o que o git já guarda.

Negativas: escreve um arquivo no vault do usuário (precisamos ser explícitos e
discretos sobre isso); se o `.gitignore` não puder ser escrito, há risco de
sincronizar config local — tratar como erro recuperável e avisar via `notify`.

## Backlog

Se evoluirmos para um verbo de config por-plugin na ponte (mudança no app), esta
decisão pode ser revista.
