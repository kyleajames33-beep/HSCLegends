-- Read-only structure metadata. No application rows, permissions, function bodies or writes.
-- Scope: public.game_sessions, public.game_players, public.game_answers.
WITH target AS (
 SELECT c.oid, n.nspname, c.relname
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
 AND c.relname IN ('game_sessions', 'game_players', 'game_answers')
 AND c.relkind IN ('r', 'p')
)
SELECT jsonb_build_object(
 'columns', (SELECT jsonb_agg(jsonb_build_object(
   'table', t.relname, 'ordinal', a.attnum, 'column', a.attname,
   'type', pg_catalog.format_type(a.atttypid,a.atttypmod),
   'not_null', a.attnotnull, 'default', pg_catalog.pg_get_expr(d.adbin,d.adrelid)
 ) ORDER BY t.relname,a.attnum)
 FROM target t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 WHERE a.attnum>0 AND NOT a.attisdropped),
 'constraints', (SELECT jsonb_agg(jsonb_build_object(
   'table',t.relname,'name',c.conname,'type',c.contype,
   'definition',pg_catalog.pg_get_constraintdef(c.oid,true),'validated',c.convalidated
 ) ORDER BY t.relname,c.conname)
 FROM target t JOIN pg_catalog.pg_constraint c ON c.conrelid=t.oid),
 'indexes', (SELECT jsonb_agg(jsonb_build_object(
   'table',t.relname,'name',ic.relname,
   'definition',pg_catalog.pg_get_indexdef(i.indexrelid),
   'valid',i.indisvalid,'ready',i.indisready
 ) ORDER BY t.relname,ic.relname)
 FROM target t JOIN pg_catalog.pg_index i ON i.indrelid=t.oid
 JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid),
 'triggers', (SELECT jsonb_agg(jsonb_build_object(
   'table',t.relname,'name',g.tgname,'enabled',g.tgenabled,
   'definition',pg_catalog.pg_get_triggerdef(g.oid,true)
 ) ORDER BY t.relname,g.tgname)
 FROM target t JOIN pg_catalog.pg_trigger g ON g.tgrelid=t.oid
 WHERE NOT g.tgisinternal)
) AS classroom_catalog;
