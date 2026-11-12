-- L'adresse de réception d'un motif de demande devient FACULTATIVE.
--
-- Vide : aucun e-mail ne part ; la demande est rangée et arrive dans
-- « Demandes clients » au back-office, la cloche sonne comme avant.
-- Additive : la colonne accepte NULL, aucune valeur existante n'est réécrite
-- par ce DROP NOT NULL.
ALTER TABLE "public"."request_reason" ALTER COLUMN "recipient_email" DROP NOT NULL;

-- Décidé par Hugo le 2026-11-12 (« vide au deploy ») : par défaut, aucun
-- e-mail. TOUS les motifs existants perdent leur adresse ; l'équipe en
-- ressaisit une, à l'écran des motifs, là où elle veut un e-mail.
-- Aucun historique des réglages des motifs n'existe (leur écriture n'est pas
-- journalisée) : les adresses d'avant ne se relisent pas après ce passage,
-- elles sont à relever avant le déploiement.
UPDATE "public"."request_reason" SET "recipient_email" = NULL;
