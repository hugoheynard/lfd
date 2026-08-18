-- Ajoute l'état `pending` à CompanyStatus.
--
-- Migration à part, et non fusionnée avec la suivante : Postgres refuse
-- d'utiliser une valeur d'enum dans la transaction qui l'ajoute (« unsafe use of
-- new value of enum type »), et Prisma applique chaque fichier dans UNE
-- transaction. La suivante s'en sert comme DEFAULT de `companies.status`, elle
-- doit donc être un fichier distinct.
ALTER TYPE "CompanyStatus" ADD VALUE 'pending';
