# Le réassort — ce qui reste à faire

> **La seule liste du dossier.** Rassemblée le 2026-11-02 à partir des trois
> plans supprimés ce jour-là et de l'ancien README ; **chaque point a été
> vérifié dans le code le 2026-11-02** — un point qui y figurait encore mais
> s'est trouvé bâti n'est pas ici. Ce qui existe est décrit dans
> [`README.md`](README.md) ; les pistes tirées des systèmes du marché (invendus,
> ventes de la caisse, proposition de quantité) sont dans
> [`comparaison-systemes-du-marche.md`](comparaison-systemes-du-marche.md) §3. Un point pris se raye ici avec sa date et son
> commit, puis passe dans la doc d'état.

## 1. Décidé « plus tard » par Hugo

| Point                                                                                                                                                                                                                                                                                                                                                      | Décision                                                                                                                             | Date       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **Une rupture bloque la vente en ligne du jour, un stock faible avertit le client.** Aujourd'hui, `StockAlert` n'est lu que dans `b2b/resupply/` : aucune passation, aucune vitrine de la boutique ne le consulte. Le reste calculé (reçus − prélèvements) borne déjà la vente du jour ; reste à dire si une alerte déclarée doit encore peser par-dessus. | « ce qui permettrait déjà de bloquer les commandes, avertir » — « pas forcément pour aujourd'hui » ; renvoyé au circuit du jour même | 2026-10-21 |
| **Le réassort récurrent** (« le réassort habituel du mardi », pré-rempli). Le nom libre (« Vitrine du matin ») et les noms employés proposés en sont le premier pas, sans le décider.                                                                                                                                                                      | plus tard (Q-C1)                                                                                                                     | 2026-10-21 |
| **Le signalement d'un écart au fournil** (moins reçu qu'emballé). Aujourd'hui un écart se corrige sur la ligne à la réception, et rien ne remonte.                                                                                                                                                                                                         | plus tard (Q-C2)                                                                                                                     | 2026-10-21 |
| **Le droit par site** : qui tient `handover_counter` agit pour tout point. Le dépôt ne rattache pas un membre du staff à un point.                                                                                                                                                                                                                         | « on verra la granularité du droit plus tard »                                                                                       | 2026-10-21 |
| **Un coût interne du réassort** (valorisation du stock d'un site). Aucun montant n'existe nulle part ; ce serait un plan d'argent à part.                                                                                                                                                                                                                  | proposé « non » (Q-R5), jamais rouvert                                                                                               | 2026-10-14 |

## 2. Questions ouvertes

- **Aucun recours après l'arrêt.** Un « pour demain » arrivé après l'arrêt est
  refusé (`resupply.order.plan_stopped`, `bakehouse_after_stop`), et le
  retirage n'absorbe que des commandes. Le fournil n'a que « produire hors
  plan, puis envoyer et lancer au plus tôt le jour même ». Cela suffit-il, ou
  faut-il un ajout tardif ? (noté le 2026-10-21, non tranché)
- **Un contenant « réassort » au colisage** (un sac par point) : aujourd'hui
  le réassort part dans les bacs du transfert, sans contenant au colisage.
  En vouloir un demanderait `container.resupply_id` + CHECK. (2026-10-21,
  non tranché)
- **« Monté » à un point servi par transfert** : seul l'écran le réserve aux
  points servis sur place ; le serveur l'accepte
  (`b2b/resupply/application/mark-resupply-mounted.handler.ts:22`). Choix du
  bâtisseur faute d'écrit (2026-10-22) : faut-il le refuser ?
- **L'arrêt relit toute la liste des réassorts sous le verrou de la
  journée** (lecture d'un autre bloc, verrou tenu) plutôt que « lire avant,
  relire les annulations ». Choix du bâtisseur (2026-10-21), à confirmer.

## 3. Limites connues, non corrigées

- ~~**La course annuler / réceptionner**~~ — fermée le 2026-11-02 (G1 de
  l'audit, `63e1797ab`) : « Réceptionner » passe par l'agrégat
  (`SiteResupply.assertReceivable`) et le SAUVE sous sa version avant le
  reçu ; l'annulation et l'arrivée par transfert, qui sauvent aussi sous la
  version lue, échouent alors en 409. E2E à deux transactions dans
  `resupply-receipt.e2e-spec.ts`.
- **« Réceptionné » n'apparaît pas à Prod manager** : la carte « Au plus
  tôt » lit `SiteResupplyView`, qui ne porte pas la réception ; elle
  s'arrête à « Arrivé ».
- **Un « au plus tôt » sans véhicule libre** : la cloche sonne une fois
  (`AsapTransferDispatch.place`) ; le placement ne se rejoue qu'à la
  composition ou à l'affectation à la main.
- **La réserve du colisage naît au traitement du fait**, pas à l'instant du
  lancement : une commande mise au bac entre les deux garde ses pièces, et la
  fiche attend le four. Depuis le 2026-11-02 (C1), la réserve est DATÉE du
  lancement (`launchedAt` du fait) : l'ordre « servi le premier » entre deux
  réassorts ne dépend plus de la livraison du fait.
- **La cloche « Réassort arrivé » ne cible pas le point** : `StaffNotice`
  n'adresse qu'un droit, tout le comptoir l'entend.
- **Un transfert vidé par la réouverture** garde son arrêt dans la tournée
  s'il était placé.
- **Une alerte de stock ne rafraîchit pas l'onglet Stock** : `site_stock_alert`
  ne porte pas de jour et n'a pas de déclencheur `day_change`.
- **Le décalage de l'arrêt** à la plus tardive des heures (balayage des
  paiements, confirmation des commandes, liste à coliser, composition des
  tournées, dossier du jour) n'est éprouvé de bout en bout que par les deux
  parcours `resupply-village-flow` et `resupply-labo-flow` ; aucune e2e ne
  vise chacun de ces effets à part. Non revérifié le 2026-11-02.

## 4. Dette de code

- ~~`site-resupply.ts` (465 lignes) et `prisma-production-day.repository.ts`
  (365)~~ — découpés le 2026-11-02 (`ae8a79414`) : l'agrégat délègue ses
  lignes (`site-resupply-lines.ts`), ses refus d'envoi et d'annulation
  (`site-resupply-gates.ts`), son suivi (`site-resupply-progress.ts`) et ses
  entrées (`site-resupply-inputs.ts`), API publique inchangée ; le dépôt
  sort la recopie du colisage de l'ancien poste
  (`production-day-carried-packing.ts`). La suite
  `resupply-village-flow.e2e-spec.ts` sort ses étapes de la veille dans
  `resupply-village-scene.ts`.
- ~~La colonne morte `order_cutoff_settings.resupply_subject_to_cutoff`~~ —
  retirée le 2026-11-02 sur ordre de Hugo (`ae8a79414` pour le code,
  `e0ee9e2e4` pour la migration) :
  `20261102250000_le_reassort_sans_interrupteur`, retour dans
  `prisma/rollback/`.
- ~~Le semis de démonstration d'un réassort~~ — fait le 2026-11-02
  (`ae8a79414`) : `dev/seeding/village-resupply.seed.ts`, un « au plus tôt » du
  Village envoyé à 15 h le jour J par les vrais handlers, appelé par
  `placeToday` ; il attend « Lancer ».

## 4 bis. L'audit qualité du 2026-11-02

Corrigé (`63e1797ab` ; la migration d'index seule dans `928a5b3bc`), chacun avec son test de régression nommé :
G1 (ci-dessus) ; G-A (le lancement lit les commandes SOUS le verrou) ; C-D
(une fournée se déclare sous le verrou de la journée, relue) ; C1 (réserve
datée du lancement) ; C2 (« Déclarer une rupture » concurrent : 409
`declared_meanwhile`) ; C4 et M-B (migration additive
`20261102260000_le_reassort_lu_par_index`) ; C-A, C-B, C-C (une clé d'écran
par composition : l'envoi du fournil et la création d'un brouillon en font
leur identifiant, une clé prise ailleurs est refusée en 409
`resupply.sending_key.taken` / `resupply.bakehouse_draft.key_taken`) ; M1
(l'heure du réassort lue sous le verrou) ; M2 (alertes levées en une
lecture) ; M3 (prélèvements lus une fois par baisse) ; M4 (les lignes ne se
réécrivent que si elles ont changé) ; M5 (rendre plus qu'emballé est refusé
nommément) ; M6 (un transfert parti lit ses réassorts en une fois) ; M-A
(la journée du fournil écrit ses enfants en lots) ; M-C (la liste des
brouillons ouverts est bornée à 100) ; M-E (les lignes d'une fiche du
colisage en une requête).

Laissé, et pourquoi :

- **M7** — `asapToLaunch` ne filtre pas le déjà lancé, délibérément :
  l'agrégat du fournil refuse un second lancement en le nommant (409) ;
  filtrer au commerce le changerait en 404.
- **M-D** — le domaine importe `@lfd/contracts`, dont le baril charge Zod
  (`site-resupply.ts` l'importe au niveau du module). C'est le cas de ~495
  fichiers de domaine du backend (compté le 2026-11-02) : un sous-chemin sans
  Zod pour quatre fichiers ferait une seconde convention. À trancher pour
  tout le dépôt.
- **`site-resupply.ts` au-dessus de 300 lignes** : 339, ramené à 295 le
  2026-11-02 (`3968aa218` : le nom et les lignes de la demande en cours
  sortent dans `site-resupply-content.ts`, les refus des gardes dans
  `site-resupply-gate-errors.ts`), il est remonté à **308** avec les
  corrections de `83df1eacb` (`assertReceivable`, le sans-commande) —
  mesuré le 2026-11-03. Encore à découper.

## 4 ter. Le contrôle de l'audit, 2026-11-02 (`3968aa218`)

- La journée du fournil s'écrit **par différence** : `ProductionDay.changes`
  dit ce que chaque geste a touché, et `writeDayChanges`
  (`production/infrastructure/production-day-children.writer.ts`) n'écrit
  que ça — un lancement « au plus tôt » n'écrit plus que son réassort et le
  compte. Une journée de base inconnue (`fromSnapshot`) s'écrit en entier.
- La fiche de réassort retirée par une réouverture n'est plus effacée : elle
  porte `withdrawn_at` (migration additive
  `20261102270000_la_fiche_de_reassort_retiree`), un nouvel arrêt la
  rétablit ; deux déclencheurs tiennent en base qu'une fiche retirée n'a
  aucune ligne emballée (`20261102290000_la_fiche_retiree_jamais_emballee`,
  `0a5eef1ce`). La liste des COMMANDES du colisage
  (`PrismaPackingListWithdrawal`) efface encore les siennes : voir §4
  quinquies.
- L'annulation prend le verrou de la journée AVANT de charger le réassort
  (`SiteResupplyPlanKeyReader`) ; le lancement et la réception délèguent
  leurs lectures et leurs écritures (`ResupplyLaunchReading`,
  `ResupplyLaunchRecording`, `ResupplyReceiving`).

## 4 quater. Les tranches 1 et 2 de l'audit pour 9/10, 2026-11-02 (`83df1eacb`)

Corrigé, chacun avec son test de régression : « Réceptionner » refusé sur un
sans commande ; le code `resupply.order.reserve_not_today` (était
`packing.…`) ; D3 (un brouillon du fournil garde son point), D4 (« Monté »
n'est pas offert à une sortie de réserve), D5 (le double clic sur
« Envoyer » rend 204) ; l'envoi prend le verrou avant de charger ; un geste
relu sans son auteur entier est refusé (`resupply.row.unreadable`) au lieu
d'être comblé de vide ; le refus d'une réception concurrente nomme le geste
gagnant ; une seule trace (`ResupplyTrace`), une forme de ligne
(`ResupplyLineShape`), un compte par (article, unité) (`StockTallies`) ;
les lignes d'un reçu écrites par différence ; l'index `(site_id, name)`
(migration additive `20261102280000_les_noms_du_reassort_par_index`,
`0a5eef1ce`, retour dans `prisma/rollback/`) ; le `:sku` du chemin validé ; les gestes du sans
commande renommés `*UnorderedReceiptLine*` ; `site-resupply.spec.ts`
découpé (les gardes dans
`apps/lfd-api/src/b2b/resupply/domain/__tests__/site-resupply-gates.spec.ts`,
les données communes dans
`apps/lfd-api/src/b2b/resupply/domain/__tests__/site-resupply-fixtures.ts`).

Laissé, et pourquoi :

- **`isUniqueViolation` reste dans `platform/database/json-columns.ts`** :
  l'en-tête du fichier l'annonce (« et des refus d'unicité de Prisma »), et
  le déplacer toucherait huit lecteurs de six autres contextes (PIM,
  médiathèque, ops, offres, opérations) — hors du réassort.
- **`resupply.prisma` garde deux écarts, écrits au-dessus des colonnes** :
  `launched_at`/`departed_at` en `Timestamptz` (aligner réécrirait la
  colonne) et le défaut `version = 0` du reçu (jamais écrit).

Après, le même jour et le lendemain :

- **Les noms déjà employés se rangent par instant d'envoi** (`d99fac379`) :
  depuis la clé d'envoi, l'identifiant d'un réassort est la clé tirée par
  l'écran, plus un ULID ordonné par le temps.
- **La garde de réouverture** (`2b6ff7197`) : les gestes du colisage
  (contenant, « Proposer », mettre au bac, fermer, saisir et clore une fiche
  de réassort) et de la livraison (charger un bac, faire partir une tournée)
  prennent le plan sous le verrou partagé (`ArrestedPlanHold`). Trois états
  — arrêté, rouvert, jamais arrêté : le colisage exige « arrêté », la
  livraison ne refuse que « rouvert »
  ([`../fournil/arret-du-plan.md`](../fournil/arret-du-plan.md)).

## 4 quinquies. Reste à faire du colisage

- **Retirer par statut les fiches de COMMANDE du colisage** à la réouverture,
  comme les fiches de réassort (`withdrawn_at`) : `PrismaPackingListWithdrawal`
  les efface encore, pierres tombales comprises
  ([`../colisage/colisage.md`](../colisage/colisage.md) §4.7). La colonne
  `packing_order.withdrawn_at` dit déjà « retirée par le commerce » ; une
  colonne à part (`unlisted_at`) est proposée — **décision de Hugo en
  attente** (noté le 2026-11-03).
- **Corrigé le 2026-11-03 (audit final, section C)** : les deux abonnés à la
  réouverture tiennent le plan (`ArrestedPlanHold`) au lieu de lire
  `ClosedPlansReader` sans verrou (e2e `reopened-fact-rearrest-race`) ; la
  livraison juge une tournée partie sous verrou et sort les réassorts sous le
  verrou des transferts du jour ; mettre au bac tient le bac
  (`BinDesk.holdLiveBin`) ; une réserve à découvert se refuse à la relecture.
  **Pas d'e2e de course pour le bac** : aucun chemin n'annule un bac du
  colisage sans le verrou de sa feuille, la course n'a pas de geste réel pour
  la jouer (vérifié le 2026-11-03).
- **Les lectures du poste** (`ListPackingResuppliesHandler`,
  `PrismaPackingBoardReader`) restent sans transaction commune : en
  `READ COMMITTED` elle ne donnerait pas une photo commune ; il faudrait une
  unité de travail en `REPEATABLE READ`, que la plateforme n'offre pas.

## 4 sexies. L'audit final, section B — le fournil (2026-11-03)

Corrigé, chacun avec son test de régression :

- **L'heure limite n'est plus contournable par course** : l'arrêt la
  reprend sur la journée RELUE sous le verrou (`PlanArrestAdmission`,
  [`../fournil/arret-du-plan.md`](../fournil/arret-du-plan.md)). L'e2e
  `production-day-close-race` tient la réouverture et l'arrêt en file
  derrière un verrou tenu (`test/day-lock-race.ts`) ; il est rouge sur
  l'ancien code (201 au lieu de 409), vérifié le 2026-11-03.
- **Révision d'une commande inscrite un autre jour** : refus nommé
  (`production.revision.inscribed_another_day`).
- **Refaire le compte par-dessus une coche de l'ancien poste** : l'agrégat
  le refuse (`assertChecksCarried`) au lieu d'une phrase dans l'adaptateur.
- **L'annulation d'une fournée** lit son nombre de lignes touchées ; absente,
  c'est `production.batch.cancel_missing` (e2e `production-batch-cancel`).
- La doc du port de la journée dit ce que `save` fait (verrou de ligne
  seulement ; colisage recopié, pas remis à zéro) ; `assertNeverArrested`
  s'appelle `assertNotReopened` ; les lectures de la journée sont ordonnées ;
  les deux adaptateurs d'état ont chacun leur fichier ; les champs de charge
  utile et les lignes de réassort partagés vivent à la racine des canaux.
- Specs : la clôture (749 lignes) en cinq specs sur une scène, le retirage
  et l'agrégat découpés, une fixture `producibleOrder` partagée, une spec par
  service (`plan-arrest-admission`, `plan-intake-reading`,
  `plan-arrest-recording`, `retake-recording`, `resupply-launch-services`).

Laissé, et pourquoi :

- **Un `durable.publish` par commande sous le verrou exclusif** (arrêt,
  retirage) : la boîte d'envoi n'a pas d'écriture en lot ; l'ajouter change
  le port de `platform/` et ses sept doubles, dont trois au commerce.
- **Dans la course de l'heure limite, le balayage a déjà tourné** quand le
  refus tombe : il tranche les règlements en l'air d'une journée qu'on
  croyait arrêtée. Le déplacer sous le verrou ferait écrire le commerce sous
  le verrou du fournil.
- **`openedByLaunch` reste déduit** d'une égalité d'instants : le stocker
  demande une colonne (migration), non faite ; le cas où il ment est écrit
  au type.
- **Specs du fournil encore au-delà de 300 lignes**, hors du périmètre de
  l'audit : `day-dossier-pdf.spec.ts` (626), `run-auto-close-round` (420),
  `production-worksheet.spec.ts` (401), `get-production-forecast` (320),
  `get-production-worksheet` (314), `render-quality-check` (301).

## 4 septies. L'audit final, section A — le commerce (2026-11-03)

Corrigé, chacun avec son test de régression :

- **Double clic, une seule politique** (E2) : un geste déjà fait avec la
  même intention rend succès sans effet — « Réceptionner » un réassort déjà
  reçu, « Envoyer » un brouillon du fournil déjà envoyé (rend l'id du
  réassort créé), ajouter au sans-commande le même article à la même
  quantité. Course de deux clics : le perdant bute sur la version, relit
  hors de sa transaction défaite, et rend succès si le gagnant a fait le
  même geste.
- **Le réassort sans commande ne se saisit qu'aujourd'hui** (E1,
  `resupply.receipt.unordered_not_today`).
- **Un critère pour proposer et valider un article** (E4, `isShownAsTile`).
- **La demande du comptoir a une borne** (200 articles,
  `resupply.order.too_many_lines`) ; **`restore` refuse un état impossible**
  (`resupply.order.impossible_state`) ; les lectures sous verrou passent en
  objets nommés.
- **Clé, verrou, chargement** pour la correction d'un reçu réceptionné ;
  **le nom** se repose sur la demande relue quand un ajout l'a croisé ;
  **la clé d'envoi** se relit avant le catalogue ; **le lancement écarté**
  d'un réassort annulé est journalisé.
- La Supervision lit les prélèvements une fois pour la journée ; l'arrivée
  par transfert lit ses réassorts en une fois (`ResupplyArrival`, partagé
  avec « Monté ») ; `PrismaShelfDrawsReader` est relié par
  `apps/lfd-api/src/appBootstrap/shelf-draws-feed.module.ts` ; les adaptateurs du fournil
  (`ProductionDayResupplies`, `ProductionRangeResupplies`) sont rangés en
  `infrastructure/`.
- Specs : plus aucune au-delà de 300 lignes dans `b2b/resupply` ; un jeu
  d'articles partagé (`apps/lfd-api/src/b2b/resupply/application/__tests__/resupply-articles.ts`) ; plus d'horloge murale.

Choix assumé, pas une dette :

- **« Ajouter une ligne » au comptoir CUMULE** (E3) : un second ajout du
  même article additionne sa quantité, double clic compris. Hugo l'a voulu
  « un clic » : le comptoir ajoute en plein service, et la quantité se
  corrige d'un geste. Ce n'est donc PAS la politique E2.

Laissé, et pourquoi :

- **Le domaine importe le baril `@lfd/contracts`, qui tire Zod** (E5,
  M-D) : 432 fichiers de `domain/` hors tests (560 avec les tests) dans
  `apps/lfd-api/src` l'importent, dont 4 au réassort (compté le
  2026-11-03). C'est une décision de dépôt — un point d'entrée sans Zod
  pour les types et les fonctions pures —, pas une correction du réassort.
- **Les quatre lecteurs de la table `site`** restent en Prisma direct : même
  bloc `b2b`, un seul écrivain (`b2b/sites`), la raison est écrite et datée
  au-dessus de chacun.
- **La levée des alertes à la réception** sauve alerte par alerte : chacune
  sous sa version, dans la transaction de l'appelant ; un lot perdrait le
  refus par alerte.

## 5. Décidé, puis abandonné

Pour qu'on ne les rebâtisse pas en croyant qu'ils manquent :

- **Le réassort comme une `Order`** (option A) — abandonné pour l'agrégat à
  part (2026-10-21).
- **Un identifiant préfixé** dans les lecteurs du fournil — remplacé par des
  ports et des tables à part, jamais mêlés à `ProducibleOrder`.
- **« Les mêmes limites produit que les commandes »** (quantités, multiples) —
  elles n'existaient pas (`vitruve`, 2026-10-14) ; seule l'heure du réassort
  s'applique.
- **Le droit `lfc_site_resupply`** et une entrée « Réapprovisionnement » sous
  Commandes — remplacés par `handover_counter` (le comptoir du bandeau) et
  `production_resupply`.
- **Le « plan live » jamais figé** pour les deux visées (2026-10-21) —
  remplacé le même jour : « pour demain » entre au plan figé, « au plus tôt »
  est lancé.
- **Le fait `packing.resupply_packed`** — remplacé par le lecteur
  `PackedResuppliesReader`, lu à la réception et au départ.
- **Le retirage qui absorberait les réassorts** — aucun ne peut arriver après
  l'arrêt ; le lancement est un geste à part.
- **Le Labo au colisage** (Q1 du 2026-10-21) — révisé le même jour : seul un
  point servi par transfert passe au colisage.
- **Le bouton « Lancer un réassort au plus tôt » des alertes du fournil** et le
  `POST admin/site-resupplies/sites/:siteId` d'un seul tenant — retirés au lot
  R1d : le fournil envoie son propre réassort.
- **La section « Réassorts » du dossier du jour** — remplacée par un bon de
  réassort par réassort (R3d-bis).
- **L'interrupteur « soumis à l'heure limite / sans limite »** — remplacé par
  l'heure du réassort (R3a).
