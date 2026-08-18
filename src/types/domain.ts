export type UserRole = "customer" | "host" | "admin";
export type EventStatus = "draft" | "scheduled" | "live" | "completed" | "cancelled";
export type SessionPhase = "lobby" | "welcome" | "reveal" | "brewing" | "tasting" | "trivia" | "recap" | "ended";
export type ConductorStage = "arrival" | "prepare" | "brew" | "aroma" | "first_sip" | "explore" | "discuss" | "reveal" | "debrief" | "close_tea" | "transition";
export type ParticipantStatus = "registered" | "waiting" | "admitted" | "active" | "left" | "removed";

export interface Tea {
  id: string;
  name: string;
  producer: string | null;
  origin: string | null;
  tea_type: string | null;
  default_character: string | null;
  default_brewing: string | null;
  default_steep_seconds: number | null;
  image_path: string | null;
  retired_at: string | null;
}

export interface FlightItem {
  id: string;
  event_id: string;
  tea_id: string;
  position: number;
  reveal_title: string;
  reveal_description: string;
  brewing_instructions: string;
  steep_seconds: number;
  temperature_c: number | null;
  leaf_grams: number | null;
  water_ml: number | null;
  tea?: Tea;
}

export interface TriviaQuestion {
  id: string;
  event_flight_item_id: string;
  position: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  answer_window_seconds: number;
}

export interface TastingEvent {
  id: string;
  title: string;
  slug: string;
  invite_code: string | null;
  status: EventStatus;
  location_mode: "remote" | "in_person";
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  capacity: number;
  venue_name: string | null;
  venue_address: string | null;
  video_call_url: string | null;
  host_user_id: string;
  backup_host_user_id: string | null;
  phase: SessionPhase;
  sequence_number: number;
  current_flight_item_id: string | null;
  current_trivia_question_id: string | null;
  tasting_opened_flight_item_id: string | null;
  reveal_at: string | null;
  timer_started_at: string | null;
  timer_ends_at: string | null;
  trivia_opened_at: string | null;
  trivia_closes_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  conductor_stage: ConductorStage;
  conductor_stage_started_at: string | null;
  conductor_stage_duration_seconds: number | null;
  conductor_paused_at: string | null;
  conductor_remaining_seconds: number | null;
  conductor_sequence_version: number;
  conductor_id: string | null;
  current_brew_id: string | null;
  current_breakout_session_id:string|null;
  flight_items?: FlightItem[];
}

export interface Participant {
  id: string;
  event_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  marketing_consent: boolean | null;
  status: ParticipantStatus;
  joined_at: string | null;
  last_seen_at: string | null;
  recap_claimed_at: string | null;
}

export interface TeaResponse {
  id: string;
  participant_id: string;
  event_flight_item_id: string;
  first_impression: string | null;
  descriptors: string[];
  intensity: "subtle" | "clear" | "dominant" | null;
  rating: number | null;
  personal_notes: string | null;
  saved: boolean;
  completed_at: string | null;
}

export type EventCommand =
  | "open_session"
  | "reveal_tea"
  | "start_timer"
  | "open_tasting"
  | "open_trivia"
  | "close_trivia"
  | "return_to_tasting"
  | "next_tea"
  | "start_recap"
  | "advance_stage"
  | "start_brew"
  | "restart_brew"
  | "start_next_infusion"
  | "end_brew_early"
  | "pause_stage"
  | "resume_stage"
  | "extend_stage"
  | "skip_stage"
  | "go_back_stage"
  | "jump_stage"
  | "launch_breakouts"
  | "extend_breakouts"
  | "end_breakouts"
  | "open_discovery_card"
  | "compare_discovery_card"
  | "surface_discovery_curiosity"
  | "close_discovery_cards"
  | "invite_discovery_spokesperson"
  | "complete_discovery_share"
  | "reveal_group_aroma"
  | "reveal_group_taste"
  | "combine_group_reveal"
  | "show_group_timeline"
  | "set_group_timeline"
  | "highlight_group_flavor"
  | "clear_group_flavor"
  | "show_group_producer_notes"
  | "hide_group_producer_notes"
  | "freeze_group_fingerprint"
  | "return_group_discussion"
  | "open_cheers"
  | "resolve_cheers"
  | "cancel_cheers"
  | "set_reward_mode"
  | "grant_reward_completion"
  | "set_conversation_prompts_enabled"
  | "send_conversation_prompt"
  | "configure_living_map"
  | "start_living_map"
  | "pause_living_map"
  | "resume_living_map"
  | "freeze_living_map"
  | "start_living_map_replay"
  | "pause_living_map_replay"
  | "resume_living_map_replay"
  | "seek_living_map_replay"
  | "commit_living_map_fingerprint"
  | "reopen_living_map"
  | "end_session";
