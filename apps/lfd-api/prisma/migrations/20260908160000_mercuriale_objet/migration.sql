-- ───────────────────────────────────────────────────────────────────────────
-- LA MERCURIALE DEVIENT UN OBJET
--
-- Elle était N règles indépendantes dans `price_rules` — une par article et par
-- palier — que rien ne reliait. L'écran la reconstituait en regroupant celles
-- qui partagent un libellé et une fenêtre : la seule clé disponible, et une clé
-- qui confond deux poses homonymes.
--
-- Réunies en un objet, elles deviennent UNE décision : close d'un geste,
-- renommée d'un geste, et refusant ce qu'aucune règle isolée ne pouvait voir.
--
-- Le geste est celui du barème de volume (20260817220000) : créer, reprendre,
-- archiver ce qui a été repris — dans le MÊME fichier. Reprendre sans archiver
-- laisserait chaque client tarifé deux fois dès que la lecture bascule, donc
-- deux décisions au même étage qu'aucune contrainte ne voit ensemble : un 400
-- au paiement.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE "company_mercuriales" (
  "id"             TEXT         NOT NULL,
  "company_id"     TEXT         NOT NULL,
  "label"          TEXT         NOT NULL,
  "lines"          JSONB        NOT NULL,
  "valid_from"     TIMESTAMPTZ(3) NOT NULL,
  "valid_to"       TIMESTAMPTZ(3),
  "created_by"     TEXT         NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  "paused_at"      TIMESTAMPTZ(3),
  "paused_by"      TEXT,
  "archived_at"    TIMESTAMPTZ(3),
  "archived_by"    TEXT,
  "archive_reason" TEXT,

  CONSTRAINT "company_mercuriales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_mercuriales_company_id_archived_at_idx"
  ON "company_mercuriales" ("company_id", "archived_at");

-- ───────────────────────────────────────────────────────────────────────────
-- UNE SEULE MERCURIALE EN COURS PAR CLIENT
--
-- 🔴 Changement de comportement, pas traduction. `price_rules_no_overlap`
-- refuse le recouvrement par (étage, portée, audience, SEUIL, fenêtre) : deux
-- mercuriales pouvaient donc coexister chez un client sur la même période si
-- elles portaient sur des articles disjoints.
--
-- Ici la mercuriale EST l'unité, donc le recouvrement se juge par client. C'est
-- plus fort, plus simple, et c'est ce que l'écran raconte déjà (« il faut la
-- clore avant d'en poser une autre »).
--
-- Partielle sur `archived_at IS NULL`, comme partout ailleurs : clore rend la
-- place, ce qui est la condition pour reposer sur la même période. Une pause,
-- elle, la GARDE — sans quoi la reprise pourrait échouer sur un recouvrement
-- que personne n'a vu venir.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "company_mercuriales"
  ADD CONSTRAINT "company_mercuriales_no_overlap"
  EXCLUDE USING gist (
    "company_id" WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);

-- ───────────────────────────────────────────────────────────────────────────
-- REPRISE DES MERCURIALES DÉJÀ POSÉES
--
-- Groupées par (société, libellé, fenêtre) — la clé que l'écran utilisait pour
-- les reconstituer, et la seule dont on dispose. Les règles d'un même article
-- deviennent les paliers d'une ligne, triés par seuil croissant.
--
-- Aucune mercuriale n'existe en production au 2026-09-08 ; cette reprise est
-- donc un no-op là-bas. Elle est écrite quand même : « zéro » est un fait daté,
-- les deux routes de pose restent ouvertes d'ici au déploiement, et les bases
-- de développement, elles, ne sont pas vides.
--
-- Ce qu'elle NE reprend pas, et c'est voulu : les règles d'audience autre que
-- `company`. Elles ne sont plus écrivables depuis le 2026-09-08, aucune
-- n'existe, et si l'une survivait quelque part elle doit rester une règle
-- plutôt que d'être archivée en silence — archiver, ici, supprimerait un tarif.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO "company_mercuriales" (
  "id", "company_id", "label", "lines",
  "valid_from", "valid_to", "created_by", "created_at", "updated_at"
)
SELECT
  -- Un identifiant stable et lisible, dérivé du groupe : la migration n'a pas
  -- d'ULID sous la main, et un doublon est impossible puisque la clé du GROUP BY
  -- est celle du hachage.
  'merc_' || substr(
    md5(r."audience_id" || '|' || r."label" || '|' || r."valid_from"::text || '|' || coalesce(r."valid_to"::text, '')),
    1, 24
  ),
  r."audience_id",
  r."label",
  jsonb_agg(
    jsonb_build_object('sku', r."scope_id", 'tiers', r."tiers")
    ORDER BY r."scope_id"
  ),
  r."valid_from",
  r."valid_to",
  min(r."created_by"),
  now(),
  now()
FROM (
  SELECT
    "audience_id", "label", "valid_from", "valid_to", "scope_id",
    min("created_by") AS "created_by",
    jsonb_agg(
      jsonb_build_object(
        'minQuantity', coalesce("min_quantity", 1),
        'unitPriceMillicents', "amount_millicents"
      )
      ORDER BY coalesce("min_quantity", 1)
    ) AS "tiers"
  FROM "price_rules"
  WHERE "stage" = 'mercuriale'
    AND "audience_type" = 'company'
    AND "audience_id" IS NOT NULL
    AND "scope_id" IS NOT NULL
    AND "archived_at" IS NULL
    -- Une mercuriale pose un PRIX : `MercurialeMustPoseAPriceError` le garantit
    -- depuis le premier commit qui a permis d'écrire une règle. La clause est là
    -- pour que la migration échoue plutôt que d'écrire un prix nul si une ligne
    -- inattendue traînait.
    AND "nature" = 'replace'
    AND "amount_millicents" IS NOT NULL
  GROUP BY "audience_id", "label", "valid_from", "valid_to", "scope_id"
) AS r
GROUP BY r."audience_id", r."label", r."valid_from", r."valid_to";

-- ───────────────────────────────────────────────────────────────────────────
-- ARCHIVER CE QUI VIENT D'ÊTRE REPRIS
--
-- 🔴 Sans ça, chaque client repris porte sa grille DEUX FOIS dès que la lecture
-- bascule, et `winnerOf` refuse de départager deux décisions également
-- spécifiques au même étage : un 400 sur la commande.
--
-- Archivées et non supprimées, comme partout : une lecture datée d'avant la
-- bascule les retrouve, et ce qu'elles ont facturé reste figé sur les commandes.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE "price_rules"
SET "archived_at" = now(),
    "archived_by" = 'system',
    "archive_reason" = 'Reprise : la mercuriale est devenue un objet (20260908160000)'
WHERE "stage" = 'mercuriale'
  AND "audience_type" = 'company'
  AND "archived_at" IS NULL;
