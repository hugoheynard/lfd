# TODO — régler une sélection de commandes, et en tirer une facture

**Ouvert le 2026-10-05**, pendant le chantier sous-comptes
([`../b2b/comptes-client/plan-sous-comptes.md`](../b2b/comptes-client/plan-sous-comptes.md)).

## Le besoin (Hugo, 2026-10-05)

Un chalet change de clients chaque semaine. À la fin de la semaine, il veut
**sélectionner les commandes de la semaine**, les **régler** — par carte, ou
en déclenchant un virement — et obtenir **la facture** correspondante, pour
la refacturer à ses hôtes.

Le cycle mensuel du prélèvement ne lui convient pas : il règle à la semaine,
et sur une sélection, pas sur tout un cycle.

## Ce qui existe déjà, et sur quoi s'appuyer (relu le 2026-10-05)

- **Le lien de paiement** (`PaymentLink`, `accounting.prisma`) : un montant
  en centimes, un libellé, une session Stripe hébergée, un état
  `open → paid | cancelled`. Aujourd'hui, il est créé **par le staff**, pour
  une société, pour un **montant libre** : il ne connaît pas les commandes
  qu'il règle.
- **Le relevé de cycle** (`plan-agregation-des-commandes.md`, A1-A2) sait
  lister les commandes au compte d'une société, une par une, avec leurs
  totaux figés et la TVA par taux.
- **Le lot de prélèvement figé** (S4-0,
  [`../comptabilite/prelevement/lot-de-prelevement-fige.md`](../comptabilite/prelevement/lot-de-prelevement-fige.md))
  prévoit l'état d'encaissement par commande, dont `settled_otherwise`. C'est
  lui qui garantit qu'une commande réglée ici **ne sera pas prélevée** en fin
  de mois.

## Ce qu'il faudrait

1. **Côté client, une sélection** : dans l'espace du site, les commandes
   encore dues (`due`), cochables, avec le total TTC et la TVA par taux de la
   sélection, sommés des parts figées (jamais recalculés).
2. **Régler par carte** : un lien de paiement **attaché aux commandes**
   (`payment_link_orders`), créé par le client, au montant exact de la
   sélection. Payé, il fait passer chaque commande à `settled_otherwise`
   avec la référence du lien.
3. **Régler par virement** : la sélection produit une **demande de
   règlement** avec une référence unique à reporter dans le libellé du
   virement, et les coordonnées du créancier. Les commandes passent en
   « virement attendu ». Elles ne sortent du prélèvement que quand le staff
   rapproche le virement reçu (ou quand un rapprochement bancaire automatique
   existera).
4. **La facture de la sélection** : une facture par règlement, au nom du
   payeur (le principal pour un site), avec le nom du site, les commandes
   sélectionnées et la mention « réglée » ou « à régler par virement ». Elle
   dépend du lot facture (nous produirons la facture, avant l'échéance de
   2027).

## Ce qui bloque, et dans quel ordre

| Dépend de                                        | Pourquoi                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| **S4-0**, l'état d'encaissement par commande     | sans lui, une commande réglée par carte serait aussi prélevée en fin de mois |
| **S4**, le payeur figé (`billed_company_id`)     | la facture d'un site est au nom du principal                                 |
| **Le lot facture** (numérotation, mentions, PDF) | « la production d'une facture »                                              |
| **S6**, ou un rôle du site                       | qui, dans le site, a le droit de régler                                      |

## Questions ouvertes

- **Qui règle ?** La gouvernante (`admin` du site), le rôle `billing`, ou le
  principal seulement ?
- **Une sélection peut-elle mêler plusieurs sites** quand c'est le principal
  qui règle ?
- **Un virement partiel**, ou un montant qui ne correspond pas : refusé, ou
  rapproché à la main ?
- **La facture par sélection** remplace-t-elle la facture mensuelle pour ces
  commandes, ou s'y ajoute-t-elle comme une facture d'acompte ? C'est une
  question pour le cabinet.
