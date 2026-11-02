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
  l'audit, commit à venir) : « Réceptionner » passe par l'agrégat
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
  (365)~~ — découpés le 2026-11-02 (commit à venir) : l'agrégat délègue ses
  lignes (`site-resupply-lines.ts`), ses refus d'envoi et d'annulation
  (`site-resupply-gates.ts`), son suivi (`site-resupply-progress.ts`) et ses
  entrées (`site-resupply-inputs.ts`), API publique inchangée ; le dépôt
  sort la recopie du colisage de l'ancien poste
  (`production-day-carried-packing.ts`). La suite
  `resupply-village-flow.e2e-spec.ts` sort ses étapes de la veille dans
  `resupply-village-scene.ts`.
- ~~La colonne morte `order_cutoff_settings.resupply_subject_to_cutoff`~~ —
  retirée le 2026-11-02 sur ordre de Hugo (commit à venir) :
  `20261102250000_le_reassort_sans_interrupteur`, retour dans
  `prisma/rollback/`.
- ~~Le semis de démonstration d'un réassort~~ — fait le 2026-11-02 (commit à
  venir) : `dev/seeding/village-resupply.seed.ts`, un « au plus tôt » du
  Village envoyé à 15 h le jour J par les vrais handlers, appelé par
  `placeToday` ; il attend « Lancer ».

## 4 bis. L'audit qualité du 2026-11-02

Corrigé (commit à venir), chacun avec son test de régression nommé :
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
- ~~**`site-resupply.ts` repasse à 339 lignes**~~ — 295 le 2026-11-02 (commit
  à venir) : le nom et les lignes de la demande en cours sortent dans
  `site-resupply-content.ts`, les refus des gardes dans
  `site-resupply-gate-errors.ts`.

## 4 ter. Le contrôle de l'audit, 2026-11-02 (commit à venir)

- La journée du fournil s'écrit **par différence** : `ProductionDay.changes`
  dit ce que chaque geste a touché, et `writeDayChanges`
  (`production/infrastructure/production-day-children.writer.ts`) n'écrit
  que ça — un lancement « au plus tôt » n'écrit plus que son réassort et le
  compte. Une journée de base inconnue (`fromSnapshot`) s'écrit en entier.
- La fiche de réassort retirée par une réouverture n'est plus effacée : elle
  porte `withdrawn_at` (migration additive
  `20261102270000_la_fiche_de_reassort_retiree`), un nouvel arrêt la
  rétablit. La liste des COMMANDES du colisage (`PrismaPackingListWithdrawal`)
  efface encore les siennes — hors de ce contrôle.
- L'annulation prend le verrou de la journée AVANT de charger le réassort
  (`SiteResupplyPlanKeyReader`) ; le lancement et la réception délèguent
  leurs lectures et leurs écritures (`ResupplyLaunchReading`,
  `ResupplyLaunchRecording`, `ResupplyReceiving`).

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
