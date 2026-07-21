# Chevallot PIM — Journal de bord

> Tenu au fil de l'eau. Chaque ajout a **deux lectures** : **PM** (ce que ça change pour le produit /
> le métier, sans jargon) et **Tech** (ce qui a été fait, et pourquoi comme ça).
>
> Ce journal raconte le **chemin**. Les décisions structurantes vivent dans [`adr.md`](./adr.md),
> les restes à faire dans [`todo.md`](./todo.md), le modèle dans [`data-model/`](./data-model/).

**Tenue** : une section `## AAAA-MM-JJ` par jour, la plus récente **en haut**. Un `###` par ajout.
On n'y met que ce qui mérite d'être retrouvé dans trois mois.

---

## 2026-07-21 — Jour 2

### Cadrage global : anti-drift, pricing, et pourquoi on construit

**PM** — Prise de recul sur l'ensemble. Trois clarifications qui changent la façon de piloter le
projet. **La bataille « qui détient le catalogue » n'a pas lieu d'être** : ce qui compte n'est pas le
catalogue mais chaque champ, et une seule règle — un champ, un seul auteur. **Les prix négociés ne
sont pas des exceptions bricolées** mais des règles qu'on possède et qu'on calcule. Et surtout : ce
qu'on construit n'est **pas un PIM**, c'est la **colonne vertébrale** qui fait tenir ensemble la
caisse, le web et le labo — le catalogue n'en est que la première vertèbre.

**Tech** — Quatre cadres posés, aucun code.

*Anti-drift* — l'unité de décision est le **champ**, pas le catalogue : une matrice
champ × système avec **un seul `W` par ligne**. Quatre familles à régimes opposés (catalogue ⬇️ ·
prix ⬇️ · transactions ⬆️ · production ⬆️) et une règle : **le flux ne boucle jamais**. Trois
régimes possibles par champ, dont le plus réaliste est le troisième, souvent oublié : **surveillé**
— le PIM connaît l'état voulu, **ne corrige pas**, mais **signale l'écart** (relecture + écran de
dérives). Écraser silencieusement la correction faite en caisse à 7h est le meilleur moyen de faire
débrancher l'outil.

*Promotions* — elles ne sont **pas portables** : ce sont des programmes, pas des données. Shopify
applique au panier, une caisse au ticket. Cible retenue : le PIM possède l'**intention commerciale**
(`Campagne`), chaque adaptateur la **compile**, et on supporte explicitement l'**intersection** — pas
l'union. Une campagne qu'un canal ne sait pas exprimer est **refusée à la saisie**, jamais dégradée.

*Pricing* — correction d'un modèle mental : il n'y a **pas de prix canonique**. Le prix est une
fonction `f(déclinaison, canal, client, date, quantité)`. Le tarif B2B n'est **pas** un override du
canal — **canal ≠ client** (deux axes : par où / à qui). Trois objets : `PriceList`, `PriceRule`, et
`Agreement` — ce dernier appartenant au **contexte commercial, pas au PIM** (sinon le PIM aspire le
CRM). La résolution **calcule** et **trace** le chemin au lieu d'empiler des écarts indébogables.
Corollaire pratique : les canaux reçoivent un **nombre déjà résolu** — le moteur est unique, chez
nous.

*Construire vs acheter* → [ADR-15](./adr.md#adr-15--construire-un-pim-minimal-plutôt-quen-acheter-un).
Décision : construire, **minimal**. L'argument décisif n'est pas le coût mais l'**ajustement sur le
spécifique** (`kind`, capacité de production ≠ stock, GS1→INCO, déclinaison commune caisse/web) —
qu'aucun PIM générique ne porte autrement qu'en **configuration**, c'est-à-dire en renonçant au
bénéfice des types (ADR-10). Le socle fait six tables ; 80 % de l'effort est l'intégration, qu'aucun
achat ne dispense. Coût réel assumé et nommé : **le back-office**, pas le modèle — d'où la consigne
« garder le back-office laid ». Périmètre fermé (pas de moteur d'attributs, pas de workflows, pas de
DAM, pas de multi-tenant), **test permanent** écrit, et **conditions d'invalidation** posées :
la décision est **testable** par D4 et D1, pas une conviction.

### Revue adversariale du modèle de données — et son redressement

**PM** — Passe critique sur le modèle avant d'écrire la moindre table : on a cherché ses défauts au
lieu de le défendre. Trois choses importantes en sont sorties. **Un risque légal** a été éliminé : le
modèle affirmait « aucun allergène » par défaut sur un produit que personne n'avait vérifié.
**Une complexité coûteuse** a été reportée : l'historisation complète du catalogue, qu'on payait à
vie pour un bénéfice qu'on n'a pas encore. **Un flou** a été levé : trois documents décrivaient le
même produit différemment. Le modèle est maintenant plus simple, plus sûr, et prêt à être codé.

**Tech** — Douze défauts relevés, tous traités :

*Fond* — le modèle était **conçu table-first** puis étiqueté « event-sourced » : aucune commande,
aucun event nommé nulle part, alors que D6 (frontières d'agrégat) était déclaré bloquant. Nouveau
doc [`00-langage-et-comportement.md`](./data-model/00-langage-et-comportement.md) : glossaire
ubiquitaire (« un client achète une **déclinaison**, jamais un produit »), **4 agrégats** (`Product`
racine possédant déclinaisons + fiches réglementaires ; `Category` ; `Collection` ; `MediaAsset`),
la **liste exhaustive des commandes et des faits**, le cycle de vie `draft → published → archived`.
**D6 est clos**, le schéma Prisma est débloqué.

*ADR-11 rétrogradé* — sa justification (« zéro `created_at`/`updated_at` ») était esthétique **et
fausse** : une projection a de toute façon besoin de `last_event_version`/`projected_at`. Coût réel
(projecteurs, upcasting, hard-gate de replay, à vie) disproportionné pour un catalogue édité par
trois personnes. Précédent interne : sur SH3PHERD l'event store est arrivé en **couche 3 phase C**,
pas au jour 1. Conservé de façon **irréversible** : **R1** ids assignés par la commande (UUID v7
applicatif — le seul point vraiment irrattrapable, la caisse et Shopify pointent dessus), **R2** toute
mutation porte un nom métier, **R3** aucun `DELETE`. Colonnes système assumées, hors-domaine.

*Sécurité de la donnée réglementaire* — `PRODUCT ||--|| NUTRITION_INFO` (1:1 **obligatoire**) forçait
une ligne vide à la création, donc `allergens: []` = « aucun allergène » **sans vérification**. Passé
en **1:1 optionnelle**, PK = FK (plus d'`id` de substitution qui autorisait deux fiches), **rattachée
à la déclinaison** (c'est elle qui est mise sur le marché) et **sans fallback à la lecture** — la
duplication est écrite à la commande. Garde : pas de publication sans fiche.

*Cohérence* — `01-produit.md` re-spécifiait le socle **différemment** de `02` (`name` string vs
LocalizedText, `has_variants`, `barcode`…) : amputé, il ne couvre plus que l'éditorial. Nettoyages :
`has_variants` supprimé (dérivable, et sa « déclinaison implicite » remplacée par une déclinaison
**toujours matérialisée**), `is_bio` supprimé **×2** (trois sources de vérité pour un fait —
`certifications` fait foi), `sku` rendu **modifiable** et à espace de noms **global**, FK polymorphe
des médias remplacée par trois tables de liaison, `kind` explicitement marqué « pas un aiguillage »
(OCP), `Category` scindée en **taxonomie** (arbre) + **`Collection`** (n:n).

*Nouveau* — [ADR-13](./adr.md#adr-13--composition-par-tables-satellites-canaux-au-bord) et
[`04-composition-et-canaux.md`](./data-model/04-composition-et-canaux.md) : trois natures de table
(socle / couche canonique / contexte canal), motif **PK = FK**, bindings sur la **déclinaison** par
`id`, séparation binding mécanique ↔ overrides éditoriaux, **règle de promotion** de `attributes`.
Le `pos_family_code` PI Helios **sort de `Category`**. [ADR-14](./adr.md#adr-14--couche-logistique-descopée-de-la-v1) :
couche logistique et hiérarchie GDSN **descopées** — le code-barres reviendra par le binding caisse
quand D4 sera tranché.

### Correctif : le `.env` n'était pas chargé au démarrage

**PM** — Le backend refusait de démarrer en disant qu'il manquait la configuration de la base… alors
qu'elle était bien renseignée. Corrigé : l'application lit désormais son fichier de configuration au
démarrage.

**Tech** — Le `.env` n'était chargé que par la **CLI Prisma** (`prisma.config.ts` importe
`dotenv/config`) ; **rien ne le chargeait au runtime Nest** → `process.env.DATABASE_URL` vide → le
fail-fast se déclenchait (il faisait son travail, sur une cause que je n'avais pas câblée). Ajout de
**`@nestjs/config`** et de `ConfigModule.forRoot({ isGlobal: true })` **en tête** des imports
d'`AppModule`, pour que l'env soit peuplé avant l'instanciation des providers d'infra. Vérifié par un
boot **isolé sur le port 3101** (« Nest application successfully started », HTTP 200 sur `/`).

> Découverte au passage : le pool `pg` se connecte **paresseusement** — `$connect()` n'ouvre aucune
> session et ne prouve donc pas que la base est joignable. Le fail-fast ne couvre que la *config*.
> Ajouter un `SELECT 1` au boot est une **décision ouverte** (l'app refuserait alors de démarrer sans
> `pnpm dev:infra`).

### Une seule porte vers l'environnement — et un garde-fou qui la tient

**PM** — Les réglages (base, Auth0, port) ne se lisent plus n'importe où dans le code : ils passent par
un **point unique**, validé au démarrage. Et un contrôle automatique empêche de contourner la règle
plus tard — y compris par moi dans six mois.

**Tech** — `src/infra/config/AppConfig` : **seule** classe autorisée à lire `process.env`, valide au
boot (fail-fast) et expose des méthodes typées (`databaseUrl()`, `auth0Domain()`, `auth0Audience()`,
`port()`). `PrismaService`, `AuthConfig` et `main.ts` la consomment par injection — plus aucun accès
direct. **Deux filets** :
1. **ESLint** — couvre `process.env`, `process['env']`, la déstructuration, l'**alias**
   (`VariableDeclarator[init.name='process']`), `globalThis.process` et l'import `node:process`.
   Les 6 formes vérifiées une par une par fichiers sondes.
2. **Gate** `dev-toolbox/gates/no-direct-env.mjs` (`pnpm lint:no-direct-env`), **indépendant
   d'ESLint** : il détecte en plus les `// eslint-disable` visant la règle. Démonstration faite —
   ESLint seul se laisse bâillonner, le gate non.

Dérogations **explicites et justifiées** : la passerelle + son test, le harnais de test,
`prisma.config.ts` (CLI Prisma, hors runtime Nest) et `src/server.ts` (SSR Angular — le front n'a pas
encore de passerelle, dette notée au `todo.md`).

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
→ ADR-11. Reste à trancher : les **frontières d'agrégat** (D6).

> ⚠️ **Révisé le 2026-07-21** — décision rétrogradée en « event store *préparé, pas activé* » après
> la revue adversariale (voir l'entrée du jour 2). Les `created_at`/`updated_at` sont **conservés**
> en colonnes système hors-domaine.

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

### Durcissement du jeu de flags TypeScript

**PM** — Revue du filet de sécurité : il paraissait plus maigre que sur l'autre projet. Vérification
faite, l'essentiel était déjà là, mais deux vraies failles ont été comblées et le filet a été **resserré
au-delà** de la référence. Concrètement : moins de bugs qui passent en production.

**Tech** — Diff réel avec SH3PHERD : sur 11 flags « manquants », **6 étaient déjà actifs** (impliqués
par `strict`), 2 étaient des défauts TS, 1 avait été déplacé dans la couche backend — et **2 étaient de
vrais trous** : `noImplicitReturns` et `allowUnusedLabels: false`. Comblés, puis ajout de
**`exactOptionalPropertyTypes`** et **`noUncheckedSideEffectImports`** (absents de SH3), et épinglage
explicite des flags impliqués par `strict`. **`erasableSyntaxOnly` délibérément écarté** : il casserait
Nest (parameter properties + enums). Build, lint et 17 tests verts — le client Prisma généré passe la
barre sans concession. → [ADR-10](./adr.md#adr-10--backend-esm--flags-ts-stricts-partagés)

---

### État à la fin du jour 1

| | |
|---|---|
| **Ça tourne** | front + back démarrent, Postgres local, 17 tests verts, lint + build propres |
| **Ça n'existe pas encore** | aucun modèle Prisma, aucune route métier, aucun écran |
| **Bloqueurs** | **D6** (frontières d'agrégat) bloque le schéma Prisma ; **D4** (accès PI Helios) reste l'inconnue n°1 |
| **À faire côté Hugo** | créer le tenant Auth0 + l'API, renseigner `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` |
