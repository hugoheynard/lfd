# TODO — trier le colisage par échéance de récupération

> 📌 **Ouvert le 2026-09-14, à la demande de Hugo. Pour plus tard** : rien n'est
> commencé, et rien ne l'est tant que les deux questions du bas ne sont pas
> tranchées.

## Ce qu'il faut

Au poste de colisage, les commandes doivent sortir **dans l'ordre où elles
seront récupérées** : ce qui part le plus tôt se colise d'abord. Pour une
livraison, l'échéance n'est pas l'heure d'arrivée chez le client mais **l'heure
de départ du véhicule** — il faut donc tenir compte du délai de livraison.

## Où on en est (vérifié le 2026-09-14)

- **Le tri actuel est la référence de commande** :
  `packingBoardOf` range les bacs par `reference`
  (`apps/lfd-api/src/production/domain/services/production-packing.ts`). C'est
  l'ordre du numéro lu sur le bon, pas celui du départ.
- **Une commande ne porte qu'un JOUR**, pas une heure :
  `requested_delivery_date` est un `date` Postgres
  (`apps/lfd-api/prisma/schema/public/orders.prisma`). Ni créneau, ni heure de
  retrait choisie par le client.
- **Un point de retrait porte ses horaires** : `PickupAddress.opening` — ouverture
  au public ET créneau réservé aux pros, deux fenêtres nommées
  (`apps/lfd-api/prisma/schema/public/settings.prisma`). C'est une fenêtre, pas
  une échéance par commande.
- **Une zone de livraison ne porte AUCUN délai** : `DeliveryZone` n'a que ses
  préfixes postaux et son frais (même fichier).
- **Le snapshot du fournil n'a rien de tout ça** : `ProducibleOrder`
  (`apps/lfd-api/src/production/channels/commerce/day-orders.reader.ts`) porte le
  mode et la destination résolue, pas d'heure.

## Les deux questions à trancher avant d'écrire une ligne

1. **D'où vient l'échéance d'une commande ?** Un créneau choisi par le client au
   checkout, l'ouverture pro du point de retrait, ou une tournée de livraison
   fixée par le fournil. Aucune de ces sources n'existe par commande aujourd'hui.
2. **Où vit le délai de livraison ?** Par zone (`DeliveryZone`), par tournée, ou
   par adresse. Ni l'un ni l'autre n'existe.

## Ce que la réponse imposera

- L'échéance sera une donnée du **commerce** : elle entre dans le snapshot que
  `DayOrdersReader` rend à la production — la production ne va pas la lire
  ailleurs (matrice du §3 de `CLAUDE.md`).
- Le **tri se fait au serveur**, comme tout le colisage depuis le 2026-09-14
  (« L'écran n'additionne rien », `documentation/production/plan-poste-de-colisage.md`).
- Une colonne ajoutée à `production_order` pour figer l'échéance serait une
  **migration** : additive, et relue par `lecteur-de-migrations`.
