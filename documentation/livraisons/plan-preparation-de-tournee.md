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
- **Aucun véhicule, aucun livreur** : ni modèle, ni rôle staff (les rôles
  sont `admin`, `commercial`, `comptabilite`, `communication`, `comptoir`, `support`, `dev` (sept, recompté le 2026-09-29)).
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

### Lot 1 — La feuille de route du jour (lecture seule) — ✅ bâti le 2026-09-29

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

> 🔴 **Découvert en ouvrant le lot (2026-09-29) : une commande ne sait pas à
> quelle adresse du carnet elle va.** Elle ne garde que la copie postale figée
> (`delivery_address_snapshot`). La colonne `orders.delivery_address_id` existe,
> mais rien ne l'écrit : la passation lit `deliveryAddressId` pour préremplir
> contact et fenêtre, puis l'oublie. Sans ce lien, la feuille de route ne peut
> pas atteindre la procédure, la note ni le point GPS de l'adresse. Le lot 1
> écrit donc ce lien à la passation, sans migration puisque la colonne existe.
> **Les commandes déjà passées restent sans lien** : l'écran le dit
> (« adresse non reliée au carnet ») plutôt que de deviner l'adresse en
> comparant des textes.
>
> Décidé au même moment : une route à part (`GET admin/livraison/feuille-de-route`),
> sous le droit `b2b_orders` qui garde déjà `/livraison`. Un port séparé du
> lecteur de file, pour que le comptoir ne paie pas adresses et procédures, mais
> qui **partage** le filtre « attendu ce jour » : pas de seconde vérité sur ce
> qui part. Les photos de procédure passent par la route existante, gardée par
> `b2b_companies` : qui n'a pas ce droit voit les étapes sans photo.

**Ce qui a été bâti** (2026-09-29) :

- **le lien d'adresse** est écrit à la passation, par l'agrégat, pour les trois
  portes (client, équipe, boutique) : `delivery-defaults.reader` rend
  l'adresse du carnet **confirmée sous le mur** de la société, `null` sinon.
  Une adresse d'une autre société ne fait pas refuser la commande : elle n'est
  simplement pas reliée, comme les consignes l'étaient déjà ;
- **un port séparé**, `DeliveryRunSheetReader` (`handover/channels/commerce/`),
  et non une extension du lecteur de file comme ce plan le disait d'abord. Il
  partage avec la file le **filtre** « attendu ce jour » (`expectedOnWhere`) et
  l'**état** (`queueStateOf`) : pas de seconde vérité sur ce qui part, et le
  comptoir ne paie pas adresses et procédures ;
- **consignes et procédure lues sous le mur** `(id, company_id)`, jamais par la
  relation `deliveryAddress`, qui ne porte pas de `where` ;
- **« sans feuille d'atelier »** vient de la production (`AtelierSheetsReader`,
  câblé comme `QualityHoldsReader`). Il n'est vrai **que si la journée de
  production est close** et que la commande n'est pas dans son plan : journée
  ouverte, toutes les livraisons du lendemain crieraient ;
- `GET admin/livraison/feuille-de-route?jour=`, sous `b2b_orders` ; la photo
  d'étape porte sa révision (`photoRevision`, la même que la vue de procédure
  staff), donc le cache sert d'une lecture à l'autre ;
- l'écran `/livraison` : choix du jour (Demain par défaut), en-tête chiffré,
  arrêts triés par fenêtre, bouton Imprimer.

**Pas de schéma, pas de migration, pas de bloc neuf.**

**Ce qui reste de ce lot** : à l'impression, le menu du back-office s'imprime
aussi (le shell fold n'a pas de règle d'impression, et aucune règle globale
n'existe) ; le jour choisi n'est pas dans l'URL ; le lien carte ouvre Google
Maps.

### Lot 2 — Les bases paramétrables de la livraison — ✅ bâti le 2026-09-29

> **Revu le 2026-09-29.** Hugo : « on doit poser les bases paramétrables avant
> d'organiser les tournées ». Ce lot pose **tout ce que la composition lira
> comme un réglage**, avant la première tournée ; le lot 3 ne contient aucune
> constante.
>
> **Contredit par `vitruve` le même jour** : trois `BLOQUANT`, six `SÉRIEUX`.
> Tous sont intégrés ci-dessous. Quatre décisions en sortent, qui sont à Hugo
> (Q7 à Q10, fin de ce lot) — **rien ne se bâtit avant**.

#### Où ça se range

**Pas dans l'espace e-commerce.** Sa section Réglages → Livraison
(`/b2b/reglages/livraison`) porte **l'offre** faite au client : à qui on livre,
les zones, leurs frais. La flotte porte **l'exploitation** : avec quoi on tient
cette offre.

**Un espace « Livraison » dans le rail**, qui n'existe pas : le rail compte huit
espaces (`WORKSPACES`, `workspace-rail/workspaces.ts`) et `/livraison` n'est
dans aucun. C'est une entrée de rail à créer (`WorkspaceKey`, vues, specs), pas
une page de plus.

| Entrée           | Adresse                 | Lot  |
| ---------------- | ----------------------- | ---- |
| Feuille de route | `/livraison`            | 1 ✅ |
| Véhicules        | `/livraison/vehicules`  | 2    |
| Tournées         | `/livraison/tournees`   | 3    |
| Chargement       | `/livraison/chargement` | 4    |

`/livraison` est aujourd'hui une route **feuille**, gardée par
`b2b_orders:read` (`app.routes.ts`). Elle devient un parent à enfants, et le
droit qui la garde est la question Q7.

#### Le droit — un seul pour tout le module

Un droit nommé d'après la **flotte** mentirait dès le lot 3 (composer n'est pas
de la flotte) et obligerait à en ajouter un par lot : trois droits pour un même
espace. Et une valeur d'enum `StaffResource` **ne se retire pas**. Le nom doit
donc porter le module entier : **`delivery_rounds`** (« Tournées de
livraison »), préfixé par le bloc comme `pim_`, `media_`, `staff_`.

- **lecture** : voir la feuille de route, les véhicules, les tournées ;
- **écriture** : paramétrer la flotte, composer, charger.

Ce que ça coûte, d'après le précédent `b2b_late_fee` (377008f85) :

- la valeur ajoutée **seule** dans sa migration (irréversible) ;
- une migration de données qui **complète** `staff_role_definitions.grants`
  sans écraser une définition éditée à l'écran ;
- `ROLE_GRANTS` tenu au même état (`staff-role-grants-parity.e2e-spec.ts`),
  libellé, `grant-chips.spec.ts`, `app.routes.spec.ts`, `staff-roles.e2e-spec.ts` ;
- `pnpm test` à la racine, puisque `packages/contracts` bouge.

⚠️ **La feuille de route change de mur.** Elle est servie sous `b2b_orders`
(front **et** `delivery-run-sheet.controller.ts`). Aujourd'hui, `comptoir` et
`support` lisent donc les adresses et contacts de **toutes** les livraisons.
Passer le module sous `delivery_rounds` retire cet accès à qui ne le reçoit
pas : c'est voulu, mais c'est un changement pour ces rôles (Q8).

#### Ouvrir le bloc `delivery/`

Le coût d'entrée, compté porte par porte :

- `context-boundaries.mjs` : `BLOCK_OF`, **et** une entrée `ALLOWED.delivery`
  (`staff`, `platform`), **et** `delivery` ajouté à `ALLOWED.root`, sans quoi
  `appBootstrap` ne peut pas câbler le module ;
- 🔴 `prisma-model-ownership.mjs` tient **sa propre liste en dur** (`BLOCKS`) :
  un `src/delivery/` qui n'y figure pas est **ignoré**, ni écrivain ni lecteur.
  C'est le piège déjà raconté pour `media`. L'y inscrire dans le même commit ;
- `journal-tracked.mjs` ne couvre que `src/pim/**`, la médiathèque et
  `src/b2b/account/**` : y ajouter `src/delivery/**` (voir « journal ») ;
- le **schéma Postgres** : ajouté à `datasource.prisma`, `CREATE SCHEMA` dans
  la migration, fichier selon `prisma-schema-layout.mjs` (Q10) ;
- la matrice de `CLAUDE.md` §3 : une colonne et une ligne `delivery`.

Aucun canal vers le commerce n'est ouvert à ce lot, **sauf** si Q9 relie le
départ à un point de retrait.

#### 2a — Les véhicules

- un **nom** (« Kangoo blanc ») et une **plaque** ;
- **`retired_at` daté**, pas un booléen : le lot 3 devra lire « actif **ce
  jour-là** », et un drapeau sans date retirerait le véhicule des tournées déjà
  composées pour la semaine ;
- **le nom est recopié dans la tournée** quand elle est composée (lot 3) :
  renommer un véhicule ne réécrit pas l'historique ;
- **pas de suppression** (`CLAUDE.md` §3) ;
- ⚠️ pas de nombre de véhicules stocké : le nombre **est** la liste des actifs.

**La plaque est une règle qui refuse**, donc ce n'est pas un CRUD sans
invariant :

- un value object `LicensePlate` **normalise** (`AB-123-CD`, `ab 123 cd` et
  `AB123CD` sont la même plaque) et refuse une forme invalide ;
- l'unicité tient **en base**, par un index unique partiel sur la forme
  normalisée des véhicules non retirés — écrit à la main dans le SQL, Prisma
  ne le connaît pas (précédent : `20260927100000_le_bon_sur_la_commande`) ;
- plaque **obligatoire** : `NULL` échapperait à l'unicité ;
- réactiver un véhicule retiré peut buter sur l'index : le conflit se traduit
  en un refus qui nomme le véhicule actif qui porte déjà cette plaque
  (`CLAUDE.md` §0), jamais en 500.

#### 2b — Le point de départ

🔴 **Corrigé** : ce plan affirmait qu'aucun modèle ne dit d'où l'on part. Or
`PickupAddress` est défini comme « un point de retrait (**laboratoire**) »
(`settings.prisma`), avec son adresse complète ; `LegalEntity` en porte une
aussi. Recopier l'adresse du labo dans `delivery` ferait deux vérités, qui
divergeraient au premier déménagement. Aucune des deux n'a de point GPS.
C'est Q9.

#### 2c — Les livreurs

Hors de ce lot. La composition affecte un véhicule sans nommer de conducteur ;
le lien personne → tournée arrive avec la vue livreur (lot 6), le jour où il
sert à murer ce qu'elle voit. Il dépend de D2 (rôle `livreur`).

#### Le journal

Ajouter, retirer, réactiver un véhicule et changer sa plaque sont des **faits**,
avec leur acteur (`publishTraced`, comme `DeliveryAvailability`), leur phrase
française, et la porte `journal-tracked` étendue au bloc. Un véhicule retiré
sans trace de qui l'a retiré est une question à laquelle personne ne pourra
répondre le jour d'une tournée manquée.

#### Ce que le lot ne paramètre PAS encore

- la **disponibilité par jour** (garage, panne) : on compose avec les actifs ;
- la **capacité** : aucune donnée de poids n'existe sur une commande ;
- l'**heure de départ** : elle dépend des fenêtres promises (lot 5).

#### Les décisions de Hugo — ✅ tranchées le 2026-09-29

**Q7 / Q8 — un droit par geste, créé quand son écran existe.** Une valeur de
`StaffResource` ne se retire pas : un droit créé pour un lot jamais bâti
resterait pour toujours. Le lot 2 en crée **deux** ; les autres naissent avec
leur lot.

| Droit                | Ce qu'il ouvre                     | Lot | Lecture                                  | Écriture          |
| -------------------- | ---------------------------------- | --- | ---------------------------------------- | ----------------- |
| `delivery_run_sheet` | la feuille de route du jour        | 2   | admin, comptoir, **support, commercial** | admin             |
| `delivery_settings`  | véhicules, point de départ         | 2   | admin, comptoir                          | admin             |
| `delivery_rounds`    | composer les tournées              | 3   | admin, comptoir                          | admin             |
| `delivery_loading`   | le chargement au dépôt             | 4   | admin, comptoir                          | admin, comptoir   |
| `delivery_doorstep`  | les gestes à la porte (voir lot 6) | 6   | —                                        | le rôle `livreur` |

`support` et `commercial` gardent la lecture de la feuille de route qu'ils
avaient par `b2b_orders` (Hugo). La feuille de route n'écrit rien :
l'écriture de `delivery_run_sheet` n'ouvre aucun geste aujourd'hui, elle
n'est donnée qu'à `admin` par cohérence.

**Q9 — le départ est un réglage que Hugo choisit** : « du labo, mais il faut
que je puisse le définir ». Un réglage unique « point de départ des
tournées » **référence** un point de retrait (`PickupAddress`), le point par
défaut tant que personne n'a choisi ; l'adresse n'est jamais recopiée. Les
points de retrait gagnent un **point GPS** facultatif, éditable sur leur
écran. Le bloc `delivery` lit les points de retrait par un canal que le
commerce implémente (`delivery/channels/commerce/`) : l'arête `b2b → delivery`
s'ouvre dès ce lot.

**Q10 — pas de schéma Postgres neuf : les tables vont dans `production`.**
C'est le précédent de `order_handover` : code dans son bloc
(`src/handover/`), table dans le schéma `production`. Rien ne se désarme :
`lint:prisma-model-ownership` établit le propriétaire par le bloc qui
**écrit**, pas par le schéma. On perd seulement la vue de
`lint:cross-schema-join` sur une jointure SQL écrite à la main entre une
tournée et une table du fournil — la limite qu'a déjà le retrait.

### Lot 3 — Composer : répartir, puis ordonner

**Ce que l'équipe obtient** : sur `/livraison/tournees`, pour le jour J, une colonne par
véhicule actif et une colonne « à répartir ». On **affecte** chaque commande à
un véhicule, puis on range les arrêts dans l'ordre de passage. Chaque tournée
s'imprime seule. L'écran signale :

- les commandes **encore à répartir** — aucune ne doit partir oubliée ;
- les fenêtres qu'un ordre ne peut pas tenir (deux 8 h – 9 h à vingt
  kilomètres l'un de l'autre) ;
- le nombre d'arrêts par véhicule, pour voir un déséquilibre.

> ⚠️ **Appris au lot 2 (2026-09-29)** : toute table du schéma `production` a un
> déclencheur de journal de journée (`day_change`, D7 de
> `documentation/caching-usage/plan-version-par-journee.md`), ou une raison
> écrite de ne pas en avoir (`test/day-change-triggers.e2e-spec.ts`). Véhicules
> et départ y sont inscrits comme réglages sans journée. **La tournée, elle, porte
> une journée : elle aura son déclencheur**, faute de quoi la version par
> journée servira une composition périmée.

#### Conception v2 (2026-09-29, après `vitruve`)

> La v1 a été contredite le même jour : **deux `BLOQUANT`**, sept `SÉRIEUX`.
> La v1 prenait la **journée** pour racine et relisait les commandes par la
> feuille de route. Les deux tombent :
>
> - la feuille de route vit dans `handover/`, et `delivery` n'a le droit de
>   lire que `staff` et `platform` (`context-boundaries.mjs`) : le chemin
>   suggéré était interdit ;
> - une racine « journée » à version unique met en conflit des écritures sans
>   rapport : chaque scan au dépôt (lot 4) et chaque geste à la porte (lot 6)
>   aurait incrémenté la version du jour, et trois camionnettes chargées en
>   parallèle se seraient refusées mutuellement. Le problème n'était pas la
>   taille de l'agrégat, c'était la **contention**.

**C1 — La racine est la TOURNÉE.** `DeliveryRound` : un jour de service, un
véhicule, un **numéro de passage** (1, 2… : un véhicule peut faire deux
tournées dans la journée, et l'interdire plus tard coûterait une migration de
données), le nom du véhicule recopié, la liste ordonnée des arrêts, une
**version** propre. Composer une tournée ne verrouille pas les deux autres.

**C2 — Ce qu'on fait d'un arrêt, hors de la tournée.** « Chargé » (lot 4) et
« livré / raté » (lot 6) ne s'écrivent **pas** dans la tournée : ils vivent
sur l'**arrêt**, avec sa propre version. La tournée dit **qui passe où et
dans quel ordre** ; l'arrêt dit **ce qui lui est arrivé**. Un scan au dépôt
n'invalide jamais la composition, et inversement. C'est aussi ce qui rendra I6
(« une tournée partie est gelée ») tenable **par tournée**.

**C3 — Les invariants, et où ils tiennent :**

- **I2** positions contiguës et uniques : dans l'agrégat ;
- **I3** une commande est dans **au plus une tournée vivante**, tous jours
  confondus (`architecture-road-livraison-tournees.md` §6 dit « au plus un Tour
  actif », pas « du jour » — la v1 l'avait réduit sans le dire). Tenu **en
  base** par un index unique partiel sur `order_id` des arrêts non retirés. Une
  commande dont la date a changé reste donc dans sa tournée d'origine, signalée,
  et **ne peut pas** être répartie ailleurs tant qu'on ne l'y a pas retirée :
  jamais chargée deux fois ;
- **I7** déplacer vers un autre véhicule : la seule écriture qui touche deux
  tournées. Un service de domaine charge les deux, applique le retrait et
  l'ajout, et les enregistre dans **une** transaction avec leurs deux versions.
  C'est l'exception écrite, pas la règle.

**C4 — Par où `delivery` lit les commandes.** Un **canal** que le bloc déclare
et que le commerce implémente, dans `delivery/channels/commerce/` (qui porte
déjà les points de départ) : `DeliveryOrdersReader`, qui rend pour un jour les
livraisons attendues — **identifiant, statut, jour demandé**, rien d'autre — et
pour une liste d'identifiants, leur jour et leur statut. L'adaptateur, dans
`b2b/orders/infrastructure/`, **réutilise `expectedOnWhere`** : c'est le même
filtre que la file du comptoir et la feuille de route, écrit une fois. Deux
lecteurs, une vérité.

Ce que le serveur calcule avec ce canal : la colonne « à répartir » (du jour,
dans aucune tournée), et les signaux « annulée » et « n'est plus de ce jour »
sur les arrêts. Ce que l'écran **ne** calcule pas.

**Le détail d'un arrêt** (adresse, fenêtre, contact, procédure, état du bac)
reste celui de la feuille de route : l'écran lit les deux routes et les joint
par `orderId`. Il ne décide rien avec : il affiche.

**C5 — « Actif ce jour-là ».** Un véhicule peut recevoir une tournée du jour J
si `retired_at` est nul ou **postérieur à la fin de J** (minuit, heure de
Paris). La règle vit dans le domaine, le jour en paramètre, sans horloge. Et
l'on **ne peut pas retirer** un véhicule qui a une tournée vivante à venir :
le refus nomme les jours, et dit de réaffecter d'abord. Interdire plutôt que
signaler.

**C6 — Le jour et ses déclencheurs.** Tournées **et** arrêts portent
`service_day` (dénormalisé sur l'arrêt) : chacune prend les trois déclencheurs
`record_day_change_by_service_day`, telle quelle. Une variante par jointure
perdrait le jour sur une suppression en cascade (avertissement écrit dans la
migration `20260928140000_la_version_par_journee`). ⚠️ Ces déclencheurs
avancent la version de journée **du fournil** (`production.day_change`) :
l'écran de composition la suit ; la feuille de route, qui lit des commandes,
suit `public.day_change`.

**C7 — Le droit `delivery_rounds`**, semé dans sa migration **avec des
attributions tranchées avant** (Q12). Le journal : un fait par geste, avec son
acteur et sa charge — `delivery_round.stop_assigned`, `.stop_moved` (un seul
fait, pas un retrait suivi d'un ajout), `.stop_removed`, `.reordered` (l'ordre
**avant et après** ; un réordonnancement qui ne change rien n'écrit rien).

**C8 — Ce que le lot 3 NE fait PAS** : aucune proposition automatique ; aucune
distance ; aucun état « partie » (lot 4). Le seul signal de fenêtre est celui
qui se voit sans carte, et **avant le lot 5 il porte sur des fenêtres par
défaut du carnet** : l'écran dit « horaire par défaut » comme la feuille de
route.

**C9 — L'écran** `/livraison/tournees` : une colonne par tournée du jour et une
colonne « à répartir » ; sur une ligne, **choisir** la tournée dans une liste
(au téléphone comme au clavier — on ne glisse pas) ; monter / descendre, qui
envoient la permutation complète ; « nouvelle tournée » pour un véhicule
(second passage) ; nombre d'arrêts par tournée ; impression d'une tournée
seule, dans l'ordre, avec les consignes de la feuille de route.

#### Seconde passe de `vitruve` — ce qui est tranché (v3)

La v2 résout les deux `BLOQUANT` de la v1. La seconde passe en a trouvé deux
autres, un niveau plus bas ; les voici fermés, avec les `SÉRIEUX`.

**C10 — Deux tables, deux écrivains, aucune colonne partagée.** Sans cette
règle, enregistrer une tournée réordonnée (supprimer puis réinsérer, ou tout
réécrire) effacerait « chargé » : les deux versions se seraient marché dessus
comme en v1.

- `delivery_round_stop` : écrite **par la tournée seule** — `round_id`,
  `position`, `removed_at`, plus `order_id` et `service_day` à la création.
  Aucune suppression physique : retirer pose `removed_at`.
- l'état d'exécution (chargé au lot 4, livré ou raté au lot 6) vit dans une
  **autre table**, écrite par l'arrêt seul. Aucun adaptateur n'écrit une
  colonne de l'autre.

**C11 — Déplacer garde la même ligne.** I7 change le `round_id` et la position
de l'arrêt existant ; il ne crée pas d'arrêt neuf. Une seule ligne porte donc
la commande, et l'index unique n'est jamais violé en cours de transaction.
⚠️ Au lot 4, un arrêt **chargé** qui change de véhicule est dans la mauvaise
camionnette : le lot 4 devra le **refuser** (recommandé) ou remettre
« chargé » à zéro, par écrit.

**C12 — « Vivant » est défini maintenant, et la colonne réservée.** L'index
unique partiel porte sur `order_id` des arrêts `removed_at IS NULL AND
closed_at IS NULL`. `closed_at` existe dès ce lot, nul, et c'est le lot 6 qui
le pose quand un arrêt se termine (livré **ou raté**). Une livraison ratée
libère donc la commande pour un autre jour **sans reconstruire l'index en
production**. `closed_at` appartient à l'écrivain de l'exécution, pas à la
tournée (C10).

**C13 — La transaction de I7 appartient à l'infrastructure.** Un service de
domaine ne peut pas en ouvrir. Le port d'écriture expose `saveMove(from, to)` ;
l'adaptateur verrouille les deux tournées **dans l'ordre de leur identifiant**
(deux déplacements croisés ne s'interbloquent pas) et vérifie leurs deux
versions. Le service de domaine, lui, reste pur : il rend les deux tournées
modifiées.

**C14 — Retirer un véhicule, corrigé.** La v2 s'enfermait : un retrait le soir
de la dernière tournée était impossible. Désormais :

- un véhicule peut porter une tournée du jour J si `retired_at` est nul, ou si
  le **jour (Paris) de son retrait** est J ou après. Le retirer aujourd'hui
  laisse vivre la tournée d'aujourd'hui ;
- retirer est refusé s'il a une tournée vivante **après** aujourd'hui ; le
  refus nomme les jours ;
- ⚠️ c'est **vérifié dans le handler**, pas interdit en base : une affectation
  et un retrait strictement simultanés passeraient tous les deux. Le cas est
  **signalé** à la lecture (« tournée sur un véhicule retiré »), jamais
  silencieux. On l'écrit plutôt que de promettre une interdiction.

**C15 — Le filtre du canal, complet.** `expectedOnWhere` rend les annulées et
ne filtre pas le mode. Le canal `DeliveryOrdersReader` y ajoute
`fulfillmentMethod = delivery`, comme la feuille de route, et rend le
**statut** : « à répartir » exclut les annulées, les arrêts les signalent. Il
rend aussi la **référence** et le **jour** de chaque commande composée, pour
qu'un arrêt « qui n'est plus de ce jour », absent de la feuille du jour,
s'affiche encore avec son numéro. Vérifier que `lint:business-day` admet déjà
`handover-order.query.ts` avant d'en élargir l'usage.

**C16 — L'écran recharge ses deux lectures ensemble.** Composition et feuille
de route suivent deux versions différentes (`production` et `public`). L'écran
les relit **ensemble**, au même moment : pas de jointure entre deux instants.

**C17** — Contrainte unique `(service_day, vehicle_id, passage)`. Vérifier que
`journal-tracked` accepte **un** fait (`.stop_moved`) pour l'écriture de deux
tournées.

#### Les décisions de Hugo — ✅ tranchées le 2026-09-29

- **Q11 — à la main.** Une commande annulée, ou qui n'est plus de ce jour,
  reste signalée dans sa tournée jusqu'à ce qu'on l'en retire. Tant qu'elle
  n'est pas retirée, l'index (C12) l'empêche d'être répartie ailleurs.
- **Q12 — le comptoir compose aussi.** `delivery_rounds` : lecture et
  écriture pour `admin` et `comptoir`.
- **Q13 — oui.** Un véhicule peut faire plusieurs tournées dans la journée
  (numéro de passage, unique par `(service_day, vehicle_id, passage)`).

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

Indépendant des autres, et côté **commerce** : rendre la tranche
obligatoire en livraison, la découper par heure comme `pickupSlots`, et la
contrôler contre les créneaux de réception de l'adresse (y compris `perDay`).
Sans ce lot, la feuille de route du lot 1 affiche les fenêtres **par défaut**
du carnet, pas des heures promises.

⚠️ Il change ce que le client choisit à la commande : un contrat servi à la
boutique en ligne, qui se fait en ajout (`CLAUDE.md` §0).

### Plus tard, et seulement sur décision

- **Lot 6 — La porte** : la vue livreur, qui ne montre que **sa** tournée, et
  les gestes qu'on y écrit, sous un droit à eux, `delivery_doorstep` (Hugo,
  2026-09-29 : la feuille de route est en lecture seule, les gestes du
  livreur n'y passent pas) :
  - le **retrait attesté** — il existe dans `handover`, mais sous
    `b2b_orders:write`, qui ouvrirait au livreur la prise de commande et les
    prix négociés. Question : le comptoir garde-t-il `b2b_orders` pour le
    sien ?
  - la **signature** — l'exigence est figée sur la commande, rien ne la
    recueille, et sa valeur est juridique avant d'être technique (conception
    v1, question 5) ;
  - l'**échec et son motif** — suppose D5 ;
  - le **commentaire** sur un arrêt (« laissé à l'accueil ») — un fait neuf,
    sur l'arrêt de la tournée.

  Suppose D2 (rôle `livreur`), D4, D5.

- **Lot 7 — La proposition automatique** : l'algorithme de l'architecture
  (k-medoids puis ordre ATSP) **propose** une répartition que l'humain corrige.
  Seulement si composer à la main prend trop de temps chaque matin.

## 4. Par où commencer

**Le lot 1** (✅ bâti le 2026-09-29), puis **le lot 2 seul**, puis le lot 3.
Hugo (2026-09-29) : les bases paramétrables d'abord. Le lot 2 paie le coût
d'entrée du bloc logistique (porte, schéma, droit, migrations) sans encore
lire une seule commande ; le lot 3 compose ensuite sur des réglages qui
existent, au lieu de naître avec des constantes à remplacer.

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
