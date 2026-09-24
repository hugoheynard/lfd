-- LA VITRINE A SON DROIT
--
-- Composer les pages de la boutique devient un droit à part : `b2b_storefront`
-- (read / write). La communication compose la vitrine sans ouvrir les
-- réglages de la plateforme (`b2b_settings`), qui portent les points de
-- retrait et les heures limites.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les tables et les
-- droits des rôles sont dans la suivante (`20260924100100_la_vitrine_s_enregistre`),
-- et les deux ne se séparent pas.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée — c'est l'unique
-- partie non réversible du lot.
--
-- Plan : documentation/order/plan-vitrine-enregistrement.md (D7, « Retour arrière »)

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_storefront';
