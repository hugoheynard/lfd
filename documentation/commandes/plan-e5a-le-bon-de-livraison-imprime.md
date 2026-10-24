# Plan E5a — le bon de livraison imprimé, une pièce par lecteur

> **Doc-first, 2026-10-24.** Premier temps du lot E5 de
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md)
> (§ 10 : chiffré ou non selon le lecteur ; § 12 : la confirmation de
> commande). E5b fera le renommage des libellés « bon de commande » →
> « confirmation de commande ». **Rien n'est bâti.**
>
> Pas de `vitruve` d'office (CLAUDE.md § 9 bis) : E5a **affiche** des
> montants que le BL porte déjà par recopie (E4a), il n'en calcule aucun ; ni
> migration, ni frontière de sécurité nouvelle, ni runbook. Les affirmations
> ci-dessous ont été rouvertes le 2026-10-24.

## 0. Ce qui existe (ouvert le 2026-10-24)

- **Le bon de commande** se projette côté serveur par trois fonctions
  nommées, `clientSheetOf`, `staffSheetOf`, `atelierSheetOf`
  (`apps/lfd-api/src/b2b/orders/domain/services/order-sheet.ts`, l. 239-322),
  sans aiguilleur ; le contrat est `packages/contracts/src/order-sheet.ts`
  (`ClientSheet`, `StaffSheet`, `AtelierSheet` sans aucun champ monétaire,
  `SheetVariant` pro/public). Le PDF est `order-sheet-pdf.ts` et ses voisins
  (`-header`, `-totals`, `-format`). Règle : l'audience décide ce qu'il y a
  dedans, le format comment c'est rendu
  ([`bon-et-pieces/architecture-bon-de-commande.md`](bon-et-pieces/architecture-bon-de-commande.md) § 1).
- **La planche des documents** : tout PDF produit a son exemple
  (`lint:pdf-specimens`, `dev-toolbox/gates/pdf-specimens.mjs`) — un handler
  `…/application/queries/*specimen*.handler.ts`, une route
  `admin/document-specimens/<clé>.pdf`, et la clé rangée dans
  `SPECIMEN_GROUPS` de la page. Les exemples du bon y sont
  (`admin-order-sheet-specimens.controller.ts`).
- **Le BL** porte ses lignes (SKU, nom, prix, taux, quantité, totaux HT/TTC,
  éligibilité) et, depuis E4a, les totaux de sa commande ; son état et ses
  dates (E2) ; son numéro `BL-1042-1` (E1).

## 1. Trois projections, sur le modèle du bon

Dans un fichier neuf du domaine des bons de livraison (`delivery-note-sheet`, à créer), trois
fonctions nommées, jamais un aiguilleur :

| Projection      | Lecteur                                             | Contenu                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carrierNoteOf` | colisage, livreur, personne qui réceptionne         | n° du BL et de la commande, client, adresse ou point de retrait, date, articles et quantités, et — dès qu'un BL partiel existera (E6) — « commandé / livré / reste ». **Aucun champ monétaire dans son type.** |
| `clientNoteOf`  | le client, son service facturation, la comptabilité | le même, plus prix unitaires, totaux, TVA, en variante pro (HT) ou public (TTC) comme le bon                                                                                                                   |
| `staffNoteOf`   | l'équipe                                            | le client, plus SKU et état du BL (prévu, préparé, remis, annulé)                                                                                                                                              |

Contrat dans un fichier neuf de `@lfd/contracts` (à créer) : une union
discriminée (`CarrierNote` sans `money`, comme `AtelierSheet`).

## 2. Le PDF

Un rendu `renderDeliveryNotePdf` par projection imprimable (transport et
client), sur le kit papier du bon (`order-sheet-pdf-*`, même en-tête, même
logo, même pied) : titre « BON DE LIVRAISON », numéro du BL, rappel de la
commande. Le BL de transport a une zone « Reçu par, le, signature ». Pied :
« Ce n'est pas une facture. »

## 3. Où on le trouve

- **Back-office, fiche d'une commande** : la liste de ses BL (numéro, état,
  date) et, pour chacun, « Imprimer (transport) » et « Télécharger (chiffré) »
  — sous le droit de lecture des commandes déjà accordé.
- **Espace client** : sur une commande remise, « Bon de livraison » (chiffré),
  sous le mur de la société.
- **La planche des documents** : deux exemples (transport, client pro), pour
  la porte.
- Le courriel de remise et la tournée ne changent pas dans E5a.

## 4. Tests

Domaine : chaque projection, et le type de `carrierNoteOf` qui n'a aucun
montant (un test de compilation, comme `AtelierSheet`). PDF : le rendu
contient le numéro du BL et, pour le transport, aucun symbole « € ». E2E :
téléchargement côté équipe et côté client ; refus d'un client sur le BL d'une
autre société (le mur) ; la planche sert les deux exemples.
