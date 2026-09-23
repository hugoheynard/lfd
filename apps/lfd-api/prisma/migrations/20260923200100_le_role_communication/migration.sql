-- LE RÔLE COMMUNICATION, ET LE DROIT MÉDIATHÈQUE DE L'ADMINISTRATEUR
--
-- Séparée de la migration précédente parce que Postgres refuse d'UTILISER une
-- valeur d'enum dans la transaction qui l'ajoute. Les deux migrations ne se
-- séparent pas : appliquer celle-ci sans l'autre échoue.
--
-- ⚠️ `staff_role_definitions` est la SOURCE au runtime — `ROLE_GRANTS` du
-- contrat n'en est que le miroir, et la table gagne en cas de divergence. Un
-- rôle ajouté au seul code n'existerait donc pas pour le guard.

-- ── 1. LE RÔLE NEUF ────────────────────────────────────────────────────────
--
-- `media_library: write` est sa raison d'être. `pim_catalog: read` n'est pas
-- une largesse : le panneau « voir où sert cette image » liste les fiches qui
-- la portent, et ses liens y mènent. Sans ce droit, on saurait qu'une image
-- sert sans pouvoir aller voir — donc sans pouvoir décider de la remplacer.
--
-- `id` et `updated_at` sont fournis : leurs défauts sont posés par PRISMA, pas
-- par Postgres, et une insertion SQL qui les omettrait violerait le NOT NULL.
INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
VALUES (
  gen_random_uuid()::text,
  'communication',
  'Communication',
  '[{"resource":"media_library","action":"write"},{"resource":"pim_catalog","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- ── 2. L'ADMINISTRATEUR COUVRE TOUT, SANS TROU ─────────────────────────────
--
-- C'est l'invariant du modèle, et un test le vérifie explicitement : un
-- `admin` incomplet est le premier pas vers un droit que personne ne peut
-- exercer.
--
-- ⚠️ Idempotent : on n'ajoute que si la ressource n'y est pas déjà. Rejouer
-- cette migration sur une base à jour ne doit pas dupliquer l'entrée — un
-- tableau `jsonb` accepte les doublons sans rien dire, et
-- `resolveStaffPermissions` les lirait deux fois.
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"media_library","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'media_library'
  );

-- ── 3. CE QU'ON NE FAIT PAS, ET POURQUOI ───────────────────────────────────
--
-- Aucun backfill des dérogations individuelles, aucun élargissement aux autres
-- rôles. Le précédent (2026-09-01, §2) en posait un parce que l'éclatement de
-- `pim_catalog` devait RECONDUIRE les accès. Ici c'est l'inverse qui est
-- voulu : `commercial`, `comptabilite` et `dev` PERDENT l'accès au fonds, y
-- compris en lecture. Illustrer une fiche devient le travail de la
-- communication.
--
-- 🔴 Conséquence à connaître avant de promouvoir : sur une fiche produit, le
-- bouton « Choisir dans la médiathèque » rendra 403 pour ces trois rôles.
