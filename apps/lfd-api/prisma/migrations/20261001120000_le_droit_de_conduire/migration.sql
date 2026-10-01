-- LE DROIT DE CONDUIRE SA TOURNÉE — `delivery_driving`
--
-- Plan `documentation/livraisons/plan-ma-tournee.md`, MT-D1 v2 : lire la
-- tournée qui vous est affectée, la commencer. Distinct de `delivery_loading`,
-- qui ouvre le scan et le plan de chargement — le donner au livreur lui
-- ouvrirait le dépôt.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Le rôle et le droit
-- de l'administrateur sont dans la suivante (`20261001120100_le_role_livreur`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_driving' BEFORE 'staff_access';
