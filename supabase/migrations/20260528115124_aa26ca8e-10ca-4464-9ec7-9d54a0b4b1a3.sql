
-- Public bucket for vehicle photos & documents (frontend media UX contract).
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-media', 'vehicle-media', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone authenticated in the app can view/upload/manage vehicle media.
-- Files are organized under {vehicle_id}/{photos|docs}/{filename}.
CREATE POLICY "vehicle-media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-media');

CREATE POLICY "vehicle-media authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vehicle-media');

CREATE POLICY "vehicle-media authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vehicle-media');

CREATE POLICY "vehicle-media authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vehicle-media');
