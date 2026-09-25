-- LA SUPERVISION EST ACCORDÉE — à l'administrateur, et à lui seul
--
-- Aucun autre rôle ne la reçoit d'office (Hugo, 2026-09-25). Aucune
-- reconduction par contenu ni écart jumeau : la vue est neuve, personne ne
-- la perd.
--
-- `write` et non `read` : c'est l'invariant du modèle — l'administrateur
-- couvre tout, sans trou (`ROLE_GRANTS`, et un test du contrat l'exige).
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` doivent dire la même chose.
--
-- ⚠️ Idempotent : on n'ajoute que si la ressource n'y est pas déjà. Un
-- tableau `jsonb` accepte les doublons sans rien dire.
--
-- Retour arrière : retirer `b2b_supervision` des `grants` de `admin`. La
-- valeur d'enum reste (migration précédente).
--
-- Plan : documentation/order/plan-supervision-du-jour.md, « Serveur »

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_supervision","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_supervision'
  );
