async function run() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/asignaciones_profesor?select=id,materia_id,grupo_id,materias(nombre),grupos(nombre)`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
