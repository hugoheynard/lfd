-- L'ESTAMPILLE FILTRÉE PAR COLONNES — plan
-- `documentation/caching-usage/plan-principal-en-memoire.md`, §3 quinquies.
--
-- Pourquoi : les trois déclencheurs de `20261104120000_l_estampille_du_principal`
-- montaient sur TOUTE écriture de `users`, `memberships`, `companies`. Une
-- première connexion (`first_login_at`) ou une écriture d'identité d'une
-- société (raison sociale, adresse, conditions…) vidait donc le principal
-- gardé en mémoire de tout le monde, sans rien changer à ce qu'il porte.
--
-- Ici, `UPDATE OF` ne retient que les colonnes que la résolution lit
-- (`customer-principal.resolver.ts`, `read-company-standing.ts`,
-- `opening-membership.ts`). `INSERT` et `DELETE` font toujours monter. Même
-- fonction `principal_stamp_bump()`, même `BEFORE … FOR EACH STATEMENT` (§3
-- bis : le verrou de l'estampille avant ceux des lignes). Rien ne s'élargit :
-- chaque déclencheur couvre un sous-ensemble strict de ce qu'il couvrait.
--
-- ⚠️ `UPDATE OF` monte dès que la colonne figure dans le `SET`, même à valeur
-- égale : un écrivain qui réécrit `status` à chaque sauvegarde fait toujours
-- monter (plus large que nécessaire, jamais trop étroit).
--
-- Le test `__tests__/principal-stamp-columns.spec.ts` confronte ces listes aux
-- champs lus par la résolution : une colonne lue absente d'ici le fait échouer.
--
-- Retour arrière : recréer les déclencheurs larges, tels qu'écrits dans
-- `20261104120000_l_estampille_du_principal/migration.sql`
-- (`BEFORE INSERT OR UPDATE OR DELETE … FOR EACH STATEMENT`).

-- `users` et `companies` sont lues à chaque requête : mieux vaut que le
-- déploiement échoue proprement en 5 s — il se relance — que de les bloquer.
-- 🔴 `CREATE OR REPLACE TRIGGER` (Postgres 14+), et non DROP puis CREATE
-- (lecteur-de-migrations, 2026-11-05) : le remplacement est UNE instruction,
-- atomique. Aucune fenêtre où une écriture de révocation passerait sans
-- déclencheur, que le fichier soit exécuté ou non dans une transaction. Sur un
-- Postgres trop ancien, la migration échoue entière et l'ancien jeu reste.
SET lock_timeout = '5s';

CREATE OR REPLACE TRIGGER "users_principal_stamp"
  BEFORE INSERT OR DELETE OR UPDATE OF "id", "auth0_sub", "email", "email_verified", "status"
  ON "public"."users"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();

CREATE OR REPLACE TRIGGER "memberships_principal_stamp"
  BEFORE INSERT OR DELETE OR UPDATE OF "user_id", "company_id", "role", "invited_at", "accepted_at"
  ON "public"."memberships"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();

CREATE OR REPLACE TRIGGER "companies_principal_stamp"
  BEFORE INSERT OR DELETE OR UPDATE OF "id", "status", "parent_company_id"
  ON "public"."companies"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();
