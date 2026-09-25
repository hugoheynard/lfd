-- LES DROITS JAMAIS ÉCRITS — ce que `ROLE_GRANTS` accorde et que la table n'a jamais reçu
--
-- Plan : documentation/staff/plan-roles-lus-en-base.md §6.
--
-- L'état des lieux de la PRODUCTION, lu par Hugo le 2026-09-25 (§6), a trouvé
-- trois ressources qu'AUCUNE migration n'a jamais écrites dans
-- `staff_role_definitions` — elles n'existaient que dans `ROLE_GRANTS` :
--
--   - `b2b_accounting`     : admin write, comptabilite write ;
--   - `b2b_order_waivers`  : admin write, commercial write ;
--   - `b2b_feature_access` : admin write, commercial read.
--
-- Tant que le résolveur lisait `ROLE_GRANTS`, le trou ne se voyait pas. Depuis
-- `20260926120000_les_roles_se_lisent_en_base`, qui ne fait qu'un INSERT …
-- ON CONFLICT DO NOTHING et ne touche donc pas les lignes existantes, admin,
-- comptabilite et commercial PERDAIENT ces droits. Aucune édition faite à
-- l'écran n'a été trouvée en production : tous les autres écarts sont des
-- droits que les migrations en attente (160100, 100100, 110100) posent.
--
-- Ce que fait cet ordre, et seulement ça : pour chaque rôle (sélectionné par sa
-- CLÉ, comme les migrations de droits précédentes), il AJOUTE chaque entrée de
-- `ROLE_GRANTS` dont la ressource est absente de la définition.
--   - jamais de retrait ;
--   - jamais de changement de niveau : une ressource déjà présente, à quelque
--     niveau que ce soit, n'est pas touchée ;
--   - idempotent : rejoué sur une base à jour, il ne trouve rien à ajouter et
--     n'écrit aucune ligne.
-- La copie de `ROLE_GRANTS` au 2026-09-26 est générée depuis `legacyRoleSeeds()`,
-- pas retranscrite. Elle couvre donc aussi ce que 160100, 100100 et 110100
-- posent déjà ; appliquées avant, elles laissent ces ressources présentes et
-- cet ordre ne les touche pas.
--
-- Retour arrière : retirer des `grants` d'admin, comptabilite et commercial les
-- entrées ajoutées ici. Sans objet tant que le résolveur lit la table : ce sont
-- des droits que ces rôles avaient déjà par le code.
UPDATE "public"."staff_role_definitions" AS d
SET "grants" = d."grants" || (
      SELECT jsonb_agg(wanted.entry)
      FROM jsonb_array_elements(seed.grants) AS wanted(entry)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(d."grants") AS held(entry)
        WHERE held.entry->>'resource' = wanted.entry->>'resource'
      )
    ),
    "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('admin', '[{"resource":"pim_catalog","action":"write"},{"resource":"pim_channels","action":"write"},{"resource":"pim_settings","action":"write"},{"resource":"pim_tax","action":"write"},{"resource":"media_library","action":"write"},{"resource":"b2b_companies","action":"write"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"write"},{"resource":"b2b_supervision","action":"write"},{"resource":"b2b_subscriptions","action":"write"},{"resource":"b2b_catalog","action":"write"},{"resource":"b2b_pricing","action":"write"},{"resource":"b2b_growth","action":"write"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"b2b_payments","action":"write"},{"resource":"b2b_accounting","action":"write"},{"resource":"b2b_deferred_payment_block","action":"write"},{"resource":"b2b_alerts","action":"write"},{"resource":"b2b_order_waivers","action":"write"},{"resource":"b2b_feature_access","action":"write"},{"resource":"b2b_client_notes","action":"write"},{"resource":"b2b_settings","action":"write"},{"resource":"b2b_storefront","action":"write"},{"resource":"staff_access","action":"write"},{"resource":"staff_notifications","action":"write"},{"resource":"ops_health","action":"write"},{"resource":"activity","action":"write"}]'::jsonb),
  ('commercial', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"read"},{"resource":"b2b_companies","action":"write"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"read"},{"resource":"b2b_subscriptions","action":"write"},{"resource":"b2b_catalog","action":"write"},{"resource":"b2b_pricing","action":"write"},{"resource":"b2b_growth","action":"write"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"b2b_payments","action":"read"},{"resource":"b2b_alerts","action":"write"},{"resource":"b2b_order_waivers","action":"write"},{"resource":"b2b_feature_access","action":"read"},{"resource":"b2b_client_notes","action":"write"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('comptabilite', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"write"},{"resource":"b2b_companies","action":"read"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"read"},{"resource":"b2b_subscriptions","action":"read"},{"resource":"b2b_catalog","action":"read"},{"resource":"b2b_pricing","action":"read"},{"resource":"b2b_payments","action":"write"},{"resource":"b2b_accounting","action":"write"},{"resource":"b2b_deferred_payment_block","action":"write"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('communication', '[{"resource":"pim_catalog","action":"read"},{"resource":"media_library","action":"write"},{"resource":"b2b_storefront","action":"write"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('comptoir', '[{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('support', '[{"resource":"b2b_companies","action":"read"},{"resource":"b2b_orders","action":"read"},{"resource":"b2b_subscriptions","action":"read"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('dev', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"read"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"},{"resource":"ops_health","action":"read"}]'::jsonb)
) AS seed(key, grants)
WHERE d."key" = seed.key
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(seed.grants) AS wanted(entry)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(d."grants") AS held(entry)
      WHERE held.entry->>'resource' = wanted.entry->>'resource'
    )
  );
