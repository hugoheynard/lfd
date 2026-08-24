# Projection par **contexte de vente** — le modèle à expansion

> Comment un même article se projette sur Shopify quand il peut se vendre dans **plusieurs
> contextes** à **TVA différente** — à emporter (5,5 %), sur place (10 %), dépannage B2B
> (20 %)… L'unité de projection n'est plus le produit, c'est le couple **(produit × contexte
> actif)**. Généralise la « fiche » de [`projection-shopify.md`](./projection-shopify.md) au-delà
> du seul mode emporter/sur-place.
>
> Statut : **design cible.** Décidé le 2026-08-05 : on construit le modèle _expansible_ plutôt
> que le raccourci « une seule TVA par produit ». Aujourd'hui **un seul contexte est actif
> (`emporter`)**, donc la boutique reçoit toujours **1 produit par article** — mais l'ajout d'un
> 2ᵉ contexte est une ligne de config, pas une refonte.

> ✅ **Point 1 ci-dessous LIVRÉ le 2026-08-24** (C0-a « étendre » + C0-b « basculer »).
> Le registre est la table `pim.sales_context`, les taux la jointure
> `pim.category_context_tva`, et `ACTIVE_SALES_CONTEXTS` n'existe plus. Les §2/§4/§5
> décrivent encore le C1 d'origine, à colonnes fixes — lire l'addendum d'abord.
> Reste **C0-c** (le `DROP` des trois colonnes, au déploiement suivant) et le cousin
> `channelPreset`. Le point 2 (handle write-once) est intact, à faire.
>
> ⚠️ **Décisions arrêtées APRÈS rédaction :**
>
> 1. **Data-driven, pas en dur.** Toute dimension scalable (contextes/canaux de vente, TVA par
>    contexte) = **donnée**, jamais colonnes fixes ni const. `sales_context` (table = registre :
>    `key`, `label`, `handleSuffix`, `active`, `position`) + `category_context_tva` (jointure
>    `(categoryId, contextId) → tvaRateId`) **remplacent** `Category.emporterTvaId`/`surPlaceTvaId`
>    et `ACTIVE_SALES_CONTEXTS`. Les lectures deviennent des **listes** `[{contextKey, tag}]`.
>    Ajouter un contexte (B2B) = **une ligne**, zéro code. **Une fois testé, le modèle ne bouge plus**
>    (règle produit). Cousin à traiter pareil : `Category.channelPreset`. ⚠️ **Corrigé depuis** : les
>    boutiques `b1`/`b2` ont été remplacées par des identifiants d'emplacement — cette
>    moitié est faite. Ce qui reste fixe, ce sont les **modes** (`emporter`/`surPlace`)
>    et le drapeau `b2b`.
> 2. **Handle publié = write-once (SEO).** Une URL indexée est définitive : la changer = 404 + perte
>    de ranking (Shopify ne garantit pas la 301 via `productSet`). Donc : (a) le handle est **figé au
>    1er push** (dans le binding/snapshot) ; changer `slug.fr` d'un produit publié est **bloqué** ou
>    routé par un **flux renommage+301**, jamais un re-push aveugle (sinon la réconciliation par handle
>    orpheline l'ancien produit + casse le SEO) ; (b) le `handleSuffix` d'un contexte est **figé avant
>    son 1er push** ; (c) la réconciliation distingue **renommage** de **retrait+création** via le
>    `productId` du snapshot, pas seulement le handle. Le défaut « handle nu au 1er contexte » protège
>    déjà l'URL emporter existante quand on active sur-place/B2B.

---

## 1. Le principe : le contexte porte la TVA, pas le produit

Un **contexte de vente** = une manière de vendre l'article qui a son propre **traitement de
TVA** (et, à terme, son propre canal / sa propre disponibilité). Invariant Shopify **S1** : un
produit Shopify = un seul traitement TVA (l'override se pose par appartenance à **une** collection
`tva-*`). Donc :

```
article PIM ──(× contexte actif)──► (article, emporter)  ──► produit Shopify, collection tva-5-5
                                     (article, surPlace)  ──► produit Shopify, collection tva-10   [inactif]
                                     (article, b2b)       ──► produit Shopify, collection tva-20    [futur]
```

Chaque **(article × contexte) = un produit Shopify**, membre de **la collection `tva-*` de ce
contexte**. La collection porte l'override ; le produit n'en porte aucun.

## 2. Le registre des contextes (le point d'expansion)

Un contexte se déclare une fois :

| Champ    | Rôle                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| `key`    | `emporter` / `surPlace` / `b2b` … — identité stable                               |
| `tvaRef` | quel taux de la catégorie ce contexte lit (`emporterTvaId` / `surPlaceTvaId` / …) |
| `handle` | stratégie de handle Shopify (voir §4)                                             |
| `active` | le contexte est-il projeté aujourd'hui ?                                          |

**Aujourd'hui : `[{ emporter, active }]`.** Ajouter « sur place » = passer `active: true` sur un
contexte déjà décrit ; ajouter « B2B 20 % » = décrire un nouveau contexte + son `tvaRef`. Le reste
du pipeline (projection, push, réconciliation) ne change pas — il **itère les contextes actifs**.

## 3. Résolution de la TVA (composition cross-contexte)

La TVA d'un `(article, contexte)` se résout en composant **deux contextes bornés** (ADR-13, la
composition vit au **bord**, l'adaptateur Shopify demande à un port) :

```
article.categoryId ─► Category.<contexte.tvaRef>  (catalogue)  ─► TvaRate.tag  (commerce)  ─► handle collection « tva-5-5 »
```

Le socle existe déjà : `Category` porte `emporterTvaId` / `surPlaceTvaId`
([`set-category-tva`](../../apps/lfd-api/src/pim/catalogue/application/set-category-tva.ts)),
`TvaRate.tag` est le handle dérivé du taux. Manque **le read composé** exposé à l'adaptateur :
« pour cet article et ce contexte, quel handle de collection ». Il ne lit jamais les tables de
l'autre domaine — il passe par un port.

## 4. Le handle : le 1ᵉʳ contexte garde le slug nu

Pour ne pas casser les bindings/snapshots existants, le **contexte par défaut (`emporter`) garde le
handle nu** (`baguette-tradition`) — la projection 1:1 actuelle en est le cas particulier. Les
contextes suivants **suffixent** (`baguette-tradition-surplace`, `-b2b`). Conséquence : activer
`emporter` seul **ne change rien** à ce qui est déjà poussé ; c'est la migration nulle.

## 5. L'appartenance : mutation séparée, après le push

Shopify ne pose pas la collection dans `productSet`. Ordre (findings **F11**) :

1. **La collection `tva-*` doit exister** — garantie par le push collections
   (`collections/tva/push`) **ou** créée à la demande (`collectionCreate`) si absente.
2. `productSet` (upsert par handle) → renvoie le **GID produit**.
3. Résoudre `contexte.tvaTag` → **GID collection** (liste des collections).
4. `collectionAddProductsV2(collectionGid, [productGid])` — range le produit.

Idempotent : ré-appartenir un produit déjà membre est sans effet. Un produit ne doit être que dans
**une** collection `tva-*` (S2) — si son contexte change de taux, on l'ôte de l'ancienne.

## 6. Réconciliation : rien à changer

Le moteur trois-voies ([`publication-reconciliation-3way.md`](./publication-reconciliation-3way.md))
est **déjà clé sur le handle**. Chaque `(article × contexte)` a son handle → sa propre ligne de
réconciliation. Ajouter un contexte = de nouveaux handles = de nouvelles lignes, automatiquement.
**Zéro modification du moteur** — c'est le dividende du choix « clé handle » de S3.

## 7. Slices

| Slice              | Contenu                                                                                                      | Statut  |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ------- |
| **C1**             | Registre de contextes (`emporter` actif) + read composé « tva tag par (article, contexte) » derrière un port | à faire |
| **C2**             | `collectionAddProductsV2` dans le driver live + résolveur GID + « collection absente → créer »               | à faire |
| **C3**             | Push : après `productSet`, ranger le produit dans la collection `tva-*` de son contexte ; tests              | à faire |
| **C4** _(inactif)_ | Activer `surPlace` : projection multi-contexte (handles suffixés) + réconciliation par contexte              | différé |
| **C5** _(futur)_   | Contexte `b2b` (TVA 20 %) — pur ajout de config                                                              | futur   |

C1-C3 = la tranche **emporter** : TVA correcte pour le rayon / click&collect **aujourd'hui**, sur
un modèle qui accueille sur-place et B2B sans rework. C4+ s'activent quand le métier le décide.

## 8. Revue adverse

1. **Un seul contexte actif = pas de preuve d'expansion.** Le risque est de coder « emporter » en
   dur au lieu d'itérer un registre. Garde-fou : C1 introduit le registre **avant** de câbler la
   membership, même avec un seul élément.
2. **Collection absente au moment du push produit** → membership échoue en silence. C2 doit soit
   créer la collection, soit **rapporter** l'anomalie dans le résultat du push (pas l'avaler).
3. **Le suffixe de handle est un choix irréversible** côté boutique (change l'URL). D'où : défaut =
   slug nu, suffixe seulement pour les contextes **non-défaut** — décidé §4, à ne pas revisiter à la
   légère.
4. **La TVA est de l'argent.** Tant que `surPlace` est inactif, un article vendu sur place hors-ligne
   n'est pas concerné ; mais si un jour on l'active côté Shopify sans C4, il serait mal taxé — d'où
   `active` explicite par contexte, jamais implicite.
