-- Une famille peut arriver du PIM sans régime de TVA : le catalogue voyage
-- quand même (le prix canonique vaut sans le taux), et c'est la BOUTIQUE qui
-- refuse de vendre un article sans taux — jamais un défaut à 5,5 %.
ALTER TABLE "catalog_categories" ALTER COLUMN "vat_rate_percent" DROP NOT NULL;
