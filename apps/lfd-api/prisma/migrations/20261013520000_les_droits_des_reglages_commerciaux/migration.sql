-- LES DROITS DES RÉGLAGES COMMERCIAUX (Hugo, 2026-10-13)
--
-- Les réglages commerciaux sont devenus trois vues de l'espace Commercial
-- (Disponibilité, Marchés, Alertes). Deux reçoivent leur ressource :
-- `b2b_commercial_appointment` (la disponibilité des rendez-vous, sortie de
-- `b2b_appointments`) et `b2b_commercial_alert` (les règles d'alerte
-- globales, sorties de `b2b_alerts`). Marchés reste sous `b2b_growth`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de bascule : dès ce déploiement, `GET|PUT /admin/availability*` et
-- `GET|PUT /admin/alert-rules` exigent ces ressources ; l'admin les accorde à
-- l'écran (`/admin/staff-roles`) aux rôles qui réglaient la disponibilité ou
-- les alertes globales.
--
-- SEULES dans leur migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_commercial_appointment' AFTER 'b2b_appointments';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_commercial_alert' AFTER 'b2b_commercial_appointment';
