-- LA DEMANDE DE MODIFICATION DE COMMANDE — le type (plan
-- `documentation/commandes/plan-modifier-une-commande.md`, M4, 2026-10-23).
--
-- Après l'heure limite, le client DEMANDE une modification ; c'est une demande
-- client de la boîte existante, d'un type de plus.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute, et la migration suivante l'emploie (CHECK, index).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."RequestKind" ADD VALUE IF NOT EXISTS 'order_change';
