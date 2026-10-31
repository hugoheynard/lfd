-- La description des promotions — documentation/promotions/promotions.md, § 2.1.
--
-- Une promotion porte désormais, à côté de son nom interne, une description
-- libre pour l'équipe (« pourquoi elle existe, avec qui elle a été décidée »).
-- Le client ne la voit jamais.
--
-- Ce qu'elle fait — ADDITIVE, aucune ligne écrite :
--
-- 1. Une colonne nullable `description` sur `promotions` ; les promotions
--    existantes restent à NULL (« aucune description »).
-- 2. Un CHECK miroir de l'agrégat : NULL, ou un texte non vide, sans espaces
--    de bord, de 1 000 caractères au plus.
--
-- Retour arrière : `prisma/rollback/20261031220000_la_description_des_promotions.sql`.

ALTER TABLE public.promotions ADD COLUMN description TEXT;

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_description_canonical CHECK (
    description IS NULL
    OR (
      char_length(description) BETWEEN 1 AND 1000
      AND description = btrim(description)
    )
  );
