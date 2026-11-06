# TODO — aucun appel réseau sortant dans une transaction

> 📋 **Noté le 2026-11-06**, à la revue des changements de S2 avec Hugo (cas 3,
> `documentation/editeur-de-contenu/plan-service-e-mails.md`, « Revue des
> changements avec Hugo »). Rien n'est relevé ni bâti.

## La règle

**Une transaction de base de données ne contient aucun appel réseau sortant.**
Un appel se fait _avant_ (lire, réserver avec une clé d'idempotence) ou
_après_ la validation (agir, par l'outbox) — jamais au milieu.

Pourquoi : un appel au milieu d'une transaction peut agir pour une écriture
qui sera annulée, partir deux fois quand la transaction expire après l'appel
(5 s par défaut), et tenir une des 15 connexions du pool pendant toute la
durée de l'appel. C'est le défaut que S1b et S2a ont retiré des e-mails.

Ce n'est pas un obstacle à un découpage futur en services : c'est la brique
de base d'une « saga » — chaque service fait sa transaction locale, publie par
l'outbox, et le suivant réagit ; un échec se compense, il ne s'annule pas en
arrière. Les transactions distribuées par le réseau (_two-phase commit_) sont
évitées partout pour les mêmes raisons.

## Ce qui est déjà tenu

Les e-mails : tout passe par le bloc `mail` (`lint:mail-through-block`) ;
`mail.send` n'enregistre qu'une demande ; `mail.sendAndAwaitReceipt` lève une
erreur dans une unité de travail.

## À faire

1. **Le relevé** : chaque appel sortant de `apps/lfd-api/src` — Stripe, Auth0,
   stockage (R2), planificateur de tournées, géocodage, tout `fetch` — et,
   pour chacun, s'il peut être appelé dans une unité de travail aujourd'hui.
   Ceux qui le sont : le même défaut que les e-mails, à corriger d'abord
   (Stripe et Auth0 en priorité : l'argent et les comptes).
2. **Le garde** : partagé depuis `platform/`, sur le modèle de celui de
   `sendAndAwaitReceipt` ; chaque adaptateur sortant l'appelle, et lève une
   erreur nommée si une transaction est ouverte.
3. **La porte** : tout fichier qui fait un appel sortant passe par le garde ou
   figure sur une liste admise et datée, avec sa raison.
