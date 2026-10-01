-- LE BAC DÉCLARÉ FAIT BOUGER LA JOURNÉE — trois déclencheurs sur `delivery.delivery_bin`
--
-- Plan `documentation/livraisons/parcours-du-livreur.md`, « Étape 1 revue »,
-- lot PL4 : « Ma tournée » suit le colisage. La déclaration d'un bac doit faire
-- bouger le journal de la livraison ; jusqu'ici, seul son CHARGEMENT
-- (`delivery_bin_load`) en avait un.
--
-- Forme retenue : PAS de colonne `service_day` sur le bac. Un bac appartient à
-- la COMMANDE, pas à une journée, et une journée recopiée à la déclaration
-- serait fausse le jour où la commande change de tournée — sans compter les
-- lignes anciennes, qu'il faudrait remplir d'un jour deviné. Le jour se lit
-- donc PAR L'ARRÊT : la journée de chaque arrêt vivant (`removed_at IS NULL`)
-- de la commande du bac. Un bac d'une commande dans aucune tournée n'écrit
-- rien — aucune « Ma tournée » ne la montre, et la composer écrira dans le
-- journal par `delivery_round_stop`.
--
-- Cloisonnement (D3) : la fonction vit dans `delivery`, et son corps ne cite
-- que `delivery` (le journal et les arrêts).
--
-- Strictement ADDITIVE : une fonction et trois déclencheurs, aucune colonne,
-- aucune donnée. L'ancien binaire, qui ne les connaît pas, les déclenche en
-- déclarant un bac : il fait bouger un numéro d'affichage, rien d'autre.
--
-- Retour arrière : `DROP TRIGGER "delivery_bin_day_change_insert" ON
-- "delivery"."delivery_bin";` (de même `_update`, `_delete`) puis
-- `DROP FUNCTION "delivery"."record_day_change_by_bin_order"();` — ne perd
-- que des numéros de version.

-- Poser un déclencheur attend les transactions en cours sur la table ; échouer
-- proprement en 5 s vaut mieux que faire attendre une déclaration de bacs.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION "delivery"."record_day_change_by_bin_order"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "delivery"."day_change" ("service_day")
    SELECT DISTINCT stop."service_day"
      FROM new_rows bin
      JOIN "delivery"."delivery_round_stop" stop
        ON stop."order_id" = bin."order_id" AND stop."removed_at" IS NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "delivery"."day_change" ("service_day")
    SELECT stop."service_day"
      FROM new_rows bin
      JOIN "delivery"."delivery_round_stop" stop
        ON stop."order_id" = bin."order_id" AND stop."removed_at" IS NULL
    UNION
    SELECT stop."service_day"
      FROM old_rows bin
      JOIN "delivery"."delivery_round_stop" stop
        ON stop."order_id" = bin."order_id" AND stop."removed_at" IS NULL;
  ELSE
    INSERT INTO "delivery"."day_change" ("service_day")
    SELECT DISTINCT stop."service_day"
      FROM old_rows bin
      JOIN "delivery"."delivery_round_stop" stop
        ON stop."order_id" = bin."order_id" AND stop."removed_at" IS NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "delivery_bin_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_bin"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_bin_order"();
CREATE TRIGGER "delivery_bin_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_bin"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_bin_order"();
CREATE TRIGGER "delivery_bin_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_bin"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_bin_order"();
