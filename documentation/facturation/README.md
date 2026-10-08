# Facturation — le dossier qu'on remet au comptable, puis la facture

Ouvert le **2026-10-08** (Hugo : « j'ai besoin qu'on fasse un dossier
documentation/facturation »). Il commence par un **simulateur de dossier de
facturation** : pour un payeur et un cycle, la facture qu'on émettrait, les
bons qu'elle couvre, l'historique de chacun, et le contrôle des arrondis —
pour que le comptable vérifie, dans son espace Comptabilité, que nos calculs
sont conformes.

## Ce qui fait foi

| Doc                                                                                      | État                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plan-simulateur-dossier-de-facturation.md`](plan-simulateur-dossier-de-facturation.md) | ✅ bâti le 2026-10-08 (DF1-DF4 : calcul, route et CSV, historique, écran Comptabilité › « Dossier de facturation ») — le dossier d'un payeur sur un cycle : facture simulée (une ligne par produit et par prix, datée), bons, historique, écarts d'arrondi |
| [`plan-le-prelevement-suit-la-facture.md`](plan-le-prelevement-suit-la-facture.md)       | 📐 plan v2 — le prélèvement encaisse le total facturé, figé dans un arrêté par ligne de débit                                                                                                                                                              |
| [`prelevement-automatique.md`](prelevement-automatique.md)                               | ✅ doc d'état — le mois de prélèvement : réglages de l'entité, calendrier TARGET2, avis de prélèvement, préparation automatique une fois par mois, écran « Prélèvement du mois » (PA1-PA4, 2026-10-08)                                                     |
| [`plan-bons-et-facture-concordants.md`](plan-bons-et-facture-concordants.md)             | 📐 plan v2 — des bons et une facture qui ne se contredisent pas : HT repris des bons (F6), bon HT pour les pros au compte (F5) ; F5-0 bâti                                                                                                                 |
| [`plan-emission-de-la-facture.md`](plan-emission-de-la-facture.md)                       | 📐 plan v2 — la facture Factur-X EN 16931 : émise le dernier jour du mois sur les livraisons, numérotée par entité, le lot ne fait que l'encaisser ; carte à la livraison                                                                                  |

## Ce qui existe ailleurs, et qu'il ne faut pas réécrire

Ces documents restent où ils sont tant qu'un chantier ne les reprend pas :

- [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md) —
  📐 la facture comme agrégat figé, la numérotation sans trou, Factur-X, les
  deux régimes (à la commande, au compte), dix tranches. Rien n'est codé.
- [`../order/plan-agregation-des-commandes.md`](../order/plan-agregation-des-commandes.md) —
  🟡 le **relevé de cycle**, bâti le 2026-10-05 (Comptabilité, route
  `admin/accounting/statements`) : le point de départ du dossier.
- [`../order/todo-export-des-commandes-pour-le-comptable.md`](../order/todo-export-des-commandes-pour-le-comptable.md) —
  la règle des arrondis : on **somme** les TVA déjà arrondies des commandes,
  on ne recalcule jamais une TVA sur une base agrégée.
- [`../comptabilite/`](../comptabilite/README.md) — l'entité qui émet, le
  mandat, le prélèvement.

## Les décisions d'Hugo

- **2026-10-05** : c'est LFC qui produira la facture (`plan-agregation-des-commandes.md`).
- **2026-10-08** : la seule obligation de forme est de produire les factures
  dans un format structuré (Factur-X, UBL, CII) ; la facture porte **une ligne
  par produit et par prix, datée** ; le simulateur montre aussi l'écart, en
  centimes, avec un calcul fait en une fois sur l'agrégat.
