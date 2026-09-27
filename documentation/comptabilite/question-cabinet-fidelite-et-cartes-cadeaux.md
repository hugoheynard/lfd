# Question au cabinet comptable — bons de fidélité et cartes cadeaux

> **Ouverte le 2026-09-26.** Envoyée par Hugo au cabinet comptable. **Sans
> réponse à ce jour.** Hugo a tranché la question 1 le 2026-09-27 : **rabais
> (A)** ; la réponse du cabinet vaut désormais confirmation. Quand elle arrive, elle se range au §2, datée, et les
> documents qui en dépendent se mettent à jour :
> [`points-de-fidelite.md`](points-de-fidelite.md) §8 et le lot C de
> [`plan-points-de-fidelite.md`](plan-points-de-fidelite.md).
>
> Les chiffres de l'exemple ont été calculés le 2026-09-26 avec l'arrondi de
> `ventilateVat` (`packages/money/src/vat.ts`) : une TVA arrondie par taux, sur
> l'assiette de ce taux.

## 1. Le message

**Objet : traitement TVA et comptable d'un bon de fidélité, et des cartes
cadeaux**

Bonjour,

Nous mettons en place un programme de fidélité sur notre boutique en ligne et
notre plateforme professionnelle, et nous vendrons aussi des cartes cadeaux.
Avant de développer l'utilisation des bons et des cartes, nous avons besoin de
votre avis sur leur traitement fiscal et comptable.

**Le fonctionnement du programme de fidélité**

- Chaque commande payée et remise au client lui rapporte des points, à raison
  d'un point par centime du **montant hors taxe** des marchandises, remise
  déduite. Le port et les frais n'en rapportent pas.
- Le client convertit ses points en **bon de fidélité** d'un montant fixe
  **hors taxe**, par exemple 1 000 points pour un bon de 5 € HT.
- Le bon est **offert** : il n'est jamais vendu, jamais remboursé et jamais
  convertible en espèces. Il est valable un an.
- Le client l'utilise sur une commande suivante, chez nous uniquement. Si le bon
  dépasse le panier, la différence devient un nouveau bon, valable jusqu'à la
  même date.
- Pour un particulier, les points appartiennent à la personne. Pour un client
  professionnel, quand le programme lui sera ouvert, ils appartiendront à la
  société.

**Question 1 : la TVA sur la commande où le bon de fidélité est utilisé**

Exemple : une tarte à 14,22 € HT (TVA 5,5 %, soit 15,00 € TTC) et une tablette
de chocolat au lait à 4,17 € HT (TVA 20 %, soit 5,00 € TTC). Le panier fait
18,39 € HT, soit 20,00 € TTC. Le client utilise un bon de fidélité de
4,00 € HT.

|                  | A. Le bon est une réduction de prix | B. Le bon est un moyen de paiement |
| ---------------- | ----------------------------------- | ---------------------------------- |
| Tarte            | 11,13 € HT, TVA 0,61 €              | 14,22 € HT, TVA 0,78 €             |
| Chocolat         | 3,26 € HT, TVA 0,65 €               | 4,17 € HT, TVA 0,83 €              |
| **TVA déclarée** | **1,26 €**                          | **1,61 €**                         |
| Facture          | 15,65 € TTC                         | 20,00 € TTC                        |
| Règlement        | 15,65 € par carte                   | carte + bon                        |

En A, le bon de 4 € HT est réparti au prorata du montant hors taxe de chaque
taux de TVA, et la TVA est arrondie une fois par taux. Le client paie 4,35 € de
moins que le prix plein : il bénéficie aussi de la TVA sur la remise.

En B, le bon réglerait une partie d'une facture TTC. Il devrait alors avoir une
valeur TTC, puisqu'un moyen de paiement n'a pas de montant hors taxe. Notre
choix d'un bon en HT n'a donc de sens que si A s'applique.

Notre compréhension, à confirmer : un bon remis gratuitement par le vendeur et
utilisé chez lui est une réduction de prix (A). Un bon vendu, comme une carte
cadeau, est un moyen de paiement (B). Nos bons de fidélité ne sont jamais
vendus. **Lequel de ces deux traitements doit-on appliquer ?**

**Question 2 : la comptabilisation des bons de fidélité**

- Les points gagnés mais pas encore convertis, puis les bons émis mais pas
  encore utilisés, doivent-ils être comptabilisés, par exemple par une
  provision ou un produit constaté d'avance ? Ou rien ne se passe avant
  l'utilisation du bon ?
- Que devient comptablement un bon qui expire sans avoir été utilisé ?
- À la clôture, nous pouvons produire l'état des points en cours et des bons
  non utilisés, avec leur valeur HT. Est-ce utile ?

**Question 3 : la facture**

Quelles mentions doit porter la facture d'une commande où un bon de fidélité
est utilisé : une ligne « Remise fidélité » en HT, une ventilation par taux,
d'autres mentions ?

**Question 4 : les clients professionnels**

Le traitement change-t-il quand le titulaire des points est une société, et que
la facture est payée à terme ?

**Question 5 : les cartes cadeaux**

Nous vendrons aussi des cartes cadeaux, payées par le client, utilisables sur
toute la boutique, dont les produits sont à 5,5 % et à 20 %.

- Nous les comprenons comme des bons **à usages multiples** : pas de TVA à la
  vente, TVA due à l'utilisation, au taux des articles achetés. Est-ce exact ?
- Comment comptabiliser la vente d'une carte non encore utilisée, et une carte
  qui expire sans avoir été utilisée ?
- Sur une même commande, un client peut utiliser à la fois un bon de fidélité
  (question 1) et une carte cadeau. Confirmez-vous que le bon réduit la base de
  TVA, alors que la carte ne fait que régler une partie du montant TTC ?

Merci d'avance,

## 2. La réponse

_Pas encore reçue._
