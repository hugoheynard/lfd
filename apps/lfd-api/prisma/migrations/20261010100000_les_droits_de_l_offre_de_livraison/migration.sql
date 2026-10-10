-- LES DROITS DE L'OFFRE DE LIVRAISON (Hugo, 2026-10-10) : la disponibilité
-- (à quelle clientèle, créneau ou échéance, marges de production) et les
-- frais (zones de livraison par code postal) sortent de `b2b_settings`.
-- L'écran est passé dans Exploitation › Livraison le même jour.
--
-- ADDITIVE : deux valeurs d'énumération. AUCUN DROIT ACCORDÉ : rien n'est
-- écrit dans `staff_role_definitions` ni `staff_permission_overrides` ; elles
-- s'accordent à l'écran (`/admin/staff-roles`). Jusque-là, PERSONNE — admin
-- compris — ne lit ni ne règle la disponibilité ni les zones au back-office :
-- les routes passent de `b2b_settings` à ces deux ressources au même
-- déploiement. La lecture publique des zones et de la disponibilité
-- (boutique) ne change pas.
--
-- Retour arrière : aucun. Une valeur d'enum ne se retire pas (Postgres) ;
-- inutilisée, elle ne coûte rien.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_availability' AFTER 'delivery_settings';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_fee' AFTER 'delivery_availability';
