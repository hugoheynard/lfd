-- L'IDENTIFIANT D'ENVOI d'une livraison de la vitrine (en-tête
-- `Vitrine-Delivery`), distinct de l'identifiant de la ligne.
--
-- Le bug (2026-10-18) : une livraison en attente qui absorbait de nouveaux
-- changements repartait sous le même `Vitrine-Delivery`. Une agence qui écarte
-- les doublons par cet en-tête, et qui avait traité un essai dont la réponse
-- était arrivée trop tard, jetait le contenu grossi et perdait les ajouts.
-- Désormais chaque absorption tire un identifiant d'envoi neuf ; la ligne, la
-- séquence et les essais restent.
--
-- ADDITIF : une colonne neuve, remplie par l'identifiant de la ligne (ce que
-- l'en-tête valait jusqu'ici, donc aucune livraison déjà partie ne change
-- d'identité), puis rendue obligatoire. Retour arrière : DROP COLUMN.
ALTER TABLE "public"."vitrine_deliveries" ADD COLUMN "dispatch_id" TEXT;
UPDATE "public"."vitrine_deliveries" SET "dispatch_id" = "id";
ALTER TABLE "public"."vitrine_deliveries" ALTER COLUMN "dispatch_id" SET NOT NULL;
