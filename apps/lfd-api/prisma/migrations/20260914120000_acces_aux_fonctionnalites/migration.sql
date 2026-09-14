-- **L'accès aux fonctionnalités** — plan `documentation/b2b/plan-inscription-pro-seule.md` §2.
--
-- Le catalogue (clés, niveaux ordonnés, défauts) vit dans `@lfd/contracts`.
-- Ces deux tables ne portent que les ÉCARTS : une base vide = le défaut du code
-- partout, c'est-à-dire l'état d'avant cette migration. Rien ne se ferme au
-- déploiement ; la fermeture est un geste d'admin fait ensuite (plan §6).
--
-- **Additive** : deux tables neuves, une valeur d'enum ajoutée, rien de modifié.
-- Retour arrière : ne pas s'en servir. Les tables vides ne sont lues par aucun
-- code d'avant ce déploiement, et la valeur d'enum n'est portée par aucune ligne
-- tant que personne ne l'accorde en dérogation staff.
--
-- Aucune contrainte ne lie `key` au catalogue, délibérément : retirer une clé
-- du code exigerait sinon une migration pour pouvoir déployer. Une ligne dont
-- la clé n'est plus au catalogue est ignorée par la résolution, et signalée à
-- l'écran admin.

-- La ressource staff qui garde `/admin/feature-access`. Postgres sait ajouter
-- une valeur à un type énuméré, pas en retirer une sans reconstruire le type —
-- d'où « ne pas s'en servir » comme retour arrière, comme pour
-- `b2b_order_waivers` (20260904170000_ressource_derogations).
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_feature_access' BEFORE 'b2b_settings';

-- Une dérogation par clé. Supprimer la ligne EST le retour au défaut ; la trace
-- reste au journal, écrite dans la même transaction.
CREATE TABLE "public"."feature_access_overrides" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_sub" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "feature_access_overrides_pkey" PRIMARY KEY ("key")
);

-- Les adresses qui gardent le niveau le plus ouvert, pour tester en production.
-- `email` est normalisé (trim, minuscules) par le domaine avant écriture.
CREATE TABLE "public"."feature_access_exemptions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_sub" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_by_role" TEXT NOT NULL,

    CONSTRAINT "feature_access_exemptions_pkey" PRIMARY KEY ("id")
);

-- L'unicité rend l'ajout idempotent, et sert d'index à la recherche faite à
-- chaque requête gardée (clé + adresse).
CREATE UNIQUE INDEX "feature_access_exemptions_key_email_key" ON "public"."feature_access_exemptions"("key", "email");
