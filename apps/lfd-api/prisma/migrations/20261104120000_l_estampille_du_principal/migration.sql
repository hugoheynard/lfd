-- L'ESTAMPILLE DU PRINCIPAL — plan
-- `documentation/caching-usage/plan-principal-en-memoire.md`, §3 et §3 bis (L4).
--
-- Elle n'est PAS strictement additive : elle COPIE des données. Deux tables
-- neuves (l'estampille, d'une ligne ; les préférences de navigation des
-- clients, §3 ter), une fonction, trois déclencheurs. Aucune colonne
-- existante touchée : `users.nav_prefs` reste en base, morte (ni lue ni
-- écrite par le code depuis le 2026-11-04).
--
-- Retour arrière de l'estampille : `DROP TRIGGER` des trois déclencheurs,
-- `DROP FUNCTION`, `DROP TABLE "public"."principal_stamp"`. Un binaire qui la
-- lit encore ne garde alors plus rien (ligne absente = rien ne se garde).
--
-- Retour arrière des préférences, dans les deux sens (§3 ter) : un ancien
-- binaire qui écrit après la copie écrit une colonne morte ; un retour au
-- binaire précédent APRÈS des écritures dans `user_nav_prefs` relit
-- `users.nav_prefs` figée à l'instant de la copie. Pire cas, les deux fois :
-- un dernier espace choisi perdu. `user_nav_prefs` ne se supprime pas tant
-- qu'un binaire la lit.
--
-- 🔴 Un COMPTEUR, pas un journal (§3, tranché après `vitruve`) : un `max(id)`
-- est attribué à l'écriture, pas à la validation. Le verrou de la ligne aligne
-- l'ordre des validations sur l'ordre des numéros.
--
-- 🔴 `BEFORE … FOR EACH STATEMENT`, pas `AFTER` (§3 bis, interblocages) : le
-- déclencheur prend le verrou de l'estampille AVANT les verrous des lignes que
-- l'instruction écrit. Toute transaction qui écrit ces tables prend donc
-- l'estampille en premier, quel que soit l'ordre de ses écritures — sans quoi
-- `acceptAndActivate` (memberships puis users) et une recopie de preuve
-- concurrente (users seul) s'interbloqueraient.
--
-- Une instruction qui ne touche aucune ligne fait monter le numéro aussi : plus
-- large que nécessaire, jamais trop étroit. `TRUNCATE` ne déclenche rien.

-- `users` et `companies` sont lues à chaque requête : mieux vaut que le
-- déploiement échoue proprement en 5 s — il se relance — que de les bloquer.
SET lock_timeout = '5s';

-- Les préférences de navigation des clients quittent `users` (§3 ter) : sans
-- quoi chaque changement d'espace ferait monter l'estampille. AVANT les
-- déclencheurs : la copie ne fait rien monter. Aucun déclencheur ici — le
-- principal ne lit pas les préférences.
CREATE TABLE "public"."user_nav_prefs" (
    "user_id"    TEXT         NOT NULL,
    "prefs"      JSONB        NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_nav_prefs_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_nav_prefs_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seuls les objets passent : `'null'` et un tableau ne se lisaient déjà pas
-- comme des préférences (trou hérité, fermé ici). Le bloc entre les deux
-- marqueurs est exécuté tel quel par `test/user-nav-prefs-copy.e2e-spec.ts`.
-- >>> user_nav_prefs copy
INSERT INTO "public"."user_nav_prefs" ("user_id", "prefs", "updated_at")
SELECT "id", "nav_prefs", now() FROM "public"."users"
WHERE jsonb_typeof("nav_prefs") = 'object';
-- <<< user_nav_prefs copy

CREATE TABLE IF NOT EXISTS "public"."principal_stamp" (
    "id"    SMALLINT NOT NULL,
    "value" BIGINT   NOT NULL DEFAULT 0,

    CONSTRAINT "principal_stamp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "principal_stamp_single_row" CHECK ("id" = 1)
);

INSERT INTO "public"."principal_stamp" ("id", "value") VALUES (1, 0)
ON CONFLICT ("id") DO NOTHING;

-- Une ligne absente (une base vidée à la main) est RECRÉÉE plutôt qu'ignorée :
-- un `UPDATE` sur zéro ligne laisserait passer l'écriture sans faire monter le
-- numéro, et un principal périmé resterait servi.
CREATE OR REPLACE FUNCTION "public"."principal_stamp_bump"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "public"."principal_stamp" ("id", "value") VALUES (1, 1)
  ON CONFLICT ("id") DO UPDATE SET "value" = "principal_stamp"."value" + 1;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_principal_stamp"
  BEFORE INSERT OR UPDATE OR DELETE ON "public"."users"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();

CREATE TRIGGER "memberships_principal_stamp"
  BEFORE INSERT OR UPDATE OR DELETE ON "public"."memberships"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();

CREATE TRIGGER "companies_principal_stamp"
  BEFORE INSERT OR UPDATE OR DELETE ON "public"."companies"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();
