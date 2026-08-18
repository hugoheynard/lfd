-- Fige l'acheminement des commandes ANTÉRIEURES à la colonne `fulfillment`.
--
-- Le bon de production lisait le carnet d'adresses jusqu'ici ; il lit maintenant
-- le bloc figé. Sans reprise, toute commande d'avant la colonne perdrait son
-- contact de livraison sur le papier — un livreur partirait sans numéro pour un
-- compte qui en a un.
--
-- La reprise fige ce que le réglage dit AUJOURD'HUI, et le marque `default` :
-- c'est exact, puisque avant la colonne aucun écran ne permettait de s'écarter
-- du réglage. Ce n'est pas la vérité du jour de la commande — celle-là n'a
-- jamais été enregistrée nulle part — mais c'est la meilleure approximation
-- disponible, et elle cesse de dériver à partir de maintenant.
--
-- L'heure convenue reste `null` : aucune commande d'avant n'en portait, et en
-- inventer une ferait promettre un créneau que personne n'a arrêté.

-- 1. Les commandes livrées à une adresse du carnet : on reprend ses consignes.
UPDATE "public"."orders" AS o
SET "fulfillment" = jsonb_build_object(
  'window', jsonb_build_object('value', NULL, 'source', 'default'),
  'contact', jsonb_build_object('value', a."delivery_specs" -> 'deliveryContact', 'source', 'default'),
  'signatureRequired', jsonb_build_object(
    'value', COALESCE((a."delivery_specs" ->> 'signatureRequired')::boolean, false),
    'source', 'default'
  )
)
FROM "public"."addresses" AS a
WHERE o."fulfillment" IS NULL
  AND o."delivery_address_id" = a."id";

-- 2. Tout le reste (retraits, adresses dictées) : rien n'était convenu, et le
--    dire explicitement vaut mieux qu'une colonne nulle qu'on relira un jour
--    comme « pas encore décidé ».
UPDATE "public"."orders"
SET "fulfillment" = '{
  "window": {"value": null, "source": "default"},
  "contact": {"value": null, "source": "default"},
  "signatureRequired": {"value": false, "source": "default"}
}'::jsonb
WHERE "fulfillment" IS NULL;
