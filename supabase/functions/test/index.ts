// supabase/functions/test-latency/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const startTotal = performance.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const userId = "07ba3700-ea84-4f44-a5c9-37260128da23";

  const startQuery = performance.now();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();

  const endQuery = performance.now();
  const endTotal = performance.now();

  const timings = {
    query_time_ms: (endQuery - startQuery).toFixed(3),
    total_function_time_ms: (endTotal - startTotal).toFixed(3),
  };

  return new Response(
    JSON.stringify(
      {
        timings,
        data,
        error: error?.message ?? null,
      },
      null,
      2
    ),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }
  );
});
