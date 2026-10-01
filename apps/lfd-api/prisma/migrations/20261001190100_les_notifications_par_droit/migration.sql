-- LES NOTIFICATIONS ADRESSÉES PAR DROIT — `staff_notifications.audience`
--
-- Retour arrière : `DROP INDEX "public"."staff_notifications_audience_read_at_idx";
-- ALTER TABLE "public"."staff_notifications" DROP COLUMN "audience";`.
-- ⚠️ À faire APRÈS être revenu à un binaire qui ne l'écrit pas : sans la
-- colonne, les notices d'audience déjà écrites redeviendraient des notices du
-- fil PARTAGÉ — un livreur ou un comptable verrait « Arrêt à décider » s'il a
-- la cloche. Supprimer d'abord ces lignes (`WHERE audience IS NOT NULL`) si
-- l'on revient en arrière.
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, LB-Q3 (B5), sur la
-- mécanique de `plan-tournee-prete.md` PL5-D1/D2, avec une AUDIENCE par droit
-- (`resource:action`) au lieu d'un destinataire.
--
-- Nulle : le fil partagé, inchangé. Renseignée : visible et poussée
-- seulement à qui tient ce droit. Le mur est dans chaque requête (adaptateur
-- `prisma-staff-notifications.ts`), pas ici : la base ne connaît pas les
-- droits, qui se résolvent par rôle et dérogations.
--
-- Strictement ADDITIVE : une colonne nullable, sans défaut, et un index.
-- L'ancien binaire ne la lit pas et n'écrit que des notices partagées
-- (nulles). ⚠️ Pendant la fenêtre de déploiement seulement, s'il sert encore
-- la cloche, il montrerait au fil partagé une notice d'audience écrite par le
-- nouveau : quelques secondes, sur des notices sans montant ni coordonnées —
-- assumé.

ALTER TABLE "public"."staff_notifications" ADD COLUMN IF NOT EXISTS "audience" TEXT;

CREATE INDEX IF NOT EXISTS "staff_notifications_audience_read_at_idx"
  ON "public"."staff_notifications"("audience", "read_at");
