# lfc-B2B-admin-frontend — conventions

Back-office **staff** de La Folie Coffee : comptes clients, commercial,
commandes, réglages. Même stack que `lfc-B2B-platform-frontend` (Angular 22
zoneless, signals, fold-ng, Vitest), et **les mêmes conventions** :

👉 [`../lfc-B2B-platform-frontend/CLAUDE.md`](../lfc-B2B-platform-frontend/CLAUDE.md)
est la source de vérité — un dossier par composant, fold d'abord, tokens fold
uniquement, zéro CSS morte, un composant ne pose jamais sa marge, toute page
routée dans un `fold-page-layout`.

Ce fichier ne répète pas ces règles. Il ne porte que ce qui est **propre au
back-office**.

## Les états d'une vue passent TOUS par fold

Rappel explicite parce que c'est la règle la plus souvent enfreinte ici — le
détail et le tableau des quatre cas sont dans le fichier ci-dessus. En résumé :
`fold-loading` pour le chargement, `fold-empty-state` (`tone="alert"`) pour
l'erreur, `fold-empty-state` pour le vide, `fold-callout` pour un échec partiel
qui laisse le contenu à l'écran. **Jamais** un `<p class="state">Chargement…</p>`
ni un `<div>` d'erreur maison, et **aucun nouvel état inventé**.

Balayage fait le 2026-08-14 : les onze écrans qui bricolaient encore le leur ont
été alignés, et le CSS correspondant supprimé. Toute réapparition est une
régression.

## Zéro `<select>` natif, zéro carte maison

Deux autres règles du fichier ci-dessus, rappelées parce qu'elles viennent
d'être appliquées ici : le contrôle de choix est **`fold-listbox`** (API
`[options]`, libellé **visible**), et une carte est **`fold-card`** +
**`fold-element-title`** — jamais un `<article>` stylé à la main.

Balayage fait le 2026-08-14 : plus aucun `<select>` dans l'app (les quatre
derniers étaient dans Croissance), et cette page ne dessine plus ni carte, ni
en-tête, ni pastille de portée, ni encadré d'aparté.

## Deux arbres de navigation (dette connue)

Une entrée de menu doit être ajoutée **deux fois** : au rail `fold-menu-item`
_et_ aux tuiles `fold-nav-launcher` (le menu mobile). Les deux ne partagent pas
leur modèle, et les tuiles n'ont pas de `badge`. Une entrée ajoutée d'un seul
côté est invisible sur l'autre — c'est arrivé pour « Accès à remettre ».
L'unification est un chantier fold, pas applicatif.

## Surfaces admin

Les contrôleurs backend consommés ici sont marqués `@AdminSurface(...)` et
vivent sous `/admin`. Le mur staff n'est pas encore appliqué route par route
(cf. `documentation/todos/`) — ne pas supposer qu'une route admin est
autorisée par le simple fait d'exister.
