# Cartographie API Shopify — besoins du PIM → opérations

> **But.** Pour chaque besoin du PIM (produits, collections de TVA, publications,
> emplacements…), la **capacité Shopify** à posséder : le **scope** read/write, le
> **nom de la fonction** côté `admin-client` (existant ou proposé), et l'**action**
> associée. Sert à décider quels scopes cocher à l'install et quoi coder ensuite.
>
> Statut : **carte vivante.** Les noms marqués _(proposé)_ ne sont pas encore codés.
> Date : 2026-08-04.
> Voisins : [`projection-shopify.md`](projection-shopify.md) (le *pourquoi* de chaque
> projection), [`shopify-connexion-setup.md`](shopify-connexion-setup.md),
> [`shopify-e2e-strategy.md`](shopify-e2e-strategy.md).

**Légende statut** : ✅ codé · 🟡 partiel / stub · ⬜ à faire.

---

## Récapitulatif des scopes

| Scope | Pourquoi | Déjà accordé ? |
| --- | --- | --- |
| `read_products` / `write_products` | lire l'état, pousser produits + déclinaisons + prix, **et les collections** (l'objet `Collection` est dans ce périmètre — pas de scope séparé) | ✅ accordés |
| `read_publications` / `write_publications` | publier sur les canaux de vente | ✅ accordés |
| `read_locations` / `write_locations` | le PIM est **autoritaire** sur les emplacements : il les lit **et les provisionne** dans Shopify (décision 2026-08-04) | ⬜ à ajouter (+ ré-install) |
| `read_inventory` / `write_inventory` | **conditionnel** — seulement si dispo par emplacement (voir §Emplacements) | ⬜ à trancher |

> ⚠️ **Il n'existe PAS de scope `read/write_collections`.** Les collections sont
> couvertes par `read_products` / `write_products` — donc **déjà accordées**, aucune
> ré-install pour la TVA. En revanche `read_locations` **et** `write_locations` sont à
> ajouter (⇒ ré-install) : le PIM ne se contente pas de lire les emplacements, il les
> **crée / édite** dans Shopify.

> Rappel : les scopes sont figés **à l'install**. En ajouter ⇒ **ré-installer /
> ré-autoriser** pour que le prochain jeton les porte (cf. runbook).

---

## Connexion

| Sens | Scope | Fonction (`admin-client`) | Opération GraphQL | Action | Statut |
| --- | --- | --- | --- | --- | --- |
| R | — (lecture `shop`) | `verify()` | `query { shop { name myshopifyDomain } }` | Confirme que domaine + identifiants parlent à la boutique | ✅ |

---

## Produits (identité · déclinaisons · prix)

| Sens | Scope | Fonction (`admin-client`) | Opération GraphQL | Action | Statut |
| --- | --- | --- | --- | --- | --- |
| R | `read_products` | `listProducts()` | `query products` | Lire l'état actuel du catalogue (miroir, anti-doublon) | ✅ |
| W | `write_products` | `pushProduct()` _(proposé)_ | `mutation productSet` | Créer/mettre à jour un produit **et ses déclinaisons** (upsert par handle) | 🟡 stub dry-run |
| W | `write_products` | `setVariantPrice()` _(proposé)_ | `productVariantsBulkUpdate` | Écrire le prix d'une déclinaison (porté par `productSet` si groupé) | ⬜ |
| R | `read_products` | `findProductByHandle()` _(proposé)_ | `query productByHandle` | Retrouver l'ID Shopify d'un produit pour créer le **binding** (éviter le doublon) | ⬜ |

> Le push réel est volontairement différé (`driver.ts` = stub) : les mutations
> Shopify sont versionnées, un spike sur dev store tranchera la forme exacte de
> `productSet` avant d'écrire pour de vrai.

---

## Collections de TVA (`tva-*`)

| Sens | Scope | Fonction (`admin-client`) | Opération GraphQL | Action | Statut |
| --- | --- | --- | --- | --- | --- |
| R | `read_products` | `listTvaCollections()` | `query collections` (filtre `tva-*`) | Lister les collections de TVA présentes (réconciliation) | ✅ |
| W | `write_products` | `createCollection()` | `mutation collectionCreate` | Créer une collection **manuelle** vide pour un régime de TVA | ✅ |
| W | `write_products` | `addProductsToCollection()` _(proposé)_ | `collectionAddProductsV2` | Ranger les produits d'un régime dans sa collection de TVA | ⬜ |
| W | `write_products` | `removeProductsFromCollection()` _(proposé)_ | `collectionRemoveProducts` | Retirer un produit d'un régime (changement de taux) | ⬜ |

> Les collections n'ont **pas** de scope propre : `collectionCreate` /
> `collectionAddProductsV2` passent par **`write_products`** (déjà accordé).

> Modèle : une collection **par régime** (`emporterTvaId` / `surPlaceTvaId`), le QR
> d'une table pointe vers une **collection filtrée**. Voir [`projection-shopify.md`](projection-shopify.md).

---

## Publications (canaux de vente)

| Sens | Scope | Fonction (`admin-client`) | Opération GraphQL | Action | Statut |
| --- | --- | --- | --- | --- | --- |
| R | `read_publications` | `listPublications()` _(proposé)_ | `query publications` | Lister les canaux de vente de la boutique (Online Store, POS…) | ⬜ |
| W | `write_publications` | `publishProduct()` _(proposé)_ | `mutation publishablePublish` | Publier un produit sur un ou plusieurs canaux | ⬜ |
| W | `write_publications` | `unpublishProduct()` _(proposé)_ | `mutation publishableUnpublish` | Dépublier (retrait d'un canal) | ⬜ |

> `SalesChannels` déclare **par boutique** si l'article se vend `emporter` / `surPlace` :
> ça se matérialise ici, en publiant (ou non) sur le canal correspondant.

---

## Emplacements (Locations)

| Sens | Scope | Fonction (`admin-client`) | Opération GraphQL | Action | Statut |
| --- | --- | --- | --- | --- | --- |
| R | `read_locations` | `listLocations()` _(proposé)_ | `query locations` | Lister les emplacements Shopify pour les **réconcilier** avec ceux du PIM | ⬜ |
| W | `write_locations` | `createLocation()` _(proposé)_ | `mutation locationAdd` | Provisionner un emplacement PIM absent de Shopify | ⬜ |
| W | `write_locations` | `updateLocation()` _(proposé)_ | `mutation locationEdit` | Mettre à jour un emplacement (nom, adresse) | ⬜ |
| W | `write_locations` | `setLocationActive()` _(proposé)_ | `locationActivate` / `locationDeactivate` | Activer / désactiver un emplacement | ⬜ |

> **Décision (2026-08-04) : le PIM est autoritaire sur les emplacements.** Il ne se
> contente pas de les lire — il les **provisionne** dans Shopify (le contexte
> « emplacements » du PIM, Slice 5, est la source de vérité des boutiques / points de
> vente). D'où `write_locations`, à ajouter à la ré-install.

---

## Stock / réassort — **ingestion, pas écriture**

> **Intention (2026-08-04) : être maître du stock pour le RÉASSORT, pas pour le
> descendant.** On veut **agréger la consommation** de tous les canaux (Shopify, POS,
> B2B, prod labo) pour décider quoi réapprovisionner / produire — **pas** piloter la
> quantité `available` affichée par Shopify. Shopify est donc une **source de signal**,
> pas une cible : on **lit** la consommation, on n'écrit rien.

| Sens | Scope | Fonction / abonnement | Signal | Action | Statut |
| --- | --- | --- | --- | --- | --- |
| R | `read_inventory` | webhook `inventory_levels/update` _(proposé)_ | delta d'`available` par emplacement — **sans PII** | Réinjecter la consommation Shopify dans l'agrégateur de réassort | ⬜ |
| R | `read_orders` | webhook `orders/create` _(proposé)_ | lignes de commande (SKU + quantité) — **avec PII** (protected customer data) | Alternative si l'inventaire n'est pas suivi côté Shopify | ⬜ |
| ~~W~~ | ~~`write_inventory`~~ | — | — | **Pas nécessaire** : on ne repousse pas de quantité (c'est le « descendant » qu'on ne veut pas) | ❌ écarté |

> **Deux décisions à acter :**
>
> 1. **Contexte séparé.** L'agrégateur stock/réassort n'est **pas** le PIM — c'est un
>    bounded context propre (le même où vivraient les commandes). Le PIM reste
>    l'identité produit ; l'agrégateur consomme les événements de vente. Il réutilise
>    le `ShopifyTokenProvider`.
> 2. **Modèle vs ADR-14.** Le réassort implique de **suivre les quantités réellement
>    consommées par SKU** (un ledger de consommation), un cran au-delà de la
>    « capacité / créneaux » de l'[ADR-14](./adr.md). Pas contradictoire (capacité =
>    combien je *peux* faire ; réassort = combien j'ai *écoulé*), mais **nouveau modèle
>    à trancher**.
>
> Canal d'ingestion privilégié : **`inventory_levels/update`** (zéro PII). `read_orders`
> seulement si l'inventaire n'est pas suivi côté Shopify (⇒ accès protected customer data).

---

## Ordre d'acquisition suggéré

1. **Produits W** (`pushProduct` réel) — le cœur : sans push, rien ne descend.
2. **Collections W** (`addProductsToCollection`) — dès que la TVA par collection est branchée (+ scope `read/write_collections`).
3. **Publications** — quand on veut piloter la présence par canal (emporter/sur place).
4. **Emplacements R/W** — quand le contexte locations arrive : le PIM provisionne les boutiques dans Shopify (`read_locations` + `write_locations`).
5. **Inventaire / réassort** — voir la décision ouverte ci-dessous : le besoin est probablement de la **lecture de consommation** (ingestion), pas de l'écriture de stock.
