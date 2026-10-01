-- LA GARDE PASSE AU LIVREUR AU DÉPART — `production.order_departure`
--
-- Retour arrière : `DROP TABLE "production"."order_departure";` — perd la
-- mémoire des départs annoncés depuis ; le contrôle qualité recommence alors à
-- accepter un verdict sur une commande partie (l'état d'avant ce lot).
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, § 10 ter (BQ), après
-- LB-Q1 tranché par Hugo le 2026-10-01 : « on ne peut pas faire de contrôle
-- qualité sur les commandes d'une tournée partie, car nous ne sommes plus en
-- présence du produit ». Le retrait (`handover`) tient la garde d'une
-- commande ; la livraison lui annonce, APRÈS la validation du départ, les
-- commandes qui partent ; le fournil le lui demande avant un verdict.
--
-- Une ligne par COMMANDE (la clé du retrait), l'instant du dernier départ
-- annoncé. Identifiant opaque du commerce, sans clé étrangère — comme
-- `order_handover.order_id`. Rangée dans le schéma `production` avec
-- `order_handover`, sa voisine : le retrait n'a pas de schéma à lui.
--
-- Écrivain : le retrait seul (`PrismaOrderDepartureRepository`), par une
-- projection idempotente (rejouer l'annonce réécrit le même instant).
--
-- Strictement ADDITIVE : une table neuve, vide. Aucun remplissage — une
-- tournée partie avant ce déploiement n'est pas rétro-annoncée ; le dire
-- serait inventer une garde que personne n'a annoncée. L'ancien binaire ne la
-- connaît pas et n'y touche pas.

CREATE TABLE IF NOT EXISTS "production"."order_departure" (
    "order_id" TEXT NOT NULL,
    "departed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_departure_pkey" PRIMARY KEY ("order_id")
);
