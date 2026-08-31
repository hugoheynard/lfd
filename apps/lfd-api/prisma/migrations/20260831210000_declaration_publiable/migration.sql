-- La déclaration « publiable » : un fait humain, daté et signé, rangé à côté du
-- produit plutôt que dans son statut.
CREATE TABLE "pim"."product_readiness" (
    "product_id" TEXT NOT NULL,
    "ready_at" TIMESTAMP(3) NOT NULL,
    "ready_by" TEXT NOT NULL,

    CONSTRAINT "product_readiness_pkey" PRIMARY KEY ("product_id")
);

ALTER TABLE "pim"."product_readiness"
    ADD CONSTRAINT "product_readiness_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Les rattachements de visuels n'étaient pas datés. Sans cette colonne, une
-- déclaration se dirait à jour après un changement de photo.
-- `DEFAULT now()` garnit les lignes existantes : leur vraie date est perdue,
-- et la seule autre option — NULL — ferait passer un visuel non daté pour un
-- visuel jamais modifié, c'est-à-dire dans le sens qui ment.
ALTER TABLE "pim"."product_media"
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
