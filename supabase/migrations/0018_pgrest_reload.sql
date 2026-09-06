-- Force PostgREST to reload its schema cache after the 0017 temp function.
notify pgrst, 'reload schema';