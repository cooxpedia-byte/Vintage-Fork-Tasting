import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !secret) {
  console.error("Dashboard verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const checks = [
  {
    surface: "admin_dashboard",
    query: () => supabase.from("events").select(
      "id,title,starts_at,location_mode,capacity,status,phase,invite_code"
    ).limit(0)
  },
  {
    surface: "live_host_console_event",
    query: () => supabase.from("events").select(
      "id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,invite_code,starts_at,location_mode,capacity,host_user_id,backup_host_user_id"
    ).limit(0)
  },
  {
    surface: "live_host_console_flight",
    query: () => supabase.from("event_flight_items").select(
      "id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,tea:teas(name,origin,producer),trivia:trivia_questions(id,position,question,options,correct_index,explanation,answer_window_seconds)"
    ).limit(0)
  },
  {
    surface: "guest_live_state",
    query: () => supabase.from("events").select(
      "id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_started_at,timer_ends_at,trivia_opened_at,trivia_closes_at,starts_at,location_mode,video_call_url,venue_name,venue_address,completed_at"
    ).limit(0)
  },
  {
    surface: "guest_live_trivia",
    query: () => supabase.from("trivia_questions").select(
      "id,event_flight_item_id,position,question,options,correct_index,explanation,answer_window_seconds"
    ).limit(0)
  },
  {
    surface: "customer_dashboard",
    query: () => supabase.from("participants").select(`
      id,event_id,user_id,status,
      event:events!inner(id,title,starts_at,timezone,location_mode,status,invite_code),
      responses:tea_responses(id,rating,first_impression,personal_notes,descriptors,intensity,saved,completed_at,
        flight:event_flight_items(id,reveal_title,position,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,tea:teas(id,name,producer,origin,tea_type,default_steep_seconds)))
    `).limit(0)
  }
];

const results = await Promise.all(checks.map(async ({ surface, query }) => {
  const { error } = await query();
  return error ? { surface, code: error.code || "unknown" } : null;
}));
const failures = results.filter(Boolean);

if (failures.length > 0) {
  console.error(`Dashboard contract failed: ${failures.map(({ surface, code }) => `${surface} (${code})`).join(", ")}.`);
  process.exit(1);
}

console.log("Dashboard contract passed for admin, host, guest, and customer surfaces.");
