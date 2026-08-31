-- Où une révision est partie, et ce que la destination en a fait.
--
-- Une révision est ce qu'on s'apprête à publier : sans cette table, l'ancre dit
-- ce que le catalogue ÉTAIT sans dire s'il est parti, ni où. Une révision sans
-- aucune ligne ici est préparée et jamais envoyée — un état lisible et voulu.
CREATE TABLE "pim"."catalog_revision_publication" (
    "id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "report" JSONB,
    "published_at" TIMESTAMP(3) NOT NULL,
    "published_by" TEXT,

    CONSTRAINT "catalog_revision_publication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_revision_publication_revision_id_idx" ON "pim"."catalog_revision_publication"("revision_id");
CREATE INDEX "catalog_revision_publication_channel_published_at_idx" ON "pim"."catalog_revision_publication"("channel", "published_at");

ALTER TABLE "pim"."catalog_revision_publication"
    ADD CONSTRAINT "catalog_revision_publication_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "pim"."catalog_revision"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
