# Vendre le variant, pas le produit — plan

> Écrit le 2026-09-13, **réécrit le même jour**.
>
> 🔴 La première version portait une migration de données en trois temps, un
> rétro-remplissage et une colonne `variant_sku`. Hugo a tranché : **il n'y a
> pas d'historique de commandes en production.** Tout cet appareil protégeait un
> passé qui n'existe pas — il est retiré, et ce qui reste tient en deux temps.
>
> Touche toujours **l'argent** (la résolution de prix est indexée par SKU) : il
> passe au contradicteur avant d'être soumis (CLAUDE.md §9 bis).

## 1. La décision

Le commerce vend aujourd'hui le SKU du **produit** (`VIE-001`). Le catalogue, lui,
est à clé de **variant** (`VIE-001-1`) — c'est déjà le cas en base. Entre les
deux, un adaptateur replie chaque produit sur son variant **par défaut**.

On veut supprimer ce repli : **ce qu'on vend, c'est le variant.**

## 2. Ce que le dépôt en dit déjà — et pourquoi il avait raison

`catalog-backed-product-catalog.ts` porte la décision d'origine, et elle n'était
pas un oubli :

> « La boutique vend le SKU du PRODUIT depuis l'ouverture commerciale […] Une
> bascule qui aurait exposé les SKU du PIM aurait rendu illisibles toutes les
> commandes déjà passées, tous les paniers récurrents et tous les brouillons —
> pour un gain nul. »

Deux choses ont changé depuis, et ce sont elles qui rouvrent le dossier :

- **le gain n'est plus nul.** `CHO-001` porte trois variants — « Gros florentin
  lait », « 220g », « 3 ». La boutique n'en sert qu'un ; les deux autres sont
  **invendables**, et une ligne de commande qui dit `CHO-001` ne dit pas lequel
  a été vendu ;
- **le coût a fondu.** Les paniers récurrents que citait ce commentaire sont
  aujourd'hui **vides** (`subscription_lines` : 0 ligne). Il reste 118 lignes de
  commande.

Le même fichier annonçait la bascule : « elles s'ouvriront avec le front client,
à la slice C7 ». Ce plan est l'exécution de cette phrase.

## 3. L'état, mesuré le 2026-09-13

| Ce qui porte un SKU                        | Volume                    | Forme aujourd'hui                |
| ------------------------------------------ | ------------------------- | -------------------------------- |
| `public.catalog_items`                     | 94 articles / 92 produits | **variant** (clé primaire)       |
| `public.catalog_item_overrides` (prix B2B) | —                         | **variant**                      |
| `public.catalog_price_history`             | 122 lignes / 94 SKU       | **variant**                      |
| `public.order_lines`                       | **118 lignes, 27 SKU**    | produit                          |
| `public.subscription_lines`                | **0**                     | —                                |
| `public.product_norms`                     | **0**                     | —                                |
| `production.production_order_line`         | 6                         | produit (recopié de la commande) |
| `production.production_count`              | 6                         | produit                          |
| `production.production_container`          | 0                         | produit (neuf)                   |

> 🔴 **Ce paragraphe affirmait le contraire, et c'était faux** (relevé par le
> contradicteur le 2026-09-13) : « tout ce qui touche au prix est déjà à clé de
> variant ». Seule la **table** de l'historique l'est. Sa **lecture datée**, elle,
> est indexée par produit — `prisma-canonical-price-history.reader.ts` fait
> `distinct: ["productSku"]` et rend une carte clé = `productSku`, que
> `pricer.ts` interroge avec `article.sku` **et qui lève** `NoCanonicalPriceAtError`
> si la clé manque. Frapper l'article avec un SKU de variant fait donc refuser
> **tous** les articles à la première relecture datée.
>
> Le port le disait lui-même : « c'est le premier endroit à reprendre le jour où
> elle vendra les déclinaisons » (`canonical-price-history.reader.ts`). Le plan
> ne l'avait pas ouvert.

**Ce qui est à clé de variant** : la table du catalogue, celle des prix B2B, et
le stockage de l'historique. **Ce qui est à clé de produit** : la lecture datée
du prix, **toutes les décisions tarifaires** (mercuriales, planchers, paliers,
engagements de volume — voir §5 bis), la ligne de commande et ce qui en descend.

Deux vérifications qui conditionnent la migration, faites en base :

- **chaque produit a exactement UN variant par défaut** — aucune ligne ne sort
  de la requête qui cherche les produits à zéro ou deux défauts. La
  correspondance produit → variant est donc déterministe **aujourd'hui** ;
- **un seul produit a plusieurs variants** (`CHO-001`), et il porte **une seule**
  ligne de commande.

## 4. 🔴 Ce que la bascule n'atteindra pas

Trois surfaces portent des SKU de produit **hors de la base**. Elles survivent à
la décision du §6 — aucune ne dépend de l'historique des commandes :

- **le panier du client, dans son navigateur.** `lfc.cart` est un objet
  `{ "VIE-001": 2 }` en `localStorage`. Un client qui a un panier ouvert
  pendant le déploiement enverra des SKU de produit à un serveur qui n'en
  attendrait plus. C'est elle qui impose deux temps plutôt qu'une bascule sèche ;

  > ⚠️ **Et ce n'est PAS la seule**, contrairement à ce que cette section disait.
  > `shop_carts.payload` et `order_drafts.payload` sont des **tables** : le
  > panier a déménagé côté serveur, et les brouillons y ont toujours été. Une
  > migration les atteint donc — mais `shop_carts` ne porte **aucun TTL**, et la
  > synchronisation remonte le panier le plus récent, fût-il d'il y a six mois.
  > « Au moins un cycle complet » (§7) ne borne rien tant que cette table n'a pas
  > de péremption.

- **les documents déjà émis** — bons de commande en PDF, courriels partis. Ils
  portent le SKU imprimé ce jour-là. Ils ne se réécrivent pas, et c'est normal :
  ce sont des instantanés, pas des lectures ;
- **les fiches d'atelier tirées sur papier**, pour la même raison.

## 5. Pourquoi on ne peut PAS garder le SKU produit quand il n'y a qu'un variant

C'est la solution qui paraît la moins chère : `PAI-001` reste `PAI-001` tant
qu'il n'a qu'un format, et seul `CHO-001` passe au variant. Elle ne tient pas,
pour une raison qui ne se voit pas le jour où on l'écrit.

**Le jour où un produit gagne un second format, la clé de l'article vendable
change** — `PAI-001` deviendrait `PAI-001-1` pour désigner exactement la même
chose qu'hier. Toutes les lignes de commande déjà écrites désigneraient alors un
identifiant qui ne veut plus dire ce qu'il disait, et l'historique de prix, lui,
n'aurait pas bougé.

La règle « un seul variant ⇒ SKU produit » fait dépendre l'identité d'un article
de **combien de frères il a**, ce qui est une propriété du catalogue, pas de lui.

> ⚠️ **Ce paragraphe invoquait `lint:sku-never-recycled`, à tort** (2026-09-13).
> Cette porte refuse les `delete` sur `product` et `productVariant` : aucun SKU
> n'est réattribué dans le scénario décrit, et elle ne verrait rien. La
> conclusion tient, sa caution non — et une caution fausse est pire qu'une
> absence de caution, parce qu'elle dispense de réfléchir.

## 5 bis. 🔴 Les trois murs que le plan n'avait pas vus

Relevés par le contradicteur le 2026-09-13, chacun ouvert dans le dépôt. Ils ne
se contournent pas : ils **doivent être des lots**, avant celui qui bascule.

### Toutes les décisions tarifaires sont à portée PRODUIT

`pricing-context.ts` remplit `productSku` **et** `variantSku` avec le SKU reçu ;
`company-mercuriale.ts`, `specificity.ts`, `volume-commitment.ts` et
`board-item.ts` cherchent tous leur ligne par `context.productSku`. Les
mercuriales, planchers, paliers et engagements **déjà saisis** portent le SKU de
produit.

Servir un SKU de variant fait donc **cesser toute correspondance** : le client
négocié est facturé au tarif de liste, et **rien ne rougit**. C'est le mode de
panne exact que `lint:price-door` existe pour empêcher, et c'est une perte
d'argent silencieuse, chez le client qui a le plus négocié.

### `@@unique([orderId, sku])` interdit le gain lui-même

`orders.prisma` : une commande ne peut pas porter deux lignes du même `sku`.
Vendre **deux formats du même florentin dans une commande** — c'est-à-dire
exactement ce que ce plan existe pour permettre — viole la contrainte si `sku`
reste le SKU de produit, et change le sens d'un champ servi si `sku` devient le
variant.

Le plan disait « la ligne neuve écrit `variant_sku` et continue d'écrire `sku` »
**sans jamais dire ce que vaut `sku`**. C'était la décision centrale, et elle
n'était pas prise. Avec la suppression de `variant_sku` (§6), elle se pose
désormais nue : `order_lines.sku` porte le variant, et la contrainte devient
juste — mais ça n'est vrai que parce qu'il n'y a pas d'historique.

### Le repli vit à DEUX endroits, pas un

`ProductCatalogReader.all()` **et** `shop-catalogue-view.ts` (la vitrine
publique, route anonyme) filtrent `isDefault` et renomment `productSku` → `sku`.
Le §7 n'en nommait qu'un. Tant que les deux ne basculent pas ensemble, la
vitrine et le checkout servent deux clés différentes — et
`shop-catalogue-pricing.service.ts` réindexe par `productSku` pour tarifer :
il tombera en panne **muette**, l'article sortant au prix canonique.

### Deux autres, moins hauts mais réels

- **L'empreinte d'idempotence est hachée sur le SKU REÇU**, avant toute
  résolution (`order-fingerprint.ts`, appelé en premier par
  `place-order.handler.ts`). Le même panier envoyé sous `CHO-001` puis sous
  `CHO-001-1` produit deux empreintes : un rejeu légitime est refusé. Si la
  résolution doit passer avant l'empreinte, l'empreinte change de définition
  pour les clés déjà posées.
- **`ProductNorm` à zéro ligne ne prouve rien** : elle est recalculée par
  `GROUP BY ol.sku` sur une fenêtre glissante. À cheval sur la bascule, le même
  article existe sous deux clés, la médiane se calcule sur deux populations
  coupées, et les alertes de déviation se taisent ou crient.

### Le point de non-retour n'est pas là où le plan le disait

Dès que la boutique sert des variants, des SKU de variant entrent dans
`shop_carts` et dans `lfc.cart`. Revenir en arrière sur ce déploiement les rend
**inconnus** — `findDefaultByProductSku` ne cherche que par `productSku`. Le
point de non-retour est donc le **premier** temps, pas le retrait de la
tolérance.

## 6. 🔴 Ce que l'absence d'historique change — et ce qu'elle ne change pas

**Décidé le 2026-09-13 :** la production ne porte pas d'historique de commandes.
La base de commerce a été remise à blanc le 2026-08-16, le back-office a ouvert
le lendemain, et ce qui s'y est passé depuis ne constitue pas un passé à
préserver.

### Ce que ça supprime

Tout le dispositif de migration. Pas de colonne `variant_sku`, pas de
rétro-remplissage, pas de `NULL` à interpréter, pas de valeur déduite à marquer
comme déduite. **`order_lines.sku` porte le SKU vendu** — et à partir de la
bascule, ce qu'on vend est un variant. Il n'y a rien à réécrire, donc rien à
faire mentir.

Ça supprime aussi la question la plus désagréable du plan d'origine : _« le
défaut d'aujourd'hui n'est pas celui d'hier »_. Sans hier, elle ne se pose pas.

> ⚠️ **Une seule vérification conditionne tout ce paragraphe**, et elle se fait
> sur la production, pas en dev :
>
> ```sql
> select count(*) from public.order_lines;
> select count(*) from public.subscription_lines;
> ```
>
> Deux zéros : le plan s'exécute tel quel. Autre chose : **on s'arrête**, et on
> reprend la version en trois temps — elle reste dans l'historique git de ce
> fichier. Ce n'est pas une formalité : c'est la seule affirmation du plan que
> son auteur n'a pas pu ouvrir lui-même.

### Ce que ça ne change PAS

**Le panier du client vit dans son navigateur** (§4), et aucune décision sur
l'historique ne l'atteint. C'est lui, et lui seul, qui impose encore une
transition plutôt qu'une bascule sèche.

## 7. Les deux temps

### Temps 1 — la boutique vend les variants, le serveur tolère les deux

- `ProductCatalogReader.all()` cesse de filtrer `isDefault` et de renommer
  `productSku` → `sku` (`catalog-backed-product-catalog.ts`). Les trois
  florentins deviennent vendables.
- `resolve` / `resolveMany` **acceptent les deux formes** : un SKU de variant est
  pris tel quel, un SKU de produit est replié sur son variant par défaut — le
  repli existant, conservé et non supprimé.
- La tolérance porte une **date de retrait** dans son JSDoc, faute de quoi elle
  deviendra un comportement qu'on croira voulu.
- Les lignes neuves portent donc des SKU de variant, sans qu'une seule colonne
  bouge.

**Rien n'est cassé** : un panier ouvert dans un navigateur continue de passer.

### Temps 2 — retirer la tolérance

Après **au moins un cycle complet** — le temps qu'un panier abandonné expire,
pas le temps d'un déploiement :

- le repli produit → défaut est retiré de `resolve` / `resolveMany` ;
- un SKU de produit devient alors un article inconnu, refusé comme tel.

⚠️ **Le refus doit nommer le cas**, pas rendre « article introuvable » : c'est un
panier trop vieux, et le geste de sortie est de le vider. Un client qui lit
« introuvable » croit que le produit a disparu.

## 8. Ce qu'on ne fait pas

- **On ne réécrit pas `sku` sur les lignes existantes.** Une ligne de commande
  est ce qui a été vendu ; la corriger après coup change un fait.
- **On ne touche pas aux documents émis.**
- **On ne fait pas voyager la catégorie jusqu'à la production.** Question
  voisine, tranchée ailleurs : le rayon est une propriété du catalogue
  d'aujourd'hui, et le figer réécrirait les journées déjà arrêtées.

## 9. Les lots

Le tableau d'origine était **plus petit que le chantier qu'il décrivait** — il
ne couvrait aucun des murs du §5 bis. Le voici refait, dans l'ordre où ça se
bâtit.

| #   | Lot                                                                      | Taille | Dépend de |
| --- | ------------------------------------------------------------------------ | ------ | --------- |
| 0   | Vérifier les deux comptes en production (§6)                             | XS     | —         |
| 1   | **Nommer les déclinaisons par une donnée STRUCTURÉE** (§10)              | M      | —         |
| 2   | **La lecture datée du prix passe à clé de variant**                      | M      | —         |
| 3   | **Les décisions tarifaires portent une portée `variant`**                | L      | 2         |
| 4   | Péremption des `shop_carts` — sans quoi la tolérance ne se retire jamais | S      | —         |
| 5   | La résolution passe AVANT l'empreinte d'idempotence                      | S      | —         |
| 6   | Les DEUX replis basculent ensemble (checkout + vitrine publique)         | M      | 1,2,3     |
| 7   | Écrans admin : le variant devient l'article qu'on choisit                | M      | 6         |
| 8   | Retrait de la tolérance, et le refus qui nomme le cas                    | S      | 4,6       |

**Les lots 2 et 3 sont les seuls qui touchent l'argent**, et aucun des deux
n'était dans le plan d'origine. Le lot 3 est le plus gros du chantier : c'est
lui qui décide si une mercuriale se négocie sur un produit ou sur un format.

⚠️ **Coût non chiffré** : 33 fichiers e2e sèment des SKU en dur — 221 occurrences
de `VIE-001` côté API, 135 côté fronts et paquets, et un test dérive même le SKU
produit du variant par `replace(/-\d+$/, "")`. Aucune des tailles ci-dessus ne
l'inclut.

## 10. 🔴 Le nom : ce qui bloque vraiment

**Décidé par Hugo le 2026-09-13 : le nom d'une déclinaison est un nom INTERNE.**
Il ne devient jamais le nom de boutique. Si le nom affiché doit changer, il vient
de l'**identité du produit**.

C'est la même doctrine que le dépôt applique déjà aux conditionnements :

> « Le libellé n'est PAS stocké : il se dérive de `type` × `quantity`. Le
> stocker rouvrirait la porte à “Carton 20” et “carton de 20” pour la même
> chose. » — `ProductPackaging`

### Ce que ça implique, et pourquoi ça bloque

Si le nom de déclinaison est interne, la vitrine doit distinguer deux frères par
une **donnée structurée**, dérivée en libellé — jamais par du texte libre.

Or cette donnée **n'existe pas**, et c'est mesuré :

| Ce qui pourrait distinguer     | État en base                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `product_variant.options`      | **vide sur les 99 déclinaisons**                           |
| `product_variant.weight_grams` | renseigné sur 28 / 99, **absent** sur les trois florentins |
| `product_packaging`            | **0 ligne**                                                |

Autrement dit : « 220g » et « 3 » ont été tapés dans le champ `name` **parce que
le champ structuré était vide**. L'information existe, elle est simplement au
mauvais endroit — dans une chaîne libre, donc indérivable et non comparable.

### Ce que ça change pour le plan

**Le lot 1 n'est pas « nommer les variants ».** C'est :

1. porter l'axe de distinction dans une donnée structurée — `options`,
   `weightGrams`, ou plus probablement **`ProductPackaging`**, puisque « 220g »
   et « 3 » décrivent un sachet et un lot, c'est-à-dire exactement ce que cette
   entité modélise (et elle dérive déjà son libellé) ;
2. dériver le libellé de vitrine de **l'identité produit + cet axe**.

⚠️ **Et il se pourrait que ces deux déclinaisons n'en soient pas.** Un sachet de
220 g et un lot de 3 sont des **conditionnements** d'un même florentin, pas deux
florentins différents. Si c'est le cas, ce plan vise le mauvais niveau : ce n'est
pas « vendre le variant » qu'il faut, c'est « vendre le conditionnement » — et le
PIM porte déjà l'entité, son SKU unique, son prix propre et ses canaux.

**C'est la question à trancher avant tout code.** Elle décide si le chantier est
celui de ce document ou un autre.

## 11. Ce qui reste à trancher par Hugo

1. 🔴 **Déclinaison ou conditionnement ?** (§10) — bloquant, et en amont de tout.
2. 🔴 **Une mercuriale se négocie-t-elle sur un produit ou sur un format ?**
   (§5 bis, lot 3) — c'est la question d'argent du chantier.
3. **Combien de temps la tolérance reste** (§7), une fois `shop_carts` périmable.
