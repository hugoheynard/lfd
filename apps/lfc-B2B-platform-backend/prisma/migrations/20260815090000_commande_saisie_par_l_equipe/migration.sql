-- La commande saisie par l'équipe : qui l'a prise, chez LFC.
--
-- `placed_by_user_id` continue de dire AU NOM DE QUI la commande est passée —
-- toujours un client, y compris quand un commercial la saisit au téléphone. La
-- nouvelle colonne dit QUI L'A SAISIE, et elle est nulle quand le client a
-- commandé seul.
--
-- Pas de clé étrangère vers `staff_users` : une commande est une pièce
-- comptable, elle ne doit ni disparaître ni bloquer le jour où on retire du
-- personnel de l'annuaire.
--
-- Avec `from_subscription_id`, cette colonne produit l'`origin` des vues de
-- lecture (self_service | back_office | recurring). Aucune valeur à
-- rétro-remplir : toutes les commandes existantes ont bien été passées par leur
-- client, donc NULL est la vérité, pas un trou.
ALTER TABLE "public"."orders"
  ADD COLUMN "placed_by_staff_id" TEXT;

-- « Qu'a saisi cette personne ? » est la question du suivi commercial ; sans
-- index elle scanne toute la table dès que le volume monte.
CREATE INDEX "orders_placed_by_staff_id_idx"
  ON "public"."orders" ("placed_by_staff_id");
