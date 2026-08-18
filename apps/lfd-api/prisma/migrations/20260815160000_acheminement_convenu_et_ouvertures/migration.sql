-- L'acheminement CONVENU d'une commande, figé avec la provenance de chaque
-- valeur (défaut du réglage / override). Nullable : les commandes antérieures
-- n'en portent pas, et le lecteur retombe alors sur un bloc « tout par défaut,
-- rien de connu » plutôt que d'inventer un contact.
ALTER TABLE "public"."orders" ADD COLUMN "fulfillment" JSONB;

-- Les heures d'ouverture d'un point de retrait : deux fenêtres nommées
-- (publique, pro), jamais fusionnées.
ALTER TABLE "public"."pickup_addresses" ADD COLUMN "opening" JSONB;
