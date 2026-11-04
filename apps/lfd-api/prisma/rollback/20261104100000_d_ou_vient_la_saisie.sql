-- RETOUR ARRIÈRE de 20261104100000_d_ou_vient_la_saisie (Hugo, 2026-11-04).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- Le code d'avant ne lit ni n'écrit `entry_origin` : ses passations laissent
-- `NULL`, que le CHECK admet. Le retour arrière est le retour du code seul ;
-- ce fichier n'a rien à jouer. Perdu au retour : rien, la colonne reste.
--
-- Retirer la colonne serait un resserrement ultérieur, sur décision de Hugo :
--
--   ALTER TABLE public.orders DROP CONSTRAINT orders_entry_origin_by_staff;

SELECT 1;
