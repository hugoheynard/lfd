-- Retour arrière : `prisma/rollback/20261105160000_le_franco_fige_sur_la_commande.sql`.
-- Rien ne remplit ces colonnes avant le sous-lot 1b : le retour du code seul
-- suffit, les colonnes restent, toutes NULL.
--
-- LE FRANCO FIGÉ SUR LA COMMANDE — plan
-- `documentation/promotions/plan-livraison-offerte.md`, sous-lot 1a (décisions
-- de Hugo du 2026-11-05 : la ligne « Livraison offerte » est AFFICHÉE, pas
-- comptable ; le frais facturé vaut 0 et la commande fige « offerte, aurait
-- coûté X » ; en révision, le seuil figé, jamais le réglage du jour).
--
-- ADDITIVE : trois colonnes NULLABLES sur `orders`, sans défaut, laissées
-- NULL. `NULL` = pas de franco, ce qui est vrai de toute commande existante.
-- Aucune colonne existante touchée, aucune donnée reprise, aucun droit.
--
--   free_delivery_threshold_cents   le seuil HT appliqué (centimes)
--   free_delivery_waived_cents      ce que la livraison aurait coûté, HT
--   free_delivery_waived_ttc_cents  la même chose TTC, commande `exact_ht` seule
--
-- Le barème offert reste dans `delivery_fee_adjustment` (non NULL, CHECK) :
-- c'est lui que la révision rejugera contre le seuil figé (1b).
--
-- Verrous : `ADD COLUMN` nullable sans défaut ne réécrit pas la table
-- (ACCESS EXCLUSIVE). Les trois CHECK parcourent `orders` une fois sous ce
-- même verrou — Prisma joue le fichier d'un bloc, un `NOT VALID` suivi d'un
-- `VALIDATE` n'y gagnerait rien. La table compte quelques milliers de lignes
-- (pré-lancement) ; chaque CHECK est vrai sur une ligne aux trois colonnes
-- NULL, donc aucune ligne existante ne peut le faire échouer.
--
-- Les CHECK nomment `IS NOT NULL` : `NULL >= 0` n'est pas faux, et un seuil
-- sans montant passerait sinon. Le soldé (`billable_*`) et le BL ne changent
-- pas : une commande au franco y porte un frais nul, ce que leurs contraintes
-- admettent déjà.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN "free_delivery_threshold_cents" INTEGER,
  ADD COLUMN "free_delivery_waived_cents" INTEGER,
  ADD COLUMN "free_delivery_waived_ttc_cents" INTEGER;

-- Le seuil et le montant offert vont ensemble, positifs ou nuls.
ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_free_delivery_together" CHECK (
    ("free_delivery_threshold_cents" IS NULL AND "free_delivery_waived_cents" IS NULL)
    OR ("free_delivery_threshold_cents" IS NOT NULL
        AND "free_delivery_waived_cents" IS NOT NULL
        AND "free_delivery_threshold_cents" >= 0
        AND "free_delivery_waived_cents" >= 0)
  );

-- Le TTC offert existe pour une commande `exact_ht` au franco, et seulement elle.
ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_free_delivery_ttc_iff_exact_ht" CHECK (
    ("free_delivery_waived_ttc_cents" IS NOT NULL)
      = ("vat_method" = 'exact_ht' AND "free_delivery_threshold_cents" IS NOT NULL)
    AND ("free_delivery_waived_ttc_cents" IS NULL OR "free_delivery_waived_ttc_cents" >= 0)
  );

-- Au franco, rien n'est facturé, et le barème offert est figé.
ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_free_delivery_waives_fee" CHECK (
    "free_delivery_threshold_cents" IS NULL
    OR ("delivery_fee_cents" = 0
        AND COALESCE("delivery_fee_ttc_cents", 0) = 0
        AND "delivery_fee_adjustment" IS NOT NULL)
  );

