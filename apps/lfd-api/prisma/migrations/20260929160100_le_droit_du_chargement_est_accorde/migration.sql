-- LE DROIT DU CHARGEMENT EST ACCORDÉ
--
-- Sur le modèle de `20260929140100_le_droit_des_tournees_est_accorde` : la
-- table des rôles peut diverger du contrat en production, donc on AJOUTE la
-- ressource là où elle est absente, sans jamais écraser `grants` ni changer un
-- niveau déjà posé. Idempotent : rejoué, il ne trouve rien à ajouter.
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` disent la même chose
-- (`test/staff-role-grants-parity.e2e-spec.ts`).
--
-- | Droit              | Lecture         | Écriture        |
-- | ------------------ | --------------- | --------------- |
-- | `delivery_loading` | admin, comptoir | admin, comptoir |
--
-- Q21 (Hugo) : le comptoir déclare les sacs et charge. `write` emporte `read`.
--
-- Retour arrière : retirer `delivery_loading` des `grants` des deux rôles. La
-- valeur d'enum reste (migration précédente).

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_loading","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('admin', 'comptoir')
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_loading'
  );
