# Boutique — cartes en rayon, fiche produit, barre « Ma commande »

**État : ✅ lots 1 et 2 bâtis, lot 3 en partie vérifié ; relu contre le code le
2026-10-12.** Remplace `plan-boutique-pro-cartes-et-fiche` (« en cours de
construction » le 2026-09-24, supprimé le 2026-10-12 ; historique dans git).
Source : le handoff `handoff-boutique` (hors dépôt, SPEC §2 à §8). La composition
d'un rayon par la vitrine est dans [`boutique-rayon-layout.md`](boutique-rayon-layout.md).

## 1. Ce qui existe (apps/lfc-ecommerce-frontend/src/app/client/)

| Pièce                 | Où                                                               | Ce qu'elle fait                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carte en rayon        | `shop/product-tile/`                                             | photo 4/3, nom en petites capitales, prix tabulaire ; **un seul bouton** (« + » à quantité nulle, la quantité ensuite) ; photo et nom ouvrent la fiche ; tarif barré quand servi ; le best-seller (`isFeatured`) couvre 2 colonnes, ou prend la forme que la vitrine lui donne (`shape`) |
| Fiche                 | `shop/product-sheet/` (dans `ClientDialog`, `placement="sheet"`) | kicker rayon, nom, note, **Fournée** ; prix par pièce ; **quantité en brouillon local** (le stepper ne touche pas le panier) ; raccourcis **× 6 · × 12 · × 24** (`BATCHES`) réservés au pro ; CTA « Ajouter N » / « Mettre à jour » / « Déjà au panier » qui émet `quantitySet(n)`       |
| Barre « Ma commande » | `shop/order-bar/`                                                | le résumé des termes devenu barre en superposition au bureau, « Régler » avec le total                                                                                                                                                                                                   |
| Panier                | `cart/cart.store.ts`                                             | `quantityOf`, `setQuantity`, ajout / retrait                                                                                                                                                                                                                                             |

Assiette HT / TTC : `ShopPriceBasis.showsTtc` (vrai ⇔ pas de société ⇔ pas pro),
règle existante que la fiche conserve. La copie (FR, EN, IT) : `client/copy/`
(« Best-seller », « Mettre à jour », « Déjà au panier »…).

## 2. Ce que la maquette montrait et que le serveur ne sert pas — décisions

Aucune valeur n'est inventée ; un composant n'acquiert pas de champ optionnel
anticipé (un champ que personne ne remplit est un mensonge de contrat).

| Maquette                              | Décision                                                                                                              | Vérifié le 2026-10-12                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Pastille « Clôture dans N min »       | non rendue (lot serveur)                                                                                              | `ShopItemView` ne porte aucun champ d'échéance              |
| Pièce (« 65 g »), allergènes          | ligne absente (les allergènes vivent au PIM)                                                                          | aucun champ dans `packages/contracts/src/shop-catalogue.ts` |
| « 142 emportées la semaine dernière » | absent                                                                                                                | aucune mesure                                               |
| Fournée                               | rendue (`ovenHoursOf(shelfId)`)                                                                                       |                                                             |
| Tarif barré / « Prix pro −N % »       | rendu quand `catalogPriceMillicents` est présent ; le pourcentage se **dérive** des deux montants, arrondi à l'entier | `catalogPriceMillicents?` existe                            |

## 3. Barre « Ma commande » et pied mobile

- **Bureau (≥ 900 px)** : la barre est à cheval sur le bleu et le papier ; à
  gauche « Ma commande · Retrait / Livraison », lieu · heure, pastille de remise,
  liens « Changer de maison » / « Changer l'heure » ; à droite « N pièces », le
  bouton **Régler** avec le total (`pay()`). Le pied `cart-bar` n'est pas rendu
  quand la barre l'est (masquage en CSS par largeur : le SSR ne connaît pas la
  largeur). Sans choix de service, la barre n'existe pas et le pied reste le seul
  chemin vers le règlement.
- **Pile (< 900 px)** : la barre n'est pas rendue ; un **pied collé** la remplace
  (`cart/cart-bar/`), avec « Modifier » vers l'accueil (`backToService()`) et
  **Régler** pleine largeur. Les feuilles passent au-dessus du pied.
- Le détail visuel (languette de 22 px, z-index) n'a pas été revérifié dans les
  styles ce jour.

## 4. Reste à faire

- Les lots serveur de la maquette : échéance de commande, poids de pièce,
  allergènes, mesure des ventes.
- « Changer de mode » renvoyant à l'accueil (SPEC §10) : non vérifié.
