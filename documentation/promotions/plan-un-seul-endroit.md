# Plan — une promotion se règle à un seul endroit

> ✅ **Bâti le 2026-10-31** (non commité) : route de site, surface et cartes
> de remise de la fiche retirées ; e2e de régression
> `apps/lfd-api/test/promotions-one-place.e2e-spec.ts`. Le contrôle préalable
> du § 7 (lecture en production) n'a **pas** été fait au bâti.

> 📝 **Plan du 2026-10-31**, contredit par `vitruve` le même jour (§ 8 : ses
> objections et ce qu'elles ont changé).
> Suite de [`plan-promotions-par-audience-et-acheminement.md`](plan-promotions-par-audience-et-acheminement.md),
> § 13.9 et § 14 S-droits, dont il retire la seconde surface.

## 1. La demande (Hugo, 2026-10-31)

En production, Hugo ouvre la promotion de retrait de l'adroit (reprise de la
remise du site) et veut la passer à « −20 % sur tout sauf la chocolaterie,
tous les points de retrait et toutes les livraisons, tous les clients sauf
les particuliers sans compte ». Le serveur refuse : « Une promotion de retrait
à un point se règle depuis ce point de retrait ». Sa décision :

> « La réduction de retrait sur un site doit aller dans promotion générale, on
> ne peut pas avoir deux endroits, ce n'est pas clair. »

Puis, sur la fiche du site :

> « On peut laisser la page réglage d'un site agnostique de comment le
> commerce le traite. »

## 2. L'existant (ouvert le 2026-10-31)

- Deux routes d'écriture :
  - `admin/promotions` (`admin-promotions.controller.ts`, `@AdminSurface("b2b_pricing")`) ;
  - `admin/sites/:pickupId/promotions` (contrôleur retiré le 2026-10-31, `@AdminSurface("lfc_site_settings")`).
- La **surface** (fichier retiré le 2026-10-31) était passée à chaque commande
  (`PosePromotionCommand`, `Revise…`, `Pause…`, `Resume…`, `Archive…`) et
  jugée par `PromotionWriteGuard` (`admitsTouch`, et avant/après pour la
  révision) : `pickup_point` ne se règle que sur la route du site, le reste
  que sur l'écran Promotions. D'où le refus, dans les deux sens, d'un
  changement d'acheminement qui traverse.
- **L'écran est déjà unique.** La fiche du site (`site-promotions-card`) ne
  saisit rien : elle liste et renvoie à `/promotions-ciblees/nouvelle?pickupId=`
  et `/promotions-ciblees/:id`. C'est `PromotionsService.surface()` qui choisit
  la route selon l'acheminement des termes ENVOYÉS — donc la route de la
  nouvelle forme, alors que le garde juge aussi l'ancienne.
- Lectures : `GET admin/promotions` admet déjà `b2b_pricing:read` **ou**
  `lfc_site_settings:read` ; `GET admin/sites/:pickupId/promotions` existe.

## 3. Ce qui change

1. **Une seule route d'écriture** : `admin/promotions`, sous `b2b_pricing`,
   pour toute promotion, « retrait à un point » compris.
2. **La route `admin/sites/:pickupId/promotions` disparaît entière** —
   écritures ET `GET` : la fiche du site lit par `admin/promotions?pickupId=`
   (`promotions.service.ts:31-33`), et le `GET` de site n'a aucun lecteur
   (vitruve, vérifié le 2026-10-31).
3. **La surface disparaît** : le fichier de la surface, le paramètre `surface`
   des cinq commandes et du semis de dev (`src/dev/seeding/station-promotions.seed.ts`),
   le garde de surface de `PromotionWriteGuard`, `PromotionWrongSurfaceError`
   et ses textes, les JSDoc qui la citent. Le reste du garde (la source
   `promotions`, le recouvrement) ne bouge pas. Une révision identique ne
   passe plus par aucun garde : voulu, elle n'écrit rien.
4. **La fiche du site ne parle plus de remises** (Hugo) : la carte
   « Réductions de retrait sur ce site » (`site-discount-card`,
   `audience-discount-card`, inertes depuis la bascule) et la carte des
   promotions du point (`site-promotions-card`) sortent de la page. Le
   réglage d'un site décrit le lieu, pas ce que le commerce en fait.
   L'écran Promotions garde son filtre par point et « Retrait · un point ».
   Front : `PromotionsService.surface()` disparaît ; les gardes de route
   `nouvelle` et `:id/modifier` (`app.routes.ts:224`, `:233`) passent à
   `b2b_pricing:write` seul.
5. **Doc** : `promotions.md` (surfaces, droits, refus), § 13.9 du plan
   rayé avec renvoi ici.

## 4. Le droit qui bouge — c'est le sujet de vitruve

| Qui                            | Avant                                            | Après                     |
| ------------------------------ | ------------------------------------------------ | ------------------------- |
| `b2b_pricing:write` seul       | promotions générales                             | **toutes** les promotions |
| `lfc_site_settings:write` seul | promotions « retrait à SON point »               | **plus aucune** (lecture) |
| les deux                       | les deux, sans pouvoir passer de l'une à l'autre | toutes, et le passage     |

- **Perte assumée** : qui réglait la remise de son site sans le droit des
  prix ne la règle plus. Pré-release : aucun compte staff réel n'est dans ce
  cas aujourd'hui — **à vérifier en base de production avant le bâti**
  (lecture seule : rôles qui ont `lfc_site_settings:write` sans
  `b2b_pricing:write`, et leurs membres). S'il y en a, Hugo accorde le droit
  des prix à l'écran ; aucune migration n'écrit de droit
  (`lint:no-role-grants-in-migrations`).
- **Gain** : rien ne s'ouvre à un droit qui ne l'avait pas — `b2b_pricing`
  posait déjà des remises sur toute la boutique ; il gagne le point, qui est
  un sous-cas.

## 5. Les données

Aucune migration. **Retour arrière** : du code seulement ; mais une
promotion de point révisée en « tous acheminements » après le déploiement
reste générale, même si l'on revient en arrière. Une promotion « retrait à un point » ne porte pas sa
surface : elle se déduit de l'acheminement. Les promotions reprises
(`pd_<site>_b2b`…) deviennent modifiables par l'écran Promotions telles
quelles, identifiant et journal conservés. Le passage « un point » →
« tous acheminements » **change de mécanique** (`applicationPointOf`) : du
panier aux lignes. Le prix de chaque ligne baisse au catalogue, et l'annonce
du point disparaît (elle ne lit que les promotions panier) — ce que Hugo
choisit en prenant « tous acheminements » plutôt que « tout retrait » +
« livraison ».

## 6. Les tests

- e2e qui écrivent par la route de site (`promotions-admin`, `-l10`, `-l12`,
  `-revision`, `-audiences`, `shop-quote-placement-property`,
  `promotion-fixtures.ts`) : repointés ; les assertions de surface de
  `promotions-admin` réécrites. Tout e2e qui importe `promotion-fixtures.ts`
  est relancé.
- Unitaires qui construisent une surface : `promotion-handlers.spec.ts`,
  `promotion-write-guard.spec.ts`, `promotion-overlap.spec.ts`,
  le spec des surfaces (remplacé par un test du droit unique).
- Régression nommée d'après le symptôme : réviser la promotion reprise d'un
  site de « retrait à ce point » vers « tous acheminements » passe, et sa
  révision est journalisée, le prix de ligne baisse, l'annonce du point
  disparaît (e2e).
- Droit : un staff `lfc_site_settings:write` sans `b2b_pricing:write` reçoit
  403 sur `POST admin/promotions` avec un acheminement « un point ».

## 7. Le contrôle préalable

Avant le bâti, une lecture en production (moi, lecture seule) : les rôles qui
ont `lfc_site_settings:write` sans `b2b_pricing:write`, et leurs membres. Si
elle n'est pas faite, le bâti part quand même (pré-release, Hugo seul
staff) mais le compte rendu le dit.

## 8. vitruve, 2026-10-31

Deux BLOQUANTS (le semis de dev, les gardes de route du front) et cinq
SÉRIEUX (le `GET` de site sans lecteur, l'inventaire des tests, le changement
de mécanique, le retour arrière, le contrôle préalable sans responsable) :
tous intégrés ci-dessus. Restent non vérifiés : la fixité du prix des
commandes déjà passées — à lire au bâti (la commande fige ses lignes et ses
remises, `order_discounts`), et les autres apps (une recherche n'a trouvé que
le back-office).
