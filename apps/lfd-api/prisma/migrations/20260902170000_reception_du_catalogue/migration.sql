-- La BOÎTE DE RÉCEPTION du catalogue B2B.
--
-- Aujourd'hui, `IngestCatalogService.apply()` écrit directement les tables de
-- VENTE : livrer et mettre en vente sont le même geste, et il appartient au
-- référentiel. Un article reçu est achetable par un client dans la même
-- requête, sans qu'aucun humain de la plateforme ne l'ait relu.
--
-- Cette table sépare les deux. Le PIM livre ici ; la plateforme valide ensuite,
-- avec ses règles et ses droits.
--
-- ── Pourquoi le snapshot ENTIER, et pas des faits par SKU ───────────────────
--
-- Un retrait est l'ABSENCE d'un SKU. Il ne s'exprime pas dans une table de
-- lignes entrantes : sans le snapshot complet, « ce qui sort » ne serait pas
-- validable, et c'est précisément ce qu'un relecteur doit voir.
--
-- ── ADDITIVE, et sans lecteur ───────────────────────────────────────────────
--
-- Table neuve et VIDE. Rien de ce qui est en vente ne change d'état à ce
-- déploiement, et aucun code ne la lit encore : l'ingestion continue d'écrire
-- les faits en direct. La bascule est un déploiement séparé, derrière un
-- drapeau, et son retour arrière est décrit au §9 du document de conception.

CREATE TABLE "public"."catalog_delivery" (
    "id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "excluded_skus" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by" TEXT,

    CONSTRAINT "catalog_delivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_delivery_status_received_at_idx"
    ON "public"."catalog_delivery"("status", "received_at");

-- 🔴 AU PLUS UNE arrivée en attente, tenue par POSTGRES et non par une garde
-- applicative.
--
-- « Une livraison remplace l'arrivée en attente ; il y en a zéro ou une, jamais
-- deux » est l'invariant qui fait que l'ordre cesse d'être une question : on ne
-- peut pas valider une arrivée périmée, elle n'existe plus. Un invariant de ce
-- poids ne se confie pas à une vérification en amont — deux livraisons
-- simultanées la contourneraient, et le relecteur validerait alors une arrivée
-- que le PIM a déjà remplacée.
--
-- Trois états, pas deux : `pending`, `accepted`, `superseded`. Une arrivée
-- remplacée sans avoir été lue n'a pas été acceptée, et les confondre effacerait
-- le seul fait qui compte alors — quelqu'un s'apprêtait à relire quelque chose
-- qui a disparu sous ses yeux. L'écran doit pouvoir le dire.
--
-- L'index porte sur une expression constante : c'est le motif d'unicité
-- « au plus une ligne satisfaisant ce prédicat ». Prisma ne sait pas déclarer
-- un index partiel ; il vit donc ici, et seulement ici.
CREATE UNIQUE INDEX "catalog_delivery_une_seule_en_attente"
    ON "public"."catalog_delivery"((TRUE))
    WHERE "status" = 'pending';
