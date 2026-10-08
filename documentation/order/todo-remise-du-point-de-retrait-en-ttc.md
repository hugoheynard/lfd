# TODO — la remise d'un point de retrait, en montant fixe, pour un particulier

**Ouvert le 2026-09-26**, demandé par Hugo à la lecture du calcul de la TVA sur
un bon de réduction. Rien n'est pris.

## Le constat (ouvert et vérifié le 2026-09-26)

- La remise d'un point de retrait se règle en **pourcentage** ou en **montant
  fixe** (`packages/contracts/src/cart-adjustment.ts`). Le montant fixe est en
  **centimes HT**, pour toutes les clientèles.
- `ventilateVat` (`packages/money/src/vat.ts`) le retire du sous-total **HT**,
  au prorata des taux, avant la TVA. Le calcul est juste : c'est l'**unité
  saisie** qui ne l'est pas pour un particulier.
- Le décompte de la boutique affiche `−{{ money(totals().discountCents) }}`
  (`apps/lfc-ecommerce-frontend/src/app/client/cart/cart-summary/cart-summary.html:42`),
  c'est-à-dire le montant **HT**, dans un décompte qu'un particulier lit en
  **TTC**.

## Pourquoi c'est un problème

Une remise « 5 € » réglée pour la clientèle publique :

- baisse le TTC d'environ **5,28 €** à 5,5 % (5 € HT × 1,055) ;
- s'affiche « −5,00 € » dans le panier ;
- et la ligne ne retombe donc pas sur le total : le client lit « −5,00 € »,
  mais paie 5,28 € de moins que le prix plein.

Le pourcentage n'a pas ce défaut : « −10 % » sur le HT est « −10 % » sur le
TTC, taux par taux.

Pour un pro, un montant HT est la bonne unité, puisqu'il lit ses prix en HT.

## Ce qu'il faudrait trancher

1. Pour la clientèle publique, le montant fixe se **saisit en TTC**. Il se
   convertit en HT au prorata des taux, par la même recherche entière que la
   remise fidélité (`htDiscountForTtcTarget`, plan des points de fidélité,
   D6). Une seule fonction sert les deux.
2. Le décompte affiche la **baisse de TTC réellement obtenue**, pas le montant
   HT saisi.
3. Un point de retrait remisé pour les **deux** clientèles, en montant fixe,
   porte-t-il deux montants (un HT pro, un TTC public) ? Ou le montant fixe
   est-il interdit quand les deux clientèles sont cochées ?
4. Les remises déjà enregistrées en montant fixe pour le public : combien en
   existe-t-il en production ? C'est une lecture à faire par Hugo. Une
   conversion de leur valeur est une **migration de données**, avec
   `vitruve` obligatoire.

## Liens

- [`../comptabilite/fidelite/plan-points-de-fidelite.md`](../comptabilite/fidelite/plan-points-de-fidelite.md),
  D6 : la conversion d'une cible TTC en remise HT.
