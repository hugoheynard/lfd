-- ───────────────────────────────────────────────────────────────────────────
-- L'AUTEUR D'UNE DÉROGATION EST SA FICHE, PLUS SON `sub`.
--
-- Cf. documentation/auth-inscription/plan-journal-de-l-annuaire.md — D1, lot 2.
--
-- Le `sub` Auth0 est un identifiant du FOURNISSEUR : il n'a rien à faire dans
-- nos données métier. L'auteur devient l'id de sa fiche d'annuaire, sous la
-- même forme que `order_cutoff_waivers.granted_by_staff_id`.
--
-- ADDITIVE — premier des DEUX déploiements (étendre + remplir + basculer ;
-- resserrer ensuite). Deux et pas trois : `granted_by` n'a AUCUN lecteur
-- (vérifié le 2026-09-18), il n'y a donc pas de lecture à basculer entre les
-- deux. Rien n'est supprimé, rien n'est renommé, rien n'est resserré.
--
-- 1. `granted_by_staff_id`, nullable, SANS clé étrangère : une fiche se
--    supprime, la trace de ce qu'elle a accordé doit survivre.
-- 2. `granted_by` devient nullable : le code n'y écrit plus. Sans ça, la
--    première dérogation posée après le déploiement échouerait.
-- 3. Rétro-remplissage par `staff_users.auth0_id = granted_by` (décidé par
--    Hugo le 2026-09-18 : aucune fiche n'a été supprimée, donc aucun `sub` n'a
--    pu passer d'une fiche à une autre). Sans correspondance (`test`, un `sub`
--    jamais lié) : la valeur reste NULL — on ne fabrique pas d'auteur.
--
-- ⚠️ CE QUE LE REMPLISSAGE NE RÉPARE PAS : avant ce déploiement, chaque
-- édition de fiche RÉÉCRIVAIT toutes ses dérogations au nom de l'éditeur. La
-- valeur remplie désigne donc le DERNIER ÉDITEUR de la fiche à la date du
-- déploiement, pas forcément la personne qui a accordé l'écart. Vrai à partir
-- du déploiement seulement.
--
-- RETOUR ARRIÈRE — l'ancien code écrit `granted_by`, toujours présent. La
-- migration inverse, à la main :
--
--   UPDATE "public"."staff_permission_overrides" AS o
--      SET "granted_by" = COALESCE(su."auth0_id", 'inconnu')
--     FROM "public"."staff_users" su
--    WHERE o."granted_by" IS NULL AND su."id" = o."granted_by_staff_id";
--   UPDATE "public"."staff_permission_overrides"
--      SET "granted_by" = 'inconnu' WHERE "granted_by" IS NULL;
--   ALTER TABLE "public"."staff_permission_overrides"
--     ALTER COLUMN "granted_by" SET NOT NULL;
--   ALTER TABLE "public"."staff_permission_overrides"
--     DROP COLUMN "granted_by_staff_id";
--
-- Le `'inconnu'` du retour arrière est un MARQUEUR, pas un auteur : l'ancien
-- code n'a jamais lu cette colonne, et la contrainte `NOT NULL` qu'il attend
-- ne peut être rétablie qu'en comblant les lignes écrites depuis.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."staff_permission_overrides"
  ADD COLUMN "granted_by_staff_id" TEXT;

ALTER TABLE "public"."staff_permission_overrides"
  ALTER COLUMN "granted_by" DROP NOT NULL;

UPDATE "public"."staff_permission_overrides" AS o
   SET "granted_by_staff_id" = su."id"
  FROM "public"."staff_users" AS su
 WHERE su."auth0_id" = o."granted_by";
