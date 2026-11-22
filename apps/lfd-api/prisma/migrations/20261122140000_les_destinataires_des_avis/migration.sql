-- LES DESTINATAIRES DES AVIS — lot P1c du plan
-- documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md, §2.4 bis.
--
-- Additive : une table neuve, rien d'existant n'est touché. Pour un modèle
-- d'e-mail, un rôle OU un membre par ligne ; une table vide laisse l'avis
-- partir à la boîte de l'équipe, comme avant.
--
-- Retour arrière : `DROP TABLE "public"."staff_notice_audience";` (le réglage
-- se perd, l'avis repart à la boîte de l'équipe).

CREATE TABLE "public"."staff_notice_audience" (
    "id" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "role_key" TEXT,
    "staff_user_id" TEXT,
    "created_by_staff_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_notice_audience_pkey" PRIMARY KEY ("id"),
    -- L'un des deux exactement : un rôle, ou un membre.
    CONSTRAINT "staff_notice_audience_one_target"
        CHECK (("role_key" IS NULL) <> ("staff_user_id" IS NULL))
);

CREATE UNIQUE INDEX "staff_notice_audience_template_role_key_key"
    ON "public"."staff_notice_audience"("template", "role_key");
CREATE UNIQUE INDEX "staff_notice_audience_template_staff_user_id_key"
    ON "public"."staff_notice_audience"("template", "staff_user_id");

-- Pas de clé étrangère vers les définitions de rôles : une migration ne nomme
-- pas cette table (`lint:no-role-grants-in-migrations`). L'agrégat refuse un
-- rôle inconnu ou archivé à l'écriture ; un rôle qui disparaît ensuite ne
-- fait plus partir d'avis à personne, et l'avis retombe sur la boîte de
-- l'équipe.

ALTER TABLE "public"."staff_notice_audience"
    ADD CONSTRAINT "staff_notice_audience_staff_user_id_fkey"
    FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
