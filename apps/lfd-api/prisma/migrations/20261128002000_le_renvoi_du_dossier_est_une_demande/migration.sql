-- LE RENVOI DU DOSSIER EST UNE DEMANDE
-- (documentation/fournil/plan-historique-des-tirages.md, lot H6).
--
-- Le dossier de l'arrêt part en envoi immédiat : sa trace passe de `pending`
-- à `sent` ou `failed` sur le reçu de Resend. Le dossier MIS À JOUR, renvoyé
-- à la main, part par la boîte d'envoi du bloc `mail` (`mail.send`) : sa
-- trace est écrite dans la même transaction que la demande, et rien n'est
-- encore parti au moment où elle se valide. Elle dit donc `requested` — la
-- demande est faite, l'envoi relancé tant que Resend ne l'a pas pris —, et
-- jamais `sent`, qui affirmerait un reçu qu'on n'a pas.
--
-- Additive : le CHECK s'élargit d'une valeur, aucune ligne ne change, et le
-- binaire d'avant n'écrit jamais cette valeur.
--
-- Retour arrière : `prisma/rollback/20261128002000_le_renvoi_du_dossier_est_une_demande.sql`.
SET lock_timeout = '5s';

ALTER TABLE "production"."production_dossier_dispatch"
  DROP CONSTRAINT "production_dossier_dispatch_outcome_check";

ALTER TABLE "production"."production_dossier_dispatch"
  ADD CONSTRAINT "production_dossier_dispatch_outcome_check"
  CHECK ("outcome" IN ('pending', 'sent', 'failed', 'requested'));
