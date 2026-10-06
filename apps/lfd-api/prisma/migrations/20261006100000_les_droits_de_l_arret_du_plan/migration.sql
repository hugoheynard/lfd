-- LES DROITS DE L'ARRÊT DU PLAN — `production_count_stop` et `production_settings`
--
-- Plan `documentation/production/plan-arret-du-plan.md`, §6 et S6, lot A1.
-- `production_count_stop:write` arrête le plan (sorti de `production_plan:write`,
-- qui ne porte plus rien) ; `production_settings` lit et règle l'arrêt et les
-- jours fermés.
--
-- 🔴 N'ACCORDE RIEN : le droit se règle à l'écran (`/admin/staff-roles`), le
-- jour du déploiement, AVANT 20:00 — sans quoi personne n'arrête le plan du
-- soir (§6).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_count_stop' BEFORE 'handover_counter';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_settings' BEFORE 'handover_counter';
