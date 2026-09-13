-- **Faire de la place à un mandat que nous frappons nous-mêmes.**
--
-- Trois desserrages, une colonne, trois index. Tout est additif ou élargissant :
-- aucune donnée n'est convertie, aucune ligne existante n'est touchée.
--
-- ─── Les trois desserrages ───────────────────────────────────────────────────
--
-- `accepted_at`, `stripe_customer_id` et `payment_method_id` sont NOT NULL parce
-- que le modèle a été écrit pour Stripe : un mandat y naissait signé, chez un
-- tiers. Un brouillon maison n'a ni l'un ni les autres.
--
-- 🔴 **Desserrer est réversible au DDL, et cesse de l'être à la première
-- frappe.** Dès qu'une ligne porte `accepted_at IS NULL`, remettre le NOT NULL
-- demande une migration de DONNÉES — c'est-à-dire décider quelle date inventer
-- pour un mandat qui n'a jamais été signé. La fenêtre de retour arrière se
-- referme au premier brouillon écrit, pas au merge.
ALTER TABLE "public"."payment_mandates" ALTER COLUMN "accepted_at" DROP NOT NULL;
ALTER TABLE "public"."payment_mandates" ALTER COLUMN "stripe_customer_id" DROP NOT NULL;
ALTER TABLE "public"."payment_mandates" ALTER COLUMN "payment_method_id" DROP NOT NULL;

-- ─── L'émetteur ──────────────────────────────────────────────────────────────
--
-- Quelle de NOS entités a émis ce mandat.
--
-- Nullable, et ce n'est PAS pour les mandats existants : il n'y en a aucun —
-- zéro ligne dans `payment_mandates`, aucun mandat chez Stripe, et aucune route
-- ne sait en créer (`create()` n'a pas d'appelant de production, vérifié le
-- 2026-09-12). Le nul sert à ce qui VIENDRA : une reprise de portefeuille
-- apporte des RUM émises sous l'ICS d'un autre créancier, qu'on ne peut ni
-- refaire signer ni attribuer à une de nos entités. C'est le cas que
-- `documentation/comptabilite/rum.md` §5 nomme, et le seul qui justifie la
-- colonne nullable.
ALTER TABLE "public"."payment_mandates" ADD COLUMN "creditor_id" TEXT;
ALTER TABLE "public"."payment_mandates"
  ADD CONSTRAINT "payment_mandates_creditor_id_fkey"
  FOREIGN KEY ("creditor_id") REFERENCES "public"."legal_entities"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─── Les trois index ─────────────────────────────────────────────────────────
--
-- 🔴 **`COALESCE(creditor_id, 'LEGACY')` et pas `creditor_id` nu.** Dans un
-- index d'unicité, `NULL` est distinct de `NULL` : sur la colonne nue, deux
-- mandats actifs sans émetteur connu coexisteraient sur la même société sans
-- que rien ne s'y oppose. Aucun mandat de ce genre n'existe aujourd'hui — la
-- table est vide — mais ce sont exactement ceux qu'une reprise de portefeuille
-- apporterait, et qu'on ne peut pas refaire signer. L'unicité doit couvrir ce
-- qu'on REÇOIT, pas seulement ce qu'on fabrique : c'est même le seul cas pour
-- lequel elle est irremplaçable, nos propres frappes portant déjà 30 bits de
-- tirage.
--
-- ⚠️ **Le nouvel index actif est créé AVANT que l'ancien soit retiré.** Les
-- migrations d'ici ne sont pas atomiques : dans l'ordre inverse, un échec entre
-- les deux gestes laisserait la table SANS aucune garantie d'unicité sur le
-- mandat actif, et rien ne le dirait.
CREATE UNIQUE INDEX "payment_mandates_one_active_per_company_creditor"
  ON "public"."payment_mandates" ("company_id", COALESCE("creditor_id", 'LEGACY'))
  WHERE "status" = 'active';

DROP INDEX IF EXISTS "public"."payment_mandates_one_active_per_company";

-- Un seul brouillon par société : deux brouillons coexistants feraient deux RUM
-- imprimées, et le scan qui revient ne dirait pas laquelle il signe.
CREATE UNIQUE INDEX "payment_mandates_one_draft_per_company"
  ON "public"."payment_mandates" ("company_id")
  WHERE "status" = 'draft';

-- L'unicité de la RUM par créancier — celle que `documentation/comptabilite/rum.md`
-- §5 réclame. Elle vaut pour les références importées comme pour les nôtres,
-- d'où le même `COALESCE` : une reprise de portefeuille est exactement le cas
-- contre lequel cet index existe.
CREATE UNIQUE INDEX "payment_mandates_reference_unique_per_creditor"
  ON "public"."payment_mandates" (COALESCE("creditor_id", 'LEGACY'), "reference");
