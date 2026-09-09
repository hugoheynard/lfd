-- ───────────────────────────────────────────────────────────────────────────
-- LE PLANCHER GAGNE UNE FENÊTRE
--
-- Il était la seule des cinq familles tarifaires à n'en avoir aucune. L'index
-- de sa migration d'origine l'écrivait : « la résolution lit tous les planchers
-- qui visent un article : elle filtre sur la portée, JAMAIS sur la date ».
--
-- Trois conséquences, toutes réelles :
--   1. `price_floors_one_per_scope` n'était PAS partiel, donc archiver un
--      plancher ne libérait rien ;
--   2. re-poser réécrivait la ligne EN PLACE et remettait `archived_at` à NULL,
--      avec les valeurs du jour ;
--   3. une lecture datée appliquait donc le plancher d'aujourd'hui à une période
--      où il disait autre chose. Un plancher RELÈVE un prix : le mode de
--      défaillance était un prix historique gonflé.
--
-- 🔴 CE QUE CE REMPLISSAGE NE PEUT PAS FAIRE
--
-- L'historique des planchers n'existe pas en données. Le journal tarifaire ne
-- garde qu'un `summary` — une phrase figée —, pas les valeurs. Reconstituer des
-- montants en analysant du français serait le geste que ce dépôt interdit.
--
-- `valid_from = updated_at` dit donc la seule chose vraie : « en vigueur depuis
-- sa dernière pose ; avant, on ne sait pas ». Une lecture antérieure à cette
-- date ne trouvera pas de plancher, ce qui est honnête — et non un plancher
-- inventé, qui serait indistinguable d'un vrai.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "price_floors"
  ADD COLUMN "valid_from" TIMESTAMPTZ(3),
  ADD COLUMN "valid_to"   TIMESTAMPTZ(3);

-- ⚠️ `updated_at` seul ne suffit PAS pour une limite rangée : toute écriture
-- postérieure au rangement le repousse, et la fenêtre commencerait alors APRÈS
-- sa fin. Vérifié en base : le cas existe. Pour celles-là on prend la création,
-- qui est le seul instant dont on sache qu'elle agissait déjà.
UPDATE "price_floors"
   SET "valid_from" = CASE
         WHEN "archived_at" IS NOT NULL THEN LEAST("created_at", "archived_at")
         ELSE "updated_at"
       END
 WHERE "valid_from" IS NULL;

ALTER TABLE "price_floors" ALTER COLUMN "valid_from" SET NOT NULL;

-- Même forme que les quatre autres familles : une seule limite par portée À UN
-- INSTANT DONNÉ, plutôt qu'une seule pour toujours. Partielle sur l'archivage,
-- comme partout ailleurs — ranger rend la place.
--
-- L'index unique disparaît : il interdisait le versionnage, qui est précisément
-- ce qu'on ajoute. La garantie ne s'affaiblit pas — « un par portée, pour
-- toujours » devient « un par portée à tout instant ».
DROP INDEX "price_floors_one_per_scope";

ALTER TABLE "price_floors"
  ADD CONSTRAINT "price_floors_no_overlap"
  EXCLUDE USING gist (
    "scope_type" WITH =,
    coalesce("scope_id", '') WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);

-- ───────────────────────────────────────────────────────────────────────────
-- LES LIMITES DÉJÀ RANGÉES PORTENT LEUR FIN
--
-- Ranger BORNE désormais, comme pour les quatre autres familles. Les lignes
-- rangées AVANT cette migration n'ont pas de `valid_to` : sans conséquence sur
-- la lecture — `unarchivedAt(at)` les écarte déjà d'une date postérieure à leur
-- rangement — mais incohérent avec l'invariant qu'on vient de poser, et c'est
-- le genre d'écart qui se découvre trois mois plus tard en cherchant autre chose.
--
-- La garde `valid_from < archived_at` compte : une limite rangée AVANT d'avoir
-- agi (le cas honnête d'`archived_at`) donnerait `valid_to <= valid_from`, une
-- plage vide, qui n'est `&&` avec rien.
UPDATE "price_floors"
   SET "valid_to" = "archived_at"
 WHERE "archived_at" IS NOT NULL
   AND "valid_to" IS NULL
   AND "valid_from" < "archived_at";
