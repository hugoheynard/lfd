# Plan — la vitrine s'enregistre, et la boutique la lit

> **État : validé par Hugo le 2026-09-24 (« oui aux trois »), après contradiction par `vitruve` et révision. Lot 1 en construction.**
> Les objections et leur sort sont en fin de document. Conception de référence :
> [`boutique-rayon-layout.md`](boutique-rayon-layout.md), section « Composer
> une page ». L'éditeur existe en état local (`40b6bd33e`). Ce plan le rend
> persistant, **emplacements ET contenus d'un coup**, avec **un nombre de
> rangées par rayon** (Hugo, 2026-09-24).
>
> Chaque affirmation sur l'existant a été vérifiée le 2026-09-24 ; le chemin
> est cité à côté.

## Ce qui existe

| Fait                                                                                                                                                                                                                                                                                             | Où                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Un contexte de config b2b avec admin + route publique : `domain/ports`, `infrastructure/prisma-*`, `application/`, deux contrôleurs, `@AdminSurface("b2b_settings")` côté admin, `@Public()` + `@Throttle` côté public                                                                           | `apps/lfd-api/src/b2b/pickup-addresses/`                                                                                                                                 |
| Les permissions staff : un enum Postgres, le contrat (`staffResourceSchema`, `ROLE_GRANTS`) et **la table `staff_role_definitions`, qui est la SOURCE au runtime** — `ROLE_GRANTS` n'en est que le miroir. Une valeur d'enum ne s'emploie pas dans la transaction qui l'ajoute : deux migrations | `packages/contracts/src/staff-access.ts` ; modèles : `20260923200000_la_mediatheque_a_son_droit/`, `20260923200100_le_role_communication/` (UPDATE idempotent, l. 40-48) |
| 🔴 Les e2e réécrivent les rôles depuis `ROLE_GRANTS` à chaque `reset()` (`legacyRoleSeeds()`, `packages/contracts/src/staff-role.ts:148`) : **ils passent au vert sur un droit que la production n'aurait pas**                                                                                  | `apps/lfd-api/test/e2e-harness.ts:445-458`                                                                                                                               |
| La route de l'éditeur est une ENFANT de `b2b`, dont le parent porte `permissionGuard('b2b_settings:read')` ; la navigation lit `canSeeSettings`                                                                                                                                                  | `apps/lfd-backoffice-frontend/src/app/b2b/b2b.routes.ts:34-62`, `app.ts:233`                                                                                             |
| Le rayon d'un article est le `categoryId` du référentiel, lu par b2b à travers le port `CatalogReader`                                                                                                                                                                                           | `b2b/catalog/application/shop-catalogue-view.ts`, `b2b/catalog/domain/ports/catalog.reader.ts`                                                                           |
| `LocalizedText` n'existe que dans le PIM                                                                                                                                                                                                                                                         | `pim/catalogue/shared/domain/value-objects/localized-text.ts`                                                                                                            |
| La médiathèque ne connaît qu'**un** porteur : `MediaCarriers` est lié à `PrismaMediaCarriers` du PIM par `useExisting` ; `Carrier.kind` vaut `"product" \| "category"`                                                                                                                           | `media/channels/carriers/media-carriers.ts`, `appBootstrap/media-carriers.module.ts`                                                                                     |
| Aucun verrou optimiste n'existe côté b2b                                                                                                                                                                                                                                                         | —                                                                                                                                                                        |
| `lint:dated-decisions` ne couvre que les matériaux de prix                                                                                                                                                                                                                                       | `dev-toolbox/gates/dated-decisions.mjs`                                                                                                                                  |

## Décisions

### D1 — Un contexte `b2b/storefront`

À côté de `b2b/content`, pas dedans : `content` porte des textes sans règle ;
une page de vitrine en a (collision, bornes, rayons). C'est donc un
**agrégat**, par la question de tri du §3.1 : « existe-t-il une règle qui peut
refuser cette écriture ? » — oui.

### D2 — L'agrégat est la vitrine entière, et son verrou est global — assumé

Un objet partagé paraît sur N rayons à la même position ; la collision se
vérifie sur chacun. Deux agrégats « page » ne peuvent pas garder cet
invariant ensemble : **l'agrégat est la vitrine entière** (pages, objets,
gabarits), chargée et enregistrée d'un bloc. `Storefront.compose()` refuse
chevauchement et débordement sur chaque rayon de chaque objet.

**Le verrou est global** : deux personnes qui éditent deux rayons différents
se refusent l'une l'autre. **Assumé** : l'équipe qui compose la vitrine tient
en une ou deux personnes, et un verrou par rayon demanderait qu'un PUT porte
la révision de chaque rayon qu'un objet partagé touche — une complexité payée
tous les jours pour un conflit rare. Si l'usage le contredit, la révision
passe par rayon **avant** que l'éditeur soit ouvert à plus de deux personnes.

### D3 — Le modèle (schéma `public`, un fichier `storefront` à créer sous le dossier `public` du schéma Prisma)

```
storefront              id = 'main' (PK), revision int, updated_at, updated_by_staff_id
storefront_page         shelf_key (PK), rows smallint
storefront_object       id (ULID), shape, col, row, apply_on_mobile,
                        media_fit, media_side, multiple, nav, autoplay,
                        interval_s, first_s, sample_count, archived_at
storefront_object_shelf object_id, shelf_key                 (PK composée)
storefront_content      id, object_id, position, kind,
                        product_sku,                                  -- product
                        badge, title, lede (jsonb), image_url, image_alt (jsonb),
                        link_shelf_key                                -- info
storefront_template     id, name, name_key (UNIQUE : nom normalisé casse+accents),
                        description, + les réglages d'objet (sans position ni rayons)
```

- `shelf_key` : l'identifiant de catégorie du référentiel, ou `all`. Chaîne
  opaque, **sans clé étrangère** vers le PIM (§1).
- Les réglages du défilement sont **toujours** stockés, `multiple = false` les
  rend inactifs : c'est ce que fait l'éditeur (« conservés mais inactifs »).
- **CHECK écrits en toutes lettres**, jamais par `<>` ni `NOT (…)` sur une
  colonne nullable :
  - `rows BETWEEN 1 AND 12`, `col BETWEEN 1 AND 5`, `row >= 1`,
    `interval_s BETWEEN 3 AND 15`, `first_s BETWEEN 3 AND 30`,
    `sample_count BETWEEN 2 AND 6` ;
  - `(kind = 'product') = (product_sku IS NOT NULL)` et
    `(kind = 'info') = (title IS NOT NULL)` ;
  - `jsonb_typeof(title) = 'object'` quand non nul, idem `lede`, `image_alt`.
    La collision reste une règle de l'agrégat : la base ne sait pas dire « deux
    rectangles ne se recouvrent pas sur un même rayon ».
- `updated_by_staff_id` est l'identifiant **interne** du staff, jamais un `sub`
  (`lint:auth0-id-readers`).
- Les modèles sont rangés sous `public/` et ne sont lus que par `b2b`
  (`lint:prisma-schema-layout`, `lint:prisma-model-ownership`).

### D4 — Un contenu produit ne porte QUE le SKU

La boutique résout le SKU dans le catalogue qu'elle a déjà ; recopier le prix
le ferait dériver. Un SKU que le catalogue ne sert plus **n'est pas rendu** :
sa case retombe au reste du rayon. Un SKU peut paraître sur n'importe quel
rayon (Hugo, 2026-09-24).

**L'éditeur le dit** : il lit le catalogue d'administration et marque
« article plus en vente » tout contenu dont le SKU n'est plus servi. Même
chose pour une page dont le `shelf_key` n'est plus une famille du référentiel :
elle n'est plus servie, et l'éditeur la liste en « rayon disparu » à vider.

### D5 — Le texte localisé

`StorefrontText` dans le domaine du contexte : français obligatoire, anglais et
italien facultatifs, bornes de longueur. Pas d'import du `LocalizedText` du PIM.

### D6 — Enregistrer : un PUT de la vitrine entière, sa révision tenue EN BASE

L'éditeur charge `{ revision, pages, objects, templates }` et renvoie le tout.
Le verrou est **un seul ordre SQL**, dans la transaction du `save` :

```sql
INSERT INTO storefront (id, revision, updated_at, updated_by_staff_id)
VALUES ('main', 1, $now, $staff)
ON CONFLICT (id) DO UPDATE
  SET revision = storefront.revision + 1, updated_at = $now, updated_by_staff_id = $staff
  WHERE storefront.revision = $expected
```

Zéro ligne touchée → `StorefrontChangedError` (409). Comparer dans le handler
laisserait deux PUT lire la même révision et passer tous les deux.

- **Pas de ligne semée** : une vitrine absente se lit comme `{ revision: 0 }`,
  vide ; le premier PUT l'insère. `ctx.reset()` qui tronque tout ne casse donc
  rien.
- **Un objet absent du payload est ARCHIVÉ**, pas supprimé. Ses rayons et ses
  contenus sont des parties de sa valeur : ils sont remplacés (DELETE puis
  INSERT des lignes filles), ce qui n'est pas la suppression d'un agrégat.
- Le message du 409 : « La vitrine a été modifiée à HH:MM pendant que vous
  travailliez — rechargez pour reprendre la dernière version. » Pas de nom :
  il demanderait de résoudre un staff, pour un conflit rare.
- **Un fait est publié** à chaque enregistrement (`StorefrontSavedEvent` :
  révision, objets ajoutés / déplacés / archivés, rayons touchés), suivi par
  `lint:events-tracked` / `lint:journal-tracked`. Enregistrer publie tout de
  suite : c'est la seule trace de qui a vidé un rayon.

### D7 — La permission `storefront`, et une route HORS de l'espace b2b

Ressource `storefront` (read / write) accordée à `admin` et `communication`.

- **Deux migrations** : `ALTER TYPE "StaffResource" ADD VALUE IF NOT EXISTS
'storefront'` seule, puis une seconde qui crée les tables et **met à jour
  `staff_role_definitions`** pour `admin` et `communication`, par un UPDATE
  idempotent sur le modèle de `20260923200100_le_role_communication`.
- 🔴 **Un test qui lit les rôles tels que la migration les a laissés**, avant
  tout `reset()` : c'est le seul qui voit une migration oubliée, puisque les
  e2e réécrivent les rôles depuis le code.
- **La route sort de l'espace b2b** : `/vitrine`, gardée par `storefront:read`,
  avec son entrée de navigation affichée pour qui a `storefront:read`. Changer
  la garde du parent `b2b` ouvrirait tous les onglets de l'espace à
  `communication`. L'entrée « Vitrine » reste aussi dans Contenu pour qui voit
  déjà l'espace. L'ancienne route `/b2b/contenu/vitrine` redirige.
- L'admin porte `@AdminSurface("storefront")`.

### D8 — La lecture publique, et UN paquet de composition

`GET /shop/storefront/:shelfKey` (`@Public()`, `@Throttle`) rend `{ rows,
objects }`, objets archivés exclus, contenus dans l'ordre. La passerelle
l'expose comme les autres routes `/shop/*` — à vérifier au lot 1.

**La composition est un paquet `@lfd/storefront-layout`**, TypeScript pur
sans dépendance (ni zod, ni Angular) : table des formes, collision, cases
libres en ordre de lecture sans doublon, pile mobile, côté effectif en pile,
séquence du défilement. L'éditeur y déménage ses fonctions pures (lot 3), la
boutique l'emploie (lot 4), le serveur aussi pour sa règle de collision. Une
seule table des formes : deux implémentations divergeraient à la première
forme ajoutée. Sans zod, il ne pèse rien dans le budget de la boutique.

La simulation remplacée au lot 4 : `mock-shelf-feature.ts` (la tuile Noël et
la bande Pâques). La carte Pâques de l'accueil (`mock-event.ts`) reste hors
lot.

### D9 — La vitrine, troisième porteur de la médiathèque — la matrice ne bouge pas

- **L'adaptateur vit dans `appBootstrap/`** et lit la vitrine par un port de
  lecture publié par `b2b/storefront`. La ligne `b2b` de la matrice
  (`dev-toolbox/gates/context-boundaries.mjs:129`) reste sans `media`.
- **`MediaCarriers` devient composite**, dans `appBootstrap/` : il **somme**
  `usesOf` et **concatène** `carriersOf`. 🔴 **Si un porteur échoue, le
  composite échoue** : un porteur muet doit ARRÊTER la suppression
  (`media-carriers.ts:27-29`). Éprouvé en e2e.
- Il sert aussi le ramassage des orphelins (`media/application/sweep-orphan-media.ts`) :
  un porteur en panne y arrête le balayage, sans rien supprimer.
- `Carrier.kind` gagne `"storefront"`, et l'écran de la médiathèque renvoie
  vers `/vitrine`.

### D10 — Le rendu côté boutique : placement pur, registre par contenu (décidé le 2026-09-24)

Deux niveaux, séparés : **où** va chaque chose (des fonctions pures), **quoi**
y afficher (un registre). La forme n'entre pas dans le registre.

**1. Le placement ne rend aucun composant.** `@lfd/storefront-layout` reçoit
la page du rayon et le catalogue, et rend des **cases résolues** :

```ts
type Cell = {
  desk: { col: number; row: number; cols: number; rows: number };
  mobile: { order: number; cols: number; rows: number };
  slot: { contents: readonly Content[]; carousel: CarouselSettings } | { fill: string }; // case libre : un SKU du reste du rayon
};
```

La grille pose chaque case par variables CSS — `grid-column: var(--col) /
span var(--cols)` au bureau, `order` et spans mobiles sous la media query.
**Les deux placements sont dans le même DOM, et le CSS choisit** : le rendu
serveur ne connaît pas la largeur. Aucun `if (mobile)` en TypeScript.

**2. Le rendu passe par un registre indexé par TYPE DE CONTENU.**

```ts
export const STOREFRONT_RENDERERS = new InjectionToken<
  Readonly<Record<ContentKind, Type<StorefrontRenderer>>>
>("STOREFRONT_RENDERERS");
// { product: ProductTile, info: InfoCard }
```

La case appelle le composant par `NgComponentOutlet`, avec des entrées
communes : `content`, `shape`, `mediaFit`, `mediaSide`. Ajouter un type de
contenu (vidéo, recette, compte à rebours) = une ligne au registre et un
composant ; la grille ne change pas (OCP, CLAUDE.md §2).

**La forme n'est PAS une clé du registre** : 7 formes × 2 contenus feraient
14 composants presque identiques. Chaque composant reçoit sa forme en classe
d'hôte et se met en page par **container queries** — d'après la place réelle
de sa case, pas d'après l'écran. `ProductTile` en carte 1×1 est la vignette
d'aujourd'hui ; en tuile 2×1, c'est le best-seller ; en hero, le même en grand.

**3. Le défilement est un enveloppeur, écrit une fois.** `StorefrontSlot` :
un seul contenu → il rend le composant du registre ; plusieurs → un à la fois,
points ou flèches, minuterie, arrêt au survol, au focus et au toucher, jamais
sous `prefers-reduced-motion`. Les composants de rendu n'en savent rien.

```
ShelfGrid ── cells() du paquet
  ├─ StorefrontSlot           (une par case composée)
  │    └─ NgComponentOutlet ← STOREFRONT_RENDERERS[content.kind]
  │         ├─ ProductTile    (forme → container queries)
  │         └─ InfoCard       (forme + cadrage + côté de l'image)
  └─ ProductTile              (cases « fill » : le reste du rayon, sans registre)
```

**L'aperçu de l'éditeur emploie le même paquet** : ce qu'on compose au
back-office et ce que voit le client sortent de la même table des formes.

## Lots

| Lot                 | Contenu                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — serveur**     | deux migrations (enum seule ; puis tables + droits), paquet `@lfd/storefront-layout`, agrégat et value objects, handlers, deux contrôleurs, fait publié, contrat Zod dans `@lfd/contracts`, e2e (collision multi-rayons, 409 concurrent réel, bornes, CHECK, archivage, lecture publique), test des rôles migrés |
| **2 — médiathèque** | composite + `kind: "storefront"` + renvoi d'écran ; e2e : une image posée en vitrine ne se supprime pas                                                                                                                                                                                                          |
| **3 — éditeur**     | route `/vitrine` et sa garde, fonctions pures déménagées dans le paquet, charger / enregistrer, 409, gabarits persistés, association des contenus (choisir un article, écrire une info, choisir une image dans la médiathèque), R par rayon, rayons réels, marques « article plus en vente » / « rayon disparu » |
| **4 — boutique**    | lecture publique, composition, retrait de `mock-shelf-feature.ts`                                                                                                                                                                                                                                                |

Les lots 1 et 2 partent ensemble : sans le 2, le 1 ouvre un trou.

## Hors lot

- **Fenêtres de dates** (une opération qui s'allume et s'éteint seule) et
  **audience** (pro / particulier) : décidées dans le document de
  conception, pas encore construites. La table `storefront_object` est prête
  à recevoir `valid_from` / `valid_until` sans migration de données.
- La **carte Pâques de l'accueil** (`mock-event.ts`) reste simulée.
- Un **brouillon** distinct de la version publiée : ce lot publie à
  l'enregistrement.

## Retour arrière

- Les tables sont neuves et ne portent rien d'autre : les supprimer rend
  l'état d'avant.
- Les droits : un UPDATE qui retire `storefront` des deux rôles.
- 🔴 **La valeur d'enum `storefront` ne se retire pas** (Postgres ne sait pas
  ôter une valeur d'enum). Elle reste, inutilisée et sans effet. C'est
  l'unique partie non réversible du lot, et elle est inoffensive.

## Contradiction du 2026-09-24 (`vitruve`)

| Objection                                                  | Sort                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| B1 — `staff_role_definitions` oubliée, masquée par les e2e | corrigé : D7 (deux migrations, UPDATE idempotent, test des rôles migrés) |
| B2 — la garde du parent `b2b` refuse `communication`       | corrigé : D7 (route `/vitrine` hors de l'espace)                         |
| B3 — ligne `storefront` sans origine, 409 sans mécanisme   | corrigé : D6 (upsert conditionnel, pas de semis)                         |
| S1 — verrou global                                         | **assumé** : D2                                                          |
| S2 — suppressions physiques, aucun fait                    | corrigé : D6 (archivage, parties remplacées, `StorefrontSavedEvent`)     |
| S3 — frontière, panne d'un porteur, ramassage              | corrigé : D9 (adaptateur en `appBootstrap`, composite qui échoue)        |
| S4 — SKU sans écho, rayon orphelin                         | corrigé : D4 (marques dans l'éditeur)                                    |
| S5 — gabarits absents                                      | corrigé : D3 (`storefront_template`)                                     |
| S6 — enum irréversible                                     | dit : « Retour arrière »                                                 |
| S7 — partage non décidé                                    | corrigé : D8 (`@lfd/storefront-layout`)                                  |
| S8 — CHECK non écrits, `sample_count`                      | corrigé : D3                                                             |
| Mineurs (`IF NOT EXISTS`, portes Prisma, simulations)      | corrigés                                                                 |

## Tranché par Hugo (2026-09-24)

1. `communication` écrit la vitrine (D7), sur une route à part — **oui**.
2. Enregistrer = publier tout de suite, le fait journalisé comme seule trace — **oui**.
3. Le verrou global (D2) : une ou deux personnes composent la vitrine — **oui**.
