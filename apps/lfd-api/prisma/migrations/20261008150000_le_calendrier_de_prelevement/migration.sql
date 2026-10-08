-- LE CALENDRIER DE PRÉLÈVEMENT — lot PA1
-- (`documentation/facturation/plan-prelevement-automatique.md`)
--
-- Additive : des colonnes neuves, toutes avec un défaut qui ne change rien à
-- l'existant.
--
-- 1. Sur l'entité émettrice, les réglages du prélèvement automatique :
--    - `auto_collection_enabled` : FAUX. Aucune migration ne l'active ; c'est
--      un fait de journal (`legal_entity.auto_collection_enabled`).
--    - `auto_collection_delay_hours` : 1 h après la clôture, entre 1 et 23 —
--      la constitution reste le jour de la clôture, donc le préavis entier.
--    - `collection_days_after_closure` : N, NULL = le délai de
--      pré-notification. L'échéance d'un lot constitué après ce déploiement
--      ne change donc que par le report au jour ouvré TARGET2 suivant.
--      « N ≥ délai » est tenu par l'agrégat (deux colonnes, une règle).
--    - `deposit_cutoff_business_days` / `deposit_cutoff_time` : le cut-off du
--      portail, NULL = « à renseigner ». Les deux ensemble, ou aucun.
--
-- 2. Sur le lot, `requested_collection_day` (DATE) : l'échéance figée à la
--    constitution, celle du XML. NULL pour les lots d'avant : on n'invente
--    pas leur valeur, leur XML stocké fait foi.
--
-- Retour arrière : supprimer les colonnes et les CHECK ; aucune donnée
-- existante n'a été réécrite.

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "auto_collection_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "auto_collection_delay_hours" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "collection_days_after_closure" INTEGER,
  ADD COLUMN "deposit_cutoff_business_days" INTEGER,
  ADD COLUMN "deposit_cutoff_time" TEXT;

ALTER TABLE "public"."legal_entities"
  ADD CONSTRAINT "legal_entities_auto_collection_delay_hours_range"
    CHECK ("auto_collection_delay_hours" BETWEEN 1 AND 23),
  ADD CONSTRAINT "legal_entities_collection_days_after_closure_range"
    CHECK ("collection_days_after_closure" IS NULL OR "collection_days_after_closure" BETWEEN 1 AND 60),
  ADD CONSTRAINT "legal_entities_deposit_cutoff_complete"
    CHECK (("deposit_cutoff_business_days" IS NULL) = ("deposit_cutoff_time" IS NULL)),
  ADD CONSTRAINT "legal_entities_deposit_cutoff_range"
    CHECK ("deposit_cutoff_business_days" IS NULL OR "deposit_cutoff_business_days" BETWEEN 1 AND 10),
  ADD CONSTRAINT "legal_entities_deposit_cutoff_time_format"
    CHECK ("deposit_cutoff_time" IS NULL OR "deposit_cutoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "public"."collection_batch" ADD COLUMN "requested_collection_day" DATE;
