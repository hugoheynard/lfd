-- Un sous-compte ne change pas de principal en une écriture (Hugo, 2026-10-20).
--
-- La première ligne est le geste : `HierarchyPlace.attachTo` refuse un compte
-- déjà rattaché (`AlreadySubAccountError`), et le chemin de sortie est de le
-- détacher, ce qui ferme ses suivis, puis de le rattacher ailleurs. Ce
-- déclencheur est la SECONDE ligne, contre une écriture faite hors du geste :
-- passer directement de A à B laisserait ouvertes des périodes de suivi
-- (facturation, tarif) au nom de l'ancien principal.
--
-- Ne refuse que le passage d'un principal à un AUTRE. Rattacher (NULL → X) et
-- détacher (X → NULL) passent, chacun en sa propre écriture.
--
-- Additive : aucune donnée n'est touchée, et aucune ligne existante ne peut la
-- violer (elle ne regarde que les mises à jour). Retour arrière :
--   DROP TRIGGER "companies_parent_not_replaced" ON "companies";
--   DROP FUNCTION "company_parent_not_replaced"();
CREATE FUNCTION "company_parent_not_replaced"() RETURNS trigger AS $$
BEGIN
    IF OLD."parent_company_id" IS NOT NULL
        AND NEW."parent_company_id" IS NOT NULL
        AND NEW."parent_company_id" <> OLD."parent_company_id" THEN
        RAISE EXCEPTION 'company_parent_replaced: % est déjà le sous-compte de % ; le détacher d''abord',
            NEW."id", OLD."parent_company_id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "companies_parent_not_replaced"
    BEFORE UPDATE OF "parent_company_id" ON "companies"
    FOR EACH ROW EXECUTE FUNCTION "company_parent_not_replaced"();
