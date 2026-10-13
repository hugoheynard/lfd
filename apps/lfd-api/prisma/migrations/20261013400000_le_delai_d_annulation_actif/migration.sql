-- Le délai d'annulation des particuliers devient ACTIF par défaut (décision de
-- Hugo du 2026-10-13, doc
-- `documentation/commandes/annulation/annulation-par-le-client.md`).
--
-- La colonne `open_to_b2c` garde son nom (une colonne ne se renomme pas sans
-- trois déploiements) mais change de sens : `true` = « un délai est imposé aux
-- particuliers ». Désactivé, seul l'arrêt du plan de production limite,
-- comme pour un pro. Il n'existe plus de « annulation fermée ».
--
-- 1. Le défaut de la colonne passe à `true`.
-- 2. La ligne `orders` posée FERMÉE par `20261013100000` passe à `true`,
--    SEULEMENT si personne ne l'a réglée à l'écran (`updated_at` nul) : un
--    choix fait par le staff n'est jamais écrasé.
--
-- ADDITIVE : aucune colonne ajoutée ni retirée. Retour arrière : remettre le
-- défaut à `false` ; la valeur de la ligne se règle à l'écran.

ALTER TABLE "public"."customer_cancellation_settings"
    ALTER COLUMN "open_to_b2c" SET DEFAULT true;

UPDATE "public"."customer_cancellation_settings"
SET "open_to_b2c" = true
WHERE "key" = 'orders' AND "updated_at" IS NULL;
