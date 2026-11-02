-- RETOUR ARRIÈRE de 20261102250000_le_reassort_sans_interrupteur
-- (ordre de Hugo du 2026-11-02, dette du réassort).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Recrée la colonne avec son type et son défaut d'origine. La valeur d'avant
-- le retrait n'est pas restituée (elle n'était plus lue depuis 2026-10-21) :
-- la ligne unique reprend le défaut `true`.

SET lock_timeout = '5s';

ALTER TABLE public.order_cutoff_settings
  ADD COLUMN IF NOT EXISTS resupply_subject_to_cutoff BOOLEAN NOT NULL DEFAULT true;
