-- Refuse rollback once any real chat timeline has been recorded.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM research.chat_notice) THEN
  RAISE EXCEPTION 'CHAT_TIMELINE_NOT_EMPTY: retain data; roll back application only';
 END IF;
END $$;
DROP TABLE research.chat_notice;
