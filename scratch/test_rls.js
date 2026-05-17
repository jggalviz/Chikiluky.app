import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function main() {
  const { data: before } = await supabase.from('negocios').select('config').eq('id', 'b2000000-0000-0000-0000-000000000001').single();
  console.log('Before config:', before?.config);

  const { data: updateRes, error: updateErr } = await supabase
    .from('negocios')
    .update({ config: { test: true } })
    .eq('id', 'b2000000-0000-0000-0000-000000000001');
  console.log('Update result:', updateRes, 'Error:', updateErr);

  const { data: after } = await supabase.from('negocios').select('config').eq('id', 'b2000000-0000-0000-0000-000000000001').single();
  console.log('After config:', after?.config);
}

main();
