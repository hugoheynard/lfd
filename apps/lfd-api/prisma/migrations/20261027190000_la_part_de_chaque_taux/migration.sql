-- LA PART DE CHAQUE TAUX — plan `documentation/pricing/plan-centime-particuliers.md`
-- (lot C3, décision du 2026-10-27).
--
-- Une commande d'un particulier (`exact_ht`) fige, à côté de sa TVA par taux
-- (`vat_shares`), la part ENTIÈRE de chaque taux : le net du taux (lignes,
-- moins remise et bon, plus port), sa TVA, son HT — la sortie `byRate` de la
-- composition. Ses documents l'impriment au format du ticket sans rien
-- reconstituer : la part d'un geste par taux n'est écrite nulle part ailleurs.
-- Le BL recomposé porte la sienne.
--
-- Forme : `[{"rate": 5.5, "htCents": …, "vatCents": …, "ttcCents": …}]`,
-- taux croissants, Σ `ttcCents` = `total_cents`.
--
-- ADDITIVE : une colonne `jsonb` nullable par table, sans remplissage.
-- Contrainte : une commande `line_ht` n'en porte JAMAIS (NULL). L'inverse —
-- `exact_ht` ⇒ non nulle — n'est pas posé : une commande `exact_ht` écrite
-- par C2 avant cette migration (bases de dev et de test ; aucune en
-- production, C2 n'y est jamais parti) n'a pas sa part, et ses documents
-- gardent alors le décompte d'avant. Un tableau JSON, ou NULL.
--
-- Retour arrière : supprimer les deux contraintes, puis les deux colonnes.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN "ttc_by_rate" JSONB,
  ADD CONSTRAINT "orders_ttc_by_rate_only_exact_ht"
    CHECK ("ttc_by_rate" IS NULL
           OR ("vat_method" = 'exact_ht' AND jsonb_typeof("ttc_by_rate") = 'array'));

ALTER TABLE "public"."delivery_note"
  ADD COLUMN "ttc_by_rate" JSONB,
  ADD CONSTRAINT "delivery_note_ttc_by_rate_only_exact_ht"
    CHECK ("ttc_by_rate" IS NULL
           OR ("vat_method" = 'exact_ht' AND jsonb_typeof("ttc_by_rate") = 'array'));
