---
source: e4ac6f7a
---

# Cómo funciona Repo Standards

Escribe tu configuración una vez. Tu agente de programación la aplica en cada
repositorio. Esta página cuenta con palabras la breve historia de la página de
inicio, explica qué hacen la CLI y tu agente de programación, nombra las
herramientas que encajan mejor en algunos casos y expone los límites actuales.

## Cada repositorio, configurado a su manera

Los repositorios son distintos. Cada uno reúne sus propias instrucciones para
agentes, guía de contribución, README, plantillas de issues y comprobaciones,
escritas en otro momento y por otra mano. Nada los mantiene alineados, así que
una convención acordada en un repositorio se copia a mano en el siguiente, o
allí se olvida.

## Escribe la configuración una vez

Una fuente de estándares es una configuración publicada y versionada:
instrucciones para agentes, documentación, plantillas y comprobaciones,
escritas una vez en un repositorio público de GitHub y publicadas como
versiones. Una fuente puede ofrecer perfiles para distintos tipos de
repositorio. [Repo Canon](https://github.com/lutzseverino/repo-canon) es una
configuración lista para empezar, con convenciones de documentación,
contribución, flujo de trabajo con agentes y GitHub. También puedes escribir y
[publicar la tuya](/docs/guides/author-a-source/).

## Tu agente de programación la aplica

La adopción aplica una versión fijada. Pide a tu agente de programación que
ejecute un comando con la URL de la fuente, o ejecútalo tú en una terminal:

```
npx @lutzseverino/repo-standards adopt https://github.com/OWNER/STANDARDS
```

La ejecución elige una versión y un perfil, los registra en `.repo-standards/`,
donde fija esa versión y la CLI que la ejecutó, y aplica la versión al
repositorio. Una parte del trabajo es exacta y otra requiere criterio sobre tu
repositorio; [quién hace qué](#quién-hace-qué) las separa. Todos los cambios
quedan sin commit para que los revises. La guía para
[adoptar una fuente de estándares](/docs/guides/adopt/) recorre los dos
caminos.

## Todos iguales, y así se mantienen

Las actualizaciones mueven la versión fijada. Cuando la fuente publica una
versión más reciente, `outdated` lo indica, y volver a ejecutar `adopt` mueve
la versión fijada y aplica la nueva; la revisas y haces commit como en la
primera adopción. Los repositorios con la misma versión fijada llevan la misma
configuración, y cada uno conserva el contenido que le pertenece. Decidir si
actualizar y cuándo sigue siendo cosa tuya, salvo que elijas que se te
proponga cada actualización.

## Quién hace qué

### La CLI

La CLI resuelve desde GitHub la versión fijada, instala los archivos y las
skills exactos de la fuente, instala las reglas que estos deben seguir
cumpliendo y ejecuta las correcciones y comprobaciones de la fuente. Los
archivos exactos sustituyen el contenido con seguimiento en sus rutas: una
edición de un archivo instalado no sobrevive a una actualización. Una
sobrescritura que descarta ediciones necesita confirmación previa, y el
contenido sin seguimiento en una de esas rutas, que Git no puede recuperar,
detiene la ejecución. La CLI nunca hace commit.

### Tu agente de programación

Tu agente de programación hace el trabajo contextual. Lee las pautas de la
fuente, averigua cuáles de tus archivos cubren y adapta solo el contenido que
pertenece a tu proyecto, como su documentación, según las reglas que la fuente
dejó por escrito. Deja los archivos exactos a la CLI, y el proyecto sigue
siendo dueño de lo que adapta.

### Tú

Tú eliges la fuente y pides la adopción. Antes de hacer commit, revisas el
alcance que encontró tu agente y cada cambio del diff sin commit, con el flujo
de trabajo habitual de tu proyecto. Con un agente, durante la ejecución solo
necesitan tu respuesta una elección de perfil sin resolver o la sobrescritura
de un ajuste remoto.

### Actualizaciones

Las actualizaciones llegan cuando vuelves a ejecutar `adopt`, o con la
[acción de actualización](/docs/guides/automated-updates/) opcional, una acción
de GitHub que propone todas las actualizaciones disponibles en una sola pull
request que se va renovando, al estilo de un bot de dependencias. Nunca
fusiona nada: revisas y fusionas su pull request como cualquier otra.

## Cuándo encaja mejor otra cosa

Otras herramientas también comparten una configuración, y para estos casos son
mejor opción.

- **Un repositorio nuevo.** Créalo a partir de un
  [repositorio plantilla de GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template),
  que copia sus archivos y su estructura de directorios en un repositorio nuevo
  con su propio historial, o genéralo desde una plantilla de
  [Copier](https://copier.readthedocs.io/en/stable/).
- **Muchos repositorios con un mismo stack.** Si sus diferencias caben en
  variables de plantilla, usa Copier: guarda tus respuestas en
  `.copier-answers.yml`, y `copier update` genera la versión etiquetada más
  reciente de la plantilla y
  [vuelve a aplicar los cambios propios de tu proyecto](https://copier.readthedocs.io/en/stable/updating/).
  [El gestor de Copier de Renovate](https://docs.renovatebot.com/modules/manager/copier/)
  propone esa actualización cuando la plantilla etiqueta una versión. Es
  determinista y no necesita ningún agente.
- **Configuración generada que nadie edita a mano.** Usa
  [projen](https://github.com/projen/projen). Sintetiza archivos como
  `package.json` y flujos de trabajo de GitHub a partir de una definición
  tipada en `.projenrc`, y los marca como de solo lectura.
- **Un monorepo de Nx.** Usa los
  [generadores de Nx](https://nx.dev/docs/features/generate-code) para crear la
  estructura, y `nx migrate` para actualizar las versiones de los paquetes y
  ejecutar
  [las migraciones](https://nx.dev/docs/features/automate-updating-dependencies)
  que adaptan tu configuración y tu código.
- **Archivos idénticos en repositorios que son tuyos.** Una acción de
  sincronización de archivos, como
  [Repo File Sync Action](https://github.com/BetaHuhn/repo-file-sync-action),
  abre pull requests que copian archivos de un repositorio a otros. Para los
  archivos de salud de la comunidad, como `CONTRIBUTING.md` y las plantillas de
  issues, el repositorio público `.github` de una organización proporciona
  [archivos predeterminados](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
  a todos los repositorios que no tienen uno propio.
- **Solo skills para agentes.** Usa la
  [CLI de skills](https://github.com/vercel-labs/skills), `npx skills`, que
  instala skills para muchos agentes de programación y comprueba si tienen
  actualizaciones.

Repo Standards encaja con una configuración compartida que es sobre todo prosa
y procesos, aplicada en muchos repositorios de formas distintas, donde una
parte son archivos exactos y otra requiere criterio sobre cada repositorio, y
que se mantiene al día con actualizaciones que tú revisas.

## Límites actuales

- Solo GitHub: las fuentes de estándares proceden de repositorios públicos de
  GitHub, y la acción de actualización es una acción de GitHub.
- No hay fuentes de estándares privadas.
- Node.js 24 o 26, en macOS o Linux.
- La parte contextual necesita un agente de programación. Sin él, la terminal
  te guía y tú haces las ediciones.
- Hoy hay una sola fuente pública real:
  [Repo Canon](https://github.com/lutzseverino/repo-canon).
