-- ───────────────────────────────────────────────────────────────────────────
-- LES VERSIONS DU BON DE LIVRAISON — chaque contenu, figé à sa naissance.
--
-- Plan documentation/commandes/reliquat/plan-reliquat-de-commande.md, lot B4b.1
-- (§ 5 ter). ADDITIVE : la table naît vide. Les bons déjà en base n'ont
-- aucune version, et n'en reçoivent pas : figer leur contenu d'aujourd'hui sous
-- le nom « d'origine » mentirait pour ceux qui ont déjà été réécrits. Leur
-- première version enregistrée sera la prochaine.
--
-- `public.delivery_note_version` : une ligne par contenu d'un bon, écrite par
-- le dépôt des bons dans la transaction qui fait naître le bon ou monter sa
-- `content_version`. `rendered` est l'entrée complète du rendu PDF client
-- (le BL chiffré composé, et ce qui manque encore) : le PDF d'une version se
-- rend d'elle seule. `cause` : `born` (le bon naît), `departure_decided` (le
-- départ incomplet est décidé), `replanned` (toute autre réécriture). Pas de
-- clé étrangère depuis `delivery_note.printed_version` : un bon d'avant cette
-- migration a pu être imprimé dans une version jamais enregistrée.
--
-- Retour arrière, tant que la table est vide :
--   DROP TABLE "public"."delivery_note_version";
-- Au-delà, elle reste : c'est une trace.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TABLE "public"."delivery_note_version" (
    "id" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "content_version" INTEGER NOT NULL,
    "rendered" JSONB NOT NULL,
    "cause" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_note_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_note_version_cause_known"
        CHECK ("cause" IN ('born', 'departure_decided', 'replanned')),
    CONSTRAINT "delivery_note_version_positive" CHECK ("content_version" >= 1),
    CONSTRAINT "delivery_note_version_rendered_object"
        CHECK (jsonb_typeof("rendered") = 'object')
);

CREATE UNIQUE INDEX "delivery_note_version_delivery_note_id_content_version_key"
    ON "public"."delivery_note_version"("delivery_note_id", "content_version");

ALTER TABLE "public"."delivery_note_version"
    ADD CONSTRAINT "delivery_note_version_delivery_note_id_fkey"
    FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_note"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
