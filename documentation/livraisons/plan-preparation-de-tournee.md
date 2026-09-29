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

| Droit                | Ce qu'il ouvre                     | Lot | Lecture                                  | Écriture              |
| -------------------- | ---------------------------------- | --- | ---------------------------------------- | --------------------- |
| `delivery_run_sheet` | la feuille de route du jour        | 2   | admin, comptoir, **support, commercial** | admin                 |
| `delivery_settings`  | véhicules, point de départ         | 2   | admin, comptoir                          | admin                 |
| `delivery_rounds`    | composer les tournées              | 3   | admin, comptoir                          | admin, comptoir (Q12) |
| `delivery_loading`   | le chargement au dépôt             | 4   | admin, comptoir                          | admin, comptoir       |
| `delivery_doorstep`  | les gestes à la porte (voir lot 6) | 6   | —                                        | le rôle `livreur`     |

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

### Lot 3 — Composer : répartir, puis ordonner — ✅ bâti le 2026-09-29

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
production**. 🔴 **Corrigé le 2026-09-29** (contradiction du lot 4) : `closed_at`
appartient à la **tournée**, pas à l'exécution. Le confier à l'exécution
aurait mis deux écrivains sur une même ligne — un `save` de tournée l'aurait
écrasé, la panne même que C10 ferme. Au lot 6, l'exécution rapporte livré ou
raté, et c'est la tournée qui pose `closed_at` par `closeStop` ; un arrêt clos
ne se réordonne, ne se déplace ni ne se retire plus (I4).

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

#### Ce que la construction a tranché (2026-09-29)

Trois décisions prises en bâtissant, que le plan ne disait pas :

- **Une tournée « vivante »** (qui empêche de retirer son véhicule) a au moins
  un arrêt ni retiré ni clos. Une tournée ne se supprime pas : vidée, elle
  aurait retenu son véhicule pour toujours.
- **Affecter refuse une commande d'un autre jour** que celui de la tournée.
- ⚠️ **Clore un arrêt au milieu laisse un trou** dans les positions vivantes,
  que l'agrégat refuse comme corrompu (I2). Le `closeStop` du lot 6 devra
  **resserrer** les positions restantes.

### Lot 4 — Le chargement, véhicule par véhicule — ✅ bâti le 2026-09-29, sans les étiquettes physiques (Q22)

**Ce que l'équipe obtient** : au dépôt, on choisit le véhicule, on scanne ses
feuilles d'atelier, et l'écran dit **ce qui manque à ce véhicule** — et crie si
un sac scanné appartient à **un autre** véhicule. Avec trois véhicules, c'est
l'erreur probable : le bon sac, dans la mauvaise camionnette.

#### Conception (2026-09-29, avant `vitruve`)

**L4-C1 — L'exécution d'un arrêt, dans sa table.** C'est la table que le lot 3
a annoncée sans la créer (C10) : `delivery_stop_execution`, une ligne par
arrêt, écrite **par l'exécution seule**. Au lot 4 : `loaded_at`, `loaded_by`,
`loaded_via` (`scan` ou `manual`). Au lot 6, s'y ajouteront le livré ou le
raté, et c'est elle qui posera `closed_at` sur l'arrêt (C12). Elle porte
`service_day` et les trois déclencheurs `day_change` (D7).

**L4-C2 — Le geste : choisir le véhicule, puis scanner.** L'écran
`/livraison/chargement` montre les tournées du jour ; on en ouvre une, et
chaque scan d'une feuille d'atelier coche son arrêt. L'écran compare **un
ensemble à un véhicule** (conception v1, §4) :

- ✅ le sac est dans cette tournée → coché ;
- 🔴 le sac est dans **une autre tournée** → alarme qui **nomme** le bon
  véhicule (« ce sac part dans le Kangoo blanc ») ; rien n'est coché ;
- 🔴 le sac n'est dans **aucune tournée** → « à répartir d'abord » ;
- ⚠️ la **retardataire** (sans feuille d'atelier, lot 1) se coche à la main,
  `loaded_via = manual`, et l'écran la montre à part tant qu'elle n'est pas
  cochée : c'est le sac qu'on oublie ;
- le bas de l'écran dit **ce qui manque encore**, par référence et enseigne.

**L4-C3 — Lire le QR.** Un second lecteur, `referenceOf`, accepte
`/colisage/{référence}` ; `tokenOf` reste tel quel, son refus est voulu.
Saisie de la référence en repli. ⚠️ `BarcodeDetector` : son support sur les
téléphones réels n'est pas vérifié (conception v1, §13) — à mesurer sur
l'appareil du dépôt avant de bâtir l'écran.

**L4-C4 — Le départ gèle la tournée.** Un bouton **« Partir »** par tournée :
il pose `departed_at` sur la tournée (écrivain : la tournée), et à partir de
là :

- composer (affecter, déplacer, réordonner, retirer) est **refusé** sur une
  tournée partie (I6) — les autres restent modifiables, puisque chacune a son
  verrou (C1) ;
- partir avec des arrêts **non chargés** : refusé, sauf à les **retirer**
  d'abord (Q11 : à la main) — ou autorisé avec confirmation ? (**Q14**) ;
- ce que le livreur verra à la porte (adresse, fenêtre, contact, consignes)
  est **figé au départ** : une correction du carnet après le départ ne change
  plus la feuille d'une camionnette déjà sur la route (architecture §8,
  « snapshot au départ »).

**L4-C5 — Déplacer un arrêt chargé est refusé** (C11) : le sac est dans la
mauvaise camionnette. Le refus dit de le décharger d'abord : « Décharger »
efface `loaded_at` (fait au journal).

**L4-C6 — Le droit `delivery_loading`** (tableau Q7/Q8) : lecture et écriture
pour `admin` et `comptoir`. Journal : `delivery_stop.loaded`, `.unloaded`,
`delivery_round.departed`.

**L4-C7 — L'étiquette du véhicule.** La feuille d'atelier sort à la clôture de
la production, souvent **avant** la composition : elle ne peut pas imprimer le
véhicule. Recommandation : **ne rien réimprimer** ; c'est le scan qui dit où va
le sac. (**Q15** si l'équipe veut une étiquette.)

#### Contradiction de `vitruve` (2026-09-29) — ce qu'elle change

Deux `BLOQUANT`, six `SÉRIEUX`. Les corrections, et ce qui reste à trancher :

- 🔴 **Le « snapshot au départ » n'avait ni source ni auteur.** Le serveur
  `delivery` ne lit que des références ; l'adresse et le contact viennent de la
  feuille de route, jointe **par l'écran**. Correction : au départ, le canal
  commerce (`DeliveryOrdersReader`) rend aussi, pour les arrêts de la tournée,
  **adresse livrée, contact, fenêtre, signature et note** — sans montant — et
  « Partir » les **recopie** dans l'exécution, écrite par l'exécution. C'est ce
  que lira la vue livreur (lot 6).
- 🔴 **« À la main » était contournable.** Le serveur `delivery` ne sait pas
  quelle commande est sans feuille d'atelier (c'est la production, et
  `delivery → production` est fermé). Correction : ouvrir **un** canal
  `delivery → production`, sur le modèle de celui que la production publie
  déjà pour le retrait (`AtelierSheetsReader`), et **refuser** `manual` sur un
  arrêt qui a une feuille. La matrice de `CLAUDE.md` §3 gagne une case.
- **Un QR par commande, pas par sac** (`atelier-sheet-pdf.ts`). Une commande en
  deux sacs se coche au premier scan. **Q20.**
- **L'iPhone ouvre le colisage.** `BarcodeDetector` n'existe pas sous Safari ;
  l'appareil photo natif ouvrirait `/colisage/{référence}`, l'écran qui
  **déclare la commande prête** (`b2b_orders:write`). Un livreur qui scanne de
  réflexe ferait un geste de colisage. **Q16 devient bloquante.**
- **Déplacer un arrêt chargé, et partir pendant un chargement** : ce sont des
  vérifications entre deux tables. Correction : `saveMove` et « Partir »
  **verrouillent aussi les lignes d'exécution** de la tournée dans leur
  transaction, après les tournées, dans l'ordre des identifiants.
- **Après le départ, l'exécution se gèle aussi** : scanner ou décharger sur une
  tournée partie est refusé.
- **Un sac d'une autre tournée, peut-être d'un autre jour** : la résolution
  référence → arrêt vivant se fait **tous jours confondus** (I3), par une
  lecture du dépôt de `delivery` ; une référence inconnue est demandée au
  canal commerce.
- **Décharger** efface `loaded_at`, `loaded_by` et `loaded_via` ; le fait au
  journal garde qui avait chargé.
- ⚠️ **Chaque scan fait avancer `production.day_change`** : Supervision,
  colisage et comptoir se rechargeront à chaque sac. À mesurer ; si c'est trop,
  l'exécution passe dans un schéma à elle (une exception D7 écrite ne suffit
  pas : la table porte bien une journée).
- `delivery_loading` : attributions à trancher **avant** la migration.

**Ce que le lot 4 ne fait pas** : aucune vue livreur, aucun geste à la porte
(lot 6).

**Tranché par Hugo le 2026-09-29** :

- **Q14 — refusé.** On ne part pas avec un sac non chargé : on retire d'abord
  l'arrêt, et le geste se voit.
- **Q15 — le scan seul.** Pas d'étiquette « véhicule ».

**Tranché par Hugo le 2026-09-29 (suite)** :

- **Q16 — n'importe quel appareil qui a un appareil photo.** iPhone compris.
- **Q20 — oui, une commande part parfois en plusieurs sacs**, « à prévoir ».
- **Q21 — oui** : `delivery_loading` en lecture et écriture pour `admin` et
  `comptoir`.

#### Ce que Q16 et Q20 changent (v2 du lot 4)

**L4-C8 — Un sac, un QR.** Aujourd'hui, la feuille d'atelier porte **un** QR
par commande (`atelier-sheet-pdf.ts`), imprimé à la clôture de la production,
avant qu'on sache combien de sacs il y aura. Le compte de sacs n'est connu
qu'**au colisage**. Donc :

- le geste « Prête » du colisage demande **le nombre de sacs** (1 par défaut) ;
  c'est un fait de la **production** (`production_order`), écrit par elle ;
- le colisage imprime alors **une étiquette par sac** : référence, enseigne,
  « sac 2 / 3 », et un QR propre au sac ;
- au chargement, un arrêt est **chargé quand tous ses sacs sont scannés** ;
  l'écran dit « 2 sacs sur 3 ». Scanner deux fois le même sac ne compte
  qu'une fois ;
- la retardataire, sans feuille ni colisage, se déclare à la main **avec son
  nombre de sacs**.

⚠️ Le compte de sacs vit chez la production, et `delivery` le lit par le canal
`delivery → production` déjà prévu (le « à la main » refusé sur un sac qui a
sa feuille).

**L4-C9 — Où mène le QR d'un sac.** Il n'encode **pas** `/colisage/…` : il
encode `/livraison/sac/{référence}/{n}`. Deux raisons :

- un **iPhone** scanne avec l'appareil photo natif, qui ouvre l'adresse. Avec
  `/colisage/…`, le livreur tomberait sur l'écran du fournil. Vérifié le
  2026-09-29 : ouvrir le colisage ne coche rien tout seul, un geste est
  nécessaire — le risque est une confusion, pas une écriture ;
- une adresse de sac propre permet d'**ouvrir directement le chargement** de la
  bonne tournée, sac coché ou refusé selon C2.

La feuille d'atelier garde son QR de colisage : c'est l'outil du fournil.

**L4-C10 — Lire un QR sur n'importe quel appareil.** `BarcodeDetector` n'existe
ni sous Safari ni sous Firefox. Deux chemins, qui se complètent :

- dans l'écran de chargement, un **décodeur en JavaScript**, chargé
  **seulement** par cet écran (pas au démarrage du back-office), pour que la
  lecture marche partout. `qr-reader.ts` avait écarté cette option pour un
  poste de comptoir dont on choisit le navigateur ; ici, on ne le choisit
  plus. Dépendance à un seul consommateur : hors du catalogue pnpm ;
- l'**appareil photo natif** : il ouvre `/livraison/sac/…` (L4-C9), ce qui
  marche sur tout téléphone sans rien installer.

Saisie de la référence en dernier recours.

**Question à Hugo** :

- **Q22** — Les étiquettes de sac : sur quoi les imprime-t-on ? Une
  imprimante d'étiquettes au colisage, ou une planche A4 d'étiquettes
  adhésives sur l'imprimante existante ?

#### Troisième contradiction — v3 du lot 4 (2026-09-29)

La v2 a été contredite : deux `BLOQUANT`, sept `SÉRIEUX`. Le nombre de sacs,
gravé au colisage par une écriture nue et sans « décolisage »
(`pack-order.handler.ts`, `markPacked`), ne pouvait plus être corrigé ; et un
sac n'avait pas d'identité — `(référence, n)` ne tient que si `n` ne bouge
jamais. La v3 change de modèle plutôt que de rapiécer :

**L4-C11 — Le sac est un objet de la LIVRAISON, avec son identifiant.**
Table `delivery_bag` du bloc `delivery` : identifiant opaque (`IdGenerator`),
commande, `service_day`, `voided_at`, `loaded_at` / `loaded_by`. Un sac naît
quand on **imprime son étiquette** ; il ne dépend d'aucun compte déclaré à
l'avance. Le nombre de sacs d'une commande **est** le nombre de ses sacs non
annulés — comme le nombre de véhicules est la liste des actifs.

- **Un sac de plus** : on imprime une étiquette de plus. Rien à corriger.
- **Un sac de trop** : on **annule** son étiquette (`voided_at`, au journal).
- Un arrêt est **chargé** quand tous ses sacs non annulés sont chargés.
- **Décharger** porte sur **un** sac.

Ce que ça ferme : la production n'écrit **rien** de neuf (`markPacked` reste
tel quel) ; **aucun canal `delivery → production`** n'est plus nécessaire pour
les sacs.

**L4-C12 — Tout sac a une étiquette, retardataire compris.** Il n'y a plus de
« cocher à la main » : on étiquette la commande arrivée après la clôture comme
les autres, puis on scanne. Le contournement que la première contradiction
avait trouvé disparaît avec le bouton. La saisie reste possible **pour lire** un
sac dont le QR est illisible (on tape son code court), pas pour cocher une
commande.

**L4-C13 — Le QR porte l'identifiant du sac, et l'ouvrir ne charge rien.**
`/livraison/sac/{identifiant}` : pas la référence de commande. Ouvrir l'adresse
**montre** le sac (commande, enseigne, tournée, sac 2 sur 3) et propose
**« Charger dans le Kangoo blanc »** ; c'est ce **geste** qui écrit. Un aperçu de
lien, un historique ou un curieux qui scanne ne chargent rien — la règle que le
colisage suit déjà. La route porte `permissionGuard('delivery_loading:read')` ;
charger demande l'écriture. ⚠️ À vérifier : qu'une URL profonde survit à la
connexion Auth0 du back-office.

**L4-C14 — Où l'on étiquette.** Au colisage, au moment où le bac est fait —
c'est là qu'on voit les sacs. L'écran du colisage appelle la route d'étiquetage
du bloc `delivery` ; le droit d'étiqueter est `delivery_loading:write`, que le
comptoir a déjà (Q21). Les étiquettes sont un **PDF produit par le serveur**,
comme la feuille d'atelier, et **réimprimables** (étiquette abîmée).

**L4-C15 — Ce qui reste à mesurer, écrit** :

- `delivery_bag` porte une journée : elle aura ses trois déclencheurs
  `day_change`. Chaque scan fera avancer la version du fournil, donc recharger
  Supervision et colisage : **à mesurer au premier essai réel** ; si c'est trop,
  les tables de la livraison changent de schéma (une exception D7 ne suffirait
  pas : ces tables portent une journée) ;
- le décodeur JS : librairie nommée, licence et poids mesurés **avant** de bâtir,
  importé dynamiquement **dans** le composant de l'écran de chargement, jamais
  dans un service racine ;
- `lint:prisma-model-ownership` doit attribuer `delivery_bag` au bloc
  `delivery` : les tables de la livraison vivent dans le schéma du fournil, et
  une lecture Prisma directe de `production_order` depuis `delivery` serait
  invisible à la porte d'imports.

**Bloqué par Q22** (Hugo, 2026-09-29 : « je ne sais pas encore ») : le support
des étiquettes décide du gabarit du PDF (planche A4 ou rouleau). Tout le reste
du lot 4 peut se bâtir ; l'étiquette attend la réponse.

#### Quatrième contradiction — v4 du lot 4 (2026-09-29), celle qu'on bâtit

La v3 a été contredite : trois `BLOQUANT`, cinq `SÉRIEUX`. Les réponses, qui
**remplacent** L4-C11 à L4-C14 là où elles les contredisent :

**L4-C16 — Un sac naît quand on le DÉCLARE, pas quand on l'imprime.** Bâtir
« sans les étiquettes » (Hugo) aurait laissé le lot sans aucun sac ; et faire
naître le sac à l'impression aurait fait **créer** des sacs à chaque
réimpression. Donc :

- `DeclareDeliveryBags(orderId, n)`, sous `delivery_loading:write`, crée n sacs
  et écrit un fait ; ajouter un sac plus tard, c'est déclarer 1 de plus ;
- imprimer est une **lecture** : une page HTML imprimable (une étiquette par
  page, QR + code court + « sac 2 / 3 ») que le front sert dès maintenant ;
  réimprimer ne crée rien et n'écrit rien. Quand Q22 sera tranchée, seul ce
  gabarit change.

**L4-C17 — Zéro sac n'est pas « chargé ».** « Tous ses sacs chargés » est vrai
sur un ensemble vide : une commande jamais étiquetée serait passée, et le
contournement du bouton manuel serait revenu par le vide. Un arrêt sans sac
non annulé est **« non étiqueté »**, et « Partir » le refuse comme un sac non
chargé (Q14).

**L4-C18 — Le sac appartient à la commande ; le CHARGEMENT appartient à
l'arrêt.** Un `loaded_at` posé sur le sac survivait au retrait de l'arrêt : une
commande recomposée plus tard serait apparue déjà chargée. Donc deux tables :

- `delivery_bag` : identifiant, commande, code court, `voided_at`. **Aucune
  journée** : un sac n'a pas de jour, son chargement en a un. Inscrit aux
  exceptions de la porte D7 avec cette raison ;
- `delivery_bag_load` : **(arrêt, sac)**, `loaded_at`, `loaded_by`,
  `loaded_via` (scan ou code tapé), `service_day` de l'arrêt, les trois
  déclencheurs `day_change`. Écrite par l'exécution seule (C10).

Un chargement ne compte que pour **son** arrêt : un arrêt retiré emporte ses
chargements avec lui, et la commande recomposée repart de zéro. Déplacer garde
la même ligne d'arrêt (C11), donc ses chargements — et c'est pourquoi déplacer
un arrêt qui a un sac chargé est refusé (L4-C5). `saveMove` et « Partir »
verrouillent, après les tournées, les lignes de `delivery_bag_load` de leurs
arrêts, dans l'ordre des identifiants.

**L4-C19 — Annuler un sac** est refusé s'il est chargé (décharger d'abord) et
après le départ.

**L4-C20 — Le code court.** Six caractères en base 32 de Crockford (sans 0/O,
1/I/L, U), tirés par un port d'aléa injecté — jamais `Math.random()`
(`lint:clock-port`). **Unique sur tous les sacs**, par un index unique : un
milliard de combinaisons, une nouvelle tirée en cas de collision.

**L4-C21 — Qui étiquette.** Le colisage est ouvert à `admin`, `commercial`,
`comptabilite` et `comptoir` (`b2b_orders:write`) ; l'étiquetage demande
`delivery_loading:write`, qu'ont `admin` et `comptoir` (Q21). Le bouton
« Sacs » n'apparaît qu'avec ce droit ; sans lui, le colisage dit « les sacs se
déclarent au comptoir ». Aucun droit n'est élargi.

L4-C13 (l'URL du sac montre, un geste charge) tient. La connexion sur une URL
profonde existe déjà (`staff-login.ts`, restauration de la cible dans
`staff-auth.ts`) : à vérifier en navigateur, pas à concevoir.

#### Ce que la construction et la relecture ont tranché (2026-09-29)

- Au départ, sont figées : adresse, contact, fenêtre, signature, note de la
  commande **et note livreur de l'adresse**. La **procédure** (étapes, photos)
  ne l'est pas : limite assumée, écrite dans
  `departure-sheet.ts` ; le lot 6 la
  lira en direct.
- « Partir » refuse une tournée **vide**, et une commande **annulée** entre la
  composition et le départ (le refus nomme la référence).
- Déclarer des sacs est refusé pour une commande dont la tournée est partie,
  annulée, ou passée en retrait.
- Annuler et charger un même sac se sérialisent (verrou sur le sac) ; deux
  scans simultanés n'écrivent qu'une fois.
- Reste à vérifier **en navigateur, sur un vrai téléphone** : qu'un lien
  `/livraison/sac/…` survit à la connexion, et que la lecture des QR marche
  sur un iPhone.

### Lot 5 — La tranche d'une heure en livraison (côté commande)

Côté **commerce** et **boutique** : la tranche d'une heure devient une vraie
promesse, choisie à la commande. Décidé le 2026-09-11 (conception v1, §7) ;
rien n'est bâti.

#### État des lieux, relevé le 2026-09-29

- **La boutique n'envoie aucune heure de livraison.** `requestedWindow` ne part
  qu'en retrait (`client-orders.service.ts`). La grille d'heures de
  `/nouvelle-commande` en livraison est **décorative** (`DELIVERY_SLOTS`, qui
  dit lui-même n'affirmer rien de vrai).
- 🔴 **Elle n'envoyait pas non plus l'adresse du carnet** :
  `deliveryAddressId: null` en dur, pour toutes les commandes. Le lien du lot 1
  n'était donc écrit que pour les commandes saisies par l'équipe, et contact,
  signature et fenêtre du carnet ne préremplissaient jamais une commande de la
  boutique. **Corrigé à part, avant ce lot** (2026-09-29).
- Le serveur ne contrôle **aucune** fenêtre de livraison ; au retrait,
  `windowFitsPickup` refuse une tranche hors des heures du point.
- Le carnet déclare des créneaux de réception `everyday` ou `perDay` ; seul
  `everyday` est lu (`prisma-delivery-defaults.reader.ts`).
- 🔴 **La provenance est déduite par comparaison** (`agreeFulfillment`) : une
  fenêtre égale au défaut du carnet est enregistrée `default`. Or `default`
  veut dire « pas une promesse », et la règle de retard se tait dessus. Un
  client qui choisit **exactement** l'heure de son carnet ferait donc une
  promesse que personne ne surveille.

#### Conception (2026-09-29, avant `vitruve`)

**L5-C1 — D'où viennent les heures proposées.** Au retrait, des heures
d'ouverture du point. En livraison, de **deux** sources, croisées :

- les **heures de livraison** de l'entreprise, un réglage neuf dans les
  réglages de Livraison (lot 2, `delivery_settings`) : « on livre de 6 h à
  11 h », éventuellement par jour de la semaine ;
- les **créneaux de réception** de l'adresse du carnet, `everyday` **et**
  `perDay` enfin lus, pour le jour demandé.

La grille = les heures pleines des premières, **dans** les secondes. Sans
carnet (visiteur, saisie libre), seules les premières. Une fonction pure dans
le contrat, comme `pickupSlots`, lue par la boutique et le serveur.

**L5-C2 — Obligatoire, en deux déploiements.** Un serveur qui exigerait la
tranche dès demain refuserait toutes les commandes des onglets de boutique déjà
ouverts, qui ne l'envoient pas (`CLAUDE.md` §0 : un contrat servi ne se casse
pas). Donc :

1. la boutique **propose et envoie** la tranche ; le serveur la **contrôle**
   quand elle est là (hors grille → refus qui nomme les heures possibles) ;
2. un déploiement plus tard, le serveur l'**exige** en livraison.

**L5-C3 — La provenance d'une tranche demandée.** En livraison, une tranche
**envoyée** est une promesse, qu'elle égale ou non le défaut du carnet. La
règle « provenance déduite, jamais envoyée » reste vraie — le client n'envoie
pas de drapeau —, mais pour la fenêtre de livraison, **c'est la présence du
champ** qui décide : `override` dès qu'il est là. Écrit dans
`agreeFulfillment`, avec le cas nommé en test.

**L5-C4 — Ce que ça rallume** : `isLate` parle enfin en livraison ; la
feuille de route n'écrit plus « horaire par défaut » ; le signal de fenêtre du
lot 3 porte sur des heures promises.

**⏸ En suspens (Hugo, 2026-09-29)** : « soit les clients choisissent leur
horaire à la commande, soit le commercial définit une plage en fonction du
besoin et de la localisation ». Deux sources de la fenêtre, et non une grille
unique :

- **le client choisit** à la commande, dans ce que l'offre permet ;
- **le commercial fixe une plage** pour un client, selon son besoin et sa
  localisation — un réglage du compte, pas un choix à chaque commande.

**Q19 — une plage.** « Avoir un range me paraît bien » : la fenêtre de
livraison est une **plage** (7 h – 9 h), pas nécessairement une heure pleine.
⚠️ À confirmer à la reprise : plage libre, ou plages découpées comme le
retrait ?

Le lot reste conçu (L5-C2 : deux déploiements ; L5-C3 : la provenance), mais
sa source des heures (L5-C1) est à réécrire autour de ces deux modes. Q17 et
Q18 sont suspendues avec lui.

#### À la reprise — ce que `vitruve` a trouvé (2026-09-29)

Contredit pendant la mise en suspens : deux `BLOQUANT`, sept `SÉRIEUX`. Rien
n'est corrigé ; tout est à reprendre avec les deux sources de fenêtre.

- 🔴 **La saisie par l'équipe serait refusée** à l'étape 2 : le back-office pose
  `window: null` en dur en coursier (`acheminement-commande.ts`, « jamais de
  tranche en coursier : celle qui vaut est au carnet »). Il faut un sélecteur
  au back-office **avant** d'exiger quoi que ce soit, et vérifier la boutique
  invitée (`POST /shop/orders`, même `draft`). La porte à étendre :
  `hasWindowWhenPickedUp` (`admin-order.ts`).
- 🔴 **« `delivery_settings` » désigne deux choses** : une ressource de droit, et
  la table **`public.delivery_settings`** (`DeliveryAvailability`), propriété
  du commerce. Un réglage d'heures de livraison possédé par `delivery` et lu
  par le commerce et la boutique demande un canal publié par `delivery` et une
  route publique — rien n'est écrit. Avec les deux sources de Hugo (client ou
  commercial), la plage fixée par le commercial est un réglage **du compte**,
  donc du commerce : la question change de forme.
- **`isLate` ne parlerait pas, il crierait.** `latenessOf` juge « en retard »
  toute livraison non retirée après sa fenêtre, et rien ne fait passer une
  livraison à « retirée » avant le lot 6. Et « prêt avant la fenêtre » est
  calibré pour le comptoir : en livraison, prêt doit précéder le **départ**.
  Rallumer le signal avant le lot 6 le rendrait faux tous les jours.
- **La provenance** : L5-C3 fait coexister deux règles pour trois champs frères
  (contact et signature restent comparés) ; le JSDoc du contrat et
  `order.reader.ts` deviendraient faux ; et si la boutique **présélectionne**
  l'heure du carnet, tout devient `override` sans geste humain. À trancher :
  la boutique présélectionne-t-elle ?
- **`perDay`** : le port `DeliveryDefaultsReader.of` ne reçoit pas de date ; il
  faudra la lui passer (jour de la semaine à l'heure de Paris, `weekdayOf`). Et
  un jour à `null` en `perDay` veut dire « on ne reçoit pas » ou « pas de
  préférence » : à trancher.
- **Un modèle existe déjà** : les créneaux publics de retrait
  (`public-pickup-slots.ts`, `plan-creneaux-de-retrait.md`) — règles par jour,
  pas, capacité, fermetures, servis par le serveur. Le choisir ou dire
  pourquoi pas ; ne pas fabriquer un troisième système.
- **Budget de la boutique** : une fonction de grille dans un fichier qui importe
  zod l'embarquerait au démarrage. Un fichier `*.values.ts` sans zod.
- **Irréversible** : les commandes `override` écrites à l'étape 1 ne se
  requalifieront pas sans migration de données.
- Fermé : l'heure limite et la surtaxe ne lisent pas la tranche ; les
  abonnements ne génèrent aucune commande aujourd'hui ; le devis n'a pas de
  tranche et ne doit pas en exiger.

### Lot 7 — Le calculateur de tournée — ✅ bâti le 2026-09-29 (vol d'oiseau ; OSRM au lot 8)

> **Ouvert le 2026-09-29.** Hugo : « je veux qu'on arrive au calculateur de
> tournée ». 📐 Conception avant `vitruve` ; rien n'est bâti. L'algorithme est
> celui de [`architecture-road-livraison-tournees.md`](architecture-road-livraison-tournees.md)
> §7, gardé tel quel à la réécriture du 2026-09-29 ; ce qui change est **où il
> se branche** : sur la composition du lot 3, qui existe.

**Ce que l'équipe obtient** : sur `/livraison/tournees`, un bouton
**« Proposer »**. Le calculateur répartit les commandes du jour entre les
véhicules choisis et ordonne chaque tournée ; la proposition s'affiche **en
aperçu**, avec les kilomètres et la durée estimée de chaque tournée. On
l'**applique**, ou on la jette. Appliquée, elle devient une composition
ordinaire, que l'on corrige à la main comme avant. **Un humain a le dernier
mot** (conception v1, §3) : le calculateur n'écrit jamais seul.

#### Conception (2026-09-29, avant `vitruve`)

**L7-C1 — Situer chaque arrêt.** Un point par commande, dans cet ordre
(architecture §8.1, sans le point livreur qui attend le lot 6) :

1. le **point GPS du carnet** (`deliverySpecs.gps`), relu par le lien d'adresse
   du lot 1 ;
2. sinon, le **géocodage** de l'adresse livrée figée, par la Base Adresse
   Nationale (`api-adresse.data.gouv.fr` : gratuite, sans clé, française),
   **mis en cache** par adresse normalisée dans une table du bloc `delivery` ;
3. sinon : l'arrêt est **« non situé »**, exclu de la proposition, et reste à
   répartir à la main. L'écran le dit ; on ne l'invente pas.

Le **départ** est le point GPS du point de retrait choisi au lot 2 ; sans lui,
pas de proposition (l'écran renvoie au réglage).

⚠️ Le géocodage **envoie des adresses de clients** à un service de l'État :
la page de confidentialité le nomme (L7-Q1).

**L7-C2 — Ce qu'un trajet coûte.** Au premier passage, **à vol d'oiseau**
(haversine) multiplié par un **facteur de détour** et divisé par une vitesse
moyenne — deux réglages de la livraison, pas des constantes. C'est grossier en
montagne, et c'est dit à l'écran (« estimation à vol d'oiseau »). Le port
`DistanceMatrix` / `CostFn` de l'architecture §7 permet de brancher plus tard
une vraie distance routière (OSRM, ou un service managé) **sans toucher** à
l'algorithme.

**L7-C3 — Répartir, puis ordonner** (architecture §7, gardé) :

- **répartir** les arrêts entre K véhicules par **k-medoids sur les coûts**,
  jamais par l'angle autour du dépôt — une vallée fait diverger proximité
  angulaire et routière ;
- **ordonner** chaque tournée en **ATSP** : plus proche voisin, puis Or-opt et
  2-opt, départ et retour au point de départ ;
- **débordement** : si les véhicules ne suffisent pas, l'excédent reste
  « à répartir », signalé ; jamais tronqué en silence.

Fonctions **pures**, déterministes (même entrée, même proposition : pas
d'aléa, ou un aléa à graine fixe), dans `delivery/domain/services/`. À
l'échelle réelle (trois véhicules, quelques dizaines d'arrêts), le calcul tient
en quelques millisecondes : pas de file d'attente, pas de service externe.

**L7-C4 — Les fenêtres, en contrainte douce.** Tant que le lot 5 n'existe pas,
les fenêtres sont les **défauts du carnet**, pas des promesses (lot 1). Le
calculateur les prend en **pénalité** (un arrêt dont la fenêtre finit tôt
passe devant), jamais en contrainte dure ; il signale ce qu'il ne peut pas
tenir. OR-Tools n'entre que si les fenêtres deviennent dures.

**L7-C5 — Sur quoi il travaille.** Par défaut : les commandes **à répartir** du
jour, et les tournées **non parties** et **sans sac chargé** — il ne déplace
jamais un sac déjà dans une camionnette (lot 4, L4-C5). Les véhicules : ceux
qu'on coche (par défaut les actifs du jour). (**L7-Q2** : recomposer aussi ce
qu'un humain a déjà placé, ou seulement compléter ?)

**L7-C6 — Proposer n'écrit rien ; appliquer écrit tout ou rien.** « Proposer »
est une **lecture** (`GET`) : elle rend la proposition calculée, avec les
versions des tournées qu'elle a lues. « Appliquer » est **une** commande qui
ouvre les tournées manquantes, affecte, déplace et réordonne **dans une seule
transaction**, en vérifiant ces versions : si quelqu'un a composé entre-temps,
refus « la composition a changé, reproposez ». Un fait au journal :
`delivery_round.proposal_applied`, avec ce qui a changé.

**L7-C7 — Le droit.** Proposer se lit sous `delivery_rounds:read` ; appliquer
écrit sous `delivery_rounds:write` : c'est de la composition. **Pas de droit
neuf.**

#### Contradiction de `vitruve` — v2 du calculateur (2026-09-29)

Trois `BLOQUANT`, sept `SÉRIEUX`. La v2 **remplace** L7-C1, C5, C6 là où elles
se contredisent.

**L7-C8 — Le point d'un arrêt passe par le canal, élargi et daté.** Le canal
`DeliveryOrdersReader` s'était engagé à ne servir « aucune adresse » avant le
départ. Le calculateur en a besoin : une méthode **ajoutée**, `stopPointsOf(orderIds)`,
rend pour chaque commande le point GPS du carnet (si la commande y est reliée)
et l'**adresse livrée figée à la passation** (`orders.delivery_address_snapshot`
— elle existe dès la commande ; `vitruve` la croyait créée au départ). Le
commentaire du canal est réécrit, daté. Aucune lecture de `public.address`
depuis `delivery`.

**L7-C9 — Géocoder est un GESTE, pas une lecture.** Un `GET` qui remplirait le
cache violerait `CLAUDE.md` §4. Donc :

- **« Situer les arrêts »** (`POST`, `delivery_rounds:write`) géocode ce qui
  manque, **par lot** (`/search/csv` de la BAN), plafonné, et remplit le
  cache ;
- **« Proposer »** (`GET`) ne lit **que** le cache et le carnet : il ne sort
  jamais sur le réseau, coûte l'algorithme seul, et peut se rejouer ;
- le port `Geocoder` est déclaré par le domaine de `delivery`, implémenté dans
  son infrastructure ; son URL se lit dans `AppConfig` ; chaque appel porte un
  **délai** (`AbortSignal`, 5 s) ; BAN indisponible → refus nommé, rien
  d'écrit ;
- **e2e sans réseau** : sans URL configurée, le géocodeur est **désactivé** et
  les points ne viennent que du carnet ; l'adaptateur BAN est testé en
  unitaire contre des réponses enregistrées. Le harnais ne double toujours
  qu'Auth0 (`CLAUDE.md` §5).

**L7-C10 — Le cache ne garde pas d'adresse.** Clé : l'**empreinte** (SHA-256)
de l'adresse normalisée ; valeur : latitude, longitude, score de la BAN, date.
Aucune adresse en clair, et une durée de vie (365 jours, puis rejoué). La page
de confidentialité nomme le géocodage **dans ce lot** : c'est un préalable,
pas une option (`documentation/legal/`).

**L7-C11 — Appliquer : N tournées, un ordre, tout revérifié.** Un port
`applyProposal` : il verrouille **toutes** les tournées touchées, triées par
identifiant, puis les chargements de **tous** les arrêts déplacés, dans
l'ordre des identifiants ; puis il revérifie, sous verrou, pour chacun :
version lue, tournée **non partie**, arrêt **non chargé**, commande non placée
ailleurs entre-temps (l'index partiel refuse de toute façon). Les tournées à
ouvrir tirent leur passage **sous verrou** ; une collision sur
`(jour, véhicule, passage)` devient « reproposez ». Un seul refus annule tout.

**L7-C12 — Déterministe, vraiment.** Entrée triée par identifiant de commande ;
k-medoids initialisé par le **plus éloigné** d'abord (depuis le départ, puis
le plus loin des médoïdes choisis), égalités départagées par identifiant ;
aucun aléa. Deux « Proposer » sur le même état rendent la même proposition —
**à cache égal** : le cache diffère entre production et dev, c'est dit.

**L7-C13 — Les réglages du calcul ont leur table.** Pas `delivery_settings`
(une table du commerce). Une ligne à clé naturelle dans le bloc `delivery`
(schéma `production`) : facteur de détour, vitesse moyenne, et **heure de
départ habituelle** — sans elle, pas d'heure d'arrivée, donc pas de pénalité
de fenêtre (L7-C4). Éditée sur l'écran « Point de départ » du lot 2, sous
`delivery_settings:write`.

**L7-C14 — Le fait `delivery_round.proposal_applied`** porte le jour, et pour
chaque tournée touchée : son identifiant, son véhicule, la liste des arrêts
**avant** et **après**. Figé dès le premier en production.

#### Tranché par Hugo le 2026-09-29

- **L7-Q1 — oui, la Base Adresse Nationale**, et « si j'ai moi-même les points
  GPS ? » : ils **passent avant** le géocodage (L7-C1). Vérifié le
  2026-09-29 : le formulaire d'adresse de livraison du carnet
  (`packages/b2b-ui/src/company/delivery-address-form/`, utilisé par la fiche
  client du back-office et par « Mon compte ») a **déjà** ses champs latitude
  et longitude. Un point saisi là n'est jamais géocodé. S'ils existent en
  liste, un import en masse est possible (**L7-Q4**).
- **L7-Q2 — oui** : « Proposer » complète ce qui n'est pas placé ; une case
  « tout recomposer » pour le reste.
- **L7-Q3 — la montagne, et deux contraintes au lieu d'une heure.** Hugo : peu
  de villes ; « l'heure la plus tôt à laquelle un départ peut se faire », et
  « la contrainte dépend aussi de la distance max de la tournée ». Donc
  **L7-C15** :
  - le réglage devient **l'heure de départ au plus tôt**, pas une heure fixe :
    chaque tournée part au plus tôt à cette heure, et **plus tard** si sa
    première fenêtre le permet (départ = début de la première fenêtre moins le
    trajet, sans descendre sous l'heure au plus tôt) ;
  - une **durée maximale d'une tournée** (aller, arrêts, retour) : le
    calculateur n'en compose pas de plus longue. Ce qui ne tient pas passe à un
    **second passage** du même véhicule (Q13), ou reste à répartir, signalé ;
  - un **temps d'arrêt** moyen par livraison (se garer, porter, revenir), sans
    lequel la durée d'une tournée à vingt arrêts est fausse d'une heure ;
  - vitesse et facteur de détour restent des réglages : 1,4 et 35 km/h comme
    point de départ, à recaler sur les premières tournées réelles.

**Questions à Hugo** :

- **L7-Q4** — Tes points GPS, tu les as **en liste** (tableur) à importer d'un
  coup, ou tu les saisiras adresse par adresse dans le carnet ?
- **L7-Q5** — Une première valeur pour la **durée maximale** d'une tournée et
  pour le **temps d'arrêt** moyen ?

#### Ce que la construction a tranché (2026-09-29)

- **Deux modes, choix du back-office** (Hugo : « ça dépend, je ne sais pas
  encore si on livre plusieurs fois ») : **insérer** dans les tournées
  existantes, au moindre surcoût, sans jamais changer l'ordre fait à la main ;
  ou **nouvelles tournées**. Un défaut dans les réglages du calcul, que le
  choix au moment de proposer emporte, et un réglage « plusieurs passages par
  véhicule » : sans lui, ce qui ne tient pas déborde. Défauts d'usine :
  nouvelles tournées, plusieurs passages.
- En mode insérer, une tournée **non partie** reste éligible même si des sacs y
  sont chargés : l'arrêt ajouté n'a pas de sac, « Partir » le signalera. Une
  tournée dont un arrêt n'est pas situé est exclue : impossible de chronométrer
  ce qu'on y ajoute.
- « Tout recomposer » garde entière une tournée dont un arrêt est signalé ou non
  situé : la proposition ne défait pas ce qu'elle ne sait pas refaire.
- Le géocodage n'envoie que la voie, le code postal et la ville ; en dessous d'un
  score de 0,5, l'adresse reste non située.
- Ce qui reste hors du code : [`todo-calculateur.md`](todo-calculateur.md).

### Lot 8 — OSRM Savoie : des durées par la route

> **Renommé `lfd-route-planner` le 2026-09-29, jamais déployé sous l'ancien
> nom.** Le texte des lots 8 et 8 bis garde `lfd-osrm`, `/api/osrm`,
> `OSRM_URL`, `OSRM_TOKEN` : c'est l'historique. Les noms en vigueur
> (`apps/lfd-route-planner`, `/api/route-planner`, `ROUTE_PLANNER_URL`,
> `ROUTE_PLANNER_TOKEN`, binding `ROUTE_PLANNER`) sont dans
> [`planificateur-de-tournees.md`](../ops/planificateur-de-tournees.md).

> **Ouvert le 2026-09-29.** Hugo : « à un moment on avait parlé de faire OSRM
> Savoie » — prévu par l'architecture (§7, « OSRM Savoie — mise en place »),
> renvoyé à « ensuite » par le lot 7. 📐 Rien n'est bâti. **La première étape
> est une mesure, pas du code.**

#### Pourquoi, et pourquoi avant de se fier aux propositions

Le lot 7 calcule à vol d'oiseau, avec un facteur de détour. En montagne, c'est
faux au mauvais endroit : deux clients à 3 km l'un de l'autre peuvent être à
40 minutes de route, de part et d'autre d'un col. Or ces coûts ne servent pas
qu'à **ordonner** une tournée : ils servent à **répartir** les arrêts entre les
véhicules (k-medoids sur les coûts). Avec des coûts faux, le calculateur
met une vallée et sa voisine dans la même camionnette. **Les propositions du
lot 7 ne sont pas à suivre en production sans ce lot.**

#### Ce qui ne change pas

Le lot 7 ne connaît que le port `CostFn` / `DistanceMatrix`. Remplacer le vol
d'oiseau par OSRM, c'est **un adaptateur de plus**, `OsrmDistanceMatrix` :
l'algorithme, « Proposer », « Appliquer » et l'écran ne bougent pas.
L'affectation gagne en justesse, pas seulement l'ordre (architecture §7).

#### L8-C1 — Où ça tourne : un second conteneur Cloudflare

Pas un Worker : OSRM est un programme natif (C++) qui tient le réseau routier
en mémoire ; un Worker est borné à 128 Mo et n'exécute que du JS ou du WASM.
Un **Cloudflare Container**, comme `lfd-api` (`apps/lfd-api/wrangler.jsonc`,
classe `Backend`) :

- image `osrm-backend`, **graphe Savoie précalculé dedans** — extrait
  Auvergne-Rhône-Alpes (Geofabrik), découpé au polygone de la Savoie
  (`osmium extract`), puis `osrm-extract` → `osrm-partition` →
  `osrm-customize` (profil `car`, algorithme MLD) ;
- **appelé par `lfd-api` seul**, jamais depuis un navigateur, et jamais
  exposé par la passerelle ;
- **pas besoin d'être allumé en permanence** : le calcul se fait le matin, à
  « Proposer ». Il s'endort, se réveille au premier appel (le temps de charger
  le graphe), et reste chaud tant qu'on compose. Son `sleepAfter` se règle
  si le réveil gêne ;
- **aucune adresse n'en sort** : OSRM ne reçoit que des coordonnées, et c'est
  notre service. La page de confidentialité n'a rien à ajouter pour lui.

**Le repli**, si Cloudflare ne le permet pas (mémoire, taille d'image, coût) :
un petit serveur dédié (VPS, 2 à 4 Go), même image. Et en dernier recours un
service managé (HERE, OpenRouteService), où les coordonnées partent chez un
tiers — architecture §7, « Option managée ».

#### L8-C2 — Les services utilisés

- **`/table`** — la matrice de durées et de distances entre le départ et tous
  les arrêts. C'est tout ce dont `OsrmDistanceMatrix` a besoin. ⚠️ Plafonné par
  `--max-table-size` (100 points par défaut) : largement au-dessus de quelques
  dizaines d'arrêts, mais à régler et à **refuser nommément** au-delà.
- **`/route`** — plus tard, pour tracer une tournée sur une carte (port
  `Directions`, architecture §7). Hors de ce lot.
- Les coûts deviennent **asymétriques** (sens uniques, montées) : l'ordonnanceur
  du lot 7 est déjà ATSP, rien à changer.

#### L8-C3 — Quand OSRM ne répond pas

« Proposer » ne doit pas tomber avec lui. Délai court (`AbortSignal`) ; en cas
d'échec, **retour au vol d'oiseau**, et l'écran le dit (« estimation à vol
d'oiseau : le calcul routier ne répond pas »). Jamais une proposition routière
annoncée qui n'en est pas une. L'URL vit dans `AppConfig` ; sans URL, vol
d'oiseau (dev, e2e sans réseau).

#### L8-C4 — Tenir la carte à jour

L'image se **reconstruit chaque mois** par la CI : télécharger l'extrait,
découper, précalculer, publier. Les routes de montagne changent peu, mais une
route fermée ou ouverte change des tournées. Un workflow planifié de plus :
`documentation/ci-cd/` le décrit, et la mémoire du dépôt le rappelle — un
workflow YAML n'est lu que par GitHub, aucune porte locale ne le vérifie.

#### L8-C5 — La mesure, d'abord (étape 0)

Rien ne se bâtit avant d'avoir **mesuré**, en local :

1. construire le graphe Savoie (Docker `osrm-backend`) ;
2. mesurer la **mémoire** de `osrm-routed` chargé, la **taille** des fichiers
   `.osrm*`, le **temps de chargement** (le réveil), et le temps d'un `/table`
   à 50 points ;
3. confronter aux **limites de Cloudflare Containers** — types d'instance et
   leur mémoire, taille maximale d'image, coût — dans leur documentation, datée
   au jour de la lecture ;
4. comparer une dizaine de trajets réels connus de l'équipe avec ce qu'OSRM
   annonce, et avec le vol d'oiseau × 1,4 : c'est ce qui dira si le lot vaut
   son coût.

✅ **Mesuré le jour même** : voir L8-C6. Les ordres de grandeur estimés
ci-dessus (un gigaoctet de mémoire) étaient faux, dans le bon sens.

#### L8-C6 — L'étape 0, mesurée le 2026-09-29

Sur le poste de Hugo, Docker, `osrm-backend` v5.27.1, profil `car`, MLD.
Extrait Geofabrik Rhône-Alpes du 2026-09-29 (530 Mo), découpé au polygone de
la Savoie (relation OSM 7425).

| Mesure                                                           | Valeur                           |
| ---------------------------------------------------------------- | -------------------------------- |
| Extrait Savoie (`.osm.pbf`)                                      | 53 Mo                            |
| Graphe précalculé (`.osrm*`)                                     | **78 Mo**                        |
| Image `osrm-backend`                                             | 141 Mo (≈ 220 Mo avec le graphe) |
| Mémoire d'`osrm-routed` chargé                                   | **47 à 51 Mo**                   |
| Réveil (démarrage → première réponse)                            | **0,6 s**                        |
| `/table` à 50 points                                             | **18 à 30 ms**                   |
| Préparation complète (découpe + extract + partition + customize) | environ 2 min                    |

**Les estimations de ce plan étaient fausses d'un ordre de grandeur** (on
parlait d'un gigaoctet) : la Savoie est petite. **Cloudflare tient sans
effort** — limites lues le 2026-09-29 sur
`developers.cloudflare.com/containers/platform-details/limits/` : le plus petit
type, `lite` (256 MiB, 2 Go de disque, image ≤ disque), suffit. Et un réveil à
0,6 s rend inutile de le garder allumé.

**Le vol d'oiseau, confronté à la route** — départ Val d'Isère (le labo) :

| Vers            | Vol d'oiseau | Lot 7 (× 1,4 ; 35 km/h) | OSRM                 | Réalité (Hugo) |
| --------------- | ------------ | ----------------------- | -------------------- | -------------- |
| Arc 1800        | 20,8 km      | 50 min                  | 46,7 km · **58 min** | **55 min**     |
| Courchevel 1850 | 27,1 km      | 65 min                  | 82,7 km · **96 min** | —              |
| Méribel         | 32,7 km      | 78 min                  | 75,9 km · **89 min** | —              |
| La Rosière      | 22,4 km      | 54 min                  | 32,1 km · **45 min** | —              |

Ce que ça dit :

- OSRM tombe à **3 minutes** du seul trajet réel connu, un peu pessimiste —
  le bon sens, pour une promesse ;
- le vol d'oiseau se trompe **dans les deux sens** : Courchevel est **31
  minutes** plus loin qu'il ne le croit (la route fait trois fois la distance à
  vol d'oiseau, par Moûtiers), La Rosière **9 minutes** plus près. Aucun
  facteur de détour unique ne corrige les deux : c'est la preuve que la
  **répartition** du lot 7 serait fausse sans OSRM, pas seulement l'ordre.

**Recoupé par Hugo le même jour** : comparé à Google Maps sur ces trajets,
OSRM tombe « à 4 minutes près ». Deux sources indépendantes — un trajet vécu,
un calculateur de référence — disent la même chose.

**Verdict** : le lot 8 vaut son coût, et il coûte peu. Les réglages de
facteur de détour et de vitesse du lot 7 ne servent plus qu'au **repli** quand
OSRM ne répond pas.

#### L8-C7 — Comment `lfd-api` joint OSRM (relu le 2026-09-29)

⚠️ **L8-C1 supposait un second conteneur « appelé par `lfd-api` seul ». Il
n'a pas dit comment**, et c'est la vraie question : `lfd-api` n'a **aucune
adresse publique** (`apps/lfd-api/wrangler.jsonc` : `workers_dev: false`, joint
par le seul service binding de la passerelle — c'est ce qui fait d'elle une
frontière). Un conteneur OSRM à part a donc besoin d'être joignable depuis
l'intérieur du conteneur `lfd-api`, sans ouvrir de porte au monde. Trois
formes :

|       | Forme                                                                                                | Pour                                                                                                                       | Contre                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **OSRM dans l'image de `lfd-api`**, un second processus sur `localhost`                              | aucune adresse, aucun déploiement de plus ; 50 Mo de mémoire tiennent dans l'instance `basic` (1 Gio) ; aucun appel réseau | l'image grossit d'environ 220 Mo ; refaire la carte chaque mois = redéployer `lfd-api` ; deux processus dans un conteneur, à surveiller |
| **B** | **Second conteneur** derrière son propre Worker, sans adresse publique, joint par un service binding | deux vies séparées, la carte se refait sans toucher l'API                                                                  | un conteneur ne tient pas de service binding : l'appel sortant de `lfd-api` devrait repasser par un Worker. **Mécanisme non vérifié**   |
| **C** | **Second conteneur à adresse publique**, protégé par un secret partagé                               | simple à câbler                                                                                                            | une porte de plus ouverte au monde, à côté de la passerelle : l'inverse du principe tenu depuis le 2026-08-13                           |

**Recommandation : A**, parce qu'il n'ouvre rien et ne dépend d'aucun
mécanisme non vérifié. La carte peut ne pas être dans l'image : téléchargée au
démarrage depuis le bucket privé (R2), elle se met à jour sans redéployer — au
prix d'un démarrage plus lent de quelques secondes, **à mesurer**. C'est le
choix à faire en second, une fois A retenu.

Ce choix touche le **déploiement** et finira dans le runbook : **`vitruve`
d'office** avant de bâtir.

~~**Tranché par Hugo le 2026-09-29 : A, OSRM dans l'image de `lfd-api`.**~~
Remplacé le même jour : voir L8-C9 puis L8-C10 (Hugo : « il n'y a pas plus
propre ? »).

#### L8-C8 — La forme retenue, avant `vitruve`

- **Deux processus dans le conteneur** : `osrm-routed` sur `localhost` (port
  interne, jamais exposé par `EXPOSE`), et Node. Un petit lanceur démarre OSRM,
  attend qu'il réponde, puis démarre Node ; **si OSRM meurt, Node continue**
  (repli vol d'oiseau, L8-C3) et le lanceur le relance. Le conteneur ne doit
  jamais tomber à cause d'OSRM.
- **Le binaire** vient de l'image officielle `osrm-backend` (étape de build
  multi-étapes), à la **même version** que le graphe (v5.27.1 mesurée) : un
  graphe préparé par une version se charge mal dans une autre.
- **La carte, dans l'image, préparée ailleurs** : un workflow **mensuel**
  télécharge l'extrait, découpe la Savoie, prépare le graphe et le publie dans
  le bucket privé (R2), daté. Le build de `lfd-api` **récupère le dernier
  graphe** et le copie dans l'image. Ainsi : aucun téléchargement au démarrage
  (le réveil reste rapide), aucun redéploiement forcé chaque mois — l'API
  prend la carte la plus récente à son prochain déploiement, qui arrive de
  toute façon plus souvent. Si le graphe manque au build, le build **échoue**
  plutôt que de livrer une API sans carte en silence.
- **Taille** : l'image grossit d'environ 220 Mo (binaire + graphe). Dans
  l'instance `basic` (1 Gio, 4 Go de disque) : Node + 50 Mo d'OSRM.
- **La porte `lint:deployed-app-files`** et le filtre de chemins du workflow
  de déploiement doivent connaître les nouveaux fichiers (lanceur, étape
  OSRM) : un filtre qui les ignore ne redéploierait pas l'API quand ils
  changent (mémoire du dépôt : « vert ne veut pas dire déployé »).
- **En dev et en e2e** : pas d'OSRM, URL absente → vol d'oiseau. Un
  `docker compose` optionnel lance OSRM à côté pour qui veut le tester.

#### L8-C9 — Plus propre : un service à part, joint sans adresse (2026-09-29)

Hugo : « il n'y a pas plus propre plutôt que de l'embarquer dans l'image de
l'API ? ». Si : la forme B de L8-C7 était écartée faute de savoir comment un
conteneur en joint un autre sans adresse publique. **Le mécanisme existe** —
lu le 2026-09-29 dans la documentation Cloudflare
(`developers.cloudflare.com/containers/platform-details/outbound-traffic/`) :
les **outbound handlers**, des proxys de sortie qui tournent sur la même
machine que le conteneur et ont accès à tous les bindings du Worker ;
`outboundByHost` route un nom d'hôte vers une fonction du Worker. Et la
version installée, `@cloudflare/containers` 0.3.7, l'expose déjà
(`outboundByHost` présent dans les types livrés du paquet, le fichier de types container.d.ts du paquet installé).

**La forme B-bis** :

- un **second conteneur** `Osrm`, déclaré dans le **même** `wrangler.jsonc` que
  `lfd-api` (une seconde classe de conteneur, sa propre image) ;
- `lfd-api` appelle `http://osrm.internal/table/…` ; le Worker de `lfd-api`
  l'intercepte par `outboundByHost` et le passe au conteneur `Osrm` par son
  binding. **Aucune adresse publique, aucun passage par Internet**, la
  passerelle reste la seule porte d'entrée ;
- **deux vies séparées** : l'image OSRM (binaire + graphe) se reconstruit
  chaque mois **sans toucher** à l'image de l'API ; l'API ne grossit pas et ne
  porte qu'un processus ; OSRM a son propre type d'instance (`lite` suffit) et
  s'endort seul ;
- ⚠️ ports 80/443 seulement pour l'interception : OSRM écoute sur 5000 dans
  son conteneur, c'est le Worker qui fait le pont.

**Ce qui n'est pas vérifié** : l'interception en conditions réelles (un essai
de déploiement la prouvera), le comportement quand le conteneur `Osrm` dort
(premier appel = réveil, 0,6 s mesurés en local), et le coût d'une seconde
instance.

**Recommandation : B-bis, à la place de A**, si Hugo confirme. A reste le repli
si l'interception ne tient pas à l'essai.

#### Contradiction de `vitruve` sur la forme A — et ce qu'elle dit de B-bis

Relue le 2026-09-29, avant la redirection vers B-bis : trois `BLOQUANT` sur A.
**La plupart tombent avec B-bis**, et c'est l'argument qui manquait :

- ~~le binaire copié dans `node:22-slim` sans ses bibliothèques (Boost, TBB)~~ :
  en B-bis, OSRM garde **son** image officielle ;
- ~~PID 1 et signaux, deux processus~~ : un processus par conteneur ;
- ~~1/4 de vCPU partagé entre l'API et OSRM~~ : une instance chacun ;
- ~~la carte dans l'image de l'API, qui bloque un correctif urgent~~ : l'API
  ne dépend plus de la carte pour se déployer.

**Ce qui vaut pour les deux formes, et que le lot doit écrire** :

- **La carte au build** : aucun bucket ni jeton n'existe pour elle
  (`architecture-stockage-r2.md`). Le workflow télécharge le graphe **avant**
  `docker build`, hors du contexte (`.dockerignore` est à la racine) ; jamais
  un jeton dans un `ARG`, qui resterait dans l'historique de l'image.
- **Épingler une carte nommée**, pas « la dernière » : date + version OSRM dans
  le nom, **une seule** version d'OSRM partagée par le workflow mensuel et le
  Dockerfile (par digest), et une vérification au build que le graphe se
  charge. Le repli est la carte précédente, jamais aucune carte.
- **Voir qu'OSRM est tombé** : le repli vol d'oiseau n'est pas muet — un état
  remonté à la carte de santé `ops`, pas seulement à l'écran de celui qui
  clique « Proposer ».
- **Seul le graphe produit par la CI** (amd64, l'architecture de Cloudflare)
  est publié ; celui de la mesure sur le poste ne l'est jamais.
- **ODbL** : les données OpenStreetMap exigent une attribution dès qu'on
  **affiche** un tracé sur une carte (`/route`, hors de ce lot) — à noter pour
  ce jour-là.
- Un workflow mensuel n'est lu que par GitHub : son échec doit prévenir
  quelqu'un, sinon la carte vieillit en silence.

#### L8-C10 — Seconde passe de `vitruve` : B-bis n'était pas séparé, B-ter l'est

Relu le 2026-09-29 dans `@cloudflare/containers` 0.3.7 (son container.js livré, dans node_modules) :

- ✅ **Les appels sortants actuels ne bougent pas.** Un `outboundByHost`
  statique n'intercepte que l'hôte nommé, en HTTP ; Stripe, Resend, Auth0 et
  R2 (HTTPS) et la base (TCP) passent comme aujourd'hui. **Deux interdits à
  écrire** dans le code : jamais `outbound`, `allowedHosts`, `deniedHosts` ni
  `setOutboundByHost` sur `Backend` (un seul fait tout intercepter), et
  `enableInternet` reste vrai. L'hôte est nommé exactement, en `http://`.
- 🔴 **B-bis n'avait qu'une vie** : un conteneur `Osrm` dans le même
  `wrangler.jsonc`, c'est le même Worker et le même `wrangler deploy` ; la
  carte mensuelle aurait repassé par tout le déploiement de l'API.
- 🔴 **L'interception demande `ContainerProxy`** exporté par le Worker de
  `lfd-api`, et une date de compatibilité plus récente que `2025-06-01` : un
  changement du Worker de toute l'API, à déployer **seul, d'abord**.

**B-ter, la vraie séparation** : un **Worker à part**, `lfd-osrm`, avec son
conteneur, son `wrangler.jsonc`, son image et son workflow (mensuel + manuel),
**sans adresse publique** (`workers_dev: false`). `lfd-api` le joint ainsi :
le handler `outboundByHost` de `Backend`, qui tourne dans le runtime Workers,
appelle `lfd-osrm` par un **service binding** — la forme même qui relie la
passerelle à `lfd-api`. Deux Workers, deux déploiements, deux vies ; aucune
porte ouverte.

L'ordre, chaque étape seule :

1. **`lfd-osrm`** : image OSRM (tag épinglé par digest, amd64), graphe de la
   CI, `lite`, `max_instances: 1`, `WEUR`, `sleepAfter`, port 5000. Déployé
   seul ; personne ne l'appelle encore.
2. **Le Worker de `lfd-api`** : export `ContainerProxy`, date de
   compatibilité, service binding vers `lfd-osrm`. Rien n'est encore
   intercepté : un déploiement neutre, vérifié en production.
3. **L'interception** `osrm.internal` et l'adaptateur `OsrmDistanceMatrix` du
   calculateur.

**Ce qui reste à mesurer en production** : le démarrage **à froid** d'une
instance `lite` — le premier « Proposer » du matin le paiera, et le délai de
repli (L8-C3) doit le tolérer, ou le Worker réveille OSRM à l'ouverture de
l'écran des tournées.

**Ce qui reste des contradictions précédentes** : la carte au build (bucket,
jeton, hors du contexte Docker), une version OSRM unique par digest, un repli
qui remonte à la carte de santé, le runbook.

**✅ Tranché par Hugo le 2026-09-29 : B-ter.**

#### L8-C11 — B-ter, précisé pour le bâtir

- **Ce qu'il coûte** (tarifs lus le 2026-09-29 sur
  `developers.cloudflare.com/containers/pricing/`) : un conteneur n'est
  facturé **que lorsqu'il tourne** ; endormi, rien. Le Durable Object qui le
  pilote ne force pas l'éveil : l'API reste chaude par **choix** (cron `*/5`),
  OSRM n'aura pas de cron. À 30 minutes par jour sur `lite`, quelques
  **centimes par mois**.
- **La carte se prépare dans le build de `lfd-osrm` lui-même** : le workflow
  télécharge l'extrait, découpe la Savoie, prépare le graphe **dans la même
  exécution**, et le met dans l'image. Plus de bucket ni de jeton R2 pour la
  carte : la question « la carte au build » disparaît. **L'image est la carte
  épinglée** : son tag porte la date et la version d'OSRM ; revenir à la carte
  précédente, c'est redéployer le tag précédent.
- **Où il vit** : `apps/lfd-osrm/` — `Dockerfile` (depuis l'image officielle
  `osrm-backend`, épinglée par digest, amd64), `wrangler.jsonc`, Worker d'entrée
  minimal, et un workflow à lui (mensuel + manuel), filtré sur son dossier.
  Il ne partage **rien** avec `lfd-api`, qui ne change pas à cette étape.

#### Étape 1 bâtie le 2026-09-29 — le service `lfd-osrm`

`apps/lfd-osrm/` : une seule source de version (`osrm-version.env`, image
OSRM v5.27.1 épinglée par digest amd64) ; un script qui prépare la carte de la
Savoie et **échoue** si Val d'Isère → Arc 1800 ne répond pas ; un Worker qui ne
sert que `/table` et `/route`, sans adresse publique ni cron, et rend un refus
net quand OSRM ne répond pas ; un workflow mensuel et manuel ; la page
`documentation/ops/planificateur-de-tournees.md`. Essai local : carte en 2 min 30,
image de 227 Mo, réveil 0,6 s, 63 Mo de mémoire. **Rien n'est déployé.**

Reste : un job de CI générale pour le paquet (comme `gateway`), le point de
départ de contrôle à fixer sur l'adresse exacte du labo, et ce que seul le
premier déploiement dira (démarrage à froid, jeton, rétention des images).

#### Étapes 2 et 3 bâties le 2026-09-29 — le pont et l'adaptateur

Le Worker de `lfd-api` exporte `ContainerProxy`, porte le binding `OSRM →
lfd-osrm` et intercepte `osrm.internal` seul (le pont `container/osrm-bridge`,
503 net sur échec) ; les interdits de L8-C10 sont tenus par le test
d'interception du conteneur (pont et test retirés au lot 8 bis). `ctx.exports` passe par
le **drapeau** `enable_ctx_exports`, pas par la date : avancer la date aurait
allumé tous les changements du runtime de juin à novembre 2025 sur toute
l'API. `OsrmDistanceMatrix` : un `/table` par proposition, délai 10 s, repli vol
d'oiseau au-delà de 200 points comme sur tout échec (un refus nommé au départ,
retiré le même jour : il faisait tomber « Proposer », § 6 question 1) ;
`estimate` vaut `road` ou `crow_flies`. `OSRM_URL` suit le chemin de
`BAN_GEOCODER_URL` (variable GitHub → secret du Worker → conteneur) ; son
absence est une capacité dégradée. **Rien n'est déployé** — ordre et retour
arrière : [`planificateur-de-tournees.md`](../ops/planificateur-de-tournees.md).

Reste : l'échec **à l'exécution** d'OSRM ne remonte qu'au journal et à
l'écran, pas à la carte de santé `ops` (dont l'inventaire ne lit que la
configuration) ; le démarrage à froid à mesurer contre le délai.

#### Questions à Hugo

- **L8-Q1 — ✅ la Savoie seule** (Hugo, 2026-09-29) : « je vais jusqu'à La
  Rosière, Les Arcs, peut-être Méribel, Courchevel » — toutes en Savoie, en
  Tarentaise. L'extrait se découpe au polygone du département (73). La mesure
  de l'étape 0 comparera en priorité des trajets de **vallée à station** : ce
  sont eux que le vol d'oiseau sous-estime le plus.
- **L8-Q2** — Si Cloudflare ne tient pas : d'accord pour un petit serveur
  dédié, et chez quel hébergeur ?

### Lot 8 bis — Joindre OSRM par HTTPS et un jeton, sans interception

> **Tranché le 2026-09-29.** Hugo : « oui bascule sur le jeton ». Remplace
> la forme « B-ter » des étapes 2–3 du lot 8 (interception `outboundByHost`
> de `osrm.internal` dans le Worker de l'API + service binding), jamais
> déployée.

**Pourquoi** : l'interception exigeait une fonction récente de Cloudflare
(`ctx.exports`, drapeau `enable_ctx_exports`) jamais éprouvée chez nous, et
installée AVANT le démarrage du conteneur : si elle ratait, toute l'API
tombait. Un appel HTTPS ordinaire est ce que l'API fait déjà vers Stripe,
Resend et Auth0 ; s'il rate, seul « Proposer » refuse.

**v2 du 2026-09-29, après `vitruve`** (3 BLOQUANTS, 5 SÉRIEUX, tous intégrés
ci-dessous). Le plus lourd : donner une adresse `workers.dev` à `lfd-osrm`
ouvrait une **seconde porte publique**, alors que la passerelle est « le SEUL
chemin public vers les backends » (CLAUDE.md) et que `lfd-osrm` justifie
dans son code l'absence d'adresse. **La porte est donc la passerelle.**

**L8b-C1 — Par la passerelle.** `lfd-gateway` gagne le préfixe `/api/osrm`,
routé par **service binding** vers `lfd-osrm` (Worker → Worker, le mécanisme
que la passerelle emploie déjà pour `lfd-api` — rien à voir avec
l'interception écartée). `lfd-osrm` garde `workers_dev: false` : **aucune
adresse publique**. L'API appelle `https://lafoliecoffee.info/api/osrm/…`.

**L8b-C2 — Le jeton, vérifié par la passerelle, FERMÉ PAR DÉFAUT** :

- vérifié AVANT tout routage et toute réponse qui décrirait la surface :
  sans jeton valide, un **401 uniforme** (même corps, sans chemin ni liste
  des services) ; ensuite seulement le filtre `/table` `/route` de
  `lfd-osrm` ;
- **un jeton absent, vide ou trop court n'est JAMAIS valide** — ni côté
  requête, ni côté secret : sans secret posé, `/api/osrm` refuse tout.
  Test qui le prouve (secret absent, secret vide, `Bearer ` vide) ;
- comparaison à temps constant ; jamais dans l'URL, jamais journalisé,
  jamais renvoyé ;
- une **limite de débit** Cloudflare (binding `ratelimit`, comme le
  `RATE_LIMITER` de l'API) bornée sur `/api/osrm` : un bombardement coûte
  des invocations de passerelle bornées, jamais un réveil du conteneur.

**L8b-C3 — La rotation, vraiment sans coupure et vraiment fermée** : la
passerelle accepte `OSRM_TOKEN` et, s'il existe, `OSRM_TOKEN_NEXT`. Geste :
(1) poser `OSRM_TOKEN_NEXT` sur la passerelle ; (2) poser la nouvelle valeur
dans `OSRM_TOKEN` de l'API et la redéployer ; (3) basculer la passerelle
(`OSRM_TOKEN` ← nouvelle) puis **`wrangler secret delete OSRM_TOKEN_NEXT`**
— les workflows ne suppriment jamais un secret, ils ne font que `put` ;
un secret vidé dans GitHub reste sur le Worker. Chaque étape a son contrôle.

**L8b-C4 — L'API** : `OSRM_TOKEN` entre aux TROIS endroits tenus à la main
— `RUNTIME_KEYS` (`apps/lfd-api/container/worker.ts`, couvert par
`runtime-keys.spec.ts`), l'`env:` du pas de secrets et la boucle `for name in`
de `deploy_lfd_api.yml` (couverts par aucune porte : relus à la main).
Configuration : en production, `OSRM_TOKEN` présent **et** `OSRM_URL` en
`https://` exigés ; sinon capacité dégradée et dite (Proposer refuse), jamais
un Bearer envoyé en clair. En développement (`http://localhost:5055`, OSRM
nu), pas de jeton.

**L8b-C5 — On retire**, dans le même passage : l'interception,
le pont `osrm-bridge`, `ContainerProxy`, le drapeau `enable_ctx_exports`, le
binding `OSRM` de l'API et leurs tests — et les commentaires qui les
décrivent (`apps/lfd-route-planner/src/worker.ts`, `wrangler.jsonc` des deux,
`deploy_lfd_route_planner.yml`, `deploy_lfd_api.yml`). Retour arrière vers B-ter =
rouvrir le code ; acceptable, B-ter n'a jamais été déployé.

**L8b-C6 — Mise en service** : (1) déployer `lfd-osrm` (inchangé, sans
adresse) ; (2) poser `OSRM_TOKEN` sur la passerelle et la déployer —
`/api/osrm` répond 401 sans jeton, 200 avec (contrôle `curl` écrit) ;
(3) poser `OSRM_URL=https://lafoliecoffee.info/api/osrm` et `OSRM_TOKEN`
pour l'API, déployer. ⚠️ Si une ancienne `OSRM_URL=http://osrm.internal` a
été posée sur le Worker de l'API, elle y PERSISTE : la remplacer (nouvelle
valeur posée par le déploiement) — à vérifier par Hugo, que personne d'autre
ne peut lire.

**L8b-C7 — Le geste de Hugo** : générer le jeton en local et le ranger sans
l'afficher, lu sur l'entrée standard :
`openssl rand -base64 48 | tr -d '\n' | gh secret set OSRM_TOKEN`
(48 octets aléatoires). Aucune adresse à choisir : la passerelle existe.

**Bâti le 2026-09-29** (non commité à l'écriture ; rien n'est déployé) :

- **passerelle** — préfixe `/api/osrm` → binding `OSRM` (`lfd-osrm`) ; garde
  `gateway/src/route-planner-guard.ts` : limite de débit par IP (`OSRM_RATE_LIMITER`,
  120/min, avant le jeton), puis jeton comparé à temps constant (condensés
  SHA-256) à `OSRM_TOKEN` ou `OSRM_TOKEN_NEXT`, fermé par défaut (secret
  absent, vide ou de moins de 32 caractères : tout 401), 401 uniforme, en-tête
  `Authorization` retiré avant transmission ; le workflow pose les deux secrets
  s'ils sont non vides. Tests : `gateway/src/__tests__/route-planner-guard.spec.ts`
  (20) à travers le vrai `fetch` de la passerelle ;
- **API** — `resolveRoutePlannerEndpoint` (`apps/lfd-api/src/platform/config/route-planner-endpoint.ts`) :
  en production, `https://` ET jeton exigés, sinon `DisabledDistanceMatrix`
  et la ligne « Calcul routier des tournées » (réglage
  `OSRM_URL (https:// en production) / OSRM_TOKEN`) ; `withBearer` sur les
  deux adaptateurs OSRM ; `OSRM_TOKEN` dans `RUNTIME_KEYS`, l'`env:` et la
  boucle de `deploy_lfd_api.yml` (le **même** secret GitHub que la
  passerelle) ;
- **retiré** (L8b-C5) — le pont `container/osrm-bridge`, ses deux specs,
  `export { ContainerProxy }`, le bloc `outboundByHost`, le drapeau
  `enable_ctx_exports` et le binding `OSRM` de `lfd-api` : le Worker de l'API
  est revenu à son état d'avant le lot 8, `RUNTIME_KEYS` en plus ;
- **doc** — `documentation/ops/planificateur-de-tournees.md` réécrit (schéma, mise en
  service avec contrôles `curl`, rotation, retour arrière), runbook.

### Lot 9 — Le simulateur de tournée

> **Ouvert le 2026-09-29.** Hugo : « un simulateur dans le back-office où on
> met des horaires et des adresses pour tester ». 📐 Rien n'est bâti.

**Ce que l'équipe obtient** : un écran de l'espace Livraison où l'on saisit
des arrêts **inventés** — une adresse ou un point GPS, une fenêtre horaire —,
on choisit des véhicules et les réglages du calcul, et on clique « Proposer » :
les tournées s'affichent comme au lot 7 (durées, kilomètres, heures
d'arrivée, fenêtres manquées). **Rien n'est écrit** : ni commande, ni tournée.

**Pourquoi maintenant** : c'est l'outil pour **régler** le calculateur avant de
lui confier de vraies commandes — durée maximale, temps d'arrêt, heure de
départ — et pour **voir la différence** entre vol d'oiseau et route dès
qu'OSRM (lot 8) est déployé. Un scénario peut s'enregistrer et se rejouer.

**Comment** :

- le calculateur du lot 7 est fait de **fonctions pures** (`delivery/domain/services/`) :
  le simulateur les appelle avec des arrêts saisis au lieu des commandes du
  jour. Aucun agrégat, aucune composition touchée ;
- situer une adresse saisie passe par le même géocodeur et **remplit le même
  cache** (une empreinte, jamais l'adresse) — accepté, c'est le même service ;
  un point GPS saisi n'est jamais géocodé ;
- les scénarios enregistrés sont des **données de réglage**, sans client : une
  table du bloc `delivery`, sans journée (exception D7 écrite) ;
- droit : lire et simuler sous `delivery_rounds:read` ; enregistrer un
  scénario sous `delivery_rounds:write`. Pas de droit neuf.

**Question à Hugo** : un scénario peut-il **partir** d'une journée réelle
(« rejouer demain avec un véhicule de moins ») ? Recommandé : oui, copié en
arrêts inventés, pour ne jamais écrire dans la vraie composition.

**Tranché le 2026-09-29, pour bâtir sans attendre** (Hugo absent, « on
avance » ; les choix ci-dessous sont les plus réversibles, et restent ouverts
dans les questions de fin) :

- **L9-C1 — Une LECTURE, sans table.** `POST admin/livraison/simulateur` prend
  le scénario entier (arrêts, véhicules, réglages) et rend une proposition au
  format du lot 7 (`DeliveryRoundProposalView` réduit : pas de `versions`, pas
  de `kept`, pas d'identifiant de commande — un **libellé** d'arrêt). POST parce
  que le scénario est un corps, pas parce qu'on écrit : rien n'est écrit, et
  la route est sous `delivery_rounds:read`. **L'enregistrement des scénarios
  est reporté** : il demande une table (exception D7, migration), et rien ne
  presse tant que le simulateur n'a pas servi. Le scénario vit dans l'écran,
  et s'exporte/s'importe en fichier JSON.
- **L9-C2 — Un arrêt inventé = un libellé, un point GPS, une fenêtre
  facultative.** Pas d'adresse à géocoder en v1 : c'est le seul chemin qui
  sortirait sur le réseau et remplirait le cache. On colle des coordonnées
  (`45.4485, 6.9823`, comme les donne une carte). Partir d'une journée réelle
  ou du carnet d'adresses reste une question (§ questions de fin). Bornes :
  1 à 60 arrêts, 1 à 10 véhicules — au-delà, ce n'est plus un essai.
- **L9-C3 — Les véhicules du scénario sont des noms**, pas la flotte : on
  simule « et avec quatre camionnettes ? » sans en créer une. L'écran part de
  la flotte active.
- **L9-C4 — Les réglages du scénario** reprennent ceux du lot 7 (même schéma,
  mêmes refus du domaine), pré-remplis avec les réglages en vigueur, jamais
  écrits.
- **L9-C5 — Même calcul, même matrice** : `proposeRounds` (mode
  `new_rounds`) sur la `DistanceMatrix` injectée — donc par la route dès
  qu'OSRM est branché, et `estimate` le dit. Le point de départ est le point
  de départ réglé (lot 2), ou un point saisi.
- **L9-C6 — Front** : un onglet « Simulateur » de l'espace Livraison — une
  liste d'arrêts éditable, les véhicules, les réglages repliés, « Proposer »,
  et le résultat au format du lot 7 (réutiliser sa présentation). La carte
  viendra du lot 10.

**Back bâti le 2026-09-29** (non commité à l'écriture) : `SimulateDeliveryRoundsQuery`

- handler (`delivery/application/queries/`) — réglages par `RoutingSettings.define`
  (`defaultMode` forcé à `new_rounds`), départ saisi sinon le point réglé
  (`DepartureNotLocatedError` sinon), `DistanceMatrix` injectée, `proposeRounds`
  en tournées neuves, véhicules `v1..vn`, arrêts sous des identifiants internes
  (ceux de l'écran peuvent se répéter). Mise en forme `HH:MM` partagée avec le
  lot 7 (`tourTimesView`, `stopTimesView`, `timeWindowOf`). Route
  `POST admin/livraison/simulateur` (`apps/lfd-api/src/delivery/http/delivery-simulator.controller.ts`,
  `delivery_rounds:read`). Tests : 9 unitaires du handler, 5 e2e
  (`apps/lfd-api/test/delivery-simulator.e2e-spec.ts` — 200 sans écriture, 409, 400 ×2, 403).
  Front : à bâtir.

**L9-C7 — Enregistrer les scénarios** (Hugo, 2026-09-29, § 6 question 4 :
« B »). Une liste de scénarios dans l'onglet Simulateur : nommer, enregistrer,
rouvrir, dupliquer, archiver. Visibles de toute l'équipe qui lit les
tournées ; écrire demande `delivery_rounds:write`, lire `delivery_rounds:read`.
Une table `production.delivery_simulation_scenario` (nom, le scénario en
`jsonb` validé par `deliverySimulationPayloadSchema` à l'écriture ET à la
lecture, auteur staff, dates, `archived_at` — **pas de DELETE physique**),
**sans journée** : exception D7 écrite (ce n'est pas du travail d'un jour, et
aucun client n'y figure). Migration additive. L'export/import de fichier
reste. Un nom unique parmi les scénarios non archivés, refus lisible.

**L9-C8 — Partir d'une vraie journée** (Hugo, 2026-09-29, § 6 question 5 :
« A »). Un bouton « Partir de la journée du … » charge dans le simulateur les
livraisons non annulées de ce jour qui ont un point, **copiées** en arrêts
inventés (libellé = nom de l'adresse livrée, sinon le client ; point ;
créneau convenu ; temps sur place de l'adresse s'il existe), et les véhicules
actifs ce jour-là (par leur nom). Aucun lien vers les commandes : rien ne peut
écrire dans la vraie composition. Les livraisons sans point sont listées à
part, non chargées. Lecture sous `delivery_rounds:read` (le droit qui montre
déjà ces noms). Enregistré, le scénario garde ces noms — assumé.

**Serveur bâti le 2026-09-29** (L9-C7 et L9-C8, non commité à l'écriture) :

- **Contrat** (`packages/contracts/src/delivery-simulator.ts`) :
  `saveDeliverySimulationScenarioPayloadSchema`, `DeliverySimulationScenarioSummaryView`,
  `DeliverySimulationScenarioView`, `DeliverySimulationFromDayView` ;
  `simulatedStopSchema` gagne `stopMinutes` facultatif (1 à 120), que le
  calcul du simulateur compte comme le temps sur place de l'arrêt.
- **Table** `production.delivery_simulation_scenario` (migration additive
  `20260929210000_les_scenarios_du_simulateur`, index unique partiel sur
  `name WHERE archived_at IS NULL`, auteur figé comme les réglages :
  id de fiche, nom, rôle) ; exception D7 écrite dans
  `apps/lfd-api/test/day-change-triggers.e2e-spec.ts`.
- **Agrégat léger** `SimulationScenario` plutôt qu'un CRUD : des règles
  refusent des écritures (nom borné, pas d'archivage en double, pas de copie
  d'un contenu illisible). L'unicité du nom est lue avant d'écrire et tenue
  par l'index, comme la plaque d'un véhicule. Le `jsonb` repasse par
  `deliverySimulationPayloadSchema` à chaque relecture : un scénario devenu
  invalide se rouvre en 409 qui le nomme, reste listé (zéro arrêt) et
  s'archive.
- **Routes** sous `admin/livraison/simulateur/scenarios` (lister, rouvrir,
  créer, remplacer, `…/dupliquer` — « X (copie) », « X (copie 2) »… —,
  `…/archiver`), lecture `delivery_rounds:read`, écriture
  `delivery_rounds:write` ; quatre faits `delivery_simulation_scenario.*`
  au journal. `GET admin/livraison/simulateur/depuis-journee?jour=` lit la
  journée par le canal `DeliveryOrdersReader` (`expectedOn`, `byIds`,
  `stopPointsOf`), le point par le carnet puis le cache du géocodage (comme
  « Proposer », sans réseau), la flotte active ce jour-là et les réglages en
  vigueur. Aucun identifiant de commande ne sort ; les arrêts s'appellent
  `j1`, `j2`… Les bornes du simulateur (60 arrêts, 10 véhicules) ne sont pas
  appliquées à la copie : « Proposer » refuse en le disant.
- **Tests** : domaine (agrégat, nom de copie), application (handlers des
  scénarios, journée copiée, `stopMinutes` au simulateur), relecture du
  `jsonb`, e2e `apps/lfd-api/test/delivery-simulation-scenarios.e2e-spec.ts`
  (parcours, 409 doublon, archiver puis recréer, contenu invalide, 400, 403
  en lecture seule, journée copiée).

### Lot 10 — La carte des tournées, belle

> **Ouvert le 2026-09-29.** Hugo : « je veux que ça soit beau ». 📐 Rien n'est
> bâti. **La première étape est une maquette, pas du code.**

**Ce que l'équipe obtient** : sur l'écran des tournées (et dans le
simulateur), une carte de la Savoie avec le **relief**, chaque tournée tracée
**par la route** dans sa couleur, les arrêts numérotés avec leur heure
d'arrivée, le labo marqué ; clair et sombre.

**L10-C1 — Ce qui la rend belle** :

- le **relief** : un ombrage des pentes rend lisibles vallées, cols et
  stations — et explique à lui seul pourquoi Courchevel est loin de Val
  d'Isère. MapLibre le dessine à partir d'un modèle d'altitude ; une
  inclinaison légère (terrain 3D) en option ;
- **un style à nous**, dérivé des tokens fold du back-office : un fond calme et
  désaturé pour que les tournées ressortent, une couleur par véhicule, une
  typographie qui ne concurrence pas les tracés ;
- le **tracé réel** de chaque tournée (`/route` d'OSRM, lot 8), des
  transitions douces, un mode sombre soigné.

**L10-C2 — Les tuiles, hébergées par nous** (Hugo, 2026-09-29 : « on peut
héberger des tuiles ? ») :

- tuiles **vectorielles** de la Savoie en **un seul fichier PMTiles**,
  fabriqué à partir du **même extrait** OpenStreetMap que le graphe OSRM
  (Planetiler ou tilemaker), posé dans **R2** ; aucun serveur de tuiles : le
  navigateur lit par requêtes partielles ;
- le **relief** en second fichier (modèle d'altitude public — IGN ou
  Copernicus), même stockage ;
- **mis à jour par le workflow mensuel** du lot 8 : même extrait, une étape de
  plus ;
- MapLibre **chargé par le seul écran carte**, jamais au démarrage du
  back-office (dont le budget initial est déjà dépassé) ;
- mention **« © OpenStreetMap »** à l'écran (ODbL), toujours ;
- ✅ **mesuré le 2026-09-29** (`apps/lfd-osrm/scripts/build-tiles.sh`, outils
  épinglés par digest) : **rues 36 Mo** (tilemaker, schéma OpenMapTiles,
  z0–14, 11 s) et **relief 60 Mo** (Mapterhorn, terrarium webp, z0–12, 6 s —
  63 Mo transférés par requêtes partielles, jamais le fichier planétaire). Le
  relief vient de **Mapterhorn** (données publiques ouvertes, mention
  « © Mapterhorn » requise) plutôt que de l'IGN ou de Copernicus brut : il est
  déjà en tuiles, donc aucun outil de conversion à maintenir.

**L10-C3 — Une alternative à garder** : les fonds de l'**IGN** (Géoplateforme),
beaux, libres de tout usage, mais servis par l'État — il voit les zones
affichées, et on dépend de sa disponibilité. En second fond (« vue terrain »),
pas en fond principal.

**L10-C4 — L'ordre** : (1) une **maquette** validée par Hugo (relief,
tournées, arrêts, heures, clair et sombre) ; (2) la mesure des fichiers ; (3)
le bâti. Suppose le lot 8 déployé pour les tracés.

> **2026-09-29 — (1) et (2) faits, en attente de Hugo.** La maquette est
> publiée (artefact privé « Tournées de Haute-Tarentaise ») : les deux
> tournées du scénario de démonstration, tracées par le **vrai** graphe OSRM
> local, sur un découpage Haute-Tarentaise des deux fichiers (4,5 Mo + 5,8
> Mo), relief ombré, bascule 3D, clair et sombre dérivés des mêmes jetons.
> Leçons pour le bâti :
>
> - **les libellés de la carte** (noms de rues, de villes) demandent des
>   **glyphes** de police servis à MapLibre : la maquette les remplace par des
>   marqueurs HTML. Au bâti : héberger les glyphes à côté des tuiles (R2), ou
>   garder les villes en marqueurs — à trancher sur la maquette ;
> - la **feuille de style de MapLibre** doit être embarquée avec le
>   composant, sans quoi les marqueurs s'empilent sous la carte ;
> - le tracé par la route demande `/route` d'OSRM (géométrie), en plus du
>   `/table` du lot 8 : un appel par tournée, à l'affichage seulement ;
> - **R2 n'existe pas encore** pour ces fichiers : un bucket, son domaine en
>   lecture et le CORS (`Range`) — question de fin.

### Lot 10 bis — L'écran « Planifier » : carte, feuilles de route, glisser-déposer

> **Ouvert le 2026-09-29.** Hugo, devant l'écran du lot 7 : « absolument
> incompréhensible à regarder ». Maquette validée le même jour (« oui ça me
> parle, glisser les arrêts entre camionnettes ») — artefact privé
> « Planifier les tournées ». 📐 En cours de bâti.

**Ce qui était faux dans l'écran du lot 7** : des numéros de commande sans nom
de client ni lieu, une liste par tournée sans carte, et un bandeau technique
(« ×1,4, 35 km/h ») en tête. Rien ne se lisait sans recouper de tête.

**L10b-C1 — Disposition** (la maquette) : en tête, le jour, le départ et un
résumé qui compte ce qui demande l'attention (livraisons, camionnettes, hors
créneau, pas prêtes). À gauche la carte, à droite une **feuille de route par
camionnette** : départ, puis chaque arrêt — heure d'arrivée, **nom du client**,
lieu, créneau — et le retour. Les problèmes sont écrits SUR la ligne : « Arrive
après son créneau », « Attend 56 min l'ouverture », « Pas encore prête »,
signature, procédure. Le survol relie une ligne et son repère.

**L10b-C2 — Glisser-déposer** : on glisse un arrêt d'une camionnette à l'autre
ou dans sa colonne. Ce n'est pas écrit : la proposition est **re-chronométrée**
par le serveur (`POST admin/livraison/tournees/proposition/chronometrer`,
lecture, `delivery_rounds:read`) avec la composition éditée, et « Appliquer »
envoie la composition éditée — même contrat et mêmes versions que le lot 7.
Une tournée **partie ou chargée** ne se glisse pas (I6), ni vers elle ni hors
d'elle : elle est montrée, verrouillée.

**L10b-C3 — Les noms, les lieux** : l'écran les joint par `orderId` depuis la
feuille de route du jour, qu'il lit déjà (C16 du lot 3) — le contrat de
proposition ne porte toujours que des références.

**L10b-C4 — Le tracé** : chaque tournée proposée ou chronométrée porte sa
géométrie (`/route` d'OSRM, `overview=simplified`), `null` si OSRM ne l'a pas
rendue — la carte montre alors les repères sans tracé, et le dit.

**L10b-C5 — Plus de vol d'oiseau** (Hugo, 2026-09-29 : « le vol d'oiseau doit
disparaître, c'est trop faux en montagne ») : sans OSRM, « Proposer » et
« Chronométrer » **refusent** (« Le calcul routier ne répond pas : réessayez
dans une minute ; les tournées existantes ne sont pas touchées »), après un
délai de 20 s et un nouvel essai (réveil à froid). Les tables de plus de 200
points passent **par lots** (`sources`/`destinations`), recollées ; un lot en
échec fait échouer le tout. Détour et vitesse moyenne disparaissent de l'écran
des réglages ; leurs colonnes restent en base, dépréciées (étendre, basculer,
resserrer). ⚠️ En production, OSRM doit être mis en service AVANT ce
déploiement, sinon « Proposer » refuse (personne ne s'en sert encore).

**L10b-C6 — Les tuiles** : en production, lues par plages depuis R2 (bucket à
créer, question § 6-8) ; en développement, un découpage Haute-Tarentaise
(~10 Mo) servi par le back-office et lu en entier. MapLibre et la carte sont
chargés par le seul écran, jamais au démarrage.

**Serveur bâti le 2026-09-29** (non commité à l'écriture ; front en parallèle) :

- **Chronométrer** (L10b-C2) — `TimeDeliveryRoundsQuery` + handler
  (`delivery/application/queries/`), route
  `POST admin/livraison/tournees/proposition/chronometrer` sous
  `delivery_rounds:read`, contrat `timeDeliveryRoundsPayloadSchema` →
  `DeliveryRoundTimingView`. Service pur `timeComposition`
  (`apps/lfd-api/src/delivery/domain/services/time-composition.ts`) : l'ordre donné, `timeRoute`,
  le passage suivant d'un véhicule part à son retour. Gardes
  (`apps/lfd-api/src/delivery/application/delivery-timing-support.ts`) : commande inconnue / annulée / d'un autre
  jour / au comptoir (`OrderNotAssignableError`), en double, tournée inconnue
  ou sur un autre véhicule, tournée partie ou chargée recomposée
  (`LockedRoundRecomposedError`, I6), véhicule inconnu ou retiré, arrêt non
  situé (`StopNotLocatedError`). N'écrit rien.
- **Le tracé** (L10b-C4) — port `RouteGeometry`, adaptateur
  `OsrmRouteGeometry` (`/route`, `overview=simplified&geometries=geojson`, une
  requête par tournée, en parallèle) ; échec → `geometry: null`, jamais une
  erreur. Rempli par « Proposer » et « Chronométrer » ; le simulateur n'en
  porte pas (son contrat n'a pas le champ).
- **Plus de vol d'oiseau** (L10b-C5) — `CrowFliesDistanceMatrix` supprimée (plus
  aucun appelant) ; `OsrmDistanceMatrix` sans repli : 20 s, UN nouvel essai
  sur délai ou 503, blocs `sources`/`destinations` de taille ÉGALE ≤ 100
  au-delà de 200 points (3 en parallèle) — égale parce qu'OSRM refuse une
  table à un seul point (`InvalidOptions`, constaté contre l'image locale).
  Recollage vérifié contre OSRM local : 100 points en 9 blocs = la table
  unique, 10 000 cases identiques. Échec → `RoadRoutingUnavailableError`
  (409 : le dépôt n'a pas de catégorie 503, et une `TechnicalError` cacherait
  la phrase). Sans `OSRM_URL`, `DisabledDistanceMatrix` lève la même. La
  carte de santé le dit (« Calcul routier des tournées »). `estimate` vaut
  toujours `road`, déprécié ; `detourPercent`/`averageSpeedKmh` optionnels
  à l'écriture (gardent la valeur posée), toujours rendus.
- Tests : domaine (`apps/lfd-api/src/delivery/domain/services/__tests__/time-composition.spec.ts`), application (chronométrer 19,
  proposition et simulateur mis à jour, réglages sans champs dépréciés),
  infrastructure (réponses OSRM enregistrées : blocs, nouvel essai, refus,
  tracé), e2e (`delivery-routing*`, `delivery-simulator` par un double de la
  carte routière ; `apps/lfd-api/test/delivery-road-routing.e2e-spec.ts` : les trois refus).

### Lot 7 bis — Un calculateur qui tient compte des créneaux

> **Ouvert le 2026-09-29.** Sur la journée du jeu de données (17 livraisons,
> 3 camionnettes), « Proposer » rendait 5 tournées dont des passages d'un ou
> deux arrêts : deux allers-retours aux Arcs pour la même camionnette, un
> aller à La Rosière pour un seul arrêt suivi d'un second à 10 h, 55 min
> d'attente devant un hôtel fermé. Hugo : « oui améliore le calculateur ».

**Pourquoi** : le calcul répartit d'abord par PROXIMITÉ (k-medoids), sans
regarder les créneaux, puis ordonne chaque camionnette, puis coupe toute
tournée de plus de `maxRoundMinutes` (240) en passages. Les créneaux n'entrent
qu'à la fin, quand la répartition est déjà faite.

**L7b-C1 — Construire avec les créneaux** : une insertion au moindre surcoût
sur TOUTES les camionnettes à la fois (famille Solomon I1) — chaque arrêt est
placé là où il coûte le moins en temps de route **et** en attente, sans rendre
une arrivée hors créneau quand une autre place l'évite. Les arrêts aux
créneaux les plus serrés d'abord.

**L7b-C2 — Améliorer** : échanges entre camionnettes (déplacer un arrêt,
permuter deux arrêts, 2-opt*) et dans une camionnette (Or-opt, 2-opt), tant
que le coût baisse. Coût = minutes de route + attente + une pénalité forte par
minute hors créneau + une pénalité par tournée ouverte. Déterministe (aucun
aléa), borné en temps (≤ 2 s pour 60 arrêts).

**L7b-C3 — Les passages** : un second passage n'est ouvert que si la journée
ne tient pas autrement (durée maximale, ou créneaux incompatibles) — jamais
pour un arrêt que la tournée existante pouvait prendre. Une tournée chargée ou
partie reste intouchable ; en mode `insert`, les arrêts placés à la main
gardent leur ordre relatif (inchangé).

**L7b-C4 — Le temps de livraison sur place** (Hugo : « un réglage temps de
livraison qui correspond à combien de temps il faut pour décharger, signer
etc ») : le réglage global existe (`stopMinutes`, « Temps d'arrêt ») et se
renomme « Temps de livraison sur place ». Il gagne une **valeur par adresse**
dans le carnet (`deliverySpecs.stopMinutes`, facultative, dans le `jsonb` déjà
là — aucune migration) : une fromagerie à procédure en trois étapes et
signature ne se livre pas en même temps qu'un café. L'arrêt prend la valeur de
son adresse, sinon le réglage global.

**L7b-C5 — La preuve** : la matrice réelle de la journée du jeu de données,
enregistrée contre l'OSRM local, sert de cas de régression : avant / après en
tournées, kilomètres, minutes, attente et arrêts hors créneau, écrit dans ce
plan.

**Mesuré le 2026-09-29** (serveur bâti, non commité à l'écriture ; l'écran
suivra). Matrice routière enregistrée contre l'OSRM local — départ du labo,
dix-sept livraisons, dont six dans la tournée chargée de Val d'Isère, gardée
telle quelle dans les deux cas (6 h 00 → 7 h 48, 17 km). Les onze autres,
trois camionnettes, réglages d'usine (départ au plus tôt 6 h, 240 min au plus,
5 min par livraison). L'avant est recalculé avec l'ancien algorithme sur la
même matrice, juste avant sa suppression ; il reproduit l'écran observé.

| Onze livraisons à répartir          | Avant (k-medoids → ordre → découpe) | Après (insertion + amélioration) |
| ----------------------------------- | ----------------------------------- | -------------------------------- |
| Tournées proposées                  | 5                                   | 2                                |
| dont passages d'un seul arrêt       | 2                                   | 0                                |
| dont seconds passages               | 2                                   | 0                                |
| Kilomètres                          | 409                                 | 261                              |
| Minutes (départ → retour, cumulées) | 656                                 | 396                              |
| Attente devant un créneau fermé     | 55 min                              | 0                                |
| Arrêts hors créneau                 | 0                                   | 0                                |

Après : une camionnette fait les sept livraisons du matin, créneaux entre
6 h 30 et 9 h (Montvalezan, Bourg-Saint-Maurice, Séez ; 6 h 22 → 9 h 51) ;
une autre part à 9 h 12 pour les trois de 10 h – 11 h 30 et celle sans
créneau (→ 12 h 19). Figé par
`apps/lfd-api/src/delivery/domain/services/__tests__/recorded-day.spec.ts`
— fixture à côté, `apps/lfd-api/src/delivery/domain/services/__tests__/recorded-day.fixture.ts`, identifiants neutres, sans
nom de client.

Ce qui a été bâti :

- `apps/lfd-api/src/delivery/domain/services/insert-cheapest.ts` (C1) — insertion au moindre surcoût sur tous les
  véhicules, créneaux les plus étroits d'abord ;
- `apps/lfd-api/src/delivery/domain/services/improve-plans.ts` et `apps/lfd-api/src/delivery/domain/services/route-moves.ts` (C2) — Or-opt, 2-opt, déplacer,
  permuter, 2-opt\*, par paire de véhicules, liste granulaire de dix voisins
  (`apps/lfd-api/src/delivery/domain/services/move-scope.ts`) ; 60 arrêts sur 4 véhicules : ≈ 0,2 s de calcul ;
- `apps/lfd-api/src/delivery/domain/services/vehicle-plan.ts` (C2, C3) — le coût : route et attente, cent fois chaque
  seconde hors créneau, une heure par tournée ouverte, et la durée maximale
  en plus pour un second passage.

La répartition par k-medoids et l'ordonnancement ATSP sont supprimés : plus
d'appelant. C4 : `deliverySpecs.stopMinutes` (facultatif, 1 à 120, refusé par
le carnet), servi au calculateur par `DeliveryOrdersReader.stopPointsOf` et à
la feuille de route (`addressBook.stopMinutes`, absent quand l'adresse suit le
réglage).

⚠️ **Non traité, à trancher** (traité au lot 7 ter, L7t-C2, le 2026-09-29) : la tournée chargée gardée n'occupe pas son
véhicule dans le calcul. Ici, la camionnette qui fait Val d'Isère de 6 h à
7 h 48 reçoit aussi la tournée proposée de 6 h 22 — l'ancien calcul faisait la
même chose. Le calculateur ne connaît que les tournées qu'il compose.

### Lot 7 ter — D'abord le client : disponibilité, marge, et VROOM évalué

> **Tranché le 2026-09-29.** Hugo : « on maximise pour le client ».

**L7t-C1 — L'ordre des priorités du calcul** : (1) jamais hors créneau —
pénalité absolue, une proposition hors créneau n'est retenue que faute de
toute autre, et l'écran le dit ; (2) une **marge de sécurité** avant la fin
de chaque créneau (réglage « Marge de sécurité », **20 min par défaut**,
Hugo : « oui » — un bouchon au pied d'une station en hiver mange un quart
d'heure) : arriver dans les 20 dernières minutes coûte, proportionnellement ;
(3) ensuite seulement, heures de livreur et kilomètres.

**L7t-C2 — La disponibilité des camionnettes** : une camionnette qui porte
une tournée chargée ou partie n'est libre qu'à son retour estimé (tournée
chronométrée) ; elle ne reçoit une tournée neuve qu'après, et seulement si
`multiplePassages` le permet. Constaté le 2026-09-29 : « Camionnette 1 »
chargée jusqu'à 7 h 48 recevait une tournée à 6 h 23 (« pourquoi dans la démo
j'ai deux fois camionnette 1 ? »).

**L7t-C3 — Lisible à l'écran** : « Camionnette 1 · chargée », « Camionnette
1 · 2ᵉ passage · départ 8 h 05 » ; le réglage global devient « Temps de
livraison sur place », et le carnet d'adresses gagne le champ par adresse
(L7b-C4, serveur déjà bâti).

**L7t-C4 — VROOM, évalué et écarté pour l'instant.** Mesuré le 2026-09-29
(v1.14.0, OSRM local, les 11 livraisons à répartir de la journée du jeu de
données) : 198 km contre 261, mais 529 min de livreur contre 396, et **150 min
d'attente** devant des clients fermés contre 0 ; il laisse bien la camionnette
chargée sans code. Sa documentation (v1.15.0, mars 2024, dernière version) :
coûts `fixed`, `per_hour` (temps de ROUTE), `per_task_hour`, `per_km`,
plafonds `max_travel_time`, `max_distance`, `max_tasks`, pauses — **l'attente
n'est pas coûtée**, et aucune notion de marge avant la fin d'un créneau. Pour
« d'abord le client », notre calculateur est mieux placé. VROOM redevient la
bonne piste le jour où l'on veut capacités, pauses, froid ou ramassage de bacs.

**Serveur bâti le 2026-09-29** (non commité à l'écriture ; l'écran suit, en
parallèle, sur le même contrat) :

- **C1** — `apps/lfd-api/src/delivery/domain/services/vehicle-plan.ts` : le retard n'est plus un poids (`LATE_WEIGHT`,
  ×100) mais un **ordre** — `VehicleScore.lateSeconds` est comparé avant le
  reste (`isBetterScore`), donc aucune économie d'heures ne rachète une
  minute hors créneau. Puis la marge : chaque seconde servie dans les
  `safetyMarginMinutes` dernières minutes d'un créneau coûte
  `MARGIN_WEIGHT` = 10 secondes de livreur. Puis heures et tournées, comme
  avant. Le réglage : `safetyMarginMinutes`, 0 à 90, 20 par défaut —
  colonne `safety_margin_minutes` (migration additive
  `20260929200000_la_marge_de_securite`, `NOT NULL DEFAULT 20`) ; optionnel
  dans le contrat d'écriture (un écran qui ne l'envoie pas garde la valeur
  posée), toujours rendu dans la vue.
- **C2** — `apps/lfd-api/src/delivery/domain/services/vehicle-availability.ts` (`busyStarts`) chronomètre les tournées
  gardées **chargées ou parties** avec `timeComposition` ; leur camionnette
  n'est libre qu'au retour estimé (repoussé si elle est partie plus tard que
  l'heure chronométrée, jamais avancé), et sa prochaine tournée y est un
  passage de plus — qui coûte donc la pénalité de second passage. Un seul
  passage permis : elle ne reçoit rien (`passageLimitsOf`, inchangé). Choix
  fait : **une tournée chargée ou partie dont un arrêt n'est pas situé écarte
  sa camionnette de la proposition** (`fleetOccupationOf`) — sans point, son
  retour serait inventé. « Chronométrer » refuse une tournée rangée AVANT la
  tournée chargée ou partie de son véhicule (`VehicleRoundsOverlapError`).
- **C3 (serveur)** — la vue n'a pas changé de forme : `passage` compte
  désormais les tournées gardées (« 2ᵉ passage »), `departureTime` dit
  l'heure, et `kept[].reason` (`loaded` / `departed`) + `vehicleName` disent
  « chargée ».

La journée du jeu de données, mêmes onze livraisons, mêmes réglages d'usine
(`recorded-day.spec.ts`) — **les chiffres bougent** :

| Onze livraisons à répartir    | Lot 7 bis | 7 ter, marge 0 | 7 ter, marge 20 | 7 ter, marge 20, Camionnette 1 chargée jusqu'à 7 h 48 |
| ----------------------------- | --------- | -------------- | --------------- | ----------------------------------------------------- |
| Tournées proposées            | 2         | 2              | 3               | 3                                                     |
| dont passages d'un seul arrêt | 0         | 0              | 0               | 1 (Camionnette 1, 2ᵉ passage, 7 h 48)                 |
| Kilomètres                    | 261       | 261            | 305             | 304                                                   |
| Minutes (cumulées)            | 396       | 396            | 465             | 467                                                   |
| Attente devant un créneau     | 0         | 0              | 7 min           | 7 min                                                 |
| Arrêts hors créneau           | 0         | 0              | 0               | 0                                                     |
| Arrêts servis dans la marge   | 2         | 2              | 1               | 1                                                     |

Lecture : un arrêt servi dans les vingt dernières minutes de moins coûte ici
une tournée, 44 km et 69 minutes de livreur de plus — c'est l'ordre tranché
(« on maximise pour le client »), et `MARGIN_WEIGHT` en règle le prix. Le
lot 7 bis rendait, avec la camionnette chargée ignorée, une tournée de
Camionnette 1 à 6 h 23 : le test de régression porte ce symptôme.

### Lot 11 — Le suivi des camionnettes en direct

> **Ouvert le 2026-09-29.** Hugo : « une carte pour suivre les livraisons et
> les camionnettes ». 📐 Rien n'est bâti ; **suppose le lot 6** (en dette).

**Ce qu'il faut, qui n'existe pas** :

- **la position du véhicule** : c'est le téléphone du livreur qui l'envoie, donc
  la **vue livreur du lot 6** ;
- **le cadre CNIL de la géolocalisation des salariés** : information préalable
  des livreurs, finalité limitée au travail (suivre une tournée), **aucun
  suivi hors des heures de tournée** (le suivi démarre à « Partir » et
  s'arrête au retour), conservation courte des positions. À écrire et
  annoncer **avant** la première position enregistrée, comme la page de
  confidentialité ;
- **l'affichage en continu** : le back-office reçoit les positions sans
  recharger la page — une brique légère de plus (connexion maintenue, ou
  interrogation régulière), à concevoir ;
- la carte du **lot 10**, qui porte les tracés prévus : le suivi y ajoute la
  position réelle et l'avance ou le retard sur l'horaire estimé.

**Ce qu'il rendra** : où est chaque camionnette, quels arrêts sont faits
(remise attestée au lot 6), et l'heure d'arrivée révisée chez les clients
suivants.

### Plus tard, et seulement sur décision

- **Lot 6 — La porte** — ⏸ **en dette** (Hugo, 2026-09-29 : « met le 6 en dette
  et avance ») ; ce qui est tranché et ce qui bloque :
  [`todo-la-porte.md`](todo-la-porte.md). La conception suit : la vue livreur, qui ne montre que **sa** tournée, et
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

  **Questions préalables, posées à Hugo le 2026-09-29** — rien ne se dessine
  avant :

  - **L6-Q1 — Qui livre ?** Des employés avec un compte, un coursier externe,
    ou les deux ? Un rôle `livreur` qui ne voit que **sa** tournée du jour et
    n'écrit que `delivery_doorstep`, jamais les prix ni le carnet clients.
  - **L6-Q2 — Qu'est-ce qui prouve la remise ?** (conception v1, §2 : le code
    de retrait n'atteint pas la personne qui réceptionne). (a) recueillir
    l'e-mail du contact de livraison et lui envoyer le code ; (b) le livreur
    atteste lui-même, preuve faible mais honnête, auteur enregistré — avec une
    **photo de dépôt** (le socle `photo-cards` existe) ; (c) un code par site,
    affiché chez le client. Jamais le jeton imprimé sur le colis.
  - **L6-Q3 — La signature**, promise sur certaines adresses et recueillie
    nulle part : un tracé au doigt sur le téléphone avec le nom tapé, ou on
    cesse de la promettre ?
  - **L6-Q4 — Une livraison ratée** (absent, adresse fausse, refus) : relivrée
    un autre jour, à retirer au comptoir, ou annulée ? Changer le jour d'une
    commande déjà produite est un avenant du commerce (`order/`), pas un geste
    de tournée.
  - **L6-Q5 — Le réseau sur les routes.** En montagne, un téléphone sans
    réseau à la porte : faut-il que les gestes s'enregistrent hors ligne et se
    synchronisent au retour ?

  **Tranché par Hugo le 2026-09-29** :

  - **L6-Q1 — un membre avec compte, ou un livreur sans compte.** Le second
    est une **frontière de sécurité** neuve : un accès sans compte Auth0, borné
    à **une** tournée d'**un** jour, révocable (un lien à jeton envoyé au
    téléphone du livreur, par exemple). `vitruve` d'office.
  - **L6-Q2 — (a) d'abord, (b) quand personne n'accueille.** Le code de
    retrait part au **contact de livraison** — qui n'a aujourd'hui qu'un nom et
    un téléphone : il faut recueillir son e-mail (le carnet, `address.ts`) ou
    envoyer par SMS, que rien n'envoie encore. Sans personne pour recevoir :
    le livreur atteste, avec une **photo de dépôt**.
    🔴 Hugo proposait qu'un code présent sur le sac ne pose pas de problème
    « si un livreur qui le scanne ne déclenche rien ». Ce n'est pas tenable :
    le serveur ne voit que le code scanné, pas d'où il vient ; un code sur le
    sac et un code sur le téléphone du client sont le même geste. La preuve
    tient parce qu'il faut être **deux** — donc le code n'est **jamais** sur le
    sac. Le QR du sac (lot 4) porte l'identifiant du sac, pas le code.
  - **L6-Q3 — le scan du code vaut signature, sinon un tracé au doigt.** Une
    adresse qui exige la signature est satisfaite par le code présenté par le
    client ; en (b), le livreur fait signer au doigt, nom tapé.
  - **L6-Q4 — l'admin choisit**, livraison ratée par livraison ratée :
    relivrer un autre jour, retrait au comptoir, ou annulation. Le changement
    de jour est un avenant du commerce (`documentation/order/`).
  - **L6-Q5 — pas de hors-ligne pour l'instant.**

  **Q2 précisée (Hugo, 2026-09-29) : par e-mail.** Le contact de livraison
  gagne une adresse e-mail.

  #### Conception du lot 6 (2026-09-29, avant `vitruve`)

  **L6-C1 — Le code part au contact de livraison, au départ.** Relevé ce
  jour : le courriel de passation (`send-order-placed-mail.handler.ts`) envoie
  le jeton au **compte qui a commandé** ; `deliveryContactSchema` n'a que
  prénom, nom, téléphone.

  - le contact de livraison gagne un **e-mail facultatif** (carnet et
    commande) — champ **ajouté** à un contrat servi, donc la boutique et le
    back-office le proposent sans l'exiger ;
  - à **« Partir »** (lot 4), pour chaque arrêt dont le contact figé a un
    e-mail différent de celui du compte, un courriel « votre livraison arrive »
    porte le **même** jeton que la passation — pas un second secret ;
  - la page de confidentialité (`documentation/legal/`) nomme cette donnée et
    cet usage.

  **L6-C2 — La vue livreur** `/livraison/ma-tournee` : **sa** tournée du jour,
  dans l'ordre, avec ce que le départ a figé (adresse, contact, fenêtre,
  consignes, procédure). Une tournée gagne un **livreur affecté** (écrivain :
  la tournée ; affecté à la composition ou au départ).

  **L6-C3 — Les gestes à la porte**, sous `delivery_doorstep` :

  | Geste                                 | Ce qui l'atteste                                                                               | Ce qu'il écrit                                                                |
  | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
  | **Remis, code présenté**              | le livreur scanne le code **du client** (e-mail ou téléphone)                                  | un retrait `scan` dans `handover`, auteur = livreur ; vaut **signature** (Q3) |
  | **Remis sans code**, signature exigée | tracé au doigt + nom tapé                                                                      | un retrait avec la signature jointe                                           |
  | **Déposé sans personne** (Q2 b)       | **photo de dépôt**, obligatoire                                                                | un retrait `deposit` (valeur **ajoutée** à `HandoverVia`), la photo jointe    |
  | **Raté**                              | motif (absent, adresse introuvable, accès impossible, refus, autre + texte), photo facultative | l'arrêt clos en échec, **aucun** retrait                                      |
  | **Commentaire**                       | texte libre                                                                                    | un fait sur l'arrêt                                                           |

  🔴 **Le retrait reste dans `handover`** (conception v1, §9) : la porte
  appelle la même attestation que le comptoir, sous un droit à elle. La
  tournée apprend la remise par l'événement `OrderHandedOverEvent` et **clôt
  l'arrêt** (`closeStop`, qui resserre les positions — note du lot 3). Il faut
  une arête `delivery → handover`, par un canal.

  🔴 **Un geste ne vaut que pour un arrêt de SA tournée** : le mur du livreur est
  dans la requête, comme `company_id` au B2B.

  **L6-C4 — Le rôle `livreur`** (Q1, premier cas) : un rôle staff neuf, qui n'a
  que `delivery_doorstep` et la lecture de sa tournée. Migration de la
  définition de rôle, comme les grants des lots 2 à 4.

  **L6-C5 — Le livreur sans compte** (Q1, second cas) — **lot à part, 6 b** : un
  lien à jeton par tournée, affiché en QR au départ pour que le livreur le
  scanne, valable jusqu'à la fin du jour de la tournée, révocable, qui
  n'ouvre que les gestes de la porte sur **cette** tournée. C'est un **principal
  neuf** dans `platform/auth` (ni staff, ni client) : la plus grosse frontière
  de sécurité du chantier. On le fait après le 6 a, pas avec.

  **L6-C6 — Les livraisons ratées** (Q4) : un écran admin liste les arrêts
  ratés, et l'admin choisit — **relivrer** un autre jour, **retrait au
  comptoir**, ou **annuler**. ⚠️ Les trois touchent la commande (le jour, le
  mode d'acheminement) et deux touchent **l'argent** (frais de livraison d'un
  retrait, remboursement d'une annulation) : ce sont des **avenants du
  commerce** (`documentation/order/architecture-commande-immuable-avenants.md`),
  à concevoir dans `order/`, avec `vitruve`. La tournée n'en fait qu'une
  **demande**. Lot à part, 6 c.

  **Questions à Hugo** :

  - **L6-Q6** — Le courriel au contact part **au départ** de la tournée
    (recommandé : c'est là que l'heure devient réelle), ou la **veille** ?
  - **L6-Q7** — Qui affecte le livreur à une tournée : celui qui compose, ou le
    livreur qui « prend » sa tournée au départ ?
  - **L6-Q8** — La photo de dépôt : obligatoire pour « déposé sans personne »
    (recommandé), et facultative pour un échec ?

  #### Contradiction de `vitruve` — v2 du lot 6 (2026-09-29)

  Cinq `BLOQUANT`, sept `SÉRIEUX`. La v1 laissait la porte entre deux blocs
  reliés par un événement. La v2 choisit une forme ; elle **remplace** L6-C1 à
  L6-C3 là où elles se contredisent.

  **L6-C7 — Un geste, une transaction, pas d'événement.** La v1 attestait chez
  `handover` puis comptait sur `OrderHandedOverEvent` pour clore l'arrêt. Or
  cet événement n'est ni persisté ni rejoué, et porte la référence, pas l'id :
  un abonné qui échoue laissait l'arrêt ouvert, et l'index de C12 retenait la
  commande **pour toujours**. Désormais :

  - `delivery` **déclare** un port `delivery/channels/handover/`
    (« atteste cette remise »), que `handover` **implémente** — la forme de
    `production/channels/handover/` ; l'arête `handover → delivery` par ce
    canal, et c'est tout ;
  - le geste du livreur, dans **une** unité de travail : vérifier que l'arrêt
    est dans **sa** tournée, appeler le port (qui écrit `order_handover`), puis
    `closeStop`. Tout passe, ou rien ;
  - « Raté » ne passe pas par `handover` : il clôt l'arrêt seul.

  **L6-C8 — `deposit` dans `HandoverVia`, et tout ce qu'il touche.** Deux
  mappers ramènent aujourd'hui toute valeur autre que `scan` à `manual`
  (`prisma-order-handover.repository.ts`, `prisma-handover-attestations.reader.ts`) :
  un dépôt relu serait devenu une « saisie à la main », et `republish()` l'aurait
  propagé. Le type existe aussi en copie dans le commerce
  (`b2b/orders/domain/services/handover.ts`) et dans le journal
  (`z.enum(["scan","manual"])`, `journal-facts/orders-production.ts`). Tous
  sont mis à jour ensemble ; les fronts affichent une valeur inconnue comme
  « autre », jamais comme `scan`. ⚠️ **Irréversible** dès le premier dépôt écrit
  en production.

  **L6-C9 — Les preuves appartiennent au retrait.** Photo de dépôt et tracé de
  signature prouvent une **remise** : une table de `handover`
  (`order_handover_proof` : clé de stockage, type, auteur), fichiers dans le
  bucket privé des pièces (R2). Pas le socle `photo-cards`, qui est interne à
  `b2b` (`CLAUDE.md` §3) et sert des listes ordonnées de cartes, pas une pièce
  unique. La remise « sans code, signature exigée » pose `via = manual` avec
  sa signature jointe.

  **L6-C10 — Le mur, et ce qu'il ne couvre pas.** Le rôle `livreur` n'a **que**
  `delivery_doorstep` — jamais `b2b_orders`. Le mur « sa tournée » tient pour
  lui. ⚠️ Tout porteur de `b2b_orders` peut toujours attester n'importe quel
  jeton au comptoir (`handover.controller.ts`) : c'est voulu, et ce n'est pas le
  mur du livreur.

  **L6-C11 — Clore pendant la tournée.** `closeStop` est l'**exception écrite** à
  I6 (une tournée partie ne se modifie plus) : c'est le seul geste permis après
  le départ. La vue livreur lit **l'ordre figé au départ**, pas `position` :
  les numéros d'arrêt ne bougent pas pendant la tournée. Une commande retirée
  **au comptoir** alors qu'elle était en tournée : la vue livreur le montre
  (« déjà retirée »), et le livreur clôt l'arrêt sans attester.

  **L6-C12 — Le courriel au contact, envoyé par le commerce.** Le jeton et
  l'e-mail vivent au commerce : un secret n'a rien à faire dans le bloc
  logistique. `delivery` publie un fait de départ dans son canal commerce ; le
  commerce l'écoute et envoie. L'événement n'étant pas rejoué, un bouton
  **« Renvoyer le code »** existe sur l'arrêt : un livreur ne se retrouve
  jamais devant une porte sans recours.

  **L6-C13 — L'e-mail du contact, dans un contrat servi.** Trois états sur les
  lignes stockées : clé absente (avant), vide, valeur. La lecture traite
  « absent » et « vide » pareil ; l'écriture ne pose jamais de chaîne vide.
  Le snapshot du départ le recopie ; la vue livreur **ne l'affiche pas** (il
  n'en a pas besoin). La page de confidentialité le nomme, avec une durée de
  conservation du snapshot (**L6-Q9**).

  **L6-C14 — Sans le 6 c, une livraison ratée reste bloquée.** « Raté » libère
  l'index, mais la commande reste du jour J : l'affectation refuse une
  commande d'un autre jour (lot 3). Elle ne réapparaît nulle part tant que
  l'admin ne peut pas choisir (6 c). **Le 6 a ne se livre pas en production
  sans le 6 c**, ou sans un écran provisoire qui au moins liste les ratées.

  Questions à Hugo, en plus de L6-Q6 à Q8 :

  - **L6-Q9** — Combien de temps garder ce que le départ a figé (adresses,
    contacts, e-mails) ? Recommandé : 90 jours, puis effacé.

  **Tranché par Hugo le 2026-09-29** :

  - **L6-Q6 — au départ.** Le courriel au contact part quand la tournée part.
  - **L6-Q7 — celui qui compose** affecte le livreur à la tournée (lot 3 :
    écran des tournées, sous `delivery_rounds:write`).
  - **L6-Q8 — la photo est obligatoire** pour « déposé sans personne ».
  - **L6-Q9 — 90 jours**, puis effacé : ce que le départ a figé (adresses,
    contacts, e-mails). Un balayage quotidien, comme celui des traces de
    journée ; la page de confidentialité le dit.

  **Ce qu'il reste avant de bâtir le 6 a** : le 6 c (livraisons ratées) à
  concevoir dans `order/`, ou un écran provisoire qui liste les ratées
  (L6-C14). Le 6 b (livreur sans compte) attend.

- **Lot 7 — Le calculateur de tournée** : remonté en tête par Hugo le
  2026-09-29 (« je veux qu'on arrive au calculateur de tournée »). Sa
  conception est désormais un lot à part entière : voir **Lot 7** ci-dessous.

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

## 6. Questions ouvertes pour Hugo — séance du 2026-09-29 (après-midi)

Hugo s'est absenté une heure (« fais tout ce que tu peux, note les questions
pour la fin »). Ce qui a été tranché sans lui l'a été dans le sens le plus
réversible ; chaque point dit ce qui a été fait en attendant.

1. **Lot 8 — plus de 200 points par la route.** ✅ **Tranché par L10b-C5**
   (Hugo, 2026-09-29) : plus de vol d'oiseau ; au-delà de 200 points, la table
   passe par blocs recollés, et un bloc en échec fait refuser le tout.
   Serveur bâti le 2026-09-29.
2. **Lot 8 — date de compatibilité.** ~~Le drapeau `enable_ctx_exports` a été
   préféré à une date avancée (qui activerait d'un coup six mois de
   changements du runtime sur toute l'API). À confirmer.~~ **Sans objet :
   l'interception est retirée** (lot 8 bis, bâti le 2026-09-29) — plus de
   drapeau, la date de `lfd-api` reste `2025-06-01`.
3. **Lot 8 — mise en service.** ~~L'étape 2 touche le démarrage de toute
   l'API : à faire hors des heures d'usage, avec `wrangler rollback` prêt
   (jamais éprouvé sur un Worker à conteneur — l'essayer une fois à froid ?).~~
   Plus vrai depuis le lot 8 bis (2026-09-29) : l'étape 2 est la passerelle,
   et l'API ne change plus son démarrage.
   ⚠️ **Depuis L10b-C5, l'ordre compte aussi pour le lot 10 bis** : OSRM en
   service (les trois étapes de `documentation/ops/planificateur-de-tournees.md`)
   AVANT de déployer le lot 10 bis, sinon « Proposer » refuse en production.
4. **Lot 9 — enregistrer les scénarios** : reporté (table, migration). En
   attendant, export/import en fichier. Faut-il une table ?
5. **Lot 9 — partir d'une journée réelle, ou du carnet d'adresses** (« rejouer
   demain avec un véhicule de moins ») : non bâti. Recommandé : oui, copié en
   arrêts inventés.
6. **Lot 10 — la maquette** (artefact « Tournées de Haute-Tarentaise ») :
   valider le style, le relief, la 3D, le clair et le sombre.
7. **Lot 10 — les libellés de la carte** : héberger des glyphes (noms de rues
   et de lieux dessinés par la carte) ou garder quelques villes en marqueurs ?
8. **Lot 10 — R2** : créer un bucket pour les deux fichiers (96 Mo), un
   domaine de lecture et le CORS `Range`. Geste de compte Cloudflare, à toi.
9. **Lot 10 — le relief Mapterhorn** : mention « © Mapterhorn » à l'écran ;
   ses sources sont ouvertes, mais la page d'attribution n'a pas été relue
   ligne à ligne.
10. **Lot 9 — droits de l'écran.** Le simulateur est sous `delivery_rounds:read`,
    mais la flotte et les réglages qu'il pré-remplit se lisent sous
    `delivery_settings:read`. Sans ce second droit, les champs restent vides et
    l'écran le dit (aucune valeur inventée). Faut-il ouvrir la lecture ?

**Réponses de Hugo, 2026-09-29 (soir)** : Q1 vol d'oiseau supprimé (lots 10
bis, 7 bis) · Q2 sans objet (interception retirée, lot 8 bis) · Q3 mise en
service par étapes, OSRM d'abord (planificateur-de-tournees.md) · Q4 **B**,
scénarios enregistrés (L9-C7) · Q5 **A**, partir d'une vraie journée avec les
noms (L9-C8) · Q6 validée (écran Planifier) · Q7 **B maintenant**, polices
hébergées par le back-office · Q8 bucket `lfd-map-tiles` créé et rempli par
le workflow de `lfd-route-planner` (permission R2 ajoutée au jeton) ·
Q10 **A**, la lecture de la flotte et des réglages est ouverte à qui lit les
tournées. Prix de la marge et glisser-déposer tactile : **TODO**
(`todo-calculateur.md`). Q22 (support des étiquettes) : rien pour l'instant.
RGD Savoie Mont Blanc : abandonné.
