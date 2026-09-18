-- ───────────────────────────────────────────────────────────────────────────
-- L'HISTOIRE DE L'ANNUAIRE D'AVANT LE JOURNAL, REPRISE AU JOURNAL.
--
-- Cf. documentation/auth-inscription/plan-reprise-du-journal-de-l-annuaire.md
-- — §2 (D0–D7) et §3.
--
-- QUOI. Le journal de l'annuaire n'existe que depuis le déploiement `cd4cab2a`
-- (2026-09-18). Les fiches créées avant n'y ont aucune trace. Cette migration
-- écrit, une fois, dans `growth.activity_events` :
--
--   · `staff_user.created` pour chaque fiche sans ce fait au journal, daté de
--     `created_at`, charge `{ person, roleLabel }` — le rôle ACTUEL, inchangé
--     depuis la création (attesté par Hugo) ;
--   · `staff_user.invited` pour chaque fiche SAUF la racine, sans ce fait au
--     journal, dont `invited_at` tombe au plus 60 s après `created_at` —
--     l'invitation de la création, envoyée dans la foulée par
--     `create-staff-user.handler.ts` — daté de `invited_at`, charge
--     `{ person, kind: "invitation" }`.
--
--     ⚠️ « Au plus 60 s après », SANS borne basse : la route fige `invited_at`
--     à l'instant de la requête (`Clock`), AVANT l'INSERT qui pose
--     `created_at`. L'invitation de la création précède donc la création de
--     quelques millisecondes (29 ms mesurées en e2e le 2026-09-18) ; une
--     fenêtre « entre 0 et 60 s après » n'en reprendrait aucune.
--
--     Datée de `invited_at` telle quelle, l'invitation se rangerait donc juste
--     AVANT la création de la même fiche, et l'écran afficherait « a invité »
--     sous « a créé » dans le mauvais sens. Elle est datée de
--     GREATEST(invited_at, created_at + 1 ms) : l'ordre du geste — créer, puis
--     inviter — plutôt que l'ordre des horloges, à la milliseconde près.
--
-- Chaque charge porte en plus `backfilled: true` et `source` : une trace
-- reprise se distingue d'une trace vécue (D1), l'écran y ajoute « (reprise) ».
--
-- POURQUOI. Hugo, 2026-09-18 : « tous les users ont été créés par
-- dev@lafoliedouce.com », et « pour admin dev racine on l'attribue au
-- système, les rôles n'ont pas changé ». C'est une REPRISE ATTESTÉE, pas une
-- reconstitution : rien n'est écrit que Hugo n'atteste ou que la base ne sait.
--
-- PREUVE D0 — `dev@lafoliedouce.com` EST la fiche racine : la variable
-- `vars.BOOTSTRAP_ADMIN_EMAIL` vaut `dev@lafoliedouce.com` depuis le
-- 2026-08-13 (`gh variable list`, vérifié le 2026-09-18), lue par
-- `.github/workflows/deploy_lfd_api.yml` et semée au boot par
-- `ensureBootstrapAdmin`. L'adresse est écrite en dur ci-dessous pour cette
-- raison.
--
-- L'AUTEUR (D4, D5). Pour toute fiche sauf la racine : `actor_type = 'staff'`,
-- `actor_id` NULL — aucun `sub` ajouté au journal, et celui de la racine a pu
-- changer avant le 2026-09-17 —, `actor_name` = prénom et nom ACTUELS de la
-- racine, `actor_role` = le libellé de SON rôle. Pour la racine elle-même :
-- `actor_type = 'system'`, les trois autres NULL, comme le code l'écrit pour
-- un acteur système. Contrepartie assumée : le filtre par acteur (`actor_id`)
-- ne trouve pas ces lignes.
--
-- L'`id` (D2). Un ULID fabriqué ici, rangé à la date de l'acte : l'écran trie
-- par `id` décroissant et pagine par `id < before`.
--   · 10 caractères de temps : les millisecondes de la date de l'acte, prises
--     par `extract(epoch FROM <timestamp(3)>)` SANS passer par `timestamptz`
--     (la colonne est sans fuseau et stockée en UTC ; une conversion
--     décalerait le préfixe du fuseau de la session) ;
--   · 16 caractères dérivés de `md5(type || subject_id)` : le même `id` à
--     chaque rejeu ;
--   · base 32 de Crockford, MAJUSCULES, assemblée par `string_agg(… ORDER BY
--     i)`. Une minuscule ou un ordre perdu casserait le tri sans qu'aucune
--     validation ne l'arrête — l'e2e `staff-journal-backfill` le vérifie.
-- Aucune fonction SQL n'est créée : rien ne reste derrière.
--
-- L'ÉCRITURE EST UNE SEULE INSTRUCTION. Pas de doublon avec un fait vécu : le
-- `NOT EXISTS` sur (type, `staff_user`, subject_id) (D3). Rejeu inoffensif :
-- la clé `<type>:<subject_id>:reprise-2026-09-18` + `ON CONFLICT DO NOTHING`.
-- `trace_id` : une seule trace pour toute la reprise, 32 hexadécimaux comme
-- une trace W3C, stable d'un rejeu à l'autre.
--
-- LIMITES — ce qui n'est PAS repris, faute que la base le date :
--   · les envois d'invitation antérieurs au dernier (`invited_at` n'en garde
--     qu'un) ; un `invited_at` plus tardif que 60 s est le DERNIER envoi,
--     invitation ou mot de passe perdu, la base ne sait pas lequel : il n'est
--     pas repris ;
--   · les changements de rôle, les dérogations, les suspensions ;
--   · `granted_by_staff_id` des dérogations sans auteur n'est PAS touché :
--     leur donner la racine serait fabriquer un auteur.
--
-- ⚠️ SI LA FICHE RACINE MANQUE, RIEN N'EST REPRIS — sans erreur (D6). Une
-- migration qui lève une exception en production bloque tous les déploiements
-- suivants jusqu'à une résolution à la main. D'où la requête de contrôle.
--
-- ⚠️ ORDRE DES PROMOTIONS (D7) : l'écran D'ABORD (repli « Le système » selon
-- `actor_type`, marque « (reprise) »), cette migration ENSUITE.
--
-- CONTRÔLE — à lancer après le déploiement :
--
--   SELECT (SELECT count(*) FROM public.staff_users
--             WHERE email = 'dev@lafoliedouce.com')                AS racine,
--          (SELECT count(*) FROM public.staff_users)                AS fiches,
--          count(*) FILTER (WHERE type = 'staff_user.created')      AS creations,
--          count(*) FILTER (WHERE type = 'staff_user.invited')      AS invitations,
--          count(*) FILTER (WHERE actor_type = 'system')            AS par_le_systeme
--     FROM growth.activity_events
--    WHERE idempotency_key LIKE '%:reprise-2026-09-18';
--
-- `racine` doit valoir 1 — à 0, rien n'a été repris (D6). `creations` vaut
-- `fiches` moins celles déjà journalisées avant ce déploiement ;
-- `par_le_systeme` vaut 1 (la racine) ; `invitations` est au plus
-- `creations - 1`.
--
-- RETOUR ARRIÈRE — seules les lignes reprises portent ce suffixe de clé :
--
--   DELETE FROM growth.activity_events
--    WHERE idempotency_key LIKE '%:reprise-2026-09-18';
-- ───────────────────────────────────────────────────────────────────────────

WITH sheets AS (
  SELECT s.id,
         s.email,
         s.first_name,
         s.last_name,
         s.created_at,
         s.invited_at,
         -- Recopié de `STAFF_ROLE_LABELS` (`packages/contracts/src/staff-access.ts`).
         CASE s.role
           WHEN 'admin' THEN 'Administrateur'
           WHEN 'commercial' THEN 'Commercial'
           WHEN 'comptabilite' THEN 'Comptabilité'
           WHEN 'support' THEN 'Support'
           WHEN 'dev' THEN 'Technique'
         END AS role_label
    FROM public.staff_users s
),
root AS (
  SELECT id,
         trim(first_name || ' ' || last_name) AS name,
         role_label
    FROM sheets
   WHERE email = 'dev@lafoliedouce.com'
),
facts AS (
  SELECT 'staff_user.created' AS type,
         s.id AS subject_id,
         s.created_at AS occurred_at,
         CASE WHEN s.id = r.id THEN 'system' ELSE 'staff' END AS actor_type,
         CASE WHEN s.id = r.id THEN NULL ELSE r.name END AS actor_name,
         CASE WHEN s.id = r.id THEN NULL ELSE r.role_label END AS actor_role,
         jsonb_build_object(
           'person', jsonb_build_object('firstName', s.first_name, 'lastName', s.last_name),
           'roleLabel', s.role_label,
           'backfilled', true,
           'source', 'reprise attestée par Hugo le 2026-09-18'
         ) AS payload
    FROM sheets s
   CROSS JOIN root r
   WHERE NOT EXISTS (
           SELECT 1
             FROM growth.activity_events e
            WHERE e.type = 'staff_user.created'
              AND e.subject_type = 'staff_user'
              AND e.subject_id = s.id
         )
  UNION ALL
  SELECT 'staff_user.invited',
         s.id,
         GREATEST(s.invited_at, s.created_at + interval '1 millisecond'),
         'staff',
         r.name,
         r.role_label,
         jsonb_build_object(
           'person', jsonb_build_object('firstName', s.first_name, 'lastName', s.last_name),
           'kind', 'invitation',
           'backfilled', true,
           'source', 'reprise attestée par Hugo le 2026-09-18'
         )
    FROM sheets s
   CROSS JOIN root r
   WHERE s.id <> r.id
     AND s.invited_at IS NOT NULL
     AND s.invited_at <= s.created_at + interval '60 seconds'
     AND NOT EXISTS (
           SELECT 1
             FROM growth.activity_events e
            WHERE e.type = 'staff_user.invited'
              AND e.subject_type = 'staff_user'
              AND e.subject_id = s.id
         )
),
identified AS (
  SELECT f.*,
         (SELECT string_agg(
                   substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                          ((t.ms >> (5 * (9 - i))) & 31)::int + 1, 1),
                   '' ORDER BY i)
            FROM generate_series(0, 9) AS i)
         ||
         (SELECT string_agg(
                   substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                          (get_byte(decode(md5(f.type || f.subject_id), 'hex'), i) & 31) + 1, 1),
                   '' ORDER BY i)
            FROM generate_series(0, 15) AS i) AS id
    FROM facts f
   CROSS JOIN LATERAL (
           SELECT floor(extract(epoch FROM f.occurred_at) * 1000)::bigint AS ms
         ) t
)
INSERT INTO "growth"."activity_events" (
  "id", "type", "occurred_at", "subject_type", "subject_id",
  "actor_type", "actor_id", "actor_name", "actor_role",
  "trace_id", "idempotency_key", "payload"
)
SELECT id,
       type,
       occurred_at,
       'staff_user',
       subject_id,
       actor_type,
       NULL,
       actor_name,
       actor_role,
       md5('reprise-du-journal-de-l-annuaire-2026-09-18'),
       type || ':' || subject_id || ':reprise-2026-09-18',
       payload
  FROM identified
ON CONFLICT ("idempotency_key") DO NOTHING;
