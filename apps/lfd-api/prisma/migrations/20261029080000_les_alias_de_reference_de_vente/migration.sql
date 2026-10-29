-- LES ALIAS DE RÉFÉRENCE DE VENTE — `documentation/catalogue/plan-defaut-sous-sa-reference.md`, L1.
--
-- Une table neuve, laissée VIDE : ses lecteurs (fournil attendu, classement
-- des lignes, habitudes, normes, unité de vente « déjà utilisée ») passent
-- par elle dès ce lot, et une table vide leur fait rendre exactement ce qu'ils
-- rendaient. Elle ne se remplit qu'à la bascule (L3), dans la migration de
-- données qui porte le garde-fou.
--
-- ADDITIF : aucune table existante n'est touchée.
--
-- Retour arrière : supprimer la table (vide, personne ne l'écrit avant L3).

SET lock_timeout = '5s';

CREATE TABLE "public"."sale_sku_alias" (
    "alias_sku" TEXT NOT NULL,
    "target_sku" TEXT NOT NULL,
    "written_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_sku_alias_pkey" PRIMARY KEY ("alias_sku")
);

CREATE INDEX "sale_sku_alias_target_sku_idx" ON "public"."sale_sku_alias"("target_sku");
