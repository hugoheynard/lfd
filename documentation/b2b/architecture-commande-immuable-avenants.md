# La commande est un fait clos — les modifications sont des avenants

**État : 📐 doc-first.** Rien de ce document n'est codé. Il tranche deux
questions liées, avant qu'un écran ne fige la mauvaise réponse.

---

## Les deux décisions

### 1. Une commande passée ne se modifie plus

Elle est un **fait daté**, pas un panier avec un statut. Ce qui a été commandé,
au prix appliqué ce jour-là, avec la remise consentie ce jour-là, ne bouge plus.

Ce n'est pas de la rigidité de principe : **une partie des clients règle
immédiatement**. Une commande à 298,27 € encaissée par carte a produit un
`PaymentIntent` Stripe de 29 827 centimes. Éditer ensuite ses lignes désynchronise
le montant encaissé de la commande qui le justifie — et personne ne sait plus
laquelle des deux valeurs fait foi. Le même raisonnement vaut pour un terme
différé dès que la facture est émise.

Le code y est déjà : l'agrégat `Order` n'expose **aucune** mutation de lignes ou
de montants. Ses deux seules méthodes d'état (`payByCard`, `deferPayment`)
décident du règlement, jamais du contenu.

### 2. Une modification est un **autre objet**, avec ses propres règles

Ajouter deux baguettes la veille, annuler une tarte, geste commercial après une
livraison ratée : trois choses différentes qui ne sont **pas** « la commande
modifiée ». Chacune a sa date, son auteur, son motif, son propre règlement — et
son propre droit d'exister (un avoir ne se crée pas avant livraison ; un
complément ne se crée pas après).

Un agrégat `OrderAmendment`, rattaché à une commande, en trois natures :

| Nature     | Ce que c'est                              | Effet sur l'argent        |
| ---------- | ----------------------------------------- | ------------------------- |
| `addition` | Lignes ajoutées après coup                | À encaisser en plus       |
| `removal`  | Lignes retirées avant préparation         | À rembourser ou à déduire |
| `credit`   | Geste commercial, sans contrepartie ligne | À rembourser ou à déduire |

Chacun porte ses propres lignes snapshotées, sa TVA, son total, et **son propre
état de règlement**. Un client qui paie à la commande règle son avenant à part ;
un client au terme le voit tomber sur la même facture.

**Conséquence à ne pas manquer** : le total « de la commande » cesse d'être une
colonne. C'est `commande + Σ avenants`, et c'est au **serveur** de le dire.

---

## Ce que l'UI a le droit de faire

**Aucun calcul d'argent. Aucun.** Ni TVA, ni total de ligne, ni net d'avenants,
ni conversion autre que centimes → euros pour l'affichage.

La raison n'est pas dogmatique : la TVA se calcule **par taux, remise déduite au
prorata, arrondie par groupe** ([`vat.ts`](../../apps/lfc-B2B-platform-backend/src/orders/domain/services/vat.ts)).
Deux implémentations de cette règle, c'est deux résultats à un centime près, et
un client qui compare son écran à sa facture. Une seule implémentation, côté
serveur, dans le domaine.

### État au 2026-08-10 — ce que l'UI calcule vraiment

Vérifié fichier par fichier, parce que « l'UI calcule » est une accusation qui se
prouve :

| Endroit                                    | Verdict                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| `order-detail` — montants                  | ✅ aucun calcul : tous lus depuis `OrderView`                   |
| `order-detail` — total de ligne            | ✅ `lineTotalCents`, calculé serveur                            |
| `order-detail` — TVA de ligne              | ✅ affiche le **taux** (`vatRate`), pas un montant              |
| `order-format` — `cents / 100`, `bp / 100` | ✅ conversion d'unité pour l'affichage, pas une règle de calcul |
| `order-documents` — total d'unités         | ✅ un **comptage** d'articles, pas de l'argent                  |

**Le front ne fait donc déjà aucune arithmétique monétaire sur la commande.**
Ce qui reste à corriger est plus subtil, et c'est le vrai sujet ci-dessous.

### Ce qui n'est PAS encore dumb

L'UI **compose le récapitulatif** : elle décide quelles lignes il contient
(« Sous-total HT », « Remise », « Livraison HT », « TVA », « Total TTC »), dans
quel ordre, avec quels libellés, et sous quelles conditions (la remise
n'apparaît que si elle est > 0). Elle dérive aussi le libellé de la remise du
snapshot d'adresse.

Ce n'est pas du calcul, mais c'est **de la règle métier dans le gabarit** — et
elle ne survivra pas aux avenants : « Avoir du 12/08 », « Complément réglé »,
« Net à payer » sont des lignes que le front devrait alors inventer.

---

## La cible : une vue de présentation, pas une vue de données

`OrderView` est aujourd'hui une **vue de données** — les colonnes, à plat. La
cible est une **vue de présentation** : le serveur rend le récapitulatif déjà
composé.

```ts
/** Une ligne du récapitulatif, telle qu'elle doit s'afficher. */
interface OrderAmountLine {
  readonly key: string; // 'subtotal' | 'discount' | 'amendment:xyz' | …
  readonly label: string; // « Retrait — La Folie Coffee Labo »
  readonly hint: string | null; // « −20 % »
  readonly cents: number; // signé : négatif = à déduire
  readonly emphasis: "normal" | "total";
}
```

L'UI ne fait plus que **boucler et formater**. Ajouter une nature d'avenant, un
éco-contribution, un acompte : une ligne de plus dans la vue, zéro ligne de front.

Et par ligne d'article, le serveur envoie aussi `vatCents` — pour que l'écran
puisse montrer un montant de TVA sans jamais le multiplier lui-même.

---

## Ordre de mise en œuvre

**Le récapitulatif serveur dépend du modèle d'avenants** : composer les lignes
avant de savoir s'il y en aura pour les avoirs, c'est le refaire deux fois.

1. **Avenants** — agrégat `OrderAmendment` (3 natures), persistance, règles de
   création par nature, règlement propre.
2. **Vue de présentation** — `OrderAmountLine[]` + `vatCents` par ligne, calculés
   dans le domaine, une seule fois, avenants inclus.
3. **UI** — le rail droit boucle sur la vue ; `discountLabel()` et la
   construction de `totals()` disparaissent de
   [`order-detail.ts`](../../packages/b2b-ui/src/order/order-detail/order-detail.ts).

La frise d'avancement, elle, **reste côté lib** : elle ne porte aucun montant,
seulement du vocabulaire dérivé de trois énumérations, et elle est testée sur
toute sa matrice. La déplacer au serveur coûterait un aller-retour pour une
valeur qui ne change jamais indépendamment de la commande.

---

## Ce que ce document ne tranche pas

- **Le droit de créer un avenant** selon l'avancement (un retrait après
  `fulfilled` ? un ajout après `in_production` ?) — à décider avec la production.
- **La facture** : elle agrégera commande + avenants d'une période. Sa
  numérotation n'existe pas (cf. l'encart Documents, qui l'annonce indisponible).
- **Le remboursement Stripe** d'un avoir sur commande réglée par carte.
