-- ÉCHÉANCE PAR DÉFAUT — `delivery_settings.window_mode`
--
-- Plan `documentation/livraisons/plan-composition-automatique.md`, §14.2
-- (Hugo, 2026-10-04) : le réglage général passe par défaut à `deadline`. La
-- migration CA3 (`20261003090000_creneau_ou_echeance`) est déjà appliquée en
-- dev : on ne la touche pas, celle-ci la suit.
--
-- L'UPDATE n'écrase aucun choix humain : en production, aucune ligne ne
-- porte encore cette colonne (CA3 et celle-ci partent dans le même
-- déploiement). En dev, une ligne posée à `slot` à l'écran entre-temps
-- repasse à `deadline` : accepté par le plan.
--
-- Aucun droit accordé à un rôle. Retour arrière :
-- `ALTER TABLE "public"."delivery_settings" ALTER COLUMN "window_mode" SET DEFAULT 'slot'`
-- (l'UPDATE, lui, ne se défait pas : rien ne dit quelles lignes valaient `slot`).

ALTER TABLE "public"."delivery_settings"
  ALTER COLUMN "window_mode" SET DEFAULT 'deadline';

UPDATE "public"."delivery_settings" SET "window_mode" = 'deadline';
