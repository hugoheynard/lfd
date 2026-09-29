-- LA SURTAXE DE RETARD EST ACCORDÉE — à l'administrateur et à la comptabilité, seuls
--
-- Sur le modèle de `20260926130200_les_limites_de_prix_sont_accordees` : la
-- table des rôles peut diverger du contrat en production, donc on AJOUTE la
-- ressource là où elle est absente, sans jamais écraser `grants` ni changer un
-- niveau déjà posé. Idempotent : rejoué, il ne trouve rien à ajouter.
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` disent la même chose
-- (`test/staff-role-grants-parity.e2e-spec.ts`).
--
-- ⚠️ Un RESSERREMENT assumé : `b2b_settings:read` (commercial, comptabilité)
-- et `b2b_settings:write` ouvraient le réglage de la surtaxe ; il ne relève
-- plus que de `b2b_late_fee`. Le commercial perd l'écran — c'est le but (Hugo,
-- 2026-09-29). Rien ne se retire de `grants` : `b2b_settings` garde tout le
-- reste.
--
-- Retour arrière : retirer `b2b_late_fee` des `grants` d'admin et de
-- comptabilite. La valeur d'enum reste (migration précédente).

-- ── 1. L'ADMINISTRATEUR COUVRE TOUT, SANS TROU ─────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_late_fee","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_late_fee'
  );

-- ── 2. LA COMPTABILITÉ RÈGLE LA SURTAXE ────────────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_late_fee","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'comptabilite'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_late_fee'
  );
