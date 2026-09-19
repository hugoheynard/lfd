# Plan — reprendre au journal l'histoire de l'annuaire d'avant le 2026-09-18

> **Ouvert le 2026-09-18** à la demande de Hugo : « je sais que tous les users
> ont été créés par dev@lafoliedouce.com pour le moment, si on devait backfill
> sur les existants car on n'avait pas de journal tracking à ce moment », puis
> « pour admin dev racine on l'attribue au système, les rôles n'ont pas
> changé ».
>
> Suite de [`architecture-journal-de-l-annuaire.md`](architecture-journal-de-l-annuaire.md),
> déployé le même jour. État : ✅ déployé le 2026-09-18 — l'écran avec `0adac7f4`, la migration avec `68a54034` (« Migrer la base » l'a appliquée). Contredit par `vitruve` (§5).

## 0. Résumé

Le journal de l'annuaire n'existe que depuis le déploiement `cd4cab2a`. Les
fiches créées avant n'ont aucune trace : l'écran Journal ne dit pas qui les a
créées ni invitées. Hugo **atteste** l'auteur. Ce plan écrit, une seule fois, par
une migration SQL, les faits qu'il atteste — marqués comme **reprise**, datés du
jour de l'acte, et rangés à leur place dans le journal.

## 1. Ce qui existe (vérifié le 2026-09-18)

| Fait                                                                                                                                                                                                       | Où                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| L'écran Journal trie par `id` décroissant et pagine par `id < before`                                                                                                                                      | `prisma-activity-journal.reader.ts:44,92`                       |
| `id` est un ULID fabriqué par `monotonicFactory()` **à l'instant du geste** : son préfixe temporel dit quand le fait a eu lieu                                                                             | `platform/id/ulid-generator.ts`                                 |
| Une ligne porte `occurred_at`, `recorded_at` (défaut `now()`), `actor_type/id/name/role` figés, `trace_id`, `idempotency_key` **unique**, `payload`                                                        | `prisma/schema/growth.prisma`, `ActivityEvent`                  |
| Un fait staff porte le `sub` de l'auteur en `actor_id` (converti depuis en id de fiche : [`../../journalisation/architecture-journalisation.md`](../../journalisation/architecture-journalisation.md) §12) | `admin-auth.guard.ts`                                           |
| `staff_user.created` = `{ person, roleLabel }` ; `staff_user.invited` = `{ person, kind }`, `kind` absent lu comme une invitation par l'écran                                                              | `architecture-journal-de-l-annuaire.md` §5 bis, `staff-line.ts` |
| L'écran nomme l'auteur par `actorName`, et à défaut écrit « Un membre de l'équipe » — **quel que soit** `actor_type`                                                                                       | `staff-line.ts:98`                                              |
| `staff_users` porte `created_at`, `invited_at` (dernière invitation seulement), `first_name`, `last_name`, `role`, `email`, `auth0_id`                                                                     | `staff.prisma`                                                  |
| Libellés des rôles : Administrateur, Commercial, Comptabilité, Support, Technique                                                                                                                          | `STAFF_ROLE_LABELS`                                             |
| La porte `cross-schema-join` ne lit que `apps/lfd-api/src` : elle ne voit pas les migrations                                                                                                               | `dev-toolbox/gates/cross-schema-join.mjs`                       |

## 2. Décisions

**D0 — `dev@lafoliedouce.com` EST l'admin racine** — vérifié le 2026-09-18 :
`vars.BOOTSTRAP_ADMIN_EMAIL` vaut `dev@lafoliedouce.com` depuis le 2026-08-13
(`gh variable list`), lue par `deploy_lfd_api.yml`. Toutes les autres fiches ont
donc été créées par la racine (Hugo), et la racine par le système. La migration
écrit l'adresse en dur, avec cette preuve en commentaire.

**D1 — Une reprise attestée, pas une reconstitution.** On n'écrit que ce que Hugo
atteste et ce que la base sait. Chaque fait repris porte `backfilled: true` et
`source: "reprise attestée par Hugo le 2026-09-18"` ; l'écran ajoute
« (reprise) » à la ligne. Une trace reconstituée se distingue d'une trace vécue.

**D2 — Rangés à leur date.** L'`id` est un ULID fabriqué en SQL, dont le préfixe
est l'instant de l'acte :

- 48 bits de millisecondes, pris par `extract(epoch from created_at)` **sans
  passer par `timestamptz`** (`TIMESTAMP(3)` sans fuseau : une conversion
  décalerait le préfixe du fuseau de la session) ;
- 10 caractères en base 32 de Crockford, alphabet
  `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, **majuscules**, assemblés par
  `string_agg(… ORDER BY i)` ;
- les 16 caractères aléatoires dérivés de `md5(type || subject_id)` : le même
  `id` à chaque rejeu.

Une minuscule ou un ordre perdu casserait le tri et la pagination (`id < before`)
sans qu'aucune validation ne l'arrête ; un test compare le tri des `id` repris à
celui de `occurred_at`.

**D3 — Une migration SQL**, relue avant `main`. Pas de doublon avec un fait vécu :
c'est le `NOT EXISTS` sur (`type`, `subject_id`) qui le garantit ; la clé
`…:reprise-2026-09-18` + `ON CONFLICT DO NOTHING` rend le rejeu inoffensif.

**D4 — L'auteur est nommé, pas identifié.** `actor_type = 'staff'`,
**`actor_id` NULL**, `actor_name` = le nom **actuel** de la fiche racine (sans
doute « Admin La Folie Coffee », accepté : c'est le nom qu'on lui connaît),
`actor_role` = le libellé de **son** rôle, lu dans la fiche. `actor_id` NULL
plutôt que le `sub` : cette reprise n'ajoute aucun `sub` au journal le jour où
ils sont qualifiés de fuite, et le `sub` de la racine a pu changer avant le
2026-09-17. Contrepartie : le filtre par acteur ne trouve pas ces lignes.

**D5 — La racine est créée par le système** : `actor_type = 'system'`,
`actor_id` NULL, comme le code l'écrit pour un acteur système.

**D6 — Si la fiche racine manque, rien n'est repris**, sans échec : une migration
qui lève une exception en production bloque tous les déploiements suivants
jusqu'à une résolution à la main. La requête de contrôle est en tête de la
migration, et se lance après le déploiement.

**D7 — Deux promotions, dans cet ordre.** D'abord l'écran (repli « Le système »
selon `actor_type`, marque « (reprise) ») ; ensuite la migration. Le back-office
et l'API se déploient séparément : dans l'ordre inverse, la ligne racine se
lirait « Un membre de l'équipe a créé … » le temps du décalage.

## 3. Ce qui est repris

| Fait                 | Pour                                                                                                                               | Daté de      | Auteur          | Charge utile                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- | ------------------------------------------------------ |
| `staff_user.created` | chaque fiche sans `staff_user.created` au journal, sauf la racine                                                                  | `created_at` | la racine (D4)  | `{ person, roleLabel }` — rôle actuel, inchangé (Hugo) |
| `staff_user.created` | la racine                                                                                                                          | `created_at` | le système (D5) | `{ person, roleLabel }`                                |
| `staff_user.invited` | chaque fiche, **sauf la racine**, sans `staff_user.invited` au journal, et dont `invited_at` suit `created_at` de **60 s au plus** | `invited_at` | la racine (D4)  | `{ person, kind: "invitation" }`                       |

**Tranché en bâtissant (2026-09-18)** : la route fige `invited_at` à l'instant de
la requête, **avant** l'`INSERT` qui pose `created_at` — l'invitation de la
création la précède de quelques millisecondes (29 ms mesurées). La fenêtre est
donc « `invited_at` au plus 60 s après `created_at` », sans borne basse ; et
l'invitation reprise est datée de `GREATEST(invited_at, created_at + 1 ms)`,
pour que l'écran montre créer puis inviter, dans l'ordre du geste.

La règle des 60 s : la création ouvre l'accès dans la foulée
(`create-staff-user.handler.ts`), donc un `invited_at` collé à `created_at` est
l'invitation de la création. Un `invited_at` plus tardif est le **dernier**
envoi — invitation ou changement de mot de passe, la base ne le sait pas : il
n'est **pas** repris. `roleLabel` : un `CASE` sur les cinq valeurs de l'enum
`StaffRole`, recopiées de `STAFF_ROLE_LABELS`.

**Pas repris** : les envois d'invitation antérieurs au dernier, les changements
de rôle, les dérogations et les suspensions (rien ne les date). **Pas touché** :
`granted_by_staff_id` des dérogations sans auteur — ce sont justement celles
dont l'auteur ne correspondait à aucune fiche ; leur donner la racine serait
fabriquer un auteur.

## 4. Tests

- **La migration**, rejouée sur une base de test semée (modèle :
  `test/company-siren.e2e-spec.ts`) : la racine, une fiche créée et invitée
  dans la foulée, une fiche invitée plus tard (pas de `invited` repris), une
  fiche déjà journalisée (ignorée), et un second passage qui n'ajoute rien.
- **Les `id` repris** : 26 caractères Crockford majuscules, et leur tri égal au
  tri de `occurred_at`, y compris intercalés avec des faits vécus.
- **L'écran** : « Le système a créé … » pour `actor_type = 'system'` ; une ligne
  reprise porte « (reprise) ».

## 5. Ce que `vitruve` a changé (2026-09-18)

| Objection                                                                | Ce qui a changé                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| BLOQUANT — la racine n'est pas identifiable par une migration            | D0 : la valeur de production est vérifiée, et c'est `dev@`                                                |
| BLOQUANT — `kind` absent afficherait une invitation qui n'en est pas une | Règle des 60 s ; au-delà, rien n'est repris                                                               |
| SÉRIEUX — fiche racine absente : succès silencieux                       | D6 : assumé et dit, requête de contrôle                                                                   |
| SÉRIEUX — `actor_role` en dur                                            | Lu dans la fiche                                                                                          |
| SÉRIEUX — des `sub` ajoutés au journal                                   | `actor_id` NULL (D4)                                                                                      |
| SÉRIEUX — `actor_id = 'bootstrap-admin'` inventé                         | NULL, comme le code (D5)                                                                                  |
| SÉRIEUX — dérogations attribuées à la racine                             | Retiré du plan                                                                                            |
| SÉRIEUX — ordre des déploiements                                         | D7 : l'écran d'abord                                                                                      |
| SÉRIEUX — ULID en SQL non spécifié                                       | D2                                                                                                        |
| MINEUR — « deux schémas du commerce » est faux                           | `staff_users` appartient au bloc `staff` ; la porte ne lit pas les migrations, rien de plus n'est affirmé |
