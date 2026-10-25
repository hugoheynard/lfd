-- LE CLIENT PRÉVENU DU DÉPART INCOMPLET — lot E6d de
-- documentation/commandes/plan-e6d-ecrire-au-client.md (§ 1).
--
-- Schéma seulement : AUCUNE donnée écrite. Tout naît nul.
--
-- « Écrire au client » est un geste à part, une fois par décision : la
-- décision garde l'instant de l'envoi et l'id de la fiche staff qui l'a fait
-- (pas une clé étrangère, comme `decided_by_staff_id`). Les deux vont
-- ensemble (CHECK). Le texte envoyé n'est pas gardé ici : le journal des
-- e-mails le tient.
--
-- ADDITIVE. Retour arrière : supprimer la contrainte puis les deux colonnes —
-- aucune n'est lue hors de ce lot.

ALTER TABLE "public"."order_shortfall_decision"
    ADD COLUMN "customer_notified_at" TIMESTAMPTZ(6),
    ADD COLUMN "customer_notified_by_staff_id" TEXT;

ALTER TABLE "public"."order_shortfall_decision"
    ADD CONSTRAINT "order_shortfall_decision_customer_notified_together"
        CHECK (("customer_notified_at" IS NULL) = ("customer_notified_by_staff_id" IS NULL));
