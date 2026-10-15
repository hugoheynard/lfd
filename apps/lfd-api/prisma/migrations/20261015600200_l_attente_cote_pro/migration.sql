-- L'ATTENTE CÔTÉ PRO — lot 3 de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md`, décision de
-- Hugo du 2026-10-15 (option 2) : un article neuf attend la validation pour
-- les PROS aussi, pas seulement pour le public.
--
-- `catalog_items.pro_review_pending`, jumeau de `public_review_pending`
-- (`20261015600000`) : posé par le SEUL récepteur des faits d'une fiche à la
-- CRÉATION d'une ligne dont l'audience contient `pro`, jamais ensuite ; levé
-- par le back-office (`POST admin/catalog/review/approve`). Tant qu'il est
-- posé, `servedTo` refuse l'article aux pros — commande comprise.
--
-- ADDITIF : toute ligne existante naît `false` — rien de ce qui se vend
-- aujourd'hui ne sort de la vente. Le push ne l'écrit jamais à `true`.
-- Retour arrière : supprimer la colonne.

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "pro_review_pending" BOOLEAN NOT NULL DEFAULT false;
