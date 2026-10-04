# Le schéma `delivery` — la livraison chez elle, et rien qu'en passant par des ports

> ✅ **Bâti et déployé le 2026-09-30** : déploiement 1 `618940a3b` (migrations appliquées en production à 19 h 52), déploiement 2 `20260930200000_les_vues_de_compatibilite_partent`. Référence : [`architecture-isolation-livraison.md`](architecture-isolation-livraison.md). **v2 après `vitruve`** (4
> bloquants, 4 sérieux — tous corrigés ci-dessous, cf. § 5). Hugo : « je me
> demande si delivery ne devrait pas avoir son schéma à part », puis « toutes
> les tables qu'on a faites pour chargement, simulations, etc., tout part dans
> le schéma delivery », et « attention, on respecte vraiment le principe
> d'isolation, dialogue par port ».
>
> Revient sur **Q10** du plan de tournée (« pas de schéma Postgres neuf : les
> tables vont dans `production` », 2026-09-29). Q10 visait trois tables ; il y
> en a quatorze.

## 1. L'état, relevé le 2026-09-30

`production.prisma` porte **25 modèles** : les 9 du fournil, `day_change`,
`order_handover` (le retrait — pas concerné), et **14 de la livraison** :

| Sujet                | Tables (`production.*`)                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| Flotte et réglages   | `delivery_vehicle`, `delivery_departure`, `delivery_routing_settings`             |
| Tournées             | `delivery_round`, `delivery_round_stop`, `delivery_stop_execution`                |
| Calcul routier       | `delivery_geocode`                                                                |
| Bacs et chargement   | `delivery_bin_type`, `delivery_bin_capacity`, `delivery_bin`, `delivery_bin_load` |
| Simulation           | `delivery_simulation_scenario`                                                    |
| Bibliothèque d'achat | `delivery_purchase_vehicle_candidate`, `delivery_purchase_bin_candidate`          |

⚠️ **En production, 12 seulement** : `origin/main` s'arrête à
`20260930000000_les_bacs_remplacent_les_sacs`. Les passages de roue et la
bibliothèque d'achat (`20260930100000`, `20260930120000`) ne sont qu'en dev ;
ils passent **avant** le déménagement, dans le même déploiement, et la
migration de déménagement vient **après eux** dans l'ordre des dossiers.

Aucune clé étrangère ne sort des tables déplacées vers `production.*` ni
`public.*` (vérifié par `vitruve`) : les FK sont toutes internes à la livraison.

### 🔴 Le dialogue qui ne passe par aucun port

**Douze déclencheurs** sur quatre tables de livraison (`delivery_round`,
`delivery_round_stop`, `delivery_stop_execution`, `delivery_bin_load` ; trois
chacun) appellent `production.record_day_change_by_service_day()` et écrivent
dans **le journal de journée du fournil**, `production.day_change`.

**Une garde existe, et ne le voit pas.** `day-change-triggers.e2e-spec.ts`
(« aucun déclencheur de journal n'écrit hors de son schéma (D3) », l.146)
compare le corps d'une fonction **au schéma de la fonction**, jamais au schéma
de la **table** qui la déclenche. Une table de livraison qui appelle une
fonction du fournil est donc invisible pour elle.

_(La v1 de ce plan écrivait « aucune porte ne le couvre » : faux. La porte
existe, elle regarde au mauvais endroit.)_

### 🔴 Le SQL écrit en dur

Huit requêtes `$queryRaw` citent `"production"."delivery_*"`, dont des
**verrous** `FOR UPDATE` / `FOR SHARE` :

- `delivery/infrastructure/prisma-delivery-proposal.repository.ts` : l. 70, 98
- `prisma-delivery-round.repository.ts` : l. 69, 97, 142
- `prisma-stop-loading.repository.ts` : l. 66, 110, 170

Plus les e2e `delivery-bins`, `delivery-vehicle-load`,
`delivery-vehicle-wheel-arches`, et trois JSDoc de mappers. Après le
déplacement, `tsc` reste vert et le client Prisma est juste : **seules ces
requêtes tomberaient**, en 500.

## 2. Décisions

### SD-D1 — Un schéma `delivery`, les quatorze tables y vont

- `datasource.prisma` : `schemas = ["public", "growth", "ops", "pim", "production", "media", "delivery"]`
  (liste actuelle relue le 2026-09-30, plus `delivery`).
- Un fichier `apps/lfd-api/prisma/schema/delivery.prisma` (`prisma-schema-layout.mjs` admet
  un fichier comme un dossier), les quatorze modèles en `@@schema("delivery")`.
- `schema-ops.counter.ts` : les modèles `Delivery*` passent sous `"delivery"`,
  et `DeliveryDayChange` s'y ajoute.
- **Tout ce qui naît ensuite** au bloc `delivery` naît dans `delivery` :
  scénarios d'achat (B3), la porte (lot 6), les positions (YA4).

### SD-D2 — Deux déploiements : étendre, puis resserrer

`deploy_lfd_api.yml` (l. 331-342) applique `migrate deploy` juste avant
`wrangler deploy` : entre les deux, **l'ancien conteneur sert encore**
quelques secondes, et il interroge `production.delivery_*`. Le même
commentaire rappelle la règle : un déplacement sur une base vivante se fait en
plusieurs déploiements. **Ce plan la suit, il n'y déroge pas.**

**Déploiement 1 — étendre et basculer** (une migration écrite à la main) :

```sql
CREATE SCHEMA IF NOT EXISTS "delivery";
ALTER TABLE "production"."delivery_vehicle" SET SCHEMA "delivery";
-- … les quatorze
-- Puis, pour l'ANCIEN binaire qui sert encore quelques secondes :
CREATE VIEW "production"."delivery_vehicle" AS SELECT * FROM "delivery"."delivery_vehicle";
-- … une vue par table déplacée
```

- `SET SCHEMA` ne réécrit aucune ligne ; index, contraintes, index partiels
  écrits à la main, FK et déclencheurs suivent la table.
- Les **vues simples** sont modifiables et acceptent `FOR UPDATE` : l'ancien
  binaire continue d'écrire et de verrouiller à travers elles pendant la
  fenêtre. Les déclencheurs de la table sous-jacente se déclenchent.
- Le nouveau binaire lit `delivery.*` (Prisma par `@@schema`, les huit requêtes
  écrites en dur réécrites).
- À vérifier en tête de lot, dans une vraie base : que `FOR UPDATE` sur la vue
  verrouille bien la ligne de la table (essai en dev), et `\dT production.*`
  (aucun enum attendu : `production.prisma` n'en déclare aucun).

**Déploiement 2 — resserrer** : `DROP VIEW` des quatorze vues, une fois le
premier en ligne depuis au moins un déploiement.

Prisma ne sait pas exprimer `SET SCHEMA` (il proposerait `DROP` + `CREATE`) :
la migration s'écrit à la main, et la sortie du lot exige que
`prisma migrate diff` ne voie plus aucun écart. Les vues ne sont déclarées
dans aucun `.prisma` : à vérifier que `migrate diff` les ignore.

### SD-D3 — Couper le dialogue en base : la livraison a son journal

Dans la migration du déploiement 1 :

1. `DROP TRIGGER` des douze déclencheurs branchés sur la fonction du fournil ;
2. `CREATE TABLE "delivery"."day_change"` et
   `CREATE FUNCTION "delivery"."record_day_change_by_service_day"()` — même
   forme que celle du fournil, **qualifiée par son propre schéma** ;
3. les douze déclencheurs reposés sur la fonction de la livraison.

Côté code, tout dans `src/delivery/` (jamais dans le fournil) :

- un port `DeliveryDayVersionReader`, sa query, une route
  `GET admin/livraison/version?date=` ;
- un port `DeliveryDayChangePruner`, un handler `PruneDeliveryDayChanges`,
  son adaptateur — branchés sur **le même déclencheur d'élagage** que
  `production` et `b2b/orders` (à nommer en ouvrant le code). Le fournil
  n'efface **jamais** `delivery.day_change` : `lint:prisma-model-ownership`
  le refuserait, à raison.

### SD-D4 — Qui suit quoi : l'écran compose, jamais la base

Aujourd'hui, **quatre écrans** suivent la version de journée du fournil, et
voient donc bouger les tournées par l'effet des déclencheurs :

| Écran                                            | Lit                                    | A besoin de la livraison ?                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colisage (`production/colisage/colisage.ts:151`) | `admin/production/version`             | **Non pour ce qu'il suit.** La lecture veillée (`PackingDayReader` → `admin/production/packing`) ne lit que le fournil. Les bacs s'affichent dans le panneau `packing-bins`, qui lit `admin/livraison/colisage/…` et `admin/livraison/bacs` (`delivery_loading`) **à l'ouverture**, pas au rythme de la version : le composer est un choix d'écran, pas une régression. |
| Fiche d'atelier (`fiche-atelier.ts:108`)         | idem                                   | **Non.** Elle lit la journée du fournil ; `delivery` n'y paraît que comme mode d'acheminement copié dans le snapshot (`fulfillmentMethod`).                                                                                                                                                                                                                             |
| Comptoir (`handover-shop-page.ts:385`)           | `admin/orders/day-version` + idem      | **Non.** `admin/handover/file` lit le commerce et le fournil par leurs canaux ; aucune table de livraison.                                                                                                                                                                                                                                                              |
| Supervision (`supervision-refresh.ts:24`)        | `admin/supervision/production-version` | **Non.** Ses colonnes (`preparation`, `packing`, `handover`, `quality`, `day`) ne lisent aucune table de livraison.                                                                                                                                                                                                                                                     |

> **Relevé SD1 (2026-09-30), code ouvert** : hors de `src/delivery/`, aucun
> `prisma.delivery*` ni SQL sur `delivery_*` dans `src/` (grep). Aucun des
> quatre écrans n'a donc besoin de composer pour rester juste : jusqu'ici, un
> scan de bac ou une tournée composée les faisait relire **pour rien**. Les
> lecteurs naturels de `admin/livraison/version` sont les écrans de la
> livraison eux-mêmes (tournées, chargement), qui ne suivent aucune version
> aujourd'hui — hors de ce plan.
>
> **Déclencheur d'élagage** : il n'y en a pas UN. Le fournil balaie son journal
> dans `POST admin/production/quality/sweep` (cron `45 3 * * *`,
> `QUALITY_UPLOAD_SWEEP_CRON`), le commerce dans
> `POST admin/orders/settlement-reminders` (cron `0 * * * *`). La livraison a sa
> route, `POST admin/livraison/journal/sweep`, appelée par le Worker dans le
> **même cron nocturne que le fournil**, juste après lui — aucun cron neuf.
>
> **`migrate diff`** (base de dev migrée → `prisma/schema`, 2026-09-30) : aucune
> ligne ne cite `delivery`, une vue ni `day_change` ; les vues de compatibilité
> sont ignorées. **`FOR UPDATE` à travers une vue** : essayé en dev par Hugo le
> 2026-09-30 (vue simple : `FOR UPDATE`, `UPDATE`, `INSERT`, `DELETE` passent) ;
> `\dT production.*` vide.

Le service commun (`shared/day-version/day-version.service.ts`) gagne une
valeur de journal (`delivery`), sous le droit des tournées
(`delivery_rounds:read`). Chaque écran qui a besoin des deux **compose les
deux versions** : il relit dès que l'une bouge. **La décision écran par écran
se prend en SD1, code ouvert**, et s'écrit dans ce tableau.

### SD-D5 — Les gardes suivent le nouveau schéma, au lieu de le perdre

`day-change-triggers.e2e-spec.ts` ne lit que `production` et `public`
(l. 114, l. 146-157) : après le déplacement, **la livraison sortirait de sa
surveillance sans un bruit**, et ses douze exceptions (l. 30-62) échoueraient
en « n'existe pas » — l'effacement serait le correctif réflexe.

- les deux requêtes lisent aussi `delivery` ;
- les exceptions passent sous `delivery.*`, **elles ne s'effacent pas** ;
- le test D3 cesse d'être binaire (« l'autre schéma », faux dès qu'il y en a
  trois) et devient : **schéma de la table = schéma de la fonction = seul
  schéma cité dans le corps**, lu dans `pg_trigger`. C'est l'état réel de la
  base, pas l'historique des migrations.

C'est la porte que la v1 voulait créer : elle existe, on la corrige.

### SD-D6 — Le retour arrière

- **Avant le déploiement 2** : une migration **en avant** (`migrate deploy` ne
  rejoue rien à rebours) qui supprime les vues, remet les tables en
  `production` (`SET SCHEMA`), supprime `delivery.day_change` et sa fonction,
  repose les douze déclencheurs sur la fonction du fournil. Écrite **et
  essayée en dev** avant la production. Le journal de la livraison accumulé
  entre-temps est perdu : ce n'est qu'un signal de rafraîchissement.
- **L'ancien binaire** relancé après ce retour arrière retrouve son schéma.

## 3. Les lots

| Lot     | Contenu                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SD1** | Relevés code ouvert, **écrits dans ce plan** : le tableau SD-D4 rempli ; le déclencheur d'élagage nommé ; `FOR UPDATE` à travers une vue essayé en dev ; `migrate diff` face aux vues                                                                                                                                                                                           |
| **SD2** | Migration du déploiement 1 (schéma, `SET SCHEMA` ×14, vues, journal et fonction de la livraison, déclencheurs) ; le fichier Prisma du schéma ; les huit requêtes réécrites ; e2e et JSDoc ; `schema-ops.counter.ts` ; gardes de `day-change-triggers` (SD-D5). Sortie : `grep -rn '"production"\."delivery_' apps/lfd-api/src apps/lfd-api/test` **vide** ; `migrate diff` vide |
| **SD3** | Version et élagage de la livraison (SD-D3) ; les écrans composent (SD-D4)                                                                                                                                                                                                                                                                                                       |
| **SD4** | Migration de retour arrière écrite et essayée en dev, puis gardée hors du dépôt tant qu'on ne s'en sert pas                                                                                                                                                                                                                                                                     |
| **SD5** | Déploiement 2 : `DROP VIEW` ×14                                                                                                                                                                                                                                                                                                                                                 |
| **SD6** | Doc : ce plan rayé, Q10 annotée, `../colisage/chargement-les-bacs.md` § 10, le tableau des blocs du CLAUDE.md                                                                                                                                                                                                                                                                   |

**Avant B3, la porte et les positions** : ils créent des tables, qui naîtront
directement dans `delivery`.

## 4. Questions

| #         | Question                                                                                    | Proposé                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SD-Q1** | Deux déploiements avec des vues de compatibilité, plutôt qu'une fenêtre d'erreurs assumée ? | **Oui** : c'est la règle écrite dans le workflow et dans le CLAUDE.md § 0, et le coût est une ligne `CREATE VIEW` par table.                                                                                                                                                                                                                                                       |
| **SD-Q2** | Le journal d'activité (`growth.activity_events`) reste transverse ?                         | Oui : la livraison n'y écrit que par le publieur d'événements.                                                                                                                                                                                                                                                                                                                     |
| **SD-Q3** | Le rôle Postgres de production a-t-il les droits sur un schéma neuf ?                       | **Tranché par le précédent `media`** (2026-09-30) : cinq migrations sur `main` font `CREATE SCHEMA`, la dernière `media` le 2026-09-23, et l'API lit ses tables en production sans aucun `GRANT` dans le dépôt. Reste à confirmer par Hugo, en lecture seule, que le propriétaire des schémas est l'utilisateur de l'API (`pg_namespace.nspowner` = `current_user` via le pooler). |

## 5. Ce que `vitruve` a corrigé (v1 → v2, 2026-09-30)

| Objection                                                                          | Correction                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **B1** Huit requêtes SQL en dur non listées                                        | § 1, et la sortie de SD2 exige un `grep` vide                       |
| **B2** La garde D7 aurait perdu la livraison en silence                            | SD-D5                                                               |
| **B3** « Aucune porte ne le couvre » était faux                                    | § 1 corrigé ; la porte existante est étendue au lieu d'en créer une |
| **B4** L'élagage rangé chez le fournil violait la frontière                        | SD-D3 : port et adaptateur dans `src/delivery/`                     |
| **S5** Fenêtre de déploiement laissée ouverte ; quatre lecteurs de version, pas un | SD-D2 (deux déploiements), SD-D4 (le tableau)                       |
| **S6** `schema-ops.counter.ts` oublié                                              | SD-D1                                                               |
| **S7** Retour arrière incomplet                                                    | SD-D6                                                               |
| **S8** 12 tables en production, pas 14                                             | § 1, ordre des migrations                                           |
