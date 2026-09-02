-- Les ALLERGÈNES figés sur la ligne de commande.
--
-- C'était la seule chose que la ligne ne figeait pas. Elle fige le prix
-- unitaire, le taux, le nom, et toute la trace de résolution — d'où venait ce
-- montant, quel palier, quel plancher, quel engagement. Pas les allergènes.
--
-- Conséquence, vérifiée avant d'écrire cette colonne : un client commande une
-- brioche déclarée sans fruits à coque, une livraison suivante corrige la
-- déclaration, et plus rien ne dit sous quelle déclaration la commande a été
-- passée. Sur réclamation, six mois plus tard, on ne peut pas répondre.
--
-- Ça ne protège personne — la brioche est ce qu'elle est, et la commande est
-- partie en production. Ça rend la commande INTERPRÉTABLE APRÈS COUP, ce que
-- rien ne permettait.
--
-- ── Additive, et sans reprise possible ──────────────────────────────────────
--
-- `NULL` sur toutes les lignes existantes, et aucun backfill n'est possible :
-- la déclaration d'alors n'existe nulle part. C'est une IGNORANCE, et elle doit
-- se lire comme telle. Écrire `[]` pour « faire propre » affirmerait « aucun
-- allergène » sur les seules commandes qu'on ne peut plus vérifier — exactement
-- l'erreur que `pricing_steps` refuse déjà, avec ses propres mots.
--
-- Le contenu porte lui-même trois états, et le second niveau compte autant :
-- `{"codes": null}` = aucune fiche réglementaire, `{"codes": []}` = fiche
-- déclarée SANS allergène, une liste = les codes.

ALTER TABLE "public"."order_lines"
    ADD COLUMN "allergens" JSONB;
