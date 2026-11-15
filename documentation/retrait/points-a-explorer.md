# Le retrait — les points à explorer

> Revue du modèle du 2026-11-15, à partir de [`le-retrait.md`](le-retrait.md)
> et de la contradiction du plan L7/L8 du reliquat. Ce ne sont pas des
> décisions : ce sont les questions à ouvrir, chacune avec ce qui est vérifié
> et ce qui ne l'est pas encore.

## 1. En simple

Le retrait tient bien ce qu'il promet aujourd'hui : **une remise par envoi,
jamais deux**, signée, datée, gardée même si la commande est annulée, et
annoncée au reste du système par un fait durable. Ce qui reste fragile est
ailleurs : le modèle sait qu'une commande peut partir en plusieurs envois,
mais une partie du code ne regarde que le premier ; la garde d'un sac se
reconstitue à partir de plusieurs tables ; une remise faite par erreur ne se
corrige pas à l'écran ; le comptoir ne connaît que « attendu » et « remis ».

## 2. Les points

### 2.1 Le modèle dit « envoi », une partie du code dit « commande »

- **Vérifié** : les tables ont la clé `(order_id, rank)` (`handover.prisma`).
- **Relevé par la contradiction du plan L7/L8** (non recompté depuis) : la
  constante `FIRST_SHIPMENT_RANK` revient une trentaine de fois dans le
  retrait, la livraison et le colisage — le comptoir ne remet que le rang 1
  (`attesting-counter-handover.desk.ts`, `previewing-counter-handover.reader.ts`),
  la lecture de la garde ne lit que les premiers envois
  (`prisma-order-custody.reader.ts`, `firstShipmentsOf`), d'où un contrôle
  qualité refusé sur un reste à J+1.
- **À explorer** : l'inventaire exact, et ce qu'il faut pour qu'un envoi de
  rang 2 se remette au comptoir et en tournée. C'est le mur du reliquat L7.

### 2.2 La garde est éclatée

- Qui détient le sac se déduit de `order_departure` (départ, retour),
  `order_handover` (remise) et du statut de la commande au commerce.
- Il n'y a pas d'état unique de la garde (au fournil, au comptoir, chez le
  livreur, remis, rapporté), ni d'agrégat qui refuse une transition
  impossible : les règles vivent dans des lectures.
- **À explorer** : un agrégat « garde d'un envoi » avec ses transitions, ou
  au moins une seule lecture qui fait foi, partagée par le comptoir, la
  livraison et le fournil.

### 2.3 Une remise faite par erreur ne se corrige pas

- L'attestation est définitive ; la doc ne décrit aucun geste de correction.
- **Non vérifié dans le code** : l'absence d'un tel geste.
- **À explorer** : « annuler une remise faite par erreur » — réservé à un
  droit, tracé (qui, quand, pourquoi), qui rouvre l'envoi et publie le fait
  inverse au commerce et au colisage. C'est l'erreur la plus probable au
  comptoir le jour de l'ouverture.

### 2.4 Le comptoir n'a pas d'états intermédiaires

- « Au frais », « client appelé », « passera à 9 h » n'existent pas.
- **À explorer** : des faits qui naissent au comptoir, dans une table du
  retrait, lus par la file.

### 2.5 Le QR désigne une commande, pas un envoi

- La route `/retrait/:token` encode un jeton de commande.
- **À explorer** : quel envoi le scan remet quand une commande en a deux, et
  si chaque envoi porte son propre jeton. Lié au § 2.1.

## 3. Ordre proposé

1. § 2.3 — vérifier, puis le geste de correction (petit, utile dès
   l'ouverture).
2. § 2.4 — les états du comptoir, quand l'équipe les demande.
3. § 2.1 et § 2.5 — avec la reprise du reliquat L7.
4. § 2.2 — quand un troisième poste aura besoin de savoir qui détient le sac.
