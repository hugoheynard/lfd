-- RETOUR ARRIÈRE de 20261104110000_le_rapport_pro_quitte_la_base.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Recrée la table VIDE, avec ses deux contraintes. La ligne supprimée ne se
-- reconstitue pas : aucun code ne la lit depuis le 2026-10-27, et « aucune
-- ligne » était déjà un état valable (rien réglé).

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "pim"."accounting_rules" (
  "id" TEXT NOT NULL,
  "pro_price_ratio_bp" INTEGER NOT NULL,
  "pro_price_method" TEXT NOT NULL DEFAULT 'entered',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_rules_pro_ratio_bounds"
    CHECK ("pro_price_ratio_bp" > 0 AND "pro_price_ratio_bp" <= 10000),
  CONSTRAINT "accounting_rules_method_known" CHECK ("pro_price_method" = 'entered')
);
