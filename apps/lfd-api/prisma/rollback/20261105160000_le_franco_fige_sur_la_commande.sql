-- RETOUR ARRIÈRE de 20261105160000_le_franco_fige_sur_la_commande (sous-lot 1a
-- du plan `documentation/promotions/plan-livraison-offerte.md`).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- Avant le sous-lot 1b, rien n'écrit ces colonnes : le retour arrière est le
-- retour du code seul, et ce fichier n'a rien à jouer. Les CHECK admettent les
-- écritures du code d'avant (colonnes NULL).
--
-- Après 1b, une commande au franco porte un frais nul : le code d'avant la
-- relirait comme une livraison gratuite, sans la ligne « offerte ». Retirer
-- les colonnes serait un resserrement ultérieur, sur décision de Hugo :
--
--   ALTER TABLE public.orders
--     DROP CONSTRAINT orders_free_delivery_together,
--     DROP CONSTRAINT orders_free_delivery_ttc_iff_exact_ht,
--     DROP CONSTRAINT orders_free_delivery_waives_fee;

SELECT 1;
