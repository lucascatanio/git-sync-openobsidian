# Git Sync — OpenObsidian

Cliente git visual para o seu vault do OpenObsidian. Faça commit, push e pull
pela interface do app, usando um repositório remoto como nuvem das suas notas.

> Em desenvolvimento inicial. O scaffolding está pronto; as operações git ainda
> não. Acompanhe pelo `docs/ROADMAP.md`.

## O que é

Suas notas são texto puro. Versionar com git te dá histórico, backup e
sincronização entre máquinas, o problema é ter que ir pro terminal toda hora.
Esta extensão coloca o status do repositório e os comandos de sincronização
dentro do OpenObsidian. Como ela chama o git do seu sistema, funciona com
qualquer remote: GitHub, GitLab, Gitea, o que você usar.

## Status

A extensão é construída em blocos pequenos. Agora está no scaffolding: build,
empacotamento e integração com o tema do app já funcionam; as operações git vêm
nos próximos blocos. O plano completo está em `docs/ROADMAP.md`.

## Rodando em desenvolvimento

Precisa de Node e do OpenObsidian instalado.

```
npm install
npm run dev:install
```

O comando builda a extensão e copia pra pasta de plugins do app. No
OpenObsidian, reabra o app, abra uma nota e clique no ícone de branch na
toolbar. (O botão só aparece com uma nota aberta, é uma peculiaridade do app,
não da extensão.)

## Build e empacotamento

```
npm run build      # gera dist/panel.html
npm run package    # empacota em dist/git-sync.zip
```

A saída é um `panel.html` único e auto-contido mais o `manifest.json` — o
formato que o OpenObsidian carrega.

## Documentação

A especificação da feature e os contratos estão em `docs/SPEC.md`. As decisões
de arquitetura ficam em `docs/adr/`, o plano de entrega em `docs/ROADMAP.md`, e
as notas de ambiente e armadilhas em `docs/LESSONS.md`.

## Créditos

Ícone de branch no estilo Lucide (licença ISC).