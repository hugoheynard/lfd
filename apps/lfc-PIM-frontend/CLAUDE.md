# lfc-PIM-frontend — conventions

## Un dossier par composant (règle permanente)

Quand tu construis quoi que ce soit dans ce frontend (page, composant,
widget), **chaque unité vit dans son propre dossier**, avec les fichiers
**séparés** :

```
channels/settings-page/
  settings-page.ts       # logique + @Component (templateUrl/styleUrl)
  settings-page.html     # le template
  settings-page.scss     # les styles
  settings-page.spec.ts  # les tests (quand il y en a)
```

- Pas de `template:` ni `styles:` inline dans le `.ts` — toujours
  `templateUrl` / `styleUrl` vers les fichiers frères.
- Le nom du dossier = le nom du composant (kebab-case), et les fichiers
  reprennent ce nom.
- `ViewEncapsulation.None` est autorisé **uniquement** pour relocaliser du
  CSS global sans casser le scoping — pas par défaut.

S'applique à tout nouveau composant. Les composants hérités en template
inline (`products-page.ts`, `product-form.ts`, …) sont à éclater vers cette
forme au fil des passages.

## Fold d'abord (reuse-before-create)

**Tout composant qui existe dans `fold-ng` vient de `fold-ng`** — jamais de
réimplémentation maison d'un bouton, champ, checkbox, badge, carte, table,
callout, panel, etc. Avant de créer un composant, vérifier le catalogue fold
(`import { Fold… } from 'fold-ng'`). On ne crée un composant applicatif que
pour de la logique **métier** (ex. `channel-matrix`), et même là il **compose**
des primitives fold plutôt que de styler des `<button>`/`<input>` bruts.

Tokens fold uniquement (`--fold-color-*`, `--fold-space-*`, …) — pas de couleur
ni d'espacement en dur.

**Les états d'une vue passent tous par fold, sans exception** : `fold-loading`
(chargement), `fold-empty-state` en `tone="alert"` (erreur), `fold-empty-state`
(vide), `fold-callout` (échec partiel qui laisse le contenu à l'écran). Jamais un
`<p class="state">Chargement…</p>` maison, jamais un état inventé. Le tableau
complet et le piège des attributs muets :
[`../lfc-B2B-platform-frontend/CLAUDE.md`](../lfc-B2B-platform-frontend/CLAUDE.md).

## POC frontend-only (contexte)

Pas de backend en POC : la « DB » est un seed versionné dans le repo
(`src/app/data/db.seed.ts`), embarqué dans le build, avec un overlay
`localStorage` (SSR-guardé) via `LocalDb`. Les services `*-api.ts` gardent
leurs signatures publiques mais tapent dans `LocalDb`, jamais dans le réseau.
Objectif : démo statique (GitHub Pages) depuis n'importe quelle machine.
