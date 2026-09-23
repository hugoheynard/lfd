-- L'HISTORIQUE DES DÉPÔTS REFUSÉS
--
-- Le compte rendu d'un import en lot vivait en MÉMOIRE : l'écran gardait le nom
-- et la raison de chaque refus, et fermer l'onglet l'effaçait. Sur un lot de
-- cinquante fichiers, « qu'est-ce qui n'est pas entré hier » n'avait donc
-- aucune réponse.
--
-- Strictement ADDITIVE : une table neuve, aucune colonne touchée, aucune donnée
-- déplacée. Un retour arrière est un DROP TABLE, et il ne coûte que
-- l'historique accumulé depuis.
--
-- ⚠️ Ce n'est PAS le journal (`growth.activity_events`). Le journal raconte la
-- vie des images qui existent ; ces lignes racontent des TENTATIVES, dont le
-- sujet n'existe pas. Les verser au même flux donnerait un `subject_id` qui ne
-- désigne rien.
--
-- Plan : documentation/mediatheque/plan-les-six-de-la-mediatheque.md (lot 6)

CREATE TABLE "media"."media_upload_failure" (
  "id" TEXT NOT NULL,

  -- Le nom tel que le navigateur l'a envoyé. DONNÉE D'UTILISATEUR : plafonnée
  -- à 255, et jamais interpolée dans un message sans échappement.
  "file_name" VARCHAR(255) NOT NULL,

  -- La phrase française du refus, recopiée telle que l'écran l'a montrée. La
  -- reconstruire depuis le code ferait deux vérités qui divergeraient.
  "reason" VARCHAR(500) NOT NULL,
  "code" VARCHAR(120) NOT NULL,

  -- Ce qu'on a pu CONSTATER. `NULL` = pas mesurable — un refus pour type non
  -- supporté n'a, par construction, pas de type constaté.
  "bytes" INTEGER,
  "content_type" VARCHAR(120),

  -- `NULL` hors requête : un import déclenché par un script n'a pas d'acteur,
  -- et écrire « système » ferait croire à un compte.
  "actor_name" VARCHAR(200),

  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "media_upload_failure_pkey" PRIMARY KEY ("id")
);

-- Du plus RÉCENT au plus ancien : c'est l'ordre de TOUTES les lectures, parce
-- que « qu'est-ce qui n'est pas entré » veut dire « en dernier ».
CREATE INDEX "media_upload_failure_occurred_at_idx"
  ON "media"."media_upload_failure" ("occurred_at" DESC);
