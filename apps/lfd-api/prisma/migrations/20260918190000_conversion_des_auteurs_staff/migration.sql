-- ───────────────────────────────────────────────────────────────────────────
-- CONVERSION DES AUTEURS STAFF : le `sub` devient l'id de la fiche.
--
-- Cf. documentation/staff/plan-l-auteur-est-la-fiche.md — D5.2, D7, étape 4.
--
-- 🔴 LIVRÉE DANS LE DÉPLOIEMENT QUI SUIT celui de l'étape 3 (le code écrit
-- l'id de fiche). Jouée plus tôt, l'ancienne instance — qui répond encore une
-- à deux minutes pendant un déploiement — réécrirait des `sub` derrière elle.
--
-- CE QUI EST CONVERTI : toute valeur d'auteur staff égale à un `sub` de la
-- table des `sub` (`staff_subject_aliases`) prend l'id de la fiche qui l'a
-- porté. RIEN D'AUTRE : un marqueur (`seed-pim`, `sonde`, `system`,
-- `unknown-staff`…), un id de fiche déjà écrit, un `sub` que la base n'a
-- jamais relié à une fiche restent tels quels — on n'invente pas d'auteur.
--
-- CE QUI NE L'EST PAS, délibérément :
--   · `pim.catalog_content` — le contenu figé d'une révision est adressé par
--     son empreinte ; y toucher changerait des clés (plan, D6) ;
--   · `activity_events.actor_name` / `actor_role` — figés à l'écriture ;
--   · les faits client et système du journal.
--
-- LES JOURNAUX (D7) : `activity_events.actor_id`, deux clés de charge utile,
-- et `pricing_events.actor` sont TRADUITS — un identifiant de la même
-- personne remplace un autre ; ni le fait, ni son sujet, ni son instant ne
-- bougent. Exception de CLAUDE.md §8, accordée par Hugo le 2026-09-18 pour le
-- journal tarifaire.
--
-- IDEMPOTENTE : un id de fiche n'est jamais un `sub` de la table, une
-- seconde passe ne trouve rien.
--
-- RETOUR ARRIÈRE : le chemin inverse est dans la table des `sub`, mais il
-- n'est pas univoque (une fiche peut avoir plusieurs `sub`) et il n'y a pas de
-- raison de le prendre : le code déployé lit les deux formes. Pas de retour
-- arrière scripté.
-- ───────────────────────────────────────────────────────────────────────────

-- 0. La table des `sub` d'abord : une liaison faite par l'ancienne instance
--    pendant le déploiement de l'étape 3 n'a pas écrit son alias.
INSERT INTO "public"."staff_subject_aliases" ("sub", "staff_user_id", "source")
SELECT su."auth0_id", su."id", 'current'
  FROM "public"."staff_users" AS su
 WHERE su."auth0_id" IS NOT NULL
ON CONFLICT ("sub") DO NOTHING;

-- 1. Les colonnes d'auteur (plan §1.1).
UPDATE "public"."account_alerts" AS t SET "acknowledged_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."acknowledged_by" = a."sub";
UPDATE "public"."account_alert_overrides" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "public"."alert_rule_settings" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "pim"."b2b_channel_binding" AS t SET "published_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."published_by" = a."sub";
UPDATE "public"."catalog_delivery" AS t SET "accepted_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."accepted_by" = a."sub";
UPDATE "public"."catalog_item_overrides" AS t SET "decided_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."decided_by" = a."sub";
UPDATE "pim"."catalog_revision" AS t SET "taken_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."taken_by" = a."sub";
UPDATE "pim"."catalog_revision_publication" AS t SET "published_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."published_by" = a."sub";
UPDATE "public"."catalog_versions" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "pim"."category" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "public"."client_notes" AS t SET "created_by_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by_sub" = a."sub";
UPDATE "public"."companies" AS t SET "kbis_certified_by_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."kbis_certified_by_sub" = a."sub";
UPDATE "public"."companies" AS t SET "activated_by_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."activated_by_sub" = a."sub";
UPDATE "public"."company_mercuriales" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "public"."company_mercuriales" AS t SET "paused_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."paused_by" = a."sub";
UPDATE "public"."company_mercuriales" AS t SET "archived_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."archived_by" = a."sub";
UPDATE "public"."delivery_settings" AS t SET "updated_by_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by_sub" = a."sub";
UPDATE "public"."feature_access_exemptions" AS t SET "created_by_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by_sub" = a."sub";
UPDATE "public"."feature_access_overrides" AS t SET "updated_by_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by_sub" = a."sub";
UPDATE "public"."mercuriale_drafts" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "public"."orders" AS t SET "ready_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."ready_by" = a."sub";
UPDATE "public"."orders" AS t SET "handed_over_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."handed_over_by" = a."sub";
UPDATE "production"."order_handover" AS t SET "handed_over_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."handed_over_by" = a."sub";
UPDATE "pim"."order_time_limit" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "public"."platform_content" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "public"."price_floors" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "public"."price_floors" AS t SET "archived_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."archived_by" = a."sub";
UPDATE "public"."price_rules" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "public"."price_rules" AS t SET "paused_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."paused_by" = a."sub";
UPDATE "public"."price_rules" AS t SET "archived_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."archived_by" = a."sub";
UPDATE "public"."price_templates" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "public"."pricing_events" AS t SET "actor" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."actor" = a."sub";
UPDATE "pim"."product" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "pim"."product_packaging" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "pim"."product_readiness" AS t SET "ready_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."ready_by" = a."sub";
UPDATE "pim"."product_variant" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "production"."production_container" AS t SET "updated_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."updated_by" = a."sub";
UPDATE "production"."production_count" AS t SET "done_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."done_by" = a."sub";
UPDATE "production"."production_day" AS t SET "retaken_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."retaken_by" = a."sub";
UPDATE "production"."production_order" AS t SET "packed_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."packed_by" = a."sub";
UPDATE "production"."production_order_line" AS t SET "packed_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."packed_by" = a."sub";
UPDATE "public"."staff_notifications" AS t SET "read_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."read_by" = a."sub";
UPDATE "public"."staff_push_subscriptions" AS t SET "staff_sub" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."staff_sub" = a."sub";
UPDATE "public"."users" AS t SET "invited_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."invited_by" = a."sub";
UPDATE "public"."volume_commitments" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "public"."volume_commitments" AS t SET "archived_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."archived_by" = a."sub";
UPDATE "public"."volume_ladders" AS t SET "created_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."created_by" = a."sub";
UPDATE "public"."volume_ladders" AS t SET "paused_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."paused_by" = a."sub";
UPDATE "public"."volume_ladders" AS t SET "archived_by" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE t."archived_by" = a."sub";

-- 2. Le journal d'activité : l'auteur des faits staff.
UPDATE "growth"."activity_events" AS e SET "actor_id" = a."staff_user_id" FROM "public"."staff_subject_aliases" AS a WHERE e."actor_type" = 'staff' AND e."actor_id" = a."sub";

-- 3. Les deux charges utiles qui portent un auteur staff (`order.ready`,
--    `order.handed_over`), clé par clé.
UPDATE "growth"."activity_events" AS e SET "payload" = jsonb_set(e."payload"::jsonb, '{readyBy}', to_jsonb(a."staff_user_id")) FROM "public"."staff_subject_aliases" AS a WHERE e."payload"::jsonb ->> 'readyBy' = a."sub";
UPDATE "growth"."activity_events" AS e SET "payload" = jsonb_set(e."payload"::jsonb, '{handedOverBy}', to_jsonb(a."staff_user_id")) FROM "public"."staff_subject_aliases" AS a WHERE e."payload"::jsonb ->> 'handedOverBy' = a."sub";
