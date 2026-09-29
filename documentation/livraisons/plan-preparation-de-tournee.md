# Plan — préparer la tournée

> **Ouvert le 2026-09-29** à la demande de Hugo : « je ne sais pas comment
> aborder cette partie pour la préparation de tournée, j'ai besoin d'un état des
> lieux et d'un plan explicite ». 📐 **Rien n'est bâti.** L'état des lieux a été
> relevé dans le code le 2026-09-29, pas dans les documents.

## 0. Ce que « préparer la tournée » veut dire ici

Le matin, avant que le véhicule parte, quatre gestes :

1. **Savoir ce qui part** : quelles commandes, à quelles adresses, pour quelle
   heure.
2. **Savoir comment livrer chaque adresse** : contact, consignes, procédure,
   signature.
3. **Mettre les arrêts dans un ordre.**
4. **Charger sans rien oublier.**

Tout le reste (plusieurs véhicules, algorithme, carte routière) vient après, et
seulement si le volume l'exige. Tant qu'il n'y a qu'un véhicule, la journée est
la tournée ([conception v1](conception-retrait-en-livraison.md), §3).

## 1. État des lieux

### Ce qui existe, et qu'une tournée peut lire tel quel

| Donnée                                                                       | Où elle vit                                                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Le **mode** d'acheminement de chaque commande (`delivery` / `pickup`)        | `orders.fulfillment_method`                                                                    |
| Le **jour** de livraison                                                     | `orders.requested_delivery_date`, qui alimente déjà le plan de production                      |
| L'**adresse livrée**, figée à la commande                                    | `orders.delivery_address_snapshot`                                                             |
| La **zone** (tarifaire), déduite du code postal                              | `orders.delivery_zone_id` → `delivery_zones` (préfixes postaux + frais)                        |
| La **fenêtre**, le **contact** et la **signature** convenus, avec provenance | `orders.fulfillment` (`OrderFulfillment` : `window`, `contact`, `signatureRequired`)           |
| Les **consignes** de l'adresse : note, créneaux de réception, **point GPS**  | `delivery_specs` d'une adresse (`deliverySpecsSchema`, dont `gps: {lat, lng}`)                 |
| La **procédure de livraison** : étapes ordonnées avec photo                  | `delivery_procedures` / `delivery_procedure_steps`, écrites par le client ou le staff          |
| La **feuille d'atelier** par commande, avec son QR `/colisage/{référence}`   | `production_order` (qui recopie `fulfillment_method` et `destination`), `atelier-sheet-pdf.ts` |
| Le **colisage** : le bac est fait                                            | `production_order.packed_at`, et la commande passe `ready`                                     |
| La **file du jour**, livraisons comprises                                    | `handover-queue.reader.ts` rend toute la journée ; le front écarte les livraisons au comptoir  |
| La **Supervision** groupe déjà les livraisons par créneau                    | `supervision/handover-slots.ts` (`delivery: SlotGroup[]`, `deliveryExpected`)                  |
| La **place** dans le back-office                                             | la route `/livraison`, vide exprès (`livraison-page.ts`)                                       |

Les données pour **préparer** une tournée existent donc presque toutes. Ce qui
manque, c'est l'écran qui les rassemble et les gestes qui s'appuient dessus.

### Ce qui est partiel

- **La fenêtre de livraison n'est pas contrôlée.** Au retrait, la tranche
  demandée doit tenir dans une fenêtre du point (`windowFitsPickup`). En
  livraison, **aucun contrôle équivalent** : rien ne la confronte aux créneaux
  de réception de l'adresse. La conception v1 a tranché une tranche **d'une
  heure, obligatoire**. Ce n'est pas bâti.
- **Les créneaux `perDay`** d'une adresse ne sont lus nulle part : seul
  `everyday` est repris (conception v1, §7).
- **`signatureRequired`** est convenu et figé, mais **imprimé nulle part** : ni
  sur le bon, ni sur la feuille (conception v1, §6, vérifié le 2026-09-11).

### Ce qui n'existe pas

- **Aucun ordre d'arrêts**, ni stocké ni calculé.
- **Aucun « chargé »** : le fait « le sac est dans le véhicule » ne vit nulle
  part.
- **Aucun échec de livraison** : ni motif, ni chemin de retour (une commande
  ratée ne reparaît dans aucune file du lendemain).
- **Aucun véhicule, aucun livreur** : ni modèle, ni rôle staff (les cinq rôles
  sont `admin`, `commercial`, `comptabilite`, `support`, `dev`).
- **Aucun géocodage** : le point GPS n'existe que si quelqu'un l'a saisi sur
  l'adresse.
- **La retardataire** (commande passée après la clôture) n'a **pas de feuille
  d'atelier**, donc pas de QR : c'est le sac qu'on oublie le plus, et le seul
  qu'un scan ne peut pas voir.

## 2. Les décisions à prendre, et dans quel ordre

Chacune porte ma recommandation. Aucune n'est prise.

| #   | Question                                                             | Ce qu'elle bloque | Recommandation                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Combien de livraisons par jour, combien de véhicules ?**           | tout le reste     | Le dire en chiffres. Sous ~30 arrêts et un véhicule, les lots 1 à 3 suffisent ; l'algorithme de l'[architecture](architecture-road-livraison-tournees.md) attend.                                                         |
| D2  | **Qui prépare, qui conduit ?** Le livreur a-t-il un compte ?         | lots 2 et 5       | Pour préparer et charger : un compte staff existant suffit. Pour la vue livreur : un **rôle `livreur`** qui ne voit ni prix ni carnet clients. C'est une frontière de sécurité, à passer par `vitruve` avant de la bâtir. |
| D3  | **La tranche d'une heure, obligatoire en livraison ?**               | lot 4             | Oui, comme tranché le 2026-09-11 : sans elle, la colonne « en retard » reste vide pour toute la livraison. Elle doit tenir dans les créneaux de réception de l'adresse.                                                   |
| D4  | **Comment le code de retrait atteint la personne qui réceptionne ?** | lot 5             | Hors préparation : c'est le geste à la porte. Trois sorties dans la conception v1 (§2). Ne pas imprimer le jeton sur le colis.                                                                                            |
| D5  | **Que devient une livraison ratée ?**                                | lot 5             | Hors préparation. Décision métier (conception v1, question 4).                                                                                                                                                            |
| D6  | **Où vit le code ?**                                                 | lot 3             | Les lots 1 et 2 **lisent** et n'ont besoin d'aucun bloc neuf : ils étendent le lecteur de file de `handover`. Le bloc logistique (`delivery/`) ne naît qu'au lot 3, quand il faut **stocker** un ordre.                   |

**La préparation (lots 1 à 3) ne dépend que de D1, D2 et D6.** D4 et D5
concernent la porte, pas le dépôt : on peut préparer des tournées avant de les
avoir tranchées.

## 3. Le plan, lot par lot

Chaque lot est utilisable seul, le matin même où il est livré.

### Lot 1 — La feuille de route du jour (lecture seule)

**Ce que l'équipe obtient** : sur `/livraison`, pour un jour donné, la liste des
livraisons, triées par fenêtre, avec pour chacune :

- référence, enseigne, adresse livrée ;
- fenêtre, contact (nom et téléphone), signature exigée ou non ;
- note de l'adresse et procédure de livraison (étapes et photos) ;
- état du bac : colisé ou pas encore, et **retardataire sans feuille** signalé
  à part ;
- un lien vers le point GPS quand il existe (ouvre l'appli de navigation du
  téléphone).

Imprimable, lisible sur téléphone. **Aucun montant.**

**Comment** :

- côté serveur, **étendre** le port de lecture de la file du jour de `handover`
  (conception v1, §8 : pas de lecteur jumeau) avec ce qui manque pour une
  livraison : adresse, contact, consignes, procédure ;
- la procédure vit dans `b2b/account` : le commerce l'expose par le même canal
  (`handover/channels/commerce/`), `handover` ne lit pas le compte ;
- côté front, remplir `livraison-page.ts`.

**Pas de schéma, pas de migration, pas de bloc neuf.** Fini quand : une
commande livrée demain apparaît avec sa procédure, et une commande au comptoir
n'apparaît pas.

### Lot 2 — Le chargement : « ai-je tout ? »

**Ce que l'équipe obtient** : au dépôt, on scanne les feuilles d'atelier une à
une ; l'écran barre chaque commande scannée et dit **ce qui manque**.

**Comment** (conception v1, §4) :

- un second lecteur de QR, `referenceOf`, pour `/colisage/{référence}`. Ne pas
  assouplir `tokenOf`, dont le refus est voulu ;
- la retardataire, sans feuille, se coche à la main, en cas nommé ;
- saisie manuelle de la référence en repli : `BarcodeDetector` n'existe pas
  partout (à vérifier sur l'iPhone du livreur, conception v1, §13).

**Question ouverte à ce lot** : « chargé » est-il **stocké** ? Sans stockage,
l'écran sert le matin et s'oublie ; avec, il faut une table, donc le bloc du
lot 3 avancé d'un cran. Ma recommandation : **ne pas stocker** au premier
passage, voir si l'équipe s'en sert.

### Lot 3 — L'ordre des arrêts

**Ce que l'équipe obtient** : sur la feuille de route, on **glisse** les arrêts
dans l'ordre de passage ; l'ordre est gardé et imprimé ; les fenêtres qui ne
peuvent pas tenir dans cet ordre sont signalées (deux 8 h – 9 h à vingt
kilomètres l'un de l'autre).

**Comment** :

- c'est le **premier agrégat** : la tournée du jour (un véhicule), avec ses
  arrêts ordonnés et l'invariant « positions contiguës et uniques » (I2 de
  l'[architecture](architecture-road-livraison-tournees.md)) ;
- d'où le bloc logistique : déclaré dans `lint:context-boundaries`, avec son
  schéma Postgres choisi explicitement, et la flèche `b2b → delivery` par un
  canal. C'est là que D6 se tranche pour de bon ;
- **un humain range**. Un tri par proximité peut proposer un ordre de départ,
  jamais l'imposer (conception v1, §3).

### Lot 4 — La tranche d'une heure en livraison (côté commande)

Indépendant des trois premiers, et côté **commerce** : rendre la tranche
obligatoire en livraison, la découper par heure comme `pickupSlots`, et la
contrôler contre les créneaux de réception de l'adresse (y compris `perDay`).
Sans ce lot, la feuille de route du lot 1 affiche les fenêtres **par défaut**
du carnet, pas des heures promises.

⚠️ Il change ce que le client choisit à la commande : un contrat servi à la
boutique en ligne, qui se fait en ajout (`CLAUDE.md` §0).

### Plus tard, et seulement sur décision

- **Lot 5 — La porte** : vue livreur, retrait attesté par `handover`, échec
  consigné. Suppose D2, D4, D5.
- **Lot 6 — Plusieurs véhicules** : `Vehicle`, `Driver`, et l'algorithme qui
  **propose** une répartition. Suppose D1 = plus d'un véhicule.

## 4. Par où commencer

**Le lot 1.** Il ne demande aucune décision coûteuse, ne touche ni l'argent ni
le schéma, et donne dès le premier matin une feuille de route que personne n'a
aujourd'hui. Il dira aussi, par l'usage, si l'ordre (lot 3) et le chargement
(lot 2) sont les vrais manques, ou s'il y en a un autre.

## 5. Ce que ce plan n'a pas vérifié

- **Le volume réel** (D1) : rien dans le code ne le dit.
- **Si le lecteur de file de `handover` peut être étendu sans alourdir le
  comptoir**, qui le lit aussi : à mesurer à la conception du lot 1.
- **La taille des photos de procédure** servies sur téléphone en extérieur.
- **Le contenu exact de `production_order.destination`** : lu comme « de quoi
  charger le bon véhicule » dans la conception v1, pas rouvert ici.
- **La boutique en ligne** : ce qu'elle affiche aujourd'hui au client pour
  choisir une heure de livraison (le texte parle de « créneau que vous
  choisissez ») n'a pas été confronté au serveur, qui ne contrôle pas cette
  fenêtre.
