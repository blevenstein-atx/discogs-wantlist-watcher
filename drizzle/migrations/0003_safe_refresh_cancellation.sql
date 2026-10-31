ALTER TABLE public.refresh_runs ADD COLUMN cancel_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_wantlist_cancellation(p_run_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE run_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(83920147);
  SELECT status INTO run_status FROM public.refresh_runs WHERE id = p_run_id FOR UPDATE;
  IF run_status IS DISTINCT FROM 'running' THEN RETURN 'finished'; END IF;
  UPDATE public.refresh_runs SET cancel_requested_at = coalesce(cancel_requested_at, now()) WHERE id = p_run_id;
  RETURN 'requested';
END;
$$;
REVOKE ALL ON FUNCTION public.request_wantlist_cancellation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_wantlist_cancellation(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_wantlist_refresh(p_run_id uuid, p_rows jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE run public.refresh_runs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(83920147);
  SELECT * INTO run FROM public.refresh_runs WHERE id = p_run_id FOR UPDATE;
  IF run.status IS DISTINCT FROM 'running' OR run.lease_expires_at <= now() THEN RETURN 'inactive'; END IF;
  IF run.cancel_requested_at IS NOT NULL THEN
    UPDATE public.refresh_runs SET status = 'cancelled', completed_at = now(), lease_expires_at = now() WHERE id = p_run_id;
    RETURN 'cancelled';
  END IF;
  INSERT INTO public.wantlist_status (release_id, artist, title, format, year, thumb_url, num_for_sale, prev_num_for_sale, change_status, refreshed_at)
  SELECT release_id, artist, title, format, year, thumb_url, num_for_sale, prev_num_for_sale, change_status, refreshed_at
  FROM jsonb_populate_recordset(NULL::public.wantlist_status, p_rows)
  ON CONFLICT (release_id) DO UPDATE SET artist = EXCLUDED.artist, title = EXCLUDED.title, format = EXCLUDED.format, year = EXCLUDED.year, thumb_url = EXCLUDED.thumb_url, num_for_sale = EXCLUDED.num_for_sale, prev_num_for_sale = EXCLUDED.prev_num_for_sale, change_status = EXCLUDED.change_status, refreshed_at = EXCLUDED.refreshed_at;
  DELETE FROM public.wantlist_status WHERE release_id NOT IN (SELECT (value->>'release_id')::bigint FROM jsonb_array_elements(p_rows));
  UPDATE public.refresh_runs SET status = 'completed', completed_at = now(), retry_at = NULL, lease_expires_at = now() WHERE id = p_run_id;
  RETURN 'completed';
END;
$$;
REVOKE ALL ON FUNCTION public.commit_wantlist_refresh(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_wantlist_refresh(uuid, jsonb) TO service_role;