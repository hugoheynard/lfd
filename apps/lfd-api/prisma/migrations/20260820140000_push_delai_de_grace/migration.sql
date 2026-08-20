-- Depuis quand un abonnement se fait REFUSER (403). Le 403 ne dit pas si c'est
-- l'abonnement qui est périmé ou notre paire VAPID qui est mauvaise : on note
-- la date, on laisse un délai de grâce, et on n'oublie que ce qui ne guérit pas.
ALTER TABLE "public"."staff_push_subscriptions" ADD COLUMN "failing_since" TIMESTAMP(3);
