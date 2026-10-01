-- LA CLÉ DE RÔLE EST OBLIGATOIRE — le « resserrer » de `role_key`
--
-- Plan `documentation/livraisons/plan-droits-par-geste.md`, 5.2 (lot DG0).
-- Une fiche dont `role_key` était nul résolvait ses droits par
-- `ROLE_GRANTS[role]`, un tableau du CODE : c'était la dernière source de
-- droits hors de la base. Le code déployé avec cette migration ne lit plus ce
-- repli ; la colonne le dit à son tour.
--
-- Relevé par Hugo en production le 2026-10-01 :
--   SELECT count(*) FROM staff_users WHERE role_key IS NULL;   → 0
--
-- 🔴 Elle ne REMPLIT rien. Si une fiche sans clé est apparue entre le relevé
-- et le déploiement, elle échoue en le disant, et c'est à Hugo de décider quel
-- rôle cette personne porte — pas à une migration de le deviner.
--
-- Le déclencheur `staff_users_role_key_sync` reste : il remplit `role_key`
-- depuis `role` pour qui écrit encore l'enum, et c'est lui que le schéma
-- Prisma déclare en `@default(dbgenerated())`. Aucun défaut n'est posé ici.
--
-- Retour arrière : `ALTER TABLE "public"."staff_users" ALTER COLUMN "role_key"
-- DROP NOT NULL;` — sans perte, la colonne ne change pas de contenu.

DO $$
DECLARE
  orphans integer;
BEGIN
  SELECT count(*) INTO orphans FROM "public"."staff_users" WHERE "role_key" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'staff_users : % fiche(s) sans clé de rôle (role_key nul). Attribuer un rôle à chacune (SELECT id, email, role FROM staff_users WHERE role_key IS NULL), puis relancer le déploiement.', orphans;
  END IF;
END
$$;

ALTER TABLE "public"."staff_users" ALTER COLUMN "role_key" SET NOT NULL;
