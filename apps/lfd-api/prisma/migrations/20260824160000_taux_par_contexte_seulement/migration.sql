-- Les trois colonnes de taux tombent (C0, étape « resserrer »).
--
-- Troisième et dernier temps du déplacement commencé le 2026-08-24 : étendre
-- (jointure créée, données reprises), basculer (plus rien ne les lit), resserrer
-- (elles disparaissent). Cette migration ne doit partir QU'APRÈS que la bascule
-- soit en ligne — `documentation/ops/pipelines.md` : jamais un DROP de ce que le
-- code en service lit encore.
--
-- Rien à sauvegarder : `category_context_tva` porte les mêmes références depuis
-- la première étape, et le code les y écrit depuis la seconde.
ALTER TABLE "pim"."category" DROP COLUMN "emporter_tva_id";
ALTER TABLE "pim"."category" DROP COLUMN "sur_place_tva_id";
ALTER TABLE "pim"."category" DROP COLUMN "b2b_tva_id";

-- Les index posés sur ces colonnes (`category_emporter_tva_id_idx`, etc.) et
-- leurs contraintes de clé étrangère disparaissent AVEC elles : Postgres les
-- supprime en même temps que la colonne. Rien à écrire de plus.
