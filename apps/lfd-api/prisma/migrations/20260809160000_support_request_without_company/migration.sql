-- Une demande de rappel n'exige plus une entreprise : un prospect qui n'en a pas
-- encore déclaré est exactement la population qu'on cherche à capter. Sans
-- société, la demande porte sur la personne — d'où l'index sur le demandeur, qui
-- porte désormais la règle « une seule demande ouverte à la fois ».
ALTER TABLE "public"."support_requests"
    ALTER COLUMN "company_id" DROP NOT NULL;

CREATE INDEX "support_requests_requested_by_user_id_idx"
    ON "public"."support_requests"("requested_by_user_id");
