export type UserRole = "customer" | "host" | "admin";
export type EventStatus = "draft" | "scheduled" | "live" | "completed" | "cancelled";
export type SessionPhase = "lobby" | "welcome" | "reveal" | "brewing" | "tasting" | "trivia" | "recap" | "ended";
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
  | "end_session";
