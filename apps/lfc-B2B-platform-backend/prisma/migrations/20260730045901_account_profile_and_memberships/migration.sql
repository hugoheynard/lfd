-- Sépare la PERSONNE de la SOCIÉTÉ.
--
-- Avant : `users.company_id` NOT NULL + `users.role` — une personne appartenait à
-- exactement une société, et « aucune société » était impossible à représenter.
-- Après : la table `memberships` porte le rattachement (0..N sociétés), le rôle
-- devient propre au couple (personne, société), et `users` gagne le profil de la
-- personne (nom, prénom, téléphone).
--
-- ⚠️ ORDRE VOLONTAIRE — la migration générée par Prisma supprimait
-- `users.company_id` AVANT de créer `memberships`, ce qui perdait tous les
-- rattachements existants. Ici : on crée, on REPREND les données, puis on
-- supprime. La migration est donc rejouable sur une base peuplée sans perte.

-- 1. La table de rattachement -------------------------------------------------
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role" "CustomerRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memberships_company_id_idx" ON "memberships"("company_id");
CREATE UNIQUE INDEX "memberships_user_id_company_id_key" ON "memberships"("user_id", "company_id");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Reprise des rattachements existants --------------------------------------
-- Un id dérivé de l'utilisateur : déterministe (donc rejouable) et lisible en
-- base, là où un cuid aléatoire ne serait ni l'un ni l'autre côté SQL.
INSERT INTO "memberships" ("id", "user_id", "company_id", "role", "created_at", "updated_at")
SELECT 'mbr_' || "id", "id", "company_id", "role", "created_at", CURRENT_TIMESTAMP
FROM "users";

-- 3. Le profil de la personne --------------------------------------------------
ALTER TABLE "users"
    ADD COLUMN "first_name" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "last_name" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';

-- 4. Retrait de l'ancien lien 1-1 ---------------------------------------------
ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";
DROP INDEX "users_company_id_idx";
ALTER TABLE "users" DROP COLUMN "company_id", DROP COLUMN "role";

-- 5. Une société n'est plus active par défaut ----------------------------------
-- Elle est déclarée (`pending`) et le devient par activation commerciale.
ALTER TABLE "companies" ALTER COLUMN "status" SET DEFAULT 'pending';
