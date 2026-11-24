-- Le créneau d'un panier récurrent (documentation/commandes/paniers-recurrents/
-- plan-planificateur.md, lot R3) : une commande sans créneau est refusée, et
-- chaque échéance en devient une.
--
-- ADDITIVE : une colonne nullable. Les paniers existants n'en ont pas, et leurs
-- échéances seront refusées faute de créneau ; aucune valeur n'est devinée.
-- Retour arrière : supprimer la colonne, qu'aucun code d'avant ce lot ne lit.

ALTER TABLE "public"."subscriptions" ADD COLUMN "requested_window" JSONB;
