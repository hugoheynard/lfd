-- Un reçu par réassort (lot R2 de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md §12, Hugo
-- 2026-10-21 : « personne ne fera du ligne par ligne en plein service »).
--
-- La réception était UNE liste par (point, journée). Elle devient un reçu par
-- réassort envoyé (`resupply_id`), avec l'ATTENDU et le REÇU de chaque ligne,
-- plus au plus un « réassort sans commande » par (point, journée)
-- (`resupply_id` nul) — la saisie ligne par ligne d'avant, gardée en secours.
--
-- ⚠️ NON ADDITIVE, et c'est délibéré : elle RETIRE l'index unique
-- `resupply_receipt_site_id_service_day_key`. La table vient de
-- `20261021150000_la_reception_du_reapprovisionnement`, qui n'a JAMAIS été
-- déployée (absente de origin/main, vérifié le 2026-10-21) : aucune donnée
-- de production ne la remplit. Les lignes de dev existantes deviennent des
-- réassorts sans commande, reçus à l'instant de leur dernier geste.
-- Aucun droit n'est accordé.

ALTER TABLE "public"."resupply_receipt"
  ADD COLUMN "resupply_id" TEXT,
  ADD COLUMN "received_at" TIMESTAMP(3),
  ADD COLUMN "received_by_staff_id" TEXT,
  ADD COLUMN "received_by_name" TEXT,
  ADD COLUMN "received_by_role" TEXT;

UPDATE "public"."resupply_receipt" SET
  "received_at" = "updated_at",
  "received_by_staff_id" = "updated_by_staff_id",
  "received_by_name" = "updated_by_name",
  "received_by_role" = "updated_by_role";

-- Un reçu n'est écrit qu'une fois reçu : « Réceptionner » pour un réassort,
-- la première saisie pour un réassort sans commande.
ALTER TABLE "public"."resupply_receipt"
  ALTER COLUMN "received_at" SET NOT NULL,
  ALTER COLUMN "received_by_staff_id" SET NOT NULL,
  ALTER COLUMN "received_by_name" SET NOT NULL,
  ALTER COLUMN "received_by_role" SET NOT NULL;

DROP INDEX "public"."resupply_receipt_site_id_service_day_key";

CREATE INDEX "resupply_receipt_site_id_service_day_idx"
  ON "public"."resupply_receipt"("site_id", "service_day");

-- Un reçu par réassort : un second « Réceptionner » concurrent est refusé.
CREATE UNIQUE INDEX "resupply_receipt_resupply_id_key"
  ON "public"."resupply_receipt"("resupply_id");

-- Au plus un réassort sans commande par (point, journée).
CREATE UNIQUE INDEX "resupply_receipt_unordered_key"
  ON "public"."resupply_receipt"("site_id", "service_day")
  WHERE "resupply_id" IS NULL;

ALTER TABLE "public"."resupply_receipt" ADD CONSTRAINT "resupply_receipt_resupply_id_fkey"
  FOREIGN KEY ("resupply_id") REFERENCES "public"."site_resupply"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- L'attendu : la quantité demandée au réassort ; nul sur un réassort sans commande.
ALTER TABLE "public"."resupply_receipt_line"
  ADD COLUMN "expected_quantity" INTEGER,
  ADD CONSTRAINT "resupply_receipt_line_expected_non_negative"
    CHECK ("expected_quantity" IS NULL OR "expected_quantity" >= 0);
