# La limite de commande par article — état

> Doc d'état, écrite le 2026-10-21 à partir du code ouvert ce jour-là. Le
> pourquoi de l'échelle (héritage champ par champ, `NULL` ≠ « aucune limite »,
> place de l'écran) est au §5 et au §12 de
> [`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md).
> Entrée du dossier : [`README.md`](README.md).

Le délai propre à un produit : « un gâteau d'anniversaire se sait deux jours
avant ». Il est réglé au **référentiel**, parce qu'il tient au temps de
production, et il s'oppose à **toutes** les clientèles.

🔴 **Depuis le 2026-10-21 (décisions de Hugo, [`schema-des-reglages.md`](schema-des-reglages.md) §4) :
une limite par PRODUIT, règle entière, sans rattrapage.** « Toute la
production » se règle au commerce ([`reglages-generaux.md`](reglages-generaux.md)) ;
une famille n'a plus de limite propre ; une déclinaison suit son produit ; le
seul rattrapage est celui de la règle générale.

## 1. Au référentiel

**Table** `pim.order_time_limit` (`OrderTimeLimit`,
`apps/lfd-api/prisma/schema/pim/sales-contexts.prisma`) : `scope_type`,
`scope_id`, `days_before`, `time` (`HH:MM`, pendule de Paris), `grace_minutes`.
Une règle par portée, tenue par l'index unique `order_time_limit_one_per_scope`.
Les colonnes n'ont pas changé ; ce qui a changé :

- **le domaine** (`OrderTimeLimit.set` / `reset`) refuse toute portée autre que
  `product` (`pim.order_time_limit.scope_retired`, 400, le message dit où se
  règle la générale), une limite sans délai OU sans heure
  (`pim.order_time_limit.incomplete`) et un rattrapage non nul
  (`pim.order_time_limit.grace_retired` — refusé plutôt qu'ignoré, pour qu'on ne
  croie pas avoir posé une grâce). Un rattrapage `0` s'enregistre `NULL` ;
- **la base** : la migration `20261021120000_une_limite_de_commande_par_produit`
  ajoute `order_time_limit_product_only` (`scope_type = 'product'`) et
  `order_time_limit_no_grace` (`grace_minutes` `NULL` ou `0`). Additive ; elle
  échoue si une ligne la viole (aucune en production, d'après Hugo le
  2026-10-21 ; en dev, les lignes « Toute la production » et « Viennoiseries »
  ont été retirées par `RemoveOrderTimeLimitCommand` le même jour, et le
  rattrapage d'une heure du Gros florentin remis à zéro par
  `SetOrderTimeLimitCommand`). **⚠️ À relire avant promotion.**
- **une ligne résiduelle** (globale, famille, déclinaison) se relit encore
  (`reconstitute`) pour pouvoir se retirer, mais ne se modifie plus, ne
  s'affiche plus (`ListOrderTimeLimits` ne rend que les produits), ne traverse
  plus (l'émetteur filtre) et ne s'applique plus (la résolution l'ignore). La
  garde qui refusait de retirer le global sous des règles qui en héritaient
  (`GlobalOrderTimeLimitStillNeededError`) est retirée : plus rien n'hérite.

**Résolution** (`resolveOrderTimeLimit`,
`packages/catalog-sync/src/order-time-limit-resolution.ts`, partagée par les
deux rives) : la règle du produit de l'article, si elle pose le délai ET
l'heure ; rattrapage toujours `0`. Rien d'autre n'est lu.

**Écrans** (droit `pim_catalog`) :

- **Référentiel › Général › Limites de commande** (`/pim/limites-de-commande`,
  `OrderTimeLimitsPage`) — en tête, la règle générale du commerce **en
  lecture** (« Toute la production : la veille à 18:00, rattrapage aucun — se
  règle dans Réglages › Commandes › Heure limite », avec le lien ; elle dit
  quand l'interrupteur la coupe ou qu'elle n'existe pas). Lue par
  `GET /pim/order-time-limits/general-cutoff` : la route du commerce est murée
  par `lfc_order_settings`, et `pim → b2b` est interdit — le référentiel déclare
  le port `GeneralOrderCutoffReader`
  (`pim/channels/b2b-platform/general-order-cutoff/`), le commerce
  l'implémente (`CommerceGeneralOrderCutoffReader`), `appBootstrap/
general-order-cutoff.module.ts` les relie. Puis la liste des produits qui ont
  une limite (modifier, retirer) ; plus de choix de portée, plus de « poser »
  ici ;
- la carte **« Limite de commande »** de la fiche produit
  (`product-form/form-sections/order-limit/`) — la limite du produit (délai,
  heure), ou « pas de limite propre » ; poser, modifier, retirer. Le panneau
  n'a plus ni portée, ni « hériter », ni rattrapage.

## 2. La propagation au commerce

`SetOrderTimeLimit` / `RemoveOrderTimeLimit` émettent, dans leur transaction,
le fait durable **`pim.catalog_rules_changed`**
(`pim/channels/b2b-platform/products/catalog-rules-changed.fact.ts`) : ce sont
les **règles** qui traversent, pas des limites résolues — et, depuis le
2026-10-21, les seules règles de produit (`B2bCatalogRulesEmitter` filtre). Le commerce
(`OnCatalogRulesChangedHandler`, `b2b/catalog/application/handlers/`) les range
dans `public.catalog_rules` si le fait est plus récent (`applied_seq`), puis
`OrderLimitsRefresher` les **descend sur chaque article en vente** (la règle de
son produit seulement, depuis le 2026-10-21) — colonnes
`CatalogItem.orderLimitDaysBefore` / `orderLimitTime` / `orderLimitGraceMinutes`.
Les faits d'une fiche et d'une famille redescendent aussi (un article reclassé
prenait les limites de sa nouvelle famille — sans effet depuis le 2026-10-21,
plus aucune famille n'en porte). Avant tout fait de règles reçu, rien
ne bouge.

## 3. À la passation

`OrderDrafting.ensureNotTooLate` relit le catalogue sur les SKU du panier
(`resolveMany(skus, "pro")`) et passe à `ensureWithinOrderCutoff` la limite de
chaque ligne. Depuis le 2026-10-21, une limite d'article **n'a jamais de
grâce** : la garde la force à `0` (`withoutGrace`,
`order-cutoff-guard.ts`), même si une grâce est encore rangée sur l'article —
passée l'heure, refus sec. 🔴 **La plus stricte gagne toujours** (décision de Hugo,
2026-10-21) : chaque ligne est jugée par la plus fermée entre la limite de
l'article (s'il en porte une) et la règle générale en vigueur pour ce jour et ce
point ; puis la plus fermée du panier gagne ([`README.md`](README.md) §2). Une
limite d'article plus tardive ne relâche donc jamais la règle générale. Seule
la règle générale a une grâce, et c'est pendant elle que la dérogation et la
surtaxe valent. Interrupteur de l'heure limite générale désactivé, il n'y a
plus de règle en vigueur, et seule la limite d'article compte.

Jusqu'au 2026-10-21, la limite d'article **remplaçait** la règle générale : un
rang global posé au référentiel la neutralisait à la passation. Ce rang n'existe
plus (§1).

## 4. Ce que sert la boutique (depuis `a1e1c62f5`, 2026-10-21)

`ShopItemView.orderTimeLimit` (`packages/contracts/src/shop-catalogue.ts`),
**facultatif** : `{ daysBefore, time }`, **jamais la grâce**. Posé par
`withOrderLimits` (`b2b/catalog/application/shop-catalogue-order-limits.ts`)
sur `/shop/catalogue` et `/shop/catalogue/mine`, à partir de la limite résolue
de l'unité vendue par défaut.

Il n'est servi que si la limite est **plus stricte** que la règle générale — ce
qui est, depuis le 2026-10-21, exactement le cas où elle change la décision de la
passation
(`shownItemOrderLimit` / `isStricterOrderLimit`,
`packages/contracts/src/item-order-limit.ts`) : son instant, pour un même jour
de service, tombe plus tôt — comparé en minutes de pendule avant le minuit du
jour de service. À égalité, rien.

**La règle générale comparée** est le défaut tous jours, tous points
(`generalOrderCutoff`) parmi les règles **en vigueur** (port
`ShopOrderCutoffsReader` lié à `OrderCutoffsInForce`) : interrupteur
désactivé, il n'y en a plus, et toute limite d'article se montre. Une règle
propre à un jour ou à un point n'entre pas dans la comparaison.

**La vitrine des agences** partage la vue (`VitrineItemView` dérive de
`ShopItemView`) : `/vitrine/*` sert aussi `orderTimeLimit`, en XML
`<orderTimeLimit><daysBefore/><time/></orderTimeLimit>`, facultatif dans le XSD
(`b2b/vitrine/http/xml/vitrine-xml-shapes.ts`).

## 5. La phrase, et ses trois formes

Sur la fiche produit et sous le prix de la ligne du panier
(`madeToOrderLabel`, `apps/lfc-ecommerce-frontend/src/app/client/shop/made-to-order.ts` ;
textes dans `copy/fr.ts`) :

| `daysBefore` | Phrase                                                                |
| ------------ | --------------------------------------------------------------------- |
| `0`          | « Préparé sur commande — à commander le jour même, avant 9 h »        |
| `1`          | « Préparé sur commande — à commander la veille, avant 18 h »          |
| `n ≥ 2`      | « Préparé sur commande — à commander 2 jours à l'avance, avant 12 h » |

Absente du flux, rien ne s'affiche : l'absence est la réponse.

## 6. Le compte à rebours d'un article du panier

Quand une limite d'article du panier tombe **plus tôt** que l'`orderUntil`
général du jour dont parle la barre, c'est elle qui décide — la plus fermée du
panier, comme à la passation. La phrase ne nomme pas l'article (Hugo,
2026-10-21 : la barre ne l'a pas sous les yeux, et un nom au milieu d'une
phrase oblige à gérer article et accord) : « Plus que 1 h 40 pour commander un
article de votre panier pour jeudi. », « Pour jeudi, commandez un article de
votre panier avant 18 h. » ; déjà passée : « Un article de votre panier : trop
tard pour jeudi, possible à partir de samedi. » (« 2 articles de votre
panier : … » s'il y en a plusieurs)
(`decideDayNotice`, entrée `cartLimits`, `service-day-notice.rules.ts`). Sans
règle générale, la plus fermée des articles décide. Le reste du compte à
rebours : [`reglages-generaux.md`](reglages-generaux.md) §6.

## 7. Ce qui reste

- **Une limite d'article déjà passée n'est pas dite** pour le jour accordé
  (une limite à deux jours, commandée pour demain) : la barre se tait, la fiche
  et la ligne disent le délai, et seule la passation refuse. Dire « trop tard
  pour cet article » au panier reste à décider.
- La comparaison « plus stricte » de la fiche ignore les règles par jour ou par
  point (§4) ; le compte à rebours, lui, compare au jour près.
