-- LES NUMÉROS DE CONTACT — ajout de Hugo au plan
-- `documentation/order/plan-nous-ecrire.md` (2026-10-09) : plusieurs numéros,
-- chacun avec ce qu'on lit à côté (une boutique, un service…) et son public.
--
-- ADDITIVE : une table neuve. `contact_settings.phone` RESTE en base et n'est
-- plus lue ; s'il est renseigné, il est repris ici en un premier numéro
-- « Contact », pour les deux publics. Aucun droit accordé.
--
-- Retour arrière : `DROP TABLE "public"."contact_phone"` ; l'ancien numéro est
-- toujours dans `contact_settings.phone`.

CREATE TABLE "public"."contact_phone" (
    "id" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_en" TEXT NOT NULL DEFAULT '',
    "label_it" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL,
    "audience" "public"."ContactAudience" NOT NULL DEFAULT 'both',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_phone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_phone_archived_at_position_idx" ON "public"."contact_phone"("archived_at", "position");

INSERT INTO "public"."contact_phone"
    ("id", "label_fr", "label_en", "label_it", "number", "audience", "position", "active", "created_at", "updated_at")
SELECT 'contact-phone-legacy', 'Contact', 'Contact', 'Contatto', btrim("phone"), 'both', 0, true, now(), now()
  FROM "public"."contact_settings"
 WHERE "key" = 'contact' AND btrim("phone") <> '';
