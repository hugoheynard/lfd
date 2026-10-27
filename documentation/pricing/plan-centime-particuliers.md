# Plan — un particulier paie la somme des étiquettes

> 📝 **Plan, révision 2 du 2026-10-27** — la TVA d'un particulier n'est plus
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
différence.** C'est la méthode « en dedans », pratiquée par une caisse
certifiée, sur une vente à un particulier. Ce n'est pas un texte de loi, mais
c'est l'usage d'un acteur qui y est soumis — et ça répond à l'objection S9 de
la révision 1 mieux qu'une analogie.

Le ticket arrondit **au plus proche** (2,24167 → 2,24). Sur ce ticket, la TVA
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

### Le HT d'en-tête n'est plus Σ des HT de lignes — et c'est assumé

C'est l'objection B1 de la révision 1, et elle ne se contourne pas : on ne
peut avoir à la fois (a) TTC = étiquettes, (b) HT = Σ lignes arrondies, (c)
TVA ≥ HT × taux. Hugo garde (a) et (c). Le ticket U fait la même chose : il
**n'affiche aucun HT de ligne**.

Conséquences, à trancher dans ce plan :

- **Les lignes d'une commande de particulier gardent leur HT arrondi**
  (`lineTotalCents`) : c'est sur lui que se calculent et se bornent la remise
  retrait, le bon, la surtaxe et le port (`order.ts`, `ensure*Matches`) —
  inchangés. Il sert au calcul, il ne s'affiche plus nulle part au particulier.
- **L'en-tête porte un terme nommé** : `rounding_gap_cents` = Σ HT des taux −
  (Σ HT des lignes − remises + extras HT). Quelques centimes, signe libre.
  L'égalité `Σ lignes − remises + extras + écart + TVA = total` se recompose
  donc toujours ; aucun lecteur ne la casse en silence.
- **Les documents du particulier** (panier, récapitulatif, bon de livraison
  public, bon de commande PDF) affichent comme le ticket : lignes TTC, total,
  et un récapitulatif **par taux** HT / TVA / TTC lu sur la commande. Jamais
  un HT de ligne.
- **Le HT et la TVA par taux sont figés** sur la commande (`vatShares` gagne
  `baseCents` pour `exact_ht`) : un lecteur ne les recalcule pas.

## 5. Ce qui change, endroit par endroit

| Endroit                                                                                                                                                           | Particulier (`exact_ht`)                                                    | Pro                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| `@lfd/money` : `ventilateVatExact` (C1, à reprendre)                                                                                                              | TTC par taux un arrondi ; TVA ⌈en dedans⌉ ; HT par différence ; écart nommé | non lue                                     |
| `ventilateVat`                                                                                                                                                    | —                                                                           | **inchangé, figé par `vat-frozen.spec.ts`** |
| Vignette, fiche, prix barré (`shop-catalogue-view.ts:75`, `shop-catalogue-pricing.service.ts:240`), aperçu du rayon au back-office (`shelf-catalogue.ts:192-202`) | `ttcCentsFromHtMillicents`                                                  | inchangé                                    |
| Devis du panier (`shop-cart-quoting.service.ts`) et effet du bon (`voucher-total-effect.ts`)                                                                      | `ventilateVatExact`                                                         | inchangé                                    |
| `computeOrderTotals` → `Order.draft`                                                                                                                              | choisit selon la clientèle ; fige HT et TVA par taux et l'écart             | inchangé                                    |
| `OrderLine` (`order-line.ts:160-161`), TTC scellés                                                                                                                | `ttcCentsFromHtMillicents`                                                  | `null`                                      |
| BL partiel (`delivery-note-terms.ts:173`, `departing-source.ts:61`)                                                                                               | suit `vat_method`                                                           | inchangé                                    |
| Bon de commande PDF (`order-sheet-pdf-totals.ts`)                                                                                                                 | récapitulatif par taux lu sur la commande                                   | inchangé                                    |
| Montant Stripe (`place-shop-order.handler.ts` l. 204/256)                                                                                                         | `order.totalCents`, corrigé par construction                                | —                                           |
| Facture, dossier, Factur-X, avoir (`invoice-*`, `refund-credit-note.ts`)                                                                                          | **hors du plan** : aucune facture à un particulier (`card-invoicing.ts`)    | **non touché**                              |
| Cohérence (`invoice-order-consistency.ts`)                                                                                                                        | ne lit que les bons facturés, donc pro                                      | non touché                                  |

## 6. Le marqueur de méthode

Migration **additive** : `orders.vat_method` (`line_ht` | `exact_ht`),
`orders.rounding_gap_cents` (entier, nul sauf `exact_ht`). `vat_method`
ajoutée nullable, remplie à `line_ht` pour l'existant, puis non nulle **sans
défaut**. La méthode se décide une fois dans `Order.draft` depuis la clientèle
(`clienteleOf`), puis se relit de la colonne. Une révision garde la méthode de
la commande révisée (cas presque vide : `Order.revise` refuse la carte).

🔴 Irréversible dans les faits : dès la première commande `exact_ht`
prélevée, deux méthodes coexistent pour toujours.

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

| Lot | Contenu                                                                                              | Tests                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C1′ | Reprendre `ventilateVatExact` : TVA ⌈en dedans⌉ par taux, HT par différence, écart nommé en sortie   | ticket U ; banana bread 1,10 / 19,90 ; **TVA ≥ HT × taux sur tout le balayage** ; écart recomposé ; remises ; tout couvert = 0 |
| C2  | Migration (`vat_method`, `rounding_gap_cents`, `baseCents`) ; `Order.draft`, `OrderLine`, devis, bon | e2e : panier public = commande = montant Stripe ; pro inchangé                                                                 |
| C3  | Vitrine, fiche, prix barré, aperçu du rayon ; BL partiel ; bon de commande PDF au format du ticket   | **20 paniers pro figés** avant/après ; BL partiel public = commande                                                            |
| C4  | Doc : `chemin-du-prix-public.md`, diagnostic → doc d'état, JSDoc de `ttcCentsOf`                     | `pnpm test` racine                                                                                                             |

## 9. Décisions et questions

- **Décidé par Hugo le 2026-10-27** : « on sépare le calcul particulier » — le
  pro garde le sien (HT de ligne arrondi une fois, TVA une fois par taux,
  BR-S-08 d'EN 16931).
- **Décidé par Hugo le 2026-10-27** : « on ne doit surtout pas avoir moins de
  TVA » → arrondi au supérieur.
- **Q1 — le cabinet** : la question se resserre. « Pour une vente à un
  particulier, peut-on extraire la TVA du TTC de chaque taux, arrondie au
  centime supérieur, le HT étant la différence — comme le fait un ticket de
  caisse de grande surface ? » La mise en production attend cette réponse ou
  une décision écrite de Hugo.

## 10. Relectures `vitruve`

### Révision 1 (2026-10-27)

Neuf objections, dont trois bloquantes (en-tête HT + TVA ≠ TTC ; un bon qui
solde laisse 0,01 € ; le BL partiel recalcule), corrigées en révision 1.
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

**Piste pour une révision 3 (non écrite)** : B1, B2 et S1 ont une seule
racine — un HT de ligne qui ne somme plus vers le HT d'en-tête. Pour une
commande `exact_ht`, **répartir le HT de chaque taux sur ses lignes** (plus
fort reste, comme `splitOrderByRate`) et stocker CE HT sur les lignes : Σ
lignes = HT d'en-tête, plus de colonne d'écart, plus de `baseCents` (il se
relit sur les lignes), « Mes commandes » et le BL redeviennent justes, et
l'exigence vaut sur chaque ligne. Reste à trancher : sur quel HT se calculent
et se bornent les remises (aujourd'hui le HT de ligne, avant répartition), et
le BL partiel d'un sous-ensemble de lignes.
