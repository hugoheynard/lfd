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

✅ **Trois véhicules, et on doit pouvoir en ajouter** (Hugo, 2026-09-29). Le
geste 3 devient donc « **répartir** les commandes entre les véhicules, puis
ordonner chaque tournée », et le geste 4 se fait **par véhicule**. La réserve de
la [conception v1](conception-retrait-en-livraison.md) (§3 : « la tournée devient
nécessaire au deuxième véhicule ») est levée : la tournée est à bâtir.

Ce qui vient toujours après : l'algorithme qui **propose** une répartition, et
la carte routière.

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

| #   | Question                                                             | Ce qu'elle bloque | Recommandation                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Combien de véhicules ?**                                           | tout le reste     | ✅ **Tranché le 2026-09-29 : trois, et on doit pouvoir en ajouter.** Le véhicule est donc une **donnée** (une liste qu'on gère), jamais une constante ; on en ajoute ou on en retire sans déploiement. Reste inconnu : le nombre de livraisons par jour. |
| D2  | **Qui prépare, qui conduit ?** Le livreur a-t-il un compte ?         | lots 4 et 6       | Pour préparer et charger : un compte staff existant suffit. Pour la vue livreur : un **rôle `livreur`** qui ne voit ni prix ni carnet clients. C'est une frontière de sécurité, à passer par `vitruve` avant de la bâtir.                                |
| D3  | **La tranche d'une heure, obligatoire en livraison ?**               | lot 5             | Oui, comme tranché le 2026-09-11 : sans elle, la colonne « en retard » reste vide pour toute la livraison. Elle doit tenir dans les créneaux de réception de l'adresse.                                                                                  |
| D4  | **Comment le code de retrait atteint la personne qui réceptionne ?** | lot 6             | Hors préparation : c'est le geste à la porte. Trois sorties dans la conception v1 (§2). Ne pas imprimer le jeton sur le colis.                                                                                                                           |
| D5  | **Que devient une livraison ratée ?**                                | lot 6             | Hors préparation. Décision métier (conception v1, question 4).                                                                                                                                                                                           |
| D6  | **Où vit le code ?**                                                 | lot 2             | Le lot 1 **lit** et n'a besoin d'aucun bloc neuf : il étend le lecteur de file de `handover`. Le bloc logistique (`delivery/`) naît au lot 2, avec le premier véhicule stocké.                                                                           |

**La préparation (lots 1 à 4) ne dépend que de D1, D2 et D6.** D4 et D5
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

### Lot 2 — Les véhicules, en données

**Ce que l'équipe obtient** : dans les réglages, la liste des véhicules — un
nom lisible (« Kangoo blanc »), une plaque, actif ou retiré. On en ajoute un
sans rien demander à personne.

**Comment** :

- c'est le premier modèle du **bloc logistique** : déclaré dans
  `lint:context-boundaries`, schéma Postgres choisi explicitement. D6 se
  tranche ici ;
- **pas de suppression** : un véhicule vendu est **retiré**, parce que les
  tournées passées le citent (`CLAUDE.md` §3 : pas de DELETE physique) ;
- un CRUD honnête : aucune transition ne s'y refuse (`CLAUDE.md` §3.1, « où NE
  PAS mettre d'agrégat »).

**Question ouverte à ce lot** : un véhicule peut-il être **indisponible un
jour donné** (garage, panne) ? Si oui, la composition doit le savoir. Ma
recommandation : pas de calendrier au premier passage ; on compose avec les
véhicules actifs, et on laisse une tournée vide.

### Lot 3 — Composer : répartir, puis ordonner

**Ce que l'équipe obtient** : sur `/livraison`, pour le jour J, une colonne par
véhicule actif et une colonne « à répartir ». On **glisse** chaque commande dans
un véhicule, puis on range les arrêts dans l'ordre de passage. Chaque tournée
s'imprime seule. L'écran signale :

- les commandes **encore à répartir** — aucune ne doit partir oubliée ;
- les fenêtres qu'un ordre ne peut pas tenir (deux 8 h – 9 h à vingt
  kilomètres l'un de l'autre) ;
- le nombre d'arrêts par véhicule, pour voir un déséquilibre.

**Comment** :

- c'est le **premier agrégat** : la tournée (un véhicule, un jour), avec les
  invariants de l'[architecture](architecture-road-livraison-tournees.md) — I2
  positions contiguës, I3 une commande dans au plus une tournée, I7 déplacer
  entre deux tournées est tout-ou-rien ;
- la commande n'y est connue que par sa **référence** : la flèche est
  `b2b → delivery`, par un canal ;
- **un humain répartit**. Regrouper par zone ou par code postal peut
  **proposer** un point de départ ; jamais imposer (conception v1, §3).

### Lot 4 — Le chargement, véhicule par véhicule

**Ce que l'équipe obtient** : au dépôt, on choisit le véhicule, on scanne ses
feuilles d'atelier, et l'écran dit **ce qui manque à ce véhicule** — et crie si
un sac scanné appartient à **un autre** véhicule. Avec trois véhicules, c'est
l'erreur probable : le bon sac, dans la mauvaise camionnette.

**Comment** (conception v1, §4) :

- un second lecteur de QR, `referenceOf`, pour `/colisage/{référence}`. Ne pas
  assouplir `tokenOf`, dont le refus est voulu ;
- la retardataire, sans feuille, se coche à la main, en cas nommé ;
- saisie manuelle en repli : `BarcodeDetector` n'existe pas partout (à vérifier
  sur les téléphones des livreurs, conception v1, §13) ;
- la feuille d'atelier gagnerait à **imprimer le véhicule** — mais elle sort
  quand la production clôt la journée, souvent avant la composition. À
  trancher à ce lot : réimprimer, ou étiqueter à part.

« Chargé » se **stocke** sur l'arrêt de la tournée : la table existe depuis le
lot 3.

### Lot 5 — La tranche d'une heure en livraison (côté commande)

### Lot 4 — La tranche d'une heure en livraison (côté commande)

Indépendant des autres, et côté **commerce** : rendre la tranche
obligatoire en livraison, la découper par heure comme `pickupSlots`, et la
contrôler contre les créneaux de réception de l'adresse (y compris `perDay`).
Sans ce lot, la feuille de route du lot 1 affiche les fenêtres **par défaut**
du carnet, pas des heures promises.

⚠️ Il change ce que le client choisit à la commande : un contrat servi à la
boutique en ligne, qui se fait en ajout (`CLAUDE.md` §0).

### Plus tard, et seulement sur décision

- **Lot 6 — La porte** : vue livreur, retrait attesté par `handover`, échec
  consigné. Suppose D2, D4, D5. Avec trois véhicules, un livreur ne doit voir
  que **sa** tournée : le rôle `livreur` (D2) cesse d'être optionnel.
- **Lot 7 — La proposition automatique** : l'algorithme de l'architecture
  (k-medoids puis ordre ATSP) **propose** une répartition que l'humain corrige.
  Seulement si composer à la main prend trop de temps chaque matin.

## 4. Par où commencer

**Le lot 1**, puis **2 et 3 ensemble**. Le lot 1 ne demande aucune décision
coûteuse, ne touche ni l'argent ni le schéma, et donne dès le premier matin une
feuille de route que personne n'a aujourd'hui. Les lots 2 et 3 ouvrent le bloc
logistique : c'est là que se paie le coût d'entrée (porte, schéma, migration),
une fois.

## 5. Ce que ce plan n'a pas vérifié

- **Le nombre de livraisons par jour** : rien dans le code ne le dit. Il décide si le lot 7 sert un jour.
- **Si le lecteur de file de `handover` peut être étendu sans alourdir le
  comptoir**, qui le lit aussi : à mesurer à la conception du lot 1.
- **La taille des photos de procédure** servies sur téléphone en extérieur.
- **Le contenu exact de `production_order.destination`** : lu comme « de quoi
  charger le bon véhicule » dans la conception v1, pas rouvert ici.
- **La boutique en ligne** : ce qu'elle affiche aujourd'hui au client pour
  choisir une heure de livraison (le texte parle de « créneau que vous
  choisissez ») n'a pas été confronté au serveur, qui ne contrôle pas cette
  fenêtre.
