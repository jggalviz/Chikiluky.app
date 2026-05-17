import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function checkUserProfile(id) {
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
  console.log(`Profile in perfiles ${id}:`, data, error ? error.message : '');
}

async function main() {
  await checkUserProfile('a1000000-0000-0000-0000-000000000001');
  await checkUserProfile('a1000000-0000-0000-0000-000000000002');
  await checkUserProfile('a1000000-0000-0000-0000-000000000003');
}

main();
