# Le prix, tel que la boutique le montre

> ## 🟡 Relu le 2026-09-06 — la boutique est bâtie, et pas par la route décrite ici
>
> **Le corps du document est conservé tel qu'il a été écrit.** C'est le
> raisonnement qui vaut, et deux de ses décisions ont été _renversées_ par la
> suite, pas oubliées. Les lire sans ce bandeau ferait construire contre
> l'existant — c'est ce qui a motivé cette relecture.
>
> **Ce qui a été renversé, et où c'est décidé.**
>
> | Ce document tranche                                       | Ce qui est en service                               | Où la décision a été prise                                                  |
> | --------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
> | `GET /catalog`, **muré**, société prise du principal (§2) | `GET /shop/catalogue`, **`@Public()`**, sans client | [`plan-boutique-sur-api.md`](plan-boutique-sur-api.md), livré le 2026-09-05 |
> | `canonicalMillicents`, pour le barré (§4)                 | **absent** de `ShopItemView`                        | conséquence de la précédente : sans client, il n'y a aucun écart à barrer   |
>
> La boutique est **publique par décision** — on visite d'abord, on s'identifie
> pour régler. Ce document supposait l'inverse, et tout son §2 en découle. Le
> jour où la boutique servira le prix d'un client reconnu, ce sera un **second
> chemin**, et le mur qu'il décrit redeviendra la bonne réponse pour celui-là.
>
> **Ce qui tient toujours, et qu'il faut continuer de lire :**
>
> - **§3, la quantité de résolution** — la liste résout à 1, et la raison
>   (`minQuantity` existe à tous les étages, pas seulement au volume) n'a pas
>   bougé ;
> - **§4, « ce qui ne franchit PAS la frontière »** — appliqué à la lettre, et
>   deux fois : `ShopItemView` et `ShopQuoteView` sont toutes deux étroites, et
>   un test e2e énumère les clés de la seconde pour que ça le reste ;
> - **§6, « le front ne multiplie jamais »** — 🔴 c'était l'écart le plus
>   coûteux du document, et il est **refermé depuis le 2026-09-06** : le panier
>   demande `POST /shop/quote`, qui résout chaque ligne à sa quantité réelle.
>   La route n'est pas celle qu'annonce le §6 (`POST /orders/quote` est murée et
>   sert le client reconnu), la règle est la même ;
> - **§7, les paliers de volume reportés** — toujours reportés, et ce qu'il
>   faudra rouvrir alors est écrit là.
>
> **Ce que ce bandeau ne prétend pas.** Aucune affirmation du corps n'a été
> reprise ligne à ligne : seules celles des §2, §4 et §6 ont été rouvertes dans
> le dépôt. Le §5 et le §8 se lisent à la date de leur écriture.

**Doc-first, ouvert le 2026-09-03.** Rien de ce document n'est encore écrit en
code. Il tranche ce qui doit l'être **avant** — parce que ce chantier touche le
nombre auquel un client consent.

> Le contexte et l'ordre des lots : [`plan-boutique-sur-api.md`](plan-boutique-sur-api.md).
> Le moteur lui-même : [`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md).

🔴 **Périmètre : la commande de base et la mercuriale à prix fixe.** Les
**paliers de volume sont reportés** — ils ne sortent pas de la vue par oubli
mais par décision, et la section 6 dit ce qu'il faudra rouvrir le jour venu.

Ce n'est pas un découpage de confort. La mercuriale **scelle** : un prix négocié
posé à cet étage rend les suivants transparents (sauf `stacksOverMercuriale`).
Le cas « commande de base + mercuriale » est donc le plus court chemin complet à
travers le moteur — un canonique, ou un prix négocié, et rien à composer.

---

## 1. Ce qu'on répare

La boutique affiche des prix venus d'un **seed local en euros flottants**
(`client/mock-shop.ts`) pendant que le serveur facture depuis le miroir, en
centimes entiers, à travers le moteur de résolution. Un client au tarif négocié
voit le prix public et paie le sien.

Ce document décrit **la lecture** qui remplace le seed. Il ne touche pas au
moteur : il lui donne un second lecteur.

## 2. La route

`GET /catalog` — surface **client**, à côté de `orders`, `subscriptions`, `me`.

### Son mur

Le même que le devis, et pour la même raison. `POST /orders/quote` le dit déjà :
sans mur, « n'importe qui sonderait la mercuriale d'un concurrent en devinant son
identifiant ». La société se prend donc **du principal**, résolue en base, jamais
d'un paramètre.

### Sans entreprise

Le moteur porte déjà ce cas : `PricingContext.companyId` est `string | null`,
« `null` pour une commande sans entreprise (parcours zéro friction) ». Un client
sans société reçoit donc le **canonique**, sans règle appliquée — et, par
construction, **aucun prix barré** : il n'y a pas d'écart à montrer.

C'est la réponse à « le canonique si la personne n'a pas de mercuriale » : ce
n'est pas une branche à écrire, c'est ce que le moteur fait quand on ne lui
donne pas de société.

## 3. 🔴 À quelle quantité le prix se résout-il ?

**La question que la liste pose et que la commande ne pose pas** — et elle
survit au report des paliers, contrairement à ce qu'on croirait.

`PricingContext` exige une `quantity`, et une liste n'en a pas. On pourrait
penser que sans l'étage volume la quantité cesse de compter : c'est faux. **Toute
règle porte un `minQuantity`**, à n'importe quel étage, et le domaine l'écrit :
« les autres étages continuent de lire `quantity` — le seuil d'une promotion
parle bien de CETTE commande ». Une promotion « −10 % à partir de 6 » reste donc
conditionnée à la quantité, paliers ou pas.

**La liste résout à la quantité 1.** Les règles à seuil ne s'appliquent alors
pas, et le prix affiché est celui d'**une pièce** — ce qu'on paie en prenant la
plus petite commande possible.

L'alternative — résoudre à une quantité « habituelle » ou au meilleur seuil —
afficherait un prix qu'on n'obtient qu'en commandant assez. Ce serait la faute
que le back-office a déjà refusée sur les altérations : montrer un résultat sans
sa provenance.

⚠️ **`cumulativeQuantity` reste à `null` dans la liste.** C'est le volume déjà
engagé sur la période ; le prendre en compte donnerait un prix juste mais
**instable**, qui bougerait au fil des commandes sans que rien à l'écran ne
l'explique. La commande, elle, le prend — c'est le devis qui rend le prix réel.

**La conséquence, assumée et dans le bon sens** : la liste peut sous-estimer une
remise, jamais l'inverse. Un client est agréablement surpris au panier, jamais
déçu.

## 4. La vue, champ par champ

**La règle de tri** : un champ passe s'il répond à _« combien ça me coûte, et à
partir de quelle quantité ça baisse »_.

| champ                         | pourquoi                                                      |
| ----------------------------- | ------------------------------------------------------------- |
| `sku`, `name`                 | la ligne                                                      |
| `categoryId` (ou son code)    | le rayon                                                      |
| `unitPriceMillicents`         | **ce qu'il paie** — le prix résolu à quantité 1               |
| `canonicalMillicents`         | le prix d'entrée, pour le barré. **Absent quand il est égal** |
| ~~`volumeTiers`~~             | **reporté** — cf. le périmètre, en tête                       |
| `vatRatePercent`              | le décompte du panier                                         |
| `weightGrams`                 | l'unité affichée                                              |
| `allergens`, `allergenLabels` | réglementaire, déjà au miroir                                 |

### 🔴 Ce qui ne franchit PAS la frontière

`PricingItemView` — la vue du back-office — porte tout ce qu'il faut **et** ce
qu'un client ne doit jamais voir :

| champ                             | ce qu'il révélerait                                |
| --------------------------------- | -------------------------------------------------- |
| `rules`, `supersededRuleIds`      | les noms et l'existence de nos règles commerciales |
| `steps`                           | le **chemin du prix**, étage par étage             |
| `ownFloor`, `effectiveFloor`      | le plancher, c'est-à-dire **la marge**             |
| `sealedByRuleId`, `sealedRuleIds` | ce que la mercuriale a scellé, et contre quoi      |

La vue client est donc **neuve et étroite**, pas `PricingItemView` réexporté.
Deux murs, deux dangers : celui du devis protège la mercuriale d'un concurrent,
celui-ci protège la machinerie qui fabrique nos prix.

## 5. L'affichage — le back l'a déjà tranché

`final-price` (écran de tarification) rend la règle, et la boutique la reprend :

- **le canonique BARRÉ**, puis le prix qui s'applique. « Sans lui, l'écart n'a
  pas de point de départ » ;
- **le barré n'apparaît que s'il y a un écart.** Un prix barré sur lui-même
  serait une fausse promotion — d'où `canonicalMillicents` **absent** quand il
  est égal, plutôt que présent et identique : l'absence ne se rate pas ;
  (La règle des paliers — « chaque ligne est une résolution complète » — vaut
  toujours, mais elle ne concerne pas ce lot.)

`CatalogProduct` (`@lfd/b2b-ui/catalog`, consommé par les **deux** apps) gagne le
prix barré, optionnel. Un seul endroit décide à quoi ressemble un prix.

## 6. 🔴 Ce qui doit être vrai MAINTENANT pour que les paliers ne coûtent rien

Les paliers arrivent bientôt. Ce lot est donc contraint par eux **avant** qu'ils
existent : un report n'est un report que s'il ne fabrique pas ce qu'il faudra
défaire.

### La seule chose qui peut vraiment casser : un panier qui multiplie

`cart-total.ts` fait aujourd'hui `prix × quantité`. C'est exact tant qu'un prix
unitaire ne dépend pas de la quantité — et **faux le jour même** où un palier
existe. Pire : faux **en silence**, parce que la multiplication continue de
rendre un nombre plausible.

**Donc la règle de ce lot, et c'est la seule qui compte :** le front **ne
multiplie jamais**. Il demande `POST /orders/quote`, qui résout chaque ligne à sa
quantité réelle. Fait ainsi, le jour des paliers, le panier est déjà juste sans
qu'on y touche — le serveur commence simplement à rendre d'autres nombres.

Fait autrement — un total calculé côté client « en attendant » — les paliers
demandent de le défaire, et entre-temps chaque commande facture autre chose que
ce que le client a vu. C'est le défaut qu'on est précisément en train de réparer.

### Ce qui est additif, et ne demande donc rien aujourd'hui

| pièce                                 | pourquoi ça n'engage pas                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `volumeTiers` dans la vue             | champ **optionnel** ajouté plus tard ; absent ≠ vide                                                           |
| Le barré de `CatalogProduct`          | déjà optionnel, et un palier ne change pas sa règle                                                            |
| La quantité de résolution de la liste | reste **1** quand les paliers arrivent — la liste montre le prix d'une pièce, les paliers disent où il descend |

### Ce qu'il ne faut PAS faire « en préparation »

Ni champ vide en attendant, ni `volumeTiers: []` qui voudrait dire deux choses
(« pas de palier ici » et « pas encore implémenté »). Une absence se distingue
d'une liste vide ; deux sens pour une valeur, c'est la faute que ce dépôt refuse
partout ailleurs sur `null` contre `[]`.

## 7. Ce que ce document ne tranche pas

- **Le coût de la résolution.** Une liste de 92 articles fait 92 résolutions,
  par client, non cachables entre clients. Mesurable seulement une fois écrit ;
  à mesurer avant d'optimiser, et à ne pas optimiser d'avance.
- **Les paliers de volume.** Reportés, et ce qu'il faudra rouvrir alors est
  écrit ici pour ne pas le redécouvrir : la vue gagne `volumeTiers`
  (`minQuantity`, `unitPriceMillicents`, `discountBp` — **déjà résolus**), et
  l'affichage doit reprendre la règle du back : « chaque ligne est une
  résolution complète à cette quantité, pas un `canonique × (1 − remise)`, qui
  mentirait dès qu'une promotion compose avec le palier ». La quantité de
  résolution de la LISTE, elle, ne change pas : elle reste 1.
- **L'éditorial** — descriptions et visuels. Lot séparé, et il a sa propre
  contrainte : `diffDelivery` doit apprendre à les voir, sinon une description
  changerait en vente sans relecture.
- **La pagination.** 92 articles tiennent en une réponse ; mille non.

## 8. Ce qui a été vérifié

| Affirmation                                                      | Où                                            |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `resolvePrice` est pure et réutilisable                          | `pricing/domain/resolve-price.ts:43`          |
| `companyId` peut être `null`                                     | `pricing/domain/price-rule.ts:191`            |
| Le contexte exige `quantity`                                     | idem, `:186`                                  |
| Toute règle porte un `minQuantity`, tous étages                  | `price-rule.ts:142` + `:201`                  |
| La mercuriale **scelle** les étages suivants                     | `resolve-price.ts`, en-tête                   |
| Un palier porte `minQuantity`/`unitPriceMillicents`/`discountBp` | `contracts/src/pricing.ts:770`                |
| Le devis client existe et est muré                               | `orders.controller.ts:72`                     |
| `final-price` barre le canonique s'il y a un écart               | `tarification/final-price/final-price.html`   |
| `CatalogProduct` n'a qu'un `price` formaté                       | `b2b-ui/src/catalog/catalog-product.model.ts` |

⚠️ Non soumis à un contradicteur, comme le plan. Chaque affirmation de
l'existant a été ouverte dans le dépôt — la table dit laquelle et où.
