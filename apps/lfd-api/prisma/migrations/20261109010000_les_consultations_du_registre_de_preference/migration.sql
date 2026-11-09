-- LES CONSULTATIONS DU REGISTRE DE PRÉFÉRENCE — plan
-- `documentation/mail/plan-desinscription-des-e-mails.md`, lot C4.
--
-- ADDITIVE : deux tables neuves dans le schéma `mail`. Aucune colonne
-- supprimée, renommée ni resserrée ; aucun droit accordé à aucun rôle.
--
-- - `mail_preference_consultation` : une consultation du registre par le
--   staff — `reveal` (une adresse affichée : `preference_id`) ou `search`
--   (une recherche par adresse : `fingerprint`, l'empreinte HMAC-SHA256 de
--   l'adresse normalisée, sous la clé de recherche du suivi). JAMAIS
--   l'adresse. Compte avec `mail_recipient_reveal` et `mail_recipient_search`
--   dans le plafond partagé de 30 consultations par heure et par personne.
-- - `mail_preference_consultation_hit` : les lignes trouvées par une
--   recherche, figées à son instant (ON DELETE CASCADE).
-- - Pas de clé étrangère vers `mail_marketing_preference` : la trace se purge
--   à 1 an sous `MAIL_REQUEST_PURGE`, la ligne de son côté.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE` des deux tables. Le code
-- d'avant ne les lit pas.

-- CreateTable
CREATE TABLE "mail"."mail_preference_consultation" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "staff_id" TEXT NOT NULL,
    "preference_id" TEXT,
    "fingerprint" VARCHAR(64),
    "consulted_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_preference_consultation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mail_preference_consultation_kind_check" CHECK (
        ("kind" = 'reveal' AND "preference_id" IS NOT NULL AND "fingerprint" IS NULL)
        OR ("kind" = 'search' AND "preference_id" IS NULL AND "fingerprint" ~ '^[0-9a-f]{64}$')
    )
);

-- CreateTable
CREATE TABLE "mail"."mail_preference_consultation_hit" (
    "consultation_id" TEXT NOT NULL,
    "preference_id" TEXT NOT NULL,

    CONSTRAINT "mail_preference_consultation_hit_pkey" PRIMARY KEY ("consultation_id","preference_id")
);

-- CreateIndex
CREATE INDEX "mail_preference_consultation_staff_id_consulted_at_idx" ON "mail"."mail_preference_consultation"("staff_id", "consulted_at");

-- CreateIndex
CREATE INDEX "mail_preference_consultation_staff_id_preference_id_consult_idx" ON "mail"."mail_preference_consultation"("staff_id", "preference_id", "consulted_at");

-- CreateIndex
CREATE INDEX "mail_preference_consultation_consulted_at_idx" ON "mail"."mail_preference_consultation"("consulted_at");

-- AddForeignKey
ALTER TABLE "mail"."mail_preference_consultation_hit" ADD CONSTRAINT "mail_preference_consultation_hit_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "mail"."mail_preference_consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
