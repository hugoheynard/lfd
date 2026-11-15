# Plan — la fin des coches de la fiche d'atelier

> Plan du 2026-11-15, ordonné par Hugo. **Lot A bâti et déployé en production le 2026-11-15** (`8fae69f58`) ; le lot B peut partir, sur ordre de Hugo. Termine la bascule des fournées
> décrite dans [`la-fiche-d-atelier.md`](la-fiche-d-atelier.md). Porte une
> suppression de colonnes : `vitruve` avant le bâti, le lecteur de migrations
> avant tout push.

## 1. En simple

Une ligne de la fiche d'atelier avance par **fournées** depuis le
2026-09-28 ; l'ancienne **coche** (« fait / pas fait ») est encore lue en
secours et encore acceptée par deux routes que plus aucun écran n'appelle.
Mesuré en production le 2026-11-15 par Hugo : **aucune ligne cochée n'est sans
sa fournée** (`count = 0`). Il n'y a donc rien à reconvertir : on retire la
coche du code, puis de la base.

## 2. Ce qui existe (vérifié le 2026-11-15, relu par `vitruve`)

- Colonnes `production.production_count.done_at`, `done_by`,
  `done_initials` (`done_initials` est `NOT NULL DEFAULT ''`,
  `prisma/schema/production.prisma:263-267`).
- Les lecteurs de la colonne, tous dans `src/production/` :
  `day/infrastructure/production-day.row.ts` (select `:64-66`, lecture `:150`),
  `day/domain/services/production-output.ts` (`implicitBatchesOf`, la coche lue
  comme fournée implicite, `:41-57`), `domain/…/production-day.reopening.ts:40`
  (une coche bloque la réouverture), `atelier/application/commands/record-batch.handler.ts`
  (matérialisation avant la première fournée), et les commandes
  `mark-worksheet-line` / `unmark-worksheet-line` derrière les routes
  `PUT`/`DELETE …/worksheet/:date/lines/:sku/done`
  (`atelier/http/production-worksheet.controller.ts:131,154`). Aucun appel du
  back-office. Le colisage, le réassort, le dossier PDF et la révision ne
  lisent pas la colonne.
- Les tests qui l'écrivent ou citent les fournées `backfill-` :
  `test/production-batches-transition.e2e-spec.ts:84`, les specs
  `production-output`, `production-day-batches`, des handlers de fournée, de
  ligne, de colisage, de partage sur site, de retirage, et le semis
  `dev/seeding/today.seed.ts`.
- **Ce qui reste** : le champ `doneAt` du contrat
  (`packages/contracts/src/production-worksheet.ts:96`, lu par
  `supervision/preparation-shelves.ts`) est calculé depuis la fournée qui
  complète la ligne, pas depuis la colonne ; `DoneMark` est aussi le type de
  `recorded` d'une fournée. Ni l'un ni l'autre ne disparaît.
- L'auteur d'une coche survit dans `production_batch.recorded_by`, où la
  conversion `20260928160000_les_fournees` l'a copié.
- Registre RGPD : `production.production_count.done_by`
  (`documentation/legal/rgpd-registre.json:651`).

## 3. Ce qui change — deux déploiements

La CI applique les migrations **avant** de basculer l'image
(`deploy_lfd_api.yml:408`), et l'image en service lit les trois colonnes à
chaque chargement d'une journée. Supprimer les colonnes avec le code
casserait la fiche, les fournées et la clôture pendant la bascule. D'où :

### Lot A — le code ne lit plus la coche (colonnes gardées, inutilisées)

- Retirer les deux routes, leurs commandes, handlers et tests.
- Retirer la lecture de la coche : le select de `production-day.row.ts`,
  `implicitBatchesOf`, la matérialisation de `record-batch.handler.ts`, et
  `ProducedItemSnapshot.done`. « Fait » se lit sur les seules fournées, la
  règle déjà tenue par l'agrégat.
- `production-day.reopening.ts` ne regarde plus la coche : une ligne dont la
  fournée de rattrapage a été annulée ne bloque plus la réouverture — c'est
  le comportement voulu, testé.
- Le modèle Prisma garde les trois colonnes (non lues) jusqu'au lot B.
- Commentaires au présent ; `la-fiche-d-atelier.md` à jour.

### Lot B — la base (après le déploiement du lot A, sur ordre de Hugo)

L'ordre de Hugo du 2026-11-15 (« oui vas y ») couvre la suppression des trois
colonnes en production.

```sql
SET lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM production.production_count c
              WHERE c.done_at IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM production.production_batch b
                                 WHERE b.service_day = c.service_day AND b.sku = c.sku)) THEN
    RAISE EXCEPTION 'Une ligne cochée n''a pas de fournée : la fin des coches perdrait une trace.';
  END IF;
END $$;
ALTER TABLE production.production_count
  DROP COLUMN done_at, DROP COLUMN done_by, DROP COLUMN done_initials;
```

Le garde reprend **exactement** la condition de la requête de Hugo (toute
fournée du jour et du SKU, annulée comprise). Le modèle Prisma perd les trois
champs ; l'entrée `done_by` sort du registre RGPD (la trace d'auteur vit dans
`production_batch.recorded_by`, déjà au registre).

Retour arrière : recréer `done_at timestamp(3) NULL`, `done_by text NULL`,
`done_initials text NOT NULL DEFAULT ''` ; les coches ne reviennent pas,
elles sont toutes portées par une fournée.

## 4. Tests

- Les specs et e2e de la coche disparaissent avec elle ; ceux des fournées
  couvrent « fait ».
- E2E : une ligne entièrement fournée est « faite » (fiche, compte, contrat
  `doneAt`) ; une ligne dont la fournée de rattrapage est annulée ne bloque
  plus la réouverture.
- La migration éprouvée en e2e sur une base où une coche sans fournée existe :
  elle échoue en le disant.
