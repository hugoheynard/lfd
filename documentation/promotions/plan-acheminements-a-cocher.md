# Plan — l'acheminement d'une promotion se coche

> 📝 **Plan du 2026-10-31**, doc-first. Touche l'**argent** (où la remise
> s'applique) et porte une **migration** de données : `vitruve` avant le
> bâti. Rien n'est bâti.

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
