CREATE TABLE public.refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  error_count integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.refresh_runs TO anon, authenticated;
GRANT ALL ON public.refresh_runs TO service_role;
ALTER TABLE public.refresh_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read runs" ON public.refresh_runs FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.wantlist_status (
  release_id bigint PRIMARY KEY,
  artist text,
  title text,
  format text,
  year integer,
  thumb_url text,
  num_for_sale integer NOT NULL DEFAULT 0,
  prev_num_for_sale integer,
  change_status text NOT NULL DEFAULT 'unchanged',
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wantlist_status TO anon, authenticated;
GRANT ALL ON public.wantlist_status TO service_role;
ALTER TABLE public.wantlist_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read wantlist" ON public.wantlist_status FOR SELECT TO anon, authenticated USING (true);