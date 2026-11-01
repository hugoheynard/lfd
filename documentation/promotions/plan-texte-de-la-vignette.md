# Plan — le texte d'une promotion sur la vignette

> 📝 **Plan du 2026-11-01**, décision de Hugo. Remplace le plan « prix
> certain sur la vignette » (option c, contredit par vitruve le même jour),
> abandonné avant tout bâti : Hugo préfère un texte réglé en admin à un prix
> net calculé, « pour éviter de rentrer dans des détails calculés obscurs ».
> Ne touche à aucun calcul de prix.
>
> ✅ **Bâti le 2026-11-01**, non commité. Colonnes `tile_text_fr/en/it`
> (migration `20261101120000_le_texte_des_vignettes`, 60 caractères au plus),
> champ et aperçu sur la page d'une promotion (remise au panier seulement),
> mention servie par le serveur dans la langue du rayon. L'état est décrit
> dans [`promotions.md`](promotions.md), « Ce que voit le client ».

## 1. La demande (Hugo, 2026-11-01)

> « J'aurais plutôt affiché un texte défini en admin si le contexte et le
> produit rendent la réduction possible, typiquement « −20 % client Folie
> Coffee ». »

Champ vide : « juste la valeur » (« −20 % »), sans détail d'acheminement.

## 2. Ce qui change

1. **Un champ « Texte sur les vignettes »** par promotion, facultatif,
   localisé (fr, en, it — comme les autres textes de la boutique ; repli sur
   le français). Colonne additive sur `promotions`, bornée en longueur.
2. **Quand il s'affiche** : exactement quand la mention d'aujourd'hui
   s'affiche — la promotion vise ce lecteur (`offerCandidates`), cet article
   (portée partagée `@lfd/contracts/promotion-scope`), au moins un de ses
   acheminements est ouvert au lecteur (`offerOpenTo`, correctif du
   2026-11-01), et pour un pro la mercuriale l'admet. Aucune règle nouvelle.
3. **Ce qui s'affiche** : le texte réglé ; s'il est vide, **la valeur
   seule** (« −20 % », ou le montant pour une remise en montant) — plus de
   « retrait » / « livraison » sur la vignette. Le serveur choisit le texte ;
   le front ne fabrique plus de libellé d'acheminement pour la vignette.
4. **Le prix de la vignette reste le prix affiché** ; la remise se calcule au
   panier, une fois l'acheminement choisi, comme aujourd'hui.
5. **Où** : vignette et fiche produit de la boutique ; le champ sur la page
   d'une promotion du back-office, avec l'aperçu de ce qui sera lu.
6. **Chaque audience son information** : la mention n'est servie qu'au
   lecteur qu'elle vise (déjà vrai).

## 3. Les tests

- Texte réglé → il s'affiche ; vide → la valeur seule.
- Particulier sans livraison, promotion livraison seule → rien.
- Invité et promotion « inscrits » → rien.
- Langue : texte en anglais lu en anglais, repli français.
