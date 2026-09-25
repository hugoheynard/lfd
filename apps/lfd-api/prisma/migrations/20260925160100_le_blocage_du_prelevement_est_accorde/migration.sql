-- LE BLOCAGE DU PRÉLÈVEMENT EST ACCORDÉ — admin et comptabilité, à eux seuls
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` doivent dire la même chose : la
-- table est ce que l'écran des rôles lit et édite, le contrat ce que le guard
-- résout. Un test rejoue ces deux instructions
-- (`test/deferred-payment-block-roles-migration.e2e-spec.ts`).
--
-- ⚠️ Idempotents : on n'ajoute que si la ressource n'y est pas déjà. Un
-- tableau `jsonb` accepte les doublons sans rien dire.
--
-- Retour arrière : un UPDATE qui retire l'entrée des deux rôles. La valeur
-- d'enum reste (migration précédente).

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_deferred_payment_block","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_deferred_payment_block'
  );

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_deferred_payment_block","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'comptabilite'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_deferred_payment_block'
  );
