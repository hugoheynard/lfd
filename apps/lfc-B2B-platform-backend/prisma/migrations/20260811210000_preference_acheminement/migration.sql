-- **Préférence d'acheminement** d'une société : comment ce client est servi
-- d'habitude. Ce n'est pas une contrainte — la commande s'ouvre dessus, et le
-- client peut en changer au panier. Un réglage qui interdit se contourne par un
-- appel au commercial ; un réglage qui propose fait gagner trois clics par
-- commande sans jamais bloquer personne.
--
-- `NULL` sur la méthode = **aucune préférence posée**, ce qui n'est pas
-- « retrait » : c'est l'état de tout le portefeuille existant, et il doit rester
-- lisible. Aucune reprise de données, donc : les sociétés existantes restent
-- sans préférence, et le panier se comporte exactement comme avant.
--
-- Les deux pointeurs restent facultatifs même quand la méthode est posée :
-- `NULL` renvoie au DÉFAUT du moment (celui de la plateforme pour le retrait,
-- celui de la société pour la livraison). Pointer explicitement sur l'adresse
-- par défaut la figerait — le jour où elle change, la préférence désignerait
-- encore l'ancienne, sans que personne ne s'en aperçoive.

ALTER TABLE "public"."companies"
  ADD COLUMN "preferred_fulfillment_method" "public"."FulfillmentMethod",
  ADD COLUMN "preferred_pickup_address_id" TEXT,
  ADD COLUMN "preferred_delivery_address_id" TEXT;

-- `SET NULL` des deux côtés : supprimer un point de retrait ou une adresse fait
-- retomber la préférence sur le défaut, jamais sur un pointeur mort. Un
-- `RESTRICT` interdirait au staff de supprimer un labo tant qu'une société le
-- préfère — une contrainte qui punirait le mauvais geste.
ALTER TABLE "public"."companies"
  ADD CONSTRAINT "companies_preferred_pickup_address_id_fkey"
  FOREIGN KEY ("preferred_pickup_address_id") REFERENCES "public"."pickup_addresses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."companies"
  ADD CONSTRAINT "companies_preferred_delivery_address_id_fkey"
  FOREIGN KEY ("preferred_delivery_address_id") REFERENCES "public"."addresses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
