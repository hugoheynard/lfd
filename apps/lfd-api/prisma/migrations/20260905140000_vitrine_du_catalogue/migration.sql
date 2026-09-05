-- La VITRINE du miroir : la ligne que la boutique affiche sous le nom, et le
-- packshot qu'elle montre au-dessus.
--
-- Purement ADDITIF, et réversible : cinq colonnes nullables sur une table
-- existante. Rien n'est déplacé, rien n'est resserré, aucune donnée n'est
-- réécrite. Un retour arrière est un DROP COLUMN, et le code d'avant n'a jamais
-- lu ces colonnes.
--
-- Elles restent NULL jusqu'au prochain push du référentiel : le fil ne les
-- portait pas avant la v8, et l'ingestion écrit ce qu'elle reçoit. Un catalogue
-- déjà en base s'affiche donc sans ligne ni visuel — ce qui est exact — jusqu'à
-- ce qu'une arrivée v8 les garnisse.
--
-- `note` NULL n'est pas la chaîne vide : rien n'a été saisi, ce qui n'est pas
-- une ligne effacée. Les deux se distinguent, et l'écran de réception en a
-- besoin pour dire ce qui vient d'arriver.
ALTER TABLE "public"."catalog_items"
  ADD COLUMN "note"         TEXT,
  ADD COLUMN "image_url"    TEXT,
  ADD COLUMN "image_alt"    TEXT,
  ADD COLUMN "image_width"  INTEGER,
  ADD COLUMN "image_height" INTEGER;
