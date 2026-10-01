-- LE DÉPÔT AUTORISÉ — `public.addresses.deposit_allowed`
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, AP-Q1, AP-D5 (lot A) :
-- le client permet au livreur de DÉPOSER sans personne pour réceptionner. Une
-- COLONNE et non une clé du `jsonb` `delivery_specs`, que le client et le staff
-- réécrivent d'un bloc : un front en ligne qui ne connaît pas la clé la
-- remettrait à `false` en silence.
--
-- Strictement ADDITIVE : `NOT NULL DEFAULT false`. Toutes les adresses
-- existantes — facturation comprise, où la colonne n'a pas de sens — valent
-- `false` : personne n'a encore rien autorisé, et c'est la seule valeur
-- honnête. L'ancien binaire, qui ne la connaît pas, écrit ses lignes neuves au
-- défaut et ne la touche jamais en mise à jour.
--
-- Postgres ≥ 11 pose un défaut constant sans réécrire la table.
--
-- Retour arrière : `ALTER TABLE "public"."addresses" DROP COLUMN "deposit_allowed";`
-- — perd les autorisations données entre-temps.

ALTER TABLE "public"."addresses" ADD COLUMN IF NOT EXISTS "deposit_allowed" BOOLEAN NOT NULL DEFAULT false;
