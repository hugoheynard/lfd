-- LE DÉLAI D'ANNULATION FIGÉ À LA PASSATION — `orders.customer_cancellable_until`
--
-- Décision de Hugo, 2026-10-26 : les CGV promettent le délai « indiqué sur le
-- Site, rappelé avant la validation de la Commande ». Le réglage
-- `customer_cancellation_settings` était relu au moment où le client annule :
-- un changement fait après la commande lui retirait ou lui donnait un droit
-- que son contrat fixait. L'instant limite se calcule désormais UNE fois, à la
-- passation client d'un particulier, et c'est lui qui juge ensuite.
-- Doc : `documentation/commandes/annulation/annulation-par-le-client.md`.
--
-- NULL : commande d'une société (le pro annule jusqu'à l'arrêt du plan, sans
-- délai réglable), saisie de l'équipe, particulier passé quand le réglage
-- n'imposait aucun délai, commande sans date, et toutes les commandes d'avant
-- cette colonne — celles-ci gardent le calcul au réglage du jour.
--
-- Strictement ADDITIVE : une colonne nullable, aucun remplissage. L'ancien
-- binaire ne la connaît pas et ne l'écrit pas ; il continue de juger au
-- réglage du jour.
--
-- Retour arrière : `ALTER TABLE "public"."orders" DROP COLUMN
-- "customer_cancellable_until";` — les commandes passées entre-temps
-- retombent sur le réglage du jour.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "customer_cancellable_until" TIMESTAMPTZ(3);
