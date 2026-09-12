# La boutique lit l'API — et l'argent cesse d'avoir deux sources

**Ouvert le 2026-09-03. — 🟢 Livré le 2026-09-05.**

> **Ce que ce plan décrit est fait.** La boutique s'hydrate de
> `GET /shop/catalogue` en un point (`ShopCatalogue`), mock-shop.ts est
> supprimé, le panier compte en centimes et millicentimes entiers, et le seed du
> référentiel pousse jusqu'au miroir — 35 des 38 articles servis portent leur
> ligne de vitrine. Le corps du plan est conservé tel qu'il a été écrit : c'est
> le raisonnement qui vaut, pas l'état.
>
> Ce qui reste : les **packshots**. Le fil les transporte depuis la v8 et
> `showcaseOf` choisit par rôle, mais la base de développement ne porte qu'un
> visuel — il manque des photographies, pas du code.

> Ce plan touche **l'argent** et une **surface en ligne**. Chaque affirmation
> qu'il fait de l'existant a été ouverte dans le dépôt, pas rappelée de mémoire ;
> la liste des vérifications est en fin de document.

> **Qui pose une promotion**, et faut-il déplacer l'autorité du prix vers le
> référentiel, est tranché à côté — sans changer les lots 1 et 2 :
> [`decision-qui-pose-une-promotion.md`](decision-qui-pose-une-promotion.md).

---

## 1. Le fait qui commande tout

**Le prix que le client voit et le prix qu'il paie sont calculés deux fois, dans
deux unités, par deux codes qui ne se connaissent pas.**

|                           | ce qui fait foi                                       | où                                                                      |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Ce que le client **voit** | `price: 1.4`, `2.1`, `4.8` — flottants en euros       | client/mock-shop.ts (supprimé), `src/app/legacy/data/catalogue-seed.ts` |
| Ce qui est **facturé**    | `unitPriceMillicents`, entiers, résolus par le moteur | `order-line-pricing.service.ts`                                         |

Le front ne fait pas qu'afficher : il **calcule**. `cart-total.ts` compose le
sous-total, applique la remise, extrait la TVA du TTC et rend un total — « tous
les montants sont en euros ». Le serveur, lui, résout chaque ligne par la
mercuriale du client, les paliers de volume et les limites.

Un client au tarif négocié voit donc le **prix public** et se fait facturer **le
sien**. Ce n'est pas un écart d'arrondi : c'est un autre prix, par construction.
Et `CLAUDE.md` §3 dit « argent en centimes, entiers, jamais de flottant » — le
front l'enfreint sur toute la ligne.

C'est la maladie du double référentiel d'allergènes, refermée le même jour côté
back-office, mais posée sur le nombre auquel un client consent.

## 2. Ce qui est DÉJÀ là, et qui rend le chantier plus petit qu'il n'en a l'air

- **`POST /orders/quote`** existe, sur la surface **client**, et rend le prix
  négocié d'un panier — paliers et TVA compris. Il est **muré** : un client doit
  être membre de la société qu'il nomme, « sans quoi n'importe qui sonderait la
  mercuriale d'un concurrent en devinant son identifiant ».
- **`POST /orders`** re-résout les prix à la passation. Le serveur ne fait donc
  jamais confiance au panier.
- Le **miroir** `catalog_items` est alimenté par le PIM, et depuis peu **gardé**
  par la boîte de réception.
- `ListCatalogQuery` / `CatalogItemView` existent — mais exposés au **staff
  seulement** (`admin/catalog`, `@AdminSurface("b2b_orders")`).

**Ce qui manque vraiment est donc court** : une route catalogue pour le client,
et un front qui cesse de calculer.

## 3. Ce qui manque

### A. Aucune route catalogue côté client

La surface client porte `me`, `companies`, `orders`, `subscriptions`,
`appointments`, `content`, `delivery-zones`, `pickup-addresses`, `support`. **Pas
de catalogue.** Un client peut passer une commande mais ne peut pas demander ce
qui est en vente.

### B. L'éditorial ne voyage pas

L'instantané livré porte `sku`, `name`, `kind`, `categoryId`, `variants`, et par
déclinaison `priceMillicents`, `vatRatePercent`, `weightGrams`, `allergens`,
`allergenLabels`. **Ni description, ni visuel.** Le miroir n'a pas de colonne
pour les porter, et la vue servie n'a pas de champ. Les visuels de la boutique
sont des SVG **locaux au front** (`products/<image>.svg`).

Le PIM, lui, a `pim.product_editorial` et `pim.product_media` — l'éditorial
existe, il n'emprunte simplement pas ce canal.

## 4. L'ordre, et pourquoi cet ordre

**L'argent d'abord, l'éditorial ensuite.** Ce n'est pas une préférence :
l'argent est **faux** aujourd'hui, l'éditorial est seulement **absent**. Une
absence attend ; un prix qui ment se paie à chaque commande.

### Lot 1 — le catalogue du client, au prix du client

Une route `GET /catalog` sur la surface client, qui rend ce qui est en vente
**au prix que CE client paiera**.

🔴 **La décision qui structure tout le lot** : la route rend-elle le prix
canonique ou le prix négocié ?

- **Canonique** — simple, cachable, mais le panier corrigerait les prix au
  premier `quote`, et le client verrait ses prix **bouger sous ses yeux**. On
  aurait remplacé un mensonge par un sursaut.
- **Négocié** — la route se mure comme le devis (membre de la société), n'est
  pas cachable entre clients, et coûte une résolution par article. **C'est celui
  qu'il faut** : le prix affiché doit être celui qui sera facturé, sinon on n'a
  rien réglé.

Le moteur existe déjà et le devis le prouve. La route est une **lecture** :
elle n'écrit rien, elle ne mute rien.

#### Ce que la rangée AFFICHE — et le back l'a déjà tranché

`final-price` (écran de tarification) rend la règle, et la boutique la reprend :

```
<span class="from">   le canonique, BARRÉ — « sans lui, l'écart n'a pas de point de départ »
<span class="price">  le prix qui s'applique
<span class="delta">  l'écart, `is-up` quand ce n'en est pas une remise
```

Trois conséquences, toutes déjà écrites là-bas :

1. **Le barré n'apparaît que s'il y a un écart** (`@if (delta())`). Un client
   sans mercuriale voit **un seul prix**, le canonique — pas un prix barré sur
   lui-même, qui serait une fausse promotion.
2. **Chaque palier de volume est une résolution COMPLÈTE à cette quantité.** Le
   commentaire du back le dit : « pas un `canonique × (1 − remise)`, qui
   mentirait dès qu'une promotion compose avec le palier ». La boutique ne
   calcule donc **aucun** palier ; elle affiche ce que le serveur a résolu.
3. L'incitation est le barré, pas un badge : le prix d'entrée et le prix obtenu,
   côte à côte.

#### 🔴 Ce qui ne franchit PAS la frontière vers le client

`PricingItemView` porte exactement ce qu'il faut pour cet affichage —
`canonicalMillicents`, `finalMillicents`, `volumeTiers`, `floored`. Il porte
**aussi** ce qu'un client ne doit jamais voir :

| champ                             | ce qu'il révélerait                                |
| --------------------------------- | -------------------------------------------------- |
| `rules`, `supersededRuleIds`      | les noms et l'existence de tes règles commerciales |
| `steps`                           | le **chemin du prix** — chaque étage, chaque effet |
| `ownFloor`, `effectiveFloor`      | le plancher, c'est-à-dire **la marge**             |
| `sealedByRuleId`, `sealedRuleIds` | ce que la mercuriale a scellé, et contre quoi      |

La vue client est donc une vue **neuve et étroite**, pas `PricingItemView`
réexporté. Le mur du devis protège la mercuriale d'un concurrent ; celui-ci
protège la machinerie qui fabrique nos prix. Ce sont deux murs.

⚠️ **Ce paragraphe disait « le second n'a pas encore été posé parce qu'aucune
route client ne servait de prix ». C'était faux**, et ça l'était en écrivant :
`POST /orders/quote` est une surface client, et elle rendait `OrderQuoteView`
entière — `steps` (identifiant et **libellé commercial** de chaque règle, plus
les rivales évincées), `sealedByRuleId`, `sealedRuleIds`, `floorMillicents` (le
plancher, donc la marge) et `floored`. Aucun front ne l'appelait ; la route,
elle, était ouverte à qui porte un jeton.

✅ **Colmaté le 2026-09-04**, indépendamment de ce chantier :
`CustomerOrderQuoteView` et `toCustomerQuote` dans `@lfd/contracts`, une
conversion **explicite** champ par champ — un `omit` aurait laissé la vue
s'élargir en silence. Le cas e2e qui éprouvait le scellement a changé de porte
plutôt que de disparaître : il vit désormais sur `/admin/orders/quote`, où il a
un lecteur légitime.

🔴 **Et ça change le lot 2.** Il consiste à brancher la boutique publique sur
cette route : il l'aurait fait sur la réponse non rétrécie.

**La règle de tri** : un champ passe s'il répond à « combien ça me coûte, et à
partir de quelle quantité ça baisse ». Tout le reste reste au back-office.

#### Le modèle partagé s'étend d'un champ

`CatalogProduct` (`@lfd/b2b-ui/catalog`, consommé par les DEUX apps) porte
aujourd'hui un seul `price?: string`, déjà formaté. Il gagne le prix barré —
**optionnel**, absent quand il n'y a pas d'écart, ce qui fait de « pas de
promotion » l'état par défaut plutôt qu'un cas à traiter.

### Lot 2 — le front cesse de calculer

`cart-total.ts` disparaît au profit de `POST /orders/quote`. Le front affiche ce
que le serveur chiffre, et **n'a plus de prix en flottant** — les montants
arrivent en centimes et se formatent à l'affichage.

C'est le lot qui referme le sujet : après lui, il n'existe plus qu'**un seul**
code qui calcule un prix, et c'est celui qui facture.

### Lot 3 — l'éditorial voyage

Trois pièces, et la troisième est celle qu'on oublie :

1. la projection du canal PIM emporte l'éditorial et les médias ;
2. le miroir gagne de quoi les porter ;
3. **`diffDelivery` apprend à les voir.** Sans ça, une description changerait en
   vente **sans relecture**, pendant que l'écran de réception continuerait
   d'affirmer « rien n'est en vente tant que l'arrivée n'a pas été relue ».

### Lot 4 — le semis

Le PIM porte **2 médias** sur dev, et la boutique affiche des SVG d'illustration
qui n'existent que dans le front. Reverser ces visuels dans le PIM est un travail
de **contenu**, pas de code : il se décide (garde-t-on les illustrations ? des
photos ?) avant de s'exécuter.

## 4 bis. L'arbitrage du 2026-09-05 — la boutique est PUBLIQUE

Le lot 1 tranchait pour le **prix négocié**, mur compris. Cette décision
supposait une boutique authentifiée. **Elle ne l'est pas**, et ça se lit dans
deux fichiers : `app.html` rend la branche cliente sans attendre Auth0
(« elle n'attend pas Auth0 »), et aucune route sous `ClientShell` ne porte de
`canActivate` — seul `/login` est hors du shell client.

Un prix négocié demande une société ; un visiteur n'en a pas. La route sert donc
le **prix canonique**, qui pour lui EST le prix. Trois conséquences, et la
troisième est la seule qui coûte :

1. la route est **publique**, throttlée comme `pickup-addresses` — le précédent
   existant pour une surface anonyme (60/min/IP, « la partie la plus exposée de
   l'API ») ;
2. elle est **cachable**, puisqu'elle ne dépend d'aucun client ;
3. 🔴 **le sursaut que le lot 1 craignait revient le jour où un client connecté
   parcourt la boutique.** Il verrait le canonique, puis sa mercuriale au
   premier devis. Ce jour-là, la route doit servir SON prix — et ce sera un
   second chemin, pas une modification de celui-ci. Écrit maintenant pour ne pas
   être découvert alors.

### Ce qui rend le lot plus petit que le plan ne le disait

`ProductCatalogReader.all()` existe déjà — « le catalogue entier, dans l'ordre
où il se parcourt », ajouté pour le back-office. Il rend exactement ce qu'une
vitrine demande, moins l'éditorial : `sku`, `name`, `unitPriceMillicents` (HT),
`vatRate`, `category`, `allergens`, `orderTimeLimit`. Et il n'écarte pas au
hasard : un article sans taux de TVA n'est pas vendable, un retiré non plus.

Le lot 1 n'a donc pas de lecture à écrire. Il a une **vue étroite** à définir et
un contrôleur à poser.

## 4 ter. L'hydratation en UN point, côté front

C'est la vraie forme du lot 2, et elle vient de la mesure du coût : « le front
multiplie, le back additionne ». Aujourd'hui **vingt-deux fichiers** importent
`mock-shop` en direct — seize hors tests. Chacun est une porte sur la même
donnée, et aucun ne sait qu'elle viendra du réseau.

Une seule porte : un dépôt `ShopCatalogue`, hydraté **une fois** à l'ouverture
de la boutique, que tout le reste lit. Ce que ça change, au-delà du nombre
d'appels :

- **le panier cesse de connaître le catalogue.** `cart.store.ts` valide
  aujourd'hui ses références contre `productById` ; il les validera contre ce
  que le serveur a rendu ;
- **`cart-total.ts` perd sa raison d'être** — c'est le lot 2 d'origine, et il
  n'est pas en conflit : un panier qui lit des prix hydratés n'a plus à
  recomposer une TVA à partir d'un flottant ;
- **l'état de chargement devient un état de l'écran.** Aucun écran client n'en a
  aujourd'hui, parce qu'aucun n'attend le réseau. Les conventions de l'app le
  prescrivent déjà : `fold-loading`, `fold-empty-state`, jamais de balisage
  maison.

⚠️ Et un fait à ne pas contourner : `client/` n'utilise **aucun**
`fold-empty-state` aujourd'hui — il ne vit que dans `legacy/`. La règle est
écrite comme permanente ; l'espace client est en dérive complète vis-à-vis
d'elle. Brancher le réseau est le moment où ça cesse d'être cosmétique, puisque
l'échec de chargement devient un état réel.

## 4 quater. Ce qui manque et qui n'est PAS de l'argent

L'éditorial et les visuels ne traversent nulle part : ni le fil (v7 porte
`sku`, `name`, `kind`, `categoryId`, `variants`, prix, TVA, poids, allergènes,
limites — et rien d'autre), ni le miroir (`CatalogItem` n'a aucune colonne pour
les porter), ni la vue. Le PIM les a (`pim.product_media` → `MediaAsset`, avec
`url`, `alt`, point focal ; `pim.product_editorial`).

La boutique en a besoin de deux : **une ligne de fournil** et **une vignette**.
Sans elles, elle montre un nom et un prix — ce qui est vrai, et laid.

🔴 **L'arbitrage reste ouvert**, parce qu'il coûte très différemment :

|                                  | ce que ça demande                                                                     | ce que ça rend                                  |
| -------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **A. Faire voyager l'éditorial** | fil v8, colonnes au miroir, `diffDelivery` qui les voit, semis du contenu dans le PIM | la boutique complète, et la fin du dernier mock |
| **B. Brancher le prix d'abord**  | rien de plus que les lots 1 et 2                                                      | des noms et des prix VRAIS, sans note ni photo  |

L'option B n'est pas un demi-chantier : c'est l'ordre que ce plan a déjà posé
(« l'argent d'abord, l'éditorial ensuite — l'argent est faux, l'éditorial est
seulement absent »). Elle rend la boutique honnête avant de la rendre belle.

## 5. Ce que ce plan ne fait pas

- **Il ne touche pas au moteur de prix.** Il lui donne un second lecteur.
- **Il ne casse aucun contrat servi.** La route client est neuve ; l'admin ne
  bouge pas.
- **Il ne migre aucune donnée.** Les lots 1 et 2 n'écrivent rien. Le lot 3
  ajoute des colonnes (additif), le lot 4 ajoute du contenu.

## 6. Ce qui a été vérifié, et comment

| Affirmation                                 | Vérifiée par                                                |
| ------------------------------------------- | ----------------------------------------------------------- |
| Le front porte des prix flottants en dur    | `mock-shop.ts:86-140`, `catalogue-seed.ts:1029`             |
| Le front calcule le total et la TVA         | `cart-total.ts` — « tous les montants sont en euros »       |
| Le serveur re-résout à la passation         | `order-line-pricing.service.ts:211-267`                     |
| Aucun appel HTTP catalogue dans la boutique | recherche sur tout `apps/lfc-B2B-platform-frontend/src`     |
| Aucune route catalogue client               | recensement des `@Controller` de `b2b/*/http/`              |
| `POST /orders/quote` existe et est muré     | `orders.controller.ts:72-81`                                |
| L'instantané ne porte pas d'éditorial       | clés lues dans `catalog_delivery.snapshot`, en base         |
| Le miroir n'a pas de colonne éditoriale     | `prisma/schema/public/catalog.prisma`, modèle `CatalogItem` |
| Le PIM a éditorial et médias                | tables `pim.product_editorial`, `pim.product_media`         |

⚠️ **Ce plan n'a pas été soumis à un contradicteur.** `CLAUDE.md` §9 bis le
demande pour tout plan qui touche l'argent. À défaut, chaque affirmation de
l'existant a été ouverte dans le dépôt — la table ci-dessus dit laquelle et où.
Ça remplace la mémoire, pas la contradiction.
