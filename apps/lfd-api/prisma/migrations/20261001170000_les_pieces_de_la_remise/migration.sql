-- LES PIÈCES D'UNE REMISE À LA PORTE — `production.order_handover_proof`
--
-- Retour arrière : `DROP TABLE "production"."order_handover_proof";` — perd
-- les pièces des remises faites depuis (les images restent au bucket, sans
-- ligne qui les cite) ; le binaire de ce lot ne démarre plus de remise à la
-- porte sans elle, il faut donc revenir AVANT au binaire précédent.
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, B1 et § 9 (Hugo : « même
-- le happy path signé remis doit avoir des photos »), L6-C9 (« les preuves
-- appartiennent au retrait »). Une ligne par COMMANDE, écrite par le retrait
-- dans la même transaction que `order_handover` : la photo, la signature au
-- doigt quand l'arrêt l'exigeait au départ, le nom tapé de qui a réceptionné.
-- Les images vivent au bucket des pièces, sous ces clés.
--
-- Identifiant opaque du commerce, sans clé étrangère — comme ses voisines
-- `order_handover` et `order_departure`, dans le schéma `production` : le
-- retrait n'a pas de schéma à lui.
--
-- Strictement ADDITIVE : une table neuve, vide. Aucun remplissage — une
-- remise faite avant ce lot n'a pas de pièce, et en inventer une serait faux.
-- L'ancien binaire ne la connaît pas et n'y touche pas.

CREATE TABLE IF NOT EXISTS "production"."order_handover_proof" (
    "order_id" TEXT NOT NULL,
    "receiver_name" TEXT,
    "photo_key" TEXT NOT NULL,
    "signature_key" TEXT,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_handover_proof_pkey" PRIMARY KEY ("order_id")
);
