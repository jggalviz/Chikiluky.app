import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function main() {
  const { data: negocios, error: nErr } = await supabase.from('negocios').select('*');
  console.log('--- NEGOCIOS ---');
  if (nErr) console.error(nErr);
  else console.log(JSON.stringify(negocios, null, 2));

  const { data: perfiles, error: pErr } = await supabase.from('perfiles_profesionales').select('*');
  console.log('--- PERFILES PROFESIONALES ---');
  if (pErr) console.error(pErr);
  else console.log(JSON.stringify(perfiles, null, 2));
}

main();
