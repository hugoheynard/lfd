-- LE PRÉFIXE UNIVERSEL DES IMAGES — `products/` devient `images/`
--
-- Plan `documentation/mediatheque/plan-prefixe-universel.md`, lot D1
-- (décisions de Hugo du 2026-10-13 : Q1 `images`, Q2 réécrire l'existant).
--
-- 1. `media.media_prefix_move` : la correspondance PERMANENTE ancienne → neuve
--    (S4 de la contradiction). Additive, jamais vidée. La migration inverse du
--    runbook ne lit qu'elle.
-- 2. Une réécriture EN PLACE des références vivantes : même ligne
--    `media_asset` (même id, tags, série, palette, point focal), nouvelle
--    `url` et nouvelle `storage_key` ; et les textes alternatifs qui valent
--    exactement l'ancienne URL (O1). Les photographies figées (révisions,
--    snapshots, journal, outbox) ne sont PAS touchées : leurs URL `products/`
--    restent servies, les objets ne sont pas supprimés par ce lot.
--
-- 🔴 Les objets R2 doivent avoir été COPIÉS sous `images/` AVANT ce
-- déploiement (`dev-toolbox/media-prefix/copy-objects.mjs`, runbook). Cette
-- migration ne touche que la base.
--
-- Égalité EXACTE sur l'URL, jamais un motif : une URL saisie à la main qui
-- contiendrait `/products/` n'est pas touchée. Seules les lignes de
-- `media_asset` dont la clé commence par `products/` sont déplacées.
--
-- IDEMPOTENTE : elle ne traite que les lignes ENCORE sous `products/` au
-- moment où elle tourne. Le runbook la fait rejouer telle quelle (psql) si un
-- dépôt s'est glissé sous l'ancien préfixe pendant la bascule.
--
-- GARDES, avant tout UPDATE (S3) : une collision de clé primaire sur
-- `product_media` / `category_media`, une URL neuve déjà au fonds, une URL qui
-- ne finit pas par sa clé — chacune lève une exception NOMMÉE et la
-- transaction entière est annulée : rien n'est écrit.
--
-- Additive pour le schéma : une table de plus, aucune colonne touchée.
-- Retour arrière : la migration inverse du runbook (`documentation/ops/
-- runbook.md`, « Le préfixe universel de la médiathèque »), jamais un DROP.

CREATE TABLE IF NOT EXISTS "media"."media_prefix_move" (
    "old_url" TEXT NOT NULL,
    "new_url" TEXT NOT NULL,
    "old_storage_key" TEXT NOT NULL,
    "new_storage_key" TEXT NOT NULL,
    "moved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_prefix_move_pkey" PRIMARY KEY ("old_url")
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_prefix_move_new_url_key" ON "media"."media_prefix_move"("new_url");

DO $$
DECLARE
    offending TEXT;
BEGIN
    CREATE TEMP TABLE media_prefix_move_now ON COMMIT DROP AS
    SELECT a.url AS old_url,
           left(a.url, length(a.url) - length(a.storage_key))
               || 'images/' || substr(a.storage_key, length('products/') + 1) AS new_url,
           a.storage_key AS old_storage_key,
           'images/' || substr(a.storage_key, length('products/') + 1) AS new_storage_key
    FROM media.media_asset a
    WHERE a.storage_key LIKE 'products/%';

    -- Garde 1 : l'URL doit finir par sa clé, sinon la neuve serait fausse.
    SELECT a.url INTO offending
    FROM media.media_asset a
    WHERE a.storage_key LIKE 'products/%'
      AND right(a.url, length(a.storage_key) + 1) <> '/' || a.storage_key
    LIMIT 1;
    IF offending IS NOT NULL THEN
        RAISE EXCEPTION 'media_prefix_move.url_without_key: l''image « % » ne finit pas par sa clé de stockage — l''URL neuve ne peut pas se calculer. Rien n''a été écrit : corriger cette ligne de media.media_asset, puis relancer.', offending;
    END IF;

    -- Garde 2 : l'URL neuve est déjà celle d'une autre image du fonds.
    SELECT m.new_url INTO offending
    FROM media_prefix_move_now m
    JOIN media.media_asset a ON a.url = m.new_url
    LIMIT 1;
    IF offending IS NOT NULL THEN
        RAISE EXCEPTION 'media_prefix_move.new_url_taken: « % » est déjà au fonds sous le préfixe neuf, alors que la même image y est encore sous products/. Rien n''a été écrit : fusionner les deux lignes (remplacer l''une par l''autre à la médiathèque), puis relancer.', offending;
    END IF;

    -- Garde 3 : une fiche porte déjà la même image, au même rôle, sous les deux préfixes.
    SELECT pm.product_id || ' / ' || m.new_url INTO offending
    FROM pim.product_media pm
    JOIN media_prefix_move_now m ON pm.media_url = m.old_url
    JOIN pim.product_media twin
      ON twin.product_id = pm.product_id AND twin.role = pm.role AND twin.media_url = m.new_url
    LIMIT 1;
    IF offending IS NOT NULL THEN
        RAISE EXCEPTION 'media_prefix_move.product_media_collision: la fiche % porte la même image sous les deux préfixes, au même rôle. Rien n''a été écrit : retirer l''un des deux rattachements sur la fiche, puis relancer.', offending;
    END IF;

    -- Garde 4 : même chose pour une famille.
    SELECT cm.category_id || ' / ' || m.new_url INTO offending
    FROM pim.category_media cm
    JOIN media_prefix_move_now m ON cm.media_url = m.old_url
    JOIN pim.category_media twin
      ON twin.category_id = cm.category_id AND twin.role = cm.role AND twin.media_url = m.new_url
    LIMIT 1;
    IF offending IS NOT NULL THEN
        RAISE EXCEPTION 'media_prefix_move.category_media_collision: la famille % porte la même image sous les deux préfixes, au même rôle. Rien n''a été écrit : retirer l''un des deux rattachements sur la famille, puis relancer.', offending;
    END IF;

    INSERT INTO media.media_prefix_move (old_url, new_url, old_storage_key, new_storage_key)
    SELECT old_url, new_url, old_storage_key, new_storage_key FROM media_prefix_move_now
    ON CONFLICT (old_url) DO NOTHING;

    UPDATE pim.product_media t SET media_url = m.new_url
    FROM media_prefix_move_now m WHERE t.media_url = m.old_url;

    UPDATE pim.category_media t SET media_url = m.new_url
    FROM media_prefix_move_now m WHERE t.media_url = m.old_url;

    UPDATE pim.operations t SET image_url = m.new_url
    FROM media_prefix_move_now m WHERE t.image_url = m.old_url;

    UPDATE public.catalog_items t SET image_url = m.new_url
    FROM media_prefix_move_now m WHERE t.image_url = m.old_url;

    UPDATE public.catalog_items t SET thumbnail_url = m.new_url
    FROM media_prefix_move_now m WHERE t.thumbnail_url = m.old_url;

    UPDATE public.catalog_operations t SET image_url = m.new_url
    FROM media_prefix_move_now m WHERE t.image_url = m.old_url;

    UPDATE public.storefront_page t SET pickup_door_image_url = m.new_url
    FROM media_prefix_move_now m WHERE t.pickup_door_image_url = m.old_url;

    UPDATE public.storefront_page t SET delivery_door_image_url = m.new_url
    FROM media_prefix_move_now m WHERE t.delivery_door_image_url = m.old_url;

    UPDATE public.storefront_content t SET image_url = m.new_url
    FROM media_prefix_move_now m WHERE t.image_url = m.old_url;

    -- Les textes alternatifs qui VALENT l'ancienne URL — le repli d'`imageAlt`
    -- quand personne n'a écrit de description (O1, Hugo, 2026-10-13). Égalité
    -- exacte, valeur par valeur : un texte écrit à la main qui contient
    -- `/products/` n'est jamais touché. Ils lisent la correspondance
    -- PERMANENTE, pas celle de ce passage : rejouer la migration rattrape les
    -- textes d'images déjà déplacées.
    UPDATE public.catalog_items t SET image_alt = m.new_url
    FROM media.media_prefix_move m WHERE t.image_alt = m.old_url;

    UPDATE public.catalog_items t SET thumbnail_alt = m.new_url
    FROM media.media_prefix_move m WHERE t.thumbnail_alt = m.old_url;

    UPDATE media.media_asset a
    SET alt = (
        SELECT jsonb_object_agg(
            e.key,
            CASE WHEN e.value = to_jsonb(m.old_url) THEN to_jsonb(m.new_url) ELSE e.value END)
        FROM jsonb_each(a.alt) e)
    FROM media.media_prefix_move m
    WHERE jsonb_typeof(a.alt) = 'object'
      AND EXISTS (SELECT 1 FROM jsonb_each(a.alt) e WHERE e.value = to_jsonb(m.old_url));

    -- En dernier : l'image elle-même.
    UPDATE media.media_asset a SET url = m.new_url, storage_key = m.new_storage_key
    FROM media_prefix_move_now m WHERE a.url = m.old_url;
END $$;
