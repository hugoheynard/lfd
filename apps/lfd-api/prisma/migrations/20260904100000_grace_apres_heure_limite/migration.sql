-- **Le rattrapage après l'heure limite.**
--
-- Une heure limite était binaire : avant, ça passe ; après, c'est non. Le cas
-- réel ne l'est pas — un client appelle vingt minutes trop tard, et quelqu'un
-- décide. Sans cette colonne, cette décision n'a pas de borne : la vraie limite
-- devient l'humeur de qui décroche.
--
-- **Des minutes, pas une seconde heure.** `limite + grâce` suit automatiquement
-- chaque rang de l'échelle (point × jour). Une heure absolue aurait dû être
-- ressaisie sur chaque règle, et se serait retrouvée, un jour, avant sa propre
-- limite — un état que rien n'aurait refusé.
--
-- **Additif, et sans effet tant que personne n'y touche** : `0` par défaut sur
-- toutes les lignes existantes, ce qui referme la grâce sur la limite elle-même
-- et laisse le comportement d'hier à l'identique. Retour arrière :
-- `DROP COLUMN`, aucune donnée d'une autre colonne n'est lue ni réécrite.
ALTER TABLE "public"."order_cutoffs"
    ADD COLUMN "grace_minutes" INTEGER NOT NULL DEFAULT 0;
