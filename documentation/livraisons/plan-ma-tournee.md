# « Ma tournée » — la page du livreur, son rôle, son départ, sa navigation

> ✅ **Bâti le 2026-10-01** (relevé dans le code le même jour) : MT1 à MT4 —
> le droit `delivery_driving`, l'affectation du livreur (`assignDriver`), les
> routes « ma tournée » (`my-delivery-round.controller.ts`) et la page « Ma
> tournée », à `/coursier` depuis le 2026-10-03 (`006e02c10` ; l'ancienne
> adresse `/livraison/ma-tournee` y redirige) — plus PL1 et PL4 (`06522cdac`,
> `7a96fba28`).
> **MT1 a été livré SANS migration de rôle** : le texte ci-dessous parle de
> « deux migrations », de `ROLE_GRANTS` en miroir et d'un test de parité ; tout
> cela est retiré (`packages/contracts/src/staff-access.ts`, doc de
> `delivery_driving` ; `lint:no-role-grants-in-migrations`). Le rôle `livreur`
> n'a pas de valeur `StaffRole` : il se crée **à l'écran** avec
> `delivery_driving` (et `delivery_doorstep`), cf.
> [`plan-droits-par-geste.md`](plan-droits-par-geste.md). Les sections 2, 4 et
> 6 restent le texte d'origine, annotées là où le code a changé.

> 📜 **Relu contre le code le 2026-10-07** (audit du dossier `livraisons/` du
> même jour). Corrigé en place, chaque fois daté : l'adresse de la page
> (`/coursier`) ; le livreur **voit les lignes** de chaque commande, sans
> montant (PL4, MT-D5) ; `closed_at` est écrit par `closeStop` depuis le lot 6
> (MT-D4, MT-D6) ; « Y aller » vise le stationnement d'abord (MT-D6) ; les
> phrases réelles des refus (MT-D3 v2, MT-D7) ; les lignes de code citées.
> Deux écarts au mur ne sont pas tranchés : ils sont au § 5, pour Hugo.

> 📐 **Plan** (2026-10-01) — _bâti, voir le bandeau ci-dessus_. Hugo : « j'ai besoin qu'on fasse
> la page d'une tournée côté livreur, avec vraiment commencer ma tournée, le
> bouton qui ouvre Google Maps avec les étapes ».
>
> C'est le **premier morceau du lot 6** (« la porte »,
> [`a-la-porte.md`](a-la-porte.md)) : la vue livreur (L6-C2), le rôle
> `livreur` (L6-C4) et l'affectation (L6-Q7) — **sans les gestes à la porte**
> (remis, déposé, raté), qui restaient en dette — bâtis depuis, sauf « raté »
> (état au 2026-10-06 dans `a-la-porte.md`). Et les lots YA1-YA2 de l'ancien
> plan « Y aller et la position », devenu la doc technique
> [`gps-y-aller-et-position.md`](gps-y-aller-et-position.md), qui n'a plus de
> lots : ils se relisent par
> `git show 16d367e3a^:documentation/livraisons/plan-y-aller-et-position.md`.
>
> ⚠️ Frontière de sécurité neuve (un rôle, un mur par livreur) : **`vitruve`
> avant de bâtir** (CLAUDE.md § 9 bis).

## 1. Tranché par Hugo le 2026-10-01

| #     | Question                                     | Réponse                                                                                                                                               |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| MT-Q1 | « Commencer ma tournée », c'est « Partir » ? | **Oui, le même geste** (`DeliveryRound.depart`) : il fige la tournée et refuse tant qu'un bac n'est pas chargé.                                       |
| MT-Q2 | Qui est le livreur ?                         | **Un rôle `livreur`, créé maintenant** (L6-C4).                                                                                                       |
| MT-Q3 | Combien d'étapes par lien Google Maps ?      | **Il faut que ça marche partout** : 3 (la limite des navigateurs mobiles). Et pour chaque arrêt, « Y aller » au choix Google Maps, Waze, Apple Plans. |
| MT-Q4 | Comment le livreur trouve-t-il sa tournée ?  | **Un livreur est affecté à la tournée** par qui compose (L6-Q7 tranchée).                                                                             |

## 2. Relevé du code le 2026-10-01

- **Partir** : `DeliveryRound.depart(at, readiness)`
  (`delivery/domain/entities/delivery-round.ts:368`, ligne recalée le
  2026-10-07), route
  `POST admin/livraison/tournees/:roundId/depart` sous **`delivery_loading`**.
  Refus nommés : tournée vide, arrêt non chargé, bac partagé « à refaire », déjà
  partie.
- **Le droit du chargement** ouvre aussi le scan et le plan de chargement : le
  donner au livreur lui ouvrirait le dépôt.
- **Les rôles** se lisent **en base** (`public.staff_role_definitions`,
  migration `20260926120000_les_roles_se_lisent_en_base`) ; `ROLE_GRANTS` du
  contrat en est le miroir, et un test de parité les tient égaux. Ajouter un
  rôle = **deux migrations** (Postgres refuse d'utiliser une valeur d'enum dans
  la transaction qui l'ajoute — précédent `20260923200100_le_role_communication`).
- **L'instantané de départ** (`delivery_stop_execution` : adresse, contact,
  fenêtre, consignes) n'existe **qu'après** « Partir ». Avant, les arrêts se
  lisent par le port du commerce (`DeliveryOrdersReader.departureSheetsOf`,
  `stopPointsOf`).
- **Les points GPS** des arrêts viennent de `stopPointsOf` (le carnet).
- Aucune tournée ne porte de livreur ; aucun rôle staff n'est un livreur.

## 3. Décisions

### MT-D1 — Le rôle `livreur` et son droit

- Une valeur d'enum `StaffRole.livreur`, une ressource neuve
  **`delivery_driving`** — « conduire **sa** tournée » : lire sa tournée,
  la commencer. Distincte de `delivery_doorstep`, que le lot 6 réserve aux
  gestes à la porte : le jour où ils arrivent, ce sera une ressource **de
  plus** sur le même rôle, sans élargir celle-ci.
- Le rôle `livreur` n'a **que** `delivery_driving: write` (et ce que tout staff
  a déjà : la cloche des notifications). **Pas** de commandes, de prix, de
  carnet clients, de feuille de route du jour entière, de chargement.
- `admin` reçoit `delivery_driving: write` (l'invariant « l'admin couvre
  tout »). Le comptoir **ne le reçoit pas** : il prépare, il ne conduit pas.
- Migrations : (1) les valeurs d'enum ; (2) la définition du rôle et le droit
  de l'admin, idempotentes, sur le modèle de `le_role_communication`.

### MT-D2 — L'affectation : `driver_staff_id` sur la tournée

- Une colonne nullable `delivery.delivery_round.driver_staff_id` (migration
  additive). Écrite par **l'agrégat** `DeliveryRound` : `assignDriver(staffId)`,
  refusé une fois partie (comme toute composition, I6).
- Qui affecte : celui qui **compose** (`delivery_rounds:write`), depuis l'écran
  Tournées — une liste des membres du staff qui ont le rôle `livreur`, lue par
  l'annuaire (`staff` est un bloc autorisé à la livraison, matrice du
  CLAUDE.md). Le nom affiché est lu, pas copié.
- **Partir exige un livreur affecté** : une tournée sans livreur ne part pas,
  et le refus le dit (« Camionnette 2 : aucun livreur affecté — affectez-en un
  depuis Tournées »). _Question MT-Q5 ci-dessous._

### MT-D3 — Le mur du livreur, dans la requête

Toute lecture et tout geste sous `delivery_driving` portent
`driver_staff_id = <le staff de la requête>` **dans le `where`**, résolu en base
par le `Principal` — exactement comme `company_id` au B2B. Une tournée d'un
autre livreur rend **404** (pas 403 : on ne confirme pas qu'elle existe).

_Relu le 2026-10-07 — deux écarts, laissés à Hugo (§ 5)._ `GET
ma-tournee/version` ne porte **ni livreur ni mur** : il rend un numéro de
journée, toutes tournées confondues, et la page relit sous son mur quand il
change — voulu par le code (`get-my-round-version.handler.ts`). Et scanner,
dans sa tournée, le bac d'une **autre** tournée ne rend pas 404 : le refus
nomme le véhicule, le jour et le passage où ce bac doit partir
(`BinInOtherRoundError`, `delivery-loading-errors.ts`) ; un bac dont la
commande n'est dans aucune tournée nomme la référence de la commande. C'est le
refus du chargement (L4-C2), que la porte du livreur reprend telle quelle
(`load-my-bin.handler.ts`).

L'**admin** (qui a `delivery_driving` sans être affecté) : il ne voit **que**
les tournées où il est affecté lui-même. Le mur ne connaît pas d'exception de
rôle ; un admin qui veut voir une tournée a l'écran Tournées. _(À contredire.)_

### MT-D4 — Les routes

| Route                                             | Droit                          | Ce qu'elle fait                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET admin/livraison/ma-tournee?date=`            | `delivery_driving:read`        | **mes** tournées du jour (souvent une) : véhicule, passage, état (au dépôt / partie), nombre d'arrêts                                                                                          |
| `GET admin/livraison/ma-tournee/:roundId`         | `delivery_driving:read` + mur  | la tournée : arrêts **dans l'ordre**, et pour chacun ce que le livreur a besoin de savoir à la porte (cf. MT-D5), son point GPS, son état (à faire / clos : `closedAt`, écrit depuis le lot 6) |
| `POST admin/livraison/ma-tournee/:roundId/depart` | `delivery_driving:write` + mur | **le même** `DepartDeliveryRoundCommand` que le chargement, avec la version lue ; mêmes refus                                                                                                  |

L'ancienne route de départ (`tournees/:roundId/depart` sous `delivery_loading`)
**reste** : le chargeur peut toujours faire partir une tournée (un livreur
absent, un départ décidé au dépôt). Deux portes, une commande.

### MT-D5 — Ce que le livreur voit, et ce qu'il ne voit pas

**Voit**, par arrêt : enseigne, adresse de livraison, fenêtre convenue,
contact (nom, téléphone en lien `tel:`), « signature exigée », note de
livraison de l'adresse, **procédure** (étapes et photos), nombre de bacs et
« froid ». Avant le départ, depuis le port du commerce ; après, depuis
l'instantané figé au départ (`delivery_stop_execution`) — **c'est le même
contrat de vue**, l'écran ne sait pas d'où il vient.

**Ne voit pas** : prix, montants, carnet clients complet, autres adresses du
client, autres tournées.

_Relu le 2026-10-07 : la v1 ajoutait « lignes de commande » à cette liste. Le
livreur **voit les lignes** de chaque commande — SKU, nom, quantité, « froid »
— sans aucun montant : c'est PL4, décidé dans
[`parcours-du-livreur.md`](parcours-du-livreur.md) (« une seule fiche », le
contenu de la feuille d'atelier). Champ `sheet` de `MyDeliveryStopView`, lu par
`DeliveryOrderLinesReader` (`stop-sheets.ts`), affiché sur la carte de l'arrêt
(`my-round-stop.html`)._

⚠️ À vérifier au bâti : que `departureSheetsOf` ne porte aucun champ d'argent ;
s'il en porte, la vue livreur **projette** (liste blanche de champs), elle ne
filtre pas (liste noire).
_Tenu (relu le 2026-10-07) : la vue projette champ par champ, la feuille
(`doorFactsOf`) comme les lignes (`sheetLineView`), dans
`my-delivery-round-view.ts`._

### MT-D6 — La navigation (YA1 + YA2)

Fonctions pures, testées, dans le front :

- **arrêts restants** = arrêts vivants, dans l'ordre, sans ceux qui sont
  clos (`closed_at`). _Relu le 2026-10-07 : la v1 disait « personne ne l'écrit
  avant le lot 6 ». Depuis le lot 6, `closeStop` l'écrit par quatre chemins —
  la remise ou le dépôt (`doorstep-handover.ts`), la clôture sans remise
  (`close-stop-without-handover.handler.ts`), « Rapporter » d'un commercial
  (`bring-stop-back.handler.ts`) et « Rapporter » réglé d'avance
  (`stop-decision-by-setting.ts`)_ ;
- **« Toute la tournée »** : des tronçons Google Maps
  (`google.com/maps/dir/?api=1&destination=…&waypoints=…&travelmode=driving`),
  **3 étapes + 1 destination** par lien (`MAX_WAYPOINTS = 3`, documentation
  Google relue le 2026-10-01 : « up to three waypoints supported on mobile
  browsers, and a maximum of nine waypoints supported otherwise ») ; sans
  `origin` (le téléphone part de sa position) ; le tronçon suivant part du
  dernier arrêt du précédent ; chaque étape par son **point GPS**, sinon par son
  adresse en texte ; un lien ne dépasse pas 2 048 caractères. _Relu le
  2026-10-07 : le point de **stationnement** du carnet passe d'abord, quand il
  est connu, pour « Toute la tournée » comme pour « Y aller » (`driveTargetOf`,
  `my-round-navigation.ts`)_ ;
- **« Y aller »** sur chaque arrêt : un choix **Google Maps / Waze / Apple
  Plans**, mémorisé **sur l'appareil** (stockage local, pas en base) ;
- **« Rentrer »** quand il ne reste rien : le point de départ des tournées.

### MT-D7 — L'écran

`/livraison/ma-tournee`, devenue `/coursier` le 2026-10-03 (l'ancienne adresse
y redirige) — pensé **téléphone d'abord** :

- s'il a une tournée aujourd'hui, elle s'ouvre ; plusieurs, il choisit ; aucune,
  « Aucune tournée ne vous est affectée aujourd'hui » ;
- **au dépôt** : la liste des arrêts, et un grand bouton **« Commencer ma
  tournée »** ; un refus s'affiche tel quel — relu le 2026-10-07 : « Vous ne
  pouvez pas partir : 2 arrêts ne sont pas chargés (Refuge 1950 (CMD-…),
  Brasserie des Marmottes (CMD-…)) — appelez le dépôt. »
  (`delivery-driver-errors.ts`) ;
- **partie** : « Toute la tournée » (tronçon 1 sur N), puis les arrêts, chacun
  avec « Y aller » et ses consignes dépliables ;
- le livreur arrive sur cette page **par défaut** : son rôle n'a pas d'autre
  écran. _Relu le 2026-10-07 : pas de rail réduit — le Coursier est un espace
  de premier niveau, sans rail secondaire (`app.routes.ts` du back-office)._

## 4. Les lots

| Lot     | Contenu                                                                                                                                                               | Qui                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **MT1** | Rôle et droit : deux migrations, `ROLE_GRANTS`, libellés, parité, e2e du mur de rôle (le livreur n'atteint **aucune** autre route admin testée)                       | `batisseur`           |
| **MT2** | Affectation : colonne, `assignDriver`, route sous `delivery_rounds:write`, liste des livreurs, départ refusé sans livreur ; écran Tournées                            | `batisseur` + `pablo` |
| **MT3** | Les trois routes « ma tournée », le mur dans la requête, la vue projetée ; e2e : un livreur ne voit ni ne fait partir la tournée d'un autre (404), ne voit aucun prix | `batisseur`           |
| **MT4** | Navigation (fonctions pures) et page `/livraison/ma-tournee` (devenue `/coursier`) ; rail du livreur                                                                  | `pablo`               |

## 5. Questions ouvertes

| #                            | Question                                                                                                                                                                                                         | Proposé                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MT-Q5**                    | Une tournée **sans livreur** peut-elle partir (par le chargeur) ?                                                                                                                                                | **Non** : sans livreur affecté, personne ne la voit côté livreur. Le refus dit comment affecter.                                                                                                        |
| **MT-Q6**                    | Un livreur peut-il avoir **deux** tournées le même jour (deux passages) ?                                                                                                                                        | Oui : la page les liste, il ouvre la première non rentrée. _Bâti autrement (relu le 2026-10-07) : la page les liste et il choisit ; elle n'ouvre d'office que s'il n'en a qu'une (`my-round-page.ts`)._ |
| **MT-Q7**                    | Le livreur se connecte comment ?                                                                                                                                                                                 | Comme tout staff : une invitation, un compte Auth0. Le livreur **sans** compte (lien à jeton, L6-C5) reste le lot 6 b.                                                                                  |
| **Audit Q6** (2026-10-07)    | `GET ma-tournee/version` n'a pas de mur : un livreur lit un numéro de journée toutes tournées confondues, donc le rythme d'activité de la journée. Acceptable, alors que MT-D3 promet le mur sur toute lecture ? | **À trancher par Hugo.** Voulu par le code (`get-my-round-version.handler.ts`) : la page relit sous son mur quand le numéro change.                                                                     |
| **Audit § 3.3** (2026-10-07) | Scanner le bac d'une **autre** tournée nomme son véhicule, son jour et son passage ; MT-D3 veut qu'une tournée d'un autre ne soit pas confirmée (404). Lequel tient ?                                            | **À trancher par Hugo.** Choix assumé du chargement (L4-C2, « le bon bac, dans la mauvaise camionnette »), que la porte du livreur reprend.                                                             |

## 6. v2 après `vitruve` (2026-10-01) — ce qui remplace les décisions ci-dessus

Trois `BLOQUANT`, huit `SÉRIEUX`. Là où cette section contredit § 3, **elle
l'emporte**.

### MT-D1 v2 — Le rôle : sans cloche, sans valeur d'enum de rôle

- 🔴 **Pas de `staff_notifications`** pour le livreur. La v1 disait « ce que
  tout staff a déjà » : faux. C'est un droit posé rôle par rôle, et la cloche
  ne filtre aucun destinataire (`staff-notifier.ts:49-56`) : le livreur
  lirait les alertes de compte et les demandes de contact des clients, et en
  éteindrait pour tout le monde (« le premier lecteur fait foi »). Un e2e
  prouve le 403. _Relu le 2026-10-07 : vrai à l'écriture. Plus tard le même
  jour (`ca152989f`, B5), une notice a pu être adressée par droit
  (`StaffNotice.audience`, `staff-notifier.ts`) ; le fil partagé — alertes de
  compte, demandes de contact — reste sous `staff_notifications:read`, et y
  marquer lu vaut pour tous. La décision tient ; l'e2e est
  `delivery-driver-role.e2e-spec.ts`._
- **Pas de valeur `StaffRole.livreur`.** Depuis `20260926120000_les_roles_se_lisent_en_base`,
  un rôle vit par sa clé texte (`role_key`) ; la colonne enum est promise au
  resserrage et ne s'élargit plus. Le rôle `livreur` est une ligne de
  `staff_role_definitions`, comme un rôle créé à l'écran.
- **Une seule valeur d'enum** : `StaffResource.delivery_driving`, dans sa
  migration seule (Postgres refuse de l'utiliser dans la transaction qui
  l'ajoute). La seconde migration pose le rôle et le droit de l'admin, au
  format exact que relit le test de parité (une instruction par
  `INSERT INTO|UPDATE "public"."staff_role_definitions"` en début de ligne,
  close au premier `;`).
- **État des lieux de la production avant la mise en ligne**, lu par Hugo :
  `SELECT key, grants FROM staff_role_definitions WHERE key = 'livreur';`.
  Vide attendu ; s'il existe déjà un rôle `livreur` créé à l'écran, la
  migration ne le réécrit pas (`ON CONFLICT DO NOTHING`) et on décide avant.
- `write` emporte `read` (`StaffAction`) : un seul droit suffit.
- L6-C4 (« le livreur n'a que `delivery_doorstep` ») est **remplacé** :
  `delivery_driving` maintenant, `delivery_doorstep` ajouté au même rôle au
  lot 6. Renvoi daté posé dans `plan-preparation-de-tournee.md`.

### MT-D2 v2 — L'affectation se fonde sur le droit, pas sur le nom du rôle

- La liste des livreurs proposés, et le refus de `assignDriver`, se fondent sur
  l'**effectif** `delivery_driving:write` résolu comme le guard le résout
  (rôle + dérogations) — pas sur la clé `livreur`. _[2026-10-07, audit B8 :
  et sur `delivery_doorstep:write`, les deux ensemble (`DriverAccess`) — un
  conducteur sans les gestes à la porte n'est plus proposé, et l'affecter
  rend 409 en nommant le droit.]_ Un admin qui conduit
  lui-même y figure ; un livreur dont une dérogation retire le droit n'y
  figure pas. La lecture de l'annuaire par la livraison est un usage de
  `staff` **au-delà de l'autorisation** : il passe par un port de lecture du
  bloc `staff`, dit comme tel.
- `driver_staff_id` : **sans clé étrangère**, comme `granted_by_staff_id`
  (la tournée vit dans `delivery`, l'annuaire dans `public`). Un livreur
  affecté qui a **perdu** le droit ou dont la fiche est suspendue : l'écran
  Tournées l'affiche « livreur sans accès — réaffecter », et la route du
  livreur le refuse de toute façon (le guard).

### MT-Q5 tranchée — La route du chargeur ne change pas

La route en service (`tournees/:roundId/depart`, sous `delivery_loading`)
**garde son comportement** : une tournée sans livreur peut partir par le
chargeur. Changer cette route bloquerait les tournées composées avant la mise
en ligne et ferait tomber ses e2e. C'est la route **du livreur** qui exige,
par construction, d'être affecté.

### MT-D3 v2 — Le mur est dans une commande à part

`DepartDeliveryRoundCommand` charge par `loadForDeparture(roundId)`, sans
livreur : le mur n'y a pas de place. Une **commande distincte**,
`DepartMyRoundCommand`, charge par `loadForDriverDeparture(roundId, staffId)`
(`WHERE driver_staff_id = $staff`) et appelle **le même** `depart` de
l'agrégat. Elles partagent le domaine, pas le handler. Pas de champ « mur
optionnel » dont l'absence voudrait dire « sans mur ».

La liste (`?date=`) et le détail utilisent **le même** `where` : un 404 sur le
détail ne doit pas contredire la liste.

Les refus de la route du livreur ont **leurs propres phrases**, qui disent
quoi faire : « 2 bacs ne sont pas chargés (Refuge 1950, Brasserie des
Marmottes) — appelez le dépôt » ; « la tournée a été modifiée au dépôt —
rechargez la page » (au lieu de la phrase de l'écran de composition).
_Bâties ainsi (relu le 2026-10-07, `delivery-driver-errors.ts`) : « Vous ne
pouvez pas partir : 2 arrêts ne sont pas chargés (Refuge 1950 (CMD-…),
Brasserie des Marmottes (CMD-…)) — appelez le dépôt. » ; « La tournée a été
modifiée au dépôt depuis que vous l'avez ouverte — rechargez la page. »_

### MT-D5 v2 — Ce qui est figé, ce qui est lu vivant

L'instantané du départ (`delivery_stop_execution`) ne porte **ni point GPS,
ni ordre, ni procédure, ni bacs**. Décision :

| Donnée                                      | Source                                                                                                                                                                                                                                                                                                                           | Pourquoi                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| adresse, contact, fenêtre, signature, notes | **l'instantané** après le départ, le port du commerce avant                                                                                                                                                                                                                                                                      | ce que le départ a promis au client                                                                         |
| **ordre de passage**                        | **figé au départ** : une colonne `departure_rank` sur `delivery_stop_execution` (migration additive)                                                                                                                                                                                                                             | L6-C11 : `closeStop` resserrera `position` au lot 6 ; la numérotation ne doit pas bouger pendant la tournée |
| **point GPS**                               | **figé au départ** : `gps_lat`, `gps_lng` sur l'instantané                                                                                                                                                                                                                                                                       | la navigation suit le point promis, pas le carnet corrigé en route                                          |
| **procédure** (étapes, photos)              | **lue vivante**, par un port neuf du commerce (`DeliveryProceduresReader`), photos par une route murée du livreur, port `DeliveryStepPhotosReader` (pas d'URL signées dans le dépôt, relevé le 2026-10-01 — relu le 2026-10-07 : la méthode existe dans `@lfd/storage`, `S3StorageService.ts`, sans aucun appelant dans `apps/`) | une consigne corrigée par le client doit atteindre le livreur                                               |
| bacs, froid                                 | **les tables de la livraison** (`delivery_bin`)                                                                                                                                                                                                                                                                                  | ce sont les siennes                                                                                         |

Les arrêts **déjà partis** avant cette migration n'ont ni rang ni point : la
vue retombe sur `position` et sur le point du carnet, et le dit
(« ordre et position non figés au départ »).

La note libre de la commande (`note`) part telle quelle : elle n'a pas de
montant par construction, mais son contenu n'est pas borné — c'est un champ
que le client écrit pour le livreur.

### MT-D7 v2 — La page d'arrivée

- Une entrée `delivery_driving:read → /livraison/ma-tournee` **en tête** de
  `LANDINGS` (`auth/permission.guard.ts`), et la racine redirige selon le
  droit. Sans elle, le garde laisse passer un staff sans atterrissage, qui
  ouvre toutes les pages et collectionne les 403.
  _Bâtie avec la nouvelle adresse (relu le 2026-10-07) : l'entrée est
  `delivery_driving:read → /coursier` (`auth/permission.guard.ts:17`) ; la
  racine mène aux comptes clients, dont le garde renvoie le livreur à cette
  première porte._
- Un test de route le prouve (`permission.guard.spec.ts`).

### Lots v2

| Lot     | Contenu                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MT1** | `StaffResource.delivery_driving` (migration seule) ; rôle `livreur` + droit admin (seconde migration, format parité) ; `ROLE_GRANTS`, libellés ; e2e : le livreur prend 403 sur la cloche, les commandes, le chargement, les tournées (liste nommée dans le test) |
| **MT2** | `driver_staff_id`, `assignDriver` fondé sur le droit effectif, port de l'annuaire, écran Tournées (affecter, « sans accès »)                                                                                                                                      |
| **MT3** | `departure_rank` et GPS figés au départ ; `DepartMyRoundCommand` ; les trois routes, même `where` ; port `DeliveryProceduresReader` ; vue projetée ; e2e du mur (404), phrases propres                                                                            |
| **MT4** | Page `/livraison/ma-tournee` (devenue `/coursier` le 2026-10-03), navigation, `LANDINGS`, test de route                                                                                                                                                           |
