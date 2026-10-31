# Plan — la remise par ligne, vérifiable par le client (prix barré)

> 📝 **Option documentée, non bâtie** (Hugo, 2026-10-30). Touche **l'argent**
> (calcul de la remise, TVA, facture, Factur-X) : `vitruve` obligatoire avant
> tout bâti.
>
> **Contexte** : extrait tel quel, le 2026-10-31, du § 17 du plan du chantier
> des promotions (supprimé ce jour-là, ses lots L0 à M7 bâtis). L'état actuel
> des promotions — point ligne, point panier, cumul, plusieurs remises par
> commande, une remise de document par promotion et par taux sur la facture —
> est décrit dans [`promotions.md`](promotions.md), § 2.2 et § 2.11. Les
> numéros de section ci-dessous gardent ceux du plan d'origine.

## 17. Option documentée, non bâtie — remise par ligne, vérifiable par le client (Hugo, 2026-10-30)

**Exigence de Hugo** : une méthode **fiscalement juste** et **vérifiable par
le client à peu de décimales** — qu'il puisse refaire le calcul de sa facture
avec une calculatrice, au centime.

**Aujourd'hui** : une promotion de retrait (point panier) en pourcentage est
calculée sur l'assiette des lignes éligibles et arrondie UNE fois sur le
total. Le client voit la remise globale, pas sa répartition : il ne peut pas
la refaire ligne par ligne, et aucun prix barré par article n'est exact.

**Deux méthodes, comparées** :

|                          | A — arrondi unique (millicentimes)                          | B — arrondi par ligne (centimes affichés)                     |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Remise d'une ligne       | calculée en millicentimes, non arrondie                     | arrondie au centime sur la ligne, affichée                    |
| Total                    | somme des lignes, arrondie une fois                         | somme EXACTE des lignes affichées                             |
| Égalité avec aujourd'hui | identique au centime                                        | peut différer d'un centime par ligne                          |
| Vérifiable par le client | non : la somme des lignes affichées peut s'écarter du total | **oui** : tout ce qui s'additionne est affiché, à 2 décimales |
| Prix barré par article   | indicatif (± 1 ct)                                          | exact                                                         |

**Recommandation : B**, parce qu'elle répond à l'exigence (rien de caché sous
le centime) :

1. remise de chaque ligne = HT de la ligne × taux, **arrondie au centime
   (demi au-dessus)**, affichée sur la ligne ;
2. HT net de la ligne = HT − remise, affiché ;
3. **total HT par taux de TVA = somme des HT nets affichés** de ce taux ;
4. TVA = total HT du taux × taux, arrondie une fois par taux ; TTC = HT + TVA ;
5. chaque montant d'une étape est la somme ou le produit, arrondi au centime,
   de montants **déjà affichés** — le client refait tout à 2 décimales.

**Conséquences, à trancher avant de bâtir** : B change certains totaux d'un
centime par rapport au calcul actuel (fin de l'égalité au centime avec
l'existant, voulue) ; elle touche le calcul exact du hors taxes
(`composeExactOrder`), la trace des lignes, le bon, la facture et le PDF ; une
remise en **montant fixe** sur le panier reste globale (pas de répartition par
ligne sans règle arbitraire) — à afficher comme telle. À confronter aux
règles de facturation (mentions des réductions par ligne, totaux par taux) et
à `vitruve` (argent) avant tout bâti.

### 17.1 Conditions de Hugo (2026-10-30) — elles priment sur toute méthode

1. **Prix unitaire × quantité = montant de la ligne**, au centime, tel que le
   client le refait : le prix unitaire affiché (TTC pour un particulier, HT
   pour un pro), multiplié par le nombre d'articles, donne le montant affiché
   de la ligne.
2. **Règles fiscales françaises et Factur-X (EN 16931) respectées
   absolument** — calculs de ligne, remises, totaux par taux de TVA.

**Ce que ces conditions écartent** : la répartition au plus fort reste (C)
telle quelle — elle donne à une ligne une remise qui n'est pas forcément un
multiple de sa quantité, donc un prix unitaire net qui ne retombe pas juste
(ex. 3 articles, remise de ligne 0,73 € ⇒ 0,2433… € l'unité). Elle ne reste
valable que comme **remise de pied de document**, ventilée par taux (voir 2).

**Méthode recommandée, sous ces conditions** :

1. **Promotion en pourcentage sur des articles** (ligne OU retrait) : remise
   appliquée au **prix unitaire**, arrondie au centime **sur l'unité** ⇒ prix
   unitaire net ; montant de ligne = prix unitaire net × quantité. Condition 1
   tenue par construction, et c'est la forme Factur-X d'une ligne (montant net
   de ligne = quantité × prix net de l'article). Prix barré exact.
2. **Remise en montant fixe sur le panier** : remise de **pied de document**,
   ventilée par taux de TVA (une remise par taux, au prorata des bases, plus
   fort reste pour le dernier centime) — forme Factur-X d'une remise au niveau
   du document ; les lignes gardent leur prix plein.
3. **TVA** : totale par taux = base du taux × taux, arrondie une fois par taux
   (règle de calcul Factur-X).

**À VÉRIFIER avant de bâtir (non vérifié ici)** : les règles de calcul exactes
d'EN 16931 / Factur-X (ligne, remises de document, arrondis) dans le texte de
la norme ; ce que fait aujourd'hui le dépôt pour un particulier (prix de
référence TTC ou HT, `composeExactOrder`, `exact_ht`) — si le prix public est
TTC, la condition 1 s'écrit en TTC et l'extraction de la TVA se fait par taux
sur le total TTC ; l'écart d'un centime par unité avec le calcul actuel
(remise globale) est assumé. `vitruve` obligatoire.
