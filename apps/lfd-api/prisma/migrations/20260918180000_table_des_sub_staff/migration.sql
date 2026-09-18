-- ───────────────────────────────────────────────────────────────────────────
-- LA TABLE DES `sub` DE CHAQUE FICHE STAFF.
--
-- Cf. documentation/staff/plan-l-auteur-est-la-fiche.md — D5.1, étape 1.
--
-- Une fiche a pu porter PLUSIEURS `sub` : le résolveur réécrivait `auth0_id`
-- sans condition jusqu'au 2026-09-17, et la réinvitation en relie un neuf.
-- `staff_users.auth0_id` ne garde que le dernier. Cette table les garde tous,
-- pour que l'histoire écrite sous un `sub` se rattache à la personne (lecture
-- tolérante, D4 ; conversion, D5.2, dans un déploiement ultérieur).
--
-- ADDITIVE — une table neuve, rien n'est supprimé, renommé ni resserré.
--
-- 1. `sub` en clé primaire : un identifiant de connexion ne désigne qu'une
--    personne. Le code y ajoute ses liens par `ON CONFLICT DO NOTHING`.
-- 2. `staff_user_id` SANS clé étrangère : la ligne doit survivre à tout ; une
--    fiche ne se supprime d'ailleurs plus (étape 0 du même plan).
-- 3. `source` fermé par un CHECK : `current` (semé ici) ou `linked` (écrit à
--    chaque liaison par le code). Prisma ne gère pas les CHECK ; celui-ci
--    tient la base, pas le client.
-- 4. Le semis ne reprend QUE l'`auth0_id` actuel de chaque fiche — des liens
--    que la base a elle-même établis. Aucun ancien `sub` n'est deviné
--    (inventaire écarté par Hugo le 2026-09-18, plan §3).
--
-- RETOUR ARRIÈRE — l'ancien code ne connaît pas cette table :
--
--   DROP TABLE "public"."staff_subject_aliases";
--
-- ⚠️ Le retour arrière perd les liens `linked` écrits depuis : ils ne se
-- reconstruisent pas. Ne pas le jouer après l'étape 4 (conversion), qui joint
-- sur cette table et seulement sur elle.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."staff_subject_aliases" (
    "sub" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_subject_aliases_pkey" PRIMARY KEY ("sub"),
    CONSTRAINT "staff_subject_aliases_source_check" CHECK ("source" IN ('current', 'linked'))
);

CREATE INDEX "staff_subject_aliases_staff_user_id_idx"
    ON "public"."staff_subject_aliases"("staff_user_id");

INSERT INTO "public"."staff_subject_aliases" ("sub", "staff_user_id", "source")
SELECT su."auth0_id", su."id", 'current'
  FROM "public"."staff_users" AS su
 WHERE su."auth0_id" IS NOT NULL
ON CONFLICT ("sub") DO NOTHING;
