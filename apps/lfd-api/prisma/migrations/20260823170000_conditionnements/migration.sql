-- Le conditionnement devient un agrégat propre, rattaché à une DÉCLINAISON.
--
-- La conception du 2026-08-04 avait verrouillé « conditionnement =
-- ProductVariant, pas de nouveau modèle ». Elle n'avait pas posé la question
-- que pose une fiche produit dès qu'on la dessine : « carton de 20 DE QUOI ? »
-- — de parts individuelles, ou de tartes 6 parts ?
--
-- Dans un modèle plat, « Part individuelle », « Format 6 parts » et « Carton de
-- 20 » sont trois lignes du même niveau et rien ne dit ce que le carton
-- contient. Un conditionnement n'est pas une déclinaison de plus : c'est une
-- unité de vente en volume qui EMBALLE une déclinaison. La relation est
-- l'information, et un modèle plat la perd.
--
-- Rien à migrer : aucun conditionnement n'existait, ni en colonne ni en donnée.
-- Le verrou était encore gratuit à ouvrir — voir
-- documentation/b2b/architecture-conditionnements-pricing.md, révision du
-- 2026-08-23.

CREATE TYPE "pim"."PackagingType" AS ENUM ('carton', 'sac', 'plateau');

CREATE TABLE "pim"."product_packaging" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    -- Le pro commande par référence : unique, comme celle d'une déclinaison.
    "sku" TEXT NOT NULL,
    "type" "pim"."PackagingType" NOT NULL,
    -- Entier > 0 : zéro n'emballe rien. L'invariant vit dans l'entité — la base
    -- ne sait pas l'exprimer sans contrainte nommée, et une contrainte que le
    -- domaine ne connaît pas produit une erreur que personne ne sait traduire.
    "quantity" INTEGER NOT NULL,
    -- Poids BRUT, emballage inclus. Ne se déduit PAS du poids net de la
    -- déclaration nutritionnelle : un carton de 20 parts pèse 20 × le net, plus
    -- le carton, les intercalaires et le film. NULL = non renseigné, donc non
    -- expédiable.
    "gross_weight_grams" INTEGER,
    -- Prix canonique HT en centimes, PRÉ-altération. Le dégressif de volume et
    -- les remises vivent dans la couche pricing B2B, jamais ici.
    "price_cents" INTEGER,
    -- Canaux propres : un plateau de 6 se vend à emporter. Hériter de la
    -- famille rendrait ce cas inexprimable.
    "channels" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "product_packaging_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_packaging_sku_key" ON "pim"."product_packaging"("sku");
CREATE INDEX "product_packaging_variant_id_idx" ON "pim"."product_packaging"("variant_id");

ALTER TABLE "pim"."product_packaging"
  ADD CONSTRAINT "product_packaging_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "pim"."product_variant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
