-- LE RÉASSORT « AU PLUS TÔT » LANCÉ (lot R4a de
-- documentation/reassort-boutiques/plan-au-plus-tot.md, §3 — Hugo
-- 2026-10-22 : « donc tu peux lancer R4 »).
--
-- `production.production_resupply` : le fournil y range désormais, à part des
-- réassorts figés à l'arrêt du soir (`kind = 'evening'`), les réassorts « au
-- plus tôt » qu'il LANCE dans la journée (`kind = 'asap'`), avec l'instant et
-- l'identifiant staff du lancement. Un lancé, et lui seul, porte son
-- lancement (CHECK `production_resupply_asap_launched`), entier
-- (CHECK `production_resupply_launch_whole`).
--
-- `public.site_resupply.launched_*` : l'AFFICHAGE « Lancé par X à HH:MM »,
-- posé par l'abonné du commerce au fait `production.resupply_launched`. Le
-- refus d'annuler un réassort lancé ne le lit pas : il est synchrone, au
-- fournil, sous le verrou de la journée. D'où des colonnes nullables, sans
-- CHECK d'entièreté — un auteur que l'annuaire ne nomme pas reste `NULL`.
--
-- ADDITIVE : `kind` naît avec un défaut (`evening`), que toutes les lignes
-- existantes prennent — elles sont toutes des réassorts figés à l'arrêt ;
-- les autres colonnes sont nullables et NULL partout, ce que les deux CHECK
-- admettent. Rien de retiré, rien de renommé, aucune donnée convertie. Aucun
-- droit accordé. Les déclencheurs `day_change` des deux tables
-- (`20261022140000`) couvrent déjà ces colonnes : ils sont par instruction.
--
-- Retour arrière du SCHÉMA : `DROP CONSTRAINT` des trois CHECK puis
-- `DROP COLUMN` des cinq colonnes, une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_resupply"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'evening',
  ADD COLUMN "launched_at" TIMESTAMPTZ(6),
  ADD COLUMN "launched_by" TEXT,
  ADD CONSTRAINT "production_resupply_kind_known" CHECK ("kind" IN ('evening', 'asap')),
  ADD CONSTRAINT "production_resupply_launch_whole" CHECK (
    ("launched_at" IS NULL) = ("launched_by" IS NULL)
  ),
  ADD CONSTRAINT "production_resupply_asap_launched" CHECK (
    ("kind" = 'asap') = ("launched_at" IS NOT NULL)
  );

ALTER TABLE "public"."site_resupply"
  ADD COLUMN "launched_at" TIMESTAMPTZ(6),
  ADD COLUMN "launched_by_name" TEXT;
