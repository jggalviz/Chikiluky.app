import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function main() {
  const { data: res, error: rErr } = await supabase.from('reservas').select('*').limit(1);
  console.log('Reservas:', res, rErr);

  const { data: cit, error: cErr } = await supabase.from('citas').select('*').limit(1);
  console.log('Citas:', cit, cErr);
}

main();
