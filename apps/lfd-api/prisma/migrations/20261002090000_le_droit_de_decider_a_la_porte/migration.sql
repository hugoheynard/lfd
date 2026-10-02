-- LE DROIT DE DÉCIDER À LA PORTE — `delivery_decisions`
--
-- « À décider » (la liste des arrêts bloqués, autoriser, rapporter, la photo du
-- signalement) et la notification qui prévient sortent de `b2b_companies`
-- (2026-10-02, lot « correctifs de droits »). Gérer un compte client n'est pas
-- trancher pour lui pendant qu'un livreur attend.
--
-- 🔴 SEULE dans sa migration : une valeur d'enum ne s'EMPLOIE pas dans la
-- transaction qui l'ajoute. AUCUN droit n'est accordé ici
-- (`lint:no-role-grants-in-migrations`) : l'accord se fait à l'écran, AVANT
-- le déploiement — cf. `documentation/livraisons/tableau-droits-livraison.md`,
-- « Au déploiement ».
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_decisions' BEFORE 'staff_access';
