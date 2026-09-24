# Boutique pro — cartes en rayon et fiche produit (lot 1)

> **État : décidé, en cours de construction (2026-09-24).**
> Source : handoff `handoff-boutique` (SPEC §3, §4, §5, §6 ; captures 02 à 05, 11).
> Les autres sections du handoff (barre « Ma commande », panier, pied collé
> mobile, tuile Noël / bande Pâques) sont des lots suivants.

## Ce qui existe (vérifié le 2026-09-24)

| Pièce           | Fichier                                                              |
| --------------- | -------------------------------------------------------------------- |
| Carte en rayon  | `apps/lfc-ecommerce-frontend/src/app/client/shop/product-tile/`      |
| Fiche           | `…/shop/product-sheet/` (dans `ClientDialog`, `placement="sheet"`)   |
| Stepper         | `…/shop/quantity-rail/` (`added` / `removed`, un par un)             |
| Panier          | `…/client/cart/cart.store.ts` — `quantityOf`, `setQuantity` existent |
| Branchement     | `…/shop/shop-page/shop-page.html` (`cart.add` / `cart.remove`)       |
| Assiette HT/TTC | `ShopPriceBasis.showsTtc` — vrai ⇔ pas de société ⇔ pas pro          |

`ShopItemView` (`packages/contracts/src/shop-catalogue.ts`) porte : nom, note,
image/thumbnail, `unitPriceMillicents`, `unitPriceTtcCents`,
`catalogPriceMillicents?` (le tarif barré, présent seulement s'il diffère),
`vatRatePercent`, `shelfId`, `isFeatured`.

## 🔴 Ce que la maquette montre et que le serveur ne sert PAS

| Maquette                                      | État                                                   | Décision de ce lot                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Pastille « Clôture dans 12 min » (`deadline`) | aucun champ                                            | **non rendue** — lot serveur                                                                                              |
| Pièce (« 65 g »)                              | aucun champ                                            | **ligne absente**                                                                                                         |
| Allergènes                                    | vivent au PIM, ne traversent pas le canal              | **ligne absente** — lot serveur                                                                                           |
| « 142 emportées la semaine dernière »         | aucune mesure                                          | **absent** ; le best-seller garde nom, phrase, prix                                                                       |
| Fournée                                       | `ovenHoursOf(shelfId)` (valeur par rayon, déjà servie) | rendue                                                                                                                    |
| Prix boutique barré / « Prix pro −10 % »      | `catalogPriceMillicents`                               | rendu quand présent ; le pourcentage se **dérive** des deux montants, arrondi à l'entier ; absent → ni rature ni pastille |

Aucune valeur inventée (pas de « 65 g », pas de « 142 », pas de deadline
fictive). Les composants n'acquièrent PAS de champs optionnels anticipés : un
champ que personne ne remplit est un mensonge de contrat. Le lot serveur les
ajoutera avec leur rendu.

## Carte (SPEC §4, §5)

- Photo **4/3** (déjà), nom en petites capitales, prix tabulaire.
- Un seul bouton d'action, **44 px** en bas à droite, encre plein : « + »
  quand la quantité est nulle, **la quantité** ensuite (capture 03 : « 1 »).
  Il ajoute. Le retrait se fait dans la fiche. La pastille sur la photo et le
  stepper `wide-only` disparaissent : la maquette a unifié les deux densités.
- Photo **et** nom ouvrent la fiche.
- Rature (prix boutique) conservée quand servie.
- **Best-seller** (`isFeatured`) : la carte couvre **2 colonnes** (`grid-column: span 2`
  posé par la grille via l'hôte). Photo à gauche (200 px mini), texte à droite,
  fond crème doré, cerne or, ombre chaude, pastille « ★ Best-seller » or plein
  sur la photo, nom en Chunk ~26 px, la note comme phrase. En pile (grille à 1-2
  colonnes) la phrase disparaît.
- Grille du rayon : **5 cartes par ligne au plus** (Hugo, 2026-09-24), 215 px
  mini — `repeat(auto-fill, minmax(max(215px, (100% - 4 * gap) / 5), 1fr))`
  (fichier de la grille dans `shop-page`) ; un best-seller compte pour deux ; `grid-auto-flow: dense` pour que le best-seller ne
  laisse pas de trou.

## Fiche (SPEC §6)

- Bureau : dialogue **900 px**, photo **4/3 à gauche**, contenu à droite.
  Mobile : feuille montante (comportement actuel de `placement="sheet"`).
  Si `ClientDialog` ne sait pas faire le deux-colonnes, ajouter un placement ou
  une variante **dans `ClientDialog`**, pas un dialogue parallèle.
- Rayon (kicker) · nom en Chunk · note.
- Entre deux filets : **Fournée** (et plus tard Pièce, Allergènes).
  La ligne « Retrait à / Livré à » actuelle part : la barre « Ma commande » le dit.
- Prix : **prix par pièce** gros et tabulaire, suffixe « / pièce », tarif
  barré à côté, pastille « Prix pro −N % » quand dérivable. Mention HT/TTC
  selon `ShopPriceBasis` (règle existante, ne pas la perdre).
- **Quantité en brouillon local** : le stepper − / + de la fiche modifie une
  quantité locale, initialisée à la quantité au panier (ou 1 si nulle). Il ne
  touche PAS le panier.
- Raccourcis **× 6 · × 12 · × 24**, pro seulement (`!showsTtc`) ; celui qui
  égale le brouillon est mis en avant (fond crème doré).
- CTA pleine largeur, libellé à gauche, total à droite (quantité × prix
  unitaire, via `lineTotalCents`, même assiette que le prix affiché) :
  - rien au panier → « Ajouter N »
  - au panier, brouillon ≠ panier → « Mettre à jour »
  - au panier, brouillon = panier → « Déjà au panier », désactivé
    Il émet **`quantitySet(n)`** ; `shop-page` appelle `cart.setQuantity`, puis
    ferme la fiche.
- Au niveau `browse`, le pied garde la mention actuelle (`orderingSoon`).

## Copie

FR, EN, IT dans `client/copy/{fr,en,it}.ts` : « Best-seller », « / pièce »,
« Prix pro −{pct} % », « Ajouter {n} », « Mettre à jour », « Déjà au panier »,
« Fournée ». Les clés devenues orphelines sont retirées.

## Tests

- Spec de `product-tile` mise à jour (pastille unique, best-seller).
- Spec neuve de `product-sheet` : brouillon initial, raccourcis réservés au
  pro, les trois états du CTA, `quantitySet` émis, pourcentage dérivé et absent
  sans tarif barré, aucune ligne Pièce/Allergènes.

---

# Lot 2 — la barre « Ma commande » en superposition (SPEC §2)

> Demandé par Hugo le 2026-09-24 : « la barre en superposition pour qu'on se
> débarrasse du pied de page en desktop ».

## Ce qui existe

- `shop/public-command-terms-summary/` est DÉJÀ posé dans la descente
  (`clientBanner`) et déborde sur le papier (`.terms` dans `shop-page.scss`,
  décalage par `top`, pas par marge — lire le commentaire). Il ne s'affiche
  qu'avec un choix de service.
- `cart/cart-bar/` est le pied collé ; `shop-page` l'affiche dès que le panier
  n'est pas vide, à toutes les largeurs, et l'ouvre par `pay()`.

## Ce que fait le lot

Le résumé des termes DEVIENT la barre « Ma commande » (même composant, renommé
si le nom ment : `order-bar` dans `shop/`). Au bureau (≥ 900 px) :

- à cheval, moitié sur le bleu, moitié sur le papier (−50 px). Crème `#f6ecd6`,
  cerne or assourdi `#dcbf7a`, ombre longue ;
- **gauche** : « Ma commande · Retrait » (ou « · Livraison ») en petites
  capitales, puce or ; lieu · heure en Chunk 28 px ; pastille de remise
  (logique `offer` existante, intacte) ; liens soulignés « Changer de maison »,
  « Changer l'heure » — plus de bouton plein ici ;
- filet vertical ;
- **droite** : « N pièces · −X € de remise » (remise masquée si 0), puis le
  bouton encre **Régler** avec le total à droite, qui appelle `pay()` ;
  panier vide → « Panier vide — ajoutez depuis le rayon » sans bouton.
- Au bureau, **le pied `cart-bar` n'est plus rendu** quand la barre l'est. Sans
  choix de service, la barre n'existe pas ; le pied reste alors le seul chemin
  vers le règlement (pas de régression).
- En pile (< 900 px) : rien ne change dans ce lot. Le pied mobile de la SPEC §8
  est un lot suivant.
- « Changer de mode » n'est pas construit (SPEC §10 : il doit renvoyer vers
  l'accueil — lot suivant).

Le masquage du pied se fait en CSS par largeur (le SSR ne connaît pas la
largeur), avec une condition « barre présente » côté gabarit.

---

# Lot 3 — le pied collé mobile (SPEC §8)

> Demandé par Hugo le 2026-09-24. Captures 09-mobile.png, 10-mobile-pied.png.

En pile (< 900 px) :

- **La barre « Ma commande » du bandeau n'est pas rendue** : elle flottait
  seule sur le bleu (vu le 2026-09-24). Le pied la remplace.
- **Languette** : la zone papier de la boutique remonte de 22 px sur le bleu,
  coins hauts arrondis, poignée centrée, ombre vers le haut.
- **Pied collé** (reprend `cart/cart-bar/`, ou le remplace s'il ment) — papier
  `--fold-color-surface-card`, filet `--fold-color-border` (nuance des pastilles) :
  - ligne 1 : « Ma commande · Retrait » (ou Livraison) en petites capitales +
    lieu · heure ; lien « Modifier » à droite, qui renvoie à l'accueil
    (`backToService()` existant) ;
  - ligne 2 : **Régler** encre plein, pleine largeur, pastille crème du
    nombre de pièces à gauche, total à droite → `pay()` ;
  - panier vide : même bouton en état de pastille inactive (papier, filet,
    texte secondaire) « Panier vide » ;
  - sans choix de service : pas de ligne 1, le bouton reste (il mène au choix
    comme aujourd'hui).
- Le pied est présent dès la boutique ouverte, panier vide compris (il ne
  dépend plus de `!cart.isEmpty()` en pile). Au bureau, rien ne change : le
  pied reste masqué quand la barre est là, et visible sinon.
- Toutes les feuilles (fiche, créneau, retrait, adresse, notifications,
  panier) passent AU-DESSUS du pied (z-index 6 > 4). Le rayon garde en bas
  la place du pied pour que la dernière rangée ne soit pas cachée.
