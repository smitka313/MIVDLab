-- Private storage for optional student photos.
-- Objects live at `<teacher uuid>/<student uuid>.<ext>`; only the owner can
-- read or write their folder. The bucket is NOT public, so photos are only
-- reachable through short-lived signed URLs.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('student-photos', 'student-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false;

    execute $p$
      create policy "student photos: owner read" on storage.objects for select to authenticated
      using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "student photos: owner insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "student photos: owner update" on storage.objects for update to authenticated
      using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "student photos: owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end;
$$;
