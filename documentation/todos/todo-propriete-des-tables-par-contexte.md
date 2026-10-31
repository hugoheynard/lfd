# TODO — la propriété des tables, par contexte et non plus par bloc

> 📋 **Noté le 2026-10-31** (Hugo : « note-le »), à l'issue d'une revue
> d'architecture et de la contradiction du plan
> [`../promotions/plan-schemas-promotions-et-fidelite.md`](../promotions/plan-schemas-promotions-et-fidelite.md).
> Rien n'est bâti.

## Le constat

- `lint:prisma-model-ownership` (`dev-toolbox/gates/prisma-model-ownership.mjs`,
  `BLOCKS`) raisonne par **bloc** : à l'intérieur de `src/b2b/`, n'importe
  quel contexte peut lire en Prisma les tables d'un autre.
- `lint:cross-schema-join` ne lit que le SQL écrit à la main ; il ignore les
  lectures Prisma. Mettre un contexte dans son propre schéma Postgres
  n'interdit donc rien de plus — le déplacement est cosmétique tant que la
  propriété n'est pas tenue par contexte (vitruve, 2026-10-31).
- La dette relevée le 2026-10-31 (grep des délégués Prisma, à recompter) :
  `accounting` lit `order`/`orderLine` dans ~17 adaptateurs ; `pricing` lit
  les commandes (volumes, 2 fichiers) ; `account`, `alerts` (2) et `growth`
  (4) lisent `order` ; `operations` lit `catalogItem` ; `pricing` lit
  `promotions` (noms) ; `OrderRefund` est écrit à la fois par `orders` et
  `accounting`.

## Ce qu'il faudrait

1. Apprendre à la porte un **propriétaire par table au niveau du contexte**
   (`b2b/orders`, `b2b/promotions`, `b2b/accounting`…), lu dans la même source
   que les blocs.
2. Toute lecture Prisma d'une table par un autre contexte est **comptée et
   affichée**, en dette décroissante (comme `lint:controller-buses`) ; un
   contexte drainé échoue au premier retour.
3. Drainer contexte par contexte, par des ports ou des projections tenues
   par des faits ; pour `accounting` sur les commandes, une projection
   « commande facturable » d'abord (argent : `vitruve`).
4. Un contexte à zéro peut ensuite rejoindre son schéma Postgres — un simple
   rangement (cf. le plan des schémas, ses quatre bloquants : fonctions
   plpgsql qui nomment les tables, migration figée rejouée par un e2e, enums,
   SQL brut qualifié `public.`).

## Ce qu'il ne faut pas faire

- Déplacer un contexte dans un schéma avant que sa dette soit à zéro.
- Faire de `promotions` ou `loyalty` un bloc à part : la passation perdrait
  son atomicité.
