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

## 18. Décision de Hugo (2026-11-01) — le prix net exact du pro, sans option

> 📝 Remplace la méthode recommandée du § 17 pour le cas qui ne tient pas
> aujourd'hui. `vitruve` avant le bâti (argent, facture).

### 18.1 Le constat

- **Particulier** : la ligne vaut quantité × étiquette TTC au centime, remise
  « dans le prix affiché » comprise — prouvé par
  `apps/lfd-api/test/basket-discount-ttc-particulier.e2e-spec.ts` (2026-11-01).
  Rien à changer.
- **Remises au panier** : remise de pied de document, une par taux, justes au
  centime du devis à la facture — prouvé par
  `basket-discount-vat-split-to-invoice.e2e-spec.ts` et le précédent. C'est la
  forme BG-20 d'EN 16931. Rien à changer.
- **Pro, remise « dans le prix affiché »** : le prix net reste en
  millicentimes (0,93 € − 12 % = 81 840 mc = 0,8184 €), la ligne vaut
  `lineTotalCents(prix, quantité)` — un seul arrondi, sur la ligne
  (`order-line.ts`, `OrderLine.create`, lu le 2026-11-01). La vitrine affiche
  0,82 € ; 5 pièces font 4,09 €, pas 4,10. **La condition 1 du § 17.1 n'est
  pas tenue à l'écran.**

### 18.2 La décision : (b), seule, sans option

**Le calcul ne change pas d'un centime.** C'est l'**affichage** du prix
unitaire d'un pro qui devient exact : le prix net tel qu'il est calculé
(0,8184 €), avec au moins 2 décimales et au plus celles qu'il a (zéros de
queue retirés), partout où un pro lit un prix unitaire. La ligne arrondie au
centime reste ce qu'elle est. Le client refait : 5 × 0,8184 = 4,092 → 4,09.

Écartée : (a), arrondir le net au centime puis multiplier — la remise
appliquée ne serait plus le pourcentage annoncé (0,11 € par pièce = 11,83 %),
injustifiable sur la facture et dans l'annonce. Écartée aussi : une option
d'admin entre (a) et (b) — deux calculs à tenir justes, une rupture au
changement d'option.

### 18.3 Où un pro lit un prix unitaire (à inventorier au lot 0)

Vitrine pro (vignette, fiche), panier et devis pro, commandes et bons du
client, back-office (commande, nouvelle commande, fiche client), export de la
grille de prix, PDF (confirmation, bon, facture) et **Factur-X** : BT-146
(prix net) doit être le prix exact — EN 16931 ne borne pas ses décimales
(BR-DEC ne vise pas BT-146 ; **à confirmer** par le validateur Mustang du
dépôt) — pour que BT-129 × BT-146 retombe sur BT-131 à l'arrondi près.
Si la facture porte la remise de la promotion : BT-148 (brut), BT-147
(rabais), ou une remise de ligne BG-27 chiffrée (pourcentage et motif, CGI
242 nonies A) — **à trancher par vitruve** selon ce que la facture émet
aujourd'hui.

### 18.4 Une infobulle, pas une option

À côté d'un prix pro à plus de 2 décimales : « Prix net exact de la remise ;
la ligne est arrondie au centime. »

### 18.5 Les tests

- Unitaire : le format (2 à 5 décimales, zéros retirés, virgule).
- e2e pro : −12 % dans le prix affiché sur 0,93 € ; vitrine = 0,8184 ;
  5 pièces → 4,09 au devis, à la commande, sur la facture ; BT-146 × BT-129
  = BT-131 à l'arrondi près ; validateur Factur-X vert.
- Front : la vignette et le panier pro affichent le prix exact.

### 18.6 Après vitruve et la recherche (2026-11-01) — fait foi sur §§ 18.2–18.5

**Recherche** : aucun texte n'impose 2 décimales au prix unitaire HT entre
professionnels (L441-9 exige un « prix unitaire hors TVA », sans plus) ; un
tarif Sysco France 2024-2025 affiche 3 décimales
(<https://plateforme.aji-france.com/document/676145694be90.pdf>) ; pas
d'usage établi au-delà. **vitruve** : le calcul est déjà juste partout
(un arrondi, sur la ligne) ; la facture, ses PDF et le Factur-X affichent
déjà le prix exact ; seule la boutique arrondit le prix unitaire à
l'affichage ; et les prix pro portent souvent des décimales même sans remise
(déduits de l'étiquette TTC).

**Décision de Hugo** : le calcul ne change pas. Trois choses :

1. ~~**Boutique pro — option (d)** : le prix unitaire reste affiché au
   centime, avec une mention discrète « Prix unitaire arrondi ; le montant de
   la ligne est calculé sur le prix exact. »~~ **(b) dans la boutique pro,
   décision de Hugo du 2026-11-01 : la multiplication doit tomber juste dans
   le panier.** Partout où un pro lit un prix unitaire HT sur la boutique
   (vignette, fiche, panier, prix barré, prix au kilo), le prix exact — deux
   décimales au moins, cinq au plus, zéros de queue retirés, virgule. Pas de
   mention « arrondi ». Le TTC d'un pro et tout ce que voit un particulier ne
   changent pas.
2. **Facture : la remise d'une promotion « dans le prix affiché » est
   chiffrée** (CGI art. 242 nonies A — non tenu aujourd'hui) : la ligne
   porte le prix brut, la remise (pourcentage et nom de la promotion) et le
   prix net — en Factur-X (BT-148/BT-147, ou une remise de ligne BG-27 au
   choix du bâti, justifié) et sur le PDF.
3. **Facture : pas de prix moyen.** Le regroupement des bons par article et
   par prix (`invoice-lines.ts`) ne se fait que si la somme des lignes
   arrondies retombe sur quantité × prix ; sinon, une ligne par bon — jamais
   un prix unitaire recalculé (`billedUnitPriceMillicents`) que personne n'a
   payé.

Le particulier, les remises au panier, la grille d'export et le TTC affiché
d'un pro ne changent pas.

### 18.7 Avertir quand un pourcentage crée des décimales (Hugo, 2026-11-01) — ✅ bâti le 2026-11-01

Avec des prix pro saisis au centime, la seule source de décimales est une
promotion **en pourcentage** « dans le prix affiché » (0,93 € − 12 % =
0,8184 €). Le prix exact affiché (§ 18.6, option b) garde la multiplication
juste dans le panier ; l'avertissement laisse Hugo choisir en connaissance de
cause.

- **Où** : la page d'une promotion du back-office, à l'enregistrement d'une
  remise en pourcentage au point ligne (« dans le prix affiché »).
- **Quoi** : « Sur N articles visés, le prix net aura plus de 2 décimales
  (ex. 0,93 € → 0,8184 €). » avec quelques exemples ; une remise en montant
  fixe n'en crée jamais, l'écran peut le suggérer.
- **Comment** : une lecture (requête dédiée) qui applique le pourcentage aux
  prix pro de la portée de la promotion, par la même règle que la porte du
  prix, et compte ceux dont le net n'est pas au centime. Avertir, jamais
  refuser.
- **Tests** : 0,93 à −12 % → compté ; 1,00 à −20 % → non ; montant fixe →
  jamais.

> ✅ **Bâti le 2026-11-01** (`3c5717bbf`, puis repris le même jour) :
> `POST admin/promotions/decimals`, `promotionDecimalNets`
> (`apps/lfd-api/src/b2b/pricing/domain/promotion-decimals.ts`), callout
> `targeted-promotions/promotion-decimals-callout/`. Avertit sur la SAISIE en
> cours, relue après chaque frappe — la première version ne lisait que la
> promotion enregistrée, et l'avertissement arrivait après le choix qu'il
> devait éclairer. État décrit dans [`promotions.md`](promotions.md).

> ✅ **§ 18.6 bâti le 2026-11-01** (non commité à l'écriture de cette ligne) :
> points 1 (option (b), `format-money.ts` `formatMillicents`), 2 (BT-148/BT-147
>
> - note BT-127, PDF ; source : la trace de prix figée de la ligne de commande)
>   et 3 (`invoice-lines.ts`). Calcul inchangé ; e2e
>   `apps/lfd-api/test/promotion-in-price-to-invoice.e2e-spec.ts`. État décrit
>   dans [`facture-emise.md`](../comptabilite/facturation/facture-emise.md) et
>   [`promotions.md`](promotions.md). Validation Mustang : à faire à la main.
