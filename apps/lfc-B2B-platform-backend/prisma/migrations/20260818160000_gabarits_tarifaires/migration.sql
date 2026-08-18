-- ───────────────────────────────────────────────────────────────────────────
-- LES GABARITS TARIFAIRES — la grille qu'on prépare une fois, qu'on repose.
--
-- Une seule forme : une liste de paliers portant des PRIX en euros. Le « prix
-- fixe » n'est pas une seconde forme, c'est le gabarit à UN palier, à partir
-- de 1. Les deux façons de saisir ne changent que la manière d'arriver au prix.
--
-- Aucune primitive de calcul n'est ajoutée. Posé chez un client, un gabarit
-- devient N règles de l'étage mercuriale à des seuils différents — que le
-- moteur résout déjà par sa spécificité (le seuil est son troisième critère), et
-- dont l'unicité est déjà tenue par la contrainte d'exclusion des règles, qui
-- porte justement sur `min_quantity`.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE "price_templates" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "price_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_templates_kind_archived_at_idx"
  ON "price_templates" ("kind", "archived_at");

-- Un gabarit sans ligne ne pose rien : il se lirait comme une grille vide chez
-- un client, et personne ne saurait si c'est une erreur de saisie ou un choix.
ALTER TABLE "price_templates"
  ADD CONSTRAINT "price_templates_has_lines"
  CHECK (jsonb_array_length("lines") > 0);
