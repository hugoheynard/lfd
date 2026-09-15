-- Le schéma SEPA devient un réglage de l'entité, FIGÉ sur chaque mandat à la
-- frappe — plan `documentation/comptabilite/plan-mandat-deux-schemas.md`.
--
-- Additive et réversible (§0) : un type, trois colonnes, aucune suppression.
--
-- ## Les défauts des lignes existantes
--
-- - `legal_entities.mandate_scheme` = `B2B` : ce que le lot déclare depuis le
--   premier jour, et le contrat signé avec la Caisse d'Épargne.
-- - `payment_mandates.scheme` = `B2B` : aucun mandat n'existe en production
--   (dit par Hugo le 2026-09-15). Les brouillons de développement portent le
--   texte interentreprises depuis `dfeca850`.
-- - `payment_mandates.payment_type` = le réglage **réel** de l'émetteur au
--   moment de la migration, pas une constante — c'est ce réglage qui a coché
--   la case du papier. `recurrent` pour une ligne sans émetteur (RUM reprise).
--
-- 🔴 Les deux colonnes du mandat PERDENT leur défaut dans la même migration :
-- un défaut resté en place rendrait silencieux l'oubli du schéma à la frappe.
CREATE TYPE "public"."SepaScheme" AS ENUM ('CORE', 'B2B');

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "mandate_scheme" "public"."SepaScheme" NOT NULL DEFAULT 'B2B';

ALTER TABLE "public"."payment_mandates"
  ADD COLUMN "scheme" "public"."SepaScheme" NOT NULL DEFAULT 'B2B',
  ADD COLUMN "payment_type" "public"."MandatePaymentType" NOT NULL DEFAULT 'recurrent';

UPDATE "public"."payment_mandates" AS m
SET "payment_type" = e."mandate_payment_type"
FROM "public"."legal_entities" AS e
WHERE e."id" = m."creditor_id";

ALTER TABLE "public"."payment_mandates"
  ALTER COLUMN "scheme" DROP DEFAULT,
  ALTER COLUMN "payment_type" DROP DEFAULT;
