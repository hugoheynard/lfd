# Plan — découper le fournil en métiers autour de la journée

> Plan du 2026-11-15 (v2, après `vitruve` : le noyau importait encore le
> plan par les tranches, et la matrice oubliait l'impression), demandé par Hugo (« je veux une belle isolation »).
> Pas encore bâti. Touche une frontière du dépôt (une porte neuve) :
> `vitruve` avant Hugo. S'ouvre après la fin des coches
> ([`plan-fin-des-coches.md`](plan-fin-des-coches.md)), qui touche l'atelier.

## 1. En simple

Le bloc `production/` est **un seul contexte à plat** : 374 fichiers rangés
par couche (`domain/`, `application/`, `infrastructure/`, `http/`), où
l'atelier, le prod manager, la qualité et le réassort se côtoient dans les
mêmes dossiers et les mêmes services. Le dépôt veut ailleurs un sous-dossier
par contexte métier (`lafoliecoffee/orders/`, `lafoliecoffee/account/`).

Ces métiers partagent pourtant **une même chose** : la journée de production
(arrêtée par le prod manager, fournée par l'atelier, retenue par la qualité,
lancée en réassort). La séparer casserait l'agrégat qui la protège. La forme
est donc **un noyau, et des métiers autour** :

```mermaid
flowchart TB
  subgraph production
    DAY["day/ — la journée : agrégat, verrou, compte, fournées, version"]
    PRINT["shared/print/ — primitives d'impression (pastilles, camemberts, pages)"]
    PLAN["plan/ — le prod manager : prévisionnel, arrêt, réouverture, retirage, clôture, tranches, dossier du jour"]
    ATELIER["atelier/ — la fiche : fournées, contenants, raccourcis, rangement, affichage"]
    QUALITY["quality/ — contrôles, retenues, photos"]
    RESUPPLY["resupply/ — le réassort"]
    CH["channels/ — inchangé"]
  end
  PLAN --> DAY
  ATELIER --> DAY
  QUALITY --> DAY
  RESUPPLY --> DAY
  ATELIER -->|lit les retenues, par port| QUALITY
  PLAN -->|consigne les réassorts à l'arrêt| RESUPPLY
  PLAN --> PRINT
  ATELIER --> PRINT
  PRINT --> DAY
  DAY --> CH
  PLAN --> CH
  ATELIER --> CH
  QUALITY --> CH
  RESUPPLY --> CH
```

**La règle**, tenue par une porte : chaque métier lit `day/`,
`shared/print/` et `channels/` ; `shared/print/` lit `day/` ; les seules
arêtes entre métiers sont celles du schéma, à sens unique ; `day/`
n'importe ni un métier ni `shared/print/`. La porte raisonne aussi **par
modèle Prisma** : chaque modèle du schéma `production` appartient à un
sous-contexte, et l'infrastructure d'un autre sous-contexte ne le lit pas —
sans quoi une lecture en Prisma direct franchirait la frontière que les
imports respectent (`prisma-model-ownership` raisonne par bloc,
`dev-toolbox/gates/prisma-model-ownership.mjs:63`).

## 2. Ce qui existe (cartographie du 2026-11-15)

Classement fichier par fichier fait par nom et par imports (non ouvert un à
un) ; les ambigus sont tranchés au § 3. Trois **cycles de fichiers** empêchent
aujourd'hui un ordre propre :

| Cycle             | Par où                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| atelier ⇄ plan    | `production-worksheet-reading.service.ts:22-23` et `worksheet-deadlines-reading.service.ts:4,5,9` (atelier lit les tranches) ; `domain/services/day-dossier.ts:14` (le dossier lit `root-shelves`) |
| plan ⇄ papiers    | `dossier-dispatch.service.ts:22` → `production-paper.service` ; les PDF du dossier importent `day-dossier`, `plan-signer`…                                                                         |
| atelier ⇄ papiers | `atelier-sheet-pdf.ts:20-25` (primitives d'impression) ; `production-paper.service.ts:38` → `worksheet-deadlines-reading`                                                                          |

Et le noyau importe deux métiers : `production-day.batches.ts:11` →
`production-output.ts` ; `production-day.launch.ts:7-8`,
`production-day.plan.ts:9` → `resupply-launch-errors`, `production-count.ts`.

Services partagés qui bloquent : `production-worksheet-reading.service`
(lit qualité, tranches, affichage), `production-paper.service` (9
dépendances : rendu, archivage, URL, logo, fiches), `sealed-day-reading.service`
(qualité et plan). Contrôleurs à plusieurs métiers :
`production-day.controller.ts` (plan, réassort, papiers, atelier),
`production-worksheet.controller.ts` (atelier + retirage),
`production-settings.controller.ts` (tranches, jours fermés, affichage).

La porte `context-boundaries` ne connaît que les blocs
(`dev-toolbox/gates/context-boundaries.mjs:185`) : rien ne tiendrait un
découpage interne.

## 3. Les tranchages

- **Au noyau `day/`** : l'agrégat et ses fichiers, `production-output`,
  `production-count`, `shipment-ref`, `sealed-day-reading`, la version et
  l'élagueur de journée, les colonnes partagées, `packing-overlay`,
  `resupply-launch-errors` (refusées par l'agrégat), et **les tranches** :
  `production-deadlines`, `production-tranches`, l'entité et les ports des
  réglages de tranches et leurs adaptateurs. Les tranches disent le rythme de
  la journée, lu par l'atelier, le plan et le dossier ; le geste qui les
  règle (`set-production-tranches`) reste au plan et écrit par le port du
  noyau.
- **Pas de métier « papiers »** : un document appartient au métier qui le
  produit. Le dossier du jour et le compte à produire vont au `plan/`, la
  fiche d'atelier PDF à l'`atelier/`. Les **primitives** d'impression
  (`count-color-pie`, `count-color-shares`, `line-tally`, `order-routing-pdf`,
  `order-color-swatch`, `made-to-order`, les pages, `fulfillment-method-label`)
  vont à `shared/print/`. `ProductionPapers` est coupé en deux : le rendu et
  l'archivage, appelés par chaque métier.
- **`root-shelves`** (le rangement par catégorie racine) va à
  `shared/print/` : c'est une règle de présentation, lue par la fiche et le
  dossier.
- **Les réglages d'affichage** appartiennent à l'atelier ; leur route quitte
  `production-settings.controller` pour un contrôleur de l'atelier (le
  chemin d'API ne change pas).
- **Les retenues qualité** sont lues par l'atelier par un port que `quality/`
  publie (`QualityHoldsReader`), jamais par ses fichiers internes.
- **Le retirage** est un geste du plan ; sa route quitte le contrôleur de la
  fiche pour un contrôleur du plan (même chemin).
- **La supervision** (`production-supervision.controller`) lit la fiche : elle
  va à l'atelier.
- Les chemins d'API **ne changent pas** : seuls les fichiers bougent.

## 4. Lots

**Les coupes d'abord, les déplacements ensuite.** Couper un service ou créer
un port change du code ; déplacer un fichier n'en change pas. Les deux ne se
mêlent jamais dans un lot.

1. **D0 — la porte et la carte.** `lint:production-subcontexts` lit le graphe
   d'imports réel de `src/production/` et la propriété des modèles ; elle
   publie la **carte vérifiée** fichier → sous-contexte (remplace le
   classement par nom du § 2) et **compte** les imports et lectures interdits
   d'aujourd'hui comme une dette qui ne peut que décroître.
2. **C1 — couper `ProductionPapers`** en rendu et archivage.
3. **C2 — couper les contrôleurs** à plusieurs métiers
   (`production-day`, `production-worksheet`, `production-settings`) : un
   contrôleur par métier, mêmes chemins d'API, e2e inchangés.
4. **C3 — le port `QualityHoldsReader`** et la coupe de
   `production-worksheet-reading.service`.
5. **D1 — déplacer le noyau** (`day/`) et `shared/print/`.
6. **D2 — déplacer la qualité. D3 — le réassort. D4 — le plan. D5 —
   l'atelier** (dont `production-batch-shortcuts.module.ts`).
7. **D6 — un module Nest par métier.** `day/` devient un module qui fournit
   et exporte la journée (dépôt, verrou, version, tranches) ; les quatre
   métiers l'importent, jamais l'inverse, et aucun `forwardRef` (zéro
   aujourd'hui, la porte le refuse). `ProductionModule` ne fait plus
   qu'importer et réexporter les 14 fournisseurs qu'`appBootstrap` relie. Seul
   lot qui peut changer l'ordre d'instanciation : il passe la suite e2e du
   fournil entière et le semis dev.

**Ce que chaque déplacement doit emporter**, listé dans son lot :

- les chemins écrits en dur dans les portes :
  `dev-toolbox/gates/mail-attachment-by-reference.mjs:43`,
  `mail-receipt-admitted.mjs:65`, `mail-status-honest.mjs:132`
  (`dossier-dispatch.service.ts`, D4),
  `write-idempotence-exceptions.json:365` (raccourcis, D5) et `:371`
  (destinataires du dossier, D4) ;
- les imports d'`appBootstrap` (6 fichiers), du semis `dev/seeding`
  (4 fichiers) et de `test/` (9 fichiers, e2e et rejeu) ;
- les chemins cités par la documentation (24 documents) et par les
  commentaires d'autres blocs.

Chaque lot : `pnpm lint:gates`, tests unitaires du bloc, e2e du fournil, un
commit. Aucune migration, aucun chemin d'API changé.

## 5. Corrections faites avant, à part (revue du 2026-11-15)

Deux défauts vérifiés, petits, corrigés dans un lot à eux avant D0 :

- **Le contrôle qualité décide hors verrou**
  (`render-quality-check.handler.ts:100-136`) : il prendra le verrou de la
  journée, relira, puis décidera, comme les fournées.
- **Deux registres peuvent écraser leur issue**
  (`prisma-auto-close-round.ts:108`, `prisma-dossier-dispatch.log.ts:30`) :
  `settle` ne s'applique qu'à une issue encore `pending`, comme
  `prisma-production-return.requests.ts:41`.

Tests de régression : deux contrôles qualité simultanés sur la même journée
ne posent qu'une retenue, et un contrôle sur une commande partie pendant
qu'il s'écrit est refusé ; un `settle` rejoué ne réécrit pas une issue déjà
posée.
