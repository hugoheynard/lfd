-- LA FICHE DE RÉASSORT RETIRÉE, PLUS EFFACÉE — la réouverture d'un plan
-- retirait les fiches de réassort du soir intouchées par un `DELETE`
-- physique ; la fiche est un agrégat (`PackingResupply`, verrouillé, clos au
-- poste) que trois lecteurs relisent (le poste, l'avancement du colisage, la
-- réception au point). Elle passe désormais à un statut : `withdrawn_at`
-- (audit du réassort, 2026-11-02).
--
-- ADDITIVE : une colonne nullable, une contrainte qui ne vise que les
-- lignes où elle est posée — aucune ligne existante n'est touchée ni
-- refusée (toutes ont `withdrawn_at` à NULL).
--
-- Une fiche retirée n'a jamais été entamée : elle n'est pas close (CHECK).
-- Un nouvel arrêt du même plan la rétablit (`withdrawn_at` remis à NULL).
--
-- Retour arrière : `prisma/rollback/20261102270000_la_fiche_de_reassort_retiree.sql`.

SET lock_timeout = '5s';

ALTER TABLE "packing"."packing_resupply"
  ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6);

ALTER TABLE "packing"."packing_resupply"
  ADD CONSTRAINT "packing_resupply_withdrawn_untouched"
  CHECK ("withdrawn_at" IS NULL OR "closed_at" IS NULL);
