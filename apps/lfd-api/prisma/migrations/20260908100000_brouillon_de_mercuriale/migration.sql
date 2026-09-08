-- **Le brouillon de mercuriale d'un client** — une négociation en cours.
--
-- ## Additive, et sans reprise
--
-- Une table neuve, rien de déplacé, rien de resserré. Elle naît vide : il n'y a
-- pas de brouillon à rapatrier, puisque la notion n'existait pas. Un retour
-- arrière est un `DROP TABLE` et ne fait perdre que du texte en attente.
--
-- ## Pourquoi une table, et pas un gabarit
--
-- Un gabarit est un MODÈLE, qu'on repose chez plusieurs clients. Un brouillon ne
-- vise qu'une maison et n'a de sens que tant qu'il n'est pas posé. Les ranger
-- ensemble aurait rempli la liste des gabarits de grilles nominatives.
--
-- ## Pourquoi `company_id` est la CLÉ
--
-- Une négociation se reprend, elle ne se collectionne pas. Deux brouillons
-- ouverts sur le même compte poseraient la question de savoir lequel fait foi,
-- à laquelle personne n'aurait de réponse. Enregistrer remplace.
--
-- ## Ce qu'il ne fait pas
--
-- Il ne tarife rien : aucune lecture de prix ne le regarde. Le supprimer ne
-- change aucune facture. Ce qui engage est la règle posée, dans `price_rules`.
CREATE TABLE "mercuriale_drafts" (
  "company_id" TEXT NOT NULL,
  "label"      TEXT NOT NULL,
  -- Nullables : on écrit la grille avant de la dater.
  "valid_from" TIMESTAMPTZ(3),
  "valid_to"   TIMESTAMPTZ(3),
  "lines"      JSONB NOT NULL,
  "updated_by" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  CONSTRAINT "mercuriale_drafts_pkey" PRIMARY KEY ("company_id")
);
