# Le parcours du livreur — de la pièce du coliseur au retour

> 🗒️ **Document de travail** (2026-10-01), pour réfléchir ensemble aux étapes
> qui composent le travail du livreur. Hugo : « en commençant par : il est dans
> la pièce du coliseur ».
>
> Chaque étape dit **ce qui existe déjà** dans l'application (✅), **ce qui est
> en cours** (🟡) et **ce qui n'existe pas** (❌), puis les **questions** à
> trancher. Rien ici n'est une décision tant qu'une question reste ouverte.

## Le parcours

```mermaid
flowchart TD
  A["1 · Dans la pièce du coliseur<br/>les bacs de sa tournée sont prêts, étiquetés"] --> B["2 · Prendre en charge<br/>je récupère MES bacs"]
  B --> C["3 · Charger le véhicule<br/>scan bac par bac, dans l'ordre du plan"]
  C --> D{"4 · Tout est chargé ?"}
  D -- "non : bac manquant,<br/>bac à refaire" --> C
  D -- oui --> E["5 · Commencer ma tournée<br/>(départ : la tournée se fige)"]
  E --> F["6 · Rouler vers l'arrêt suivant<br/>« Y aller » / « Toute la tournée »"]
  F --> G["7 · Je suis arrivé"]
  G --> H["8 · Sortir LES bacs de cet arrêt<br/>(et seulement eux)"]
  H --> I{"9 · À la porte"}
  I -- "quelqu'un réceptionne" --> J["Remis au client<br/>nom (+ signature si exigée)"]
  I -- "personne, dépôt autorisé<br/>et pas de signature" --> K["Déposé avec preuve<br/>photo"]
  I -- "personne, dépôt interdit<br/>ou refus, accès…" --> L["Problème à la remise<br/>l'arrêt reste ouvert"]
  I -- "commande déjà retirée<br/>ou annulée" --> M["Clore sans remise"]
  J --> N{"10 · Reste-t-il des arrêts ?"}
  K --> N
  L --> N
  M --> N
  N -- oui --> F
  N -- non --> O["11 · Rentrer"]
  F -. "à tout moment" .-> P["Problème technique<br/>ou routier — signalé"]
  P -.-> F
  O --> Q["12 · Au dépôt : décharger<br/>bacs vides, invendus, non remis"]
  Q --> R["13 · Clôturer ma tournée"]
```

## Les étapes

### 1 · Dans la pièce du coliseur

- ✅ Le coliseur a **déclaré les bacs** de chaque commande au poste de colisage
  (panneau « Bacs »), chacun avec son **étiquette QR** ; un demi-bac peut être
  partagé entre deux arrêts consécutifs.
- ✅ La tournée a été **composée** et un **livreur affecté** (Tournées).
- ❓ **Comment le livreur sait que c'est prêt ?** Il regarde « Ma tournée »
  (le nombre de bacs déclarés vs attendus), ou c'est le coliseur qui le lui dit ?
- ❓ **Où sont rangés les bacs d'une tournée** dans la pièce : par tournée, par
  arrêt, en vrac ? Ça change la façon de les retrouver.

### 2 · Prendre en charge

- ❌ Rien n'existe. Aujourd'hui, le livreur passe directement au chargement.
- ❓ **Faut-il un geste « je prends en charge »** (transfert de garde du
  coliseur au livreur) ? Utile si un bac disparaît entre la pièce et le
  véhicule : on saura qui l'avait.
- ❓ **Contrôle du froid** : le livreur vérifie-t-il que les bacs isothermes
  sont bien froids au moment de les prendre ?

### 3 · Charger le véhicule

- ✅ **Plan de chargement** de la tournée : l'ordre (le dernier arrêt au fond),
  les piles, le volume sec et froid.
- ✅ **Scan bac par bac** sur l'écran de chargement (droit `delivery_loading`).
- 🟡 Le livreur doit **charger sa tournée** lui-même (décidé), cloisonné à
  **sa** tournée — pas encore bâti : aujourd'hui l'écran de chargement voit
  toutes les tournées.
- 🟡 La **géométrie du plancher** (où poser chaque pile) : lot G5, pas bâti.
- ❓ Le scan se fait **depuis « Ma tournée »** (un bouton « Charger ») ou sur
  l'écran de chargement actuel ?

### 4 · Tout est chargé ?

- ✅ « Commencer ma tournée » **refuse** tant qu'un bac n'est pas chargé ou
  qu'un demi-bac partagé est « à refaire », et nomme les arrêts en cause.
- ❓ **Partir sans un arrêt** : si un bac manque, le livreur peut-il retirer
  l'arrêt lui-même, ou doit-il appeler ? (Aujourd'hui : seul qui compose retire
  un arrêt.)

### 5 · Commencer ma tournée

- ✅ Le départ fige la tournée, l'ordre et le point GPS de chaque arrêt.
- 🟡 Le **code de retrait envoyé au client au départ** (lot 6, L6-C12) : pas
  bâti.
- ❓ Le client reçoit-il **« votre livraison est en route »** à ce moment ?

### 6 · Rouler

- ✅ « Y aller » (Google Maps, Waze, Plans), « Toute la tournée » en tronçons de
  trois étapes.
- 🟡 Les arrêts livrés disparaissent des liens : dès que la remise clôt l'arrêt
  (lot B d'« À la porte »).

### 7 · Je suis arrivé

- 🟡 Lot A d'« À la porte » : l'heure d'arrivée ; la position suivra (YA4).

### 8 · Sortir les bacs de cet arrêt

- ❌ Rien n'existe. Le plan de chargement sait quels bacs sont à quel arrêt.
- ❓ **Scanner les bacs à la sortie du véhicule** pour être sûr de laisser les
  bons (et tous) ? C'est la preuve que l'arrêt a reçu ses bacs — et le
  demi-bac partagé ne sort qu'au premier des deux arrêts.
- ❓ Les **bacs restent-ils chez le client** (consigne, échange plein/vide) ou
  le livreur vide-t-il les bacs sur place et les reprend ?

### 9 · À la porte

- 🟡 Lot A : « Déclarer un problème », « Clore sans remise ».
- 🟡 Lot B : « Remis au client » (nom, signature si exigée), « Déposé avec
  preuve » (photo, seulement si autorisé et sans signature exigée).
- ❓ La **procédure** de l'adresse (étapes, photos) : affichée avant d'arriver
  (en roulant) ou à l'arrivée ?

### 10 · Reste-t-il des arrêts ?

- ✅ La page montre les arrêts restants dans l'ordre.
- ❓ **Changer l'ordre en route** (un client absent qu'on repasse voir plus
  tard) : permis au livreur, ou jamais ?

### 11 · Rentrer

- ✅ « Rentrer » mène au point de départ quand il ne reste rien.
- ❓ Un arrêt resté ouvert (problème) : le livreur **rapporte** la marchandise.
  Comment le dépôt le sait-il ?

### 12 · Au dépôt : décharger

- ❌ Rien n'existe : ni **retour des bacs vides**, ni **marchandise rapportée**
  (non remise), ni **invendus**.
- ❓ **Scanner les bacs au retour** (ceux qui reviennent vides, ceux qui
  reviennent pleins) ? C'est ce qui permettrait un jour le **parc de bacs**
  (combien on en a, où ils sont).

### 13 · Clôturer ma tournée

- ❌ Une tournée n'a **aucun état « rentrée »** : elle part, et c'est tout.
- ❓ Faut-il un geste « **Tournée terminée** » (heure de retour, kilométrage,
  remarques) ? Il fermerait la mesure du temps (départ → retour) et la liste
  des « Non remis » du jour.

## Ce qu'on mesure tout du long

| Instant                   | Étape | Existe         |
| ------------------------- | ----- | -------------- |
| prise en charge           | 2     | ❌             |
| départ                    | 5     | ✅             |
| arrivée sur chaque arrêt  | 7     | 🟡 lot A       |
| remise / dépôt / problème | 9     | 🟡 lots A et B |
| retour au dépôt           | 12-13 | ❌             |

Avec ces instants : temps de chargement, temps de trajet par arrêt, temps sur
place, temps de tournée complet — de quoi régler la durée de livraison du
calculateur sur la réalité.

## Tranché par Hugo le 2026-10-01

| Étape                             | Décision                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8 · Sortir les bacs**           | **Les bacs repartent avec le livreur** : la marchandise est laissée chez le client, le bac revient. **Pas de scan** à la sortie du véhicule.                                                    |
| **10 · Changer l'ordre en route** | **En attente.**                                                                                                                                                                                 |
| **12-13 · Retour et clôture**     | Un geste **« Tournée terminée »** : il **signifie le retour des bacs vides** (et ferme la mesure du temps de tournée). **Pas de scan** des bacs au retour — « un peu excessif pour le moment ». |
| **Bacs abîmés ou perdus**         | **Mis de côté** : on part du principe que **rien ne s'abîme et rien ne se perd**. Plus tard, le **logisticien** devra pouvoir dire « bac abîmé », etc. (la piste du parc de bacs).              |

Conséquence pour le modèle : un bac déclaré est un objet **de la commande le
temps d'une tournée** ; « Tournée terminée » le rend disponible, sans qu'on
suive son état. La tournée gagne un état **rentrée** (instant de retour,
auteur), que « Non remis » peut lire.

Questions encore ouvertes : la prise en charge (2), où le livreur scanne au
chargement (3), « votre livraison est en route » au départ (5), la procédure
affichée en roulant ou à l'arrivée (9), changer l'ordre (10).

**Suite, tranché par Hugo le 2026-10-01 :**

| Étape                      | Décision                                            | Ce que ça demande                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2 · Prise en charge**    | **Non** — le scan au chargement suffit              | rien                                                                                                                                                                                                                                                                       |
| **3 · Charger**            | **Oui, dans « Ma tournée »**                        | un bouton « Charger » qui ouvre le scan et le plan de chargement de **sa** tournée, murés comme le reste (droit du livreur) ; l'écran de chargement actuel reste celui de l'admin                                                                                          |
| **5 · Prévenir le client** | **Oui, « votre livraison est en route » au départ** | le départ publie un fait par le canal du commerce ; le **commerce** envoie le courriel (L6-C12 : un message au client vit au commerce). ⚠️ Le contact de livraison n'a pas d'e-mail (L6-C13) : le message part au **compte qui a commandé** tant que ce champ n'existe pas |
| **9 · La procédure**       | **En roulant**                                      | déjà le cas : la carte de chaque arrêt la porte, dépliable, dès la liste (lot MT4)                                                                                                                                                                                         |

### Les lots qui en sortent

| Lot                                     | Contenu                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **PL1 — Charger depuis « Ma tournée »** | scan et plan de chargement de **sa** tournée, sous le droit du livreur, avec le mur `driver_staff_id` |
| **PL2 — « Tournée terminée »**          | un état **rentrée** de la tournée (instant, auteur) ; « Non remis » le lit ; les bacs sont libérés    |
| **PL3 — « En route »**                  | le courriel au client au départ, envoyé par le commerce                                               |
