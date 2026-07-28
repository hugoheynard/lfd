# Projection Shopify — emporter / sur place, TVA, boutiques

> Comment le catalogue **canonique** se projette sur Shopify quand un même article se vend
> **à emporter** (rayon public, click & collect) **et** **sur place** (commande à la table via QR),
> à des **TVA différentes**, dans **plusieurs boutiques**. Application directe du principe maison :
> _canonique au centre, adaptateur en projection_. Le PIM reste 1 produit / 1 SKU ; Shopify reçoit
> une projection éclatée.
>
> Statut : **design cible**. Le push actuel (`projectProduct`) est encore en 1 produit PIM → 1 produit
> Shopify ; ce doc décrit là où on va, et pourquoi.

---

## 1. Les quatre forces en présence

1. **La TVA dépend du mode.** Une catégorie porte deux régimes — `emporterTvaId` et `surPlaceTvaId`
   (cf. [`data-model/06`](./data-model/06-identifiants-et-sku.md) et le modèle `Category`). Le
   croissant est à 5,5 % à emporter, 10 % sur place.
2. **La disponibilité dépend de la boutique.** `SalesChannels` déclare, **par boutique**, si l'article
   se vend `emporter` et/ou `surPlace`. La boutique décide **qui sert quoi**, pas le taux.
3. **Le QR est de la navigation, pas un produit.** Le QR d'une table est un **lien vers une collection
   filtrée** — « le catalogue décliné en sur place, TVA 10, de cette boutique ». Il ne désigne jamais
   un produit ; le client navigue et commande dans cette vue.
4. **Le SKU doit rester partagé entre modes.** _Croissant emporter_ et _croissant sur place_ partagent
   le SKU `PATI-CROISSANT` — c'est ce qui réconcilie le **« total croissant »** dans les suivis.

Ces quatre forces se composent proprement **à condition de respecter les invariants Shopify ci-dessous**.

## 2. Les invariants Shopify (contraintes dures, non négociables)

| # | Invariant | Conséquence |
|---|---|---|
| **S1** | **Un produit Shopify = un seul traitement TVA.** | On ne peut pas faire varier le taux d'**un** produit selon le contexte (panier, QR, boutique). |
| **S2** | **La TVA se pose par `tax override` de collection.** | Le taux vit sur l'appartenance à une collection `tva-*` ; un produit doit être dans **exactement une** collection porteuse d'override. |
| **S3** | **Une collection / un filtre ne re-taxe jamais.** | « Une déclinaison du catalogue à 10 % » **n'est pas** les produits emporter re-taxés à la volée — c'est un **jeu de produits distinct**. |
| **S4** | **Le SKU n'est pas l'identité.** Shopify identifie par `id`/`handle`. | Les SKU **peuvent être dupliqués** → deux produits de modes différents portent le **même** SKU. |
| **S5** | **L'inventaire est par variante**, pas par SKU. | Deux produits au même SKU = **deux compteurs de stock** non partagés. |

## 3. Le modèle : la **fiche** = `produit × mode` → un produit Shopify

L'unité de projection n'est pas le produit PIM, c'est la **fiche** (déjà le vocabulaire de
`collections.ts`) :

```
produit PIM  ──(× mode)──►  fiche emporter  ──►  produit Shopify (tva-5-5, rayon public)
                            fiche sur place  ──►  produit Shopify (tva-10, salle / QR)
```

- Chaque **fiche = un produit Shopify** (handle propre, déjà généré).
- Les **déclinaisons** (tailles) de la fiche = les variantes Shopify (R4 tient : on binde la
  déclinaison, cf. [`data-model/04`](./data-model/04-composition-et-canaux.md#r4--on-binde-sur-la-déclinaison-jamais-sur-le-produit)).
- Le **mode** est le seul multiplicateur systématique. **La boutique n'en est pas un** (§5).

C'est S1/S3 rendus concrets : deux taux ⇒ deux produits.

## 4. La TVA : la Famille A porte le taux, **et rien d'autre**

Deux rôles de collection, **jamais confondus** (le piège de « on paramètre des collections de TVA ») :

| Collection | Rôle | `tax override` ? | Nb par produit |
|---|---|---|---|
| **`tva-*`** (Famille A) | **porte le taux** | ✅ oui | **exactement 1** (S2) |
| **rayon** (Famille B) / **`sur-place-boutique-X`** (Famille C) | **navigation / listing** | ❌ **non** | autant que nécessaire |

- La fiche emporter ∈ `tva-5-5` ; la fiche sur place ∈ `tva-10`. Un override par collection Famille A,
  résolu sans ambiguïté (une seule collection porteuse par produit).
- Poser un override sur une collection de nav recrée l'ambiguïté que S2 interdit. **La TVA ne vit que
  dans la Famille A.**

## 5. La boutique : **disponibilité + navigation QR**, jamais la TVA

La boutique n'entre **pas** dans le taux. Elle joue sur deux leviers seulement :

- **Disponibilité** — `SalesChannels` par boutique décide quelles fiches une boutique liste.
- **Navigation** — le QR de la table pointe vers la vue **sur place scopée à sa boutique** : une
  collection `sur-place-boutique-X` (Famille C portée à la dimension boutique) qui **liste** les
  fiches sur place servies là. Aucune TVA ici — juste un listing.

La commande est **estampillée** boutique + table (attributs de panier issus de l'URL du QR :
`baseUrl?table=N&k=token`, déjà modélisé sur `Emplacement`), pour le routing/prépa.

## 6. Le SKU : partagé entre modes, clé de réconciliation

S4 débloque l'exigence « total croissant » **sans rien sacrifier** :

| Couche | Unité | Clé | Rôle |
|---|---|---|---|
| **PIM** (source de vérité, suivis) | **1 produit = 1 SKU** | `PATI-CROISSANT` | l'axe d'analyse |
| **Shopify** (checkout + TVA) | **N produits par mode**, **même SKU** | `handle` / `tva-*` | l'axe de vente |

Le push **propage le même SKU** sur les N fiches d'un produit. On garde **les deux axes** :

- **rollup par SKU** → total croissant (tous modes confondus) ;
- **split par mode / TVA** → via le `handle` et le tag `tva-*`.

La réconciliation se fait dans **le suivi PIM par SKU** — fiable, puisque c'est le PIM qui l'émet.

## 7. Alcool & « vraie divergence » : disponibilité, pas un fork

Cas soulevé : « la TVA sur place diffère par boutique (bar → alcool) ». Distinction **décisive** :

- **Disponibilité (le cas réel).** L'alcool est à **20 % partout** ; seule la boutique-bar le
  **propose**. → fiche alcool ∈ `tva-20`, listée par `sur-place-boutique-bar`, absente des autres.
  C'est de la **disponibilité** (`SalesChannels`), **aucun fork par boutique**, `tva-20` suffit.
- **Vraie divergence (rare, différée).** Un article **strictement identique** portant **deux taux
  selon la boutique**. Seul ce cas force un **fork par boutique** de la fiche
  (`produit × mode × boutique`), **sparse** (uniquement l'article concerné), chacun dans sa `tva-*`.
  La nav-par-collection ne peut **pas** l'exprimer seule (S1 : même produit = même taux).

> **Décision D-SHOP-4** : on modélise la disponibilité, **pas** la divergence. Le fork
> `× boutique` reste **différé** — à n'introduire que le jour où un article identique porte
> réellement deux taux. Voir §8 pour le champ PIM que ça exigerait alors.

## 8. Conséquences sur le code & le modèle

### 8.1 Push : `projectProduct` passe de **1:1** à **fiche → produit**
Le stub actuel (1 produit PIM → 1 produit Shopify) ne peut pas porter deux TVA (S1). Cible :
`buildFiches(produit) → N produits Shopify`, chacun avec

- son tag **`tva-*`** (le taux — Famille A) ;
- ses tags **`sur-place-boutique-X`** (dispo, depuis `SalesChannels` — Famille C) ;
- le **même SKU** que le produit PIM sur toutes ses fiches (§6).

Le générateur de fiches et les tags existent déjà côté `collections.ts` ; le chantier est le **push**.

### 8.2 Le binding gagne le grain **mode** (affine R4)
[`data-model/04`](./data-model/04-composition-et-canaux.md) décrit `shopify_variant_binding` en
PK/FK `variant_id` (1 déclinaison → 1 `shopify_variant_gid`). Avec le mode, une déclinaison PIM
s'expose en **deux** variantes Shopify (une par mode-produit). Le binding devient donc clé
**`(variant_id, mode)`** — et **`(variant_id, mode, boutique_id)`** dans le cas différé §7. R4 tient
(on binde la déclinaison) ; c'est sa **cardinalité** qui passe à N.

### 8.3 Modèle PIM : override TVA sur place **par boutique**, différé et sparse
Aujourd'hui `Category.surPlaceTvaId` est **unique** (pas de dimension boutique sur le taux) — correct
tant qu'on est en disponibilité (§7). La vraie divergence exigerait un **override sparse**
`(catégorie|produit, boutique) → régime`, présent **uniquement** là où ça diverge, et le générateur de
fiches forkant `× boutique` pour ces seuls cas. **Ne pas** l'ajouter tant que le besoin n'est pas réel.

### 8.4 Flow de push **par fiche** (backend, cible) — transactionnel & réversible

Chaque fiche se pousse en une petite **transaction vérifiée**, jamais en « fire-and-forget ». Le POC
front simule le statut ; le backend réel devra dérouler :

1. **Télécharger** l'état actuel du produit Shopify à remplacer → **snapshot de rollback**.
2. **Update** du produit (projection de la fiche).
3. **Diff** effectif appliqué vs attendu (l'update a-t-il produit l'état visé ?).
4. **Test d'accessibilité** de la fiche publiée (la page/produit répond, structure correcte).
5. **Si OK** → binding `up_to_date` (+ `last_pushed_hash`). **Sinon → revert** vers le snapshot de
   l'étape 1, binding `failed` + `last_error`, et on **n'avance pas** le hash.

Conséquence : le push est **idempotent** (même fiche, même hash → « unchanged ») et **sûr** (un échec
laisse Shopify dans l'état d'avant, pas à moitié modifié). C'est la version dure du `dry-run` du POC.

## 9. Décisions (récap)

| # | Décision | Raison |
|---|---|---|
| **D-SHOP-1** | La **fiche `produit × mode`** est l'unité de projection ; **1 fiche = 1 produit Shopify**. | S1/S3 : deux TVA ⇒ deux produits. |
| **D-SHOP-2** | La TVA vit **uniquement** dans la Famille A (`tva-*` + override) ; nav/salle **sans** override. | S2 : un seul porteur d'override par produit. |
| **D-SHOP-3** | Le **SKU est partagé** entre les fiches d'un même produit. | S4 : réconciliation « total SKU » sans perdre le split par mode. |
| **D-SHOP-4** | Boutique = **disponibilité + nav QR**, jamais la TVA ; fork `× boutique` **différé** au seul cas d'un article identique à deux taux. | §7 : l'alcool est de la dispo, pas une divergence. |
| **D-SHOP-5** | Le QR = **lien de navigation** vers `sur-place-boutique-X` ; la commande est **estampillée** boutique + table. | Force 3 : le QR est de la nav, le routing vient de l'estampille. |

## 10. Questions ouvertes

- **Visibilité de la Famille C** : les produits sur place doivent être **publiés mais non indexés**
  (accessibles seulement par le QR). Sur Shopify c'est du _publié + hors menu + `noindex`_ — sécurité
  par obscurité à assumer.
- **Stock partagé** (S5) : non requis sur les items _daily / fait-minute_ ; à trancher si un jour un
  article au même SKU doit partager un compteur emporter/sur place.
- **Graduation en ADR** : une fois le push fiche→produit livré, D-SHOP-1..5 méritent de passer dans
  [`adr.md`](./adr.md) (décisions figées) plutôt que de rester en design.
