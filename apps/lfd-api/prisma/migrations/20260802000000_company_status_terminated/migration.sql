-- Ajoute l'état `terminated` à CompanyStatus (fin de relation commerciale,
-- distinct de `suspended` qui n'est qu'une coupure temporaire réversible).
--
-- Fichier isolé, comme `pending` : Postgres refuse d'utiliser une valeur d'enum
-- dans la transaction qui l'ajoute, et Prisma applique chaque fichier dans UNE
-- transaction. Ici aucune migration suivante ne s'en sert (pas de nouveau
-- DEFAULT), donc un seul fichier suffit.
ALTER TYPE "CompanyStatus" ADD VALUE 'terminated';
