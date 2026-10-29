# Plan : la déclinaison par défaut se vend sous sa propre référence

> 📐 **Révision 2 du 2026-10-29. Elle remplace la révision 1, écrite le même jour, et intègre le § 6 de `vitruve`.** La raison est un fait nouveau donné par Hugo : « personne n'a encore de tarif négocié ». Aucune mercuriale, règle, plancher, palier, promotion, modèle de prix ni engagement ne vise aujourd'hui une référence de vente en production. La migration des décisions tarifaires disparaît donc. Un **garde-fou** la remplace : il compte et refuse, il ne déplace rien.
>
> La décision ne change pas : « B pour de bon ». Désormais `shopSkuOf(item) = item.sku` pour toute déclinaison, et le modèle reste à plat. Ce plan fait suite à [`plan-pro-voit-les-declinaisons.md`](plan-pro-voit-les-declinaisons.md) et à [`plan-declinaisons-en-vignette.md`](plan-declinaisons-en-vignette.md). **Rien n'est bâti.** Le chantier touche encore à l'argent : le garde-fou et la portée `product:` sont en jeu. Il passe donc par `vitruve` (CLAUDE.md § 9 bis), puis par `lecteur-de-migrations` pour chaque migration. Le code a été ouvert le 2026-10-29.

## 0. Le problème

`shopSkuOf` rend `item.isDefault ? item.productSku : item.sku` (`apps/lfd-api/src/b2b/catalog/domain/shop-sku.ts:13-19`). La référence produit veut donc dire « le défaut du moment ». Depuis le geste G4, tout ce qui est posé sur `PAI-001` glisse vers la nouvelle déclinaison. Et tout ce qui visait la déclinaison promue devient orphelin.

**Cible.** `shopSkuOf(item) = item.sku`. La référence produit n'est plus une référence de vente. Elle ne reste qu'une **clé d'entrée ancienne**, résolue par une table d'alias. Tout regroupement passe par cet alias, **jamais par `product_sku`**. Regrouper par `product_sku` fusionnerait `PAI-001-1` et `PAI-001-2`, deux articles distincts du modèle à plat (§ 6, BLOQUANT 1).

**Le passé n'est pas réécrit.** Lignes de commande, bons, colisages, historique des prix, constats d'alerte et compteurs `growth` gardent `PAI-001`. Ce sont les lecteurs qui traduisent.

**Portée.** Tout produit a au moins une déclinaison `-1`. Après la bascule, **chaque** référence produit cesse donc d'être vendue, et pas seulement celles des produits à plusieurs déclinaisons (§ 6, SÉRIEUX 1). Le garde-fou et l'alias couvrent tous les produits.

## 1. Le garde-fou tarifaire (remplace l'ancienne migration des décisions)

### 1.1 Ce qu'il compte

Il compte toute décision dont la cible est une **référence produit**, c'est-à-dire une valeur présente dans `catalog_item.product_sku` et absente de `catalog_item.sku`. Les tables visées sont dans `apps/lfd-api/prisma/schema/public/pricing.prisma` :

| Décision                                      | Modèle (ligne)                                    | Champ lu                                            |
| --------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Règles (mercuriale, volume, promotion, geste) | `PriceRule` (:17, portée :29-30)                  | `scope_type IN ('product','variant')` et `scope_id` |
| Planchers                                     | `PriceFloor` (:118, :123-124)                     | idem                                                |
| Paliers                                       | `VolumeLadder` (:221, :228-229)                   | idem                                                |
| Engagements                                   | `VolumeCommitment` (:442, :451-452)               | idem                                                |
| Mercuriales clients                           | `CompanyMercuriale` (:289, grille jsonb :303-313) | chaque `lines[].sku`                                |
| Brouillons de mercuriale                      | `MercurialeDraft` (:372, jsonb :383-388)          | chaque `lines[].sku`                                |
| Modèles de prix                               | `PriceTemplate` (:398, jsonb :407-416)            | chaque `lines[].sku`                                |

Deux exclusions :

- `PricingEvent` (:506) est un journal. Il ne décide de rien et n'est pas compté.
- Les portées `global` et `category` ne visent aucune référence. Elles ne sont pas comptées.

Il compte aussi les entrées `product.default_variant_changed` (`apps/lfd-api/src/pim/journal/pim-journal.ts:315`) qui précèdent la bascule (voir § 2).

### 1.2 Ce qu'il fait

Il compte **avant toute écriture**. S'il trouve une seule décision, ou un seul changement de défaut, il s'arrête sur un refus nommé, par exemple « bascule-defaut refusée : 2 décisions tarifaires visent une référence produit (PriceRule product:PAI-001, CompanyMercuriale <id> ligne PAI-003) ». Rien n'est écrit et le déploiement s'arrête.

### 1.3 Comment : une migration Prisma qui lève

Le garde-fou est la **première instruction d'une migration Prisma de données**. Toute la migration est enveloppée dans une transaction explicite. Le garde-fou est un bloc procédural qui compte puis lève une exception. Les écritures de la bascule (§ 4) suivent dans le même fichier. Si l'exception part, la transaction s'annule.

Pourquoi une migration, et pas un script ni une garde au démarrage :

- **C'est le seul point placé avant le nouveau code.** `deploy_lfd_api.yml` joue `migrate deploy` juste avant `wrangler deploy` (`.github/workflows/deploy_lfd_api.yml:316-334`). Le commentaire de ce fichier le dit : un échec « bloque le déploiement — c'est le comportement voulu ». L'ancienne version reste alors en ligne, sur l'ancien schéma, avec des données intactes.
- **Une garde au démarrage de l'API arrive trop tard.** Les données sont déjà migrées, et refuser de démarrer, c'est une panne.
- **Un script à part peut être oublié.** Rien ne l'attache au déploiement du code qui en a besoin.

Prix à payer :

- Prisma n'enveloppe pas la migration dans une transaction ; la transaction doit donc être écrite dans le fichier.
- Un refus laisse la migration marquée en échec. Après correction, il faut `prisma migrate resolve --rolled-back` pour repasser (`lecteur-de-migrations` le vérifie).
- Une migration SQL n'écrit pas les `PricingEvent` du domaine. C'est sans objet ici, puisqu'aucune décision n'est déplacée.

### 1.4 Le complément à la saisie

Le garde-fou ne vaut qu'au moment de la migration. Pour qu'aucune décision n'apparaisse avant la bascule, ou pendant les quelques secondes entre `migrate deploy` et `wrangler deploy`, le lot L1 ferme deux choses à la saisie :

- la portée `product:`, pour tous les produits ;
- toute portée `variant:` ou ligne de mercuriale ou de modèle dont la référence est une référence produit.

Le refus est nommé. Personne n'a de tarif : la fermeture ne gêne personne aujourd'hui, et elle évite qu'un refus de bascule soit découvert au moment de déployer.

## 2. La chronologie des défauts : une table simple suffit, sous condition

Sans tarif, il n'y a plus de cumul d'engagement à recompter. Il reste quatre besoins.

**(a) Les rapports par article sur l'historique.** Sont concernés :

- les comptes du fournil `ProductionCount` (`apps/lfd-api/prisma/schema/production.prisma:347`, `@@unique([serviceDay, sku])` :375). C'est un SKU de vente (§ 6).
- la médiane `ProductNorm` sur six mois (`public/catalog.prisma:11-13`, `sku @id`) ;
- les habitudes (« comme d'habitude ») ;
- les compteurs `growth` (`growth.prisma:426`, `@@id([day, sku, …])` :435) ;
- les références des constats d'alerte (`public/alerts.prisma:98`, jsonb figé).

**(b) Le fournil du jour de la bascule.** Ce jour-là, des lignes `PAI-001` déjà passées côtoient des lignes `PAI-001-1`. Le lecteur agrège par `line.sku` (`apps/lfd-api/src/b2b/orders/infrastructure/prisma-expected-production.reader.ts:71-100`, clé l. 85-86). Sans alias, il sort deux lignes pour un même article.

**(c) Les entrées anciennes** (§ 5).

**(d) Les commandes ouvertes** (§ 6).

Les quatre ne demandent qu'une chose : savoir quelle déclinaison `PAI-001` désignait. **Si le défaut n'a jamais changé en production avant la bascule**, `PAI-001` a toujours désigné le défaut de la bascule. Une table **`sale_sku_alias(alias_sku, target_sku, written_at)`**, sans `valid_from`/`valid_to`, suffit alors. Il n'y a pas de chronologie à reconstruire depuis `CatalogVersion` (`public/catalog.prisma:530`). Le BLOQUANT 2 du § 6 tombe.

**La condition se vérifie et se fait respecter dans le garde-fou lui-même.** Il compte les entrées `product.default_variant_changed` du journal du référentiel et refuse s'il en trouve une seule. C'est le même refus nommé, avec le produit et la date.

- G4 est livré du 2026-10-29. Si Hugo s'en est servi en production, le refus le dira. On choisira alors (Q2) entre deux voies : ajouter une plage datée à la table pour les seuls produits touchés, ou constater que le changement est resté sans commande entre-temps.
- Après la bascule, G4 ne déplace plus rien. La condition n'a donc à tenir que jusqu'à la migration, et le garde-fou la contrôle à cet instant précis. Aucun gel de G4 n'est nécessaire.

Ce qui reste à faire : le nom de la table du journal du référentiel. Je ne l'ai pas lu. `pim-journal.ts:158` dit « une seule table » sans la nommer dans les lignes ouvertes.

## 3. Les magasins et lecteurs qui réimplémentent la règle (code ouvert le 2026-10-29)

On compte 43 fichiers hors tests qui lisent `productSku` ou appellent `shopSkuOf`. Ceux qui **réimplémentent** la règle « le défaut se vend sous la référence produit » sans passer par `shopSkuOf` :

| Fichier:ligne                                                                     | Ce qu'il fait                                                                       | Sort                                                                                                                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `b2b/catalog/infrastructure/catalog-sellable-articles.reader.ts:39-46`            | indexe le défaut par `productSku`, `sku: item.productSku`                           | passer par `shopSkuOf`                                                                                              |
| `b2b/recommendations/infrastructure/catalog-suggestion-catalogue.ts:28-29`, `:45` | même patron ; l'éditeur des suggestions propose `sku: item.productSku`              | passer par `shopSkuOf`                                                                                              |
| `b2b/catalog/infrastructure/shop-sku-filter.ts:10-12`                             | `productSku IN … AND isDefault` OU `sku IN … AND NOT isDefault AND variantsAsTiles` | une seule branche `sku IN …`, plus la résolution d'alias en amont                                                   |
| `b2b/recommendations/infrastructure/catalog-not-served-cause.reader.ts:26-37`     | filtre les articles par `item.productSku === sku`                                   | lire par `sku` après passage par l'alias                                                                            |
| `b2b/pricing/infrastructure/prisma-pricing-board.reader.ts:141-145`               | le commentaire pose que SKU de vente et SKU produit « coïncident pour le défaut »   | après la bascule, ce n'est plus vrai : lire l'historique par `sku` (L1 du plan précédent) ; réécrire le commentaire |
| `b2b/catalog/application/queries/published-catalog-view.ts:65`, `:78`             | choisit la tête de fiche par `isDefault` et expose `productSku`                     | à garder : c'est une fiche, pas une vente. À relire pour la clé de tuile                                            |
| `dev/seeding/orders.seed.ts:245`, `:301`, `:321`                                  | sème des commandes sous `productSku` du défaut                                      | suivre `shopSkuOf` (sinon le seed crée des lignes à alias)                                                          |

Le froid passe déjà par `shopSkuOf` (`b2b/catalog/infrastructure/prisma-catalog-cold.reader.ts:19-24`). L'ancien L0 est fait. Il basculera seul avec `shopSkuOf`.

Les magasins de configuration, clés par SKU de vente, sont **réécrits dans la migration de bascule**. C'est sans danger de collision : avant la bascule, la référence `-1` d'un défaut n'est jamais vendue.

- `ProductionContainer.sku @id` (`production.prisma:500-501`)
- `ProductionBatchShortcut.sku` (`production.prisma:926-929`)
- les bacs `DeliveryBinCapacity` `@@id([binTypeId, sku])` (`delivery.prisma:693-701`)
- `StaffSuggestionRule.suggestedSkus` (`public/staff-suggestions.prisma:26`)
- les abonnements `SubscriptionLine.sku` (`public/subscriptions.prisma:77`) et `SubscriptionOccurrence.lines` jsonb (`:58`, occurrences à venir seulement)
- les lots `BundleChoice` `@@id([bundleId, sku])` (`public/bundles.prisma:57-62`)
- `ProductNorm` : réécrire la clé, ou recalculer en lisant par alias
- `production_count` des jours de service ≥ jour de bascule

Restent **figés et lus par alias** : lignes de commande, bons, colisage, `growth`, alertes, `production_count` des jours passés, historique des prix.

## 4. L'atomicité code + données

La migration (garde-fou, écriture de `sale_sku_alias`, réécriture des magasins du § 3) et `shopSkuOf = item.sku` partent **dans le même déploiement**. Le workflow ne laisse que quelques secondes entre les deux (`deploy_lfd_api.yml:320-322`). Dans cette fenêtre, l'ancien code peut encore écrire une ligne `PAI-001`. Ce n'est pas grave, à une condition : **les lecteurs passent déjà par l'alias**, livré au lot précédent avec une table vide, donc sans effet. C'est le patron « étendre / basculer / resserrer » du même fichier (`:324-327`).

La migration est **transactionnelle**. Elle est aussi **rejouable** : insertions sans doublon, réécritures conditionnées à l'absence de la cible. Le garde-fou refait le contrôle de conflit au moment même, ce qui règle le BLOQUANT 3 du § 6.

## 5. Les entrées anciennes

| Entrée                                  | Où                                                                                                                        | Traitement                                                                                                                                                                                                                                                                                                                                                 | Durée de vie                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Panier navigateur                       | `localStorage` (`apps/lfc-ecommerce-frontend/src/app/client/local-store.ts`), `cart.store.ts`                             | 🔴 `keepOnly` (`client/cart/cart.store.ts:284-295`) **jette en silence** toute référence absente du catalogue reçu. Il est appelé par `client-cart.service.ts:78`. Sans rien changer, un panier `PAI-001` serait vidé avant que le serveur voie la référence. Le catalogue servi expose donc la table d'alias, et le front **normalise avant `keepOnly`**. | voir Q1                              |
| Panier serveur                          | `ShopCart.payload` jsonb (`public/orders.prisma:1067-1071`)                                                               | alias à la lecture, réécrit à la prochaine écriture ; pas de migration du JSON                                                                                                                                                                                                                                                                             | voir Q1                              |
| Brouillon staff                         | `OrderDraft.payload` jsonb (`orders.prisma:1025-1028`)                                                                    | idem                                                                                                                                                                                                                                                                                                                                                       | voir Q1                              |
| `POST /orders`, devis, rejeu idempotent | résolution `prisma-catalog.reader.ts:168`                                                                                 | une référence produit est résolue par `sale_sku_alias`, **pas** par le défaut courant ; la réponse renvoie la référence normalisée ; chaque résolution est comptée                                                                                                                                                                                         | voir Q1                              |
| Lien de fiche                           | `boutique/${PRODUCT_SEGMENT}/:${PIECE_SKU_PARAM}` (`app.routes.ts:295`, paramètre `sku` : `client/shop/piece-route.ts:6`) | le paramètre est déjà une référence de vente : un `PAI-001` reçu est résolu par l'alias, puis l'adresse est remplacée sans nouvelle entrée d'historique                                                                                                                                                                                                    | permanent (coût nul, liens partagés) |
| Flux XML de la vitrine                  | `b2b/vitrine/http/vitrine-representation.ts`, `xml/xml-writer.ts` ; `public/vitrine.prisma:66` (`item` = sku)             | les clés `item` publiées sont réécrites dans la migration ; le flux sort la nouvelle référence                                                                                                                                                                                                                                                             | pas d'alias (voir Q3)                |

**Normalisation.** Elle se fait toujours vers `target_sku` de la table, jamais vers le défaut courant. Si G4 a joué depuis, un vieux panier ne glisse donc pas.

## 6. Les commandes ouvertes au moment de la bascule

Elles gardent `PAI-001` tant qu'on n'y touche pas. Le fournil et le colisage les lisent par alias (§ 2 b). **À la prochaine édition**, chaque ligne à alias est normalisée vers `target_sku` et tracée dans `order_revision_entry` (`orders.prisma:554`). Si la commande porte déjà `PAI-001-1`, les deux lignes fusionnent (quantités additionnées), ce qui respecte `@@unique([orderId, sku])` (`orders.prisma:738`). C'est l'option Q4 (b) de la révision 1. Le § 6 impose la seule qui tienne.

## 7. Lots (un lot = un commit, ordre sûr, chacun déployable)

**L1 `feat(catalog)` : la lecture par alias, avant toute bascule.** 🟩 **Bâti le 2026-10-29, en partie** (non commité à l'écriture de cette ligne) — ce qui est fait, ce qui ne l'est pas et pourquoi : § 11. Ce lot comprend :

- la migration de **schéma** de `sale_sku_alias`, laissée vide ;
- un canonicaliseur unique, utilisé par tous les regroupements : fournil attendu et `ProductionCount`, `ProductNorm`, habitudes, `growth`, alertes, classement des lignes ;
- l'alias en entrée (§ 5) ;
- une règle unique pour les lecteurs du § 3 ;
- l'exposition de la table au front ;
- la fermeture à la saisie du § 1.4.

Table vide : aucun effet visible. Tests :

- avec une table de test `P-X → P-X-1`, le fournil d'une journée mixte sort une seule ligne par article ;
- une portée `product:` est refusée à la saisie.

**L2 `feat(lfc-ecommerce)` : le front normalise.** 🟩 **Bâti le 2026-10-29** (non commité à l'écriture de cette ligne), avec l'alias en entrée laissé par le L1 — § 13.

- panier navigateur avant `keepOnly` ;
- panier serveur et brouillon staff par la référence renvoyée ;
- lien de fiche résolu et adresse remplacée.

Il est déployé par `deploy_lfc_boutique.yml` **avant** L3. Table vide : aucun effet. Test unitaire : un panier `P-X` devient `P-X-1` quand la table le dit, et n'est pas élagué.

**L3 `feat(catalog)!` : la bascule.** C'est le lot cassant. `vitruve` et `lecteur-de-migrations` sont obligatoires. Il comprend :

- une seule migration de données transactionnelle : garde-fou (§ 1, § 2), écriture de la table, réécriture des magasins du § 3 ;
- `shopSkuOf = item.sku` et la simplification de `shop-sku-filter.ts` ;
- la normalisation à l'édition (§ 6) ;
- la réécriture des commentaires : `shop-sku.ts:1-12`, `catalog.reader.ts:189-200`, `pricing-context.ts:20-24`, `prisma-pricing-board.reader.ts:141-145`.

Tests :

- **e2e** : un panier navigateur `PAI-001` posé avant le déploiement se commande encore et ressort `PAI-001-1` ;
- **e2e** : le fournil du jour de bascule (une commande `PAI-001` d'avant, une `PAI-001-1` d'après) ne sort qu'**une ligne** par article ;
- **intégration** : le garde-fou **refuse** et n'écrit rien s'il trouve une seule `PriceRule product:PAI-001`, une ligne de mercuriale `PAI-001`, ou une entrée `product.default_variant_changed` ; le refus nomme la décision ;
- non-régression : une commande passée `PAI-001` se relit, se colise et se facture sans changement ; une commande ouverte éditée fusionne ses lignes.

**L4 (date selon Q1) `chore(catalog)` : fin de l'alias d'entrée pour les paniers.** Il faut d'abord que le compteur de résolutions soit à zéro depuis 30 jours. La table reste, pour les lecteurs de l'historique et pour les liens.

## 8. Questions fermées à Hugo

1. **Durée de vie de l'alias d'entrée** pour les paniers, les brouillons et `POST /orders` : (a) 30 jours, (b) 90 jours, (c) permanent. _Reco : (b)_, coupé quand le compteur est à zéro depuis 30 jours. Les liens de fiche et les lecteurs d'historique gardent l'alias à vie.
2. **Si le garde-fou trouve un changement de défaut G4 déjà joué en production** : (a) ajouter une plage datée à la table pour les seuls produits touchés, (b) remettre le défaut d'origine avant la bascule, puis rejouer G4 après. _Reco : (b)_ : la table reste simple, et G4 après la bascule ne déplace plus rien.
3. **Flux XML de la vitrine** : y a-t-il un consommateur externe (Merchant, comparateur) qui garde l'identifiant d'article ? (a) non, l'identifiant change sans alias, (b) oui, on garde une correspondance publiée. _Reco : (a)_, sous réserve de la réponse.

## 9. Ce qui n'est pas vérifié

- Le nom et la forme de la table du journal du référentiel, donc la requête exacte du garde-fou sur `product.default_variant_changed`. Le PIM vit-il dans la même base que `public` ? `ProductNorm` dit « autre db » (`public/catalog.prisma:12`). Si la base est différente, le garde-fou ne peut pas lire le journal en SQL : il faudra un contrôle préalable dans la CI.
- Les données réelles en production : nombre de décisions tarifaires (zéro selon Hugo), entrées de journal G4, paniers serveur ouverts. Le garde-fou les comptera ; personne ne les a lues.
- Le lecteur des « habitudes » : je ne l'ai pas localisé.
- Le contenu exact du flux XML (`vitrine-representation.ts`) et son identifiant d'article.
- Les avoirs : `public/order-refund.prisma` existe, alors que le § 6 de la révision 1 disait « aucun avoir stocké ». À relire pour savoir s'il lit le catalogue par SKU.
- Le détachement d'une déclinaison, qui change de SKU (§ 6, SÉRIEUX) : il n'est pas traité ici. Il faudra une seconde entrée dans la même table, à bâtir avec le geste de détachement.
- Le calcul de `ProductNorm` : le recalculer par alias est-il moins risqué que réécrire la clé ?
- Les clés de tuile de la vitrine (`storefront-rows.ts:130-131`, `catalog-backed-storefront-catalog.reader.ts:48-51`) sous la nouvelle référence.

### Fichiers critiques

- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/catalog/domain/shop-sku.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/catalog/infrastructure/shop-sku-filter.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/prisma/schema/public/pricing.prisma
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/orders/infrastructure/prisma-expected-production.reader.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfc-ecommerce-frontend/src/app/client/cart/cart.store.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/.github/workflows/deploy_lfd_api.yml

> **Note du 2026-10-29** sur le § 9, premier point : le référentiel et le
> commerce vivent dans **une seule base** (CLAUDE.md § 1 : « une seule base, une
> seule URL, un seul client Prisma ») ; le commentaire « autre db » de
> `ProductNorm` est antérieur à B4. Le garde-fou peut donc lire le journal du
> référentiel en SQL, dans la même migration.

## 10. Contradiction de la révision 2 (vitruve, 2026-10-29) et décisions prises

Décisions prises par Claude sous le mandat de Hugo du 2026-10-29 au soir
(« finir tous les plans, point à la fin ») — **à revoir au point final** :

- **D-a. La bascule ne se fait jamais sur une journée ouverte.** Le garde-fou
  du L3 refuse aussi s'il trouve une journée de fournil ou de colisage non
  close portant une référence produit (`production_day`, `packing.*`), au lieu
  de réécrire ces tables : `production → b2b` et `packing → b2b` sont interdits,
  et les fournées, stocks et réservations du jour (`ProductionOrderLine`,
  `ProductionBatch`, `PackingStock @@id([serviceDay, sku])`…) ne savent pas
  lire un alias. On bascule un jour sans service ouvert.
- **D-b. Le changement de défaut (G4) est fermé dès le L1**, jusqu'à la
  bascule : un seul usage après L1 ferait échouer L3 au déploiement. Refus
  nommé (« le changement de déclinaison par défaut revient après la bascule de
  la référence du défaut ») ; le bouton est désactivé avec la même phrase.
  Rouvert par L3, où il ne déplace plus rien. En dev, la base porte déjà des
  `product.default_variant_changed` : le geste en dev est écrit dans le L3
  (le garde-fou ne compte que la production — variable d'environnement — ou
  une commande de dev remet les défauts d'origine).
- **D-c. Le port `SaleReferenceUsage` (unité de vente « déjà utilisée ») lit
  la cible ET ses alias**, dès le L1 : sans cela, `PAI-001-1` redeviendrait
  modifiable alors que l'article a été vendu sous `PAI-001`.
- **D-d. La normalisation se fait au RECALCUL d'une commande ouverte**, pas
  seulement à l'édition (classement des lignes, remise retrait).
- **D-e. Le L3 n'est pas bâti ce soir.** C'est le seul lot cassant, sa
  fenêtre réelle entre migration et nouveau code dure une à deux minutes
  (`deploy_lfd_api.yml`, étape « Attendre que l'image neuve serve »), un échec
  de `wrangler deploy` après une migration réussie laisserait l'ancien code sur
  des données basculées, et un refus du garde-fou bloque tout déploiement de
  l'API jusqu'à un `prisma migrate resolve --rolled-back` à la main (phrase de
  runbook à écrire). Il attend Hugo, avec son retour arrière écrit.

Objections intégrées aux lots : magasins oubliés (`SiteStockAlert`,
`SiteResupplyLine`, `ResupplyReceiptLine`, `BakehouseResupplyDraft`,
`CatalogOperationOverride.hiddenSkus` à vérifier) ; réimplémenteur oublié
`prisma-withdrawn-shop-skus.reader.ts:34` (alimente le refus L5) ; 75 fichiers
lisent `productSku`/`shopSkuOf`, pas 43 ; les habitudes
(`list-my-usuals.handler.ts`, seuil de trois commandes que la scission ferait
passer dessous) ; D2 et la restauration peuvent-ils toucher le défaut — à
établir au L1 ; le journal du référentiel est `growth.activity_events`
(`type = 'product.default_variant_changed'`) ; les avoirs ne portent pas de
SKU (rien à faire) ; `BEGIN;` et `DO $$ … RAISE EXCEPTION` ont des précédents
dans les migrations du dépôt.

**Lots, version 3** : **L1** lecture par alias (table vide) — canonicalisation
au point d'implémentation des ports `production/channels/commerce/` et
`packing/…`, `SaleReferenceUsage` par alias, normalisation au recalcul,
fermeture de G4, portée `product:` fermée à la saisie, règle unique pour les
réimplémenteurs ; **L2** le front normalise avant `keepOnly` ; **L3** (attend
Hugo) la bascule.

## 11. Le L1 tel que bâti (2026-10-29)

**Fait.**

- La table `public.sale_sku_alias(alias_sku PK, target_sku, written_at)`, index
  sur `target_sku`, migration de schéma additive
  `20261029080000_les_alias_de_reference_de_vente` (`lock_timeout 5s`), VIDE.
- La canonicalisation unique : `SaleSkuAliases` (`b2b/catalog/domain/sale-sku-aliases.ts`,
  `canonical`, `spellingsOf`) et son port de lecture `SaleSkuAliasReader`
  (implémentation `PrismaSaleSkuAliasReader`), exporté par `CatalogModule`.
- Les regroupements par article : prévisionnel du fournil
  (`prisma-expected-production.reader.ts` → `expected-production-fold.ts`),
  classement des lignes (remise retrait, au recalcul — D-d), historique et
  norme des alertes (lecture et recalcul de `ProductNorm`), habitudes du
  client (`PrismaPurchaseHistoryReader`) et du back-office
  (`PrismaCustomerSkuReader`), compteurs `growth`, articles retirés (L5).
- D-c : `PrismaSaleReferenceUsage` compte la cible ET ses alias.
- D-b : `MakeVariantDefault` refuse par une porte (`DefaultVariantChangeGate`,
  reliée fermée), APRÈS les refus de l'agrégat ; le bouton du back-office est
  désactivé avec la même phrase. Le détachement et la restauration ne touchent
  pas le défaut (vérifié dans `product.ts` / `variant.ts` le 2026-10-29 : le
  défaut ne s'archive ni ne se détache, et `restore` ne pose pas `isDefault`) :
  rien à fermer.
- Règle unique : `catalog-sellable-articles.reader.ts`,
  `catalog-suggestion-catalogue.ts`, `orders.seed.ts` passent par `shopSkuOf` ;
  `shop-sku-filter.ts` et `prisma-withdrawn-shop-skus.reader.ts` sont nommés
  jumeaux en requête de `shopSkuOf` (ils basculent avec elle au L3) et
  reçoivent des références canoniques.

**Choix faits pendant le bâti.**

- Les deux `GROUP BY` faits en base (habitudes du client, recalcul de la
  norme) écrivent la règle en SQL (`LEFT JOIN sale_sku_alias`,
  `COALESCE(target_sku, sku)`) : la médiane et le seuil se calculent en base,
  le pli ne peut pas venir après. Partout ailleurs, la règle est `SaleSkuAliases`.
- Les compteurs `growth` se plient en mémoire : `growth × public` ne se joint pas.
- La fermeture de G4 est une politique de déploiement, pas un invariant de la
  fiche : elle est un port (porte fermée au L1, ouverte ou retirée au L3), et
  l'agrégat garde son geste éprouvé. L'e2e du geste réussi est remplacé par
  celui du refus ; il revient au L3.

**Pas fait, et pourquoi.**

- **La fermeture à la saisie du § 1.4 n'est PAS bâtie.** Elle ferme toute
  décision tarifaire sur toute déclinaison par défaut jusqu'au L3 (le défaut se
  vend sous sa référence produit, et sa propre référence n'est pas en vente) ;
  et l'écran de tarification, les limites de prix et le plancher par lot
  posent tous une portée `product:` (`tarification-page.ts:264`, `:285`,
  `limit-coverage.ts:108`, `bulk-floor-panel.ts:84`). La fermer sans basculer
  ces écrans sur `variant:` rend la tarification inutilisable, et une dizaine
  d'e2e de tarification (`admin-pricing`, `company-pricing`, `price-rules`…)
  posent `product:VIE-001`. À trancher par Hugo.
- **Le flux du jour au fournil (`DayOrdersReader` → `SitedDayOrders`) n'est
  pas canonicalisé.** Les feuilles, comptes et fournées d'une journée close
  après la bascule porteraient deux lignes pour un article ; mais le fournil et
  le colisage rendent ensuite des références au commerce (manquants,
  révisions, retraits), qui devraient retrouver la ligne `PAI-001` d'une
  commande sous `PAI-001-1`. Le plan ne dit pas ce chemin de retour. Les ports
  de `packing/channels/commerce/` que le commerce implémente ne regroupent rien
  par référence (vérifié le 2026-10-29) : rien à y faire.
- `catalog-not-served-cause.reader.ts` filtre toutes les déclinaisons d'une
  fiche par `productSku` : passer par `shopSkuOf` change son résultat
  aujourd'hui (le défaut seul au lieu de la fiche). Il bascule au L3.
- ~~L'alias en entrée (§ 5 : `POST /orders`, devis, compteur de résolutions) et
  l'exposition de la table au front ne sont pas bâtis~~ — bâtis le 2026-10-29
  avec le L2, § 13.
- Les messages `DefaultVariantNotDiscontinuableError` et
  `DefaultVariantNotDetachableError` désignent comme geste de sortie « Faire de
  cette déclinaison la déclinaison par défaut », fermé jusqu'au L3.

## 12. Décisions prises au point L1 (Claude, 2026-10-29, sous mandat — à revoir)

- **Le § 1.4 (fermer la portée `product:` à la saisie) est reporté au L3.**
  Aujourd'hui le défaut se vend sous la référence produit : fermer `product:`
  gèlerait toute décision tarifaire sur toute déclinaison par défaut jusqu'à
  une bascule qui attend Hugo, et les écrans de tarification (qui posent
  `product:` partout) seraient en 409. Le garde-fou du L3 suffit : il refuse la
  bascule si une décision existe, au lieu de l'empêcher d'exister.
- **Le flux du jour au fournil n'est pas canonicalisé au L1** : son chemin de
  retour vers le commerce (manques, révisions) n'est pas écrit. D-a (bascule
  hors journée ouverte) en tient lieu ; à revoir avec le L3.
- **Les deux refus du défaut** (« ne s'archive pas », « ne se détache pas »)
  ne renvoient plus vers le changement de défaut, suspendu : ils le disent.

## 13. L'alias en entrée et le L2, tels que bâtis (2026-10-29)

**Fait.**

- Une seule porte : `SaleReferenceIntake` (`b2b/catalog/application/sale-reference-intake.service.ts`),
  qui lit `SaleSkuAliasReader.around` et remplace chaque ancienne référence par
  la cible de la table. Appelée en tête de `OrderDrafting.draft` (les trois
  passations : client, saisie staff, boutique — APRÈS la clé d'idempotence, qui
  reste prise sur ce que le client a envoyé, donc un rejeu se reconnaît), du
  devis staff/client (`QuoteOrderHandler`), du devis boutique
  (`ShopCartQuoting.quote`), du panier gardé (écriture et relecture) et du
  brouillon staff (écriture et relecture). Les réponses portent la référence
  normalisée (lignes du devis, lignes écrites) : aucun champ de contrat de plus
  n'a été nécessaire de ce côté.
- Deux graphies d'un même article fusionnent par la fusion existante de la
  tarification (par référence).
- Le compte : port `SaleSkuAliasResolutionLog`, adaptateur en `warn` marqué
  `sale_sku_alias.resolved entry=<porte>` (gardé dans le tampon de la carte de
  santé). Un journal plutôt qu'une écriture : la moitié des portes sont des
  lectures.
- **Où se fera la coupure (L4, Q1 : 90 jours)** : retirer les appels à
  `SaleReferenceIntake` des portes panier, brouillon, passation et devis quand
  le compte est à zéro depuis trente jours. Les liens de fiche et les lecteurs
  de l'historique gardent l'alias à vie.
- La table publiée : `ShopCatalogueView.saleSkuAliases` (additif, optionnel à
  la lecture), lue par `SaleSkuAliasTableReader` dans `ShopCataloguePricing`.
- La boutique : `CartStore.normalize` avant `keepOnly` (quantités additionnées,
  unités figées suivant la référence, celle de la cible l'emporte),
  `ShopCatalogue.canonicalSku`, et `PieceAddress` qui remplace l'adresse d'une
  fiche ouverte sous un alias (`replaceUrl`).
- Budget du devis à froid (`test/pricing-budget.e2e-spec.ts`) : 8 opérations
  au lieu de 7, la lecture d'alias, comptée et datée dans le test. Le même
  jour, la lecture de plus du tri des unités périmées (commit d0b359c27) est
  retirée : le tri et le prix lisent une seule résolution du catalogue
  (`OrderLinePricing.resolveWithoutStaleUnits`).

**Pas fait.**

- La révision d'une commande et la demande de changement ne passent pas par la
  porte : c'est la normalisation à l'édition du § 6, au L3.
- La vitrine ne publie que la table entière ; aucune pagination (quelques
  centaines de lignes au plus après la bascule).
