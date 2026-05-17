import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function main() {
  const { data, error } = await supabase.rpc('get_tables_list');
  if (error) {
    // If rpc doesn't exist, let's select from pg_tables via a query or check what tables we can read
    console.log('RPC error, trying raw select or common tables...');
    
    const tables = ['perfiles', 'perfiles_profesionales', 'expertos', 'negocios', 'servicios', 'reservas', 'citas', 'configuracion_sistema'];
    for (const t of tables) {
      const { data: d, error: e } = await supabase.from(t).select('*').limit(1);
      console.log(`Table ${t}:`, e ? `Error: ${e.message} (${e.code})` : 'Exists!');
    }
  } else {
    console.log('Tables:', data);
  }
}

main();
