# 04 — Composition & canaux (la règle des trois natures)

> Comment on **étend** un objet sans le diluer : quelles tables on a le droit de créer, qui les
> possède, et dans quel sens pointent les clés étrangères.

## Le principe : trois natures de table, jamais mélangées

| Nature | Exemple | Propriétaire | Clé | Sens de la FK |
|---|---|---|---|---|
| **🧩 Socle** | `product`, `product_variant`, `category`, `collection` | domaine | `id` | — |
| **🧱 Couche canonique** | `nutrition_declaration`, `product_editorial` | domaine | **PK = FK** vers le socle | couche → socle |
| **📡 Contexte canal** | `shopify_variant_binding`, `helios_variant_binding` | **adaptateur** | **PK = FK** vers le socle | canal → socle |

La distinction qui compte : une **couche canonique** décrit ce que le produit **est** ; un
**contexte canal** décrit **ce qu'un système tiers en sait**.

> **Le sens de la FK ne s'inverse jamais.** Le socle n'a aucune colonne pointant vers une couche ni
> vers un canal. C'est ce qui garantit qu'on peut supprimer l'adaptateur Shopify sans toucher au
> cœur.

## Le motif : *shared primary key*

Toute table satellite a pour clé primaire **la clé étrangère elle-même** :

```prisma
model NutritionDeclaration {
  variantId String  @id @map("variant_id")
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  // …
}
```

Trois bénéfices, gratuits :

- **unicité structurelle** — il est *impossible* d'avoir deux lignes pour la même déclinaison ;
- **zéro colonne vide** — la ligne n'existe que si la donnée existe. C'est l'objectif « pas de
  valeurs inexistantes » : il s'atteint par **absence de ligne**, pas par colonnes `NULL` ;
- **jointure minimale** — index unique déjà présent, pas de surrogate à porter.

### Quand découper une couche, et quand ne pas le faire

Le critère n'est **pas** « ça fait beaucoup de colonnes ».

| Découper | Ne pas découper |
|---|---|
| Rythme de vie différent (l'éditorial change chaque saison, le réglementaire à la reformulation) | Deux champs cousins du même concern (`poids` et `dimensions`) |
| Le bloc est **absent en entier** pour beaucoup de produits | Le champ est parfois `NULL` mais le bloc est toujours là |
| Propriétaire fonctionnel différent (marketing vs. labo) | « Ça ferait plus propre » |

## Contexte canal — ce que ces tables contiennent

Deux choses distinctes, à **ne pas mélanger dans la même table** :

### a. Le binding + l'état de synchro (mécanique, écrit par l'adaptateur)

`shopify_variant_binding` — PK/FK `variant_id`
: `shopify_product_gid`, `shopify_variant_gid`, `last_pushed_hash`, `last_pushed_at`,
  `sync_status`, `last_error`

`helios_variant_binding` — PK/FK `variant_id`
: `plu`, `barcode`, `tax_code`, `last_pushed_at` — **forme provisoire, bloquée par D4**
  (API contractuelle vs. export fichier)

`helios_category_binding` — PK/FK `category_id`
: `pos_family_code` — *c'est ici, et nulle part ailleurs, que vit le vocabulaire PI Helios*

### b. Les overrides éditoriaux par canal (métier, saisis à la main)

`shopify_product_override` — PK/FK `product_id`
: `title`, `handle`, `tags[]`, `seo_title`, `seo_description`

`helios_variant_override` — PK/FK `variant_id`
: `pos_label` (libellé court contraint par la largeur de l'écran caisse)

Le premier bloc est **dérivable et jetable** (on peut le vider et re-pousser). Le second est une
**vraie saisie utilisateur** qu'on ne doit jamais écraser lors d'une resynchro. Les séparer rend
cette différence structurelle au lieu d'être une convention qu'on oublie.

## Deux règles qui évitent les dérives classiques

### R4 — On binde sur la **déclinaison**, jamais sur le produit

Le PLU d'une caisse comme le *variant* Shopify désignent l'**unité réellement vendue**. Un `product`
n'est pas vendable. Binder au niveau produit obligerait à un éclatement artificiel côté adaptateur,
et rendrait impossible un produit dont seules certaines déclinaisons sont publiées.

Le binding pointe sur l'`id` — **jamais sur le `sku`**, qui est modifiable.

### R5 — Les tables canal ne sont **pas** event-sourcées

Un `shopify_variant_gid` n'est pas un fait métier, c'est de l'état de synchro : il se **re-dérive**,
il ne se **rejoue** pas. Les faire entrer dans le futur event store polluerait l'historique du
catalogue avec du bruit d'intégration.

Corollaire : ces tables sont **reconstructibles** par un re-push complet. Elles peuvent être perdues
sans perte d'information métier.

## Frontières de modules (ADR-01, monolithe modulaire)

Une FK physique entre deux modules est acceptable (intégrité référentielle en base). Ce qui est
**interdit**, c'est la **lecture des tables d'un autre module**.

| ✅ | ❌ |
|---|---|
| L'adaptateur Shopify lit le catalogue par son **port de lecture** (`CatalogueReader`) | `SELECT … FROM product JOIN shopify_variant_binding` depuis le module catalogue |
| Le module `pricing` référence un `variant_id` comme **valeur** | Le module `pricing` joint sur `product_variant` pour lire le `name` |
| Un adaptateur possède ses propres tables `*_binding` | Le socle porte une colonne `shopify_id` |

Le test : **si on supprimait le module Shopify, le catalogue compilerait-il encore ?** La réponse
doit être oui, sans modification.

## Rappel : la règle de promotion de `attributes`

`attributes` (jsonb) est une soupape, pas un magasin. Dès qu'un attribut est **lu par un adaptateur
canal** ou utilisé par **≥ 2 familles de produits**, il devient une **colonne** de la couche
appropriée. Sans cette règle, le jsonb redevient en six mois le fourre-tout que tout ce découpage
cherche à éviter.
