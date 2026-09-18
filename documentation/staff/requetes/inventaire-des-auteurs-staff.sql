-- Inventaire des auteurs staff — LECTURE SEULE.
--
-- Sert le plan `documentation/staff/plan-l-auteur-est-la-fiche.md`, §3 et D5 :
-- chaque valeur distincte écrite comme auteur staff, sa forme (`sub`, id de
-- fiche, autre), où elle apparaît, et les indices qui permettent de la
-- rattacher à une personne. Hugo valide les correspondances sur ce résultat ;
-- rien n'est converti sans elles.
--
-- La transaction est ouverte en READ ONLY et se termine par ROLLBACK : une
-- écriture glissée ici par erreur serait refusée par Postgres.
--
-- Colonnes : celles du §1 du plan (vérifiées le 2026-09-18). À relancer tel
-- quel après l'étape 4 comme contrôle : il ne doit plus rester de forme `sub`
-- hors des lignes que Hugo a laissées de côté.

BEGIN TRANSACTION READ ONLY;

-- 1. Chaque valeur d'auteur, et ce qu'on sait d'elle.
WITH author_values(source, value) AS (
  SELECT 'public.account_alerts.acknowledged_by', acknowledged_by::text FROM public.account_alerts WHERE acknowledged_by IS NOT NULL
UNION ALL
  SELECT 'public.account_alert_overrides.updated_by', updated_by::text FROM public.account_alert_overrides WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'public.alert_rule_settings.updated_by', updated_by::text FROM public.alert_rule_settings WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'pim.b2b_channel_binding.published_by', published_by::text FROM pim.b2b_channel_binding WHERE published_by IS NOT NULL
UNION ALL
  SELECT 'public.catalog_delivery.accepted_by', accepted_by::text FROM public.catalog_delivery WHERE accepted_by IS NOT NULL
UNION ALL
  SELECT 'public.catalog_item_overrides.decided_by', decided_by::text FROM public.catalog_item_overrides WHERE decided_by IS NOT NULL
UNION ALL
  SELECT 'pim.catalog_revision.taken_by', taken_by::text FROM pim.catalog_revision WHERE taken_by IS NOT NULL
UNION ALL
  SELECT 'pim.catalog_revision_publication.published_by', published_by::text FROM pim.catalog_revision_publication WHERE published_by IS NOT NULL
UNION ALL
  SELECT 'public.catalog_versions.created_by', created_by::text FROM public.catalog_versions WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'pim.category.updated_by', updated_by::text FROM pim.category WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'public.client_notes.created_by_sub', created_by_sub::text FROM public.client_notes WHERE created_by_sub IS NOT NULL
UNION ALL
  SELECT 'public.companies.kbis_certified_by_sub', kbis_certified_by_sub::text FROM public.companies WHERE kbis_certified_by_sub IS NOT NULL
UNION ALL
  SELECT 'public.companies.activated_by_sub', activated_by_sub::text FROM public.companies WHERE activated_by_sub IS NOT NULL
UNION ALL
  SELECT 'public.company_mercuriales.created_by', created_by::text FROM public.company_mercuriales WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'public.company_mercuriales.paused_by', paused_by::text FROM public.company_mercuriales WHERE paused_by IS NOT NULL
UNION ALL
  SELECT 'public.company_mercuriales.archived_by', archived_by::text FROM public.company_mercuriales WHERE archived_by IS NOT NULL
UNION ALL
  SELECT 'public.delivery_settings.updated_by_sub', updated_by_sub::text FROM public.delivery_settings WHERE updated_by_sub IS NOT NULL
UNION ALL
  SELECT 'public.feature_access_exemptions.created_by_sub', created_by_sub::text FROM public.feature_access_exemptions WHERE created_by_sub IS NOT NULL
UNION ALL
  SELECT 'public.feature_access_overrides.updated_by_sub', updated_by_sub::text FROM public.feature_access_overrides WHERE updated_by_sub IS NOT NULL
UNION ALL
  SELECT 'public.mercuriale_drafts.updated_by', updated_by::text FROM public.mercuriale_drafts WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'public.orders.ready_by', ready_by::text FROM public.orders WHERE ready_by IS NOT NULL
UNION ALL
  SELECT 'public.orders.handed_over_by', handed_over_by::text FROM public.orders WHERE handed_over_by IS NOT NULL
UNION ALL
  SELECT 'production.order_handover.handed_over_by', handed_over_by::text FROM production.order_handover WHERE handed_over_by IS NOT NULL
UNION ALL
  SELECT 'pim.order_time_limit.updated_by', updated_by::text FROM pim.order_time_limit WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'public.platform_content.updated_by', updated_by::text FROM public.platform_content WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'public.price_floors.created_by', created_by::text FROM public.price_floors WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'public.price_floors.archived_by', archived_by::text FROM public.price_floors WHERE archived_by IS NOT NULL
UNION ALL
  SELECT 'public.price_rules.created_by', created_by::text FROM public.price_rules WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'public.price_rules.paused_by', paused_by::text FROM public.price_rules WHERE paused_by IS NOT NULL
UNION ALL
  SELECT 'public.price_rules.archived_by', archived_by::text FROM public.price_rules WHERE archived_by IS NOT NULL
UNION ALL
  SELECT 'public.price_templates.created_by', created_by::text FROM public.price_templates WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'public.pricing_events.actor', actor::text FROM public.pricing_events WHERE actor IS NOT NULL
UNION ALL
  SELECT 'pim.product.updated_by', updated_by::text FROM pim.product WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'pim.product_packaging.updated_by', updated_by::text FROM pim.product_packaging WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'pim.product_readiness.ready_by', ready_by::text FROM pim.product_readiness WHERE ready_by IS NOT NULL
UNION ALL
  SELECT 'pim.product_variant.updated_by', updated_by::text FROM pim.product_variant WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'production.production_container.updated_by', updated_by::text FROM production.production_container WHERE updated_by IS NOT NULL
UNION ALL
  SELECT 'production.production_count.done_by', done_by::text FROM production.production_count WHERE done_by IS NOT NULL
UNION ALL
  SELECT 'production.production_day.retaken_by', retaken_by::text FROM production.production_day WHERE retaken_by IS NOT NULL
UNION ALL
  SELECT 'production.production_order.packed_by', packed_by::text FROM production.production_order WHERE packed_by IS NOT NULL
UNION ALL
  SELECT 'production.production_order_line.packed_by', packed_by::text FROM production.production_order_line WHERE packed_by IS NOT NULL
UNION ALL
  SELECT 'public.staff_notifications.read_by', read_by::text FROM public.staff_notifications WHERE read_by IS NOT NULL
UNION ALL
  SELECT 'public.staff_push_subscriptions.staff_sub', staff_sub::text FROM public.staff_push_subscriptions WHERE staff_sub IS NOT NULL
UNION ALL
  SELECT 'public.users.invited_by', invited_by::text FROM public.users WHERE invited_by IS NOT NULL
UNION ALL
  SELECT 'public.volume_commitments.created_by', created_by::text FROM public.volume_commitments WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'public.volume_commitments.archived_by', archived_by::text FROM public.volume_commitments WHERE archived_by IS NOT NULL
UNION ALL
  SELECT 'public.volume_ladders.created_by', created_by::text FROM public.volume_ladders WHERE created_by IS NOT NULL
UNION ALL
  SELECT 'public.volume_ladders.paused_by', paused_by::text FROM public.volume_ladders WHERE paused_by IS NOT NULL
UNION ALL
  SELECT 'public.volume_ladders.archived_by', archived_by::text FROM public.volume_ladders WHERE archived_by IS NOT NULL
UNION ALL
  SELECT 'growth.activity_events.actor_id', actor_id FROM growth.activity_events WHERE actor_type = 'staff' AND actor_id IS NOT NULL
UNION ALL
  SELECT 'growth.activity_events.payload.readyBy', payload->>'readyBy' FROM growth.activity_events WHERE payload ? 'readyBy'
UNION ALL
  SELECT 'growth.activity_events.payload.handedOverBy', payload->>'handedOverBy' FROM growth.activity_events WHERE payload ? 'handedOverBy'
),
per_value AS (
  SELECT value, count(*) AS occurrences,
         string_agg(DISTINCT source, ', ' ORDER BY source) AS sources
  FROM author_values
  GROUP BY value
),
journal_names AS (
  SELECT actor_id AS value,
         string_agg(DISTINCT coalesce(actor_name, '(sans nom)') || ' — ' || coalesce(actor_role, '?'), ' / ') AS names_in_journal,
         min(occurred_at) AS first_seen,
         max(occurred_at) AS last_seen
  FROM growth.activity_events
  WHERE actor_type = 'staff' AND actor_id IS NOT NULL
  GROUP BY actor_id
)
SELECT p.value AS valeur,
       CASE
         WHEN p.value LIKE '%|%' THEN 'sub'
         WHEN by_id.id IS NOT NULL THEN 'id de fiche'
         ELSE 'autre'
       END AS forme,
       p.occurrences,
       p.sources,
       by_sub.first_name || ' ' || by_sub.last_name || ' <' || by_sub.email || '> ' || by_sub.id AS fiche_dont_c_est_le_sub_actuel,
       by_id.first_name || ' ' || by_id.last_name AS fiche_dont_c_est_l_id,
       j.names_in_journal AS noms_figes_au_journal,
       j.first_seen AS premiere_apparition_au_journal,
       j.last_seen AS derniere_apparition_au_journal
FROM per_value p
LEFT JOIN public.staff_users by_sub ON by_sub.auth0_id = p.value
LEFT JOIN public.staff_users by_id ON by_id.id = p.value
LEFT JOIN journal_names j ON j.value = p.value
ORDER BY forme, p.occurrences DESC;

-- 2. Les fiches et leur `sub` actuel, pour lire la liste ci-dessus.
SELECT id, first_name || ' ' || last_name AS nom, email, role, status, auth0_id, created_at
FROM public.staff_users
ORDER BY created_at;

-- 3. Filet : un `sub` rangé sous une clé de charge utile inconnue du plan.
--    Toute ligne ici est une clé à ajouter à l'inventaire.
SELECT type, count(*) AS faits
FROM growth.activity_events
WHERE payload::text ~ '"(auth0|google-oauth2|samlp|waad|dev)\|[^"]+"'
  AND NOT (payload ? 'readyBy' OR payload ? 'handedOverBy')
GROUP BY type
ORDER BY faits DESC;

ROLLBACK;
