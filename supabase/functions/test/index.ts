import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const t0 = performance.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { "x-region": "ap-southeast-1" } } }
  );

  const userId = "07ba3700-ea84-4f44-a5c9-37260128da23";

  const perQueryTimings: string[] = [];
  const errors: string[] = [];

  const tQueryStart = performance.now();

  for (let i = 0; i < 10; i++) {
    const tStart = performance.now();

    const { error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    const tEnd = performance.now();
    perQueryTimings.push((tEnd - tStart).toFixed(3));

    if (error) errors.push(error.message);
  }

  const tQueryEnd = performance.now();

  return new Response(
    JSON.stringify(
      {
        timings: {
          total_query_time_ms: (tQueryEnd - tQueryStart).toFixed(3),
          total_function_time_ms: (performance.now() - t0).toFixed(3),
          average_per_query_ms: ((tQueryEnd - tQueryStart) / 10).toFixed(3),
        },
        per_query_timings_ms: perQueryTimings,
        queries_count: 10,
        errors_count: errors.length,
        errors,
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
});
