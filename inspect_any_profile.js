import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bgavabzpnazpalfnatwp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYXZhYnpwbmF6cGFsZm5hdHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzcyNzksImV4cCI6MjA5NDUxMzI3OX0.FVeIlZ1D6oQSXLkaKx0lJsKn_4enZydBzB2ZuWNBNFE'
);

async function run() {
  console.log("Fetching first 5 profiles from perfiles table...");
  
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .limit(5);

  if (error) {
    console.error("ERROR SELECTING PROFILES:", error.message);
  } else {
    console.log("PROFILES RETRIEVED SUCCESSFULLY:", data.length);
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
