-- Le texte d'une promotion sur les vignettes —
-- documentation/promotions/plan-texte-de-la-vignette.md, § 2.
--
-- Une promotion porte désormais un texte facultatif, réglé en back-office,
-- que la boutique affiche sur la vignette et la fiche produit quand la
-- mention s'affiche (« −20 % client Folie Coffee »). Vide : la valeur seule.
--
-- Ce qu'elle fait — ADDITIVE, aucune ligne écrite :
--
-- 1. Trois colonnes nullables `tile_text_fr`, `tile_text_en`, `tile_text_it`,
--    sur le modèle des libellés (`label_*`) ; les promotions existantes
--    restent à NULL (« la valeur seule »).
-- 2. Des CHECK miroirs de l'agrégat : chaque texte NULL, ou non vide, sans
--    espaces de bord, de 60 caractères au plus ; l'anglais et l'italien
--    n'existent qu'avec le français.
--
-- Retour arrière : `prisma/rollback/20261101120000_le_texte_des_vignettes.sql`.

SET lock_timeout = '5s';

ALTER TABLE "public"."promotions"
  ADD COLUMN "tile_text_fr" TEXT,
  ADD COLUMN "tile_text_en" TEXT,
  ADD COLUMN "tile_text_it" TEXT;

ALTER TABLE "public"."promotions"
  ADD CONSTRAINT "promotions_tile_text_canonical" CHECK (
    ("tile_text_fr" IS NULL OR (char_length("tile_text_fr") BETWEEN 1 AND 60 AND "tile_text_fr" = btrim("tile_text_fr")))
    AND ("tile_text_en" IS NULL OR (char_length("tile_text_en") BETWEEN 1 AND 60 AND "tile_text_en" = btrim("tile_text_en")))
    AND ("tile_text_it" IS NULL OR (char_length("tile_text_it") BETWEEN 1 AND 60 AND "tile_text_it" = btrim("tile_text_it")))
  );

ALTER TABLE "public"."promotions"
  ADD CONSTRAINT "promotions_tile_text_whole" CHECK (
    "tile_text_fr" IS NOT NULL
    OR ("tile_text_en" IS NULL AND "tile_text_it" IS NULL)
  );
