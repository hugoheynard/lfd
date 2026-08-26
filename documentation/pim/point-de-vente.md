# Le point de vente — l'entité qui manque

> **Note doc-first, 2026-08-26. Aucun code écrit.** Elle pose le modèle définitif
> de « d'où l'on vend », corrige deux contournements livrés le jour même, et
> découpe l'exécution. Suite de
> [`c0d-matrice-de-canaux.md`](./c0d-matrice-de-canaux.md), qu'elle termine.

## 1. Deux symptômes, une cause

C0-d a rendu la matrice de canaux pilotée par la donnée : un ensemble de paires
`(lieu, contexte)` en table, plus aucune liste de canaux écrite en dur. Ce qui
reste accroche à deux endroits, et les deux viennent du même manque.

**`category_channel.location_id` peut être NULL, et ce NULL veut dire « le
B2B ».** Un `NULL` qui porte du sens est toujours le signe d'une ligne absente
quelque part. Ici, la ligne absente est la plateforme professionnelle.

**`sales_context.per_location` n'existe que pour distinguer ce cas.** Il a été
posé le matin même, et il faut le dire franchement : c'est un contournement, pas
un modèle. Il fait dire au CONTEXTE (« ai-je besoin d'un lieu ? ») ce qui est en
réalité une propriété du POINT DE VENTE (« quels contextes est-ce que j'offre ? »).

La cause est unique : **la plateforme B2B est un point de vente, et le modèle ne
le dit pas.** Le référentiel connaît `emplacement` pour les lieux physiques, et
rien pour elle.

### Pourquoi cette option avait été écartée — et pourquoi c'était une erreur

La note C0-d a examiné « la plateforme devient un pseudo-emplacement » et l'a
jugée rédhibitoire :

> Cette ligne de `pim.emplacement` porterait `name`, `click_collect`, `eat_in`,
> `base_url` et une grille de tables, tous absurdes pour une plateforme.

Le raisonnement était juste **sur ce qu'il examinait** : fourrer la plateforme
dans la table des emplacements, telle qu'elle est. Il concluait trop vite qu'il
fallait donc les séparer. La bonne sortie n'était ni l'un ni l'autre : créer
l'entité dont `emplacement` est un CAS.

## 2. Le modèle

```
point_de_vente(id, genre: 'boutique' | 'plateforme', libellé)
   └─ genre boutique : url de base, grille de tables

point_de_vente_contexte(point_de_vente_id, contexte)   ← ce qu'il OFFRE
category_channel(category_id, point_de_vente_id, contexte)  ← ce qu'on y VEND
product_channel(product_id,  point_de_vente_id, contexte)   ← la dérogation
```

Trois niveaux, trois questions distinctes, et c'est le point : elles étaient
mélangées.

| Question                                | Répond                    |
| --------------------------------------- | ------------------------- |
| Quels contextes de vente existent ?     | `sales_context`           |
| Qu'est-ce que CE point de vente offre ? | `point_de_vente_contexte` |
| Qu'est-ce que cette famille y vend ?    | `category_channel`        |

### Ce que ça supprime

| Disparaît                       | Pourquoi                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `location_id` **nullable**      | la plateforme EST un point de vente ; plus de `NULL` porteur de sens           |
| `sales_context.per_location`    | la question se dissout : un contexte est offert par ceux qui l'offrent         |
| `click_collect` / `sur_place`   | remplacés par `point_de_vente_contexte` — le prérequis, cette fois **branché** |
| `NULLS NOT DISTINCT`            | plus de colonne nullable dans la clé d'unicité de la matrice                   |
| la branche « a-t-il un lieu ? » | il en a toujours un                                                            |

`per_location` a vécu une journée. C'est le prix du définitif, et il vaut mieux
le payer maintenant qu'une fois qu'un quatrième contexte s'appuiera dessus.

### Ce que ça règle sans rien ajouter : les tables

`eat_in` faisait **deux métiers** : « ce lieu sert en salle » et « ce lieu a une
grille de tables à QR ». D'où l'invariant actuel — fermer la salle vide les
tables — et d'où la question restée ouverte : si `eat_in` devient un contexte
offert, l'agrégat doit-il connaître le nom d'un contexte pour savoir s'il a des
tables ?

Le modèle la dissout. **Une grille de tables appartient à un point de vente de
genre `boutique`** : c'est de l'équipement, pas un contexte. Deux boulangeries
peuvent toutes deux offrir « sur place » et une seule être équipée de QR — ce
que le modèle actuel ne sait pas dire.

Ce que devient l'invariant, et il est plus juste qu'avant : **une plateforme n'a
pas de tables** (le genre l'interdit), et retirer l'offre « sur place » d'une
boutique **n'efface plus ses QR** — la matrice a déjà cessé d'y vendre, donc un
QR mène à une commande vide plutôt qu'à un mensonge. Détruire du papier collé
sur un meuble pour une case décochée était disproportionné.

### La forme en base

Une table, pas deux, avec un genre et des colonnes propres à la boutique :

```prisma
model PointOfSale {
  id    String          @id
  kind  PointOfSaleKind            // shop | platform
  label String

  /// Boutique seulement — `NULL` pour une plateforme, et la contrainte le dit.
  baseUrl String?
  tables  PointOfSaleTable[]

  contexts PointOfSaleContext[]
  channels CategoryChannel[]
}
```

Deux tables (`point_of_sale` + `shop`) seraient plus pures, et ne paient pas :
la seule colonne réellement propre à la boutique est `base_url`, les tables
vivent déjà dans leur propre table. Une contrainte `CHECK` en SQL dit la règle —
`kind = 'platform'` implique `base_url IS NULL` et zéro table.

## 3. Ce qui NE change pas

- **Les contextes** — le registre, son écran, ses invariants (clé immuable,
  racine ineffaçable) restent tels quels, moins `per_location`.
- **La matrice** — même forme, ensemble de paires ; seule la colonne de lieu
  cesse d'être nullable.
- **Les taux de TVA** — ils joignent par contexte, jamais par lieu.
- **Shopify** — `shopify_projected` et `handle_suffix` sont des propriétés du
  contexte, pas du point de vente.

## 4. Le découpage

Discipline `étendre / basculer / resserrer`, comme toujours
(`documentation/ops/pipelines.md`).

| Tranche           | Migration                                                                                                                                                           | Code                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **p-0 étendre**   | `point_of_sale` + reprise des emplacements (genre `shop`) **et** de la plateforme (une ligne) ; `point_of_sale_context` rempli depuis `click_collect` / `sur_place` | rien ne lit encore ; l'écran Emplacements devient Points de vente, en lecture                                        |
| **p-1 étendre**   | colonnes `point_of_sale_id` ajoutées à `category_channel` / `product_channel`, remplies                                                                             | écrites à côté de `location_id`                                                                                      |
| **p-2 basculer**  | —                                                                                                                                                                   | tout lit `point_of_sale_id` ; `per_location` et la branche tombent ; l'écran des points de vente coche des contextes |
| **p-3 resserrer** | `DROP` de `location_id`, `per_location`, `click_collect`, `sur_place` ; `NOT NULL` sur le point de vente ; `CHECK` sur le genre                                     | suppression du double-écriture                                                                                       |

**p-0 a une valeur propre** : il rend la plateforme B2B **visible** dans
l'administration, à côté des boutiques. Aujourd'hui elle n'existe nulle part à
l'écran — c'est un `NULL` dans une colonne.

### La racine, encore

Le point de vente `plateforme` hérite du contrat du contexte racine : **semé au
boot, ineffaçable, non renommable** (`ensureBootstrapPointOfSale`). Sans lui, la
matrice B2B n'a plus de cible et la boutique professionnelle se vide sans qu'une
erreur soit levée — exactement la panne silencieuse qui a justifié la garde du
contexte `b2b`.

## 5. L'ordre par rapport à C0-d

**d-3 reste utile telle quelle et part avant.** Elle supprime
`channel_preset`, `channel_override`, `channel_key` et `category_location_ref`,
morts quel que soit le modèle final, et traduit `emporter` → `takeaway`,
`surPlace` → `eatIn`. Elle ne touche **pas** `click_collect` / `sur_place`, que
p-3 absorbera.

Les deux chantiers ne se croisent donc qu'à un endroit : `per_location`, posé en
d-0 et retiré en p-3. Il vit entre les deux, et c'est assumé.

## 6. Ce que cette note ne tranche pas

- **Le nom en base.** `point_of_sale` est le terme du lexique ; `emplacement`
  disparaît comme table. Reste à décider si l'écran dit « Points de vente » ou
  garde « Emplacements » avec la plateforme dedans — un mot d'interface, pas un
  modèle.
- **Ce que devient l'écran des tables** quand une boutique retire l'offre « sur
  place » : on garde les QR (§ 2), mais faut-il le DIRE à l'écran ? Probablement
  oui, et c'est une phrase, pas une règle.
- **S'il y aura jamais un second point de vente de genre `plateforme`.** Le
  modèle l'accepte sans rien changer ; rien ne dit qu'il arrivera.
