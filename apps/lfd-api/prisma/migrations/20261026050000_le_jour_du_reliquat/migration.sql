-- LE JOUR DU RELIQUAT — plan E7, lot L1
-- (`documentation/commandes/plan-e7-reliquat-bati.md`, choix 2) : un BL de
-- rang > 1 est un reliquat, né d'une décision, et porte SON jour de service.
-- Le BL-1 n'en porte jamais : sa date est celle de la commande, sans copie, et
-- la colonne y reste NULL pour toujours. Personne ne la lit encore (L7, L8).
--
-- Aucune donnée existante n'est touchée : tous les BL écrits sont de rang 1
-- (vérifié en base de dev le 2026-10-26 : 26 BL, tous rang 1), donc la
-- contrainte tient dès sa pose.
--
-- ADDITIVE. Retour arrière, sans perte tant qu'aucun BL de rang > 1 n'a été
-- écrit :
--   ALTER TABLE "public"."delivery_note" DROP CONSTRAINT "delivery_note_service_day_beyond_first_rank";
--   ALTER TABLE "public"."delivery_note" DROP COLUMN "service_day";

ALTER TABLE "public"."delivery_note"
    ADD COLUMN "service_day" DATE;

ALTER TABLE "public"."delivery_note"
    ADD CONSTRAINT "delivery_note_service_day_beyond_first_rank"
    CHECK ("rank" = 1 OR "service_day" IS NOT NULL);
