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

### Lot 4 — Le chargement, véhicule par véhicule

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

### Lot 7 — Le calculateur de tournée

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
