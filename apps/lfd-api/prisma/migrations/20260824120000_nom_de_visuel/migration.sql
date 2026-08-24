-- Un visuel reçoit un NOM — l'étiquette qu'on lui donne dans la bibliothèque.
--
-- Il en manquait un, et le texte alternatif faisait office : la vignette
-- affichait « Tarte entière, vue de face » là où l'on cherchait « quel fichier
-- est-ce ». Ce sont deux informations différentes, avec deux publics. Le texte
-- alternatif décrit l'image à qui ne la voit pas — il est traduit, il est long,
-- il change avec la langue. Le nom identifie le fichier pour l'équipe qui gère
-- le catalogue — il est court, il ne se traduit pas, et il sert à retrouver.
--
-- Non nullable avec un défaut vide, et non pas nullable : « pas encore nommé »
-- et « nommé par une chaîne vide » sont la même chose ici, et deux façons de
-- l'écrire feraient deux chemins à tester pour rien. Les visuels existants
-- partent donc sans nom, ce qui est exact — personne ne leur en a donné.
ALTER TABLE "pim"."media_asset"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
