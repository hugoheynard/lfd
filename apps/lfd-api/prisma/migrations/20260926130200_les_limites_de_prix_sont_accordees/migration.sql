-- LES LIMITES DE PRIX SONT ACCORDÉES — à l'administrateur et à la comptabilité, seuls
--
-- Plan : documentation/comptabilite/plan-limites-de-prix.md §5.
--
-- Sur le modèle de `20260926120100_les_droits_jamais_ecrits` et de
-- `20260926100100_le_comptoir_est_accorde` : la table des rôles peut diverger
-- du contrat en production, donc on AJOUTE la ressource là où elle est absente,
-- sans jamais écraser `grants` ni changer un niveau déjà posé. Idempotent :
-- rejoué, il ne trouve rien à ajouter.
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` disent la même chose
-- (`test/staff-role-grants-parity.e2e-spec.ts`).
--
-- 🔴 Personne d'autre, et c'est une décision (Hugo, 2026-09-25) : les
-- commerciaux n'ont PAS accès au bloc Comptabilité. Qui price voit la limite
-- pro par la ligne en lecture seule de la Tarification B2B, que sert le tableau
-- sous `b2b_pricing:read` — pas par ce droit. Aucune sélection par contenu,
-- aucun écart jumeau.
--
-- Retour arrière : retirer `lfc_price_limits` des `grants` d'admin et de
-- comptabilite. La valeur d'enum reste (migration précédente).

-- ── 1. L'ADMINISTRATEUR COUVRE TOUT, SANS TROU ─────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"lfc_price_limits","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'lfc_price_limits'
  );

-- ── 2. LA COMPTABILITÉ POSE LES LIMITES ────────────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"lfc_price_limits","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'comptabilite'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'lfc_price_limits'
  );
