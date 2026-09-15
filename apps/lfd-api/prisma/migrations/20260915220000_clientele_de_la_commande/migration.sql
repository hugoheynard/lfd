-- ───────────────────────────────────────────────────────────────────────────
-- LA CLIENTÈLE, FIGÉE SUR LA COMMANDE.
--
-- Cf. documentation/order/plan-nature-du-client-sur-la-commande.md, D3 et D4.
--
-- ADDITIVE, en un seul passage : un type, une colonne nullable, aucun défaut.
--
-- 🔴 AUCUN RATTRAPAGE, et c'est une décision (Hugo, après `vitruve`) : une
-- commande antérieure sans société n'est PAS une commande publique — c'est
-- aussi celle d'une personne rattachée à plusieurs sociétés qui n'envoyait pas
-- d'en-tête, ou d'un pro qui n'avait pas encore déclaré la sienne. Un `public`
-- déduit ici ne se distinguerait plus jamais d'un vrai. `NULL` = « d'avant la
-- distinction », et c'est sa valeur vraie : aucun déploiement ne la resserrera.
--
-- Pendant la bascule, l'ancienne image n'écrit pas la colonne : ses commandes
-- restent nulles, pour la même raison.
--
-- Pas de `CHECK` liant la colonne à `company_id` : la clé étrangère est en
-- `ON DELETE SET NULL`, une société supprimée le violerait.
--
-- Retour arrière : `ALTER TABLE "public"."orders" DROP COLUMN "clientele"` puis
-- `DROP TYPE "public"."OrderClientele"` — perd la clientèle des commandes
-- passées depuis, qui ne se reconstruit pas : à dire à Hugo avant.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TYPE "public"."OrderClientele" AS ENUM ('pro', 'public');

ALTER TABLE "public"."orders"
  ADD COLUMN "clientele" "public"."OrderClientele";
