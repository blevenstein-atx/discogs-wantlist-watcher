ALTER TABLE public.refresh_runs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz, ADD COLUMN IF NOT EXISTS retry_at timestamptz;
CREATE OR REPLACE FUNCTION public.acquire_wantlist_refresh()
RETURNS TABLE(run_id uuid, outcome text, retry_after timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE active_id uuid; blocked_until timestamptz; new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(83920147);
  UPDATE public.refresh_runs SET status = 'failed', completed_at = now(), error_count = error_count + 1 WHERE status = 'running' AND coalesce(lease_expires_at, started_at + interval '10 minutes') <= now();
  SELECT id INTO active_id FROM public.refresh_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1;
  IF active_id IS NOT NULL THEN RETURN QUERY SELECT active_id, 'busy'::text, NULL::timestamptz; RETURN; END IF;
  SELECT max(retry_at) INTO blocked_until FROM public.refresh_runs WHERE retry_at > now();
  IF blocked_until IS NOT NULL THEN RETURN QUERY SELECT NULL::uuid, 'cooldown'::text, blocked_until; RETURN; END IF;
  INSERT INTO public.refresh_runs(status, lease_expires_at) VALUES ('running', now() + interval '2 minutes') RETURNING id INTO new_id;
  RETURN QUERY SELECT new_id, 'acquired'::text, NULL::timestamptz;
END;
$$;
REVOKE ALL ON FUNCTION public.acquire_wantlist_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_wantlist_refresh() TO service_role;