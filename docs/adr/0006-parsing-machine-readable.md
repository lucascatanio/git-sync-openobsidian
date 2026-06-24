# 0006 — Parse apenas de saída machine-readable do git

- Status: Aceito
- Data: 2026-06-23

## Contexto

A UI depende de ler estado do git: arquivos modificados/staged, branch atual,
ahead/behind, histórico, diff. A saída "humana" do git (ex.: `git status` sem
flags) é instável entre versões/locales e difícil de parsear de forma confiável.

## Decisão

Usar **somente formatos machine-readable** do git e parsear esses. Exemplos:

- Estado de arquivos: `git status --porcelain=v2 --branch -z`.
- Ahead/behind: `git rev-list --count @{u}..HEAD` e `git rev-list --count HEAD..@{u}`.
- Branch: `git rev-parse --abbrev-ref HEAD`.
- Repo válido: `git rev-parse --is-inside-work-tree`.
- Histórico: `git log --format=%H%x00%an%x00%at%x00%s` (campos separados por NUL).
- Diff: `git diff --no-color` por arquivo.

Nunca fazer parse de output destinado a humanos.

## Consequências

Positivas: parsing estável e testável; resiliente a versão/locale do git;
campos delimitados (`-z`/NUL) evitam ambiguidade com nomes de arquivo estranhos.

Negativas: exige conhecer as flags certas e tratar formatos por subcomando; cada
parser precisa de teste com fixtures de saída real (alinhado ao domínio puro do
ADR-0004).
