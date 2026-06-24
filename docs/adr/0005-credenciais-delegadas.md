# 0005 — Credenciais delegadas ao git do sistema (zero armazenamento)

- Status: Aceito
- Data: 2026-06-23

## Contexto

Operações de rede (push/pull/fetch) precisam de autenticação no remote. O
plugin roda o binário `git` do sistema via `exec`. Armazenar tokens/senhas no
plugin criaria uma superfície de segurança séria, ainda mais num ambiente onde
o iframe tem origin opaca e a persistência confiável é limitada (ADR-0007).

## Decisão

**Não armazenar nenhuma credencial** no plugin. Delegar inteiramente ao
ambiente git do usuário: credential helper do SO, agente SSH, ou cache de
credenciais já configurado. O plugin apenas documenta que o usuário precisa ter
o git autenticado para o remote (ex.: `git push` manual funcionando no terminal).

## Consequências

Positivas: elimina toda uma classe de risco (vazamento de token, storage
inseguro); menos código e menos UI de gestão de segredo; usa o que o usuário já
confia.

Negativas: a primeira configuração de auth fica por conta do usuário (fora do
plugin); se o git não estiver autenticado, push/pull falham e o plugin precisa
**detectar e explicar** o erro com clareza (estado de borda a tratar na UI), em
vez de pedir credenciais.

## Backlog

Gestão assistida de credenciais (ex.: orientar setup de PAT/SSH) fica para uma
fase futura, possivelmente exigindo mudanças no app.
