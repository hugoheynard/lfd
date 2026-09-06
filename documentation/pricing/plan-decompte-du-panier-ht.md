# Le décompte du panier — en HT, comme la facture

> **État : 🟢 livré, sauf B5.** Écrit puis bâti le 2026-09-05. B1 à B4 sont dans
> le code ; **B5 (la surtaxe de retard) attend la réponse du §7.2**.
>
> Les §2 à §6 décrivent le raisonnement TEL QU'IL A ÉTÉ FAIT, avant la bascule —
> ils sont conservés parce que c'est là qu'est la démonstration, pas dans le
> résultat. Chaque écart porte désormais son encart de sortie. Ce qui a été
> tranché : **les frais de zone sont hors taxe** (Hugo, 2026-09-05), et le
> panier ne qualifie plus un taux par catégorie — chaque article porte le sien,
> résolu par le back, par héritage de famille ou en propre.

Ce document dit **ce que le panier doit montrer**, dans quel ordre, et ce que le
rayon doit écrire à côté d'un prix. Il ne décrit pas un écran de plus : il
constate que le serveur facture déjà exactement comme ça, et que le front
raconte l'autre histoire.

---

## 0. Ce qui est demandé

Le décompte du panier, dans cet ordre :

1. la liste des articles ;
2. **sous-total HT** ;
3. **coursier** _ou_ **remise** ;
4. **total TVA 5,5 %**, **total TVA 10 %**, **total TVA 20 %** ;
5. **total TTC**.

Et, au rayon : **quand un prix est HT, il le dit**.

La conjonction du point 3 n'est pas un raccourci d'écriture : la remise est un
attribut du **retrait**, les frais sont un attribut de la **livraison**, et
`ServiceChoice` le porte déjà — « zéro en livraison » pour l'une, « zéro en
retrait — toujours » pour l'autre. Les deux lignes ne peuvent pas coexister,
et une mise en page qui réserve la place des deux réserve la place d'un état
impossible.

---

## 1. Le décompte, dans l'ordre

**Livraison** — 12 croissants à 1,00 € HT (5,5 %), 4 quiches à 3,00 € HT (10 %),
coursier 20,00 € HT :

```
12  Croissant au beurre          1,00 € HT       12,00 €
 4  Quiche lorraine              3,00 € HT       12,00 €
─────────────────────────────────────────────────────────
    Sous-total HT                                24,00 €
    Coursier                                     20,00 €
    TVA 5,5 %                                     0,66 €
    TVA 10 %                                      1,20 €
    TVA 20 %                                      4,00 €
─────────────────────────────────────────────────────────
    Total TTC                                    49,86 €
```

**Retrait au Labo, remise 10 %** — même marchandise :

```
    Sous-total HT                                24,00 €
    Remise retrait au Labo −10 %                 −2,40 €
    TVA 5,5 %                                     0,59 €
    TVA 10 %                                      1,08 €
─────────────────────────────────────────────────────────
    Total TTC                                    23,27 €
```

Trois choses se lisent dans ces deux blocs, et elles sont la spécification :

- **une ligne de TVA n'existe que si son taux est présent.** Pas de coursier,
  pas de ligne à 20 % — et surtout pas une ligne à `0,00 €`, qui fait douter du
  calcul plutôt que de rassurer. La règle existe déjà côté front, elle est juste,
  elle se garde ;
- **la remise porte sur le HT**, avant la TVA, et réduit donc la base taxable.
  L'annoncer sur le TTC afficherait une TVA que personne ne paie ;
- **le coursier porte sa propre TVA**, à 20 %, et c'est lui — pas la marchandise
  — qui fait apparaître la troisième ligne. Une commande de pain livrée a une
  ligne de TVA à 20 % ; c'est correct, et c'est contre-intuitif tant qu'on
  regarde le panier comme une liste de gâteaux.

---

## 2. Ce n'est pas un choix d'écran : c'est déjà le modèle du serveur

`Order.draft()` compose exactement ce décompte
([`order.ts:189-207`](../../apps/lfd-api/src/b2b/orders/domain/entities/order.ts)) :

| Terme              | Ce que le domaine en fait                                    |
| ------------------ | ------------------------------------------------------------ |
| `subtotalCents`    | somme des totaux de ligne, **HT**                            |
| `discountCents`    | **HT**, retranchée du sous-total                             |
| `deliveryFeeCents` | **HT**, ajoutée _après_ la remise                            |
| `lateFeeCents`     | **HT**, ajoutée sur la même ligne que les frais              |
| `vatCents`         | par taux, sur le **net** de remise, + la livraison à 20 %    |
| `totalCents`       | `(sous-total − remise) + frais + surtaxe + TVA` — le **TTC** |

Et le moteur de TVA
([`vat.ts`](../../apps/lfd-api/src/b2b/orders/domain/services/vat.ts)) l'écrit
en toutes lettres dès sa deuxième phrase : _« Les prix du catalogue sont HT. »_
Il regroupe par taux, déduit la remise **au prorata de chaque groupe**, applique
le taux au net, et taxe le transport à `DELIVERY_VAT_RATE = 20` — une constante
de domaine, justifiée sur place : le taux d'une prestation de transport ne se
paramètre pas par boutique.

La route publique dit la même chose : `ShopItemView.unitPriceMillicents` est
documenté « le prix unitaire **HT en millicentimes** », et c'est le prix
canonique.

**Le serveur sert du HT, facture du HT, et ventile la TVA par taux.** Ce que
demande le §0 n'est donc pas une préférence d'affichage : c'est la seule
présentation qui décrive ce qui se passe réellement.

---

## 3. Ce que le front montre aujourd'hui — l'autre modèle

`cart-total.ts` fait l'inverse, et son JSDoc l'assume :

1. `ttcMillicentsOf()` convertit chaque prix **HT → TTC** dès la vignette ;
2. le sous-total est **TTC** ;
3. la remise s'applique au **TTC** ;
4. la TVA est **extraite** du TTC (`net × t / (100 + t)`), affichée en « dont
   TVA » ;
5. les frais de coursier sont ajoutés **après** la TVA, donc **non taxés**.

Le rayon suit : la vignette, la fiche et son bouton « Au panier · 1,06 € »
affichent tous du TTC, sans mention.

Ce modèle n'est pas absurde — il décrit une vitrine grand public, où le prix
affiché est le prix payé. Il est simplement **faux ici** : la boutique sert des
professionnels, qui récupèrent la TVA et raisonnent en HT, et la caisse derrière
compte en HT.

---

## 4. Les écarts, et ce qu'ils coûtent

### 4.1 🔴 Le coursier n'est pas taxé — le seul écart de MONTANT

C'est le seul endroit où les deux modèles ne rendent pas le même nombre, et
l'écart est structurel, pas un arrondi.

Sur l'exemple du §1 : le front annonce **45,86 €**, le serveur facture
**49,86 €**. Quatre euros, soit exactement les 20 % du coursier — le client voit
un prix et la caisse en prélève un autre.

L'écart vaut `20 % × frais`. Les zones de la maquette portent 20 € et 50 € ; s'il
s'agit bien de montants HT, l'écart est de 4 € et 10 €.

> ✅ **Corrigé le 2026-09-05 (B2).** Les frais de zone sont hors taxe — c'est
> tranché. Le décompte les passe désormais à `ventilateVat` comme un terme hors
> remise au taux du transport, et le test de non-régression porte l'exemple du
> §1 : « porte sa TVA à 20 %, comme la caisse la facture ».

⚠️ **Ce document n'affirme pas que ce sont les frais de production.** Il affirme
que le front ajoute les frais hors taxe et que `computeVatCents` les taxe. La
valeur réelle des zones est à confronter aux données avant de chiffrer le
préjudice.

### 4.2 La ventilation par taux n'existe nulle part

`computeVatCents` **groupe par taux, puis somme** : elle rend un entier. La
ventilation — ce que le §0 demande à voir, une ligne par taux — est calculée à
l'intérieur de la fonction et jetée à la sortie.

Le front, lui, la reconstruit à sa façon, par extraction depuis le TTC.

Il y a donc **deux implémentations de la même règle fiscale**, dont une seule
produit un résultat visible. C'est la configuration exacte qui a déjà coûté : là
où deux modèles calculent le même nombre, ils finissent par ne plus le faire.

Et ce n'est pas une dette de confort : **la facture aura besoin de la même
ventilation**. [`architecture-facturation.md`](../b2b/architecture-facturation.md)
prévoit du Factur-X dès le départ, et le format impose une décomposition de TVA
par taux. Faire la ventilation ici, c'est la faire une fois pour trois lecteurs
— le panier, la commande, la facture.

### 4.3 La légende à deux valeurs ment dès qu'un taux à 20 % entre

vat-rates.ts ne connaît que `VAT_SALE = 10`, et `cart-summary.ts` légende
chaque ligne par `rate === VAT_SALE ? « salé, traiteur » : « pain, viennoiserie,
pâtisserie »`. Un article à 20 % — ou la ligne du coursier — se verrait donc
légendé **« pain, viennoiserie, pâtisserie »**.

Le fichier se protège par un commentaire honnête : « une comparaison à côté
n'affiche qu'un mauvais libellé, jamais un mauvais montant ». C'est vrai, et
c'est quand même à retirer : à trois taux la légende n'apporte plus rien que
`TVA 20 %` ne dise déjà, et elle devient un piège dont la maintenance dépend
d'une convention à deux valeurs.

**Proposition : supprimer la légende.** `TVA 5,5 %` se suffit.

> ✅ **Fait le 2026-09-05 (B3).** vat-rates.ts est supprimé, la légende avec.
> Le taux d'une ligne n'est plus qualifié par une famille de produits : chaque
> article porte le sien (`ShopItemView.vatRatePercent`), résolu par le back — en
> propre ou hérité de sa famille — et le décompte se contente de grouper. Une
> ligne par taux, sans exception : c'est une exigence légale, pas une mise en
> page.

### 4.4 La surtaxe de commande tardive n'est jamais montrée

`lateFeeCents` existe dans le domaine, `computeVatCents` refuse de la taxer sans
taux réglé, et le mot n'apparaît **nulle part** dans le front de la plateforme
(zéro occurrence de `lateFee` dans `apps/lfc-B2B-platform-frontend/src`).

À vérifier avant d'en faire un lot : dans quelles conditions elle s'applique
réellement à une commande client, et si le parcours actuel peut la déclencher.
Si oui, c'est un montant que le client découvre à l'encaissement.

### 4.5 Ce qui, contre toute attente, ne diverge PAS

La remise. On s'attend à ce que « −10 % sur le TTC » et « −10 % sur le HT puis
TVA » donnent deux nombres ; ils donnent le même. L'extraction et l'addition sont
des opérations inverses, et appliquer le même pourcentage à chaque ligne revient
au prorata par taux que fait le serveur.

Vérifié sur le second bloc du §1 : les deux chemins rendent **23,27 €**, avec les
mêmes lignes de TVA à 0,59 € et 1,08 €.

⚠️ **Ce n'est pas une preuve, c'est deux cas.** Les doubles arrondis (HT → TTC
par article, puis TTC → net, puis extraction) peuvent séparer les deux modèles
d'un centime sur d'autres valeurs. L'intérêt de la constatation est ailleurs :
elle dit que **la bascule en HT est un changement de présentation**, pas une
refonte du calcul — sauf pour le coursier. Le lot est donc plus court et plus sûr
qu'il n'en a l'air.

---

## 5. Le rayon : « HT » est une mention, pas une décoration

En France, un prix alimentaire affiché sans mention se lit **TTC**. Une vignette
qui écrit `1,00 €` en pensant HT ment à son lecteur, et c'est le seul point du
§0 qui ne soit pas qu'une question de goût.

Proposition, et elle est la même partout :

| Où                        | Ce qui s'affiche                            |
| ------------------------- | ------------------------------------------- |
| Vignette du rayon         | `1,00 € HT`                                 |
| Fiche produit             | `1,00 € HT` + `1,06 € TTC` en second niveau |
| Bouton « Au panier · … »  | le **HT**, mention comprise                 |
| Lignes du panier          | prix unitaire **HT**, total de ligne **HT** |
| Barre de panier flottante | le **total TTC** — c'est ce qui sera débité |

Le rayon en HT et le total en TTC ne se contredisent pas : c'est ce que fait
toute facture. Ce qui serait incohérent, c'est de les mélanger sans les nommer.

---

## 6. Qui calcule ? — une implémentation, trois lecteurs

Deux chemins possibles, et le choix compte plus que le reste du document.

**A. Une route de devis.** Le panier envoie ses lignes, le serveur rend le
décompte ventilé. Un seul calcul, celui qui fait autorité.
❌ Le panier change à **chaque `+` et chaque `−`**. Une route par frappe, c'est
le facteur multiplicatif du front payé sur le chemin le plus chaud de l'app —
et un décompte qui clignote hors ligne.

**B. Une fonction pure partagée.** La ventilation descend dans `@lfd/money` ;
`computeVatCents` devient un appelant qui somme ce qu'elle rend ; le panier
appelle la même fonction avec les mêmes entrées.
✅ Une implémentation, aucun aller-retour, et le décompte reste exact
localement. **C'est la recommandation.**

> ✅ **B est livré le 2026-09-05 (B1).** `ventilateVat` vit dans
> `packages/money/src/vat.ts`. Il y avait **trois** copies, pas deux : le
> domaine `orders`, le panier de la boutique, et legacy/data/vat.ts, dont
> l'en-tête assumait la duplication en toutes lettres. Les trois délèguent
> désormais. Un changement de comportement à connaître : un extra rejoint le
> **groupe de son taux** au lieu d'être arrondi à part, ce qui peut déplacer un
> total d'un centime sur une commande portant à la fois de la marchandise à
> 20 % et des frais — dans le sens juste. Les 10 tests existants de
> `computeVatCents` passent inchangés.

Ce qui la rend possible, et qui est vérifié : `@lfd/money` n'a **aucune**
dépendance de production, et le domaine `orders` l'importe déjà
(`order-line.ts`). La règle « le domaine ne dépend de rien » n'est donc pas
entamée par ce déplacement — elle l'est déjà, délibérément, pour l'arithmétique
exacte.

Forme proposée :

```ts
export interface VatBreakdown {
  readonly subtotalHtCents: number;
  readonly discountCents: number;
  readonly feeCents: number;
  /** Une part par taux RÉELLEMENT présent, du plus bas au plus haut. */
  readonly vat: readonly VatShare[];
  readonly totalCents: number;
}
```

⚠️ **La fonction partagée ne fait pas d'elle-même la vérité.** Tant que le front
lui passe des frais qu'il croit TTC et le serveur des frais HT, une seule
implémentation rendra deux nombres. L'unité des frais est à trancher **avant**
le déplacement, pas après (§7).

---

## 7. Ce qu'il reste à trancher

1. ~~**Les frais de zone sont-ils HT ?**~~ **Oui** (Hugo, 2026-09-05). Le §4.1
   était donc un bug de FACTURATION affiché, pas une question d'unité.
2. **La surtaxe de commande tardive concerne-t-elle le parcours client ?** Si
   oui, elle doit apparaître au décompte, entre le coursier et la TVA. **Reste
   ouverte** — c'est le seul lot non livré (B5).
3. ~~**La fiche produit montre-t-elle le TTC en second niveau ?**~~ Non : elle
   montre le HT, mention comprise, comme le rayon. Un second nombre à côté du
   premier redemanderait au lecteur de choisir lequel compte.
4. ~~**La légende par taux disparaît-elle ?**~~ Oui (§4.3).

---

## 8. Les lots

| Lot    | Ce qu'il fait                                                                                              | État              |
| ------ | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| **B1** | La ventilation par taux descend dans `@lfd/money`, testée ; les **trois** copies délèguent.                | ✅ 2026-09-05     |
| **B2** | Le coursier porte sa TVA au décompte du panier. **Corrige l'écart de montant.**                            | ✅ 2026-09-05     |
| **B3** | Le décompte passe en HT : sous-total HT, remise/coursier, une ligne par taux, total TTC. La légende tombe. | ✅ 2026-09-05     |
| **B4** | Le rayon, la fiche et le bouton portent la mention `HT`. Copie fr/en/it.                                   | ✅ 2026-09-05     |
| B5     | La surtaxe de commande tardive, **si** le §7.2 dit qu'elle s'applique.                                     | ⏸️ attend le §7.2 |

B1 était incolore par construction — c'est ce qui a permis de la livrer d'abord
et de vérifier qu'elle ne bougeait rien (les 10 tests de `computeVatCents`
passent inchangés) avant que quoi que ce soit d'autre s'appuie dessus.

**Ce que la commande passée porte désormais** : `PlacedLine.unitPriceCents` est
en **hors taxe**. Elle figeait du TTC, c'est-à-dire une unité que ni la caisse ni
la facture n'emploient.

---

## 9. Ce que ce document a ouvert

Les affirmations sur l'existant viennent de ces fichiers, relus le 2026-09-05 :

- `apps/lfd-api/src/b2b/orders/domain/services/vat.ts`
- `apps/lfd-api/src/b2b/orders/domain/entities/order.ts`
- `apps/lfd-api/src/b2b/catalog/application/queries/read-shop-catalogue.ts`
- `packages/contracts/src/shop-catalogue.ts`
- `packages/money/src/millicents.ts`, `packages/money/package.json`
- `apps/lfc-B2B-platform-frontend/src/app/client/cart/cart-total.ts`,
  `cart-summary/cart-summary.{ts,html}`, `client-cart.service.ts`
- .../client/shop/vat-rates.ts (supprimé), `product-tile/product-tile.{ts,html}`,
  `product-sheet/product-sheet.html`, `format-money.ts`
- `.../client/order-context.store.ts`, et la maquette de station
  (client/mock-station.ts, **supprimée le 2026-09-06**)
- `.../client/copy/fr.ts`

**Ce qu'il n'affirme pas** : que les frais de zone en production valent 20 € et
50 € (ce sont les valeurs de la maquette) ; que les deux modèles coïncident sur
toutes les valeurs (§4.5) ; que la surtaxe de retard atteint aujourd'hui un
panier client (§4.4).

**Ce qui n'a pas été fait** : le contradicteur. Ce plan touche à l'argent, et la
convention du dépôt le rend obligatoire — il n'a pas été lancé, sur consigne de
session. Ce qu'il aurait pu attraper reste donc à relire à la main.

**Ce que la mise en œuvre a appris, et que le plan ne disait pas** :

- il y avait **trois** implémentations de la ventilation, pas deux —
  legacy/data/vat.ts en portait une, et son propre en-tête l'assumait
  (fichier supprimé le 2026-09-06, avec le panier hérité) ;
- la remise ne divergeait effectivement pas (§4.5), et la bascule s'est donc
  faite sans qu'aucun total de marchandise ne bouge : le seul nombre modifié est
  celui d'une livraison ;
- `pnpm lint` était **déjà rouge** sur `dev` avant ce chantier, sur trois
  fichiers qu'aucun lot ne touchait. Les tests, les portes et le build AOT
  étaient verts — le lint, lui, n'avait pas été lancé à la racine. Corrigé dans
  la foulée.
