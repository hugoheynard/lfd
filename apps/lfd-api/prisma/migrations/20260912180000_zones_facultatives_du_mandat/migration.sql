-- Les zones FACULTATIVES du mandat SEPA qui nous appartiennent — 14, 19 et 20
-- du modèle EPC : le code que le débiteur veut voir revenir sur son relevé, le
-- numéro du contrat, et sa description.
--
-- Purement ADDITIVE : trois colonnes `NOT NULL DEFAULT ''` sur une table qui ne
-- porte encore aucune ligne en production. Le défaut vide évite toute bascule —
-- une zone facultative non renseignée est un état normal, pas une donnée
-- manquante à rattraper.
--
-- Retour arrière : `DROP COLUMN` sur les trois. Rien d'autre n'en dépend.
--
-- ⚠️ Schéma QUALIFIÉ, comme la migration qui a créé la table : la base porte
-- cinq schémas, et un `search_path` différent au déploiement viserait ailleurs.
ALTER TABLE "public"."company_bank_accounts"
  ADD COLUMN "debtor_reference" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "contract_number" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "contract_description" TEXT NOT NULL DEFAULT '';
