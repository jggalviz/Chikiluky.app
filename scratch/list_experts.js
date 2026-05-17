import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function main() {
  const { data: perfiles, error } = await supabase
    .from('perfiles')
    .select('*');
  if (error) console.error(error);
  else console.log(JSON.stringify(perfiles, null, 2));
}

main();
