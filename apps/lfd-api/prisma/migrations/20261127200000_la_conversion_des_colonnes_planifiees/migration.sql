-- LA CONVERSION DES COLONNES PLANIFIÉES — la provenance d'une commande passée
-- par le planificateur des pros
-- (documentation/commandes/planificateur/plan-planificateur-de-commandes.md, lot L2).
--
-- ADDITIVE : une colonne nullable neuve, son index unique et son déclencheur.
-- Les binaires en place ne la lisent ni ne l'écrivent. Aucune clé étrangère :
-- la colonne planifiée vit dans le schéma `recurring`, identifiant opaque.
--
-- Retour arrière : `prisma/rollback/20261127200000_la_conversion_des_colonnes_planifiees.sql`.
SET lock_timeout = '5s';

ALTER TABLE "public"."orders" ADD COLUMN "from_planned_column_id" TEXT;

-- Une colonne, au plus une commande : une seconde passation de la même
-- colonne bute ici, et la passation relit la commande déjà passée.
CREATE UNIQUE INDEX "orders_one_per_planned_column"
  ON "public"."orders" ("from_planned_column_id");

-- La provenance ne change plus après la création : c'est elle que l'unicité lit.
CREATE FUNCTION "public"."orders_keep_planned_provenance"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."from_planned_column_id" IS DISTINCT FROM OLD."from_planned_column_id" THEN
    RAISE EXCEPTION 'La provenance planifiée d''une commande ne se modifie pas (commande %).', OLD."id";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "orders_keep_planned_provenance"
  BEFORE UPDATE OF "from_planned_column_id" ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."orders_keep_planned_provenance"();
