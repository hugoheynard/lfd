-- ───────────────────────────────────────────────────────────────────────────
-- LE PRIX PUBLIC ARRIVE JUSQU'À L'ARTICLE DU MIROIR.
--
-- Cf. documentation/pim/plan-un-seul-canal-deux-prix.md — lot A2.
--
-- Le miroir ne connaissait qu'un prix : le professionnel. Un particulier servi
-- par la boutique payait donc le tarif pro, au taux de TVA pro. Le fil porte
-- l'étiquette et son taux par contexte depuis la v9 (lot A1) ; ces deux
-- colonnes sont l'endroit où elles se posent.
--
-- ADDITIVE, et strictement. Deux colonnes NULLABLES, aucune valeur par défaut,
-- aucune donnée touchée. L'instance d'avant les ignore ; celle d'après lit NULL
-- sur toutes les lignes tant qu'un push complet n'a pas tourné.
--
-- 🔴 NULL NE VEUT PAS DIRE « GRATUIT ». Il veut dire « on ne sait pas encore ce
-- qu'un particulier paierait », et c'est au lecteur de refuser de vendre plutôt
-- que d'inventer un prix — le même refus que `vat_rate_percent` NULL, qui
-- écarte déjà l'article de la boutique au lieu de supposer 5,5 %.
--
-- RETOUR ARRIÈRE : un DROP COLUMN des deux, sans perte — le référentiel les
-- réémet au push suivant. Rien d'autre ne les écrit.
--
-- LE REMPLISSAGE N'EST PAS ICI, et c'est voulu : c'est un PUSH COMPLET, pas une
-- migration de données. Le référentiel republie tout le catalogue, et les deux
-- colonnes apparaissent article par article. Les calculer en SQL demanderait de
-- recopier ici la dérivation du hors taxe — soit deux arrondis pour un montant.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "public_ttc_cents" INTEGER,
  ADD COLUMN "public_by_context" JSONB;
