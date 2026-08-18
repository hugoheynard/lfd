-- ───────────────────────────────────────────────────────────────────────────
-- L'ENGAGEMENT DE VOLUME : le barème se juge sur le CUMUL d'une période.
--
-- Deux formes s'offraient pour vendre un volume sur une durée — un prix fixe
-- daté, ou le barème sur volume cumulé. Au volume promis, les deux donnent le
-- MÊME prix ; elles ne divergent que lorsque la promesse n'est pas tenue.
--
-- Le prix fixe n'a alors aucune réponse arithmétique : il faut une clause, et un
-- rattrapage facturé rétroactivement — c'est-à-dire réécrire l'explication de
-- factures déjà payées, ce que la trace figée sur la ligne interdit exprès.
--
-- Le cumul laisse le client au palier qu'il a RÉELLEMENT atteint. Chaque facture
-- reste juste au moment où elle est émise, rien n'est jamais révisé, et les
-- conditions de sortie deviennent de l'arithmétique au lieu d'un texte.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE "volume_commitments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "promised_quantity" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    "archived_by" TEXT,
    "archive_reason" TEXT,

    CONSTRAINT "volume_commitments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volume_commitments_company_id_archived_at_idx"
  ON "volume_commitments" ("company_id", "archived_at");

-- Le volume visé est strictement positif, et la période s'ouvre avant de se
-- fermer. Deux refus que l'agrégat porte déjà ; ceci est la seconde barrière,
-- celle qui tient quand la donnée n'a pas traversé l'agrégat.
ALTER TABLE "volume_commitments"
  ADD CONSTRAINT "volume_commitments_promise_is_positive"
  CHECK ("promised_quantity" > 0);

ALTER TABLE "volume_commitments"
  ADD CONSTRAINT "volume_commitments_window_opens_before_closing"
  CHECK ("valid_to" > "valid_from");

-- ───────────────────────────────────────────────────────────────────────────
-- **Deux engagements ne se recouvrent jamais sur la même cible, pour le même
-- client.**
--
-- Sans cette garantie, deux périodes concurrentes donneraient deux cumuls, donc
-- deux paliers, donc un prix qui dépend de l'ordre de tri. C'est la même faute
-- que deux règles également spécifiques, et le même refus — tenu par Postgres,
-- parce qu'un contrôle applicatif se contourne par une insertion concurrente.
--
-- `coalesce` parce que NULL n'entre jamais en conflit avec NULL dans une
-- contrainte d'exclusion, et la portée globale est justement celle dont le
-- `scope_id` est NULL.
--
-- Partielle : archiver LIBÈRE la période, sinon un engagement clos l'an dernier
-- interdirait d'en signer un semblable.
-- ───────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "volume_commitments"
  ADD CONSTRAINT "volume_commitments_no_overlap"
  EXCLUDE USING gist (
    "company_id" WITH =,
    "scope_type" WITH =,
    coalesce("scope_id", '') WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);

-- ───────────────────────────────────────────────────────────────────────────
-- La MESURE figée avec le prix, sur la ligne de commande.
--
-- Même principe que le plancher dynamique : un prix qui dépend de l'historique
-- cesse d'être explicable dès que l'historique bouge, SAUF si la mesure est
-- consignée au moment où elle a compté. Sans cette colonne, un client demandant
-- six mois plus tard « pourquoi ce palier-là ? » n'aurait aucune réponse — le
-- cumul d'alors n'existerait plus nulle part.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "order_lines"
  ADD COLUMN "pricing_commitment" JSONB;
