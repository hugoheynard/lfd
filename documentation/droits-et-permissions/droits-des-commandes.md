# Les droits des commandes — qui peut quoi sur une commande

> **Ce document liste chaque droit du back-office qui touche une commande**, de
> la lecture à l'annulation, du comptoir au colisage, du règlement à
> l'heure limite. Pour chacun : son nom technique, son libellé à l'écran, les
> routes d'API qu'il ouvre, les écrans et boutons qu'il montre, et qui le tient
> dans la graine.
>
> **Tout ce qui suit a été relu dans le code le 2026-10-12** (commit
> `ffa8a1311`, branche `dev`) : l'enum `StaffResource`
> (`apps/lfd-api/prisma/schema/public/staff.prisma`), les libellés et la graine
> (`packages/contracts/src/staff-access.ts`), les `@AdminSurface` /
> `@RequirePermission` des contrôleurs, et les gardes du back-office
> (`app.routes.ts`, `b2b/b2b.routes.ts`, `comptabilite/comptabilite.routes.ts`,
> `admin/admin.routes.ts`, et les appels à `PermissionsStore.can` dans les
> composants).
>
> Le modèle général — permission, rôle, dérogation, « le front cache, le
> serveur refuse » — est dans [`architecture-acces-staff.md`](architecture-acces-staff.md) ;
> le stockage et l'ordre de résolution dans
> [`stockage-et-resolution-des-droits.md`](stockage-et-resolution-des-droits.md) ;
> la sortie des gestes hors de `b2b_orders` dans
> [`../livraisons/droits/plan-droits-par-geste.md`](../livraisons/droits/plan-droits-par-geste.md).

## Deux règles à garder en tête

1. **L'action se déduit du verbe HTTP.** Sous `@AdminSurface("<ressource>")`,
   `GET`/`HEAD` exigent `<ressource>:read`, tout le reste `<ressource>:write`
   (`apps/lfd-api/src/platform/auth/admin-surface.decorator.ts`). Un
   `@RequirePermission(...)` sur une route **remplace** cette exigence ; un
   `@RequireAnyPermission(a, b)` accepte l'une ou l'autre. `write` implique
   `read`.
2. **La graine n'est pas la source.** `ROLE_GRANTS` ne sert qu'à semer une base
   vierge (e2e, dev). En production, chaque rôle lit sa définition en base, et
   **les droits se règlent à l'écran `/admin/staff-roles`**. Les colonnes
   « graine » ci-dessous disent ce qu'un rôle reçoit sur une base neuve, pas ce
   qu'il a en production.

## Récapitulatif

Graine : `A` admin · `Co` commercial · `Cp` comptabilité · `Ct` vendeur comptoir ·
`S` support · `D` technique. `W` = écriture, `R` = lecture, `—` = rien.
`admin` tient **tout** en `W`, sans exception (invariant testé du contrat).

| Droit (`StaffResource`)      | Libellé à l'écran            | Ce qu'il ouvre, en un mot                                                               | Co  | Cp  | Ct  | S   | D   |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- | --- | --- | --- | --- | --- |
| `b2b_orders`                 | Commandes                    | lire les commandes, le bon, l'historique, le prix d'une ligne ; `W` = rappel de retrait | W   | W   | W   | R   | —   |
| `b2b_place_order`            | Passer une commande pro      | saisir une commande pour un client, son devis, son brouillon                            | W   | W   | W   | —   | —   |
| `b2b_cancel_order`           | Annuler une commande         | annuler une commande pas encore au compte à produire                                    | —   | —   | —   | —   | —   |
| `b2b_counter`                | Comptoir                     | la carte et le détail d'un client, côté comptoir                                        | R   | R   | R   | —   | —   |
| `b2b_supervision`            | Supervision                  | la vue du jour ; `W` = les contrôles qualité                                            | —   | —   | —   | —   | —   |
| `handover_counter`           | Retrait au comptoir          | la file de retrait, le scan, le retrait attesté                                         | W   | W   | W   | R   | —   |
| `production_plan`            | Production — Plan du soir    | le compte à produire, le prévisionnel                                                   | R   | R   | R   | R   | —   |
| `production_count_stop`      | Production — Arrêt du plan   | arrêter le plan (clore la journée)                                                      | W   | W   | W   | —   | —   |
| `production_worksheet`       | Production — Fiche d'atelier | la fiche d'atelier, les fiches PDF par commande                                         | W   | W   | W   | R   | —   |
| `production_packing`         | Production — Colisage        | mettre les commandes au bac                                                             | W   | W   | W   | R   | —   |
| `production_settings`        | Production — Réglages        | mode et heures d'arrêt, jours fermés                                                    | R   | R   | R   | —   | —   |
| `delivery_proofs`            | Preuves de livraison         | la photo et la signature de la commande livrée                                          | R   | —   | —   | —   | —   |
| `b2b_order_waivers`          | Dérogations d'heure limite   | laisser un client commander après l'heure limite                                        | W   | —   | —   | —   | —   |
| `b2b_settings`               | Réglages plateforme          | ouverture de la boutique, heures limites                                                | R   | R   | —   | —   | R   |
| `b2b_accounting`             | Comptabilité                 | liens de paiement d'une commande, factures carte                                        | —   | W   | —   | —   | —   |
| `b2b_deferred_payment_block` | Blocage du prélèvement       | bloquer / débloquer le prélèvement d'une société                                        | —   | W   | —   | —   | —   |
| `b2b_late_fee`               | Surtaxe de retard            | le montant et le taux de la surtaxe de retard                                           | —   | W   | —   | —   | —   |
| `delivery_loading`           | Chargement                   | les bacs, en alternative au colisage                                                    | —   | —   | W   | —   | —   |

**Dix-huit droits.** Le remboursement n'en a pas : aucune route ne rembourse
(cf. [§ Règlement](#reglement)).

---

## `b2b_orders` — Commandes

Le droit de **lire** les commandes de toutes les sociétés. Contrôleur
`AdminOrdersController` (`apps/lfd-api/src/b2b/orders/http/admin-orders.controller.ts`,
`@AdminSurface("b2b_orders")`), plus deux contrôleurs voisins sous la même
ressource.

| Méthode et chemin                                          | Exige                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /admin/orders`                                        | `b2b_orders:read`                                                                     |
| `GET /admin/orders/:id`                                    | `b2b_orders:read`                                                                     |
| `GET /admin/orders/:id/history`                            | `b2b_orders:read`                                                                     |
| `GET /admin/orders/:id/bon.pdf`                            | `b2b_orders:read`                                                                     |
| `GET /admin/orders/day-version`                            | `b2b_orders:read` **ou** `handover_counter:read`                                      |
| `GET /admin/orders/:id/lines/:sku/rules`                   | `b2b_orders:read` — l'explication du prix d'une ligne (`AdminOrderPricingController`) |
| `GET /admin/catalog`, `/sellable`, `/companies/:companyId` | `b2b_orders:read` — le catalogue de la saisie (`AdminCatalogController`)              |
| `POST /admin/orders/:id/pickup-reminder`                   | `b2b_orders:write` — **la seule route** que `b2b_orders:write` ouvre encore           |

Les autres `POST` du contrôleur portent leur propre droit
(`b2b_place_order`, `b2b_cancel_order`), et les preuves de livraison le leur
(`delivery_proofs`).

**Back-office** : `/commandes` et `/commandes/:orderId` (garde
`b2b_orders:read`) ; l'entrée de menu (`app.ts`, `can('b2b_orders:read')`). Sur
le détail (`commandes/order-view`) : le bon PDF, l'historique, les
remboursements reçus (lecture seule), l'explication du prix d'une ligne
(`price-explain`). Le bouton « rappel » vit sur la file de retrait
(`handover-shop`), pas sur le détail.

⚠️ Le commentaire de la graine dit que ce droit « ne couvre toujours pas la
modification d'une commande passée » : aucune route ne l'expose (vérifié le
2026-10-12).

## `b2b_place_order` — Passer une commande pro

Sorti de `b2b_orders` le 2026-10-01. Il couvre la saisie par l'équipe.

| Méthode et chemin                              | Exige                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `POST /admin/orders`                           | `b2b_place_order:write` (`@RequirePermission`)                      |
| `POST /admin/orders/quote`                     | `b2b_place_order:write` — le prix que la validation appliquera      |
| `GET /admin/order-drafts/:companyId`           | `b2b_place_order:write` (`@RequirePermission`, même en lecture)     |
| `PUT`, `DELETE /admin/order-drafts/:companyId` | `b2b_place_order:write` (verbe, `@AdminSurface("b2b_place_order")`) |

**Back-office** : `/comptes-clients/:id/nouvelle-commande` (garde
`b2b_place_order:write`) ; `/comptoir/nouvelle-commande` et
`/comptoir/nouvelle-commande/:id` (garde `COUNTER_ORDER_GUARDS` =
`b2b_counter:read` **et** `b2b_place_order:write`) ; l'entrée « Comptoir » du
menu (`app.ts`, `can('b2b_counter:read') && can('b2b_place_order:write')`).

## `b2b_cancel_order` — Annuler une commande

Ajouté le 2026-10-12 (commits `76d54e9f6`, `ffa8a1311` ;
[`../order/plan-annulation-de-commande.md`](../order/plan-annulation-de-commande.md), C3).
Le staff annule une commande qui n'est pas encore au compte à produire.

| Méthode et chemin               | Exige                                           |
| ------------------------------- | ----------------------------------------------- |
| `POST /admin/orders/:id/cancel` | `b2b_cancel_order:write` (`@RequirePermission`) |

**Back-office** : le bouton « Annuler » du détail (`commandes/order-cancel`),
montré si `can('b2b_cancel_order:write')` et selon la `cancellability` que rend
le détail.

**Graine** : `admin` seul. Les autres rôles ne le reçoivent pas : le geste
s'accorde à l'écran, en production comme ailleurs (commentaire de la graine,
vérifié le 2026-10-12).

## `b2b_counter` — Comptoir

| Méthode et chemin                         | Exige              |
| ----------------------------------------- | ------------------ |
| `GET /admin/counter/customers`            | `b2b_counter:read` |
| `GET /admin/counter/customers/:companyId` | `b2b_counter:read` |

Ce que voit un vendeur d'un client pour lui vendre, sans sa fiche
(`b2b_companies`). Il ne sert qu'avec `b2b_place_order:write` : seul, il
n'ouvre aucun écran (cf. `COUNTER_ORDER_GUARDS`). Voir
[`../comptoir/architecture-commande-au-comptoir.md`](../comptoir/architecture-commande-au-comptoir.md).

## `b2b_supervision` — Supervision

La vue du jour, de la passation au retrait
([`../supervision/architecture-supervision-du-jour.md`](../supervision/architecture-supervision-du-jour.md)).

| Méthode et chemin                                                             | Exige                                                                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /admin/supervision/day`, `/version`                                      | `b2b_supervision:read` (commerce)                                                            |
| `GET /admin/supervision/handover`                                             | `b2b_supervision:read` (retrait)                                                             |
| `GET /admin/supervision/preparation`, `/production-version`                   | `b2b_supervision:read` (fournil)                                                             |
| `GET /admin/packing/:date/board`                                              | `production_packing:read` **ou** `b2b_supervision:read`                                      |
| `GET /admin/supervision/quality`                                              | `b2b_supervision:read`                                                                       |
| `GET /admin/supervision/quality/checks`, `…/checks/:checkId/photos/:position` | `b2b_supervision:write` (décision D3 : l'historique des verdicts est réservé à qui contrôle) |
| `POST /admin/supervision/quality/photos`, `…/checks`                          | `b2b_supervision:write`                                                                      |

**Back-office** : `/supervision` (garde `b2b_supervision:read`) ; le bouton
« Contrôler » (`QUALITY_WRITE = 'b2b_supervision:write'`).

**Graine** : `admin` seul (en `W`). Aucun autre rôle.

## `handover_counter` — Retrait au comptoir

Contrôleur `HandoverController`
(`apps/lfd-api/src/handover/http/handover.controller.ts`), monté sous **deux**
préfixes : `/admin/handover` et `/admin/production/handover`.

| Méthode et chemin          | Exige                                          |
| -------------------------- | ---------------------------------------------- |
| `GET …/file`               | `handover_counter:read` — la file du jour      |
| `GET …/order/:id`          | `handover_counter:read`                        |
| `GET …/:token`             | `handover_counter:read` — lire un QR           |
| `POST …/:token`            | `handover_counter:write` — attester le retrait |
| `POST …/manual/:reference` | `handover_counter:write` — retrait sans QR     |

Il ouvre aussi `GET /admin/orders/day-version` (en alternative à
`b2b_orders:read`).

**Back-office** : `/comptoir/retrait` et `/comptoir/reassort` (garde
`handover_counter:read`), `/retrait/:token` (garde `handover_counter:write`),
l'entrée de menu et le bandeau du comptoir (`can('handover_counter:read')`).

## `production_plan` — Plan du soir

| Méthode et chemin                                                         | Exige                  |
| ------------------------------------------------------------------------- | ---------------------- |
| `GET /admin/production/batch`                                             | `production_plan:read` |
| `GET /admin/production/version`                                           | `production_plan:read` |
| `GET /admin/production/forecast`                                          | `production_plan:read` |
| `GET /admin/production/batch/:date/compte-a-produire.pdf`, `/dossier.pdf` | `production_plan:read` |
| `GET /admin/production/batch/:date/due-thresholds`, `/status`             | `production_plan:read` |

Aucune route n'exige `production_plan:write` à ce jour : l'arrêt du plan en
est sorti (ci-dessous), et la graine ne l'accorde plus qu'à l'admin depuis le
2026-10-12. **Back-office** : `/prod-manager` (garde
`production_plan:read`) et son entrée de menu.

## `production_count_stop` — Arrêt du plan

| Méthode et chemin                          | Exige                                                |
| ------------------------------------------ | ---------------------------------------------------- |
| `POST /admin/production/batch/:date/close` | `production_count_stop:write` (`@RequirePermission`) |

Arrêter le plan fige le compte à produire : c'est la borne au-delà de laquelle
une commande ne s'annule plus. **Back-office** : le geste d'arrêt du
prévisionnel (`production/previsionnel`, `can('production_count_stop:write')`).

## `production_worksheet` — Fiche d'atelier

| Méthode et chemin                                                        | Exige                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /admin/production/batch/:date/sheets/:reference.pdf`                | `production_worksheet:read` (`@RequirePermission`) — la fiche d'une commande |
| `GET /admin/production/worksheet`, `/worksheet/current`, `/containers`   | `production_worksheet:read`                                                  |
| `PUT`/`DELETE`/`POST /admin/production/worksheet/…`, `…/containers/:sku` | `production_worksheet:write`                                                 |

Touche une commande par sa fiche PDF ; le reste est la production du jour.
**Back-office** : `/fournil` (garde `production_worksheet:read`).

## `production_packing` — Colisage

| Méthode et chemin                                                                                                                                      | Exige                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `GET /admin/production/packing/:reference`                                                                                                             | `production_packing:read`                                               |
| `GET /admin/packing/:date/orders/:orderId/proposal`, `/shareable-halves`                                                                               | `production_packing:read`                                               |
| `POST /admin/packing/:date/orders/:orderId/containers…` (créer, poser une ligne, retirer, transférer, annuler un contenant, appliquer une proposition) | `production_packing:write`                                              |
| `POST /admin/packing/:date/orders/:orderId/close`, `/reopen`                                                                                           | `production_packing:write` — clore / rouvrir le colisage d'une commande |
| `GET /admin/delivery/packing/bins/:binId`, `GET …/colisage/tournees`                                                                                   | `production_packing:read` **ou** `delivery_loading:read`                |
| `GET /admin/delivery/packing/bins`, `POST …/bacs/:binId/annulation`                                                                                    | `production_packing:write` **ou** `delivery_loading:write`              |

**Back-office** : `/colisage` (garde `production_packing:read`),
`/colisage/:reference` (garde `production_packing:write`), `…/bac/:binId` et
`…/etiquettes/:orderId` (l'un ou l'autre droit), et les boutons du tableau des
contenants (`can('production_packing:write')`). Voir
[`../colisage/colisage.md`](../colisage/colisage.md).

## `production_settings` — Réglages du fournil

`GET /admin/production/settings` (`read`), `PUT …/close`, `POST …/closed-days`,
`DELETE …/closed-days/:date` (`write`). Le mode et l'heure d'arrêt décident
quand une commande cesse d'être annulable et entre au compte à produire.
**Back-office** : la page des réglages de production
(`can('production_settings:write')`), et l'affichage des heures dans le
prévisionnel (`can('production_settings:read')`).

## `delivery_proofs` — Preuves de livraison

| Méthode et chemin                                              | Exige                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /admin/orders/:id/delivery-proof`, `/photo`, `/signature` | `delivery_proofs:read` (`DELIVERY_PROOF_PERMISSION`, qui **remplace** `b2b_orders:read`) |

**Back-office** : la carte de preuve du détail (`commandes/handover-proof-card`) ;
le service ne l'appelle que si `can(DELIVERY_PROOF_PERMISSION)`.

Les autres droits de livraison (`delivery_doorstep`, `delivery_driving`,
`delivery_rounds`, `delivery_loading`…) agissent sur une tournée ou un bac, pas
sur une commande ; seul `delivery_loading` est cité ici, parce qu'il partage
les routes des bacs avec le colisage.

## `b2b_order_waivers` — Dérogations d'heure limite

| Méthode et chemin                            | Exige                     |
| -------------------------------------------- | ------------------------- |
| `GET /admin/order-cutoff-waivers/:companyId` | `b2b_order_waivers:read`  |
| `POST /admin/order-cutoff-waivers`           | `b2b_order_waivers:write` |
| `DELETE /admin/order-cutoff-waivers/:id`     | `b2b_order_waivers:write` |

**Back-office** : la saisie de commande propose la dérogation si
`can('b2b_order_waivers:write')` (`nouvelle-commande-page.ts`).

## `b2b_settings` — Ouverture de la boutique et heures limites

Deux surfaces de commande vivent sous les réglages de la plateforme :

| Méthode et chemin                                              | Exige                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /admin/order-opening`                                     | `b2b_settings:read`                                                       |
| `PATCH /admin/order-opening`                                   | `b2b_settings:write` — ouvrir / fermer la prise de commande par clientèle |
| `GET /admin/order-cutoffs`                                     | `b2b_settings:read`                                                       |
| `POST /admin/order-cutoffs`, `DELETE /admin/order-cutoffs/:id` | `b2b_settings:write` — les heures limites                                 |

**Back-office** : `/b2b/reglages/ouverture-boutique` et
`/b2b/reglages/heures-limites`, sous la garde du bloc `/b2b`
(`b2b_settings:read`). Voir
[`../order/ouverture-de-la-boutique.md`](../order/ouverture-de-la-boutique.md) et
[`../order/architecture-heure-limite-de-commande.md`](../order/architecture-heure-limite-de-commande.md).

L'accès aux fonctionnalités (`b2b_feature_access`) n'ouvre **pas** la boutique :
son catalogue ne porte que `customerMandate` et `facebookLogin`
(`packages/contracts/src/feature-access.levels.ts`, vérifié le 2026-10-12).

<a id="reglement"></a>

## Règlement — `b2b_accounting`, `b2b_deferred_payment_block`, `b2b_late_fee`

| Méthode et chemin                                                | Exige                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `GET /admin/accounting/payment-links/orders`                     | `b2b_accounting:read` — les commandes à régler        |
| `POST /admin/accounting/payment-links/orders/:orderId/resend`    | `b2b_accounting:write` — renvoyer le lien de paiement |
| `GET /admin/accounting/orders/:orderId/invoices`                 | `b2b_accounting:read` — les factures d'une commande   |
| `POST /admin/accounting/card-invoices/:orderId/retry`            | `b2b_accounting:write`                                |
| `GET /admin/accounting/direct-debit-blocks`                      | `b2b_accounting:read`                                 |
| `POST`/`DELETE /admin/accounting/direct-debit-blocks/:companyId` | `b2b_deferred_payment_block:write`                    |
| `GET`/`PUT`/`DELETE /admin/order-late-fee`                       | `b2b_late_fee:read` / `write`                         |

**Back-office** : la carte des factures sur le détail d'une commande
(`can('b2b_accounting:read')`), « Commandes à régler »
(`can('b2b_accounting:write')`), « Blocages du prélèvement »
(`can('b2b_deferred_payment_block:write')`), `/comptabilite/surtaxe-de-retard`
(garde `b2b_late_fee:read`, bouton `can('b2b_late_fee:write')`).

**Le rappel de règlement n'est pas un droit** : `POST
/admin/orders/settlement-reminders` est une porte machine (`RecomputeGuard`,
cron du Worker), sans `@AdminSurface` ni personne derrière.

**Le remboursement n'est pas un geste du back-office** : aucune route ne
rembourse (grep `refund|rembours` sur les contrôleurs, 2026-10-12) ; les
remboursements arrivent par le webhook Stripe, et le détail d'une commande les
affiche en lecture sous `b2b_orders:read` (`order-refunds-card`).

---

## Écarts constatés

Relevés le 2026-10-12, et **corrigés le même jour** (sauf le 6, assumé).
Chacun était un bouton ou un écran qui s'affichait alors que l'API refuserait
— le serveur tenait, l'écran mentait. La règle de correction : un bouton ne
promet jamais un geste que le serveur refusera ; il est caché quand
`PermissionsStore.can(...)` ne tient pas le droit qu'exige la route. Aucun
droit exigé côté API n'a changé.

1. **« Passer une commande » sur la fiche client.** Corrigé le 2026-10-12 :
   `fiche-client/commandes/commandes-page` ne montre le lien qu'avec
   `can('b2b_place_order:write')` (une spec le tient).
2. **Le rappel de retrait depuis la file.** Corrigé le 2026-10-12 :
   `handover-shop-page` lit `can('b2b_orders:write')` et le passe à
   `queue-table` (`canRemind`) ; sans lui, le retard reste dit sous la ligne,
   sans bouton ni phrase sur le rappel (une spec le tient).
3. **Le bon PDF depuis la file.** Corrigé le 2026-10-12 : le panneau
   `handover-shop/sheet-panel` n'offre le téléchargement qu'avec
   `can('b2b_orders:read')` (une spec le tient).
4. **Le simulateur de prix appelle une route de saisie.** Corrigé le
   2026-10-12 : sans `b2b_place_order:write`, `/b2b/tarification/simulateur`
   remplace le banc de devis par une `fold-callout` qui nomme le droit
   manquant (« Passer une commande pro » en écriture), et `run()` ne lance
   aucun devis (une spec le tient). La projection d'engagement,
   qui passe par une autre route, reste à l'écran.
5. **Ouverture de la boutique et heures limites.** Corrigé le 2026-10-12 :
   `order-opening-page` cache les bascules, et `cutoffs-section` cache
   « Ajouter une règle », « Modifier » et « Supprimer », sans
   `can('b2b_settings:write')` ; l'état et les règles restent lisibles (une spec le tient).
6. **`b2b_orders:write` ne protège plus qu'un rappel — assumé.** Depuis la
   sortie des gestes (2026-10-01) puis de l'annulation (2026-10-12), la seule
   route qui l'exige est `POST /admin/orders/:id/pickup-reminder`. Ce n'est pas
   un défaut : « Commandes » en écriture donne ce rappel et rien d'autre, et
   c'est voulu — à garder en tête en réglant un rôle à `/admin/staff-roles`.
7. **`production_plan:write` n'ouvre aucune route.** Corrigé le 2026-10-12
   dans la **graine seule** (`ROLE_GRANTS`, `packages/contracts`) :
   `commercial`, `comptabilite` et `comptoir` y reçoivent `production_plan`
   en `read` (la lecture ouvre le plan, le prévisionnel et leurs PDF) ;
   l'admin garde `write`, il couvre tout. En production, rien ne change par
   là : les droits se règlent à `/admin/staff-roles`, et aucune migration
   n'y touche.
