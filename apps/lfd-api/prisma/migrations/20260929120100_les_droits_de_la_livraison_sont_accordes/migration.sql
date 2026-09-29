-- LES DROITS DE LA LIVRAISON SONT ACCORDÉS
--
-- Sur le modèle de `20260929100100_la_surtaxe_de_retard_est_accordee` : la
-- table des rôles peut diverger du contrat en production, donc on AJOUTE la
-- ressource là où elle est absente, sans jamais écraser `grants` ni changer un
-- niveau déjà posé. Idempotent : rejoué, il ne trouve rien à ajouter.
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` disent la même chose
-- (`test/staff-role-grants-parity.e2e-spec.ts`).
--
-- | Droit                | Lecture                                  | Écriture |
-- | -------------------- | ---------------------------------------- | -------- |
-- | `delivery_run_sheet` | admin, comptoir, support, commercial     | admin    |
-- | `delivery_settings`  | admin, comptoir                          | admin    |
--
-- ⚠️ Un DÉPLACEMENT assumé : la feuille de route était servie sous
-- `b2b_orders`, que `comptabilite` a aussi. Elle n'en reçoit pas la lecture
-- (Hugo, Q8) et la perd donc. Rien ne se retire de `grants`.
--
-- Retour arrière : retirer `delivery_run_sheet` et `delivery_settings` des
-- `grants` des quatre rôles. Les valeurs d'enum restent (migration précédente).

-- ── 1. L'ADMINISTRATEUR COUVRE TOUT, SANS TROU ───────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_run_sheet","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_run_sheet'
  );

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_settings","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_settings'
  );

-- ── 2. LE COMPTOIR LIT LA FEUILLE ET LES RÉGLAGES ────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_run_sheet","action":"read"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'comptoir'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_run_sheet'
  );

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_settings","action":"read"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'comptoir'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_settings'
  );

-- ── 3. LE SUPPORT ET LE COMMERCIAL GARDENT LA FEUILLE DE ROUTE ───────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_run_sheet","action":"read"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'support'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_run_sheet'
  );

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_run_sheet","action":"read"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'commercial'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_run_sheet'
  );
