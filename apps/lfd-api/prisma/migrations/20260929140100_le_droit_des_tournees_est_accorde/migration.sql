-- LE DROIT DES TOURNÉES EST ACCORDÉ
--
-- Sur le modèle de `20260929120100_les_droits_de_la_livraison_sont_accordes` :
-- la table des rôles peut diverger du contrat en production, donc on AJOUTE la
-- ressource là où elle est absente, sans jamais écraser `grants` ni changer un
-- niveau déjà posé. Idempotent : rejoué, il ne trouve rien à ajouter.
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` disent la même chose
-- (`test/staff-role-grants-parity.e2e-spec.ts`).
--
-- | Droit             | Lecture         | Écriture        |
-- | ----------------- | --------------- | --------------- |
-- | `delivery_rounds` | admin, comptoir | admin, comptoir |
--
-- Q12 (Hugo) : le comptoir compose aussi. `write` emporte `read`.
--
-- Retour arrière : retirer `delivery_rounds` des `grants` des deux rôles. La
-- valeur d'enum reste (migration précédente).

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_rounds","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('admin', 'comptoir')
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_rounds'
  );
