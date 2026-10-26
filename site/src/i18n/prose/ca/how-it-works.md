---
source: e4ac6f7a
---

# Com funciona Repo Standards

Escriu la teva configuració un cop. El teu agent de programació l'aplica a cada
repositori. Aquesta pàgina explica amb paraules la breu història de la pàgina
d'inici, diu què fan la CLI i el teu agent de programació, anomena les eines
que encaixen millor en alguns casos i exposa els límits actuals.

## Cada repositori, configurat a la seva manera

Els repositoris són diferents. Cadascun acumula les seves pròpies instruccions
per a agents, guia de contribució, README, plantilles d'issues i comprovacions,
escrites en un altre moment i per una altra mà. Res no els manté alineats, de
manera que una convenció acordada en un repositori es copia a mà al següent, o
s'hi oblida.

## Escriu la configuració un cop

Una font d'estàndards és una configuració publicada i versionada: instruccions
per a agents, documentació, plantilles i comprovacions, escrites un cop en un
repositori públic de GitHub i publicades com a versions. Una font pot oferir
perfils per a diferents tipus de repositori.
[Repo Canon](https://github.com/lutzseverino/repo-canon) és una configuració a
punt per començar, amb convencions de documentació, contribució, flux de
treball amb agents i GitHub. També pots escriure i
[publicar la teva](/docs/guides/author-a-source/).

## El teu agent de programació l'aplica

L'adopció aplica una versió fixada. Demana al teu agent de programació que
executi una ordre amb l'URL de la font, o executa-la tu mateix en un terminal:

```
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

L'execució tria una versió i un perfil, els registra a `.repo-standards/`, on
fixa aquesta versió i la CLI que l'ha executat, i aplica la versió al
repositori. Una part de la feina és exacta i una altra requereix criteri sobre
el teu repositori; [qui fa què](#qui-fa-què) les separa. Tots els canvis queden
sense commit perquè els revisis. La guia per
[adoptar una font d'estàndards](/docs/guides/adopt/) recorre tots dos camins.

## Tots iguals, i així es mantenen

Les actualitzacions mouen la versió fixada. Quan la font publica una versió més
nova, `outdated` ho indica, i tornar a executar `adopt` mou la versió fixada i
aplica la nova; la revises i en fas commit com en la primera adopció. Els
repositoris amb la mateixa versió fixada porten la mateixa configuració, i
cadascun conserva el contingut que li pertany. Decidir si actualitzar i quan
continua sent cosa teva, tret que triïs que se't proposi cada actualització.

## Qui fa què

### La CLI

La CLI resol des de GitHub la versió fixada, instal·la els fitxers i les skills
exactes de la font, instal·la les regles que aquests han de continuar complint
i executa les correccions i comprovacions de la font. Els fitxers exactes
substitueixen el contingut seguit als seus camins: una edició d'un fitxer
instal·lat no sobreviu a una actualització. Una sobreescriptura que descarta
edicions necessita confirmació prèvia, i el contingut no seguit en un d'aquests
camins, que Git no pot recuperar, atura l'execució. La CLI no fa mai cap
commit.

### El teu agent de programació

El teu agent de programació fa la feina contextual. Llegeix les pautes de la
font, troba quins dels teus fitxers cobreixen i adapta només el contingut que
pertany al teu projecte, com ara la seva documentació, segons les regles que la
font ha deixat per escrit. Deixa els fitxers exactes a la CLI, i el projecte
continua sent l'amo del que adapta.

### Tu

Tu tries la font i demanes l'adopció. Abans de fer commit, revises l'abast que
ha trobat el teu agent i cada canvi del diff sense commit, amb el flux de
treball habitual del teu projecte. Amb un agent, durant l'execució només
necessiten la teva resposta una elecció de perfil pendent o la sobreescriptura
d'un paràmetre remot.

### Actualitzacions

Les actualitzacions arriben quan tornes a executar `adopt`, o amb
l'[acció d'actualització](/docs/guides/automated-updates/) opcional, una acció
de GitHub que proposa totes les actualitzacions disponibles en una sola pull
request que es va renovant, com un bot de dependències. No fusiona mai res:
revises i fusiones la seva pull request com qualsevol altra.

## Quan encaixa millor una altra cosa

Altres eines també comparteixen una configuració, i per a aquests casos són una
opció millor.

- **Un repositori nou.** Crea'l a partir d'un
  [repositori plantilla de GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template),
  que en copia els fitxers i l'estructura de directoris a un repositori nou amb
  el seu propi historial, o genera'l a partir d'una plantilla de
  [Copier](https://copier.readthedocs.io/en/stable/).
- **Molts repositoris amb un mateix stack.** Si les seves diferències caben en
  variables de plantilla, fes servir Copier: desa les teves respostes a
  `.copier-answers.yml`, i `copier update` genera la versió etiquetada més nova
  de la plantilla i
  [torna a aplicar els canvis propis del teu projecte](https://copier.readthedocs.io/en/stable/updating/).
  [El gestor de Copier de Renovate](https://docs.renovatebot.com/modules/manager/copier/)
  proposa aquesta actualització quan la plantilla etiqueta una versió. És
  determinista i no necessita cap agent.
- **Configuració generada que ningú no edita a mà.** Fes servir
  [projen](https://github.com/projen/projen). Sintetitza fitxers com ara
  `package.json` i fluxos de treball de GitHub a partir d'una definició tipada a
  `.projenrc`, i els marca com de només lectura.
- **Un monorepo d'Nx.** Fes servir els
  [generadors d'Nx](https://nx.dev/docs/features/generate-code) per crear
  l'estructura, i `nx migrate` per actualitzar les versions dels paquets i
  executar
  [les migracions](https://nx.dev/docs/features/automate-updating-dependencies)
  que adapten la teva configuració i el teu codi.
- **Fitxers idèntics en repositoris que són teus.** Una acció de sincronització
  de fitxers, com ara
  [Repo File Sync Action](https://github.com/BetaHuhn/repo-file-sync-action),
  obre pull requests que copien fitxers d'un repositori a d'altres. Per als
  fitxers de salut de la comunitat, com ara `CONTRIBUTING.md` i les plantilles
  d'issues, el repositori públic `.github` d'una organització proporciona
  [fitxers per defecte](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
  a tots els repositoris que no en tenen un de propi.
- **Només skills per a agents.** Fes servir la
  [CLI de skills](https://github.com/vercel-labs/skills), `npx skills`, que
  instal·la skills per a molts agents de programació i comprova si tenen
  actualitzacions.

Repo Standards encaixa amb una configuració compartida que és sobretot prosa i
processos, aplicada a molts repositoris de formes diferents, on una part són
fitxers exactes i una altra requereix criteri sobre cada repositori, i que es
manté al dia amb actualitzacions que tu revises.

## Límits actuals

- Només GitHub: les fonts d'estàndards provenen de repositoris públics de
  GitHub, i l'acció d'actualització és una acció de GitHub.
- No hi ha fonts d'estàndards privades.
- Node.js 24 o 26, a macOS o Linux.
- La part contextual necessita un agent de programació. Sense agent, el
  terminal et guia i tu mateix fas les edicions.
- Avui hi ha una sola font pública real:
  [Repo Canon](https://github.com/lutzseverino/repo-canon).
