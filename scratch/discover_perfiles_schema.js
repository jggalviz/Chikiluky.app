import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function testColumn(col) {
  const { data, error } = await supabase.from('perfiles').select(col).limit(1);
  if (error) {
    console.log(`Column '${col}':`, error.message);
    return false;
  } else {
    console.log(`Column '${col}': EXISTS!`);
    return true;
  }
}

async function testNegociosColumn(col) {
  const { data, error } = await supabase.from('negocios').select(col).limit(1);
  if (error) {
    console.log(`Negocios Column '${col}':`, error.message);
    return false;
  } else {
    console.log(`Negocios Column '${col}': EXISTS!`);
    return true;
  }
}

async function main() {
  console.log('--- Testing perfiles columns ---');
  await testColumn('id');
  await testColumn('full_name');
  await testColumn('avatar_url');
  await testColumn('descripcion');
  await testColumn('role');
  await testColumn('telefono');
  await testColumn('negocio_id');
  await testColumn('business_id');

  console.log('--- Testing negocios columns ---');
  await testNegociosColumn('owner_id');
  await testNegociosColumn('config');
}

main();
