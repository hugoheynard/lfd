-- LE RÉASSORT PARTI (lot R4d de
-- documentation/reassort-boutiques/plan-au-plus-tot.md, §1 « Les états » —
-- Hugo 2026-10-22 : « donc tu peux lancer R4 »).
--
-- `public.site_resupply.departed_*` : l'AFFICHAGE « Parti à HH:MM (livreur) »,
-- posé par l'abonné du commerce au fait `delivery.transfer_departed` — la
-- tournée qui porte le transfert du réassort est partie. Aucun refus ne le
-- lit (« Réceptionner » reste permis à tout moment, le comptoir fait foi).
-- D'où des colonnes nullables, sans CHECK d'entièreté : une tournée sans
-- livreur part quand même, et son départ n'a pas d'auteur.
--
-- ADDITIVE : deux colonnes nullables, NULL partout. Rien de retiré, rien de
-- renommé, aucune donnée convertie. Aucun droit accordé.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN` des deux colonnes, une fois
-- qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "public"."site_resupply"
  ADD COLUMN "departed_at" TIMESTAMPTZ(6),
  ADD COLUMN "departed_by_name" TEXT;
