# Plan — les mots vrais entre le fournil et le colisage

> Plan du 2026-11-15, **v3** (v1 contredite par `vitruve` le même jour : la
> branche `legacy` est morte, il faut la retirer, pas la renommer ; v2
> contredite : l’adaptateur doit continuer d’écrire `packing`, le bail du
> relais, le retour arrière, l’accord sur le schéma). Pas
> commencé. Porte un retrait de colonne et un renommage de valeurs stockées
> (noms d'abonnés durables) : `vitruve` avant le bâti, le lecteur de migrations
> avant tout push. Pré-release (CLAUDE.md §0, décision de Hugo du
> 2026-10-04) : un contrat se casse dans le même déploiement.

## 1. En simple

Entre le fournil et le colisage, deux faits portent un vrai geste à deux, et
ils restent : **la remise** (`production.handed_to_packing`) et **le retour**
(`production.return_requested`, demande ; `packing.returned`, réponse). La
remise appartient au fournil, qui coupe une fournée entre la part du colisage
et la part gardée pour un réassort servi sur place
(`atelier/domain/services/on-site-share.ts`) ; publier seulement « fournée
sortie » obligerait le colisage à refaire cette coupe. Le retour est une
négociation : une fournée remise a peut-être déjà été mise au bac.

Ce qui ment, ce sont des mots qui ne disent plus rien de vrai :

- **`legacy` / `PackingOwner`** : « qui colise cette journée, l'ancien poste ou
  le colisage ». L'ancien poste est retiré depuis le 2026-10-05 (K3c), toute
  journée arrêtée depuis le 2026-10-04 (K2) porte `packing`, et une fournée ne
  se déclare que sur une journée arrêtée. La branche `legacy` de l'annulation
  ne sert donc qu'aux journées arrêtées avant K2 — et **la production n'en a
  aucune qui porte une fournée** (requête de Hugo du 2026-11-15 : aucune
  ligne). C'est du code mort : on le retire.
- **`packing.shadow.*`** : trois abonnés et un port (`PackingShadowLedger`)
  nommés d'après « l'ombre », le colisage en double du temps de K1, retirée
  en K3c. On les renomme.
- **L'identifiant d'une demande de retour** : le fait et le schéma annoncent
  `return-<fournée>-<n>`, le code écrit `return-<ULID>`.

## 2. Ce qui existe (ouvert le 2026-11-15, relu par `vitruve`)

- `production/day/domain/value-objects/packing-owner.ts` : `PackingOwner`.
  L'agrégat (`day/domain/entities/production-day.ts`) : `open` pose `legacy`
  (:63), `close` (:142) et `launchResupply` (:232) posent `packing`, `reopen`
  ne le touche pas. État, snapshot, index : `production-day.state.ts:36,106,181`,
  `production-day.snapshot.ts:203`, `day/index.ts:54`. Lecture
  `day/infrastructure/production-day.row.ts:101`, écriture
  `prisma-production-day.repository.ts:93`. Colonne
  `production.production_day.packing_owner`, `DEFAULT 'legacy'`, CHECK
  `IN ('legacy','packing')` (migration `20261004180000_la_remise_au_colisage`).
- Une fournée ne se déclare que sur une journée arrêtée : `itemToMark` lève
  `ProductionDayNotClosedError` (`day/domain/entities/production-day.batches.ts:138-141`).
- L'annulation : `atelier/application/commands/cancel-batch.handler.ts:58-65`
  — `packing` → `requestReturns` (demande au colisage) ; sinon annulation
  synchrone puis `takeBack`. `takeBack`
  (`atelier/application/services/packing-handoffs.service.ts:95-118`) n'a que
  cet appelant, et publie `legacy: owner === "legacy"` (:114), toujours vrai.
- Le fait : `production/channels/packing/return-requested.event.ts`, champ
  `legacy` (:39, écrit :58, exigé `boolean` et `handoffId` exigé si `!legacy`
  :83-102). L'abonné `packing/application/handlers/on-return-requested.handler.ts:43`
  : `!legacy` → guichet des retours (`desk.receive`) ; `legacy` → reçu
  `kind: "return"` sur `PackingShadowLedger` (:54-61), seul écrivain de ce
  `kind` (grep hors tests).
- Les abonnés : `ON_PACKING_LIST_DRAWN = "packing.shadow.draw-list"`
  (`on-packing-list-drawn.handler.ts:16`), `ON_RETURN_REQUESTED =
"packing.shadow.apply-return"` (`on-return-requested.handler.ts:17`),
  `ON_HANDED_TO_PACKING = "packing.shadow.receive-handoff"`
  (`on-handed-to-packing.handler.ts:17`). Le « reçu » d'une livraison est la
  ligne `platform.outbox_delivery (event_id, subscriber)` elle-même
  (`platform/outbox/prisma-outbox-relay-store.ts:65-72`) ; aucune autre table
  ne porte le nom d'abonné (`vitruve`, grep). Clé primaire seule, pas de FK.
  En production le 2026-11-15 : `packing.shadow.draw-list` 5 lignes,
  `packing.shadow.receive-handoff` 3, toutes livrées (Hugo).
- Le port `PackingShadowLedger` (`packing/domain/ports/packing-shadow.ledger.ts`),
  son adaptateur `prisma-packing-shadow.ledger.ts`, ses doubles
  `application/__tests__/shadow-doubles.ts` et la spec
  `handlers/__tests__/shadow-subscribers.spec.ts`.
- Les abonnés sont figés à l'écriture d'un fait (`platform/outbox/prisma-outbox.ts:41-52`) ;
  le relais cherche l'abonné par son nom à la livraison et laisse une ligne
  au nom inconnu en lettre morte après dix essais (`outbox-relay.ts:78-84`).
  La CI applique les migrations quelques secondes avant de basculer l'image
  (`.github/workflows/deploy_lfd_api.yml:374-379`).
- Docs qui le disent : `documentation/colisage/colisage.md:119-121`,
  `:333-340` (§4.6, `legacy`), `:500-504` (« à supprimer sur ordre de Hugo »),
  `:544-545` ; `documentation/fournil/arret-du-plan.md:100` ;
  `documentation/README.md:338` (ligne d'index de ce plan).

## 3. Ce qui change — deux déploiements

### Lot A — le code (colonne gardée, plus lue)

1. **La branche `legacy` sort.** `cancel-batch.handler` ne garde que le chemin
   « demande de retour » ; `takeBack` et son paramètre `owner` disparaissent ;
   `PackingOwner`, ses constantes, le champ de l'agrégat, de l'état, du
   snapshot et de l'index disparaissent ; l'adaptateur ne lit plus la colonne
   et **écrit toujours `'packing'`** à chaque enregistrement d'une journée
   (`vitruve`, v2 : sans cela, `DEFAULT 'legacy'` remplirait toute journée
   arrêtée après le lot A, et la garde du lot B refuserait le premier jour
   de production). Ainsi une journée `legacy` reste ce qu'elle est
   aujourd'hui : jamais enregistrée depuis l'arrêt K2, donc sans fournée.
   Doubles et specs : `legacy-day-doubles.ts`, `closed-day-doubles.ts:62,71`,
   `production-day-packing-owner.spec.ts`, `production-day-launch.spec.ts` ;
   les e2e `test/resupply-launch.e2e-spec.ts:99-102` et
   `test/dev-seed-packing.e2e-spec.ts:68-70` lisent la colonne par Prisma et
   restent vrais (elle vaut `'packing'`), le lot B les retire.
2. **Le fait de retour est toujours une demande.** `ReturnRequestedEvent` perd
   `legacy` ; `handoffId` y devient obligatoire. Pour ce seul déploiement,
   `durableFact()` écrit encore `legacy: false` : l'image précédente, qui
   tourne pendant la fenêtre de bascule ou après un retour arrière, exige ce
   booléen (`return-requested.event.ts:91-96`) — le lot B le retire.
   `fromPayload` ignore `legacy`. L'abonné du colisage n'a plus que le chemin
   du guichet ; le `kind: "return"` du registre de réception n'a plus
   d'écrivain (les reçus déjà posés gardent leur valeur : une valeur stockée
   n'est pas un nom).
3. **L'ombre sort des noms.** Abonnés : `packing.receive-handoff`,
   `packing.apply-return`, `packing.draw-list` (aucune collision : les autres
   s'appellent `packing.draw-resupply`, `packing.draw-launched-resupply`…).
   Port et adaptateur : `PackingShadowLedger` → `PackingIntakeLedger` (ce que
   le colisage reçoit du fournil : remises et listes). Une vingtaine de
   fichiers suivent : `shadow-doubles.ts` et la quinzaine de specs de
   `packing/application/**/__tests__/` qui l'importent, `packing.module.ts`,
   `packing-resupply-listing.ts`, `packing-list-withdrawal.ts`,
   `test/packing-reopen-withdrawal-race.e2e-spec.ts`, et les plans qui les
   citent (`commandes/annulation/plan-annulation-apres-production.md`,
   `formules/plan-tarification-des-formules.md`).
   Migration de données, même déploiement :

```sql
SET lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM platform.outbox_delivery
              WHERE subscriber LIKE 'packing.shadow.%'
                AND (delivered_at IS NULL OR claimed_until > now())) THEN
    RAISE EXCEPTION 'Un fait vers un abonné packing.shadow.* n''est pas livré (en attente ou en lettre morte) : le livrer ou le rejouer avant de déployer.';
  END IF;
END $$;
UPDATE platform.outbox_delivery
   SET subscriber = 'packing.' || substring(subscriber FROM length('packing.shadow.') + 1)
 WHERE subscriber LIKE 'packing.shadow.%';
```

La garde refuse aussi une lettre morte ancienne : voulu, elle se rejoue
d'abord (écran des lettres mortes). Aujourd'hui : aucune (requête de Hugo).

4. **La fenêtre de bascule**, dite plutôt que tue : entre la migration et la
   nouvelle image, l'ancienne image peut encore écrire un fait vers un nom
   `packing.shadow.*`, que la nouvelle ne connaîtra pas. En pré-release, sans
   activité, c'est improbable ; le lot B le rattrape (ci-dessous).
5. **Docs** : `colisage.md` (les quatre passages), `arret-du-plan.md:100`, la
   ligne d'index `README.md:338`, au présent ; la doc de l'identifiant de
   retour dans `return-requested.event.ts`. Le commentaire `///` de
   `production.prisma:352` dit la même chose fausse : `production.prisma` ne
   se touche pas sans l'accord de Hugo — signalé au rapport, corrigé avec le
   lot B s'il l'accorde.

### Lot B — la base (après le déploiement du lot A, sur ordre de Hugo)

**Le lot B n'existe qu'avec l'accord de Hugo sur `production.prisma`.** Un
`DROP COLUMN` sans retirer `packingOwner` du modèle casserait toute lecture de
`productionDay` sans `select` (le client généré nomme chaque colonne). Sans
cet accord, la colonne reste, écrite à `'packing'` et lue par personne, et le
lot B se réduit au rattrapage des abonnés (ses deux UPDATE) et au retrait de
`legacy: false` du fait.

```sql
SET lock_timeout = '5s';
-- La fenêtre du lot A : un fait écrit par l'ancienne image vers un nom
-- packing.shadow.* est renommé et remis en file (bail compris).
UPDATE platform.outbox_delivery
   SET subscriber = 'packing.' || substring(subscriber FROM length('packing.shadow.') + 1),
       attempts = 0, next_attempt_at = now(), last_error = NULL, claimed_until = NULL
 WHERE subscriber LIKE 'packing.shadow.%' AND delivered_at IS NULL;
UPDATE platform.outbox_delivery
   SET subscriber = 'packing.' || substring(subscriber FROM length('packing.shadow.') + 1)
 WHERE subscriber LIKE 'packing.shadow.%';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM production.production_day d
              WHERE d.packing_owner = 'legacy'
                AND EXISTS (SELECT 1 FROM production.production_batch b
                             WHERE b.service_day = d.service_day)) THEN
    RAISE EXCEPTION 'Une journée legacy porte des fournées : la colonne packing_owner ne peut pas partir.';
  END IF;
END $$;
ALTER TABLE production.production_day DROP COLUMN packing_owner;
```

Le modèle Prisma perd `packingOwner` (et le commentaire de :352 est corrigé)
— c'est `production.prisma`, donc sur accord de Hugo ; le fait de retour
cesse d'écrire `legacy: false` ; les deux e2e qui lisaient la colonne perdent
cette assertion. Retour arrière : **obligatoire** avant de rebasculer une
image d'avant le lot B — recréer `packing_owner text NOT NULL DEFAULT
'packing'` avec son CHECK ; une image d'avant le lot A ne se récupère plus
(son `fromPayload` exige `legacy`), seule celle du lot A.
Un rejeu manuel d'une ancienne lettre morte `legacy: true` sans `handoffId`
est refusé après le lot A : voulu, il n'en existe aucune non livrée.

## 4. Ce qui ne change pas

- La remise, le registre des remises et le protocole de retour : c'est le
  fournil qui décide, et deux postes qui négocient.
- La collecte d'événements dans les agrégats : aucun agrégat du dépôt n'en a,
  les fournées s'écrivent par un dépôt ciblé (justification écrite au-dessus
  de `ProductionBatchRepository.cancel`). Hors de ce plan.

## 5. Tests

- Annulation d'une fournée remise : toujours une demande, jusqu'à
  `packing.returned` (e2e, bout en bout) ; d'une fournée jamais remise :
  annulée tout de suite, rien au colisage.
- Fait : `fromPayload` d'une charge neuve, d'une charge avec `legacy: false`
  (lot A et anciennes), refus d'une charge sans `handoffId`.
- Abonnés : le colisage s'inscrit sous les nouveaux noms ; la migration A
  éprouvée en e2e sur une base où une ligne `packing.shadow.*` non livrée
  existe — elle échoue en le disant ; sur une base propre, elle renomme.
- Lot B : la garde éprouvée sur une journée `legacy` avec fournée — elle
  échoue en le disant.
