# Plan — l'acheminement d'une promotion se coche

> ✅ **Bâti le 2026-10-31** — le serveur au commit `0dec40d6e`, l'écran du
> back-office le même jour (carte « Sur quel mode d'acheminement et de
> consommation », cf. [`promotions.md`](promotions.md) § 2.9). Plan du
> 2026-10-31, contredit deux fois par vitruve (§ 8, § 9 font foi). Touche
> l'**argent** (où la remise s'applique) et porte une **migration** de données.

## 1. La demande (Hugo, 2026-10-31)

> « Retrait et livraison devraient être des cases à cocher, car on pourrait
> avoir un seul point et la livraison. »

Puis : « ça permettra aussi d'étendre livraison aux zones, toutes les zones
ou seulement une zone. » Les zones existent (`src/b2b/delivery-zones/`,
table `delivery_zones` dans `settings.prisma`) et une commande livrée porte
la sienne (`orders.delivery_zone_id`, `orders.prisma:194`).

Et, à la question « tout coché : prix du catalogue baissé ou remise au
panier ? » : **remise au panier**. Le comportement actuel de « tous
acheminements » (le prix de l'article baisse au catalogue) devient un choix
à part, « dans le prix affiché ».

## 2. L'existant (ouvert le 2026-10-31)

- `apps/lfd-api/src/b2b/promotions/domain/promotion-fulfillment.ts` : une
  union à **un seul** choix — `any` · `pickup` (tous les points) ·
  `pickup_point` + `pickupId` (UN point) · `delivery`.
- `applicationPointOf` : `any` → ligne (étage `promotion` de la chaîne de
  prix, le prix affiché baisse) ; tout le reste → panier.
- Persistance : deux colonnes, `fulfillment_kind` et `fulfillment_pickup_id`
  (`prisma/schema/public/promotions.prisma`), plus `application_point`,
  miroir dérivé.
- Lecteurs dans le domaine et autour (dix fichiers hors tests) :
  `promotion-targeting.ts` (`fulfillmentAdmits`, `FULFILLMENT_RANK` —
  spécificité), `promotion-overlap.ts` (recouvrement), `promotion-offers.ts`
  (rayon, offre de connexion), `live-promotion.ts`, `promotion-act.ts`
  (journal), `promotion-terms.ts`, `promotion-rows.ts`,
  `promotion-terms.mapper.ts`, `promotion-view.ts` ; l'annonce d'un point
  (`pickup-discount-announcement.ts`) ; contrats
  `packages/contracts/src/promotions.ts` et `promotion-offer.ts`.
- Aujourd'hui « un point ET la livraison » demande **deux** promotions,
  que le refus de recouvrement accepte (acheminements disjoints).

## 3. Le modèle cible

```ts
type PromotionFulfillment =
  | { readonly kind: "displayed_price" } // l'ancien `any` : point LIGNE
  | {
      readonly kind: "basket"; // point PANIER
      readonly pickup: "none" | "all" | { readonly points: readonly string[] };
      readonly delivery: "none" | "all" | { readonly zones: readonly string[] };
    };
```

- **Invariant** (agrégat, à la pose et à la révision) : une promotion
  `basket` coche au moins un acheminement (`pickup ≠ none` ou
  `delivery ≠ none`) ; une liste de points ou de zones n'est jamais vide et
  sans doublon. Refus nommé.
- `applicationPointOf` : `displayed_price` → ligne, `basket` → panier. Rien
  d'autre ne change dans la chaîne de prix ni dans la caisse.
- **Admission** (`fulfillmentAdmits`) : retrait au point P admis si
  `pickup = all` ou `P ∈ points` ; livraison dans la zone Z admise si
  `delivery = all` ou `Z ∈ zones`. Une livraison sans zone connue n'est
  admise que par `delivery = all`.
- **Spécificité** (`FULFILLMENT_RANK`) — à trancher avec vitruve : la règle
  d'aujourd'hui range « un point » avant « tout retrait ». Proposition :
  rang = celui de l'acheminement **de la commande** dans la promotion
  (points nommés > tous les points ; zones nommées > toutes les zones),
  pour que deux promotions disjointes ne se comparent jamais et que le
  départage d'aujourd'hui reste identique.
- **Recouvrement** : deux promotions se recouvrent si leurs ensembles
  d'acheminements s'intersectent (même point ou même zone, ou l'une « tous »
  et l'autre un élément du même côté) — en plus du public, de la
  portée et de la période comme aujourd'hui.
- **Annonce d'un point** : une promotion annonce au point P si elle l'admet
  au retrait. **Offre de connexion** et **rayon** : idem, ensemble au lieu
  d'un choix.

## 4. Les données

Deux tables, `promotion_pickup_points (promotion_id, pickup_id)` et
`promotion_delivery_zones (promotion_id, zone_id)` (clés primaires
composées), et deux colonnes de mode, `fulfillment_pickup` et
`fulfillment_delivery` (`none` · `all` · `listed`). Correspondance
des promotions existantes, une à une, par migration de données :

| Ancien `fulfillment_kind` | Nouveau                                      |
| ------------------------- | -------------------------------------------- |
| `any`                     | `displayed_price`                            |
| `pickup`                  | `basket`, `pickup = all`, `delivery = none`  |
| `pickup_point` + id       | `basket`, `points = [id]`, `delivery = none` |
| `delivery`                | `basket`, `pickup = none`, `delivery = all`  |

`fulfillment_kind` garde ses valeurs le temps de la bascule (pré-release :
Hugo peut décider de resserrer dans le même déploiement, § 0 du CLAUDE.md).
Les **commandes** ne sont pas touchées : elles figent leur remise, son
libellé et sa promotion (`order_discounts`) ; seule la promotion change de
forme. Le journal garde les faits passés tels qu'écrits (valeurs, § 8 du
CLAUDE.md) ; les nouveaux faits portent la nouvelle forme.

## 5. L'écran

Carte « Sur quel mode d'acheminement et de consommation » :

- un choix en tête : **« Dans le prix affiché »** (le prix de l'article
  baisse au catalogue, pour tous les acheminements) ou **« En remise au
  panier »** ;
- en remise au panier : case **Retrait** avec « tous les points » ou une
  sélection multiple de points (`fold-multiselect`), case **Livraison**
  avec « toutes les zones » ou une sélection multiple de zones ;
- l'aide sous chaque choix dit l'effet pour le client.

## 6. Les tests

- Domaine : invariant (rien coché, liste vide, doublon), admission par
  point et livraison, recouvrement d'ensembles, spécificité inchangée sur
  les formes d'aujourd'hui (la table de correspondance du § 4 rejouée).
- Migration : chaque ancienne forme relue à l'identique (e2e sur base
  jetable, promotions posées sous l'ancienne forme puis migrées).
- e2e : « un point + une zone » en UNE promotion — remise au retrait à ce
  point, en livraison, et pas à un autre point ; annonce du point ; offre
  de connexion ; livraison dans une autre zone, pas de remise.
- Régression des suites existantes de promotions (cumul, annonce contre
  caisse, propriété des 50 paniers).

## 7. Hors champ

- Le mode de **consommation** (sur place / à emporter) : pas de donnée côté
  commande en ligne aujourd'hui ; titre seulement.
- Une zone archivée ou supprimée après la pose : la promotion garde son
  identifiant, n'admet plus rien dans cette zone ; à afficher « zone
  retirée » à l'écran (à confirmer au bâti selon le cycle de vie des zones).

## 8. Après vitruve (2026-10-31) — ce qui remplace les §§ 2 à 6 là où ils divergent

Première contradiction : trois BLOQUANTS, sept SÉRIEUX. Décisions de Hugo le
même jour : **(a) refuser la suppression d'une zone qu'une promotion vise** ;
**une bascule en un seul déploiement** (pré-release, § 0 du CLAUDE.md) ; et
« séparer retrait et livraison est indispensable ».

### 8.1 La zone entre dans le fait d'acheminement

- `FulfillmentFact` (`promotion-targeting.ts:48-52`) devient
  `{ method: "pickup", pickupId } | { method: "delivery", zoneId: string | null }`.
- La zone se résout par le code postal, par la règle même des frais
  (`resolveForPostalCode`, `prisma-delivery-zone.repository.ts:90`, préfixe
  le plus long), exposée aux commandes par un **port** de lecture
  (`DeliveryZoneOfPostalCode`) que `delivery-zones` implémente ; `promotions`
  ne l'importe pas, il reçoit le fait déjà résolu.
- Producteurs du fait à brancher : `cart-adjustments.service.ts:212`
  (caisse et devis), `guest-sign-in-offer.service.ts:91` (offre de
  connexion), `promotion-overlap.ts:291` (témoins). La commande passée garde
  sa zone (`orders.delivery_zone_id`) : la révision d'une commande relit la
  même.
- Livraison sans zone résolue (code postal hors zones) : admise par
  `delivery = all` seulement — et la commande, de toute façon, n'a pas de
  frais de zone.

### 8.2 Zones et points supprimés

- `promotion_delivery_zones.zone_id` : clé étrangère **RESTRICT**. Supprimer
  une zone qu'une promotion non archivée vise est refusé avant la base par
  `delivery-zones`, qui lit les promotions par un port (« Cette zone est
  visée par la promotion « X » : retirez-la de la promotion ou archivez
  celle-ci ») ; une promotion archivée libère la zone (la ligne de liaison
  part avec l'archivage — à trancher au bâti : garder la liaison et
  RESTRICT seulement sur les non archivées passe par le contrôle applicatif,
  la FK reste `RESTRICT` et l'archivage efface ses liaisons).
- Points de retrait : un site **s'archive**, il ne se supprime pas
  (`settings.prisma`, `archivedAt` — « remplace la suppression physique »).
  `promotion_pickup_points.pickup_id` en FK `RESTRICT` ; un point archivé
  reste dans la promotion et n'admet plus rien (plus de commande à ce point).

### 8.3 Le rang de spécificité se calcule par fait

- `AdmittedPromotion` porte son rang d'acheminement **pour le fait jugé** ;
  `promotionsAdmitted` (`live-promotion.ts:110`) le calcule ;
  `targetingRankOf` (`live-promotion.ts:146-153`) le lit au lieu de
  `FULFILLMENT_RANK[kind]`. Rangs : point nommé ou zone nommée = 2 ; tous
  les points ou toutes les zones = 1 ; `displayed_price` = 0.
- Consommateurs inchangés dans leur forme : `basket-promotion-plan.ts:123`,
  `pickup-discount-announcement.ts:137`, `pricing/domain/specificity.ts:94`
  (via `price-rule.ts:229`) — ce dernier ne voit que des promotions
  `displayed_price` (point ligne), rang 0 comme aujourd'hui.
- Contre-exemple de vitruve, tenu : A = {points [P1], livraison toutes},
  B = {retrait tous, zones [Z]} — en Z, B (2) avant A (1) ; en P1, A (2)
  avant B (1).

### 8.4 Le reste

- **Lecteurs** : la liste du § 2 est fausse (« dix fichiers ») ; le bâti
  part de la liste de vitruve — `promotion-terms-equality.ts`,
  `promotion-write-guard.ts:43`, `line-promotion-supply.ts:23` (filtre
  `fulfillment_kind <> 'any'`), `prisma-live-promotion.readers.ts`,
  `prisma-promotion-browser.readers.ts`, `promotion-rivals.reader.ts`,
  `orders/domain/services/fulfillment-promotion.ts`,
  `cart-adjustments.service.ts`, `shop-catalogue-offers.ts`,
  `shelf-promotion-offers.ts`, boutique `client/shop/promotion-offers.ts`,
  back-office `promotion-words.ts`, `promotion-format.ts`,
  `promotion-summary.ts`, `promotion-draft.ts`, semis
  `station-promotions.seed.ts`, onze e2e et `promotion-fixtures.ts`.
- **Contrat de la boutique** (`promotion-offer.ts:26-29`) : on le casse
  (pré-release). Une offre porte l'ENSEMBLE (`pickup`, `delivery`) d'une
  promotion ; la boutique dit « au retrait à … » ou « en livraison » selon
  ce que le client regarde.
- **Révision L9** : l'agrégat **trie** points et zones à la construction ;
  reposer la même liste dans un autre ordre n'est pas une révision.
  Et l'**adresse livrée** compte parmi les changements d'acheminement jugés
  à la révision (avec le mode et le point) : la zone entrant dans le fait,
  une autre adresse peut retirer la promotion (validé le 2026-10-31).
- **Recouvrement** : témoins ajoutés — chaque zone de chaque liste, « une
  autre zone », « livraison sans zone ».
- **Persistance** : `application_point` reste dérivé et réécrit ;
  `fulfillment_kind` et `fulfillment_pickup_id` **disparaissent** dans le
  même déploiement (bascule unique), après la migration de données ;
  `listed` relu sans ligne de liaison = erreur de lecture nommée (jamais un
  ensemble vide silencieux).
- **Retour arrière** : gratuit jusqu'à la première promotion « point +
  zone » posée en production ; après, une restauration perdrait sa forme.
- **Journal** : les nouveaux faits nomment les points et les zones (leurs
  libellés au moment du fait), pas leurs identifiants ; les faits passés
  restent tels qu'écrits.

## 9. Seconde passe de vitruve (2026-10-31) — aucun bloquant ; tranché

- **Ports, sans cycle** : `promotions` déclare `DeliveryZoneDirectory`
  (« ces zones existent-elles, leurs libellés ») et `PickupPointDirectory`
  (même question pour les sites) ; `delivery-zones` déclare
  `PromotionsTargetingZone` (« quelles promotions non archivées visent
  cette zone ») ; `appBootstrap` relie. Aucun des modules n'importe l'autre.
  Poser une promotion sur une zone ou un site inconnu est un refus nommé,
  jamais une violation de clé étrangère.
- ⚠️ **Corrigé le 2026-10-31 (auteur, au bâti)** : la suppression d'une zone
  est refusée tant qu'une promotion la nomme, **archivée comprise** — la FK
  est `RESTRICT`, le fait de suppression ne nomme plus de promotions, et
  `listed` sans liaison devient inatteignable (la CASCADE ci-dessous rendait
  illisible toute promotion archivée dont la zone partait). Le reste de ce
  point est périmé.
- **Suppression d'une zone** : refusée tant qu'une promotion **non
  archivée** la vise (décision (a) de Hugo), contrôle et suppression dans la
  même transaction, la zone verrouillée (`FOR UPDATE`). La FK
  `promotion_delivery_zones.zone_id` est en `ON DELETE CASCADE` : une
  promotion **archivée** perd la liaison à la suppression de la zone ; le
  fait de suppression nomme les promotions archivées touchées, et le journal
  de chaque promotion garde le libellé de la zone. L'archivage d'une
  promotion n'efface rien.
- **Colonnes anciennes** : `fulfillment_kind` et `fulfillment_pickup_id`
  **restent en base**, rendues nullables, plus écrites ni lues (« une
  colonne morte reste en base », CLAUDE.md § 0, qui vaut aussi en
  pré-release). La bascule reste unique pour le code ; le retour arrière
  n'est plus gratuit dès le déploiement (le code précédent lirait des
  colonnes vides pour les nouvelles promotions).
- **Livraison sans zone** : inatteignable à la caisse
  (`cart-adjustments.service.ts:202-203` lève
  `NoDeliveryZoneForPostalCodeError`) ; la règle « admise par
  `delivery = all` seulement » ne concerne que l'annonce et les témoins.
- Ligne citée : `resolveForPostalCode` est à `prisma-delivery-zone.repository.ts:91`.
