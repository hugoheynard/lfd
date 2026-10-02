-- LE DROIT DES PREUVES DE LIVRAISON — `delivery_proofs`
--
-- La preuve d'une livraison (photo, signature) sort de `b2b_orders`
-- (2026-10-02, lot « correctifs de droits ») : voir une commande n'est pas
-- voir la porte d'un client ni sa signature.
--
-- 🔴 SEULE dans sa migration : une valeur d'enum ne s'EMPLOIE pas dans la
-- transaction qui l'ajoute. AUCUN droit n'est accordé ici
-- (`lint:no-role-grants-in-migrations`) : l'accord se fait à l'écran — cf.
-- `documentation/livraisons/tableau-droits-livraison.md`, « Au déploiement ».
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_proofs' BEFORE 'staff_access';
