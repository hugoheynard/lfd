-- LA RÉPONSE PAR E-MAIL — le type (plan
-- `documentation/demandes-client/plan-reponses-par-e-mail.md`, R1, 2026-10-28).
--
-- Un client répond à un de nos e-mails ; Resend reçoit, et la réponse devient
-- une demande client de la boîte existante, d'un type de plus.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute, et la migration suivante l'emploie (CHECK, motif
-- système).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."RequestKind" ADD VALUE IF NOT EXISTS 'email_reply';
