-- Les retraits d'avant S2 rattachés à leur site (décision de Hugo, 2026-10-23,
-- qui RÉVISE Q-S2 « jamais rattrapé »).
--
-- POURQUOI. Depuis le lot S2 (8ccb9dd12, 2026-10-13), une commande de retrait
-- fige l'identifiant de son site dans `orders.pickup_address` (`siteId`). Les
-- commandes d'avant n'en portent pas : la colonne Mode de la liste des
-- commandes du back-office les rend en teinte neutre. On leur pose le site
-- dont le snapshot est la copie exacte.
--
-- SEULEMENT LES COMMANDES MORTES : statut `fulfilled` ou `cancelled`, ou date
-- d'acheminement demandée strictement passée. Une commande vivante n'est
-- jamais touchée — son site gouverne encore le comptoir et l'échéance, et un
-- rattachement deviné n'a pas à en décider.
--
-- CORRESPONDANCE UNIQUE : libellé non vide, et label, ligne1, ligne2 (vide si
-- absente), code postal, ville, pays égaux après `btrim` à UN SEUL site
-- (`pickup_addresses`, archivés compris). Deux sites identiques : rien.
--
-- MARQUEUR : chaque snapshot rattaché porte `"siteIdBackfilled": true`. Il
-- distingue le site deviné ici du site figé à la passation, et rend le geste
-- réversible. `pickupSnapshotSchema` n'est pas strict : il l'ignore.
--
-- RETOUR ARRIÈRE :
--   UPDATE "public"."orders"
--      SET pickup_address = pickup_address - 'siteId' - 'siteIdBackfilled'
--    WHERE pickup_address ? 'siteIdBackfilled';
--
-- EFFETS CONNUS, acceptés :
--   · le déclencheur `orders_day_change_update` marquera des journées passées
--     comme changées : bruit attendu, sans conséquence sur une journée close ;
--   · `updated_at` n'est PAS touché, volontairement : la commande n'a pas
--     changé pour son client, seul son classement l'a fait ;
--   · une réimpression d'un vieux bon sortira colorée, alors que l'archive
--     d'origine ne l'est pas.
WITH candidates AS (
  SELECT o.id, (array_agg(s.id))[1] AS site_id
    FROM "public"."orders" o
    JOIN "public"."pickup_addresses" s
      ON btrim(s.label) = btrim(o.pickup_address->>'label')
     AND btrim(s.ligne1) = btrim(o.pickup_address->>'ligne1')
     AND btrim(coalesce(s.ligne2, '')) = btrim(coalesce(o.pickup_address->>'ligne2', ''))
     AND btrim(s.code_postal) = btrim(o.pickup_address->>'codePostal')
     AND btrim(s.ville) = btrim(o.pickup_address->>'ville')
     AND btrim(s.pays) = btrim(o.pickup_address->>'pays')
   WHERE o.fulfillment_method = 'pickup'
     AND (o.status IN ('fulfilled', 'cancelled') OR o.requested_delivery_date < current_date)
     AND jsonb_typeof(o.pickup_address) = 'object'
     AND NOT (o.pickup_address ? 'siteId')
     AND btrim(coalesce(o.pickup_address->>'label', '')) <> ''
   GROUP BY o.id
  HAVING count(*) = 1
)
UPDATE "public"."orders" o
   SET pickup_address = o.pickup_address || jsonb_build_object('siteId', c.site_id, 'siteIdBackfilled', true)
  FROM candidates c
 WHERE o.id = c.id;
