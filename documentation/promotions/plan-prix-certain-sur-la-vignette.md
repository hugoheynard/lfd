# Plan — le prix certain sur la vignette

> 📝 **Plan du 2026-11-01**, décision de Hugo (option c). Touche l'**argent**
> (un prix affiché) : `vitruve` avant le bâti.

## 1. Le constat (Hugo, en production, 2026-11-01)

Une promotion « −20 % » posée **au panier**, sur le retrait et la livraison.
Un particulier voit sur la vignette le prix normal et la mention « −20 %
retrait » ; la remise n'apparaît au panier qu'une fois l'acheminement choisi.
C'est la règle d'une remise au panier : elle dépend de l'acheminement, que le
rayon ne connaît pas
([`promotions.md`](promotions.md), mode `basket`).

Mais pour un lecteur qui n'a **qu'un acheminement ouvert** (le particulier :
retrait seulement), l'acheminement est connu d'avance.

## 2. La règle (option c)

Le rayon montre, à côté du prix de base barré, **le prix après la remise**
(« 4,00 € au retrait ») **seulement quand la remise est certaine pour ce
lecteur** :

1. chaque acheminement que son audience peut utiliser est visé par la
   promotion (le corollaire du correctif « une mention ne cite qu'un
   acheminement ouvert ») ;
2. la promotion ne restreint pas les points de retrait ou les zones (une
   promotion limitée à certains points n'est pas certaine : le client
   choisira peut-être un autre point) ;
3. aucune condition que le rayon ne peut juger : seuil de panier (montant ou
   quantité), créneau « certains jours et heures » hors de l'instant de la
   lecture, nombre de commandes ;
4. le cumul est celui de la caisse : le prix montré est **celui que la caisse
   calculera pour cette ligne seule** — même règle de choix entre remises
   (`basket-promotion-choice`), même portée d'articles
   (`@lfd/contracts/promotion-scope`), même arrondi. Jamais un calcul
   parallèle.

Sinon : la vignette garde la mention seule (option a).

Un écart d'un centime reste possible (la caisse arrondit sur le panier
entier) : la caisse retire toujours **au moins** ce que la vignette annonce
(règle déjà tenue, [`promotions.md`](promotions.md)) — à vérifier au bâti
pour ce nouveau prix.

## 3. Où

- **Serveur** : là où les mentions du rayon sont fabriquées
  (`b2b/promotions/application/shelf-promotion-offers.ts`,
  `b2b/catalog/application/shop-catalogue-offers.ts`) — la mention porte en
  plus, quand la remise est certaine, le prix net de la déclinaison pour ce
  lecteur. Le front n'en calcule aucun.
- **Boutique** : la vignette et la fiche produit affichent le prix barré et
  « X € au retrait » (libellé de l'acheminement certain).
- **Une audience, son information** : chaque appel ne reçoit que le prix de
  son audience (règle du 2026-10-31).

## 4. Les tests

- Particulier, promotion retrait + livraison sans condition → prix net
  montré ; même promotion limitée à un point → mention seule ; avec un seuil
  → mention seule.
- Pro (retrait et livraison ouverts), promotion retrait seulement → mention
  seule.
- Parité : le prix net de la vignette = la ligne seule au devis pour le même
  lecteur, au retrait.
- Article au poids : prix au kilo net, même règle.

## 5. Après vitruve (2026-11-01) — fait foi sur les §§ 2–4

1. **Le prix net est arrondi en faveur du client, par pièce.** La caisse
   arrondit sur l'assiette (`packages/contracts/src/cart-adjustment.ts`) :
   annoncer `round(p × taux)` par pièce peut dépasser ce qu'elle retire dès
   2 pièces (103 c à −20 % : 21 c annoncés par pièce, 41 c retirés pour 2).
   La vignette annonce une remise **arrondie vers le bas** par pièce, donc un
   net **arrondi vers le haut** : `q × ⌊p × taux⌋ ≤ ⌊q × p × taux⌋ ≤ arrondi
de la caisse`, pour toute quantité. Test de parité à 1, 2, 3 et 7 pièces,
   et au poids.
2. **Seulement `percent_off`.** Un montant fixe s'applique au panier, pas à
   une ligne : jamais de prix net pour lui.
3. **Liste blanche, pas liste noire.** Est certaine une promotion qui n'a
   AUCUNE condition, hors l'audience et les acheminements — un `switch`
   exhaustif sur les conditions : toute condition (seuil de panier, minimum
   de quantité par ligne, `weekly_hours` même si l'instant de la lecture y
   tombe — le devis juge au créneau et passe `handoverAt: null`, et toute
   variante future) rend la promotion « non certaine ».
4. **Une seule promotion panier en jeu.** Le choix de la caisse
   (`chooseBasketPromotion` : la plus spécifique, puis la plus avantageuse,
   cumul plafonné) dépend du panier entier. Le prix net n'est montré que si
   **une seule** promotion panier vivante vise ce lecteur et cet article ;
   sinon, mention seule.
5. **La mercuriale d'un pro** : une déclinaison scellée contre la promotion
   (`sealedAgainst`) n'a ni prix net ni mention de cette promotion.
6. **Ce qui est barré** : le prix affiché de la vignette tel qu'il est
   aujourd'hui (après promotions de ligne et mercuriale) ; le net s'applique
   à lui. Unité : HT pour un pro, TTC pour un particulier, comme le rayon.
7. **Points restreints seulement** (§ 2.2) : pour l'audience retrait seul,
   seule une liste de points compte ; une liste de zones ne joue que si la
   livraison est ouverte.
8. **Invité** : les faits d'audience du lecteur (`lotBuyerFacts`) jugent déjà
   « inscrits » ; test : un invité n'a ni prix net ni mention d'une
   promotion réservée aux inscrits.
9. **Calculé une fois par lecteur** : la liste des promotions certaines se
   juge une fois par appel, puis une multiplication par déclinaison ; jamais
   une résolution du panier par déclinaison.
