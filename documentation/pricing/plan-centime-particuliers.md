# Plan — un particulier paie la somme des étiquettes

> 📝 **Plan, révision 5 du 2026-10-27** (révision 4 relue par `vitruve`,
> corrigée : § 4 à § 7, § 11). **Révision 4 du 2026-10-27 — voie B, choisie par Hugo** (« B, je
> veux le système le mieux ») : une commande de particulier est **construite
> en TTC**, de la ligne au total, et la TVA s'extrait par taux à la fin, au
> centime supérieur. Les révisions 1 à 3 (HT gardé, écart nommé, HT réparti)
> sont abandonnées ; leurs relectures restent au § 11. **Lot C1 bâti le
> 2026-10-27** (`composeTtcOrder`, `ttcOfHtAmount`, sans appelant ; § 9 bis).
> **Lot C2 bâti le 2026-10-27** (migration, agrégat, devis, bon ; § 9 ter).
>
> 🔴 **Le pro n'est pas touché** : aucune fonction qu'un panier ou une
> commande pro traverse ne change de résultat ; `vat-frozen.spec.ts` le fige.

## 1. Le constat du jour

Banana bread, étiquette **21,00 € TTC**, taux 5,5 %. La boutique affiche, le
panier totalise et Stripe prélève **21,01 €**.

| Étape                                  | Valeur         |
| -------------------------------------- | -------------- |
| HT dérivé (`htMillicentsOf`)           | 19,90521 €     |
| HT de ligne arrondi (`lineTotalCents`) | 19,91 €        |
| TVA sur l'assiette (`ventilateVat`)    | 1,095 → 1,10 € |
| Total                                  | **21,01 €**    |

Sous le calcul actuel, **21,00 € est inatteignable** à 5,5 % : un HT de 19,90 €
donne 20,99 €, un HT de 19,91 € donne 21,01 €. La cause est un **premier
arrondi** du HT au centime, avant que la TVA ne soit remise dessus.

## 2. Ce que dit le droit (recherche du 2026-10-27, à faire confirmer)

Recherche faite sans le cabinet, à sa place, sur demande de Hugo. Elle ne
remplace pas un avis : elle dit ce qu'on a trouvé et ce qu'on n'a pas trouvé.

- **L'arrondi n'est pas fixé par le droit de l'Union.** CJCE, 10 juillet 2008,
  _Koninklijke Ahold_ (C-484/06) : la règle d'arrondi relève des États membres,
  sous réserve de la neutralité et de la proportionnalité.
- **Le droit français n'impose pas, à notre connaissance, une méthode
  d'arrondi** (ligne par ligne ou sur l'assiette). Le BOFiP
  (`BOI-TVA-DECLA-30-20-20-10`, § 260 à 320) exige, **sur une facture**, le
  taux sur chaque ligne et, **par taux**, le total HT et la taxe
  correspondante ; il ne dit rien des centimes. Aucune page officielle trouvée
  sur ce point.
- **Le commerce de détail calcule déjà sa TVA « en dedans ».** Le BOFiP décrit
  la ventilation des **recettes TTC** des commerçants dont les ventes au
  comptant ne donnent pas lieu à facture (`BOI-TVA-DECLA-30-10-20`, méthodes
  A, B, C ; art. 268 bis du CGI) : la taxe se dérive de la recette TTC, pas
  l'inverse. C'est la situation d'une vente à un particulier.
- **Le prix affiché est TTC** (Code de la consommation, L112-1 et suivants ;
  arrêté du 3 décembre 1987). Prélever 21,01 € pour une étiquette à 21,00 €
  est un écart entre le prix annoncé et le prix payé — c'est le risque à
  fermer, plus que l'arrondi de TVA lui-même.
- **L'e-reporting B2C** (à partir du 1ᵉʳ septembre 2027 pour une TPE/PME) ne
  demande que des **agrégats** : total HT et TVA par taux sur la période. Il
  ne recalcule pas la TVA ligne à ligne.

**Conclusion retenue pour ce plan** : **aucune interdiction trouvée** de
calculer la TVA d'une vente à un particulier de façon à ce que le total payé
égale la somme des étiquettes. ⚠️ La ventilation des recettes des détaillants
est une **analogie**, pas un fondement : elle sert à ceux qui ne savent pas
ventiler leurs recettes par taux, pas au calcul d'une vente identifiée ligne à
ligne. Et le système **n'émet aucune facture** à un particulier aujourd'hui
(`card-invoicing.ts` : une commande publique rend `not_card`) — on ne peut donc
pas s'appuyer sur ce qu'une facture afficherait. ⚠️ **À faire confirmer par le cabinet avant
la mise en production** (§ 8, Q1) — la recherche n'a trouvé aucune interdiction,
elle n'a pas trouvé non plus d'autorisation écrite.

## 3. Ce que fait un grand distributeur (ticket du 2026-10-22)

Ticket de caisse d'un drive Super U (Bourg-Saint-Maurice, caisse certifiée
« OmniPOS CP FR 3.3 »), commande perso de Hugo, conservé hors du dépôt :

| Ce que montre le ticket | Valeurs                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Lignes                  | **TTC seulement** (quantité × prix unitaire TTC), le code du taux en marge ; aucun HT par ligne |
| Total payé              | 24,48 € = Σ des lignes TTC, exactement                                                          |
| Récapitulatif 5,5 %     | TTC 11,03 · TVA 0,58 · HT 10,45                                                                 |
| Récapitulatif 20 %      | TTC 13,45 · TVA 2,24 · HT 11,21                                                                 |

Recalculé : 11,03 × 5,5 / 105,5 = 0,57502 → 0,58 ; 13,45 × 20 / 120 =
2,24167 → 2,24. **La TVA est extraite du TTC de chaque taux, et le HT est la
différence.** Les chiffres sont **compatibles** avec la méthode « en dedans » —
et à 5,5 % seulement, incompatibles avec « HT arrondi puis TVA » (10,45 ×
1,055 = 11,02 ≠ 11,03). Un ticket est un **indice d'usage**, pas une preuve de
méthode ni un texte de loi ; la certification de la caisse (NF 525) porte sur
l'inaltérabilité des données, pas sur le calcul de la taxe.

Le ticket arrondit **au plus proche** (2,24167 → 2,24) : il ne soutient pas
l'arrondi au supérieur retenu ici, qui est une exigence de Hugo, pas un usage. Sur ce ticket, la TVA
encaissée vaut HT × taux arrondi (11,21 × 20 % = 2,242 → 2,24) ; mais
l'arrondi au plus proche peut, rarement, encaisser **un centime de moins** que
HT × taux arrondi (§ 4). D'où le choix du supérieur.

## 4. Le modèle : le TTC fait foi, la TVA se répartit

Pour une commande `exact_ht` (clientèle `public`), **chaque terme est d'abord
un montant TTC**, et c'est le TTC qui se garde, se borne et se fige :

| Terme           | Son TTC                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ligne           | **quantité × étiquette TTC** — l'étiquette étant `ttcCentsFromHtMillicents(prix résolu, taux)`, la fonction de la vignette ; le client paie ce qu'il lit, promotion comprise. ⚠️ Ce n'est PAS le TTC scellé d'aujourd'hui (`order-line.ts:160-161`, `ttcCentsOf(lineTotalCents(…))`, HT arrondi d'abord) : il est remplacé pour `exact_ht` |
| Remise retrait  | sur le **TTC** des lignes éligibles (§ 5, R2)                                                                                                                                                                                                                                                                                              |
| Bon de fidélité | sur le TTC des marchandises après remise (§ 5, R3)                                                                                                                                                                                                                                                                                         |
| Frais de zone   | le barème converti en TTC à son taux (§ 5, R1)                                                                                                                                                                                                                                                                                             |
| Total           | **Σ TTC des lignes − remises TTC + frais TTC** — rien d'autre ; c'est ce que Stripe prélève                                                                                                                                                                                                                                                |

Puis, **pour chaque taux** :

1. **TTC net du taux** = Σ TTC des termes de ce taux (une remise ou un port
   qui touche plusieurs taux est d'abord découpé par taux, en centimes
   entiers, au plus fort reste — `splitCents`, `order-vat-split.ts:75`).
2. **TVA du taux** = TTC × taux / (100 + taux), **au centime supérieur**, en
   arithmétique entière.
3. **La TVA du taux se répartit sur ses termes** (lignes, part de remise, part
   de bon, part de port), selon une règle **écrite et unique** :
   - chaque terme reçoit d'abord l'**arrondi au plus proche de la TVA qu'il
     contient** : TTC du terme × taux / (100 + taux), signée (une remise
     contient une TVA négative) ;
   - l'écart entre la TVA du taux et la somme de ces arrondis se distribue
     **un centime à la fois**, aux termes dont le reste est le plus fort dans
     le sens de l'écart ;
   - **les arrondis sont commerciaux** : au plus proche, **la moitié
     s'éloignant de zéro** (55,5 → 56 ; −5,5 → −6), la règle déjà tenue par
     `@lfd/money` ;
   - le **reste** d'un terme est sa TVA contenue moins son arrondi, signé ;
     un écart positif va aux restes les plus **grands**, un écart négatif aux
     plus **petits** ;
   - **un terme dont le TTC est nul ne reçoit rien**, et aucun centime n'est
     donné qui rendrait le HT d'un terme de signe contraire à son TTC (une
     ligne offerte reste à 0 HT, 0 TVA) ;
   - **à égalité**, l'ordre est fixe : les lignes dans l'ordre de la commande,
     puis la remise retrait, le bon, le port. Devis, agrégat et BL appellent
     la même fonction et rendent les mêmes centimes.

   Pondérer par la TVA **contenue**, et non par le TTC, évite les aberrations
   relevées par `vitruve` : un bon qui solde (TTC net 0) ne divise par rien ;
   un bon de 5,00 € sur une ligne de 5,01 € à 5,5 % laisse 1 c de TVA, et la
   ligne porte 0,27 €, le bon −0,26 € (arrondis de 26,12 et −26,07 c, écart
   de 1 c distribué) — pas 5,01 € et −5,00 €.

4. **HT de chaque terme** = son TTC − sa part de TVA.

Ce qui en sort, et pourquoi c'est la bonne forme :

- **Les colonnes HT d'aujourd'hui gardent leur sens et s'additionnent
  exactement** : Σ HT des lignes − remises HT + frais HT + TVA = total, au
  centime, sans colonne d'écart. Tout lecteur actuel du HT (chiffre d'affaires
  HT, CA par SKU, « Mes commandes », bon de livraison, statistiques) reste
  juste — c'est ce qui a manqué aux révisions 2 et 3.
- **Jamais moins de TVA**, sur la base déclarée : par taux, HT net = TTC −
  ⌈x⌉ ≤ TTC / (1 + t), donc HT net × t ≤ x ≤ TVA (preuve du § 4 de la
  révision 2, confirmée deux fois par `vitruve`). Surplus < 1 c par taux.
- **Le client paie Σ quantité × étiquette**, moins ses remises, plus son
  port, sans exception — y compris sous promotion.
- ⚠️ **Des étiquettes publiques bougent d'un centime** au déploiement :
  l'étiquette passe de `ttcCentsOf(lineTotalCents(prix, 1))` à
  `ttcCentsFromHtMillicents(prix)` (référentiel saisi à 1,53 € à 20 % :
  affiché 1,54 aujourd'hui, 1,53 demain). C'est le retour à la valeur
  saisie ; le pro n'est pas concerné.
- **Aucun HT n'est arrondi avant la TVA** : il n'existe plus de « HT de ligne
  avant » à réconcilier. Le HT est le **dernier** nombre calculé.

Exemples :

| Panier                                      | TTC   | TVA             | HT                                                                |
| ------------------------------------------- | ----- | --------------- | ----------------------------------------------------------------- |
| Banana bread 21,00 à 5,5 %                  | 21,00 | ⌈1,0948⌉ = 1,10 | 19,90                                                             |
| 30 articles à 0,50 à 20 %                   | 15,00 | ⌈2,50⌉ = 2,50   | 12,50 (10 lignes à 0,41 HT, 20 à 0,42 — TVA 0,09 / 0,08 répartie) |
| 1,90 + 0,50 à 5,5 % (constat du 2026-10-09) | 2,40  | ⌈0,1251⌉ = 0,13 | 2,27                                                              |

## 5. Les règles commerciales — ce qui change de nature

Le passage au TTC n'est pas qu'un calcul : les montants **fixes** et les
**pourcentages** du panier reçoivent une assiette TTC. Les réglages, eux,
**restent saisis comme aujourd'hui** (aucun écran ne change d'unité) ; c'est
leur application au particulier qui se fait en TTC.

- **R1 — Frais de zone** (`zone-panel.html`, « Frais de livraison », saisis
  HT). Pour un particulier : convertis en TTC **à leur taux** — 20 % en mode
  standard (`DELIVERY_VAT_RATE`) ; en mode « suit la marchandise »,
  découpés au prorata du TTC des marchandises par taux, puis chaque part
  convertie à son taux. Le particulier voit et paie ce TTC ; le pro continue
  de payer le HT + TVA d'aujourd'hui.
- **R1 bis — Frais de zone en pourcentage** (`feeMode: "percent"`,
  `prisma-delivery-zone.repository.ts:23`) : pour un particulier, le
  pourcentage s'applique au **TTC** des marchandises, sans conversion.
- **Tout pourcentage appliqué à un TTC** (remise retrait, frais) s'arrondit
  comme aujourd'hui : `cartAdjustmentCents`, au plus proche, la moitié vers le
  haut — −10 % de 6,66 € = 0,67 €. Même fonction au devis, à la garde et au
  BL.
- **R2 — Remise retrait** : un **pourcentage** s'applique au TTC des lignes
  éligibles (−10 % de 21,00 = 2,10 € TTC) ; un **montant fixe** saisi HT est
  converti en TTC au prorata des taux des lignes éligibles. Bornée au TTC
  éligible. La conversion d'un montant fixe saisi HT est **une fonction
  nommée** de `@lfd/money` (`ttcOfHtAmount(cents, poids par taux)`, un
  arrondi), la seule qu'appellent devis, agrégat, révision et BL. La trace
  figée garde l'ajustement **tel que saisi** (HT) ; le montant appliqué TTC va
  dans sa colonne (§ 7) ; la garde rejoue la conversion puis compare des TTC.
- **R3 — Bon de fidélité** (tranché, § 10 Q2 : valeur faciale TTC pour un
  particulier, imputée sur le TTC restant, sans conversion). Texte d'origine : (« Valeur d'un palier (€ HT) »,
  `loyalty-settings.html:39`) : converti en TTC au taux des marchandises
  (prorata) et imputé sur le TTC restant. ⚠️ Un bon « de 5 € » qu'un
  particulier voit à 5,28 € TTC est étrange : **à trancher par Hugo** —
  soit la valeur d'un palier devient TTC pour le particulier, soit elle reste
  HT convertie (§ 10, Q2).
- **R4 — Promotions, paliers, prix barrés** : le prix résolu reste HT
  (`resolvePrice`, inchangé) ; le TTC de la ligne en dérive par
  quantité × `ttcCentsFromHtMillicents(prix)` — l'étiquette que la vignette
  affiche, multipliée.
- **R5 — Surtaxe de retard** : n'existe pas sur une commande de boutique
  (`place-shop-order.handler.ts:144`, relu par `vitruve` le 2026-10-27) ;
  `Order.draft` lève une erreur nommée si une commande `exact_ht` en porte
  une.
- **R6 — Registre de fidélité** (`appliedCents`,
  `loyalty-voucher-redemption.ts:8`) : il décompte la **valeur faciale** du
  bon, dans l'unité de l'audience de la commande — TTC pour un particulier,
  HT pour un pro (§ 10, Q2). Le bon imputé sur une commande `exact_ht` est
  figé en TTC sur la commande.

**Les gardes de l'agrégat** (`order-amount-guards.ts`) gardent leur logique
— « l'ajustement figé reproduit le montant retenu » — mais, pour `exact_ht`,
elles comparent des **TTC** : `ensureDiscountMatches` sur le TTC éligible,
`ensureDeliveryFeeMatches` sur le TTC converti. Une seule fonction de
conversion (`@lfd/money`) sert au devis, à l'agrégat et au BL : trois
traductions finiraient par diverger.

### La révision d'une commande

`Order.revise` rejoue `Order.draft` (`order-revising.service.ts:195`), et le
staff peut réviser une commande publique. Trois règles :

- **la méthode se lit sur la commande** (`vat_method`), jamais sur
  `clienteleOf` : une commande `line_ht` d'avant le déploiement, révisée
  après, reste `line_ht` ;
- `draftInputOf` (`order-revising.service.ts:271-303`) passe les montants
  **dans l'unité de la méthode** : TTC pour `exact_ht` (bon imputé, port) ;
- la garde « le bon imputé reste couvert » (`order-revision.ts:227`) compare
  des TTC pour `exact_ht`. Lecteurs à adapter : `revision-quote-view.ts`,
  `revised-composition.ts`, `prisma-order-revision-history.reader.ts`.

### Le bon de livraison partiel

Un BL partiel d'une commande `exact_ht` est **recomposé en entier** par la
même fonction sur les lignes livrées : **toutes** ses lignes sont réécrites,
y compris celles livrées en entier (`departing-source.ts:53-62` ne recopie
plus une ligne figée pour `exact_ht`). Ses HT de ligne somment donc vers son
en-tête. Ce que le BL refait et ce qu'il garde :

- **port en montant fixe** : le TTC **figé sur la commande**, sans
  reconversion ; la garde du BL le compare à ce TTC figé, pas à une
  conversion du barème (qui dépendrait du mélange de taux livré) ;
- **port en pourcentage** : refait sur le TTC livré ;
- **remise retrait** : refaite sur le TTC éligible livré ;
- **bon de fidélité** : le TTC imputé sur la commande, borné au TTC livré
  après remise.

### La bascule

Au déploiement, un panier ouvert peut changer d'un centime (étiquette
recalculée, § 4). **La passation fait foi** : elle recompose tout, et le
montant prélevé est celui qu'elle calcule ; le panier et le devis se
rechiffrent à leur prochaine lecture. Aucune commande déjà passée ne change.

## 6. Ce qui change, endroit par endroit

| Endroit                                                                                                                                                                                                                      | Particulier (`exact_ht`)                                                                                                                                            | Pro                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@lfd/money` : `composeTtcOrder` (nom à fixer) **remplace** `ventilateVatExact` ; son propre type de sortie                                                                                                                  | termes TTC → TVA ⌈⌉ par taux → répartition → HT par terme ; entiers (`bigint`)                                                                                      | non lue              |
| `ventilateVat`, `VatVentilation`, `VatShare`, `vatShareSchema`, `splitOrderByRate`                                                                                                                                           | lus, jamais modifiés                                                                                                                                                | **inchangés, figés** |
| Vignette, fiche, prix barré, aperçu du rayon (`shop-catalogue-view.ts:75`, `shop-catalogue-pricing.service.ts:240`, `shelf-catalogue.ts:192-202`)                                                                            | `ttcCentsFromHtMillicents` ; choisi par l'audience déjà déduite (§ 8)                                                                                               | inchangé             |
| `CartAdjustments` (`cart-adjustments.service.ts`), `pickup-discount-eligibility.ts`                                                                                                                                          | remise et frais en TTC (R1, R2) pour l'audience `public`                                                                                                            | inchangé             |
| Devis (`shop-cart-quoting.service.ts`), effet du bon (`voucher-total-effect.ts`), imputation (`voucher-imputation.ts`)                                                                                                       | `composeTtcOrder`                                                                                                                                                   | inchangé             |
| `Order.draft` (`order.ts:116-160`), gardes (`order-amount-guards.ts`)                                                                                                                                                        | gardes en TTC ; `composeTtcOrder` ; fige HT **et** TTC de chaque terme                                                                                              | inchangé             |
| `OrderLine` (`order-line.ts:96-99, 143`)                                                                                                                                                                                     | nouvelle factory `OrderLine.ofTtc` : le HT est **reçu** de la composition (l'invariant « HT dérivé du prix » se lève pour `exact_ht` seulement, dit dans son JSDoc) | `create`, inchangée  |
| BL partiel (`delivery-note-terms.ts:150-184`, `departing-source.ts:53-61`)                                                                                                                                                   | recompose le sous-ensemble livré par `composeTtcOrder` (TTC des lignes livrées, remise TTC refaite, frais TTC)                                                      | inchangé             |
| « Mes commandes » (`order-summary-format.ts:43-51`), bon de commande (`order-sheet-pdf-totals.ts`, `order-sheet-text.ts:112-149`), e-mail (`mail-templates.ts:530`), assiette « remise sur X € » (`pickup-discount-base.ts`) | lignes TTC, remises et port TTC, total, **« dont TVA »** par taux — le format du ticket ; lus sur les colonnes TTC                                                  | inchangé             |
| Montant Stripe (`place-shop-order.handler.ts` l. 204/256)                                                                                                                                                                    | `order.totalCents` = Σ TTC, par construction                                                                                                                        | —                    |
| Facture, dossier, Factur-X, avoir, cohérence, relevés                                                                                                                                                                        | **hors du plan** : aucune facture à un particulier (`card-invoicing.ts`)                                                                                            | **non touché**       |
| CA HT, CA par SKU, statistiques                                                                                                                                                                                              | lisent les colonnes HT, qui restent additives — rien à changer, **à vérifier au lot C1**                                                                            | inchangé             |

## 7. Les colonnes et la migration

Migration **additive**, sur `orders`, `order_lines` et `delivery_notes` :

- `vat_method` (`line_ht` | `exact_ht`) sur `orders` et `delivery_notes`,
  ajoutée nullable, remplie à `line_ht` pour l'existant, puis non nulle sans
  défaut ;
- **les TTC de chaque terme** : `order_lines` porte déjà ses TTC scellés
  (`unit_price_ttc_cents`, `line_total_ttc_cents`, `orders.prisma:600,606` ;
  idem `delivery_note_lines`, `delivery-notes.prisma:97-98`) — pour
  `exact_ht`, ils reçoivent l'étiquette et quantité × étiquette ;
  `orders` gagne `discount_ttc_cents`, `voucher_ttc_cents`,
  `delivery_fee_ttc_cents`, nulles hors `exact_ht` (CHECK : non nulles si et
  seulement si `exact_ht`) ; `delivery_notes` les mêmes, sous une **contrainte conditionnelle à part**
  — le CHECK « tout ou rien » de sept entiers (`20261024230000`) n'est pas
  élargi ;
- **les colonnes HT existantes** reçoivent le HT calculé au § 4 (étape 4) —
  même sens, mêmes lecteurs ;
- `vat_shares` inchangé : `{rate, amountCents}`.

🔴 Irréversible dans les faits : dès la première commande `exact_ht`
prélevée, deux méthodes coexistent pour toujours. Tout lecteur futur qui
**recompose** un total lit les colonnes figées ; aucun ne recalcule depuis le
prix unitaire. L'agrégat de l'e-reporting B2C (2027) lira HT et TVA par taux
figés.

## 8. Qui voit quel calcul : l'espace de travail

Relu le 2026-10-27, sur indication de Hugo. La boutique déclare l'**espace de
travail** choisi sur chaque requête (`WORKSPACE_HEADER`,
`client-workspace.interceptor.ts`) ; le guard le confronte aux rattachements
(`auth.guard.ts`, `declaredCompany`) et les routes reçoivent la société
agissante (`@ActingCompany()`) : `null` dans l'espace perso.

Cette société choisit **déjà** les prix : `ShopCataloguePricing.priced`
déduit l'audience — `companyId === null ? "public" : "pro"` — au seul endroit
où elle se déduit ; panier et devis reçoivent la même société ; la commande
dérive sa clientèle de la même façon (`clienteleOf`). **La méthode suit donc
l'espace, sans rien ajouter.** Un pro dans son espace perso voit le calcul
particulier ; la vitrine pro sans jeton (`pricedWithoutCompany("pro")`) garde
le calcul pro. Aucun chiffre ne bouge dans un espace société.

## 9. Les lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                                       | Tests                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `composeTtcOrder` et `ttcOfHtAmount` dans `@lfd/money`, en entiers, sans appelant ; retrait de `ventilateVatExact` ; **recensement** des lecteurs des colonnes de montant et de `lineTotalCents(prix, qté)` (journal, `growth`, exports, spécimens, `order-composition.service.ts`, `quote-order.handler.ts`) — **porte d'entrée de C2** ([recensement](recensement-montants-de-commande.md)) | banana bread, 30 × 0,50, croissants, ticket U ; remise % et fixe sur deux taux, **dont le cas d'égalité au demi** (3,33 à 5,5 % + 3,33 à 20 %, −10 %) ; ligne offerte ; bon qui solde, bon qui laisse 1 c ; port standard, qui suit, en % ; **TVA ≥ HT net × taux** et **Σ HT + TVA = total** sur un balayage ; 0–200 000 c par taux ; `ventilateVat` figé |
| C2  | Migration (§ 7) ; `CartAdjustments` en TTC pour `public` ; `OrderLine.ofTtc` ; `Order.draft` et ses gardes ; devis ; bon                                                                                                                                                                                                                                                                      | e2e : panier public = commande = montant Stripe ; remise retrait et bon en TTC ; **20 paniers pro figés**                                                                                                                                                                                                                                                  |
| C3  | Vitrine, fiche, prix barré, aperçu du rayon ; BL partiel ; « Mes commandes », bon de commande, e-mail au format du ticket                                                                                                                                                                                                                                                                     | e2e BL partiel public ; captures des documents                                                                                                                                                                                                                                                                                                             |
| C4  | Doc : `chemin-du-prix-public.md`, diagnostic → doc d'état ; JSDoc de `ttcCentsOf`, `OrderLine`                                                                                                                                                                                                                                                                                                | `pnpm test` racine                                                                                                                                                                                                                                                                                                                                         |

## 9 bis. Lot C1 — bâti le 2026-10-27

`packages/money/src/ttc-order.ts` (`composeTtcOrder`),
`ttc-vat-allocation.ts` (étapes 2 et 3 du § 4), `ttc-of-ht-amount.ts` ;
`ventilateVatExact` retirée (aucun appelant). 133 tests, dont 5 000 paniers
à graine fixe et le balayage 0–200 000 c par taux. Recensement :
[`recensement-montants-de-commande.md`](recensement-montants-de-commande.md).

Choix faits au bâti, que le plan ne précisait pas :

- **Conversion d'un montant fixe HT** (`ttcOfHtAmount`) : le HT est découpé
  au prorata du TTC éligible (du TTC brut pour le port qui suit), chaque part
  convertie à son taux, le TTC obtenu redécoupé par taux. Le bon se borne au
  TTC net après remise ; le port en pourcentage prend pour assiette le TTC
  brut des marchandises, comme le HT brut côté pro
  (`cart-adjustments.service.ts:232`).
- **L'arrondi d'un pourcentage** est récrit en entiers dans `@lfd/money`
  (`percentOf`), qui ne dépend pas de `@lfd/contracts` où vit
  `cartAdjustmentCents`. Doublon assumé ; **C2 ajoute un test, dans l'API qui
  voit les deux, qui prouve qu'ils rendent la même chose.**
- **Le « cas d'égalité au demi »** du § 9 n'est une égalité qu'en HT : en TTC,
  les étiquettes valent 3,51 et 4,00 et la remise 0,75 se découpe 35 / 40. Le
  comportement à égalité est éprouvé directement sur l'allocation.

## 9 ter. Lot C2 — bâti le 2026-10-27 (non commité à l'écriture)

Migration `20261027100000_la_commande_d_un_particulier_en_ttc` : `vat_method`
(ajoutée, remplie à `line_ht`, puis non nulle sans défaut) et les trois TTC de
terme sur `orders` et `delivery_note`, sous un CHECK « TTC ⇔ `exact_ht` » à
part. `Order.draft` décide la méthode (`placementVatMethodOf`, sur l'absence
de société — jamais l'audience) ; `Order.recompose` la relit sur la commande.
Une composition par méthode (les fichiers « order-amounts » et « order-exact-amounts », dans le commit `4ef1316be` — retirés de l'arbre par le revert `ce2615199`),
`OrderLine.ofTtc`, et une seule traduction vers `composeTtcOrder`
(« exact-order-composition », même commit) pour l'agrégat, la composition de passation et
de révision, le devis de la boutique et le devis du staff. Le registre de
fidélité reçoit la valeur faciale (`Order.voucherFaceCents`). Vingt paniers
pro figés (les specs « order-pro-frozen » et « shop-cart-quoting-pro-frozen », même commit).

Choix faits au bâti, que le plan ne précisait pas :

- **La conversion en TTC n'est pas dans `CartAdjustments`** : il rend toujours
  la remise et le port HT et leur réglage ; la composition de passation
  (`OrderComposition.draftOf`) et le devis les rejouent en TTC par
  `composeExactOrder`. Le mode de TVA du port n'est connu qu'après l'heure
  limite (`arrange`), et `CartAdjustments` reçoit l'audience, pas la méthode.
- **Les vues de devis et de révision gardent le sens HT de leurs champs**
  (contrats servis) ; elles restent additives (Σ HT + TVA = total). Exposer
  les TTC des termes aux fronts est le lot C3.
- **Le BL écrit `line_ht`** et des TTC nuls jusqu'au lot C3 ; un BL partiel
  d'une commande `exact_ht` y est encore calculé HT : C2 ne part pas en
  production sans C3.

## 9 quater. C2 retiré du déploiement du 2026-10-27

Hugo : « on déploie sans C2 ». C2 (`4ef1316be`) est annulé par un `git
revert` sur `dev` avant la mise en production ; C1 reste (aucun appelant).
**Pour le faire revenir** : annuler ce revert, **et renommer sa migration**
(`20261027100000_la_commande_d_un_particulier_en_ttc`) avec un horodatage
postérieur à la dernière migration déployée — elle est aujourd'hui plus
ancienne que `20261027110000_le_prix_pro_est_toujours_saisi`, appliquée en
production avec R3 (relecture `lecteur-de-migrations`, 2026-10-27). C2 repart
avec C3, et après la réponse du cabinet (§ 10, Q1).

## 10. Décisions et questions

- **Décidé par Hugo le 2026-10-27** : « on sépare le calcul particulier » — le
  pro garde le sien (HT de ligne arrondi une fois, TVA une fois par taux,
  BR-S-08 d'EN 16931).
- **Décidé par Hugo le 2026-10-27** : « on ne doit surtout pas avoir moins de
  TVA » → arrondi au supérieur.
- **Décidé par Hugo le 2026-10-27** : « si la grande surface le fait pour le
  particulier on y va » → TVA en dedans pour le particulier.
- **Décidé par Hugo le 2026-10-27** : « B, je veux le système le mieux » —
  commande de particulier en TTC de bout en bout.
- **Q2 tranchée le 2026-10-27** (Hugo : « prends la meilleure décision
  possible ») : **pour un particulier, la valeur d'un palier est un montant
  TTC**. Un bon « de 5 € » retire 5,00 € de ce qu'il paie — c'est ce qu'il lit
  et ce qu'il comprend ; le convertir (5,28 €) ferait d'un nombre rond un
  nombre que personne n'a décidé. Pour un pro, la même valeur reste HT. Le
  registre garde donc **la valeur faciale** du bon (`appliedCents` dans
  l'unité de l'audience de la commande) : imputer 5 € sur un bon de 5 €
  l'épuise, pour l'un comme pour l'autre. L'écran de réglage dira « € — HT
  pour un pro, TTC pour un particulier ».
- **Q1 — le cabinet** : la question se resserre. « Pour une vente à un
  particulier, peut-on extraire la TVA du TTC de chaque taux, arrondie au
  centime supérieur, le HT étant la différence — comme le fait un ticket de
  caisse de grande surface ? » La mise en production attend cette réponse ou
  une décision écrite de Hugo.

## 11. Relectures `vitruve`

Les révisions 1 à 3 sont abandonnées ; leurs objections ont façonné la
révision 4 (colonnes HT additives, aucun écart, TTC de référence).

### Révision 1 (2026-10-27)

Neuf objections, dont trois bloquantes (en-tête HT + TVA ≠ TTC ; un bon qui
solde laisse 0,01 € ; le BL partiel recalcule), traitées dans la révision 1.
La révision 2 change le cœur du calcul ; ses réponses à B1, B2 et B3 sont à
revérifier.

### Révision 2 (2026-10-27)

L'inégalité du § 4 est confirmée (et `round(HT × t) ≤ TVA` aussi), les
quatre exemples recalculés justes. Mais :

- **B1** `baseCents` serait effacé à chaque relecture : `vatShareSchema`
  (`packages/contracts/src/order.ts:622`) retire les clés inconnues, et
  `order-money-columns.ts:162` réécrit `{rate, amountCents}` — schéma partagé
  avec le pro. `vat_shares` existe aussi sur `delivery_notes`.
- **B2** « Mes commandes » (`order-summary-format.ts:43-51`) affiche sous-total
  HT + TVA = total : 19,91 + 1,10 ≠ 21,00. Le front ignore l'écart.
- **B3** le BL partiel recopie l'en-tête sous un CHECK de sept colonnes
  (`delivery-notes.prisma:45-58`) et recalcule par `computeOrderTotals` ; rien
  n'y range un écart.
- **S1** l'exigence ne porte que sur le HT dérivé : 30 articles à 0,50 € à
  20 % → Σ HT de lignes 12,60, HT dérivé 12,50, TVA 2,50 < 12,60 × 20 %.
  L'écart vaut jusqu'à ~0,5 c par ligne, pas « quelques centimes ».
- **S2** le flottant casse l'inégalité (3063 c à 2,1 % → 64) : arithmétique
  entière imposée.
- **S3** une part de TVA nulle disparaît avec sa base (dans `ventilateVatExact`, retirée au lot C1).
- **S4** C1′ est une réécriture (type `VatVentilation` partagé, retour du
  total, tests 1,41 / 0,09).
- **S5** le § 3 sur-affirme : un ticket ne prouve pas une méthode, NF 525
  porte sur l'inaltérabilité, et U arrondit au plus proche — il ne soutient
  pas le ⌈⌉.
- **S6/S7** lecteurs absents (`order-sheet-text.ts`), agrégat de l'e-reporting.

**Réponse : la révision 3** (§ 4), écrite à partir de cette piste : B1, B2 et S1 ont une seule
racine — un HT de ligne qui ne somme plus vers le HT d'en-tête. Pour une
commande `exact_ht`, **répartir le HT de chaque taux sur ses lignes** (plus
fort reste, comme `splitOrderByRate`) et stocker CE HT sur les lignes : Σ
lignes = HT d'en-tête, plus de colonne d'écart, plus de `baseCents` (il se
relit sur les lignes), « Mes commandes » et le BL redeviennent justes, et
l'exigence vaut sur chaque ligne. Reste à trancher : sur quel HT se calculent
et se bornent les remises (aujourd'hui le HT de ligne, avant répartition), et
le BL partiel d'un sous-ensemble de lignes.

### Révision 3 (2026-10-27)

**Quatre bloquants — la répartition ne tient pas** :

1. Avec une remise ou un extra, l'« écart » n'est pas défini : le HT du taux
   est net des remises et contient les extras, alors que les lignes sont
   brutes et que l'en-tête soustrait et ajoute ces termes à part. Remise
   retrait 10 % sur 3,33 (5,5 %) + 3,33 (20 %) : lignes figées 2,99 + 2,99,
   en-tête 5,98 − 0,67 + 0,77 = 6,08 ≠ 6,75. Et « TVA ≥ Σ HT figés × taux »
   redevient faux (3,33 × 20 % > 0,60).
2. Un taux sans ligne (port au taux normal sur un panier à 5,5 %) : l'écart
   n'a aucune ligne où se poser, et baisser le port rompt
   `ensureDeliveryFeeMatches`.
3. Le BL partiel mélange lignes figées (réparties) et lignes recalculées
   (`departing-source.ts:53-55`), puis rejoue remises et gardes.
4. `OrderLine` interdit qu'on lui fournisse un HT (`order-line.ts:96-99`).

Sérieux : l'assiette « remise retrait sur X € » relue sur les lignes
(`pickup-discount-base.ts`), le CA par SKU, une ligne à 0, une répartition
d'écart négatif qui est un algorithme neuf.

**Constat** : chaque révision déplace l'écart sans l'éteindre, parce que la
commande est construite en HT (lignes, remises, port, gardes) et qu'on lui
demande un total juste en TTC. Deux voies restent, à trancher par Hugo :
la révision 2 (écart nommé, l'exigence tenue sur la base déclarée par taux)
en corrigeant ses lecteurs, ou une commande de particulier construite en TTC
de bout en bout.

### Révision 4

Quatre bloquants, traités en révision 5 :

- **B1** la répartition de la TVA n'avait pas de règle (division par zéro sur
  un bon qui solde, taux apparent de 6,4 % sur un bon partiel) → pondération
  par la TVA contenue, reste au plus fort, départage fixe (§ 4).
- **B2** le TTC scellé d'aujourd'hui n'est pas quantité × étiquette, et la
  promesse « sous promotion » était fausse → la ligne vaut quantité ×
  étiquette ; le centime qui bouge sur certaines étiquettes est annoncé (§ 4).
- **B3** la révision rejoue `draft` → méthode lue sur la commande, montants
  dans l'unité de la méthode (§ 5).
- **B4** le BL partiel mélangeait deux répartitions → recomposé en entier.

Sérieux : port en pourcentage (R1 bis), conversion nommée des montants fixes
(R2), registre de fidélité (R6, lié à Q2), recensement en porte d'entrée de
C2. Mineurs : noms des colonnes, contrainte conditionnelle, garde de la
surtaxe. Aucun endroit trouvé où le pro changerait.

### Révision 5 (2026-10-27)

B1 à B4 de la révision 4 confirmés réglés, calculs refaits (bon qui solde,
bon qui laisse 1 c, promotion × 2). Deux bloquants nouveaux, traités dans le
texte : la règle du demi-centime et du reste signé (§ 4), l'arrondi d'un
pourcentage sur TTC (§ 5). Sérieux traités : port et bon au BL, terme nul ou
offert, bascule des paniers ouverts. Mineur : l'exemple 30 × 0,50 se lit
avec l'ordre de départage (10 centimes d'écart, aux dix premières lignes).
