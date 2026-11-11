-- La date de délivrance de l'extrait KBIS certifié, saisie par le staff à la
-- certification. Additive et nullable : les certifications déjà posées n'ont
-- pas de date connue, et n'en reçoivent pas d'inventée.
ALTER TABLE "public"."companies" ADD COLUMN "kbis_issued_on" DATE;
