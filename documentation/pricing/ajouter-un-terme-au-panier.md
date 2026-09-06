# Ajouter un terme au panier

**Ouvert le 2026-09-06. ✅ Décrit du code qui tourne.**

> Un **terme de panier** est un montant qui s'ajoute ou se retire à la commande
> entière, sans être le prix d'un article : la remise d'un point de retrait, les
> frais d'une zone de livraison, la surtaxe d'une commande tardive. Une
> éco-contribution en serait un quatrième.
>
> Ce document existe parce qu'en ajouter un touche **une vingtaine de fichiers**
> et qu'aucun n'est deviné : la surtaxe de retard en a touché 22 le 2026-09-04,
> puis 13 de plus pour l'afficher. Le compte est vérifiable —
> `git show --stat 455b3cea` et `ea922223`.
>
> Il existe aussi parce que `P4` a montré qu'on pouvait en ajouter un **à
> moitié** sans qu'aucun test ne rougisse. C'est ce que le §4 raconte.

---

## 1. Les quatre questions, avant d'écrire une ligne

Elles se posent dans cet ordre, et la première élimine la plupart des candidats.

**1. Est-ce un terme de panier, ou un prix d'article ?** La question qui
tranche : _à quoi ce montant répond-il ?_ « Ce que cet article vaut pour ce
client » est un prix, et il descend dans les étages du moteur de résolution.
« Comment cette commande a été passée », « où elle est servie », « ce qu'elle
emballe » sont des termes de panier.

Se tromper ici coûte cher et pas seulement en travail : un terme de panier
descendu dans les étages se battrait avec les planchers de marge et ferait
afficher deux prix au même croissant.

**2. Par commande, ou par ligne ?** Les trois termes existants sont par
commande. Un panier dont trois lignes sur vingt sont hors limite ne fait pas
reprendre trois productions. Un terme par ligne n'est pas interdit, mais il
n'a **aucun précédent** ici : il faudrait le porter sur `OrderLine`, et rien de
ce document ne s'y applique tel quel.

**3. Avant ou après la remise ?** C'est-à-dire : ce terme est-il remisable ? On
ne fait pas de geste commercial sur une pénalité de retard ni sur une
prestation de transport — les deux sont donc **après**. Une éco-contribution
l'est aussi : elle est due à l'État, pas au client.

Techniquement, « après la remise » veut dire **`extras`** et non `lines` — cf.
§2. L'inverse s'écrirait en déplaçant un mot.

**4. Quel taux de TVA, et d'où vient-il ?** Trois réponses possibles, et la
troisième est la seule vraiment dangereuse :

- **une constante**, quand la loi ne laisse pas le choix. Le transport est au
  taux normal, point : `DELIVERY_VAT_RATE = 20` ;
- **un réglage**, quand personne ne sait encore. La surtaxe de retard suit
  peut-être les marchandises, peut-être la prestation — le taux est donc une
  donnée qu'un comptable corrige sans déploiement ;
- **un défaut** — 🔴 **jamais**. Un taux inventé facture rétroactivement toutes
  les commandes concernées, et ne se rattrape qu'à la main, ligne par ligne, et
  seulement si quelqu'un s'en aperçoit. Quand le taux manque, on **lève** :
  `MissingLateFeeVatRateError` est le modèle à recopier.

---

## 2. La ventilation, expliquée

Tout l'argent de la commande passe par une seule fonction —
`ventilateVat`, dans `@lfd/money`. Elle prend deux listes et rend un décompte
complet.

```
ventilateVat({ lines, discountCents, extras })
  → { subtotalHtCents, discountCents, extrasHtCents, vat[], vatTotalCents, totalCents }
```

**`lines` et `extras` ne sont pas deux façons de dire la même chose.** C'est là
que se joue la question 3 :

|                          | `lines`             | `extras`                     |
| ------------------------ | ------------------- | ---------------------------- |
| Ce que c'est             | les marchandises    | les termes de panier         |
| La remise les touche     | **oui**, au prorata | **non**                      |
| Le sous-total les compte | oui                 | non (`extrasHtCents` à part) |

Le mécanisme, en une phrase : la remise est retirée du sous-total pour donner un
**net**, et chaque ligne est proratisée sur ce net, pendant que chaque extra est
proratisé sur le sous-total **brut**. Une ligne remisée à moitié porte donc
moitié moins de TVA ; un frais de coursier porte la sienne en entier.

**La TVA est groupée par TAUX, et arrondie une fois par groupe.** Pas une fois
par ligne : une facture porte une ligne par taux, calculée sur l'assiette totale
de ce taux. Un extra à 20 % rejoint donc les marchandises à 20 % dans le même
groupe, au lieu d'être arrondi à part — c'est un centime de différence, dans le
sens juste.

Les numérateurs sont accumulés en `bigint` sur un dénominateur commun (le
sous-total), et l'arrondi n'a lieu qu'à la fin. Aucune fraction ne se multiplie
en chemin.

### Un panier chiffré, de bout en bout

Douze croissants à 1,00 € HT (**5,5 %**), quatre jus à 2,00 € HT (**10 %**), et
10,00 € HT de course (**20 %**).

**Sans remise.** Chaque taux fait un groupe, et chaque groupe est arrondi une
fois :

| Groupe            | Assiette HT |  Taux |        TVA |
| ----------------- | ----------: | ----: | ---------: |
| croissants        |     12,00 € | 5,5 % | **0,66 €** |
| jus               |      8,00 € |  10 % | **0,80 €** |
| course (`extras`) |     10,00 € |  20 % | **2,00 €** |
|                   |             |       | **3,46 €** |

`subtotalHtCents` = 20,00 € — **les marchandises seules**, la course n'y est
pas. Elle vit dans `extrasHtCents`.

**Total = 20,00 + 10,00 + 3,46 = 33,46 €.**

**Avec 2,00 € de remise** — soit 10 % du sous-total. C'est ici que `lines` et
`extras` cessent de se ressembler :

| Groupe     |           Assiette HT |                            |  Taux |                 TVA |
| ---------- | --------------------: | -------------------------- | ----: | ------------------: |
| croissants | 12,00 € → **10,80 €** | proratisée sur le **net**  | 5,5 % | 0,66 € → **0,59 €** |
| jus        |   8,00 € → **7,20 €** | proratisée sur le **net**  |  10 % | 0,80 € → **0,72 €** |
| course     | 10,00 € → **10,00 €** | proratisée sur le **brut** |  20 % | 2,00 € → **2,00 €** |
|            |                       |                            |       |          **3,31 €** |

Les deux lignes de marchandise perdent chacune 10 % d'assiette — 12,00 × 18/20
et 8,00 × 18/20, dont la somme fait exactement les 18,00 € de net. **La course
ne bouge pas d'un centime.** C'est ça, « après la remise » : on ne fait pas de
geste commercial sur une prestation de transport.

**Total = 18,00 + 10,00 + 3,31 = 31,31 €.**

> 🔴 **Ces nombres sont un TEST**, pas une illustration :
> `packages/money/src/__tests__/exemple-doc.spec.ts`. Un exemple arithmétique
> dans un document est la forme de documentation qui pourrit le plus
> discrètement — une phrase fausse se remarque, un total faux se recopie. Ces
> deux cas échouent le jour où la ventilation change, et ce paragraphe devient
> alors une chose à corriger plutôt qu'un piège.

> ⚠️ **Le second panier n'est pas représentable aujourd'hui** : une remise vient
> d'un point de RETRAIT, et une course d'une LIVRAISON — un panier réel porte
> l'une ou l'autre. Les deux sont montrés ensemble parce que `ventilateVat` les
> traite ensemble, et que c'est le seul moyen de voir la différence de
> traitement sur un même tableau.

**Deux bornes, et elles ne sont pas symétriques :**

- une **remise** est bornée au sous-total (`discountCentsOf`). Au-delà, elle
  rendrait une assiette négative — un avoir déguisé en commande ;
- des **frais** ne le sont pas (`cartAdjustmentCents`). Douze euros de course
  sur dix euros de marchandise est une commande ordinaire.

C'est la distinction que `P4` a dû poser : elles se calculaient avec la même
fonction, et la remise n'était bornée que d'un côté.

### Le total ne se recompose jamais

`ventilateVat` rend `totalCents`. **On le prend.** Il ne se refait pas à côté,
même quand l'addition semble évidente — c'est exactement ce que `Order.draft`
faisait jusqu'au 2026-09-06, et le §4 dit ce que ça coûtait.

Côté commande, le point d'entrée est `computeOrderTotals` (`orders/domain/
services/vat.ts`), qui rend `{ vatCents, totalCents }` et porte les règles
propres à la commande : ce que la remise touche, et le refus de facturer une
surtaxe sans taux.

---

## 3. L'éco-contribution, de bout en bout

Prenons le cas concret : une contribution environnementale de 0,15 € par
commande, au taux des marchandises, due à l'État donc non remisable.

Les réponses aux quatre questions : **terme de panier** (elle répond à « ce que
cette commande emballe », pas à ce qu'un croissant vaut), **par commande**,
**après la remise**, **taux par réglage** (personne chez nous ne tranche un taux
d'éco-contribution).

Ce qu'il faut alors toucher, groupé par ce que chaque groupe fait. L'ordre est
celui dans lequel on l'écrit.

### a. Le réglage — d'où vient le montant

Une table de réglage et son mur, sur le modèle de `order_late_fees` : un
`CartAdjustment` (`mode` + `value`, jamais un flottant) et son
`vatRatePercent`. Un `CHECK` d'unicité si le réglage est unique pour la maison.

Puis : le port de lecture, l'adaptateur Prisma, le contrat Zod, le contrôleur
d'administration, l'écran de réglage.

> ⚠️ **Un réglage absent doit rester un état valable.** « Aucune
> éco-contribution » est une réponse, pas un trou : c'est l'état d'avant, et
> c'est celui de toutes les commandes tant que personne n'a réglé.

### b. Le calcul — où le montant entre dans l'argent

| Fichier                                          | Ce qu'on y fait                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `orders/domain/services/vat.ts`                  | `VatInput` gagne `ecoFeeCents` + `ecoFeeVatRate`. `extrasOf` le pousse dans `extras` — **jamais dans `lines`**                         |
| `orders/domain/entities/order.ts`                | `DraftOrderInput` et `OrderToPlace` le portent ; le constructeur aussi. **Rien à ajouter au total** : il vient de `computeOrderTotals` |
| `application/services/order-drafting.service.ts` | résout le montant depuis le réglage, avant de composer                                                                                 |
| `prisma/schema.prisma` + migration               | deux colonnes : `eco_fee_cents`, `eco_fee_adjustment` (JSON, l'ajustement **et** son taux, figés)                                      |
| `infrastructure/prisma-order.repository.ts`      | l'écrit                                                                                                                                |
| `infrastructure/prisma-order.reader.ts`          | le relit                                                                                                                               |

> 🔴 **Le taux voyage AVEC le montant, figé.** Il ne se recalcule pas : le
> réglage aura changé, et « à quel taux cette commande a-t-elle été facturée »
> est précisément la question qu'un comptable pose six mois plus tard.

### c. Le devis — sans quoi la boutique ment

`POST /shop/quote` chiffre le panier **avant** la commande. Un terme qui entre
dans la commande et pas dans le devis fait voir au client un total que la caisse
contredit — c'est le défaut que tout `P7` existait pour refermer.

| Fichier                                            | Ce qu'on y fait                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/shop-quote.ts`                      | `ShopQuoteView` gagne son champ                                                                                                                               |
| `application/queries/quote-shop-cart.handler.ts`   | le passe en `extras` de `ventilateVat`                                                                                                                        |
| `application/services/cart-adjustments.service.ts` | s'il dépend de l'acheminement — sinon, une lecture à part                                                                                                     |
| `test/shop-quote.e2e-spec.ts`                      | le test qui **énumère les clés** de la réponse doit être mis à jour, sinon il rougit. C'est voulu : élargir une réponse publique est une décision de sécurité |

⚠️ **La surtaxe de retard, elle, n'est PAS dans le devis** — et c'est correct :
elle dépend d'une dérogation qui n'existe pas encore au moment du devis. Une
éco-contribution, si.

### d. L'affichage — une ligne, la même des deux côtés

| Fichier                             | Ce qu'on y fait                                                            |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `contracts/src/order.ts`            | `OrderView` porte le montant et son ajustement figé                        |
| `b2b-ui/src/order/order-pricing.ts` | `orderTotalRows` gagne sa ligne, **dans l'ordre où la formule additionne** |
| `b2b-ui/src/order/order-format.ts`  | le libellé, qui nomme l'ajustement plutôt que de le chiffrer deux fois     |

Trois règles, reprises telles quelles de la surtaxe :

1. **placée dans l'ordre d'addition.** Remontée d'un cran, elle se lirait comme
   remisée ;
2. **rendue seulement si elle existe.** « Éco-contribution 0,00 € » ferait
   chercher une taxe qui n'a pas eu lieu, sur toutes les commandes ;
3. **la même ligne des deux côtés** — le client la voit, le commercial voit la
   même phrase, et une conversation au téléphone se raccroche à quelque chose.

---

## 4. Les pièges, et ce qu'ils ont coûté

### 🔴 Le piège principal : ajouter le terme à moitié

Jusqu'au 2026-09-06, il y avait **deux définitions du TTC** : `ventilateVat` en
rendait une, `Order.draft` recomposait l'autre à la main. Elles tombaient juste,
et c'est ce qui rendait la chose dangereuse.

Un terme ajouté aux seuls `extras` serait entré dans la **TVA** sans entrer dans
le **total** : une commande dont l'assiette taxée dépasse ce qu'elle encaisse.
Ajouté au seul total, il aurait été facturé **sans taxe**. Aucun test n'aurait
rougi — aucun ne comparait les deux définitions.

`P4` a supprimé la seconde. **Il n'y a donc plus qu'une liste à tenir** :
`extrasOf`. C'est ce qui rend ce document court.

### Les autres, par ordre de fréquence

| Piège                                    | Ce qui l'évite                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Un montant en euros flottants            | `CartAdjustment` : `bp` ou `cents`, entiers. La porte `lint:money-units` garde les noms                    |
| Un taux par défaut                       | Lever. `MissingLateFeeVatRateError` est le modèle                                                          |
| Un terme à zéro dans la ventilation      | `extrasOf` saute les montants nuls — sans quoi un terme à zéro exigerait un taux que personne n'a réglé    |
| Le terme dans `lines` au lieu d'`extras` | Il se ferait remiser. Un test le dit — « n'est pas remisée par la remise de retrait »                      |
| Le taux recalculé à la relecture         | Le figer sur la commande, à côté du montant                                                                |
| Le devis oublié                          | Le client voit un total, en paie un autre                                                                  |
| La formule recopiée dans un commentaire  | Une troisième définition du TTC. Il y en avait une dans `schema.prisma`, et il lui manquait déjà `lateFee` |

---

## 5. La liste, à cocher

- [ ] Les quatre questions du §1 ont une réponse écrite quelque part
- [ ] Le montant est un `CartAdjustment`, pas un nombre
- [ ] Le taux vient d'une constante **ou** d'un réglage — jamais d'un défaut
- [ ] `extrasOf` le pousse dans `extras`, et rien n'a été ajouté à un total
- [ ] Deux colonnes : le montant, et l'ajustement **avec son taux**, figés
- [ ] Le devis de la boutique le porte, ou une raison écrite dit pourquoi non
- [ ] Le test qui énumère les clés de `/shop/quote` est à jour
- [ ] Une ligne d'affichage, dans l'ordre d'addition, absente quand le montant est nul
- [ ] Un test qui prouve qu'il n'est **pas** remisé
- [ ] Un e2e qui compare le devis à la commande sur le même panier

---

## 6. Ce qui a été vérifié, et où

| Affirmation                                                   | Où                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `ventilateVat` rend `totalCents`, jamais recomposé            | `packages/money/src/vat.ts:132`                         |
| Les extras sont proratisés sur le brut, les lignes sur le net | idem, `:112`–`:116`                                     |
| La TVA est groupée par taux, arrondie une fois par groupe     | idem, `:119`–`:124`                                     |
| La remise est bornée au sous-total                            | idem `:104`, et `contracts/src/cart-adjustment.ts:52`   |
| Des frais ne sont pas bornés                                  | `cart-adjustment.ts:24`                                 |
| Un extra nul n'entre pas                                      | `orders/domain/services/vat.ts`, `extrasOf`             |
| Une surtaxe sans taux lève                                    | idem, `MissingLateFeeVatRateError`                      |
| `Order.draft` ne recompose plus le total                      | `orders/domain/entities/order.ts`, `computeOrderTotals` |
| Le taux est figé à côté du montant                            | `contracts/src/order-late-fee.ts`, `LateFeeAdjustment`  |
| L'affichage saute un montant nul                              | `b2b-ui/src/order/order-pricing.ts:123`                 |
| La réponse du devis est énumérée par un test                  | `apps/lfd-api/test/shop-quote.e2e-spec.ts`              |
| Ajouter la surtaxe a touché 22 fichiers, puis 13              | `git show --stat 455b3cea` et `ea922223`                |
| Les nombres du §2 sortent de la vraie fonction                | `packages/money/src/__tests__/exemple-doc.spec.ts`      |

⚠️ **Non soumis à un contradicteur.** Chaque affirmation de l'existant a été
ouverte dans le dépôt — la table dit laquelle et où.
