-- C0-d, tranche d-3 : RESSERRER.
--
-- Voir `documentation/pim/c0d-matrice-de-canaux.md`. Elle supprime ce que la
-- bascule d-2 a rendu mort, et que le binaire en ligne depuis n'a plus lu.
-- Feu vert : `ops_channel_parity` vert en production — sans quoi supprimer les
-- colonnes figerait la mauvaise vérité.
--
-- Elle ne touche PAS `click_collect` / `sur_place` : ces deux-là sont encore la
-- source de ce qu'un lieu offre, et le modèle du point de vente les absorbera
-- (cf. `documentation/pim/point-de-vente.md`).

-- ── 1. La traduction des clés ────────────────────────────────────────────────
-- Le plan de langue classait ces valeurs en « travail jetable, C0-d les
-- supprime ». C'était à moitié faux : il supprime les clés de STRUCTURE du
-- `jsonb`, pas les VALEURS du registre, qui seraient restées françaises pour
-- toujours. Elles ne vivent plus qu'à un endroit, et tout ce qui les cite le
-- fait par clé étrangère `ON UPDATE CASCADE` — d'où deux lignes.
--
-- `b2b` ne bouge pas : c'est déjà l'anglais du métier.
UPDATE "pim"."sales_context" SET "key" = 'takeaway' WHERE "key" = 'emporter';
UPDATE "pim"."sales_context" SET "key" = 'eatIn'    WHERE "key" = 'surPlace';

-- Le journal suit, pour les faits dont le contexte EST le sujet. Sans ça, un
-- « sales_context.updated · emporter » pointerait un contexte qui n'existe plus.
--
-- Les CHARGES UTILES, elles, ne sont pas réécrites : un fait parle le
-- vocabulaire de son moment, et fouiller du JSON historique pour le réécrire
-- coûte plus que ça ne rend. C'est le même choix qu'en août pour le renommage
-- `tax_rate.` → `vat_rate.`, où seul ce qui se JOINT avait été repris.
UPDATE "growth"."activity_events"
   SET "subject_id" = 'takeaway'
 WHERE "subject_type" = 'sales_context' AND "subject_id" = 'emporter';
UPDATE "growth"."activity_events"
   SET "subject_id" = 'eatIn'
 WHERE "subject_type" = 'sales_context' AND "subject_id" = 'surPlace';

-- ── 2. La matrice `jsonb` s'en va ────────────────────────────────────────────
-- Lue par personne depuis d-2 ; écrite jusqu'ici pour que le binaire précédent
-- puisse la lire en cas de retour arrière. Ce retour n'a pas eu lieu.
ALTER TABLE "pim"."category" DROP COLUMN "channel_preset";
ALTER TABLE "pim"."product"  DROP COLUMN "channel_override";

-- ── 3. Le registre perd sa colonne de transition ─────────────────────────────
-- `channel_key` demandait au contexte de nommer l'un des trois drapeaux en dur
-- de l'ancienne matrice. `per_location` l'a remplacée en d-0.
ALTER TABLE "pim"."sales_context" DROP COLUMN "channel_key";

-- ── 4. L'index de référence n'a plus lieu d'être ─────────────────────────────
-- Il portait le `Restrict` vers l'emplacement par procuration, faute de pouvoir
-- poser une clé étrangère dans du `jsonb`. `category_channel` le contient, avec
-- le contexte en plus, et sa clé étrangère est directe.
DROP TABLE "pim"."category_location_ref";
