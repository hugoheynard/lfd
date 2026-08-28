-- Le CONTENU DE PLATEFORME — les textes de la vitrine, sortis du bundle.
--
-- Purement ADDITIVE : une table neuve, aucune colonne touchée, aucune donnée
-- déplacée. Le binaire qui tourne aujourd'hui ne la lit pas et continue de
-- fonctionner — c'est le temps « étendre » de `documentation/ops/pipelines.md`.
--
-- Il n'y a ni « basculer » ni « resserrer » à prévoir côté base : rien n'est
-- remplacé ici. Le basculement se joue dans le FRONT client, qui lira cette
-- table au lieu de ses dictionnaires compilés — et qui gardera les
-- dictionnaires en repli, donc sans fenêtre où le pied de page serait vide.
--
-- `content` est du JSONB : la forme est l'affaire du contrat (`footerContentSchema`),
-- validée au bord par Zod. C'est délibéré — tout l'intérêt est qu'elle bouge
-- quand la vitrine bouge, sans une migration par paragraphe ajouté. Ce que la
-- base garantit est ce qu'elle sait garantir : une ligne par bloc, et la trace
-- de son dernier changement.

CREATE TABLE "public"."platform_content" (
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_content_pkey" PRIMARY KEY ("key")
);
