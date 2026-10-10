-- L'invitation portée par le RATTACHEMENT, et lue à l'entrée
-- (documentation/auth-inscription/architecture-compte-client-cycle-de-vie.md,
-- §8.1 bis, conception v2 ; décisions de Hugo du 2026-10-10).
--
-- Ce qu'elle fait :
--   1. `memberships.invited_at` (quand l'invitation de CE rattachement a été
--      émise ou renouvelée) et `memberships.accepted_at` (quand la personne est
--      entrée par lui ; NULL = pas encore). Un rattachement n'ouvre la société
--      que s'il est accepté, ou si son invitation vit (7 jours).
--   2. Remplissage :
--      - rattachement d'une personne `active` qui a une identité de connexion
--        (`auth0_sub` non nul) : accepted_at = created_at (elle est entrée) ;
--        invited_at = created_at ;
--      - rattachement d'une personne `invited`, ou `active` SANS identité (un
--        invité de la commande sans compte, D1 de plan-commande-sans-compte.md :
--        actif, mais jamais entré — le rattachement que le commercial lui a
--        posé est une invitation en vol) : invited_at = l'instant de la
--        migration — la GRÂCE de 7 jours (Hugo, 2026-10-10) : aucune invitation
--        en cours n'est fermée par le déploiement ; celles qui ne seront pas
--        acceptées d'ici là expireront normalement ;
--      - les autres (`disabled`) : invited_at = created_at, jamais acceptés.
--   3. `staff_users.invited_at` = l'instant de la migration pour les fiches
--      `invited` qui n'en ont pas — la même grâce. Colonne TIMESTAMP(3) en UTC :
--      `now()` y est converti explicitement, jamais par le fuseau de session.
--
-- ADDITIVE : deux colonnes, des remplissages, rien de supprimé ni de resserré
-- sur une colonne existante.
--
-- 🔴 Retour arrière : techniquement un DROP COLUMN, mais IRRÉVERSIBLE DANS LES
-- FAITS. Une fois l'entrée lue sur ces colonnes, les retirer rouvrirait le trou
-- qu'elles ferment : une invitation expirée redeviendrait une entrée par code ou
-- par Google, des mois après.
--
-- Aucun droit accordé : rien n'est écrit dans `staff_role_definitions` ni dans
-- `staff_permission_overrides`.

ALTER TABLE "public"."memberships"
  ADD COLUMN "invited_at" TIMESTAMPTZ(3),
  ADD COLUMN "accepted_at" TIMESTAMPTZ(3) NULL;

UPDATE "public"."memberships" AS m
SET "invited_at" = CASE
                     WHEN u."status" = 'invited' THEN now()
                     WHEN u."status" = 'active' AND u."auth0_sub" IS NULL THEN now()
                     ELSE m."created_at" AT TIME ZONE 'UTC'
                   END,
    "accepted_at" = CASE
                      WHEN u."status" = 'active' AND u."auth0_sub" IS NOT NULL
                        THEN m."created_at" AT TIME ZONE 'UTC'
                      ELSE NULL
                    END
FROM "public"."users" AS u
WHERE u."id" = m."user_id";

ALTER TABLE "public"."memberships"
  ALTER COLUMN "invited_at" SET DEFAULT now(),
  ALTER COLUMN "invited_at" SET NOT NULL;

UPDATE "public"."staff_users"
SET "invited_at" = now() AT TIME ZONE 'UTC'
WHERE "status" = 'invited' AND "invited_at" IS NULL;
