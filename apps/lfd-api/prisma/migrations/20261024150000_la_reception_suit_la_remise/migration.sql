-- LA RÉCEPTION SUIT LA REMISE — troisième temps (B4) de
-- documentation/commandes/plan-date-de-reception.md (§3, §6 Q5 et Q6 révisée).
--
-- 1. Dater les remises qui n'ont pas encore de date, PAR LA RÈGLE SIMPLE (le
--    jour de Paris de `handed_over_at`), AVANT de poser les contraintes.
--
--    Pourquoi ici et pas par le script de reprise (Q6 révisée par Hugo le
--    2026-10-24) : la production n'en portait qu'UNE (ORD-MV0Q32ES-0XXX,
--    remise le 2026-10-13 à 12:35Z, règle simple → 2026-10-13), et lancer le
--    script aurait demandé d'exporter l'URL de production sur un poste. Le
--    premier temps (B1+B2) est déployé : plus aucune remise neuve ne part
--    sans date, la liste ne peut donc pas grandir d'ici l'application.
--    ⚠️ `handed_over_at` est un `TIMESTAMP(3)` SANS fuseau, que Prisma écrit
--    en UTC : il faut d'abord le lire comme UTC (`AT TIME ZONE 'UTC'` →
--    timestamptz), puis le projeter sur Paris. Le seul `AT TIME ZONE
--    'Europe/Paris'` le lirait comme une heure de Paris et rendrait le jour
--    de la session — faux autour de minuit (sans effet sur la commande
--    ci-dessus : 12:35Z).
--    Pas de jointure inter-schémas : la règle de la porte (jour de tournée)
--    n'est pas rejouée, elle ne concerne pas cette commande.
--
--    Le déclencheur `orders_received_on_frozen` laisse passer NULL → valeur
--    (il ne mord que si `OLD.received_on IS NOT NULL`) : aucune date posée
--    ne bouge, aucune ligne de facture n'est touchée.
--
-- 2. Les deux sens de l'invariant (Q5) :
--    - `orders_handover_has_received_on` : une remise porte sa date ;
--    - `orders_received_on_has_handover` : une date suppose une remise.
--    Contrôle n° 5 du §8.2 relu en production le 2026-10-24 : 0 date sans
--    remise. Si la migration échoue sur le second CHECK, c'est qu'une ligne
--    est apparue depuis : ne rien forcer, la remonter à Hugo.
--
-- Le tout dans UNE transaction explicite : Prisma Migrate n'en ouvre pas, et
-- un échec sur le second CHECK laissait l'UPDATE et le premier CHECK appliqués
-- (constaté sur une base de test le 2026-10-24) — une migration à moitié
-- passée qu'il faut réparer à la main avant `migrate resolve`.
--
-- Retour arrière : `ALTER TABLE "orders" DROP CONSTRAINT …` pour les deux
-- contraintes, puis rebrancher l'abonné `RecordDeliveryDayOnHandover` retiré
-- du code dans le même lot. Les dates posées par l'UPDATE restent : le
-- déclencheur figé les tient, et c'est voulu (la valeur est vraie).

BEGIN;

UPDATE "orders"
SET "received_on" = (("handed_over_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date
WHERE "handed_over_at" IS NOT NULL AND "received_on" IS NULL;

ALTER TABLE "orders" ADD CONSTRAINT "orders_handover_has_received_on"
  CHECK ("handed_over_at" IS NULL OR "received_on" IS NOT NULL);

ALTER TABLE "orders" ADD CONSTRAINT "orders_received_on_has_handover"
  CHECK ("received_on" IS NULL OR "handed_over_at" IS NOT NULL);

COMMIT;
