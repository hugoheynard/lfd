# Chevallot PIM — Journal de bord

> Tenu au fil de l'eau. Chaque ajout a **deux lectures** : **PM** (ce que ça change pour le produit /
> le métier, sans jargon) et **Tech** (ce qui a été fait, et pourquoi comme ça).
>
> Ce journal raconte le **chemin**. Les décisions structurantes vivent dans [`adr.md`](./adr.md),
> les restes à faire dans [`todo.md`](./todo.md), le modèle dans [`data-model/`](./data-model/).

**Tenue** : une section `## AAAA-MM-JJ` par jour, la plus récente **en haut**. Un `###` par ajout.
On n'y met que ce qui mérite d'être retrouvé dans trois mois.

---

## 2026-07-20 — Jour 1 : socle, modèle, base, auth

### Choix du monorepo : Turborepo (Nx écarté)

**PM** — La suite LaFolieDouce hébergera plusieurs outils ; il fallait un socle commun. On a retenu
l'outillage déjà éprouvé sur l'autre projet plutôt qu'un nouvel écosystème, pour aller vite sans
réapprendre.

**Tech** — pnpm workspaces + **Turborepo** (`apps/*`, `packages/*`), calqué sur SH3PHERD. Nx a été
essayé **et abandonné** : son preset impose un TS *project-references* incompatible avec Angular
(mur rencontré à l'`init`). Turbo gagne aussi sur la transparence (tout est greppable, pas de target
inférée). → [ADR-08](./adr.md#adr-08--monorepo-turborepo--pnpm-pas-nx)

### Les deux apps du PIM sont debout

**PM** — La coquille du PIM existe : une interface et une API démarrent en local. Rien de métier
encore, mais tout le reste peut s'y greffer.

**Tech** — Scaffoldées avec les **CLI officiels** (`ng new`, `nest new`), pas à la main, puis versions
**alignées sur SH3PHERD** : Angular **22.0.7** (zoneless, SSR, SCSS) et NestJS **11.1.9**. API sur
**3100** (le 3000 est pris par SH3PHERD), front sur 4200.

### Filet de sécurité dès le premier jour

**PM** — On attrape les erreurs à la compilation plutôt qu'en production. C'est du temps investi une
fois qui évite des bugs coûteux plus tard.

**Tech** — Couche de flags partagée `tsconfig/tsflags.backend.json` (base stricte + **`noUncheckedIndexedAccess`**,
`verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature`). Ces flags **imposent l'ESM** → backend
passé en `type: module` + imports `.js`. Tests : **Jest** (back) et **Vitest** (front), configs
reprises de SH3PHERD. → [ADR-10](./adr.md#adr-10--backend-esm--flags-ts-stricts-partagés)

### Dépôt privé + confort de dev

**PM** — Le code est sauvegardé chez GitHub, en **privé**. Démarrer l'environnement complet tient en
un clic.

**Tech** — Repo `hugoheynard/lfd` (privé), branche par défaut **`dev`**. `.gitignore` durci et
**vérifié** (aucun secret, `node_modules`, `dist`, `.env` versionnés). Scripts `dev:watch` par app +
`chevallot-suite:dev:watch` (turbo), et configs **`.run/` WebStorm** avec un compound « une console
par process ».

### Galop d'essai : allergènes GS1 → INCO

**PM** — Premier vrai bout de métier, volontairement pris sur le sujet **le plus sensible
légalement** : les allergènes. Le système sait déjà transformer une donnée technique internationale
en affichage conforme UE.

**Tech** — Domaine pur (testable sans framework) : table de correspondance **n:1**, `toInco()`
(filtre + dédup + localise + met en évidence) et `toGdsn()` (pass-through B2B). ⚠️ **Correction en
cours de route** : j'avais d'abord modélisé un catalogue INCO plat — à l'envers de l'ADR-07. Refait
en **GS1 canonique → projection INCO**. Codes GS1 encore **provisoires** (à peupler depuis
`ref.gs1.org`).

### La documentation du projet est née

**PM** — Les décisions sont tracées avec leur *pourquoi*, et les questions encore ouvertes sont
visibles au lieu de rester dans une tête.

**Tech** — `documentation/chevallot/` : index, **ADR-01→12**, **todo** (décisions ouvertes D1–D6 +
backlog), `data-model/` avec **diagrammes Mermaid**. Les docs de cadrage ont été portées dans le repo
plutôt que laissées sur le Bureau.

### Modèle de données : le produit, en couches

**PM** — On sait maintenant précisément ce qu'*est* un produit — et surtout ce qui n'en fait **pas**
partie. Le prix et la disponibilité sont des sujets à part : un même croissant n'a pas le même prix
en boutique, sur le web et en B2B.

**Tech** — Socle figé `Product` / `ProductVariant` / `Category`. Deux décisions structurelles :
**champs texte traduisibles dès J1** (`LocalizedText` = `jsonb {fr, en?}`, FR obligatoire) et
**`attributes jsonb`** comme échappatoire d'extensibilité. ⚠️ **Correction** : le premier jet mélangeait
des couches (poids, TVA dans le socle) — refait avec un schéma en couches + ER.

### Décision de fond : event sourcing

**PM** — On pourra **rejouer l'historique** du catalogue et savoir qui a changé quoi, quand — sans
alourdir les fiches produit avec des colonnes techniques.

**Tech** — Le log d'events devient la **source de vérité** ; les tables sont des **projections**
reconstructibles. Conséquence directe : **suppression des `created_at`/`updated_at`** du modèle — le
« qui / quand / version » vit sur l'event. `status` devient une projection d'events.
→ [ADR-11](./adr.md#adr-11--catalogue-event-sourced-event-store-dès-le-départ). Reste à trancher :
les **frontières d'agrégat** (D6).

### Nutrition & allergènes

**PM** — La fiche réglementaire minimale est définie : **allergènes obligatoires**, et en option les
calories, la répartition glucides / lipides / protéines, et l'indice glycémique.

**Tech** — `NutritionInfo` rattachée au produit, valeurs **pour 100 g**. `allergens` requis (`[]` =
déclaration positive « aucun »). Invariant : **pas de publication sans allergènes déclarés**.
→ [`data-model/03-nutrition.md`](./data-model/03-nutrition.md)

### Base de données : Prisma + Postgres local

**PM** — On a une vraie base de données, **gratuite et locale**, identique à celle qui tournera en
production. Plus besoin de compte en ligne pour développer.

**Tech** — **Prisma 7** dans `src/infra/database/`. Trois pièges traversés : le client généré est du
**TS source ESM** (placé dans `src/` pour être compilé), il utilise `import.meta` (→ **Jest passé en
ESM**), et Prisma 7 exige un **driver adapter** (`@prisma/adapter-pg`, cohérent avec un serveur
long-running). Postgres **17** en Docker (`pnpm dev:infra`) sur le port **5433** (5432 déjà occupé).
Connexion validée de bout en bout.

### Authentification : Auth0

**PM** — La connexion est **déléguée à un service éprouvé** : aucun mot de passe à stocker ni à
sécuriser nous-mêmes. Le free tier couvre très largement nos besoins (l'équipe interne, pas les
clients B2C — eux passent par Shopify).

**Tech** — `src/infra/auth/` : vérification des JWT RS256 contre le JWKS du tenant avec **`jose`**
(pas Passport — ESM natif, testable). Guard **global** → API **protégée par défaut**, ouverture
explicite via `@Public()`. Fail-fast si la config Auth0 manque. Tests d'intégration sur une mini-app
Nest. → [ADR-12](./adr.md#adr-12--authentification-déléguée-à-auth0-vérifiée-avec-jose)

---

### État à la fin du jour 1

| | |
|---|---|
| **Ça tourne** | front + back démarrent, Postgres local, 17 tests verts, lint + build propres |
| **Ça n'existe pas encore** | aucun modèle Prisma, aucune route métier, aucun écran |
| **Bloqueurs** | **D6** (frontières d'agrégat) bloque le schéma Prisma ; **D4** (accès PI Helios) reste l'inconnue n°1 |
| **À faire côté Hugo** | créer le tenant Auth0 + l'API, renseigner `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` |
