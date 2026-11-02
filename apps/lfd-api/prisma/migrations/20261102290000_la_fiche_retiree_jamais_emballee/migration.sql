-- LA FICHE DE RÉASSORT RETIRÉE N'EST JAMAIS EMBALLÉE, EN BASE — audit du
-- réassort, 2026-11-02. La migration 20261102270000 tient « une fiche
-- retirée n'est pas close » par un CHECK ; « une fiche retirée n'a aucune
-- ligne emballée » ne l'était que par l'application (le filtre du retrait,
-- le dépôt qui écarte les retirées). Un CHECK ne lit pas une autre ligne :
-- deux déclencheurs le tiennent, un de chaque côté.
--
--   1. retirer une fiche dont une ligne porte un emballé est refusé ;
--   2. saisir l'emballé d'une ligne dont la fiche est retirée est refusé.
--
-- Le geste au poste verrouille la fiche (`FOR UPDATE`) avant d'écrire une
-- ligne, et le retrait met à jour la même fiche : l'un attend l'autre, et la
-- fonction relit — requête neuve, instantané neuf en READ COMMITTED — ce que
-- l'autre a validé.
--
-- ADDITIVE : aucune colonne, aucune donnée touchée, aucun droit accordé. Une
-- ligne existante n'est jugée qu'à sa prochaine écriture ; aucune n'est en
-- faute au 2026-11-02 (le retrait par statut date du même jour et son filtre
-- exclut les fiches emballées).
--
-- Retour arrière : `prisma/rollback/20261102290000_la_fiche_retiree_jamais_emballee.sql`.

SET lock_timeout = '5s';

CREATE FUNCTION "packing"."packing_resupply_withdrawn_unpacked"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'packing_resupply' THEN
    IF NEW."withdrawn_at" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "packing"."packing_resupply_line" AS line
       WHERE line."service_day" = NEW."service_day"
         AND line."resupply_id" = NEW."resupply_id"
         AND line."packed" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'packing_resupply_withdrawn_unpacked: la fiche % du % porte un emballé, elle ne se retire pas', NEW."resupply_id", NEW."service_day"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."packed" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "packing"."packing_resupply" AS sheet
       WHERE sheet."service_day" = NEW."service_day"
         AND sheet."resupply_id" = NEW."resupply_id"
         AND sheet."withdrawn_at" IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'packing_resupply_withdrawn_unpacked: la fiche % du % est retirée, sa ligne % ne s''emballe pas', NEW."resupply_id", NEW."service_day", NEW."sku"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "packing_resupply_withdrawn_unpacked_on_sheet"
  BEFORE UPDATE OF "withdrawn_at" ON "packing"."packing_resupply"
  FOR EACH ROW EXECUTE FUNCTION "packing"."packing_resupply_withdrawn_unpacked"();

CREATE TRIGGER "packing_resupply_withdrawn_unpacked_on_line"
  BEFORE INSERT OR UPDATE OF "packed" ON "packing"."packing_resupply_line"
  FOR EACH ROW EXECUTE FUNCTION "packing"."packing_resupply_withdrawn_unpacked"();
