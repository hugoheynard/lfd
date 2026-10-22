# Facturation — le dossier qu'on remet au comptable, puis la facture

Ouvert le **2026-10-08** (Hugo : « j'ai besoin qu'on fasse un dossier
documentation/comptabilite/facturation »). Il commence par un **simulateur de dossier de
facturation** : pour un payeur et un cycle, la facture qu'on émettrait, les
bons qu'elle couvre, l'historique de chacun, et le contrôle des arrondis —
pour que le comptable vérifie, dans son espace Comptabilité, que nos calculs
sont conformes.

## Ce qui fait foi

| Doc                                                                                      | État                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`simulateur-dossier-de-facturation.md`](simulateur-dossier-de-facturation.md)           | ✅ doc d'état — le dossier d'un payeur sur un mois : la facture (calcul unique, repris par la facture émise), les bons et leur frise, les écarts au centime ; écran et trois CSV                                   |
| [`le-prelevement-suit-la-facture.md`](le-prelevement-suit-la-facture.md)                 | ✅ doc d'état — le montant prélevé est le total d'une pièce figée : les factures émises depuis E4, l'arrêté de facturation avant ; le bon non facturable exclu                                                     |
| [`../prelevement/prelevement-automatique.md`](../prelevement/prelevement-automatique.md) | ✅ doc d'état — le mois de prélèvement : réglages de l'entité, calendrier TARGET2, avis de prélèvement, préparation automatique une fois par mois, écran « Prélèvement du mois » (PA1-PA4, 2026-10-08)             |
| [`bons-et-facture-concordants.md`](bons-et-facture-concordants.md)                       | ✅ doc d'état — le HT de la facture est celui des bons ; le régime figé de la commande ; le bon d'un pro au compte en HT, la facture porte TVA et TTC                                                              |
| [`facture-emise.md`](facture-emise.md)                                                   | ✅ doc d'état — la facture et l'avoir Factur-X EN 16931 (PDF/A-3b) : numérotation par entité, facture du mois à 23h55 une par mandat, e-mail, Mes factures, renvoi ; le lot encaisse des factures                  |
| [`factur-x.md`](factur-x.md)                                                             | 📖 explication — le format Factur-X, les profils (EN 16931 retenu, 2026-10-22), les arrondis (HT par ligne, TVA une fois par taux), la chaîne de production d'une pièce, ce qui est vérifié et ce qui ne l'est pas |
| [`todo-facture-du-mois.md`](todo-facture-du-mois.md)                                     | ⏳ avant le 30 novembre : 65 sociétés sans adresse de facturation, mentions de paiement de l'entité ; la règle « pas de commande, pas de facture »                                                                 |
| [`facture-carte-et-remboursements.md`](facture-carte-et-remboursements.md)               | ✅ doc d'état — la facture acquittée d'une commande pro payée par carte, retirée et payée ; les remboursements Stripe constatés et leur avoir au prorata, reste exact au solde                                     |
| [`plan-rythme-de-facturation.md`](plan-rythme-de-facturation.md)                         | 📐 plan (2026-10-12), contredit par `vitruve` — mensuel, deux fois par mois ou chaque semaine, réglé sur l'entité (révisé le 2026-10-12) ; la facture suit le rythme                                               |
| [`plan-page-mes-factures.md`](plan-page-mes-factures.md)                                 | 📐 plan (2026-10-21), contredit par `vitruve` — la page « Mes factures » de la boutique : statut de règlement dérivé des lots, total dû, filtres, zip                                                              |

## Ce qui existe ailleurs, et qu'il ne faut pas réécrire

Ces documents restent où ils sont tant qu'un chantier ne les reprend pas :

- [`../../b2b/architecture-facturation.md`](../../b2b/architecture-facturation.md) —
  📐 la facture comme agrégat figé, la numérotation sans trou, Factur-X, les
  deux régimes (à la commande, au compte), dix tranches. Rien n'est codé.
- [`../../commandes/plan-agregation-des-commandes.md`](../../commandes/plan-agregation-des-commandes.md) —
  🟡 le **relevé de cycle**, bâti le 2026-10-05 (Comptabilité, route
  `admin/accounting/statements`) : le point de départ du dossier.
- [`../../commandes/todo-export-des-commandes-pour-le-comptable.md`](../../commandes/todo-export-des-commandes-pour-le-comptable.md) —
  la règle des arrondis : on **somme** les TVA déjà arrondies des commandes,
  on ne recalcule jamais une TVA sur une base agrégée.
- [`../comptabilite/`](../README.md) — l'entité qui émet, le
  mandat, le prélèvement.

## Les décisions d'Hugo

- **2026-10-05** : c'est LFC qui produira la facture (`plan-agregation-des-commandes.md`).
- **2026-10-08** : la seule obligation de forme est de produire les factures
  dans un format structuré (Factur-X, UBL, CII) ; la facture porte **une ligne
  par produit et par prix, datée** ; le simulateur montre aussi l'écart, en
  centimes, avec un calcul fait en une fois sur l'agrégat.
