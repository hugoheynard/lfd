# Plan — un particulier paie la somme des étiquettes

> 📝 **Plan, révision 3 du 2026-10-27** — le HT du taux se répartit sur les
> lignes, plus d'écart d'en-tête. Révision 2 — la TVA d'un particulier n'est plus
> le reste d'un HT gardé, elle se calcule « en dedans » et s'arrondit au
> centime **supérieur** : elle ne peut jamais être inférieure à HT × taux
> (exigence de Hugo). Le lot C1 (révision 1) est bâti et devra être repris (§ 8).
>
> Plan, première écriture le 2026-10-27. Il répond à
> [`ecart-du-centime-particuliers.md`](ecart-du-centime-particuliers.md), dont il
> reprend le diagnostic sans le recopier, et propose une autre piste que le
> « TTC d'abord » retiré le 2026-10-09. Relu par `vitruve` le 2026-10-27 :
> trois objections bloquantes, intégrées ci-dessous et listées au § 9.
>
> 🔴 **Le pro n'est pas touché.** Aucune fonction qu'un panier ou une commande
> pro traverse ne change de résultat ; un test le fige (§ 7, lot C3).

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

## 4. La méthode : TVA en dedans, arrondie au supérieur

Pour chaque taux d'une commande de particulier :

1. **TTC du taux** = HT exact net (millicentimes, remises au prorata, extras
   compris) × (1 + taux), **un seul arrondi** au centime. Sans remise, c'est
   Σ des étiquettes (lot C1, testé sur 4 000 paniers).
2. **TVA du taux** = TTC × taux / (100 + taux), **arrondie au centime
   supérieur**.
3. **HT du taux** = TTC − TVA.

**Pourquoi la TVA ne peut jamais être inférieure** : soit x = TTC × t / (1+t)
la TVA exacte contenue. Avec TVA = ⌈x⌉, le HT vaut TTC − ⌈x⌉ ≤ TTC − x =
TTC / (1+t), donc HT × t ≤ x ≤ TVA. Ce n'est pas une mesure, c'est une
inégalité. Le surplus encaissé est **< 1 centime par taux**, jamais plus.

Avec l'arrondi au plus proche (le ticket U), TVA = x − δ avec δ ≤ 0,5 c, et
HT × t = x + δ·t : la TVA peut alors tomber sous HT × t arrondi d'un centime
(x = n,4999 c à 20 % : TVA n, HT × t = n,5999 → n + 1). Rare, mais possible —
et c'est exactement ce que Hugo refuse.

| Exemple               | TTC   | TVA (⌈⌉) | HT    | HT × taux | Contrôle     |
| --------------------- | ----- | -------- | ----- | --------- | ------------ |
| Banana bread 5,5 %    | 21,00 | 1,10     | 19,90 | 1,0945    | 1,10 ≥ ✓     |
| Deux croissants 5,5 % | 2,40  | 0,13     | 2,27  | 0,12485   | 0,13 ≥ ✓     |
| Ticket U, 5,5 %       | 11,03 | 0,58     | 10,45 | 0,57475   | ✓            |
| Ticket U, 20 %        | 13,45 | 2,25     | 11,20 | 2,24      | ✓ (U : 2,24) |

Le HT du banana bread passe de 19,91 € (aujourd'hui) à 19,90 € : c'est le
centime que le client ne paie plus, et c'est sur le HT qu'il est pris, pas sur
la taxe.

### Le HT se répartit sur les lignes (révision 3)

On ne peut avoir à la fois (a) TTC = étiquettes, (b) HT d'en-tête = Σ des HT
de lignes **calculés avant**, (c) TVA ≥ HT × taux. La révision 2 lâchait (b)
par une colonne d'écart, et `vitruve` a montré que ça cassait trois lecteurs
(« Mes commandes », le BL, `vat_shares`) et que l'exigence de Hugo ne valait
alors que sur l'en-tête : 30 articles à 0,50 € à 20 % → Σ lignes 12,60 € HT,
en-tête 12,50 €, TVA 2,50 € < 12,60 × 20 %.

La révision 3 garde (b) en **recalculant le HT des lignes** : une fois le HT
de chaque taux connu, on **répartit l'écart** entre ce HT et Σ des HT de
lignes arrondis sur les lignes de ce taux, au plus fort reste (le découpage
de `splitOrderByRate`, que la facture tient déjà), et c'est **ce HT réparti**
qui est figé sur chaque ligne.

| Exemple                    | HT de lignes avant | HT du taux | HT de lignes figé             |
| -------------------------- | ------------------ | ---------- | ----------------------------- |
| Banana bread 21,00 à 5,5 % | 19,91              | 19,90      | 19,90                         |
| 30 × 0,50 € à 20 %         | 30 × 0,42 = 12,60  | 12,50      | 10 × 0,41 + 20 × 0,42 = 12,50 |

Conséquences :

- **Σ lignes = HT d'en-tête**, toujours : aucune colonne d'écart, aucun champ
  ajouté à `vat_shares` (B1 de la révision 2 disparaît — le schéma partagé
  avec le pro n'est pas touché). « Mes commandes » affiche 19,90 + 1,10 =
  21,00 (B2 disparaît).
- **L'exigence vaut sur chaque ligne** : Σ HT figés × taux = HT du taux ×
  taux ≤ TVA.
- **Les remises et leurs plafonds ne changent pas** : ils se calculent en
  amont (`cart-adjustments.service.ts`) et se vérifient dans `Order.draft`
  (`ensure*Matches`) sur le HT de ligne **avant répartition**, comme
  aujourd'hui ; la répartition a lieu **après** les gardes, juste avant de
  figer. Une révision recalcule ses lignes depuis le prix unitaire, donc
  repart du HT avant répartition et refait la même chaîne.
- **Le HT d'une ligne figée n'est plus `lineTotalCents(prix, quantité)`** à
  quelques centimes près. Tout lecteur qui le recalcule depuis le prix
  unitaire au lieu de le lire se tromperait : le lot C1′ les recense.
- **Le TTC de ligne scellé** reste `ttcCentsFromHtMillicents(prix ×
quantité)` — l'étiquette × quantité — et c'est lui que le particulier lit.

### Le bon de livraison partiel

Un BL partiel d'une commande `exact_ht` applique **la même fonction** au
sous-ensemble livré (prix unitaire × quantité livrée, mêmes remises
réparties) : TTC un arrondi, TVA ⌈en dedans⌉, HT réparti. Il range ses
montants dans ses colonnes actuelles (le CHECK « tout ou rien » de
`delivery-notes.prisma:45-58` est inchangé, aucune colonne n'est ajoutée).
`departing-source.ts:61` scelle ses TTC de ligne par
`ttcCentsFromHtMillicents`.

### Le calcul est entier

En flottant, l'arrondi au supérieur se trompe (3063 c à 2,1 % : 63,00000000000001
→ 64). Toute la fonction travaille en entiers (`bigint`, taux en points de
base, comme `fractionByBasisPoints`), et un test balaie 0–200 000 c sur chaque
taux du catalogue.

## 5. Ce qui change, endroit par endroit

| Endroit                                                                                                                                                                                | Particulier (`exact_ht`)                                                  | Pro                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `@lfd/money` : `ventilateVatExact` **réécrite** (C1′), avec son **propre type de sortie** — `VatVentilation` n'est pas touché                                                          | TTC par taux ; TVA ⌈en dedans⌉ ; HT par différence ; HT réparti par ligne | non lue                                       |
| `ventilateVat`, `VatVentilation`, `VatShare`, `vatShareSchema`                                                                                                                         | —                                                                         | **inchangés, figés par `vat-frozen.spec.ts`** |
| Vignette, fiche, prix barré (`shop-catalogue-view.ts:75`, `shop-catalogue-pricing.service.ts:240`), aperçu du rayon (`shelf-catalogue.ts:192-202`)                                     | `ttcCentsFromHtMillicents`                                                | inchangé                                      |
| Devis du panier (`shop-cart-quoting.service.ts`), effet du bon (`voucher-total-effect.ts`)                                                                                             | `ventilateVatExact`                                                       | inchangé                                      |
| `computeOrderTotals` → `Order.draft`                                                                                                                                                   | gardes sur le HT avant répartition, puis répartition, puis figer          | inchangé                                      |
| `OrderLine` (`order-line.ts:160-161`)                                                                                                                                                  | TTC scellés `ttcCentsFromHtMillicents` ; HT de ligne = HT réparti         | `null`, inchangé                              |
| BL partiel (`delivery-notes/domain/value-objects/delivery-note-terms.ts:173`, `departing-source.ts:61`)                                                                                | même fonction sur le sous-ensemble                                        | inchangé                                      |
| « Mes commandes » (`order-summary-format.ts:43-51`), bon de commande PDF (`order-sheet-pdf-totals.ts`), texte du bon (`order-sheet-text.ts:112-149`), e-mail (`mail-templates.ts:530`) | lisent l'en-tête, qui se recompose : rien à changer, **à vérifier au C3** | inchangé                                      |
| Montant Stripe (`place-shop-order.handler.ts` l. 204/256)                                                                                                                              | `order.totalCents`, corrigé par construction                              | —                                             |
| Facture, dossier, Factur-X, avoir, cohérence                                                                                                                                           | **hors du plan** : aucune facture à un particulier (`card-invoicing.ts`)  | **non touché**                                |

## 6. Le marqueur de méthode

Migration **additive** : `orders.vat_method` (`line_ht` | `exact_ht`) et la
même sur `delivery_notes` (un BL suit la méthode de sa commande). Ajoutées
nullables, remplies à `line_ht` pour l'existant, puis non nulles **sans
défaut**. La méthode se décide une fois dans `Order.draft` depuis la clientèle
(`clienteleOf`), puis se relit de la colonne. Une révision garde la méthode
de la commande révisée (cas presque vide : `Order.revise` refuse la carte).

🔴 Irréversible dans les faits : dès la première commande `exact_ht`
prélevée, deux méthodes coexistent pour toujours, et tout lecteur qui
**recalcule** un HT de ligne depuis le prix unitaire devra brancher sur
`vat_method`. L'agrégat de l'e-reporting B2C (2027) lira les HT et TVA figés,
jamais un recalcul.

## 7. Qui voit quel calcul : l'espace de travail

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

## 8. Les lots

| Lot | Contenu                                                                                            | Tests                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1′ | Reprendre `ventilateVatExact` : TVA ⌈en dedans⌉ par taux, HT par différence, écart nommé en sortie | ticket U ; banana bread 1,10 / 19,90 ; 30 × 0,50 ; **TVA ≥ Σ HT figés × taux sur tout le balayage** ; Σ lignes = en-tête ; remises ; tout couvert = 0 ; 0–200 000 c par taux |
| C2  | Migration (`vat_method` sur `orders` et `delivery_notes`) ; `Order.draft`, `OrderLine`, devis, bon | e2e : panier public = commande = montant Stripe ; pro inchangé                                                                                                               |
| C3  | Vitrine, fiche, prix barré, aperçu du rayon ; BL partiel ; bon de commande PDF au format du ticket | **20 paniers pro figés** avant/après ; BL partiel public = commande                                                                                                          |
| C4  | Doc : `chemin-du-prix-public.md`, diagnostic → doc d'état, JSDoc de `ttcCentsOf`                   | `pnpm test` racine                                                                                                                                                           |

## 9. Décisions et questions

- **Décidé par Hugo le 2026-10-27** : « on sépare le calcul particulier » — le
  pro garde le sien (HT de ligne arrondi une fois, TVA une fois par taux,
  BR-S-08 d'EN 16931).
- **Décidé par Hugo le 2026-10-27** : « on ne doit surtout pas avoir moins de
  TVA » → arrondi au supérieur.
- **Décidé par Hugo le 2026-10-27** : « si la grande surface le fait pour le
  particulier on y va » → TVA en dedans pour le particulier.
- **Q1 — le cabinet** : la question se resserre. « Pour une vente à un
  particulier, peut-on extraire la TVA du TTC de chaque taux, arrondie au
  centime supérieur, le HT étant la différence — comme le fait un ticket de
  caisse de grande surface ? » La mise en production attend cette réponse ou
  une décision écrite de Hugo.

## 10. Relectures `vitruve`

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
- **S3** une part de TVA nulle disparaît (`vat-exact.ts:91`) avec sa base.
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
