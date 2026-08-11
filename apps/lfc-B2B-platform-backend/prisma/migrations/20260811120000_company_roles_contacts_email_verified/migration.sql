-- Quatre rôles au lieu de deux, par REMPLACEMENT du type et non par ajout.
--
-- Postgres sait ajouter une valeur à un enum, pas en retirer une. Garder
-- `company_admin` et `member` « le temps de la transition » ferait diverger le
-- domaine et la base durablement — et le garde-fou de parité (`Assert<Equals<>>`)
-- est là précisément pour refuser ça. On crée donc le type cible, on convertit,
-- on jette l'ancien : la base et le code disent la même chose à la fin de la
-- migration, pas plus tard.
CREATE TYPE "public"."CustomerRole_new" AS ENUM ('owner', 'admin', 'orders', 'billing');

-- Le gestionnaire d'un espace EST son détenteur : un renommage, pas une
-- décision. `member`, lui, ne dit pas ce que la personne fait — il devient
-- `admin`, le rôle le moins surprenant pour quelqu'un qui accédait déjà à tout,
-- et se corrige à la main.
ALTER TABLE "public"."memberships"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "public"."CustomerRole_new"
    USING (
      CASE "role"::text
        WHEN 'company_admin' THEN 'owner'
        ELSE 'admin'
      END
    )::"public"."CustomerRole_new";

DROP TYPE "public"."CustomerRole";
ALTER TYPE "public"."CustomerRole_new" RENAME TO "CustomerRole";

-- Plus de défaut : un rattachement sans rôle explicite serait un droit accordé
-- par omission.
ALTER TABLE "public"."memberships" ALTER COLUMN "role" SET NOT NULL;

-- Le rôle d'un CONTACT reste vide sur l'existant : il n'existait pas, et le
-- deviner propagerait une valeur qu'on ne saurait plus distinguer d'une vraie.
ALTER TABLE "public"."company_contacts" ADD COLUMN "role" "public"."CustomerRole";

-- L'adresse a-t-elle été prouvée ? Faux par défaut : on ne présume pas d'un fait
-- qui vit chez le fournisseur d'identité.
ALTER TABLE "public"."users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
