-- Le tarif représentatif au moment où la limite a été posée.
--
-- Sans lui, « le tarif a bougé de 12 % depuis ta décision » n'a rien à quoi se
-- comparer. Nullable et sans défaut : les limites existantes n'ont pas de
-- référence, et leur en inventer une aujourd'hui affirmerait qu'elles n'ont pas
-- dérivé — exactement le contraire de ce qu'on sait d'elles.
ALTER TABLE "price_floors" ADD COLUMN "reference_canonical_cents" INTEGER;
