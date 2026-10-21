# La limite de commande par article — état

> Doc d'état, écrite le 2026-10-21 à partir du code ouvert ce jour-là. Le
> pourquoi de l'échelle (héritage champ par champ, `NULL` ≠ « aucune limite »,
> place de l'écran) est au §5 et au §12 de
> [`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md).
> Entrée du dossier : [`README.md`](README.md).

Le délai propre à un article : « un gâteau d'anniversaire se sait deux jours
avant ». Il est réglé au **référentiel**, parce qu'il tient au temps de
production de l'article, et il s'oppose à **toutes** les clientèles.

## 1. Au référentiel

**Table** `pim.order_time_limit` (`OrderTimeLimit`,
`apps/lfd-api/prisma/schema/pim/sales-contexts.prisma`) : `scope_type`
(`global` | `category` | `product` | `variant`), `scope_id` (`NULL` si et
seulement si `global`), `days_before?` (`0` = le jour même), `time?` (`HH:MM`,
pendule de Paris), `grace_minutes?`. Une règle par portée, tenue par l'index
unique `order_time_limit_one_per_scope` posé en SQL.

**Échelle** : déclinaison → produit → famille la plus proche → … → racine →
global. **Chaque champ** prend la première valeur non nulle en descendant
(`resolveOrderTimeLimit`, `packages/catalog-sync/src/order-time-limit-resolution.ts`,
réexporté par `pim/order-time-limitation/domain/services/`). `NULL` veut dire
« ce rang ne se prononce pas », pas « aucune limite ». **Une limite n'existe
que si le délai ET l'heure sont résolus** ; la grâce vaut `0` si personne ne la
déclare.

**Écrans** (droit `pim_catalog`, routes `order-time-limits` GET/PUT/DELETE) :

- **Référentiel › Général › Limites de commande** (`/pim/limites-de-commande`,
  `OrderTimeLimitsPage`) — la liste des règles, tous rangs ; l'écran prévient
  quand aucune règle globale n'existe alors que d'autres rangs se prononcent ;
- la carte **« Limite de commande (liée au temps de production) »** de la fiche
  produit (`product-form/form-sections/order-limit/`) — elle montre la limite
  qui **s'applique** (`explainOrderTimeLimit`), avec sa provenance, pas
  seulement ce que l'article pose.

Réglages › Commandes › Heure limite y renvoie par un lien, sans rien en lire.

## 2. La propagation au commerce

`SetOrderTimeLimit` / `RemoveOrderTimeLimit` émettent, dans leur transaction,
le fait durable **`pim.catalog_rules_changed`**
(`pim/channels/b2b-platform/products/catalog-rules-changed.fact.ts`) : ce sont
les **règles** qui traversent, pas des limites résolues. Le commerce
(`OnCatalogRulesChangedHandler`, `b2b/catalog/application/handlers/`) les range
dans `public.catalog_rules` si le fait est plus récent (`applied_seq`), puis
`OrderLimitsRefresher` les **descend sur chaque article en vente** — colonnes
`CatalogItem.orderLimitDaysBefore` / `orderLimitTime` / `orderLimitGraceMinutes`.
Les faits d'une fiche et d'une famille redescendent aussi (un article reclassé
prend les limites de sa nouvelle famille). Avant tout fait de règles reçu, rien
ne bouge.

## 3. À la passation

`OrderDrafting.ensureNotTooLate` relit le catalogue sur les SKU du panier
(`resolveMany(skus, "pro")`) et passe à `ensureWithinOrderCutoff` la limite de
chaque ligne. **Un article qui porte une limite est jugé par elle seule** — la
règle générale du commerce ne le concerne plus, même si elle est plus stricte ;
puis la plus fermée du panier gagne ([`README.md`](README.md) §2). La limite
d'article garde sa grâce, ses dérogations et sa surtaxe, et ne dépend pas de
l'interrupteur de l'heure limite générale.

⚠️ Conséquence (vérifiée en dev le 2026-10-21) : dès qu'un **rang global** pose
délai et heure au référentiel, **tous** les articles portent une limite
d'article, et la règle générale du commerce ne décide plus de rien à la
passation — elle ne sert alors qu'à `/fulfillment-days` et à la comparaison du
§4. En dev, le rang global vaut « la veille, 18:00, grâce 60 min ». L'état du
référentiel en production n'a pas été lu.

## 4. Ce que sert la boutique (depuis `a1e1c62f5`, 2026-10-21)

`ShopItemView.orderTimeLimit` (`packages/contracts/src/shop-catalogue.ts`),
**facultatif** : `{ daysBefore, time }`, **jamais la grâce**. Posé par
`withOrderLimits` (`b2b/catalog/application/shop-catalogue-order-limits.ts`)
sur `/shop/catalogue` et `/shop/catalogue/mine`, à partir de la limite résolue
de l'unité vendue par défaut.

Il n'est servi que si la limite est **plus stricte** que la règle générale
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

## 6. Le compte à rebours qui nomme l'article

Quand une limite d'article du panier tombe **plus tôt** que l'`orderUntil`
général du jour dont parle la barre, c'est elle qui décide — la plus fermée du
panier, comme à la passation — et la phrase nomme l'article : « Plus que 1 h 40
pour commander Bûche pour jeudi. », « Pour jeudi, commandez Bûche avant 18 h. »
(`decideDayNotice`, entrée `cartLimits`, `service-day-notice.rules.ts`). Sans
règle générale, la plus fermée des articles décide. Le reste du compte à
rebours : [`reglages-generaux.md`](reglages-generaux.md) §6.

## 7. Ce qui reste

- **Une limite d'article déjà passée n'est pas dite** pour le jour accordé
  (une limite à deux jours, commandée pour demain) : la barre se tait, la fiche
  et la ligne disent le délai, et seule la passation refuse. Dire « trop tard
  pour cet article » au panier reste à décider.
- **L'article sans déterminant** : la phrase insère le nom tel quel
  (« commander Bûche ») ; aucun article (« la bûche ») n'est calculé.
- La comparaison « plus stricte » de la fiche ignore les règles par jour ou par
  point (§4) ; le compte à rebours, lui, compare au jour près.
