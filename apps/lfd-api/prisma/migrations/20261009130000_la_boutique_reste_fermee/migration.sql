-- La boutique reste fermée aux commandes si elle l'était (Hugo, 2026-10-09).
--
-- La clé `shop` de l'accès aux fonctionnalités a été retirée du code
-- (63fde9aac) ; l'ouverture des commandes se règle désormais par clientèle
-- (`order_opening_settings`, 20261009120000), ouverte par défaut. En
-- production, `shop` valait `browse` (catalogue visible, commandes refusées)
-- le 2026-10-09 : sans cette reprise, le déploiement aurait ouvert les
-- commandes à tout le monde jusqu'à un geste manuel.
--
-- Reprise exacte de l'état : si `shop` vaut `closed` ou `browse`, la boutique
-- est fermée aux pros ET aux particuliers ; sinon, rien n'est écrit (ligne
-- absente = ouverte). La ligne `shop` n'est ni lue ensuite ni effacée.
-- Idempotente : `ON CONFLICT DO NOTHING` ne remplace pas un réglage posé.
-- Aucun droit n'est accordé.
--
-- Retour arrière : `DELETE FROM public.order_opening_settings WHERE key =
-- 'orders' AND updated_by_role = 'system'` rouvre la boutique.

INSERT INTO "public"."order_opening_settings"
    ("key", "orders_open_to_b2b", "orders_open_to_b2c", "updated_at",
     "updated_by_staff_id", "updated_by_name", "updated_by_role")
SELECT 'orders', false, false, now(),
       '', 'Reprise du réglage « Boutique » (accès aux fonctionnalités)', 'system'
FROM "public"."feature_access_overrides"
WHERE "key" = 'shop' AND "value" IN ('closed', 'browse')
ON CONFLICT ("key") DO NOTHING;
