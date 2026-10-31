-- Les jours et heures figés d'une remise de panier —
-- documentation/promotions/plan-jours-et-heures.md, § 8.2 et § 11.
--
-- Une promotion peut ne valoir qu'à certains jours et heures (condition
-- `weekly_hours`, rangée dans le JSONB `promotions.conditions` : rien à
-- migrer côté promotion). Jugée « au retrait », elle dépend du CRÉNEAU
-- choisi : changer de créneau en révision se juge contre ses heures
-- (L9), et la révision ne relit pas la promotion (plan des remises
-- acquises, § 10.2). Les heures se figent donc sur la remise, à côté des
-- autres termes figés.
--
-- Ce qu'elle fait — ADDITIVE, aucune ligne écrite :
--
-- 1. `order_discounts.weekly_hours` JSONB NULLABLE : la condition telle que
--    la promotion la portait ({kind, moment, announceOutside, windows}) ;
--    NULL = pas de jours ni d'heures (ou termes inconnus).
-- 2. Un CHECK : pas d'heures sans termes figés, comme `min_quantity`.
--
-- Aucune remise existante n'a d'heures : la reprise n'a rien à écrire.
--
-- Retour arrière : `prisma/rollback/20261101100000_les_heures_figees_des_remises.sql`.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_discounts"
  ADD COLUMN "weekly_hours" JSONB;

ALTER TABLE "public"."order_discounts"
  ADD CONSTRAINT "order_discounts_weekly_hours_with_terms" CHECK (
    "frozen_terms_origin" IS NOT NULL OR "weekly_hours" IS NULL
  );
