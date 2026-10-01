-- Synthetic, schema-only PostgreSQL 17 fixture. Never run in an existing database.
DO $$ BEGIN
 IF current_setting('server_version_num')::int/10000<>17
 OR current_database()<>'template1'
 OR coalesce(current_setting('vf.synthetic_fixture_mode',true),'')<>'pglite-in-memory'
 OR version() NOT LIKE '%compiled by emcc (Emscripten%'
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 THEN RAISE EXCEPTION 'fixture_requires_empty_disposable_postgres17_database'; END IF;
END $$;
SET check_function_bodies=off;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '10000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat('aa',n),'hex') $$;
CREATE TYPE public.event_status AS ENUM (
    'draft',
    'scheduled',
    'live',
    'completed',
    'cancelled'
);
CREATE TYPE public.intensity_level AS ENUM (
    'subtle',
    'clear',
    'dominant'
);
CREATE TYPE public.location_mode AS ENUM (
    'remote',
    'in_person'
);
CREATE TYPE public.participant_status AS ENUM (
    'registered',
    'waiting',
    'admitted',
    'active',
    'left',
    'removed'
);
CREATE TYPE public.session_phase AS ENUM (
    'lobby',
    'welcome',
    'reveal',
    'brewing',
    'tasting',
    'trivia',
    'recap',
    'ended'
);
CREATE TYPE public.user_role AS ENUM (
    'customer',
    'host',
    'admin'
);
CREATE TABLE public.discovery_identity_definitions (
    id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    emblem text NOT NULL,
    criteria_version integer NOT NULL,
    criteria jsonb NOT NULL,
    source_metrics_version text NOT NULL,
    sort_order integer NOT NULL,
    surprise boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_identity_definitions_check CHECK (((retired_at IS NULL) = active)),
    CONSTRAINT discovery_identity_definitions_criteria_check CHECK ((jsonb_typeof(criteria) = 'object'::text)),
    CONSTRAINT discovery_identity_definitions_criteria_version_check CHECK ((criteria_version > 0)),
    CONSTRAINT discovery_identity_definitions_description_check CHECK (((char_length(TRIM(BOTH FROM description)) >= 10) AND (char_length(TRIM(BOTH FROM description)) <= 240))),
    CONSTRAINT discovery_identity_definitions_emblem_check CHECK ((emblem = ANY (ARRAY['compass'::text, 'flower'::text, 'leaf'::text, 'garden'::text, 'moon'::text, 'map'::text, 'story'::text, 'mountain'::text]))),
    CONSTRAINT discovery_identity_definitions_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 3) AND (char_length(TRIM(BOTH FROM name)) <= 80))),
    CONSTRAINT discovery_identity_definitions_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT discovery_identity_definitions_sort_order_check CHECK ((sort_order > 0)),
    CONSTRAINT discovery_identity_definitions_source_metrics_version_check CHECK (((char_length(source_metrics_version) >= 3) AND (char_length(source_metrics_version) <= 40)))
);
CREATE TABLE public.discovery_identity_recalculations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_event_id uuid,
    source_metrics_version text NOT NULL,
    idempotency_key text NOT NULL,
    metrics jsonb NOT NULL,
    newly_earned_identity_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    recalculated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_identity_recalculations_metrics_check CHECK ((jsonb_typeof(metrics) = 'object'::text))
);
CREATE TABLE public.event_breakout_members (
    session_id uuid NOT NULL,
    breakout_room_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    status text DEFAULT 'assigned'::text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    joined_at timestamp with time zone,
    returned_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_breakout_members_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'joining'::text, 'connected'::text, 'left'::text, 'returned'::text, 'failed'::text, 'stayed_main'::text])))
);
CREATE TABLE public.event_breakout_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    room_number integer NOT NULL,
    prompt text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    snapshot text,
    snapshot_submitted_by uuid,
    snapshot_submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_breakout_rooms_prompt_check CHECK (((char_length(prompt) >= 1) AND (char_length(prompt) <= 240))),
    CONSTRAINT event_breakout_rooms_room_number_check CHECK (((room_number >= 1) AND (room_number <= 200))),
    CONSTRAINT event_breakout_rooms_snapshot_check CHECK (((snapshot IS NULL) OR (char_length(snapshot) <= 500))),
    CONSTRAINT event_breakout_rooms_status_check CHECK ((status = ANY (ARRAY['open'::text, 'returning'::text, 'closed'::text])))
);
CREATE TABLE public.event_breakout_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    origin_stage text NOT NULL,
    status text DEFAULT 'preparing'::text NOT NULL,
    room_size integer DEFAULT 3 NOT NULL,
    assignment_mode text DEFAULT 'shuffle'::text NOT NULL,
    prompt text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    host_id uuid NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_breakout_sessions_assignment_mode_check CHECK ((assignment_mode = ANY (ARRAY['shuffle'::text, 'remix'::text]))),
    CONSTRAINT event_breakout_sessions_check CHECK ((ends_at > starts_at)),
    CONSTRAINT event_breakout_sessions_prompt_check CHECK (((char_length(prompt) >= 1) AND (char_length(prompt) <= 240))),
    CONSTRAINT event_breakout_sessions_room_size_check CHECK (((room_size >= 2) AND (room_size <= 4))),
    CONSTRAINT event_breakout_sessions_status_check CHECK ((status = ANY (ARRAY['preparing'::text, 'active'::text, 'returning'::text, 'complete'::text, 'cancelled'::text])))
);
CREATE TABLE public.event_brews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    infusion_number integer DEFAULT 1 NOT NULL,
    started_at timestamp with time zone NOT NULL,
    duration_ms bigint NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    paused_at timestamp with time zone,
    accumulated_pause_ms bigint DEFAULT 0 NOT NULL,
    host_id uuid NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_brews_accumulated_pause_ms_check CHECK (((accumulated_pause_ms >= 0) AND (accumulated_pause_ms <= 86400000))),
    CONSTRAINT event_brews_duration_ms_check CHECK (((duration_ms >= 1000) AND (duration_ms <= 7200000))),
    CONSTRAINT event_brews_infusion_number_check CHECK (((infusion_number >= 1) AND (infusion_number <= 20))),
    CONSTRAINT event_brews_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'running'::text, 'paused'::text, 'complete'::text, 'cancelled'::text])))
);
CREATE TABLE public.event_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    participant_id uuid,
    author_user_id uuid,
    sender_key text NOT NULL,
    author_kind text NOT NULL,
    author_display_name text NOT NULL,
    message_kind text DEFAULT 'chat'::text NOT NULL,
    body text NOT NULL,
    event_flight_item_id uuid,
    parent_message_id uuid,
    ask_host boolean DEFAULT false NOT NULL,
    answered_at timestamp with time zone,
    answered_by uuid,
    pinned_at timestamp with time zone,
    pinned_by uuid,
    spotlighted_at timestamp with time zone,
    spotlighted_by uuid,
    spotlight_anonymous boolean DEFAULT false NOT NULL,
    spotlight_duration_seconds integer DEFAULT 8 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    breakout_room_id uuid,
    CONSTRAINT event_chat_messages_author_display_name_check CHECK (((char_length(author_display_name) >= 1) AND (char_length(author_display_name) <= 80))),
    CONSTRAINT event_chat_messages_author_kind_check CHECK ((author_kind = ANY (ARRAY['host'::text, 'guest'::text]))),
    CONSTRAINT event_chat_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 600))),
    CONSTRAINT event_chat_messages_check CHECK ((((author_kind = 'guest'::text) AND (participant_id IS NOT NULL)) OR (author_kind = 'host'::text))),
    CONSTRAINT event_chat_messages_delete_reason_check CHECK (((delete_reason IS NULL) OR (char_length(delete_reason) <= 240))),
    CONSTRAINT event_chat_messages_message_kind_check CHECK ((message_kind = ANY (ARRAY['chat'::text, 'broadcast'::text]))),
    CONSTRAINT event_chat_messages_sender_key_check CHECK (((char_length(sender_key) >= 3) AND (char_length(sender_key) <= 96))),
    CONSTRAINT event_chat_messages_spotlight_duration_seconds_check CHECK (((spotlight_duration_seconds >= 6) AND (spotlight_duration_seconds <= 10)))
);
CREATE TABLE public.event_cheers_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid,
    context text NOT NULL,
    invitation text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    closes_at timestamp with time zone NOT NULL,
    resolve_at timestamp with time zone NOT NULL,
    window_seconds integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    sound_enabled boolean DEFAULT true NOT NULL,
    triggered_by uuid NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_cheers_sessions_check CHECK (((closes_at > opened_at) AND (resolve_at >= closes_at))),
    CONSTRAINT event_cheers_sessions_context_check CHECK ((context = ANY (ARRAY['first_sip'::text, 'welcome_back'::text, 'final'::text, 'spontaneous'::text]))),
    CONSTRAINT event_cheers_sessions_invitation_check CHECK (((char_length(invitation) >= 1) AND (char_length(invitation) <= 120))),
    CONSTRAINT event_cheers_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolving'::text, 'complete'::text, 'cancelled'::text]))),
    CONSTRAINT event_cheers_sessions_window_seconds_check CHECK ((window_seconds = ANY (ARRAY[5, 8, 10])))
);
CREATE TABLE public.event_conversation_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    breakout_room_id uuid,
    library_prompt_id uuid NOT NULL,
    audience text NOT NULL,
    source text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    requested_by_participant_id uuid,
    published_by_user_id uuid,
    displayed_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    dismissed_by_participant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_conversation_prompts_audience_check CHECK ((audience = ANY (ARRAY['main'::text, 'breakout'::text]))),
    CONSTRAINT event_conversation_prompts_check CHECK ((((audience = 'main'::text) AND (breakout_room_id IS NULL)) OR ((audience = 'breakout'::text) AND (breakout_room_id IS NOT NULL)))),
    CONSTRAINT event_conversation_prompts_check1 CHECK ((((status = 'active'::text) AND (dismissed_at IS NULL)) OR (status <> 'active'::text))),
    CONSTRAINT event_conversation_prompts_source_check CHECK ((source = ANY (ARRAY['host'::text, 'room_initial'::text, 'room_another'::text]))),
    CONSTRAINT event_conversation_prompts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'dismissed'::text, 'replaced'::text, 'expired'::text])))
);
CREATE TABLE public.event_discovery_presentations (
    breakout_session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    open_card_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    surfaced_curiosity_card_id uuid,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_discovery_presentations_open_card_ids_check CHECK ((cardinality(open_card_ids) <= 2))
);
CREATE TABLE public.event_flight_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    tea_id uuid NOT NULL,
    "position" integer NOT NULL,
    reveal_title text NOT NULL,
    reveal_description text DEFAULT ''::text NOT NULL,
    brewing_instructions text DEFAULT ''::text NOT NULL,
    steep_seconds integer NOT NULL,
    temperature_c numeric(5,2),
    leaf_grams numeric(6,2),
    water_ml integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_flight_items_position_check CHECK (("position" > 0)),
    CONSTRAINT event_flight_items_steep_seconds_check CHECK (((steep_seconds >= 1) AND (steep_seconds <= 3600)))
);
CREATE TABLE public.event_group_reveals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    reveal_state text DEFAULT 'hidden'::text NOT NULL,
    revealed_at timestamp with time zone,
    highlighted_flavor text,
    timeline_index integer,
    producer_notes_visible boolean DEFAULT false NOT NULL,
    room_card_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    aroma_aggregate jsonb,
    taste_aggregate jsonb,
    timeline_events jsonb DEFAULT '[]'::jsonb NOT NULL,
    post_reveal_entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    fingerprint jsonb,
    fingerprint_version integer DEFAULT 0 NOT NULL,
    frozen_at timestamp with time zone,
    host_annotations jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_group_reveals_fingerprint_version_check CHECK ((fingerprint_version >= 0)),
    CONSTRAINT event_group_reveals_highlighted_flavor_check CHECK (((highlighted_flavor IS NULL) OR (char_length(highlighted_flavor) <= 100))),
    CONSTRAINT event_group_reveals_reveal_state_check CHECK ((reveal_state = ANY (ARRAY['hidden'::text, 'aroma'::text, 'taste'::text, 'combined'::text, 'timeline'::text, 'fingerprint'::text]))),
    CONSTRAINT event_group_reveals_timeline_index_check CHECK (((timeline_index IS NULL) OR (timeline_index >= 0)))
);
CREATE TABLE public.event_live_reward_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    participant_id uuid,
    user_id uuid NOT NULL,
    reward_type text NOT NULL,
    amount integer NOT NULL,
    rule_version text NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    canonical_entry_id uuid,
    attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error_code text,
    awarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_live_reward_awards_amount_check CHECK (((amount >= 1) AND (amount <= 1000))),
    CONSTRAINT event_live_reward_awards_attempts_check CHECK (((attempts >= 0) AND (attempts <= 100))),
    CONSTRAINT event_live_reward_awards_idempotency_key_check CHECK (((char_length(idempotency_key) >= 8) AND (char_length(idempotency_key) <= 240))),
    CONSTRAINT event_live_reward_awards_reward_type_check CHECK ((reward_type = 'event_complete'::text)),
    CONSTRAINT event_live_reward_awards_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'awarded'::text, 'retry'::text])))
);
CREATE TABLE public.event_live_reward_completion_overrides (
    event_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    granted_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.event_live_reward_settings (
    event_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    reward_mode_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.event_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    participant_id uuid,
    author_user_id uuid,
    sender_key text NOT NULL,
    reaction_type text NOT NULL,
    event_flight_item_id uuid,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    breakout_room_id uuid,
    CONSTRAINT event_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['tea_cup'::text, 'leaf'::text, 'flower'::text, 'honey_drop'::text, 'spark'::text, 'thinking'::text, 'same'::text, 'different'::text, 'question'::text]))),
    CONSTRAINT event_reactions_sender_key_check CHECK (((char_length(sender_key) >= 3) AND (char_length(sender_key) <= 96)))
);
CREATE TABLE public.event_stage_signals (
    event_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    stage text NOT NULL,
    signal text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_stage_signals_signal_check CHECK ((signal = ANY (ARRAY['ready'::text, 'poured'::text, 'pouring'::text, 'decanted'::text]))),
    CONSTRAINT event_stage_signals_stage_check CHECK ((stage = ANY (ARRAY['prepare'::text, 'brew'::text])))
);
CREATE TABLE public.event_state_log (
    id bigint NOT NULL,
    event_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    command text NOT NULL,
    phase public.session_phase NOT NULL,
    actor_user_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    invite_code text,
    status public.event_status DEFAULT 'draft'::public.event_status NOT NULL,
    location_mode public.location_mode DEFAULT 'remote'::public.location_mode NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    timezone text DEFAULT 'America/Edmonton'::text NOT NULL,
    capacity integer DEFAULT 12 NOT NULL,
    venue_name text,
    venue_address text,
    video_call_url text,
    owner_user_id uuid NOT NULL,
    host_user_id uuid NOT NULL,
    backup_host_user_id uuid,
    phase public.session_phase DEFAULT 'lobby'::public.session_phase NOT NULL,
    sequence_number bigint DEFAULT 0 NOT NULL,
    current_flight_item_id uuid,
    timer_started_at timestamp with time zone,
    timer_ends_at timestamp with time zone,
    trivia_opened_at timestamp with time zone,
    trivia_closes_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tasting_opened_flight_item_id uuid,
    reveal_at timestamp with time zone,
    current_trivia_question_id uuid,
    conductor_stage text DEFAULT 'arrival'::text NOT NULL,
    conductor_stage_started_at timestamp with time zone DEFAULT now() NOT NULL,
    conductor_stage_duration_seconds integer,
    conductor_paused_at timestamp with time zone,
    conductor_remaining_seconds integer,
    conductor_sequence_version integer DEFAULT 1 NOT NULL,
    conductor_id uuid,
    last_conductor_command_id uuid,
    current_brew_id uuid,
    current_breakout_session_id uuid,
    conversation_prompts_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT different_backup CHECK (((backup_host_user_id IS NULL) OR (backup_host_user_id <> host_user_id))),
    CONSTRAINT events_capacity_check CHECK (((capacity >= 1) AND (capacity <= 100))),
    CONSTRAINT events_conductor_duration_check CHECK (((conductor_stage_duration_seconds IS NULL) OR ((conductor_stage_duration_seconds >= 1) AND (conductor_stage_duration_seconds <= 7200)))),
    CONSTRAINT events_conductor_remaining_check CHECK (((conductor_remaining_seconds IS NULL) OR ((conductor_remaining_seconds >= 0) AND (conductor_remaining_seconds <= 7200)))),
    CONSTRAINT events_conductor_stage_check CHECK ((conductor_stage = ANY (ARRAY['arrival'::text, 'prepare'::text, 'brew'::text, 'aroma'::text, 'first_sip'::text, 'explore'::text, 'discuss'::text, 'reveal'::text, 'debrief'::text, 'close_tea'::text, 'transition'::text]))),
    CONSTRAINT location_details CHECK (((location_mode = 'remote'::public.location_mode) OR ((location_mode = 'in_person'::public.location_mode) AND (venue_name IS NOT NULL) AND (venue_address IS NOT NULL)) OR (status = 'draft'::public.event_status)))
);
CREATE TABLE public.flavor_descriptors (
    id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT flavor_descriptors_category_check CHECK (((char_length(TRIM(BOTH FROM category)) >= 1) AND (char_length(TRIM(BOTH FROM category)) <= 80))),
    CONSTRAINT flavor_descriptors_label_check CHECK (((char_length(TRIM(BOTH FROM label)) >= 1) AND (char_length(TRIM(BOTH FROM label)) <= 80))),
    CONSTRAINT flavor_descriptors_position_check CHECK (("position" > 0)),
    CONSTRAINT flavor_descriptors_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))
);
CREATE TABLE public.host_control_leases (
    event_id uuid NOT NULL,
    holder_user_id uuid NOT NULL,
    lease_token uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    heartbeat_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.live_tasting_reward_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_version text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    event_completion_leaves integer NOT NULL,
    max_leaves_per_participant_event integer NOT NULL,
    minimum_presence_seconds integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_tasting_reward_policies_check CHECK ((event_completion_leaves <= max_leaves_per_participant_event)),
    CONSTRAINT live_tasting_reward_policies_event_completion_leaves_check CHECK (((event_completion_leaves >= 1) AND (event_completion_leaves <= 1000))),
    CONSTRAINT live_tasting_reward_policies_max_leaves_per_participant_e_check CHECK (((max_leaves_per_participant_event >= 1) AND (max_leaves_per_participant_event <= 1000))),
    CONSTRAINT live_tasting_reward_policies_minimum_presence_seconds_check CHECK (((minimum_presence_seconds >= 0) AND (minimum_presence_seconds <= 14400))),
    CONSTRAINT live_tasting_reward_policies_rule_version_check CHECK (((char_length(rule_version) >= 3) AND (char_length(rule_version) <= 60)))
);
CREATE TABLE public.living_tasting_map_fingerprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    final_snapshot jsonb NOT NULL,
    replay_manifest jsonb NOT NULL,
    generated_patterns jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    committed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT living_tasting_map_fingerprints_version_check CHECK ((version > 0))
);
CREATE TABLE public.living_tasting_map_moderation_actions (
    id bigint NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    flavor_key text NOT NULL,
    action text NOT NULL,
    reason text,
    actor_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT living_tasting_map_moderation_actions_action_check CHECK ((action = ANY (ARRAY['hide'::text, 'restore'::text]))),
    CONSTRAINT living_tasting_map_moderation_actions_flavor_key_check CHECK (((char_length(flavor_key) >= 1) AND (char_length(flavor_key) <= 80))),
    CONSTRAINT living_tasting_map_moderation_actions_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 240)))
);
CREATE TABLE public.living_tasting_map_observation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    layer text NOT NULL,
    flavor_key text NOT NULL,
    flavor_label text NOT NULL,
    family text NOT NULL,
    is_custom boolean DEFAULT false NOT NULL,
    intensity integer NOT NULL,
    action text NOT NULL,
    elapsed_ms integer NOT NULL,
    client_sequence integer NOT NULL,
    client_id uuid NOT NULL,
    server_time timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT living_tasting_map_observation_events_action_check CHECK ((action = ANY (ARRAY['add'::text, 'update'::text, 'remove'::text]))),
    CONSTRAINT living_tasting_map_observation_events_client_sequence_check CHECK ((client_sequence >= 0)),
    CONSTRAINT living_tasting_map_observation_events_elapsed_ms_check CHECK (((elapsed_ms >= 0) AND (elapsed_ms <= 1800000))),
    CONSTRAINT living_tasting_map_observation_events_family_check CHECK ((family = ANY (ARRAY['floral'::text, 'fruit'::text, 'sweet'::text, 'roasted'::text, 'earthy'::text, 'mineral'::text, 'vegetal'::text, 'spice'::text, 'nutty'::text, 'savoury'::text]))),
    CONSTRAINT living_tasting_map_observation_events_flavor_key_check CHECK (((char_length(flavor_key) >= 1) AND (char_length(flavor_key) <= 80))),
    CONSTRAINT living_tasting_map_observation_events_flavor_label_check CHECK (((char_length(flavor_label) >= 1) AND (char_length(flavor_label) <= 80))),
    CONSTRAINT living_tasting_map_observation_events_intensity_check CHECK (((intensity >= 0) AND (intensity <= 100))),
    CONSTRAINT living_tasting_map_observation_events_layer_check CHECK ((layer = ANY (ARRAY['aroma'::text, 'taste'::text])))
);
CREATE TABLE public.living_tasting_map_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    duration_seconds integer DEFAULT 720 NOT NULL,
    visibility_mode text DEFAULT 'quiet_start'::text NOT NULL,
    custom_notes_enabled boolean DEFAULT true NOT NULL,
    started_at timestamp with time zone,
    paused_at timestamp with time zone,
    accumulated_pause_ms bigint DEFAULT 0 NOT NULL,
    frozen_at timestamp with time zone,
    replay_started_at timestamp with time zone,
    replay_paused_at timestamp with time zone,
    replay_position_ms integer DEFAULT 0 NOT NULL,
    replay_duration_seconds integer DEFAULT 40 NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT living_tasting_map_sessions_accumulated_pause_ms_check CHECK ((accumulated_pause_ms >= 0)),
    CONSTRAINT living_tasting_map_sessions_duration_seconds_check CHECK (((duration_seconds >= 60) AND (duration_seconds <= 1800))),
    CONSTRAINT living_tasting_map_sessions_replay_duration_seconds_check CHECK (((replay_duration_seconds >= 20) AND (replay_duration_seconds <= 120))),
    CONSTRAINT living_tasting_map_sessions_replay_position_ms_check CHECK ((replay_position_ms >= 0)),
    CONSTRAINT living_tasting_map_sessions_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'live'::text, 'paused'::text, 'frozen'::text, 'replaying'::text, 'committed'::text]))),
    CONSTRAINT living_tasting_map_sessions_visibility_mode_check CHECK ((visibility_mode = ANY (ARRAY['quiet_start'::text, 'shared_live'::text])))
);
CREATE TABLE public.living_tasting_map_snapshots (
    id bigint NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    elapsed_ms integer NOT NULL,
    aggregate_payload jsonb NOT NULL,
    source_event_count integer DEFAULT 0 NOT NULL,
    is_prompt_marker boolean DEFAULT false NOT NULL,
    projector_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT living_tasting_map_snapshots_elapsed_ms_check CHECK (((elapsed_ms >= 0) AND (elapsed_ms <= 1800000))),
    CONSTRAINT living_tasting_map_snapshots_source_event_count_check CHECK ((source_event_count >= 0))
);
CREATE TABLE public.merchant_card_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    tea_identity_key text NOT NULL,
    source_card_id uuid NOT NULL,
    canonical_tea_id uuid,
    product_id text,
    tea_name text NOT NULL,
    tea_category text DEFAULT 'Tea'::text NOT NULL,
    origin text DEFAULT ''::text NOT NULL,
    producer text DEFAULT ''::text NOT NULL,
    card_tier text NOT NULL,
    tasting_count integer NOT NULL,
    listing_eligible boolean DEFAULT false NOT NULL,
    live_tasting_verified boolean DEFAULT false NOT NULL,
    pricing_source text NOT NULL,
    price_per_kilo_cents integer,
    base_leaf_price integer NOT NULL,
    current_leaf_price integer NOT NULL,
    rarity text DEFAULT 'core'::text NOT NULL,
    preview jsonb DEFAULT '{}'::jsonb NOT NULL,
    card_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_card_progress_base_leaf_price_check CHECK ((base_leaf_price > 0)),
    CONSTRAINT merchant_card_progress_card_tier_check CHECK ((card_tier = ANY (ARRAY['standard'::text, 'polychrome'::text, 'shielded'::text]))),
    CONSTRAINT merchant_card_progress_check CHECK (((NOT listing_eligible) OR (tasting_count >= 2))),
    CONSTRAINT merchant_card_progress_check1 CHECK (((card_tier <> 'shielded'::text) OR live_tasting_verified)),
    CONSTRAINT merchant_card_progress_check2 CHECK ((current_leaf_price = (base_leaf_price *
CASE
    WHEN live_tasting_verified THEN 2
    ELSE 1
END))),
    CONSTRAINT merchant_card_progress_current_leaf_price_check CHECK ((current_leaf_price > 0)),
    CONSTRAINT merchant_card_progress_price_per_kilo_cents_check CHECK (((price_per_kilo_cents IS NULL) OR (price_per_kilo_cents > 0))),
    CONSTRAINT merchant_card_progress_pricing_source_check CHECK ((pricing_source = ANY (ARRAY['catalogue'::text, 'flat_rate'::text]))),
    CONSTRAINT merchant_card_progress_rarity_check CHECK ((rarity = ANY (ARRAY['core'::text, 'seasonal'::text, 'limited'::text, 'rare'::text, 'archive'::text]))),
    CONSTRAINT merchant_card_progress_tasting_count_check CHECK ((tasting_count > 0))
);
CREATE TABLE public.merchant_ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    entry_type text NOT NULL,
    leaves_delta bigint NOT NULL,
    balance_after bigint NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    source_reference text,
    idempotency_key text,
    CONSTRAINT merchant_ledger_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['marketplace_transfer_in'::text, 'marketplace_transfer_out'::text, 'woocommerce_earn'::text, 'woocommerce_redeem'::text, 'woocommerce_redeem_release'::text, 'woocommerce_refund_reversal'::text, 'adjustment'::text]))),
    CONSTRAINT merchant_ledger_entries_leaves_delta_check CHECK ((leaves_delta <> 0))
);
CREATE TABLE public.merchant_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_card_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    tea_identity_key text NOT NULL,
    canonical_tea_id uuid,
    product_id text,
    tea_name text NOT NULL,
    tea_category text DEFAULT 'Tea'::text NOT NULL,
    origin text DEFAULT ''::text NOT NULL,
    producer text DEFAULT ''::text NOT NULL,
    creator_display_name text NOT NULL,
    source_tier text NOT NULL,
    rarity text DEFAULT 'core'::text NOT NULL,
    pricing_source text NOT NULL,
    price_per_kilo_cents integer,
    calculated_leaf_price integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source_tastings integer NOT NULL,
    tea_available boolean DEFAULT true NOT NULL,
    preview jsonb DEFAULT '{}'::jsonb NOT NULL,
    card_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    view_count bigint DEFAULT 0 NOT NULL,
    like_count bigint DEFAULT 0 NOT NULL,
    study_count bigint DEFAULT 0 NOT NULL,
    helpful_count bigint DEFAULT 0 NOT NULL,
    helpful_response_count bigint DEFAULT 0 NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_listings_calculated_leaf_price_check CHECK ((calculated_leaf_price > 0)),
    CONSTRAINT merchant_listings_check CHECK ((helpful_response_count >= helpful_count)),
    CONSTRAINT merchant_listings_helpful_count_check CHECK ((helpful_count >= 0)),
    CONSTRAINT merchant_listings_like_count_check CHECK ((like_count >= 0)),
    CONSTRAINT merchant_listings_price_per_kilo_cents_check CHECK (((price_per_kilo_cents IS NULL) OR (price_per_kilo_cents > 0))),
    CONSTRAINT merchant_listings_pricing_source_check CHECK ((pricing_source = ANY (ARRAY['catalogue'::text, 'flat_rate'::text]))),
    CONSTRAINT merchant_listings_rarity_check CHECK ((rarity = ANY (ARRAY['core'::text, 'seasonal'::text, 'limited'::text, 'rare'::text, 'archive'::text]))),
    CONSTRAINT merchant_listings_source_tastings_check CHECK ((source_tastings >= 2)),
    CONSTRAINT merchant_listings_source_tier_check CHECK ((source_tier = ANY (ARRAY['polychrome'::text, 'shielded'::text]))),
    CONSTRAINT merchant_listings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'removed'::text, 'moderated'::text, 'archived'::text]))),
    CONSTRAINT merchant_listings_study_count_check CHECK ((study_count >= 0)),
    CONSTRAINT merchant_listings_view_count_check CHECK ((view_count >= 0))
);
CREATE TABLE public.merchant_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['like'::text, 'favourite'::text, 'helpful'::text])))
);
CREATE TABLE public.merchant_study_copies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    source_listing_id uuid NOT NULL,
    source_card_id uuid NOT NULL,
    source_card_snapshot jsonb NOT NULL,
    source_provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    leaf_price_paid integer NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_study_copies_leaf_price_paid_check CHECK ((leaf_price_paid > 0))
);
CREATE TABLE public.merchant_tasting_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    verification_key text NOT NULL,
    card_id uuid NOT NULL,
    tea_identity_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_tasting_verifications_verification_key_check CHECK (((char_length(verification_key) >= 8) AND (char_length(verification_key) <= 200)))
);
CREATE TABLE public.merchant_transactions (
    id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    study_copy_id uuid NOT NULL,
    leaves_debited integer NOT NULL,
    leaves_credited integer NOT NULL,
    status text DEFAULT 'complete'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_transactions_check CHECK ((buyer_id <> creator_id)),
    CONSTRAINT merchant_transactions_check1 CHECK ((leaves_debited = leaves_credited)),
    CONSTRAINT merchant_transactions_leaves_credited_check CHECK ((leaves_credited > 0)),
    CONSTRAINT merchant_transactions_leaves_debited_check CHECK ((leaves_debited > 0)),
    CONSTRAINT merchant_transactions_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'reversed'::text])))
);
CREATE TABLE public.merchant_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.participant_tokens (
    participant_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid,
    display_name text NOT NULL,
    email text,
    marketing_consent boolean,
    status public.participant_status DEFAULT 'registered'::public.participant_status NOT NULL,
    joined_at timestamp with time zone,
    left_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    recap_claimed_at timestamp with time zone,
    delete_after timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT participants_display_name_check CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 40)))
);
CREATE TABLE public.personal_tea_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    canonical_tea_id uuid,
    name text NOT NULL,
    producer text,
    origin text,
    tea_type text,
    cultivar text,
    harvest text,
    product_identifier text,
    lot_code text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personal_tea_records_cultivar_check CHECK (((cultivar IS NULL) OR ((char_length(TRIM(BOTH FROM cultivar)) >= 1) AND (char_length(TRIM(BOTH FROM cultivar)) <= 120)))),
    CONSTRAINT personal_tea_records_harvest_check CHECK (((harvest IS NULL) OR ((char_length(TRIM(BOTH FROM harvest)) >= 1) AND (char_length(TRIM(BOTH FROM harvest)) <= 120)))),
    CONSTRAINT personal_tea_records_lot_code_check CHECK (((lot_code IS NULL) OR ((char_length(TRIM(BOTH FROM lot_code)) >= 1) AND (char_length(TRIM(BOTH FROM lot_code)) <= 160)))),
    CONSTRAINT personal_tea_records_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 160))),
    CONSTRAINT personal_tea_records_origin_check CHECK (((origin IS NULL) OR ((char_length(TRIM(BOTH FROM origin)) >= 1) AND (char_length(TRIM(BOTH FROM origin)) <= 160)))),
    CONSTRAINT personal_tea_records_producer_check CHECK (((producer IS NULL) OR ((char_length(TRIM(BOTH FROM producer)) >= 1) AND (char_length(TRIM(BOTH FROM producer)) <= 160)))),
    CONSTRAINT personal_tea_records_product_identifier_check CHECK (((product_identifier IS NULL) OR ((char_length(TRIM(BOTH FROM product_identifier)) >= 1) AND (char_length(TRIM(BOTH FROM product_identifier)) <= 160)))),
    CONSTRAINT personal_tea_records_tea_type_check CHECK (((tea_type IS NULL) OR ((char_length(TRIM(BOTH FROM tea_type)) >= 1) AND (char_length(TRIM(BOTH FROM tea_type)) <= 80))))
);
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.reveal_sync_samples (
    id bigint NOT NULL,
    event_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    flight_item_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    reveal_at timestamp with time zone NOT NULL,
    ready_at timestamp with time zone,
    rendered_at timestamp with time zone,
    clock_offset_ms integer,
    round_trip_ms integer,
    reveal_skew_ms integer,
    reduced_motion boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.room_discovery_card_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    category text NOT NULL,
    item_text text NOT NULL,
    normalized_key text NOT NULL,
    source text NOT NULL,
    prevalence_count integer,
    prevalence_total integer NOT NULL,
    attribution_participant_id uuid,
    created_by uuid,
    removed_by uuid,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_discovery_card_items_category_check CHECK ((category = ANY (ARRAY['shared'::text, 'unique'::text, 'changed'::text, 'contrasting'::text]))),
    CONSTRAINT room_discovery_card_items_check CHECK (((prevalence_count IS NULL) OR ((prevalence_total > 0) AND (prevalence_count <= prevalence_total)))),
    CONSTRAINT room_discovery_card_items_item_text_check CHECK (((char_length(btrim(item_text)) >= 1) AND (char_length(btrim(item_text)) <= 120))),
    CONSTRAINT room_discovery_card_items_normalized_key_check CHECK (((char_length(normalized_key) >= 1) AND (char_length(normalized_key) <= 120))),
    CONSTRAINT room_discovery_card_items_prevalence_count_check CHECK (((prevalence_count IS NULL) OR (prevalence_count > 0))),
    CONSTRAINT room_discovery_card_items_prevalence_total_check CHECK ((prevalence_total >= 0)),
    CONSTRAINT room_discovery_card_items_source_check CHECK ((source = ANY (ARRAY['structured'::text, 'participant'::text])))
);
CREATE TABLE public.room_discovery_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    breakout_room_id uuid NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    participant_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    curiosity text,
    room_quote text,
    room_quote_attributed boolean DEFAULT false NOT NULL,
    room_quote_participant_id uuid,
    spokesperson_participant_id uuid,
    spokesperson_state text DEFAULT 'none'::text NOT NULL,
    source_version bigint DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_discovery_cards_check CHECK (((room_quote_attributed AND (room_quote_participant_id IS NOT NULL)) OR (NOT room_quote_attributed))),
    CONSTRAINT room_discovery_cards_curiosity_check CHECK (((curiosity IS NULL) OR (char_length(curiosity) <= 240))),
    CONSTRAINT room_discovery_cards_room_quote_check CHECK (((room_quote IS NULL) OR (char_length(room_quote) <= 240))),
    CONSTRAINT room_discovery_cards_spokesperson_state_check CHECK ((spokesperson_state = ANY (ARRAY['none'::text, 'volunteered'::text, 'invited'::text, 'accepted'::text, 'passed'::text, 'shared'::text])))
);
CREATE TABLE public.tasting_card_descriptors (
    card_id uuid NOT NULL,
    descriptor_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasting_card_descriptors_position_max_five CHECK ((("position" >= 1) AND ("position" <= 5)))
);
CREATE TABLE public.tasting_card_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    storage_path text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer NOT NULL,
    upload_status text DEFAULT 'uploading'::text NOT NULL,
    alt_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasting_card_photos_alt_text_check CHECK (((alt_text IS NULL) OR ((char_length(TRIM(BOTH FROM alt_text)) >= 1) AND (char_length(TRIM(BOTH FROM alt_text)) <= 240)))),
    CONSTRAINT tasting_card_photos_content_type_check CHECK ((content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT tasting_card_photos_owner_path_check CHECK ((storage_path ~~ ((((((owner_user_id)::text || '/'::text) || (card_id)::text) || '/'::text) || (id)::text) || '.%'::text))),
    CONSTRAINT tasting_card_photos_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 8388608))),
    CONSTRAINT tasting_card_photos_upload_status_check CHECK ((upload_status = ANY (ARRAY['uploading'::text, 'ready'::text])))
);
CREATE TABLE public.tasting_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    canonical_tea_id uuid,
    personal_tea_record_id uuid,
    tea_name_snapshot text NOT NULL,
    producer_snapshot text,
    origin_snapshot text,
    tea_type_snapshot text,
    cultivar_snapshot text,
    harvest_snapshot text,
    product_identifier_snapshot text,
    lot_code_snapshot text,
    rating integer,
    intensity text,
    completed_at timestamp with time zone,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasting_cards_check CHECK ((num_nonnulls(canonical_tea_id, personal_tea_record_id) = 1)),
    CONSTRAINT tasting_cards_check1 CHECK (((completed_at IS NULL) OR (rating IS NOT NULL))),
    CONSTRAINT tasting_cards_cultivar_snapshot_check CHECK (((cultivar_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM cultivar_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM cultivar_snapshot)) <= 120)))),
    CONSTRAINT tasting_cards_harvest_snapshot_check CHECK (((harvest_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM harvest_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM harvest_snapshot)) <= 120)))),
    CONSTRAINT tasting_cards_intensity_check CHECK (((intensity IS NULL) OR (intensity = ANY (ARRAY['subtle'::text, 'clear'::text, 'dominant'::text])))),
    CONSTRAINT tasting_cards_lot_code_snapshot_check CHECK (((lot_code_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM lot_code_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM lot_code_snapshot)) <= 160)))),
    CONSTRAINT tasting_cards_origin_snapshot_check CHECK (((origin_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM origin_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM origin_snapshot)) <= 160)))),
    CONSTRAINT tasting_cards_position_check CHECK (("position" > 0)),
    CONSTRAINT tasting_cards_producer_snapshot_check CHECK (((producer_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM producer_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM producer_snapshot)) <= 160)))),
    CONSTRAINT tasting_cards_product_identifier_snapshot_check CHECK (((product_identifier_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM product_identifier_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM product_identifier_snapshot)) <= 160)))),
    CONSTRAINT tasting_cards_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT tasting_cards_revision_check CHECK ((revision > 0)),
    CONSTRAINT tasting_cards_tea_name_snapshot_check CHECK (((char_length(TRIM(BOTH FROM tea_name_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM tea_name_snapshot)) <= 160))),
    CONSTRAINT tasting_cards_tea_type_snapshot_check CHECK (((tea_type_snapshot IS NULL) OR ((char_length(TRIM(BOTH FROM tea_type_snapshot)) >= 1) AND (char_length(TRIM(BOTH FROM tea_type_snapshot)) <= 80))))
);
CREATE TABLE public.tasting_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    kind text DEFAULT 'solo'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasting_sessions_check CHECK (((status = 'completed'::text) = (completed_at IS NOT NULL))),
    CONSTRAINT tasting_sessions_kind_check CHECK ((kind = 'solo'::text)),
    CONSTRAINT tasting_sessions_revision_check CHECK ((revision > 0)),
    CONSTRAINT tasting_sessions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'completed'::text])))
);
CREATE TABLE public.tea_catalog_prices (
    product_id text NOT NULL,
    canonical_tea_id uuid,
    product_name text NOT NULL,
    product_slug text DEFAULT ''::text NOT NULL,
    product_url text DEFAULT ''::text NOT NULL,
    currency text DEFAULT 'CAD'::text NOT NULL,
    price_per_kilo_cents integer NOT NULL,
    representative_package_price_cents integer,
    price_source text DEFAULT 'woocommerce'::text NOT NULL,
    price_strategy text DEFAULT 'largest_weight_variant'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source_updated_at timestamp with time zone,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tea_catalog_prices_currency_check CHECK ((currency = 'CAD'::text)),
    CONSTRAINT tea_catalog_prices_price_per_kilo_cents_check CHECK ((price_per_kilo_cents > 0)),
    CONSTRAINT tea_catalog_prices_product_id_check CHECK (((char_length(product_id) >= 1) AND (char_length(product_id) <= 160))),
    CONSTRAINT tea_catalog_prices_product_name_check CHECK (((char_length(product_name) >= 1) AND (char_length(product_name) <= 160))),
    CONSTRAINT tea_catalog_prices_representative_package_price_cents_check CHECK (((representative_package_price_cents IS NULL) OR (representative_package_price_cents > 0)))
);
CREATE TABLE public.tea_response_revisions (
    id bigint NOT NULL,
    participant_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    breakout_room_id uuid,
    source text NOT NULL,
    observation jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tea_response_revisions_source_check CHECK ((source = ANY (ARRAY['private'::text, 'breakout'::text, 'main_room'::text])))
);
CREATE TABLE public.tea_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    event_flight_item_id uuid NOT NULL,
    first_impression text,
    descriptors text[] DEFAULT '{}'::text[] NOT NULL,
    intensity public.intensity_level,
    rating integer,
    personal_notes text,
    saved boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stamp_released_at timestamp with time zone,
    aroma_descriptors text[] DEFAULT '{}'::text[] NOT NULL,
    aroma_intensity text,
    CONSTRAINT tea_responses_aroma_intensity_check CHECK (((aroma_intensity IS NULL) OR (aroma_intensity = ANY (ARRAY['subtle'::text, 'clear'::text, 'dominant'::text])))),
    CONSTRAINT tea_responses_descriptors_max_five CHECK ((cardinality(descriptors) <= 5)),
    CONSTRAINT tea_responses_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT tea_responses_stamp_requires_completion CHECK (((stamp_released_at IS NULL) OR (completed_at IS NOT NULL)))
);
CREATE TABLE public.teas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    producer text,
    origin text,
    tea_type text,
    default_character text,
    default_brewing text,
    default_steep_seconds integer,
    image_path text,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teas_default_steep_seconds_check CHECK (((default_steep_seconds >= 1) AND (default_steep_seconds <= 3600)))
);
CREATE TABLE public.trivia_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    trivia_question_id uuid NOT NULL,
    selected_index integer NOT NULL,
    is_correct boolean NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key uuid NOT NULL,
    original_answered_at timestamp with time zone NOT NULL,
    on_time boolean NOT NULL,
    CONSTRAINT trivia_answers_selected_index_check CHECK (((selected_index >= 0) AND (selected_index <= 3)))
);
CREATE TABLE public.trivia_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_flight_item_id uuid NOT NULL,
    question text NOT NULL,
    options jsonb NOT NULL,
    correct_index integer NOT NULL,
    explanation text,
    answer_window_seconds integer DEFAULT 20 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT trivia_correct_index_in_range CHECK ((correct_index < jsonb_array_length(options))),
    CONSTRAINT trivia_questions_answer_window_seconds_check CHECK (((answer_window_seconds >= 10) AND (answer_window_seconds <= 60))),
    CONSTRAINT trivia_questions_correct_index_check CHECK (((correct_index >= 0) AND (correct_index <= 3))),
    CONSTRAINT trivia_questions_options_check CHECK (((jsonb_typeof(options) = 'array'::text) AND ((jsonb_array_length(options) >= 2) AND (jsonb_array_length(options) <= 4)))),
    CONSTRAINT trivia_questions_position_range CHECK ((("position" >= 1) AND ("position" <= 10)))
);
CREATE TABLE public.user_discovery_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    identity_definition_id uuid NOT NULL,
    criteria_version integer NOT NULL,
    source_metrics_version text NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    earned_event_id uuid,
    evidence_summary text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    hidden_at timestamp with time zone,
    last_confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_evaluated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_discovery_identities_check CHECK (((hidden_at IS NULL) OR (NOT is_featured))),
    CONSTRAINT user_discovery_identities_criteria_version_check CHECK ((criteria_version > 0)),
    CONSTRAINT user_discovery_identities_evidence_check CHECK ((jsonb_typeof(evidence) = 'object'::text)),
    CONSTRAINT user_discovery_identities_evidence_summary_check CHECK (((char_length(TRIM(BOTH FROM evidence_summary)) >= 10) AND (char_length(TRIM(BOTH FROM evidence_summary)) <= 600))),
    CONSTRAINT user_discovery_identities_source_metrics_version_check CHECK (((char_length(source_metrics_version) >= 3) AND (char_length(source_metrics_version) <= 40))),
    CONSTRAINT user_discovery_identities_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'event'::text, 'public'::text])))
);
CREATE TABLE public.user_discovery_profiles (
    user_id uuid NOT NULL,
    identity_reveals_enabled boolean DEFAULT true NOT NULL,
    social_profile_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE FUNCTION public.claim_live_tasting_shield(p_tea_product_id text, p_event_id text) RETURNS TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid; progress public.merchant_card_progress%rowtype;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
  select state.* into progress
  from public.merchant_card_progress state
  where state.owner_user_id = current_user_id
    and state.product_id = p_tea_product_id
    and state.live_tasting_verified
    and exists (
      select 1 from public.participants participant
      join public.events event on event.id = participant.event_id
      where participant.user_id = current_user_id
        and (event.id::text = p_event_id or event.slug = p_event_id)
        and participant.joined_at is not null
    )
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Live-event attendance and a released tasting stamp have not been verified yet.';
  end if;
  card_id := progress.source_card_id;
  tasting_count := progress.tasting_count;
  card_tier := progress.card_tier;
  listing_eligible := progress.listing_eligible;
  shielded := true;
  price_per_kilo_cents := progress.price_per_kilo_cents;
  base_leaf_price := progress.base_leaf_price;
  current_leaf_price := progress.current_leaf_price;
  pricing_source := progress.pricing_source;
  return next;
end;
$$;

CREATE FUNCTION public.get_merchant_market() RETURNS TABLE(listing_id uuid, tea_name text, tea_category text, origin text, producer text, creator_display_name text, source_tier text, rarity text, pricing_source text, price_per_kilo_cents integer, leaf_price integer, like_count bigint, study_count bigint, helpful_percentage integer, preview jsonb, source_tastings integer, tea_available boolean, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select listing.id, listing.tea_name, listing.tea_category, listing.origin,
    listing.producer, listing.creator_display_name, listing.source_tier,
    listing.rarity, listing.pricing_source, listing.price_per_kilo_cents,
    listing.calculated_leaf_price, listing.like_count, listing.study_count,
    coalesce(round(listing.helpful_count * 100.0 / nullif(listing.helpful_response_count, 0)), 0)::integer,
    listing.preview, listing.source_tastings, listing.tea_available, listing.published_at
  from public.merchant_listings listing
  where listing.status = 'active'
  order by (listing.helpful_count * 3 + listing.study_count * 2 + listing.like_count) desc,
    listing.published_at desc;
$$;

CREATE FUNCTION public.get_my_merchant_cards() RETURNS TABLE(card_id uuid, tea_name text, tea_category text, origin text, producer text, card_tier text, tasting_count integer, listing_eligible boolean, pricing_source text, price_per_kilo_cents integer, leaf_price integer, listing_id uuid, listing_status text, study_count bigint, leaves_earned bigint, preview jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
  return query
  select progress.source_card_id, progress.tea_name, progress.tea_category,
    progress.origin, progress.producer, progress.card_tier, progress.tasting_count,
    progress.listing_eligible, progress.pricing_source, progress.price_per_kilo_cents,
    progress.current_leaf_price, listing.id, listing.status, coalesce(listing.study_count, 0),
    coalesce((select sum(transaction.leaves_credited) from public.merchant_transactions transaction
      where transaction.listing_id = listing.id and transaction.status = 'complete'), 0),
    progress.preview
  from public.merchant_card_progress progress
  left join public.merchant_listings listing
    on listing.creator_id = progress.owner_user_id
   and listing.tea_identity_key = progress.tea_identity_key
   and listing.status in ('active', 'paused')
  where progress.owner_user_id = current_user_id and progress.listing_eligible
  order by progress.updated_at desc;
end;
$$;

CREATE FUNCTION public.publish_merchant_listing(p_card_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid;
  progress public.merchant_card_progress%rowtype;
  listing_id uuid;
  display_name text;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
  select state.* into progress
  from public.merchant_card_progress state
  where state.owner_user_id = current_user_id and state.source_card_id = p_card_id
  for update;
  if not found or not progress.listing_eligible then
    raise exception using errcode = '22023', message = 'A second completed tasting of this exact tea is required before listing.';
  end if;
  select coalesce(nullif(profile.display_name, ''), 'Tea Explorer') into display_name
  from public.profiles profile where profile.id = current_user_id;

  insert into public.merchant_listings (
    source_card_id, creator_id, tea_identity_key, canonical_tea_id, product_id,
    tea_name, tea_category, origin, producer, creator_display_name, source_tier,
    rarity, pricing_source, price_per_kilo_cents, calculated_leaf_price,
    source_tastings, preview, card_snapshot
  ) values (
    progress.source_card_id, current_user_id, progress.tea_identity_key,
    progress.canonical_tea_id, progress.product_id, progress.tea_name,
    progress.tea_category, progress.origin, progress.producer, display_name,
    case when progress.live_tasting_verified then 'shielded' else 'polychrome' end,
    progress.rarity, progress.pricing_source, progress.price_per_kilo_cents,
    progress.current_leaf_price, progress.tasting_count, progress.preview, progress.card_snapshot
  )
  on conflict (creator_id, tea_identity_key) where status in ('active', 'paused')
  do update set
    source_card_id = excluded.source_card_id,
    source_tier = excluded.source_tier,
    pricing_source = excluded.pricing_source,
    price_per_kilo_cents = excluded.price_per_kilo_cents,
    calculated_leaf_price = excluded.calculated_leaf_price,
    source_tastings = excluded.source_tastings,
    preview = excluded.preview,
    card_snapshot = excluded.card_snapshot,
    status = 'active',
    updated_at = now()
  returning id into listing_id;
  return listing_id;
end;
$$;

CREATE FUNCTION public.purchase_study_copy(p_listing_id uuid) RETURNS TABLE(transaction_id uuid, study_copy_id uuid, remaining_balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid;
  listing public.merchant_listings%rowtype;
  buyer_wallet public.merchant_wallets%rowtype;
  creator_wallet public.merchant_wallets%rowtype;
  new_transaction_id uuid := extensions.gen_random_uuid();
  new_copy_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  select item.* into listing from public.merchant_listings item
  where item.id = p_listing_id and item.status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'This card is not currently available.'; end if;
  if listing.creator_id = current_user_id then
    raise exception using errcode = '22023', message = 'You cannot purchase your own card.';
  end if;
  insert into public.merchant_wallets (owner_user_id) values (listing.creator_id)
  on conflict (owner_user_id) do nothing;
  perform wallet.id from public.merchant_wallets wallet
    where wallet.owner_user_id in (current_user_id, listing.creator_id)
    order by wallet.id for update;
  select wallet.* into buyer_wallet from public.merchant_wallets wallet where wallet.owner_user_id = current_user_id;
  select wallet.* into creator_wallet from public.merchant_wallets wallet where wallet.owner_user_id = listing.creator_id;
  if buyer_wallet.balance < listing.calculated_leaf_price then
    raise exception using errcode = '22003', message = 'The wallet has insufficient Gold Leaves.';
  end if;

  update public.merchant_wallets set balance = balance - listing.calculated_leaf_price, updated_at = now()
  where id = buyer_wallet.id;
  update public.merchant_wallets set balance = balance + listing.calculated_leaf_price, updated_at = now()
  where id = creator_wallet.id;
  insert into public.merchant_ledger_entries (
    wallet_id, transaction_id, entry_type, leaves_delta, balance_after, description, metadata
  ) values
    (buyer_wallet.id, new_transaction_id, 'marketplace_transfer_out', -listing.calculated_leaf_price,
      buyer_wallet.balance - listing.calculated_leaf_price, 'Permanent Study Copy of ' || listing.tea_name,
      jsonb_build_object('listing_id', listing.id, 'counterparty_user_id', listing.creator_id)),
    (creator_wallet.id, new_transaction_id, 'marketplace_transfer_in', listing.calculated_leaf_price,
      creator_wallet.balance + listing.calculated_leaf_price, 'Study Copy shared: ' || listing.tea_name,
      jsonb_build_object('listing_id', listing.id, 'counterparty_user_id', current_user_id));

  insert into public.merchant_study_copies (
    buyer_id, source_listing_id, source_card_id, source_card_snapshot,
    source_provenance, leaf_price_paid
  ) values (
    current_user_id, listing.id, listing.source_card_id, listing.card_snapshot,
    jsonb_build_object('creator_id', listing.creator_id, 'creator_display_name', listing.creator_display_name,
      'source_tier', listing.source_tier, 'purchased_at', now()), listing.calculated_leaf_price
  ) returning id into new_copy_id;
  insert into public.merchant_transactions (
    id, buyer_id, creator_id, listing_id, study_copy_id, leaves_debited, leaves_credited
  ) values (
    new_transaction_id, current_user_id, listing.creator_id, listing.id, new_copy_id,
    listing.calculated_leaf_price, listing.calculated_leaf_price
  );
  update public.merchant_listings set study_count = study_count + 1, updated_at = now() where id = listing.id;
  transaction_id := new_transaction_id;
  study_copy_id := new_copy_id;
  remaining_balance := buyer_wallet.balance - listing.calculated_leaf_price;
  return next;
end;
$$;

CREATE FUNCTION public.record_verified_tasting(p_tea_product_id text, p_tea_category text, p_origin text, p_producer text, p_rarity text, p_verification_key text, p_card_preview jsonb DEFAULT '{}'::jsonb, p_card_content jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid;
  existing_card_id uuid;
  catalog public.tea_catalog_prices%rowtype;
  personal_record_id uuid;
  new_session_id uuid := extensions.gen_random_uuid();
  new_card_id uuid := extensions.gen_random_uuid();
  resolved_name text;
  resolved_identity text;
  progress public.merchant_card_progress%rowtype;
begin
  current_user_id := public.ensure_current_customer();
  if char_length(coalesce(p_verification_key, '')) < 8 then
    raise exception using errcode = '22023', message = 'A valid tasting verification key is required.';
  end if;

  select verification.card_id into existing_card_id
  from public.merchant_tasting_verifications verification
  where verification.owner_user_id = current_user_id
    and verification.verification_key = p_verification_key;

  if existing_card_id is null then
    select price.* into catalog
    from public.tea_catalog_prices price
    where price.product_id = p_tea_product_id and price.is_active;

    resolved_name := coalesce(catalog.product_name, nullif(p_card_preview ->> 'tea_name', ''), p_tea_product_id);

    if catalog.canonical_tea_id is null then
      select personal.id into personal_record_id
      from public.personal_tea_records personal
      where personal.owner_user_id = current_user_id
        and lower(coalesce(personal.product_identifier, '')) = lower(p_tea_product_id)
        and personal.archived_at is null
      order by personal.created_at
      limit 1;

      if personal_record_id is null then
        insert into public.personal_tea_records (
          owner_user_id, name, producer, origin, tea_type, product_identifier
        ) values (
          current_user_id, resolved_name, nullif(p_producer, ''), nullif(p_origin, ''),
          nullif(p_tea_category, ''), p_tea_product_id
        ) returning id into personal_record_id;
      end if;
    end if;

    insert into public.tasting_sessions (
      id, owner_user_id, kind, status, started_at, completed_at
    ) values (
      new_session_id, current_user_id, 'solo', 'completed', now(), now()
    );

    insert into public.tasting_cards (
      id, session_id, owner_user_id, position, canonical_tea_id, personal_tea_record_id,
      tea_name_snapshot, producer_snapshot, origin_snapshot, tea_type_snapshot,
      product_identifier_snapshot, rating, intensity, completed_at
    ) values (
      new_card_id, new_session_id, current_user_id, 1, catalog.canonical_tea_id, personal_record_id,
      resolved_name, nullif(p_producer, ''), nullif(p_origin, ''), nullif(p_tea_category, ''),
      p_tea_product_id,
      greatest(1, least(5, coalesce((p_card_content ->> 'rating')::integer, 3))),
      case when p_card_content ->> 'intensity' in ('subtle','clear','dominant')
           then p_card_content ->> 'intensity'
           when coalesce((p_card_content ->> 'intensity')::integer, 2) <= 1 then 'subtle'
           when coalesce((p_card_content ->> 'intensity')::integer, 2) >= 3 then 'dominant'
           else 'clear' end,
      now()
    );

    resolved_identity := coalesce(
      'tea:' || catalog.canonical_tea_id::text,
      'product:' || lower(trim(p_tea_product_id))
    );
    insert into public.merchant_tasting_verifications (
      owner_user_id, verification_key, card_id, tea_identity_key
    ) values (current_user_id, p_verification_key, new_card_id, resolved_identity);
    existing_card_id := new_card_id;
  end if;

  perform public.refresh_merchant_card_progress(current_user_id);
  select state.* into progress
  from public.merchant_card_progress state
  where state.owner_user_id = current_user_id and state.source_card_id = existing_card_id;
  if not found then
    select state.* into progress
    from public.merchant_card_progress state
    join public.merchant_tasting_verifications verification
      on verification.owner_user_id = state.owner_user_id
     and verification.tea_identity_key = state.tea_identity_key
    where verification.owner_user_id = current_user_id
      and verification.card_id = existing_card_id;
  end if;

  card_id := existing_card_id;
  tasting_count := progress.tasting_count;
  card_tier := progress.card_tier;
  listing_eligible := progress.listing_eligible;
  shielded := progress.live_tasting_verified;
  price_per_kilo_cents := progress.price_per_kilo_cents;
  base_leaf_price := progress.base_leaf_price;
  current_leaf_price := progress.current_leaf_price;
  pricing_source := progress.pricing_source;
  return next;
end;
$$;

CREATE FUNCTION public.refresh_merchant_card_progress(p_owner_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_owner_user_id is null then
    return;
  end if;
  delete from public.merchant_card_progress where owner_user_id = p_owner_user_id;

  with completed_cards as (
    select
      card.*,
      coalesce(card.product_identifier_snapshot, personal.product_identifier) as resolved_product_id,
      coalesce(
        'tea:' || card.canonical_tea_id::text,
        'product:' || lower(trim(coalesce(card.product_identifier_snapshot, personal.product_identifier))),
        'personal:' || card.personal_tea_record_id::text
      ) as identity_key
    from public.tasting_cards card
    left join public.personal_tea_records personal on personal.id = card.personal_tea_record_id
    where card.owner_user_id = p_owner_user_id and card.completed_at is not null
  ), grouped as (
    select identity_key, count(*)::integer as tasting_count
    from completed_cards
    group by identity_key
  ), latest as (
    select distinct on (identity_key) completed_cards.*
    from completed_cards
    order by identity_key, completed_at desc, created_at desc
  ), resolved as (
    select
      latest.*,
      grouped.tasting_count,
      catalog.product_id as catalog_product_id,
      catalog.price_per_kilo_cents,
      catalog.is_active as catalog_active,
      exists (
        select 1
        from public.tea_responses response
        join public.participants participant on participant.id = response.participant_id
        join public.event_flight_items flight on flight.id = response.event_flight_item_id
        where participant.user_id = p_owner_user_id
          and response.completed_at is not null
          and response.stamp_released_at is not null
          and flight.tea_id = latest.canonical_tea_id
      ) as has_live_shield
    from latest
    join grouped using (identity_key)
    left join lateral (
      select price.*
      from public.tea_catalog_prices price
      where price.is_active
        and (
          (latest.canonical_tea_id is not null and price.canonical_tea_id = latest.canonical_tea_id)
          or (latest.resolved_product_id is not null and price.product_id = latest.resolved_product_id)
        )
      order by (price.product_id = latest.resolved_product_id) desc, price.synced_at desc
      limit 1
    ) catalog on true
  )
  insert into public.merchant_card_progress (
    owner_user_id, tea_identity_key, source_card_id, canonical_tea_id, product_id,
    tea_name, tea_category, origin, producer, card_tier, tasting_count,
    listing_eligible, live_tasting_verified, pricing_source,
    price_per_kilo_cents, base_leaf_price, current_leaf_price, preview, card_snapshot
  )
  select
    p_owner_user_id,
    resolved.identity_key,
    resolved.id,
    resolved.canonical_tea_id,
    coalesce(resolved.catalog_product_id, resolved.resolved_product_id),
    resolved.tea_name_snapshot,
    coalesce(resolved.tea_type_snapshot, 'Tea'),
    coalesce(resolved.origin_snapshot, ''),
    coalesce(resolved.producer_snapshot, ''),
    case when resolved.has_live_shield then 'shielded'
         when resolved.tasting_count >= 2 then 'polychrome'
         else 'standard' end,
    resolved.tasting_count,
    resolved.tasting_count >= 2,
    resolved.has_live_shield,
    case when resolved.catalog_active then 'catalogue' else 'flat_rate' end,
    resolved.price_per_kilo_cents,
    public.calculate_card_leaf_price_from_kilo(resolved.price_per_kilo_cents, 'polychrome'),
    public.calculate_card_leaf_price_from_kilo(
      resolved.price_per_kilo_cents,
      case when resolved.has_live_shield then 'shielded' else 'polychrome' end
    ),
    jsonb_build_object(
      'rating', resolved.rating,
      'intensity', resolved.intensity,
      'descriptors', coalesce((
        select jsonb_agg(descriptor.label order by card_descriptor.position)
        from public.tasting_card_descriptors card_descriptor
        join public.flavor_descriptors descriptor on descriptor.id = card_descriptor.descriptor_id
        where card_descriptor.card_id = resolved.id
      ), '[]'::jsonb),
      'broad_family', coalesce(resolved.tea_type_snapshot, 'Tea')
    ),
    jsonb_build_object(
      'tea_name', resolved.tea_name_snapshot,
      'producer', resolved.producer_snapshot,
      'origin', resolved.origin_snapshot,
      'tea_type', resolved.tea_type_snapshot,
      'cultivar', resolved.cultivar_snapshot,
      'harvest', resolved.harvest_snapshot,
      'rating', resolved.rating,
      'intensity', resolved.intensity,
      'completed_at', resolved.completed_at
    )
  from resolved;

  update public.merchant_listings listing
  set source_card_id = progress.source_card_id,
      canonical_tea_id = progress.canonical_tea_id,
      product_id = progress.product_id,
      tea_name = progress.tea_name,
      tea_category = progress.tea_category,
      origin = progress.origin,
      producer = progress.producer,
      source_tier = case when progress.live_tasting_verified then 'shielded' else 'polychrome' end,
      pricing_source = progress.pricing_source,
      price_per_kilo_cents = progress.price_per_kilo_cents,
      calculated_leaf_price = progress.current_leaf_price,
      source_tastings = progress.tasting_count,
      preview = progress.preview,
      card_snapshot = progress.card_snapshot,
      updated_at = now()
  from public.merchant_card_progress progress
  where listing.creator_id = p_owner_user_id
    and listing.creator_id = progress.owner_user_id
    and listing.tea_identity_key = progress.tea_identity_key
    and listing.status in ('active', 'paused');
end;
$$;

CREATE FUNCTION public.refresh_my_merchant_cards() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
end;
$$;

CREATE FUNCTION public.set_marketplace_reaction(p_listing_id uuid, p_reaction_type text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid; changed_count integer;
begin
  current_user_id := public.ensure_current_customer();
  if p_reaction_type not in ('like', 'favourite', 'helpful') then
    raise exception using errcode = '22023', message = 'Unsupported reaction type.';
  end if;
  if p_reaction_type = 'helpful' and not exists (
    select 1 from public.merchant_study_copies copy
    where copy.buyer_id = current_user_id and copy.source_listing_id = p_listing_id
  ) then
    raise exception using errcode = '42501', message = 'Only Study Copy owners can mark a card helpful.';
  end if;
  if p_enabled then
    insert into public.merchant_reactions (owner_user_id, listing_id, reaction_type)
    values (current_user_id, p_listing_id, p_reaction_type) on conflict do nothing;
    get diagnostics changed_count = row_count;
  else
    delete from public.merchant_reactions
    where owner_user_id = current_user_id and listing_id = p_listing_id and reaction_type = p_reaction_type;
    get diagnostics changed_count = row_count;
  end if;
  if changed_count > 0 and p_reaction_type = 'like' then
    update public.merchant_listings
    set like_count = greatest(0, like_count + case when p_enabled then 1 else -1 end), updated_at = now()
    where id = p_listing_id;
  elsif changed_count > 0 and p_reaction_type = 'helpful' then
    update public.merchant_listings
    set helpful_count = greatest(0, helpful_count + case when p_enabled then 1 else -1 end),
        helpful_response_count = greatest(0, helpful_response_count + case when p_enabled then 1 else -1 end),
        updated_at = now()
    where id = p_listing_id;
  end if;
end;
$$;

CREATE FUNCTION public.set_merchant_listing_status(p_listing_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  if p_status not in ('active', 'paused', 'removed') then
    raise exception using errcode = '22023', message = 'Unsupported listing status.';
  end if;
  update public.merchant_listings
  set status = p_status, updated_at = now()
  where id = p_listing_id and creator_id = current_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'The listing was not found.'; end if;
end;
$$;

CREATE FUNCTION public.sync_merchant_progress_from_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.refresh_merchant_card_progress(new.owner_user_id);
  if tg_op = 'UPDATE' and old.owner_user_id is distinct from new.owner_user_id then
    perform public.refresh_merchant_card_progress(old.owner_user_id);
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.sync_merchant_progress_from_catalog() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare owner_id uuid;
begin
  for owner_id in
    select distinct progress.owner_user_id
    from public.merchant_card_progress progress
    where progress.product_id = new.product_id
       or (new.canonical_tea_id is not null and progress.canonical_tea_id = new.canonical_tea_id)
  loop
    perform public.refresh_merchant_card_progress(owner_id);
  end loop;
  return new;
end;
$$;

CREATE FUNCTION public.sync_merchant_progress_from_live_stamp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare linked_user_id uuid;
begin
  select participant.user_id into linked_user_id
  from public.participants participant where participant.id = new.participant_id;
  if linked_user_id is not null then
    perform public.refresh_merchant_card_progress(linked_user_id);
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.add_discovery_card_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.room_discovery_cards set participant_ids=array_append(participant_ids,new.participant_id),updated_at=now()
    where breakout_room_id=new.breakout_room_id and not new.participant_id=any(participant_ids);
  return new;
end $$;

CREATE FUNCTION public.apply_discovery_presentation_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;lease_row public.host_control_leases;session_row public.event_breakout_sessions;
  presentation_row public.event_discovery_presentations;card_row public.room_discovery_cards;
  card_id uuid;participant_id uuid;open_cards uuid[];
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;
  select * into session_row from public.event_breakout_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status in ('returning','complete')
    order by created_at desc limit 1;
  if session_row.id is null then raise exception 'discovery_board_unavailable'; end if;
  select * into presentation_row from public.event_discovery_presentations where breakout_session_id=session_row.id for update;
  card_id=nullif(p_payload->>'cardId','')::uuid;
  if card_id is not null then
    select * into card_row from public.room_discovery_cards where id=card_id and session_id=session_row.id for update;
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
  end if;

  if p_command='open_discovery_card' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    update public.event_discovery_presentations set open_card_ids=array[card_id],surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='compare_discovery_card' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    open_cards=coalesce(presentation_row.open_card_ids,'{}'::uuid[]);
    if card_id=any(open_cards) then null;
    elsif cardinality(open_cards)=0 then open_cards=array[card_id];
    elsif cardinality(open_cards)=1 then open_cards=array_append(open_cards,card_id);
    else open_cards=array[open_cards[2],card_id];
    end if;
    update public.event_discovery_presentations set open_card_ids=open_cards,surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='surface_discovery_curiosity' then
    if card_row.id is null or card_row.curiosity is null then raise exception 'discovery_curiosity_unavailable'; end if;
    update public.event_discovery_presentations set open_card_ids=array[card_id],surfaced_curiosity_card_id=card_id,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='close_discovery_cards' then
    update public.event_discovery_presentations set open_card_ids='{}'::uuid[],surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='invite_discovery_spokesperson' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    participant_id=coalesce(nullif(p_payload->>'participantId','')::uuid,card_row.spokesperson_participant_id);
    if participant_id is null or not exists(select 1 from public.event_breakout_members member where member.breakout_room_id=card_row.breakout_room_id and member.participant_id=participant_id) then
      raise exception 'discovery_spokesperson_unavailable';
    end if;
    update public.room_discovery_cards set spokesperson_participant_id=participant_id,spokesperson_state='invited',updated_at=now() where id=card_id;
    update public.event_discovery_presentations set open_card_ids=array[card_id],updated_by=auth.uid(),updated_at=now() where breakout_session_id=session_row.id;
  elsif p_command='complete_discovery_share' then
    if card_row.id is null or card_row.spokesperson_state not in ('accepted','invited') then raise exception 'discovery_spokesperson_unavailable'; end if;
    update public.room_discovery_cards set spokesperson_state='shared',updated_at=now() where id=card_id;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'breakout_session_id',session_row.id,'card_id',card_id,'client_command_id',p_client_command_id
    ));
  return event_row;
end $$;

CREATE FUNCTION public.apply_live_tasting_reward_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;lease_row public.host_control_leases;participant_id_value uuid;
  policy_id_value uuid;enabled_value boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid()
    or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now()
  then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;

  select id into policy_id_value from public.live_tasting_reward_policies where active limit 1;
  if policy_id_value is null then raise exception 'reward_policy_unavailable'; end if;
  insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
    values(p_event_id,policy_id_value,true) on conflict(event_id) do nothing;

  if p_command='set_reward_mode' then
    enabled_value=coalesce((p_payload->>'rewardModeEnabled')::boolean,true);
    update public.event_live_reward_settings set reward_mode_enabled=enabled_value,updated_at=now()
      where event_id=p_event_id;
  elsif p_command='grant_reward_completion' then
    participant_id_value=(p_payload->>'participantId')::uuid;
    if not exists(select 1 from public.participants participant where participant.id=participant_id_value
      and participant.event_id=p_event_id and participant.status<>'removed')
    then raise exception 'reward_participant_unavailable'; end if;
    insert into public.event_live_reward_completion_overrides(event_id,participant_id,granted_by)
      values(p_event_id,participant_id_value,auth.uid()) on conflict(event_id,participant_id) do nothing;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'client_command_id',p_client_command_id,'reward_mode_enabled',p_payload->>'rewardModeEnabled',
      'manual_completion_participant_id',p_payload->>'participantId'
    ));
  return event_row;
end $$;

CREATE FUNCTION public.apply_living_tasting_map_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;lease_row public.host_control_leases;map_row public.living_tasting_map_sessions;
  pause_ms bigint;seek_ms integer;configured_duration integer;configured_visibility text;configured_custom boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.status<>'live' or event_row.phase='ended' then raise exception 'living_map_event_unavailable'; end if;
  if event_row.current_flight_item_id is null then raise exception 'flight_missing'; end if;

  insert into public.living_tasting_map_sessions(event_id,event_flight_item_id,created_by)
    values(p_event_id,event_row.current_flight_item_id,auth.uid()) on conflict(event_id,event_flight_item_id) do nothing;
  select * into map_row from public.living_tasting_map_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id for update;

  if p_command='configure_living_map' then
    if map_row.status<>'ready' then raise exception 'living_map_already_started'; end if;
    configured_duration=coalesce((p_payload->>'durationSeconds')::integer,map_row.duration_seconds);
    configured_visibility=coalesce(nullif(p_payload->>'visibilityMode',''),map_row.visibility_mode);
    configured_custom=coalesce((p_payload->>'customNotesEnabled')::boolean,map_row.custom_notes_enabled);
    if configured_duration<60 or configured_duration>1800 then raise exception 'living_map_duration_invalid'; end if;
    if configured_visibility not in ('quiet_start','shared_live') then raise exception 'living_map_visibility_invalid'; end if;
    map_row.duration_seconds=configured_duration;map_row.visibility_mode=configured_visibility;map_row.custom_notes_enabled=configured_custom;
  elsif p_command='start_living_map' then
    if event_row.conductor_stage not in ('aroma','first_sip','explore','discuss') then raise exception 'living_map_stage_unavailable'; end if;
    if map_row.status<>'ready' then raise exception 'living_map_already_started'; end if;
    map_row.status='live';map_row.started_at=clock_timestamp();map_row.paused_at=null;map_row.accumulated_pause_ms=0;
  elsif p_command='pause_living_map' then
    if map_row.status<>'live' then raise exception 'living_map_not_live'; end if;
    map_row.status='paused';map_row.paused_at=clock_timestamp();
  elsif p_command='resume_living_map' then
    if map_row.status<>'paused' or map_row.paused_at is null then raise exception 'living_map_not_paused'; end if;
    pause_ms=greatest(0,extract(epoch from (clock_timestamp()-map_row.paused_at))*1000)::bigint;
    map_row.accumulated_pause_ms=map_row.accumulated_pause_ms+pause_ms;map_row.status='live';map_row.paused_at=null;
  elsif p_command='freeze_living_map' then
    if map_row.status not in ('live','paused') then raise exception 'living_map_not_live'; end if;
    if map_row.paused_at is not null then
      pause_ms=greatest(0,extract(epoch from (clock_timestamp()-map_row.paused_at))*1000)::bigint;
      map_row.accumulated_pause_ms=map_row.accumulated_pause_ms+pause_ms;
    end if;
    map_row.status='frozen';map_row.paused_at=null;map_row.frozen_at=clock_timestamp();map_row.replay_position_ms=0;
  elsif p_command='start_living_map_replay' then
    if map_row.status not in ('frozen','replaying') or not exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id) then raise exception 'living_map_fingerprint_unavailable'; end if;
    map_row.status='replaying';map_row.replay_started_at=clock_timestamp();map_row.replay_paused_at=null;map_row.replay_position_ms=0;
  elsif p_command='pause_living_map_replay' then
    if map_row.status<>'replaying' or map_row.replay_started_at is null or map_row.replay_paused_at is not null then raise exception 'living_map_replay_not_running'; end if;
    map_row.replay_position_ms=least(map_row.duration_seconds*1000,map_row.replay_position_ms+round(extract(epoch from (clock_timestamp()-map_row.replay_started_at))*1000*(map_row.duration_seconds::numeric/map_row.replay_duration_seconds))::integer);
    map_row.replay_paused_at=clock_timestamp();
  elsif p_command='resume_living_map_replay' then
    if map_row.status<>'replaying' or map_row.replay_paused_at is null then raise exception 'living_map_replay_not_paused'; end if;
    map_row.replay_started_at=clock_timestamp();map_row.replay_paused_at=null;
  elsif p_command='seek_living_map_replay' then
    if map_row.status<>'replaying' then raise exception 'living_map_replay_unavailable'; end if;
    seek_ms=coalesce((p_payload->>'replayPositionMs')::integer,-1);
    if seek_ms<0 or seek_ms>map_row.duration_seconds*1000 then raise exception 'living_map_seek_invalid'; end if;
    map_row.replay_position_ms=seek_ms;map_row.replay_started_at=clock_timestamp();
  elsif p_command='commit_living_map_fingerprint' then
    if map_row.status not in ('frozen','replaying') or not exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id) then raise exception 'living_map_fingerprint_unavailable'; end if;
    update public.living_tasting_map_fingerprints set committed_at=coalesce(committed_at,clock_timestamp()),updated_at=clock_timestamp() where session_id=map_row.id;
    map_row.status='committed';
  elsif p_command='reopen_living_map' then
    if map_row.status not in ('frozen','replaying') or exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id and committed_at is not null) then raise exception 'living_map_reopen_unavailable'; end if;
    delete from public.living_tasting_map_fingerprints where session_id=map_row.id;
    map_row.status='live';map_row.frozen_at=null;map_row.replay_started_at=null;map_row.replay_paused_at=null;map_row.replay_position_ms=0;
  else raise exception 'unknown_command'; end if;

  update public.living_tasting_map_sessions set status=map_row.status,duration_seconds=map_row.duration_seconds,
    visibility_mode=map_row.visibility_mode,custom_notes_enabled=map_row.custom_notes_enabled,started_at=map_row.started_at,
    paused_at=map_row.paused_at,accumulated_pause_ms=map_row.accumulated_pause_ms,frozen_at=map_row.frozen_at,
    replay_started_at=map_row.replay_started_at,replay_paused_at=map_row.replay_paused_at,replay_position_ms=map_row.replay_position_ms,
    version=version+1,updated_at=clock_timestamp() where id=map_row.id returning * into map_row;

  event_row.sequence_number=event_row.sequence_number+1;event_row.last_conductor_command_id=p_client_command_id;event_row.conductor_id=auth.uid();event_row.updated_at=clock_timestamp();
  update public.events set sequence_number=event_row.sequence_number,last_conductor_command_id=event_row.last_conductor_command_id,
    conductor_id=event_row.conductor_id,updated_at=event_row.updated_at where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object('living_map_session_id',map_row.id,'living_map_status',map_row.status,'command_payload',p_payload));
  return event_row;
end $$;

CREATE FUNCTION public.authoritative_discovery_history(p_user_id uuid) RETURNS TABLE(source_kind text, source_record_id uuid, source_event_id uuid, tea_key text, tea_name text, tea_type text, origin text, completed_at timestamp with time zone, descriptor_categories text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    'live'::text,
    response.id,
    event.id,
    'canonical:'||tea.id::text,
    tea.name,
    nullif(trim(tea.tea_type),''),
    nullif(trim(tea.origin),''),
    response.stamp_released_at,
    coalesce(observations.categories,'{}'::text[])
  from public.participants participant
  join public.tea_responses response on response.participant_id=participant.id
  join public.event_flight_items flight on flight.id=response.event_flight_item_id
  join public.events event on event.id=flight.event_id and event.id=participant.event_id
  join public.teas tea on tea.id=flight.tea_id
  left join lateral (
    select array_agg(distinct descriptor.category) as categories
    from unnest(coalesce(response.descriptors,'{}'::text[])) selected(value)
    join public.flavor_descriptors descriptor on
      lower(regexp_replace(trim(selected.value),'[[:space:]_/-]+',' ','g'))
        = lower(regexp_replace(trim(descriptor.label),'[[:space:]_/-]+',' ','g'))
      or exists (
        select 1 from unnest(descriptor.aliases) alias(value)
        where lower(regexp_replace(trim(alias.value),'[[:space:]_/-]+',' ','g'))
          = lower(regexp_replace(trim(selected.value),'[[:space:]_/-]+',' ','g'))
      )
  ) observations on true
  where participant.user_id=p_user_id
    and participant.status<>'removed'
    and event.status='completed'
    and response.completed_at is not null
    and response.stamp_released_at is not null

  union all

  select
    'solo'::text,
    card.id,
    null::uuid,
    case
      when card.canonical_tea_id is not null then 'canonical:'||card.canonical_tea_id::text
      else 'personal:'||card.personal_tea_record_id::text
    end,
    card.tea_name_snapshot,
    nullif(trim(card.tea_type_snapshot),''),
    nullif(trim(card.origin_snapshot),''),
    card.completed_at,
    coalesce(observations.categories,'{}'::text[])
  from public.tasting_cards card
  join public.tasting_sessions session on session.id=card.session_id and session.owner_user_id=card.owner_user_id
  left join lateral (
    select array_agg(distinct descriptor.category) as categories
    from public.tasting_card_descriptors selected
    join public.flavor_descriptors descriptor on descriptor.id=selected.descriptor_id
    where selected.card_id=card.id and selected.owner_user_id=card.owner_user_id
  ) observations on true
  where card.owner_user_id=p_user_id
    and session.status='completed'
    and card.completed_at is not null
$$;

CREATE FUNCTION public.create_discovery_presentation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.event_discovery_presentations(breakout_session_id,event_id) values(new.id,new.event_id)
    on conflict(breakout_session_id) do nothing;
  return new;
end $$;

CREATE FUNCTION public.create_room_discovery_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare session_row public.event_breakout_sessions;
begin
  select * into session_row from public.event_breakout_sessions where id=new.session_id;
  insert into public.room_discovery_cards(breakout_room_id,session_id,event_id,event_flight_item_id)
    values(new.id,new.session_id,new.event_id,session_row.event_flight_item_id)
    on conflict(breakout_room_id) do nothing;
  return new;
end $$;

CREATE FUNCTION public.discovery_metrics_for_user(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with history as (
    select * from public.authoritative_discovery_history(p_user_id)
  ), distinct_teas as (
    select distinct on (tea_key) tea_key,tea_name,tea_type,origin,completed_at
    from history order by tea_key,completed_at desc
  ), type_counts as (
    select lower(tea_type) as label,count(*)::integer as value
    from distinct_teas where tea_type is not null group by lower(tea_type)
  ), descriptor_counts as (
    select category,count(distinct history.tea_key)::integer as value
    from history cross join lateral unnest(history.descriptor_categories) category
    group by category
  )
  select jsonb_build_object(
    'teas_explored',(select count(*) from distinct_teas),
    'tea_type_count',(select count(*) from type_counts),
    'origin_count',(select count(distinct lower(origin)) from distinct_teas where origin is not null),
    'live_tastings_completed',(select count(distinct source_event_id) from history where source_event_id is not null),
    'tea_type_distribution',coalesce((select jsonb_object_agg(label,value order by label) from type_counts),'{}'::jsonb),
    'origins',coalesce((select jsonb_agg(origin order by origin) from (select distinct origin from distinct_teas where origin is not null) found),'[]'::jsonb),
    'descriptor_family_distribution',coalesce((select jsonb_object_agg(category,value order by category) from descriptor_counts),'{}'::jsonb),
    'source_metrics_version','discovery-v1'
  )
$$;

CREATE FUNCTION public.event_discovery_board(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare event_row public.events;session_row public.event_breakout_sessions;presentation_row public.event_discovery_presentations;cards jsonb;
begin
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  select * into session_row from public.event_breakout_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status in ('active','returning','complete')
    order by created_at desc limit 1;
  if session_row.id is null then return '{"session":null,"cards":[],"openCardIds":[]}'::jsonb; end if;
  update public.room_discovery_cards card set spokesperson_participant_id=null,spokesperson_state='none',updated_at=now()
    from public.participants participant
    where card.session_id=session_row.id and card.spokesperson_participant_id=participant.id and participant.status in ('left','removed');
  select * into presentation_row from public.event_discovery_presentations where breakout_session_id=session_row.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',card.id,'breakoutRoomId',card.breakout_room_id,'roomNumber',room.room_number,
    'participantCount',cardinality(card.participant_ids),'lockedAt',card.locked_at,'sourceVersion',card.source_version,
    'curiosity',card.curiosity,'roomQuote',card.room_quote,
    'quoteAttributed',card.room_quote_attributed,'spokespersonState',card.spokesperson_state,
    'spokespersonParticipantId',card.spokesperson_participant_id,
    'spokespersonName',(select participant.display_name from public.participants participant where participant.id=card.spokesperson_participant_id),
    'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',participant.id,'displayName',participant.display_name) order by participant.display_name),'[]'::jsonb)
      from public.event_breakout_members member join public.participants participant on participant.id=member.participant_id where member.breakout_room_id=card.breakout_room_id),
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'category',item.category,'text',item.item_text,'normalizedKey',item.normalized_key,'source',item.source,
      'prevalenceCount',item.prevalence_count,'prevalenceTotal',item.prevalence_total
    ) order by item.category,item.prevalence_count desc nulls last,item.created_at),'[]'::jsonb)
      from public.room_discovery_card_items item where item.card_id=card.id and item.removed_at is null)
  ) order by room.room_number),'[]'::jsonb) into cards
  from public.room_discovery_cards card join public.event_breakout_rooms room on room.id=card.breakout_room_id
  where card.session_id=session_row.id;
  return jsonb_build_object(
    'session',jsonb_build_object('id',session_row.id,'status',session_row.status,'eventFlightItemId',session_row.event_flight_item_id,'completedAt',session_row.completed_at),
    'cards',cards,'openCardIds',coalesce(presentation_row.open_card_ids,'{}'::uuid[]),
    'surfacedCuriosityCardId',presentation_row.surfaced_curiosity_card_id
  );
end $$;

CREATE FUNCTION public.initialize_live_tasting_reward_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare policy_id_value uuid;
begin
  select id into policy_id_value from public.live_tasting_reward_policies where active limit 1;
  if policy_id_value is not null then
    insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
    values(new.id,policy_id_value,true) on conflict(event_id) do nothing;
  end if;
  return new;
end $$;

CREATE FUNCTION public.lock_room_discovery_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status='open' and new.status in ('returning','closed') then
    update public.room_discovery_cards set locked_at=coalesce(locked_at,now()),updated_at=now() where breakout_room_id=new.id;
  end if;
  return new;
end $$;

CREATE FUNCTION public.process_live_tasting_rewards(p_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  award_row public.event_live_reward_awards;wallet_id_value uuid;entry_id_value uuid;
  awarded_count integer:=0;retry_count integer:=0;
begin
  for award_row in
    select award.* from public.event_live_reward_awards award
    where award.status in ('queued','retry') and award.next_retry_at<=now() and award.attempts<12
      and (p_event_id is null or award.event_id=p_event_id)
    order by award.created_at for update skip locked
  loop
    begin
      update public.event_live_reward_awards set status='processing',attempts=attempts+1,updated_at=now()
        where id=award_row.id;
      insert into public.merchant_wallets(owner_user_id) values(award_row.user_id)
        on conflict(owner_user_id) do nothing;
      select wallet.id into wallet_id_value from public.merchant_wallets wallet
        where wallet.owner_user_id=award_row.user_id;
      entry_id_value=public.post_gold_leaves_entry(
        p_wallet_id=>wallet_id_value,p_entry_type=>'adjustment',p_leaves_delta=>award_row.amount,
        p_source=>'live_tasting',p_source_reference=>award_row.event_id::text,
        p_idempotency_key=>award_row.idempotency_key,
        p_description=>'Gold Leaves earned for completing a live tea tasting',
        p_metadata=>jsonb_build_object('event_id',award_row.event_id,'reward_type',award_row.reward_type,'rule_version',award_row.rule_version),
        p_allow_negative_balance=>false
      );
      update public.event_live_reward_awards set status='awarded',canonical_entry_id=entry_id_value,
        awarded_at=coalesce(awarded_at,now()),last_error_code=null,updated_at=now() where id=award_row.id;
      awarded_count=awarded_count+1;
    exception when others then
      update public.event_live_reward_awards set status='retry',attempts=attempts+1,last_error_code=sqlstate,
        next_retry_at=now()+make_interval(secs=>least(3600,60*(award_row.attempts+1))),updated_at=now()
        where id=award_row.id;
      retry_count=retry_count+1;
    end;
  end loop;
  return jsonb_build_object('awarded',awarded_count,'retry',retry_count);
end $$;

CREATE FUNCTION public.queue_live_tasting_completion_rewards(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;settings_row public.event_live_reward_settings;
  policy_row public.live_tasting_reward_policies;participant_row public.participants;
  queued_count integer:=0;award_amount integer;
begin
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if event_row.status<>'completed' or event_row.phase<>'ended' then raise exception 'event_not_complete'; end if;
  select * into settings_row from public.event_live_reward_settings where event_id=p_event_id;
  if settings_row.event_id is null or not settings_row.reward_mode_enabled then
    return jsonb_build_object('queued',0,'reward_mode_enabled',false);
  end if;
  select * into policy_row from public.live_tasting_reward_policies where id=settings_row.policy_id;
  if policy_row.id is null then raise exception 'reward_policy_unavailable'; end if;
  award_amount=least(policy_row.event_completion_leaves,policy_row.max_leaves_per_participant_event);

  for participant_row in
    select participant.* from public.participants participant
    where participant.event_id=p_event_id and participant.user_id is not null and participant.status<>'removed'
      and (
        exists(select 1 from public.event_live_reward_completion_overrides completion_override
          where completion_override.event_id=p_event_id and completion_override.participant_id=participant.id)
        or (
          participant.joined_at is not null and participant.last_seen_at is not null
          and extract(epoch from (participant.last_seen_at-participant.joined_at))>=policy_row.minimum_presence_seconds
          and exists(
            select 1 from public.tea_responses response
            join public.event_flight_items flight_item on flight_item.id=response.event_flight_item_id
            where response.participant_id=participant.id and flight_item.event_id=p_event_id
              and response.completed_at is not null
          )
        )
      )
  loop
    insert into public.event_live_reward_awards(
      event_id,participant_id,user_id,reward_type,amount,rule_version,idempotency_key
    ) values(
      p_event_id,participant_row.id,participant_row.user_id,'event_complete',award_amount,policy_row.rule_version,
      format('live-tasting:%s:%s:event-complete:%s',p_event_id,participant_row.id,policy_row.rule_version)
    ) on conflict(event_id,user_id,reward_type) do nothing;
    if found then queued_count=queued_count+1; end if;
  end loop;
  return jsonb_build_object('queued',queued_count,'reward_mode_enabled',true,'rule_version',policy_row.rule_version);
end $$;

CREATE FUNCTION public.recalculate_discovery_identities(p_user_id uuid, p_source_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  definition record;
  metrics jsonb;
  identity_id uuid;
  newly_earned uuid[] := '{}';
  qualifies boolean;
  distinct_count integer;
  secondary_count integer;
  v_evidence_summary text;
  related_teas jsonb;
  v_evidence jsonb;
  criteria_kind text;
  idempotency text;
begin
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'discovery_user_unavailable';
  end if;
  if p_source_event_id is not null and not exists(select 1 from public.events where id=p_source_event_id and status='completed') then
    raise exception 'discovery_event_incomplete';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,39));
  insert into public.user_discovery_profiles(user_id) values(p_user_id) on conflict(user_id) do nothing;
  metrics:=public.discovery_metrics_for_user(p_user_id);

  for definition in
    select * from public.discovery_identity_definitions where active order by sort_order
  loop
    qualifies:=false;
    distinct_count:=0;
    secondary_count:=0;
    related_teas:='[]'::jsonb;
    criteria_kind:=definition.criteria->>'kind';

    if criteria_kind='tea_type_breadth' then
      distinct_count:=(metrics->>'teas_explored')::integer;
      secondary_count:=(metrics->>'tea_type_count')::integer;
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer
        and secondary_count>=(definition.criteria->>'minimum_types')::integer;
      v_evidence_summary:=format('You have explored %s distinct teas across %s tea types.',distinct_count,secondary_count);
    elsif criteria_kind='origin_breadth' then
      distinct_count:=(metrics->>'origin_count')::integer;
      qualifies:=distinct_count>=(definition.criteria->>'minimum_origins')::integer;
      v_evidence_summary:=format('Your tasting history includes %s distinct growing origins.',distinct_count);
    elsif criteria_kind='tea_type_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where lower(coalesce(history.tea_type,'')) like '%'||lower(definition.criteria->>'tea_type_pattern')||'%';
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have recorded %s distinct %s tea%s.',distinct_count,definition.criteria->>'tea_type_pattern',case when distinct_count=1 then '' else 's' end);
    elsif criteria_kind='tea_type_group_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where exists (
        select 1 from jsonb_array_elements_text(definition.criteria->'tea_type_patterns') pattern(value)
        where lower(coalesce(history.tea_type,'')) like '%'||lower(pattern.value)||'%'
      );
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have recorded %s distinct herbal, tisane or rooibos cups.',distinct_count);
    elsif criteria_kind='descriptor_category_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where (definition.criteria->>'descriptor_category')=any(history.descriptor_categories);
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('%s notes have appeared in your own journal across %s distinct tea%s.',definition.criteria->>'descriptor_category',distinct_count,case when distinct_count=1 then '' else 's' end);
    elsif criteria_kind='live_event_history' then
      select count(distinct history.source_event_id),count(distinct history.tea_key)
      into secondary_count,distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where history.source_event_id is not null;
      qualifies:=secondary_count>=(definition.criteria->>'minimum_live_events')::integer
        and distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have completed tasting cards for %s teas across %s live tasting tables.',distinct_count,secondary_count);
    else
      raise exception 'discovery_unknown_criteria_kind';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'teaKey',recent.tea_key,'teaName',recent.tea_name,'origin',recent.origin,
      'completedAt',recent.completed_at,'source',recent.source_kind
    ) order by recent.completed_at desc),'[]'::jsonb)
    into related_teas
    from (
      select distinct on (history.tea_key)
        history.tea_key,history.tea_name,history.origin,history.completed_at,history.source_kind
      from public.authoritative_discovery_history(p_user_id) history
      where
        criteria_kind in ('tea_type_breadth','origin_breadth')
        or (criteria_kind='live_event_history' and history.source_event_id is not null)
        or (criteria_kind='tea_type_depth' and lower(coalesce(history.tea_type,'')) like '%'||lower(definition.criteria->>'tea_type_pattern')||'%')
        or (criteria_kind='tea_type_group_depth' and exists(
          select 1 from jsonb_array_elements_text(definition.criteria->'tea_type_patterns') pattern(value)
          where lower(coalesce(history.tea_type,'')) like '%'||lower(pattern.value)||'%'
        ))
        or (criteria_kind='descriptor_category_depth' and (definition.criteria->>'descriptor_category')=any(history.descriptor_categories))
      order by history.tea_key,history.completed_at desc
    ) recent;
    related_teas:=coalesce((select jsonb_agg(item) from (select item from jsonb_array_elements(related_teas) item limit 6) limited),'[]'::jsonb);

    v_evidence:=jsonb_build_object(
      'currentlyConfirmed',qualifies,
      'contributingTeaCount',distinct_count,
      'secondaryCount',secondary_count,
      'relatedTeas',related_teas,
      'criteria',definition.criteria,
      'criteriaVersion',definition.criteria_version,
      'sourceMetricsVersion',definition.source_metrics_version,
      'calculatedAt',clock_timestamp()
    );

    select earned.id into identity_id
    from public.user_discovery_identities earned
    where earned.user_id=p_user_id and earned.identity_definition_id=definition.id;

    if qualifies then
      if identity_id is null then
        insert into public.user_discovery_identities(
          user_id,identity_definition_id,criteria_version,source_metrics_version,
          earned_event_id,evidence_summary,evidence
        ) values(
          p_user_id,definition.id,definition.criteria_version,definition.source_metrics_version,
          p_source_event_id,v_evidence_summary,v_evidence
        ) returning id into identity_id;
        newly_earned:=array_append(newly_earned,identity_id);
      else
        update public.user_discovery_identities set
          evidence_summary=v_evidence_summary,
          evidence=v_evidence,
          last_confirmed_at=clock_timestamp(),
          last_evaluated_at=clock_timestamp()
        where id=identity_id;
      end if;
    elsif identity_id is not null then
      -- Earned identity stays in the collection; corrected history only changes
      -- its transparent current-confirmation state.
      update public.user_discovery_identities set
        evidence_summary=v_evidence_summary,
        evidence=v_evidence,
        last_evaluated_at=clock_timestamp()
      where id=identity_id;
    end if;
  end loop;

  idempotency:=case when p_source_event_id is not null
    then format('event:%s:user:%s:discovery-v1',p_source_event_id,p_user_id)
    else format('profile:%s:day:%s:discovery-v1',p_user_id,current_date)
  end;
  insert into public.discovery_identity_recalculations as audit(
    user_id,source_event_id,source_metrics_version,idempotency_key,metrics,newly_earned_identity_ids
  ) values(p_user_id,p_source_event_id,'discovery-v1',idempotency,metrics,newly_earned)
  on conflict(idempotency_key) do update set
    metrics=excluded.metrics,
    newly_earned_identity_ids=case
      when cardinality(audit.newly_earned_identity_ids)>0
        then audit.newly_earned_identity_ids
      else excluded.newly_earned_identity_ids
    end,
    recalculated_at=clock_timestamp();

  return jsonb_build_object('metrics',metrics,'newIdentityIds',to_jsonb(newly_earned));
end $$;

CREATE FUNCTION public.set_my_discovery_identity_preferences(p_identity_id uuid, p_featured boolean, p_hidden boolean) RETURNS public.user_discovery_identities
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  owner_id uuid:=auth.uid();
  target public.user_discovery_identities;
begin
  if owner_id is null then raise exception 'discovery_authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,39));
  select * into target from public.user_discovery_identities
    where id=p_identity_id and user_id=owner_id for update;
  if not found then raise exception 'discovery_identity_unavailable'; end if;
  if p_featured and not p_hidden and (
    select count(*) from public.user_discovery_identities
    where user_id=owner_id and id<>p_identity_id and is_featured and hidden_at is null
  )>=2 then raise exception 'discovery_feature_limit'; end if;

  update public.user_discovery_identities set
    is_featured=case when p_hidden then false else p_featured end,
    hidden_at=case when p_hidden then coalesce(hidden_at,clock_timestamp()) else null end,
    visibility='private'
  where id=p_identity_id and user_id=owner_id
  returning * into target;
  return target;
end $$;

CREATE FUNCTION public.set_my_discovery_reveal_preference(p_enabled boolean) RETURNS public.user_discovery_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result public.user_discovery_profiles;
begin
  if auth.uid() is null then raise exception 'discovery_authentication_required'; end if;
  insert into public.user_discovery_profiles(user_id,identity_reveals_enabled)
  values(auth.uid(),p_enabled)
  on conflict(user_id) do update set identity_reveals_enabled=excluded.identity_reveals_enabled
  returning * into result;
  return result;
end $$;

CREATE FUNCTION public.apply_event_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e public.events;
  lease public.host_control_leases;
  current_item public.event_flight_items;
  next_item public.event_flight_items;
  current_question public.trivia_questions;
  next_question public.trivia_questions;
  target_phase public.session_phase;
  trivia_is_closed boolean;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id, auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease from public.host_control_leases where event_id=p_event_id for update;
  if lease.holder_user_id <> auth.uid() or lease.lease_token <> p_lease_token or lease.expires_at <= now() then raise exception 'lease_lost'; end if;
  if e.sequence_number <> p_expected_sequence then raise exception 'stale_sequence'; end if;
  if e.phase='ended' then raise exception 'event_ended'; end if;
  if e.current_flight_item_id is not null then
    select * into current_item from public.event_flight_items where id=e.current_flight_item_id and event_id=p_event_id;
  end if;
  if e.current_trivia_question_id is not null then
    select * into current_question from public.trivia_questions
      where id=e.current_trivia_question_id and event_flight_item_id=e.current_flight_item_id;
  end if;
  trivia_is_closed := e.trivia_closes_at is not null and e.trivia_closes_at <= now();

  case p_command
    when 'open_session' then
      if e.phase <> 'lobby' or e.status <> 'scheduled' then raise exception 'illegal_phase'; end if;
      if exists(select 1 from public.event_readiness(p_event_id) where not met) then raise exception 'not_ready'; end if;
      select * into current_item from public.event_flight_items where event_id=p_event_id order by position limit 1;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      update public.participants set status='admitted', joined_at=coalesce(joined_at,now()) where event_id=p_event_id and status in ('registered','waiting');
      target_phase='welcome';
      e.status='live';
      e.current_flight_item_id=current_item.id;
      e.current_trivia_question_id=null;
      e.tasting_opened_flight_item_id=null;
      e.reveal_at=null;

    when 'reveal_tea' then
      if not (
        e.phase='welcome'
        or (e.phase='tasting' and e.current_flight_item_id is distinct from e.tasting_opened_flight_item_id)
      ) then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      target_phase='reveal';
      e.current_trivia_question_id=null;
      e.reveal_at=now()+interval '1200 milliseconds';
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_timer' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      if e.phase='reveal' and (e.reveal_at is null or now() < e.reveal_at+interval '1400 milliseconds') then raise exception 'reveal_in_progress'; end if;
      target_phase='brewing';
      e.timer_started_at=now();
      e.timer_ends_at=now()+make_interval(secs=>current_item.steep_seconds);

    when 'open_tasting' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      if e.phase='reveal' and (e.reveal_at is null or now() < e.reveal_at+interval '1400 milliseconds') then raise exception 'reveal_in_progress'; end if;
      target_phase='tasting';
      e.tasting_opened_flight_item_id=current_item.id;
      e.timer_started_at=null;
      e.timer_ends_at=null;

    when 'open_trivia' then
      if e.phase <> 'tasting' or e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'illegal_phase'; end if;
      select * into next_question from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id
          and (current_question.id is null or position>current_question.position)
        order by position limit 1;
      if next_question.id is null then
        if current_question.id is null then raise exception 'trivia_missing'; end if;
        raise exception 'trivia_complete';
      end if;
      target_phase='trivia';
      e.current_trivia_question_id=next_question.id;
      e.trivia_opened_at=now();
      e.trivia_closes_at=now()+make_interval(secs=>next_question.answer_window_seconds);

    when 'close_trivia' then
      if e.phase <> 'trivia' or current_question.id is null then raise exception 'illegal_phase'; end if;
      target_phase='trivia';
      e.trivia_closes_at=now();

    when 'return_to_tasting' then
      if e.phase <> 'trivia' or not trivia_is_closed then raise exception 'trivia_open'; end if;
      target_phase='tasting';

    when 'next_tea' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if current_question.id is null or exists(
        select 1 from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id and position>current_question.position
      ) then raise exception 'trivia_incomplete'; end if;
      select * into next_item from public.event_flight_items
        where event_id=p_event_id and position>current_item.position order by position limit 1;
      if next_item.id is null then raise exception 'last_tea'; end if;
      target_phase='tasting';
      e.current_flight_item_id=next_item.id;
      e.current_trivia_question_id=null;
      e.reveal_at=null;
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_recap' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if current_question.id is null or exists(
        select 1 from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id and position>current_question.position
      ) then raise exception 'trivia_incomplete'; end if;
      if exists(select 1 from public.event_flight_items where event_id=p_event_id and position>current_item.position) then raise exception 'not_last_tea'; end if;
      target_phase='recap';

    when 'end_session' then
      if e.phase='lobby' then raise exception 'not_open'; end if;
      target_phase='ended';
      e.status='completed';
      e.completed_at=now();
      e.ends_at=coalesce(e.ends_at,now());
      update public.participants set delete_after=now()+interval '90 days' where event_id=p_event_id and user_id is null;
      update public.participant_tokens set expires_at=now()+interval '90 days' where participant_id in (select id from public.participants where event_id=p_event_id and user_id is null);

    else raise exception 'unknown_command';
  end case;

  e.phase=target_phase;
  e.sequence_number=e.sequence_number+1;
  e.updated_at=now();
  update public.events set
    status=e.status,
    phase=e.phase,
    sequence_number=e.sequence_number,
    current_flight_item_id=e.current_flight_item_id,
    current_trivia_question_id=e.current_trivia_question_id,
    tasting_opened_flight_item_id=e.tasting_opened_flight_item_id,
    reveal_at=e.reveal_at,
    timer_started_at=e.timer_started_at,
    timer_ends_at=e.timer_ends_at,
    trivia_opened_at=e.trivia_opened_at,
    trivia_closes_at=e.trivia_closes_at,
    completed_at=e.completed_at,
    ends_at=e.ends_at,
    updated_at=e.updated_at
  where id=e.id returning * into e;

  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
  values(e.id,e.sequence_number,p_command,e.phase,auth.uid(),jsonb_build_object(
    'current_flight_item_id',e.current_flight_item_id,
    'current_trivia_question_id',e.current_trivia_question_id,
    'tasting_opened_flight_item_id',e.tasting_opened_flight_item_id,
    'reveal_at',e.reveal_at,
    'timer_ends_at',e.timer_ends_at
  ));

  if p_command='end_session' then
    delete from public.host_control_leases where event_id=p_event_id;
  end if;
  return e;
end $$;

CREATE FUNCTION public.event_readiness(p_event_id uuid) RETURNS TABLE(key text, met boolean, message text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with e as (select * from public.events where id = p_event_id),
  f as (select * from public.event_flight_items where event_id = p_event_id),
  q as (select tq.* from public.trivia_questions tq join f on f.id = tq.event_flight_item_id)
  select 'title', exists(select 1 from e where length(trim(title)) >= 3), 'Event title is set.' union all
  select 'starts_at', exists(select 1 from e where starts_at is not null), 'Start time is set.' union all
  select 'location', exists(select 1 from e where location_mode='remote' or (location_mode='in_person' and venue_name is not null and venue_address is not null)), 'Event format details are complete.' union all
  select 'capacity', exists(select 1 from e where capacity between 1 and 100), 'Capacity is valid.' union all
  select 'host', exists(select 1 from e join public.profiles p on p.id=e.host_user_id where p.role in ('host','admin')), 'Host is assigned.' union all
  select 'backup', exists(select 1 from e join public.profiles p on p.id=e.backup_host_user_id where p.role in ('host','admin') and e.backup_host_user_id <> e.host_user_id), 'Backup host is assigned.' union all
  select 'flight', exists(select 1 from f), 'At least one tea is in the flight.' union all
  select 'steep', exists(select 1 from f) and not exists(select 1 from f where steep_seconds is null or steep_seconds < 1), 'Every tea has a steep time.' union all
  select 'reveal', exists(select 1 from f) and not exists(select 1 from f where length(trim(reveal_description)) = 0), 'Every tea has reveal text.' union all
  select 'brewing', exists(select 1 from f) and not exists(select 1 from f where length(trim(brewing_instructions)) = 0), 'Every tea has brewing guidance.' union all
  select 'trivia', exists(select 1 from f) and not exists(
    select 1 from f
    where (select count(*) from q where q.event_flight_item_id=f.id) not between 1 and 10
      or exists(
        select 1 from q
        where q.event_flight_item_id=f.id
          and (length(trim(q.question))=0 or not public.valid_trivia_options(q.options,q.correct_index))
      )
  ), 'Every tea has 1 to 10 complete trivia questions.' union all
  select 'invite', exists(select 1 from e where invite_code is not null), 'Invite code is active.';
$$;

CREATE FUNCTION public.save_event_bundle(p_event jsonb, p_flight jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_event_id uuid := nullif(p_event->>'id','')::uuid;
  saved_id uuid;
  flight_item jsonb;
  trivia jsonb;
  trivia_item jsonb;
  saved_flight_id uuid;
  event_slug text;
  event_invite text;
  position_no integer := 0;
  trivia_position integer;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.profiles where id=(p_event->>'host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_host'; end if;
  if nullif(p_event->>'backup_host_user_id','') is not null and not exists(select 1 from public.profiles where id=(p_event->>'backup_host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_backup'; end if;
  if jsonb_typeof(p_flight) <> 'array' then raise exception 'invalid_flight'; end if;
  event_slug := coalesce(nullif(p_event->>'slug',''), lower(regexp_replace(p_event->>'title','[^a-zA-Z0-9]+','-','g')) || '-' || substr(encode(gen_random_bytes(4),'hex'),1,6));
  event_invite := coalesce(nullif(p_event->>'invite_code',''), upper(substr(encode(gen_random_bytes(6),'hex'),1,10)));

  if v_event_id is null then
    insert into public.events(title,slug,invite_code,status,location_mode,starts_at,timezone,capacity,venue_name,venue_address,video_call_url,owner_user_id,host_user_id,backup_host_user_id)
    values(
      trim(p_event->>'title'), event_slug, event_invite, coalesce((p_event->>'status')::public.event_status,'draft'),
      (p_event->>'location_mode')::public.location_mode, (p_event->>'starts_at')::timestamptz,
      coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'), (p_event->>'capacity')::integer,
      nullif(p_event->>'venue_name',''), nullif(p_event->>'venue_address',''), nullif(p_event->>'video_call_url',''),
      auth.uid(), (p_event->>'host_user_id')::uuid, nullif(p_event->>'backup_host_user_id','')::uuid
    ) returning id into saved_id;
  else
    if not public.can_manage_event(v_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
    if exists(select 1 from public.events e where e.id=v_event_id and e.status in ('live','completed','cancelled')) then raise exception 'event_locked'; end if;
    update public.events e set
      title=trim(p_event->>'title'), slug=event_slug, invite_code=event_invite,
      status=coalesce((p_event->>'status')::public.event_status,status), location_mode=(p_event->>'location_mode')::public.location_mode,
      starts_at=(p_event->>'starts_at')::timestamptz, timezone=coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'),
      capacity=(p_event->>'capacity')::integer, venue_name=nullif(p_event->>'venue_name',''), venue_address=nullif(p_event->>'venue_address',''),
      video_call_url=nullif(p_event->>'video_call_url',''), host_user_id=(p_event->>'host_user_id')::uuid,
      backup_host_user_id=nullif(p_event->>'backup_host_user_id','')::uuid
    where e.id=v_event_id returning e.id into saved_id;
    delete from public.event_flight_items fi where fi.event_id=saved_id;
  end if;

  for flight_item in select value from jsonb_array_elements(p_flight) loop
    position_no := position_no + 1;
    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)
    values(
      saved_id, (flight_item->>'tea_id')::uuid, position_no,
      coalesce(nullif(flight_item->>'reveal_title',''), (select name from public.teas where id=(flight_item->>'tea_id')::uuid)),
      coalesce(flight_item->>'reveal_description',''), coalesce(flight_item->>'brewing_instructions',''),
      (flight_item->>'steep_seconds')::integer, nullif(flight_item->>'temperature_c','')::numeric,
      nullif(flight_item->>'leaf_grams','')::numeric, nullif(flight_item->>'water_ml','')::integer
    ) returning id into saved_flight_id;

    trivia := flight_item->'trivia';
    if jsonb_typeof(trivia)='object' then
      trivia := jsonb_build_array(trivia);
    elsif trivia is not null and jsonb_typeof(trivia) not in ('array','null') then
      raise exception 'invalid_trivia';
    end if;
    if jsonb_typeof(trivia)='array' then
      if jsonb_array_length(trivia) > 10 then raise exception 'trivia_limit'; end if;
      trivia_position := 0;
      for trivia_item in select value from jsonb_array_elements(trivia) loop
        trivia_position := trivia_position + 1;
        insert into public.trivia_questions(event_flight_item_id,position,question,options,correct_index,explanation,answer_window_seconds)
        values(
          saved_flight_id,
          trivia_position,
          coalesce(trivia_item->>'question',''),
          coalesce(trivia_item->'options','["",""]'::jsonb),
          coalesce((trivia_item->>'correct_index')::integer,0),
          nullif(trivia_item->>'explanation',''),
          coalesce((trivia_item->>'answer_window_seconds')::integer,20)
        );
      end loop;
    end if;
  end loop;

  if (select count(*) from public.event_flight_items fi where fi.event_id=saved_id) > 0 then
    update public.events e set
      current_flight_item_id=(select fi.id from public.event_flight_items fi where fi.event_id=saved_id order by position limit 1),
      current_trivia_question_id=null
    where id=saved_id;
  end if;
  if coalesce(p_event->>'status','draft')='scheduled' and exists(select 1 from public.event_readiness(saved_id) where not met) then raise exception 'not_ready'; end if;
  return saved_id;
end $$;

CREATE FUNCTION public.post_gold_leaves_entry(p_wallet_id uuid, p_entry_type text, p_leaves_delta bigint, p_source text, p_source_reference text, p_idempotency_key text, p_description text DEFAULT ''::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_allow_negative_balance boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  existing_entry public.merchant_ledger_entries%rowtype;
  wallet public.merchant_wallets%rowtype;
  next_balance bigint;
  new_entry_id uuid;
begin
  if p_leaves_delta = 0 then
    raise exception using errcode = '22023', message = 'A Gold Leaves entry cannot have a zero value.';
  end if;
  if p_entry_type not in (
    'woocommerce_earn', 'woocommerce_redeem', 'woocommerce_redeem_release',
    'woocommerce_refund_reversal', 'adjustment'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported Gold Leaves entry type.';
  end if;
  if char_length(coalesce(p_source, '')) < 1
     or char_length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception using errcode = '22023', message = 'A source and idempotency key are required.';
  end if;

  select entry.* into existing_entry
  from public.merchant_ledger_entries entry
  where entry.source = p_source and entry.idempotency_key = p_idempotency_key;
  if found then
    if existing_entry.wallet_id = p_wallet_id
      and existing_entry.entry_type = p_entry_type
      and existing_entry.leaves_delta = p_leaves_delta
      and existing_entry.source_reference is not distinct from p_source_reference
    then
      return existing_entry.id;
    end if;
    raise exception using errcode = '23505', message = 'The idempotency key was already used for a different Gold Leaves operation.';
  end if;

  select current_wallet.* into wallet
  from public.merchant_wallets current_wallet
  where current_wallet.id = p_wallet_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The Gold Leaves wallet was not found.';
  end if;

  -- Re-check after the wallet lock so simultaneous retries return one entry.
  select entry.* into existing_entry
  from public.merchant_ledger_entries entry
  where entry.source = p_source and entry.idempotency_key = p_idempotency_key;
  if found then
    if existing_entry.wallet_id = p_wallet_id
      and existing_entry.entry_type = p_entry_type
      and existing_entry.leaves_delta = p_leaves_delta
      and existing_entry.source_reference is not distinct from p_source_reference
    then
      return existing_entry.id;
    end if;
    raise exception using errcode = '23505', message = 'The idempotency key was already used for a different Gold Leaves operation.';
  end if;

  next_balance := wallet.balance + p_leaves_delta;
  -- Credits may reduce an existing refund debt without clearing it in one step.
  -- Only a debit needs permission to take or keep a balance below zero.
  if p_leaves_delta < 0 and next_balance < 0 and not coalesce(p_allow_negative_balance, false) then
    raise exception using errcode = '22003', message = 'The wallet has insufficient Gold Leaves.';
  end if;

  insert into public.merchant_ledger_entries (
    wallet_id, transaction_id, entry_type, leaves_delta, balance_after,
    description, metadata, source, source_reference, idempotency_key
  ) values (
    wallet.id, extensions.gen_random_uuid(), p_entry_type, p_leaves_delta,
    next_balance, coalesce(p_description, ''), coalesce(p_metadata, '{}'::jsonb),
    p_source, p_source_reference, p_idempotency_key
  ) returning id into new_entry_id;

  update public.merchant_wallets
  set balance = next_balance, updated_at = now()
  where id = wallet.id;
  return new_entry_id;
end;
$$;

CREATE FUNCTION public.ensure_current_customer() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception using errcode = 'P0002', message = 'Your Vintage Fork profile is not ready yet.';
  end if;
  insert into public.merchant_wallets (owner_user_id) values (current_user_id)
  on conflict (owner_user_id) do nothing;
  return current_user_id;
end;
$$;

CREATE FUNCTION public.get_my_loyalty_summary() RETURNS TABLE(customer_id uuid, account_id uuid, account_status text, points_balance bigint, points_label text, earning_enabled boolean, redemption_enabled boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  return query
  select profile.id, wallet.id, 'active'::text, wallet.balance,
    case when wallet.balance = 1 then 'Gold Leaf' else 'Gold Leaves' end,
    true, true
  from public.profiles profile
  join public.merchant_wallets wallet on wallet.owner_user_id = profile.id
  where profile.id = current_user_id;
end;
$$;

CREATE FUNCTION public.get_mobile_loyalty_summary(p_mobile_auth_user_id uuid) RETURNS TABLE(owner_user_id uuid, wallet_id uuid, points_balance bigint, points_label text, earning_enabled boolean, redemption_enabled boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select link.owner_user_id, wallet.id, wallet.balance,
    case when wallet.balance = 1 then 'Gold Leaf' else 'Gold Leaves' end,
    true, true
  from public.mobile_customer_links link
  join public.merchant_wallets wallet on wallet.owner_user_id = link.owner_user_id
  where link.mobile_auth_user_id = p_mobile_auth_user_id;
$$;

CREATE FUNCTION public.get_wordpress_loyalty_summary(p_wordpress_user_id bigint) RETURNS TABLE(owner_user_id uuid, wallet_id uuid, points_balance bigint, points_label text, earning_enabled boolean, redemption_enabled boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select link.owner_user_id, wallet.id, wallet.balance,
    case when wallet.balance = 1 then 'Gold Leaf' else 'Gold Leaves' end,
    true, true
  from public.wordpress_customer_links link
  join public.merchant_wallets wallet on wallet.owner_user_id = link.owner_user_id
  where link.wordpress_user_id = p_wordpress_user_id;
$$;

CREATE FUNCTION public.register_mobile_customer(p_mobile_auth_user_id uuid, p_owner_user_id uuid, p_email text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare existing_owner_user_id uuid;
begin
  if p_mobile_auth_user_id is null or p_owner_user_id is null then
    raise exception using errcode = '22023', message = 'Both mobile and Vintage Fork user IDs are required.';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_owner_user_id) then
    raise exception using errcode = 'P0002', message = 'The linked Vintage Fork profile was not found.';
  end if;

  select link.owner_user_id into existing_owner_user_id
  from public.mobile_customer_links link
  where link.mobile_auth_user_id = p_mobile_auth_user_id;
  if existing_owner_user_id is not null and existing_owner_user_id <> p_owner_user_id then
    raise exception using errcode = '23505', message = 'This mobile account is already linked to another Vintage Fork profile.';
  end if;
  if exists (
    select 1 from public.mobile_customer_links link
    where link.owner_user_id = p_owner_user_id
      and link.mobile_auth_user_id <> p_mobile_auth_user_id
  ) then
    raise exception using errcode = '23505', message = 'This Vintage Fork profile is already linked to another mobile account.';
  end if;

  insert into public.mobile_customer_links (
    mobile_auth_user_id, owner_user_id, email_at_link
  ) values (
    p_mobile_auth_user_id, p_owner_user_id, nullif(lower(trim(p_email)), '')
  )
  on conflict (mobile_auth_user_id) do update
    set email_at_link = coalesce(excluded.email_at_link, public.mobile_customer_links.email_at_link),
        updated_at = now();

  insert into public.merchant_wallets (owner_user_id)
  values (p_owner_user_id)
  on conflict (owner_user_id) do nothing;
  return p_owner_user_id;
end;
$$;

CREATE FUNCTION public.register_wordpress_customer(p_wordpress_user_id bigint, p_owner_user_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  resolved_owner_user_id uuid := p_owner_user_id;
  existing_owner_user_id uuid;
begin
  if p_wordpress_user_id is null or p_wordpress_user_id <= 0 then
    raise exception using errcode = '22023', message = 'A valid WordPress customer ID is required.';
  end if;

  if resolved_owner_user_id is not null and not exists (
    select 1 from public.profiles profile where profile.id = resolved_owner_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'The linked Vintage Fork profile was not found.';
  end if;

  if resolved_owner_user_id is null then
    select users.id into resolved_owner_user_id
    from auth.users users
    where users.raw_user_meta_data ->> 'wordpress_user_id' = p_wordpress_user_id::text
       or users.raw_user_meta_data ->> 'vintagefork_wordpress_user_id' = p_wordpress_user_id::text
    order by users.created_at
    limit 1;
  end if;

  if resolved_owner_user_id is null and nullif(trim(p_email), '') is not null then
    select users.id into resolved_owner_user_id
    from auth.users users
    where lower(users.email) = lower(trim(p_email))
      and users.email_confirmed_at is not null
    order by users.created_at
    limit 1;
  end if;

  if resolved_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'The WordPress customer has not been linked to Vintage Fork yet.';
  end if;

  select link.owner_user_id into existing_owner_user_id
  from public.wordpress_customer_links link
  where link.wordpress_user_id = p_wordpress_user_id;

  if existing_owner_user_id is not null and existing_owner_user_id <> resolved_owner_user_id then
    raise exception using errcode = '23505', message = 'This WordPress customer is already linked to another Vintage Fork profile.';
  end if;

  if exists (
    select 1 from public.wordpress_customer_links link
    where link.owner_user_id = resolved_owner_user_id
      and link.wordpress_user_id <> p_wordpress_user_id
  ) then
    raise exception using errcode = '23505', message = 'This Vintage Fork profile is already linked to another WordPress customer.';
  end if;

  insert into public.wordpress_customer_links (
    wordpress_user_id, owner_user_id, email_at_link
  ) values (
    p_wordpress_user_id, resolved_owner_user_id, nullif(lower(trim(p_email)), '')
  )
  on conflict (wordpress_user_id) do update
    set email_at_link = coalesce(excluded.email_at_link, public.wordpress_customer_links.email_at_link),
        updated_at = now();

  insert into public.merchant_wallets (owner_user_id)
  values (resolved_owner_user_id)
  on conflict (owner_user_id) do nothing;

  return resolved_owner_user_id;
end;
$$;

CREATE FUNCTION public.apply_woocommerce_loyalty_refund(p_order_reference text, p_refund_reference text, p_cumulative_refunded_eligible_cents bigint, p_idempotency_key text, p_cancelled boolean DEFAULT false) RETURNS TABLE(earned_points_reversed bigint, redeemed_points_released bigint, current_balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  loyalty_order public.woocommerce_loyalty_orders%rowtype;
  target_earned_reversal bigint;
  target_redeemed_release bigint;
  earned_delta bigint;
  redeemed_delta bigint;
begin
  select orders.* into loyalty_order
  from public.woocommerce_loyalty_orders orders
  where orders.order_reference = p_order_reference
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The WooCommerce loyalty order was not found.';
  end if;
  if p_cumulative_refunded_eligible_cents < loyalty_order.refunded_eligible_spend_cents
     or p_cumulative_refunded_eligible_cents > loyalty_order.eligible_spend_cents then
    raise exception using errcode = '22023', message = 'The cumulative eligible refund amount is invalid.';
  end if;

  target_earned_reversal := loyalty_order.points_earned
    - floor(greatest(0, loyalty_order.eligible_spend_cents - p_cumulative_refunded_eligible_cents)::numeric / 100)::bigint;
  if loyalty_order.eligible_spend_cents = 0 then
    target_redeemed_release := 0;
  elsif p_cumulative_refunded_eligible_cents = loyalty_order.eligible_spend_cents then
    target_redeemed_release := loyalty_order.points_redeemed;
  else
    target_redeemed_release := floor(
      loyalty_order.points_redeemed::numeric
      * p_cumulative_refunded_eligible_cents::numeric
      / loyalty_order.eligible_spend_cents::numeric
    )::bigint;
  end if;

  earned_delta := target_earned_reversal - loyalty_order.earned_points_reversed;
  redeemed_delta := target_redeemed_release - loyalty_order.redeemed_points_released;

  if earned_delta > 0 then
    perform public.post_gold_leaves_entry(
      p_wallet_id => loyalty_order.wallet_id,
      p_entry_type => 'woocommerce_refund_reversal',
      p_leaves_delta => -earned_delta,
      p_source => 'woocommerce_refund',
      p_source_reference => p_refund_reference,
      p_idempotency_key => p_idempotency_key || ':earn',
      p_description => 'Gold Leaves reversed after a Vintage Fork refund',
      p_metadata => jsonb_build_object(
        'order_reference', p_order_reference,
        'cumulative_refunded_eligible_cents', p_cumulative_refunded_eligible_cents
      ),
      p_allow_negative_balance => true
    );
  end if;

  if redeemed_delta > 0 then
    perform public.post_gold_leaves_entry(
      p_wallet_id => loyalty_order.wallet_id,
      p_entry_type => 'woocommerce_redeem_release',
      p_leaves_delta => redeemed_delta,
      p_source => 'woocommerce_refund',
      p_source_reference => p_refund_reference,
      p_idempotency_key => p_idempotency_key || ':redeem',
      p_description => 'Redeemed Gold Leaves restored after a Vintage Fork refund',
      p_metadata => jsonb_build_object(
        'order_reference', p_order_reference,
        'cumulative_refunded_eligible_cents', p_cumulative_refunded_eligible_cents
      )
    );
  end if;

  update public.woocommerce_loyalty_orders
  set refunded_eligible_spend_cents = p_cumulative_refunded_eligible_cents,
      earned_points_reversed = target_earned_reversal,
      redeemed_points_released = target_redeemed_release,
      status = case
        when p_cancelled then 'cancelled'
        when p_cumulative_refunded_eligible_cents = eligible_spend_cents then 'refunded'
        else 'partially_refunded'
      end,
      updated_at = now()
  where order_reference = p_order_reference;

  earned_points_reversed := target_earned_reversal;
  redeemed_points_released := target_redeemed_release;
  select wallet.balance into current_balance
  from public.merchant_wallets wallet where wallet.id = loyalty_order.wallet_id;
  return next;
end;
$$;

CREATE FUNCTION public.award_woocommerce_order_gold_leaves(p_wordpress_user_id bigint, p_order_reference text, p_eligible_spend_cents bigint, p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(entry_id uuid, points_awarded bigint, current_balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  link public.wordpress_customer_links%rowtype;
  wallet public.merchant_wallets%rowtype;
  loyalty_order public.woocommerce_loyalty_orders%rowtype;
  calculated_points bigint;
  new_entry_id uuid;
begin
  if p_eligible_spend_cents < 0 then
    raise exception using errcode = '22023', message = 'Eligible spend cannot be negative.';
  end if;
  calculated_points := floor(p_eligible_spend_cents::numeric / 100)::bigint;

  select customer_link.* into link
  from public.wordpress_customer_links customer_link
  where customer_link.wordpress_user_id = p_wordpress_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The WordPress customer is not linked to Gold Leaves.';
  end if;
  select current_wallet.* into wallet
  from public.merchant_wallets current_wallet
  where current_wallet.owner_user_id = link.owner_user_id;

  insert into public.woocommerce_loyalty_orders (
    order_reference, wordpress_user_id, wallet_id, eligible_spend_cents
  ) values (
    p_order_reference, p_wordpress_user_id, wallet.id, p_eligible_spend_cents
  )
  on conflict (order_reference) do nothing;

  select orders.* into loyalty_order
  from public.woocommerce_loyalty_orders orders
  where orders.order_reference = p_order_reference
  for update;
  if loyalty_order.wordpress_user_id <> p_wordpress_user_id
     or loyalty_order.eligible_spend_cents <> p_eligible_spend_cents then
    raise exception using errcode = '23505', message = 'This WooCommerce order already has different earning details.';
  end if;

  if loyalty_order.points_earned > 0 or calculated_points = 0 then
    select entry.id into new_entry_id
    from public.merchant_ledger_entries entry
    where entry.source = 'woocommerce_order'
      and entry.idempotency_key = p_idempotency_key;
  else
    new_entry_id := public.post_gold_leaves_entry(
      p_wallet_id => wallet.id,
      p_entry_type => 'woocommerce_earn',
      p_leaves_delta => calculated_points,
      p_source => 'woocommerce_order',
      p_source_reference => p_order_reference,
      p_idempotency_key => p_idempotency_key,
      p_description => 'Gold Leaves earned from eligible Vintage Fork spend',
      p_metadata => coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'wordpress_user_id', p_wordpress_user_id,
          'eligible_spend_cents', p_eligible_spend_cents,
          'earn_rate', '1 Gold Leaf per CAD $1'
        )
    );
  end if;

  update public.woocommerce_loyalty_orders
  set points_earned = calculated_points, status = 'paid', updated_at = now()
  where order_reference = p_order_reference;

  entry_id := new_entry_id;
  points_awarded := calculated_points;
  select current_wallet.balance into current_balance
  from public.merchant_wallets current_wallet where current_wallet.id = wallet.id;
  return next;
end;
$_$;

CREATE FUNCTION public.reserve_woocommerce_gold_leaves(p_wordpress_user_id bigint, p_order_reference text, p_eligible_spend_cents bigint, p_requested_points bigint, p_idempotency_key text) RETURNS TABLE(entry_id uuid, points_redeemed bigint, remaining_balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  link public.wordpress_customer_links%rowtype;
  wallet public.merchant_wallets%rowtype;
  loyalty_order public.woocommerce_loyalty_orders%rowtype;
  new_entry_id uuid;
begin
  if p_requested_points <= 0 then
    raise exception using errcode = '22023', message = 'Redeemed Gold Leaves must be positive.';
  end if;
  if p_eligible_spend_cents < 0 or p_requested_points > p_eligible_spend_cents then
    raise exception using errcode = '22023', message = 'Gold Leaves cannot exceed the eligible merchandise total.';
  end if;

  select customer_link.* into link
  from public.wordpress_customer_links customer_link
  where customer_link.wordpress_user_id = p_wordpress_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The WordPress customer is not linked to Gold Leaves.';
  end if;
  select current_wallet.* into wallet
  from public.merchant_wallets current_wallet
  where current_wallet.owner_user_id = link.owner_user_id;

  select orders.* into loyalty_order
  from public.woocommerce_loyalty_orders orders
  where orders.order_reference = p_order_reference
  for update;
  if found then
    if loyalty_order.wordpress_user_id <> p_wordpress_user_id
       or loyalty_order.eligible_spend_cents <> p_eligible_spend_cents
       or loyalty_order.points_redeemed <> p_requested_points then
      raise exception using errcode = '23505', message = 'This WooCommerce order already has different Gold Leaves details.';
    end if;
    select entry.id into new_entry_id
    from public.merchant_ledger_entries entry
    where entry.source = 'woocommerce_checkout'
      and entry.idempotency_key = p_idempotency_key;
    entry_id := new_entry_id;
    points_redeemed := loyalty_order.points_redeemed;
    select current_wallet.balance into remaining_balance
    from public.merchant_wallets current_wallet where current_wallet.id = wallet.id;
    return next;
    return;
  end if;

  insert into public.woocommerce_loyalty_orders (
    order_reference, wordpress_user_id, wallet_id, eligible_spend_cents,
    points_redeemed, redeemed_value_cents
  ) values (
    p_order_reference, p_wordpress_user_id, wallet.id, p_eligible_spend_cents,
    p_requested_points, p_requested_points
  );

  new_entry_id := public.post_gold_leaves_entry(
    p_wallet_id => wallet.id,
    p_entry_type => 'woocommerce_redeem',
    p_leaves_delta => -p_requested_points,
    p_source => 'woocommerce_checkout',
    p_source_reference => p_order_reference,
    p_idempotency_key => p_idempotency_key,
    p_description => 'Gold Leaves redeemed at Vintage Fork checkout',
    p_metadata => jsonb_build_object(
      'wordpress_user_id', p_wordpress_user_id,
      'eligible_spend_cents', p_eligible_spend_cents,
      'redemption_value_cents', p_requested_points
    )
  );

  entry_id := new_entry_id;
  points_redeemed := p_requested_points;
  select current_wallet.balance into remaining_balance
  from public.merchant_wallets current_wallet where current_wallet.id = wallet.id;
  return next;
end;
$$;

CREATE FUNCTION public.complete_tasting_session(p_session_id uuid, p_operation_id uuid, p_expected_revision integer) RETURNS public.tasting_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_card public.tasting_cards;
  v_operation public.tea_lab_operations;
  v_card_count integer;
  v_fingerprint text := format('complete:%s',p_expected_revision);
  v_completed_at timestamptz := clock_timestamp();
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;
  if p_expected_revision is null or p_expected_revision < 1 then raise exception 'tea_lab_invalid_revision'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));

  select * into v_operation from public.tea_lab_operations
  where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'complete_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_session from public.tasting_sessions
      where id=p_session_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_session_not_found'; end if;
    return v_session;
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_session_not_found'; end if;

  if v_session.status='completed' then
    insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
    values(p_operation_id,v_owner_id,'complete_session',p_session_id,v_fingerprint,
      jsonb_build_object('status','completed','session_revision',v_session.revision));
    return v_session;
  end if;

  if v_session.kind<>'solo' then raise exception 'tea_lab_unsupported_session_kind'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'; end if;

  select count(*) into v_card_count from public.tasting_cards
    where session_id=p_session_id and owner_user_id=v_owner_id;
  if v_card_count<>1 then raise exception 'tea_lab_solo_requires_one_card'; end if;

  select * into v_card from public.tasting_cards
    where session_id=p_session_id and owner_user_id=v_owner_id for update;
  if v_card.rating is null then raise exception 'tea_lab_rating_required'; end if;

  update public.tasting_cards set
    completed_at=coalesce(completed_at,v_completed_at),
    revision=revision+1,
    updated_at=now()
  where id=v_card.id and owner_user_id=v_owner_id;

  update public.tasting_sessions set
    status='completed',
    completed_at=v_completed_at,
    revision=revision+1,
    updated_at=now()
  where id=p_session_id and owner_user_id=v_owner_id
  returning * into v_session;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(p_operation_id,v_owner_id,'complete_session',p_session_id,v_fingerprint,
    jsonb_build_object('status','completed','session_revision',v_session.revision));

  return v_session;
end $$;

CREATE FUNCTION public.save_solo_tasting_session(p_session_id uuid, p_card_id uuid, p_operation_id uuid, p_expected_revision integer, p_tea jsonb, p_card jsonb, p_brewing jsonb, p_private_notes jsonb, p_descriptor_ids uuid[]) RETURNS public.tasting_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_card public.tasting_cards;
  v_existing_card public.tasting_cards;
  v_personal public.personal_tea_records;
  v_tea public.teas;
  v_operation public.tea_lab_operations;
  v_descriptor_ids uuid[] := coalesce(p_descriptor_ids,array[]::uuid[]);
  v_descriptor_count integer;
  v_distinct_descriptor_count integer;
  v_valid_descriptor_count integer;
  v_tea_kind text := p_tea->>'kind';
  v_canonical_tea_id uuid;
  v_personal_tea_id uuid;
  v_tea_name text;
  v_producer text;
  v_origin text;
  v_tea_type text;
  v_cultivar text;
  v_harvest text;
  v_product_identifier text;
  v_lot_code text;
  v_created boolean := false;
  v_fingerprint text := encode(digest(jsonb_build_object(
    'expected_revision',p_expected_revision,
    'card_id',p_card_id,
    'tea',coalesce(p_tea,'{}'::jsonb),
    'card',coalesce(p_card,'{}'::jsonb),
    'brewing',coalesce(p_brewing,'{}'::jsonb),
    'private_notes',coalesce(p_private_notes,'{}'::jsonb),
    'descriptor_ids',to_jsonb(coalesce(p_descriptor_ids,array[]::uuid[]))
  )::text,'sha256'),'hex');
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_session_id is null or p_card_id is null or p_operation_id is null then
    raise exception 'tea_lab_invalid_operation_id';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'tea_lab_invalid_revision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,1));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'sync_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_session from public.tasting_sessions
      where id=p_session_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_session_not_found'; end if;
    return v_session;
  end if;

  v_descriptor_count := cardinality(v_descriptor_ids);
  select count(distinct descriptor_id) into v_distinct_descriptor_count
    from unnest(v_descriptor_ids) as selected(descriptor_id);
  select count(*) into v_valid_descriptor_count from public.flavor_descriptors
    where id=any(v_descriptor_ids) and active;
  if v_descriptor_count>5
    or v_distinct_descriptor_count<>v_descriptor_count
    or v_valid_descriptor_count<>v_descriptor_count then
    raise exception 'tea_lab_invalid_descriptors';
  end if;

  if v_tea_kind='canonical' then
    v_canonical_tea_id := nullif(p_tea->>'canonicalTeaId','')::uuid;
    if v_canonical_tea_id is null then raise exception 'tea_lab_invalid_tea'; end if;
    select * into v_tea from public.teas
      where id=v_canonical_tea_id and retired_at is null;
    if not found then raise exception 'tea_lab_canonical_tea_not_found'; end if;
    v_tea_name := v_tea.name;
    v_producer := v_tea.producer;
    v_origin := v_tea.origin;
    v_tea_type := v_tea.tea_type;
  elsif v_tea_kind='personal' then
    v_personal_tea_id := nullif(p_tea->>'personalTeaId','')::uuid;
    v_tea_name := nullif(trim(p_tea->>'name'),'');
    v_producer := nullif(trim(p_tea->>'producer'),'');
    v_origin := nullif(trim(p_tea->>'origin'),'');
    v_tea_type := nullif(trim(p_tea->>'teaType'),'');
    v_cultivar := nullif(trim(p_tea->>'cultivar'),'');
    v_harvest := nullif(trim(p_tea->>'harvest'),'');
    v_product_identifier := nullif(trim(p_tea->>'productIdentifier'),'');
    v_lot_code := nullif(trim(p_tea->>'lotCode'),'');
    if v_personal_tea_id is null or v_tea_name is null then raise exception 'tea_lab_invalid_tea'; end if;

    select * into v_personal from public.personal_tea_records
      where id=v_personal_tea_id for update;
    if found and v_personal.owner_user_id<>v_owner_id then
      raise exception 'tea_lab_personal_tea_not_found';
    end if;

    insert into public.personal_tea_records(
      id,owner_user_id,name,producer,origin,tea_type,cultivar,harvest,product_identifier,lot_code
    ) values (
      v_personal_tea_id,v_owner_id,v_tea_name,v_producer,v_origin,v_tea_type,
      v_cultivar,v_harvest,v_product_identifier,v_lot_code
    ) on conflict(id) do update set
      name=excluded.name,
      producer=excluded.producer,
      origin=excluded.origin,
      tea_type=excluded.tea_type,
      cultivar=excluded.cultivar,
      harvest=excluded.harvest,
      product_identifier=excluded.product_identifier,
      lot_code=excluded.lot_code,
      updated_at=now()
    where personal_tea_records.owner_user_id=v_owner_id;
  else
    raise exception 'tea_lab_invalid_tea';
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id for update;
  if found then
    if v_session.owner_user_id<>v_owner_id then raise exception 'tea_lab_session_not_found'; end if;
    if v_session.kind<>'solo' then raise exception 'tea_lab_unsupported_session_kind'; end if;
    if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'; end if;
  else
    if p_expected_revision<>0 then raise exception 'tea_lab_stale_revision'; end if;
    insert into public.tasting_sessions(id,owner_user_id,kind,status,revision)
      values(p_session_id,v_owner_id,'solo','in_progress',1)
      returning * into v_session;
    v_created := true;
  end if;

  select * into v_existing_card from public.tasting_cards
    where session_id=p_session_id limit 1 for update;
  if found and v_existing_card.id<>p_card_id then raise exception 'tea_lab_card_id_conflict'; end if;

  select * into v_card from public.tasting_cards where id=p_card_id for update;
  if found and (v_card.owner_user_id<>v_owner_id or v_card.session_id<>p_session_id) then
    raise exception 'tea_lab_card_id_conflict';
  end if;
  if v_session.status='completed' and (p_card->>'rating') is null then
    raise exception 'tea_lab_rating_required';
  end if;

  insert into public.tasting_cards(
    id,session_id,owner_user_id,position,canonical_tea_id,personal_tea_record_id,
    tea_name_snapshot,producer_snapshot,origin_snapshot,tea_type_snapshot,
    cultivar_snapshot,harvest_snapshot,product_identifier_snapshot,lot_code_snapshot,
    rating,intensity
  ) values (
    p_card_id,p_session_id,v_owner_id,1,v_canonical_tea_id,v_personal_tea_id,
    v_tea_name,v_producer,v_origin,v_tea_type,v_cultivar,v_harvest,v_product_identifier,v_lot_code,
    (p_card->>'rating')::integer,nullif(p_card->>'intensity','')
  ) on conflict(id) do update set
    canonical_tea_id=excluded.canonical_tea_id,
    personal_tea_record_id=excluded.personal_tea_record_id,
    tea_name_snapshot=excluded.tea_name_snapshot,
    producer_snapshot=excluded.producer_snapshot,
    origin_snapshot=excluded.origin_snapshot,
    tea_type_snapshot=excluded.tea_type_snapshot,
    cultivar_snapshot=excluded.cultivar_snapshot,
    harvest_snapshot=excluded.harvest_snapshot,
    product_identifier_snapshot=excluded.product_identifier_snapshot,
    lot_code_snapshot=excluded.lot_code_snapshot,
    rating=excluded.rating,
    intensity=excluded.intensity,
    revision=tasting_cards.revision+1,
    updated_at=now()
  where tasting_cards.owner_user_id=v_owner_id and tasting_cards.session_id=p_session_id
  returning * into v_card;
  if not found then raise exception 'tea_lab_card_id_conflict'; end if;

  if num_nonnulls(
    (p_brewing->>'leafGrams')::numeric,
    (p_brewing->>'waterMl')::integer,
    (p_brewing->>'waterTemperatureC')::numeric,
    nullif(p_brewing->>'waterSource',''),
    nullif(p_brewing->>'vessel',''),
    (p_brewing->>'initialSteepSeconds')::integer
  )=0 then
    delete from public.brewing_setups where card_id=p_card_id and owner_user_id=v_owner_id;
  else
    insert into public.brewing_setups(
      card_id,owner_user_id,leaf_grams,water_ml,water_temperature_c,water_source,vessel,initial_steep_seconds
    ) values (
      p_card_id,v_owner_id,(p_brewing->>'leafGrams')::numeric,(p_brewing->>'waterMl')::integer,
      (p_brewing->>'waterTemperatureC')::numeric,nullif(p_brewing->>'waterSource',''),
      nullif(p_brewing->>'vessel',''),(p_brewing->>'initialSteepSeconds')::integer
    ) on conflict(card_id) do update set
      leaf_grams=excluded.leaf_grams,
      water_ml=excluded.water_ml,
      water_temperature_c=excluded.water_temperature_c,
      water_source=excluded.water_source,
      vessel=excluded.vessel,
      initial_steep_seconds=excluded.initial_steep_seconds,
      updated_at=now()
    where brewing_setups.owner_user_id=v_owner_id;
  end if;

  if num_nonnulls(
    nullif(p_private_notes->>'firstImpression',''),
    nullif(p_private_notes->>'personalNotes','')
  )=0 then
    delete from public.tasting_card_private_notes where card_id=p_card_id and owner_user_id=v_owner_id;
  else
    insert into public.tasting_card_private_notes(card_id,owner_user_id,first_impression,personal_notes)
    values(
      p_card_id,v_owner_id,nullif(p_private_notes->>'firstImpression',''),
      nullif(p_private_notes->>'personalNotes','')
    ) on conflict(card_id) do update set
      first_impression=excluded.first_impression,
      personal_notes=excluded.personal_notes,
      updated_at=now()
    where tasting_card_private_notes.owner_user_id=v_owner_id;
  end if;

  delete from public.tasting_card_descriptors where card_id=p_card_id and owner_user_id=v_owner_id;
  insert into public.tasting_card_descriptors(card_id,descriptor_id,owner_user_id,position)
    select p_card_id,descriptor_id,v_owner_id,ordinality::integer
    from unnest(v_descriptor_ids) with ordinality as selected(descriptor_id,ordinality);

  if not v_created then
    update public.tasting_sessions set
      status=case when status='completed' then status else 'in_progress' end,
      revision=revision+1,
      updated_at=now()
    where id=p_session_id and owner_user_id=v_owner_id
    returning * into v_session;
  end if;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(
    p_operation_id,v_owner_id,'sync_session',p_session_id,v_fingerprint,
    jsonb_build_object('status',v_session.status,'session_revision',v_session.revision)
  );
  return v_session;
end $$;

CREATE FUNCTION public.save_solo_tasting_session_v2(p_session_id uuid, p_card_id uuid, p_operation_id uuid, p_expected_revision integer, p_tea jsonb, p_card jsonb, p_brewing jsonb, p_private_notes jsonb, p_descriptor_ids uuid[]) RETURNS public.tasting_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_style text := nullif(trim(p_brewing->>'style'),'');
  v_preparation_notes text := nullif(p_brewing->>'preparationNotes','');
  v_stages jsonb := coalesce(p_brewing->'stages','[]'::jsonb);
  v_stage jsonb;
  v_stage_number bigint;
  v_stage_count integer;
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if coalesce(jsonb_typeof(p_brewing),'object')<>'object' then
    raise exception 'tea_lab_invalid_brewing';
  end if;
  if v_style is not null and v_style not in (
    'western','tea_bag','grandpa','bowl','gongfu','chaozhou_gongfu','sencha_kyusu','gyokuro',
    'matcha_usucha','matcha_koicha','cold_brew','flash_chilled','koridashi','masala_chai','karak_chai',
    'turkish_cay','moroccan_mint','samovar','kashmiri_kahwa','hong_kong_milk_tea','herbal_decoction','custom'
  ) then raise exception 'tea_lab_invalid_brewing_style'; end if;
  if v_preparation_notes is not null and char_length(v_preparation_notes)>1200 then
    raise exception 'tea_lab_invalid_brewing_notes';
  end if;
  if jsonb_typeof(v_stages)<>'array' then raise exception 'tea_lab_invalid_brew_stages'; end if;
  v_stage_count := jsonb_array_length(v_stages);
  if v_stage_count>20 then raise exception 'tea_lab_invalid_brew_stages'; end if;

  for v_stage,v_stage_number in
    select stage.value,stage.ordinality
    from jsonb_array_elements(v_stages) with ordinality as stage(value,ordinality)
  loop
    if jsonb_typeof(v_stage)<>'object'
      or nullif(trim(v_stage->>'label'),'') is null
      or char_length(trim(v_stage->>'label'))>80
      or (v_stage->>'notes') is not null and char_length(v_stage->>'notes')>600 then
      raise exception 'tea_lab_invalid_brew_stage';
    end if;
  end loop;

  -- The original operation owns revision checking, idempotency, tea snapshots, and core brew fields.
  -- Its request fingerprint already covers the complete p_brewing document, including v2 fields.
  v_session := public.save_solo_tasting_session(
    p_session_id,p_card_id,p_operation_id,p_expected_revision,p_tea,p_card,
    p_brewing,p_private_notes,p_descriptor_ids
  );

  if v_session.owner_user_id<>v_owner_id then raise exception 'tea_lab_session_not_found'; end if;

  if v_style is not null or v_preparation_notes is not null or v_stage_count>0 then
    insert into public.brewing_setups(card_id,owner_user_id,brewing_style,preparation_notes)
    values(p_card_id,v_owner_id,v_style,v_preparation_notes)
    on conflict(card_id) do update set
      brewing_style=excluded.brewing_style,
      preparation_notes=excluded.preparation_notes,
      updated_at=now()
    where brewing_setups.owner_user_id=v_owner_id;
  else
    update public.brewing_setups set
      brewing_style=null,
      preparation_notes=null,
      updated_at=now()
    where card_id=p_card_id and owner_user_id=v_owner_id;
  end if;

  delete from public.tasting_card_brew_stages
    where card_id=p_card_id and owner_user_id=v_owner_id;
  insert into public.tasting_card_brew_stages(
    card_id,owner_user_id,stage_number,label,duration_seconds,temperature_c,notes
  )
  select
    p_card_id,v_owner_id,stage.ordinality::integer,trim(stage.value->>'label'),
    nullif(stage.value->>'durationSeconds','')::integer,
    nullif(stage.value->>'temperatureC','')::numeric,
    nullif(stage.value->>'notes','')
  from jsonb_array_elements(v_stages) with ordinality as stage(value,ordinality);

  return v_session;
end $$;

CREATE FUNCTION public.delete_tasting_session(p_session_id uuid, p_operation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_operation public.tea_lab_operations;
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'delete_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>'delete' then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    return true;
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_session_not_found'; end if;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(p_operation_id,v_owner_id,'delete_session',p_session_id,'delete',jsonb_build_object('deleted',true));

  delete from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id;
  return true;
end $$;

CREATE FUNCTION public.set_personal_tea_record_archived(p_personal_tea_id uuid, p_operation_id uuid, p_archived boolean) RETURNS public.personal_tea_records
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_owner_id uuid := auth.uid();
  v_tea public.personal_tea_records;
  v_operation public.tea_lab_operations;
  v_fingerprint text := format('archive_personal_tea:%s',p_archived);
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_personal_tea_id is null or p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_personal_tea_id::text,1));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'archive_personal_tea'
      or v_operation.target_id<>p_personal_tea_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_tea from public.personal_tea_records
      where id=p_personal_tea_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_personal_tea_not_found'; end if;
    return v_tea;
  end if;

  select * into v_tea from public.personal_tea_records
    where id=p_personal_tea_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_personal_tea_not_found'; end if;

  update public.personal_tea_records set
    archived_at=case when p_archived then coalesce(archived_at,clock_timestamp()) else null end,
    updated_at=now()
  where id=p_personal_tea_id and owner_user_id=v_owner_id
  returning * into v_tea;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(
    p_operation_id,v_owner_id,'archive_personal_tea',p_personal_tea_id,v_fingerprint,
    jsonb_build_object('archived',p_archived)
  );
  return v_tea;
end $$;

CREATE FUNCTION public.set_tasting_session_archived(p_session_id uuid, p_operation_id uuid, p_expected_revision integer, p_archived boolean) RETURNS public.tasting_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_operation public.tea_lab_operations;
  v_fingerprint text := format('archive:%s:%s',p_expected_revision,p_archived);
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;
  if p_expected_revision is null or p_expected_revision<1 then raise exception 'tea_lab_invalid_revision'; end if;
  if p_archived is null then raise exception 'tea_lab_invalid_archive_state'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'archive_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_session from public.tasting_sessions
      where id=p_session_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_session_not_found'; end if;
    return v_session;
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_session_not_found'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'; end if;

  update public.tasting_sessions set
    archived_at=case when p_archived then coalesce(archived_at,clock_timestamp()) else null end,
    revision=revision+1,
    updated_at=now()
  where id=p_session_id and owner_user_id=v_owner_id
  returning * into v_session;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(
    p_operation_id,v_owner_id,'archive_session',p_session_id,v_fingerprint,
    jsonb_build_object('archived',p_archived,'session_revision',v_session.revision)
  );
  return v_session;
end $$;

CREATE FUNCTION public.scrub_deleted_participant_live_content() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.event_reactions where participant_id=old.id;
  delete from public.event_chat_messages where participant_id=old.id;
  update public.event_breakout_rooms set snapshot=null,snapshot_submitted_by=null,snapshot_submitted_at=null,updated_at=now()
    where snapshot_submitted_by=old.id;
  delete from public.room_discovery_card_items where created_by=old.id or attribution_participant_id=old.id;
  update public.room_discovery_cards set
    participant_ids=array_remove(participant_ids,old.id),
    room_quote=case when room_quote_participant_id=old.id then null else room_quote end,
    room_quote_attributed=case when room_quote_participant_id=old.id then false else room_quote_attributed end,
    room_quote_participant_id=case when room_quote_participant_id=old.id then null else room_quote_participant_id end,
    spokesperson_participant_id=case when spokesperson_participant_id=old.id then null else spokesperson_participant_id end,
    spokesperson_state=case when spokesperson_participant_id=old.id then 'none' else spokesperson_state end,
    updated_at=now()
    where old.id=any(participant_ids) or room_quote_participant_id=old.id or spokesperson_participant_id=old.id;
  return old;
end $$;

CREATE FUNCTION public.release_late_tasting_stamp_after_host_progress() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  event_status public.event_status;
  event_current_flight_item_id uuid;
begin
  if new.completed_at is null or new.stamp_released_at is not null then
    return new;
  end if;

  select event.status, event.current_flight_item_id
  into event_status, event_current_flight_item_id
  from public.event_flight_items flight
  join public.events event on event.id = flight.event_id
  where flight.id = new.event_flight_item_id;

  if event_status = 'completed'
    or event_current_flight_item_id is distinct from new.event_flight_item_id then
    new.stamp_released_at = clock_timestamp();
  end if;

  return new;
end $$;

CREATE FUNCTION public.release_tasting_stamps_on_host_progress() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if old.current_flight_item_id is not null
    and old.current_flight_item_id is distinct from new.current_flight_item_id then
    update public.tea_responses response
    set stamp_released_at = coalesce(response.stamp_released_at, clock_timestamp())
    where response.event_flight_item_id = old.current_flight_item_id
      and response.completed_at is not null
      and response.stamp_released_at is null;
  end if;

  if new.status = 'completed' and old.status is distinct from new.status then
    update public.tea_responses response
    set stamp_released_at = coalesce(response.stamp_released_at, new.completed_at, clock_timestamp())
    where response.completed_at is not null
      and response.stamp_released_at is null
      and exists (
        select 1
        from public.event_flight_items flight
        where flight.id = response.event_flight_item_id
          and flight.event_id = new.id
      );
  end if;

  return new;
end $$;

CREATE FUNCTION public.can_manage_event(p_event_id uuid, uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1 from public.events e join public.profiles p on p.id = uid
    where e.id = p_event_id
      and (p.role = 'admin' or uid in (e.owner_user_id, e.host_user_id, e.backup_host_user_id))
  );
$$;

CREATE FUNCTION public.is_staff(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(select 1 from public.profiles where id = uid and role in ('host','admin'));
$$;

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;

CREATE FUNCTION public.resolve_merchant_catalog_tea() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.canonical_tea_id is null then
    select tea.id into new.canonical_tea_id
    from public.teas tea
    where tea.retired_at is null and lower(trim(tea.name)) = lower(trim(new.product_name))
    order by tea.created_at
    limit 1;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

CREATE FUNCTION public.guard_active_breakout_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.current_breakout_session_id is not null
    and new.current_breakout_session_id=old.current_breakout_session_id
    and exists(select 1 from public.event_breakout_sessions breakout_session where breakout_session.id=old.current_breakout_session_id and breakout_session.status in ('preparing','active','returning'))
    and (new.conductor_stage is distinct from old.conductor_stage
      or new.current_flight_item_id is distinct from old.current_flight_item_id
      or new.phase is distinct from old.phase
      or new.status is distinct from old.status)
  then raise exception 'breakout_active';
  end if;
  return new;
end $$;

CREATE FUNCTION public.validate_tea_response_scope() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare participant_event uuid; flight_event uuid;
begin
  select event_id into participant_event from public.participants where id=new.participant_id;
  select event_id into flight_event from public.event_flight_items where id=new.event_flight_item_id;
  if participant_event is null or flight_event is null or participant_event <> flight_event then raise exception 'response_event_mismatch'; end if;
  return new;
end $$;

CREATE FUNCTION public.gold_leaves_activate_store_v1(p_store_profile_id uuid, p_owner_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE u auth.users%rowtype; h public.gold_leaves_identity_migration_v1%rowtype;
 w public.merchant_wallets%rowtype; connected_wallet_id uuid; is_historical boolean; has_durable_link boolean;
BEGIN
 IF p_store_profile_id IS NULL OR p_owner_user_id IS NULL THEN RAISE EXCEPTION 'identity_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gold_leaves_identity_migration_audit_v1 WHERE id) THEN
  RAISE EXCEPTION 'migration_snapshot_required';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gold-leaves:native-enrollment:'||p_store_profile_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('gold-leaves:owner-enrollment:'||p_owner_user_id::text,0));
 SELECT * INTO u FROM auth.users WHERE id=p_owner_user_id FOR SHARE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR coalesce(u.is_anonymous,false)
  OR coalesce(u.banned_until>statement_timestamp(),false) OR nullif(btrim(u.email),'') IS NULL THEN
  RAISE EXCEPTION 'owner_unavailable';
 END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_owner_user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_ready'; END IF;
 SELECT * INTO h FROM public.gold_leaves_identity_migration_v1 WHERE owner_user_id=p_owner_user_id FOR UPDATE;
 is_historical:=FOUND AND h.normalized_email=lower(btrim(u.email));
 has_durable_link:=EXISTS(SELECT 1 FROM public.mobile_customer_links WHERE mobile_auth_user_id=p_store_profile_id AND owner_user_id=p_owner_user_id)
  OR EXISTS(SELECT 1 FROM public.gold_leaves_store_links_v1 WHERE store_profile_id=p_store_profile_id AND owner_user_id=p_owner_user_id);
 IF h.status='needs_review' AND NOT has_durable_link THEN RAISE EXCEPTION 'migration_review_required'; END IF;
 IF h.owner_user_id IS NOT NULL AND NOT is_historical AND NOT has_durable_link THEN RAISE EXCEPTION 'owner_email_changed'; END IF;
 IF h.store_profile_id IS NOT NULL AND h.store_profile_id<>p_store_profile_id THEN RAISE EXCEPTION 'identity_conflict'; END IF;
 -- The bridge supplies verified native ownership, or a fresh trusted Auth Admin
 -- import. Historical legacy email confirmation is intentionally not required.
 -- New unconfirmed canonical accounts require immutable service-owned provenance.
 IF u.email_confirmed_at IS NULL AND NOT is_historical AND NOT has_durable_link AND NOT coalesce(
  u.raw_app_meta_data->>'vf_gold_leaves_store_project'='fugvpupuwgbnojkyptym'
  AND u.raw_app_meta_data->>'vf_gold_leaves_store_profile_id'=p_store_profile_id::text,false) THEN
  RAISE EXCEPTION 'canonical_identity_unverified';
 END IF;
 SELECT * INTO w FROM public.merchant_wallets WHERE owner_user_id=p_owner_user_id FOR UPDATE;
 IF h.original_wallet_id IS NOT NULL AND (w.id IS NULL OR w.id<>h.original_wallet_id) THEN
  RAISE EXCEPTION 'historical_wallet_changed';
 END IF;
 INSERT INTO public.merchant_wallets(owner_user_id) VALUES(p_owner_user_id) ON CONFLICT(owner_user_id) DO NOTHING;
 connected_wallet_id:=public.gold_leaves_connect_store_v1(p_store_profile_id,p_owner_user_id);
 SELECT * INTO w FROM public.merchant_wallets WHERE id=connected_wallet_id FOR UPDATE;
 IF w.owner_user_id IS DISTINCT FROM p_owner_user_id THEN RAISE EXCEPTION 'identity_conflict'; END IF;
 UPDATE public.gold_leaves_identity_migration_v1 SET store_profile_id=p_store_profile_id,
  status='migrated',last_error=NULL,updated_at=now() WHERE owner_user_id=p_owner_user_id;
 RETURN jsonb_build_object('ownerUserId',p_owner_user_id,'walletId',w.id,'balance',w.balance);
END $$;

CREATE FUNCTION public.gold_leaves_connect_store_v1(p_store_profile_id uuid, p_owner_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE w uuid; existing public.gold_leaves_store_links_v1%rowtype;
BEGIN
 IF p_store_profile_id IS NULL OR p_owner_user_id IS NULL THEN RAISE EXCEPTION 'identity_required'; END IF;
 SELECT id INTO w FROM public.merchant_wallets WHERE owner_user_id=p_owner_user_id;
 IF w IS NULL THEN RAISE EXCEPTION 'existing_wallet_required'; END IF;
 -- Flutter authenticates in the same project as the store. Keep its existing verified crosswalk consistent.
 INSERT INTO public.mobile_customer_links(mobile_auth_user_id,owner_user_id)
 VALUES(p_store_profile_id,p_owner_user_id) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.mobile_customer_links WHERE mobile_auth_user_id=p_store_profile_id AND owner_user_id=p_owner_user_id)
 THEN RAISE EXCEPTION 'mobile_wallet_link_conflict'; END IF;
 INSERT INTO public.gold_leaves_store_links_v1(store_profile_id,owner_user_id,wallet_id)
 VALUES(p_store_profile_id,p_owner_user_id,w) ON CONFLICT DO NOTHING;
 SELECT * INTO existing FROM public.gold_leaves_store_links_v1 WHERE store_profile_id=p_store_profile_id;
 IF NOT FOUND OR existing.owner_user_id<>p_owner_user_id OR existing.wallet_id<>w THEN RAISE EXCEPTION 'wallet_already_connected'; END IF;
 RETURN w;
END $$;

CREATE FUNCTION public.gold_leaves_identity_v1(p_email text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 -- Include every match. A deleted/disabled/current-email-changed historical
 -- identity still blocks treating that email as a genuinely new account.
 WITH requested AS (SELECT nullif(lower(btrim(p_email)),'') AS email),
 candidates AS (
  SELECT u.id FROM auth.users u,requested r WHERE lower(btrim(u.email))=r.email
  UNION
  SELECT h.owner_user_id FROM public.gold_leaves_identity_migration_v1 h,requested r WHERE h.normalized_email=r.email
 )
 SELECT jsonb_build_object('matches',coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'email',coalesce(u.email,h.normalized_email),
  'emailConfirmed',u.email_confirmed_at IS NOT NULL,
  'displayName',coalesce(p.display_name,h.display_name_snapshot,''),
  'disabled',u.id IS NULL OR p.id IS NULL OR u.deleted_at IS NOT NULL OR coalesce(u.is_anonymous,false)
   OR coalesce(u.banned_until>statement_timestamp(),false)
   OR lower(btrim(u.email)) IS DISTINCT FROM r.email,
  'historical',coalesce(h.owner_user_id IS NOT NULL AND h.normalized_email=r.email
   AND lower(btrim(u.email))=r.email,false),
  'reviewRequired',coalesce(h.status='needs_review',false),
  'appMetadata',coalesce(u.raw_app_meta_data,'{}'::jsonb)
 ) ORDER BY c.id),'[]'::jsonb))
 FROM candidates c CROSS JOIN requested r
 LEFT JOIN auth.users u ON u.id=c.id
 LEFT JOIN public.profiles p ON p.id=c.id
 LEFT JOIN public.gold_leaves_identity_migration_v1 h ON h.owner_user_id=c.id;
$$;

CREATE FUNCTION public.gold_leaves_migration_audit_v1() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 WITH original AS (
  SELECT x.* FROM public.gold_leaves_identity_migration_audit_v1 a,
  jsonb_to_recordset(a.wallets_snapshot) AS x(wallet_id uuid,owner_user_id uuid,balance bigint)
 ), comparison AS (
  SELECT count(*) FILTER(WHERE w.id IS NULL) AS missing_wallets,
   count(*) FILTER(WHERE w.id IS NOT NULL AND w.owner_user_id<>o.owner_user_id) AS changed_owners,
   count(*) FILTER(WHERE w.id IS NOT NULL AND w.balance<>o.balance) AS changed_balances,
   coalesce(sum(w.balance),0) AS current_original_wallet_balance_total
  FROM original o LEFT JOIN public.merchant_wallets w ON w.id=o.wallet_id
 )
 SELECT jsonb_build_object(
  'snapshotAt',a.snapshot_at,'originalWalletCount',a.original_wallet_count,
  'originalWalletBalanceTotal',a.original_wallet_balance_total,'originalLedgerCount',a.original_ledger_count,
  'eligibleOwnerCount',a.eligible_owner_count,'eligibleWalletCount',a.eligible_wallet_count,
  'eligibleWalletBalanceTotal',a.eligible_wallet_balance_total,
  'currentWalletCount',(SELECT count(*) FROM public.merchant_wallets),
  'currentWalletBalanceTotal',(SELECT coalesce(sum(balance),0) FROM public.merchant_wallets),
  'currentLedgerCount',(SELECT count(*) FROM public.merchant_ledger_entries),
  'currentOriginalWalletBalanceTotal',c.current_original_wallet_balance_total,
  'missingOriginalWallets',c.missing_wallets,'changedOriginalOwners',c.changed_owners,'changedOriginalBalances',c.changed_balances,
  'statuses',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (
   SELECT status,count(*) AS n FROM public.gold_leaves_identity_migration_v1 GROUP BY status) counts)
 ) FROM public.gold_leaves_identity_migration_audit_v1 a CROSS JOIN comparison c WHERE a.id;
$$;

CREATE FUNCTION public.gold_leaves_migration_batch_v1(p_limit integer DEFAULT 25) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'invalid_migration_batch_limit'; END IF;
 RETURN (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'ownerId',q.owner_user_id,'email',q.normalized_email,
   'displayName',coalesce(p.display_name,q.display_name_snapshot),
   'emailConfirmed',u.email_confirmed_at IS NOT NULL,
   'existingNativeId',coalesce(s.store_profile_id,m.mobile_auth_user_id),
   'identityConflict',m.mobile_auth_user_id IS NOT NULL AND s.store_profile_id IS NOT NULL
    AND m.mobile_auth_user_id<>s.store_profile_id,
   'disabled',u.id IS NULL OR p.id IS NULL OR u.deleted_at IS NOT NULL OR coalesce(u.is_anonymous,false)
    OR coalesce(u.banned_until>statement_timestamp(),false)
    OR (s.store_profile_id IS NULL AND m.mobile_auth_user_id IS NULL
     AND lower(btrim(u.email)) IS DISTINCT FROM q.normalized_email)
  ) ORDER BY q.next_attempt_at,q.owner_user_id),'[]'::jsonb)
  FROM (SELECT * FROM public.gold_leaves_identity_migration_v1
   WHERE status='pending' AND next_attempt_at<=statement_timestamp()
   ORDER BY next_attempt_at,owner_user_id LIMIT p_limit) q
  LEFT JOIN auth.users u ON u.id=q.owner_user_id LEFT JOIN public.profiles p ON p.id=q.owner_user_id
  LEFT JOIN public.mobile_customer_links m ON m.owner_user_id=q.owner_user_id
  LEFT JOIN public.gold_leaves_store_links_v1 s ON s.owner_user_id=q.owner_user_id
 );
END $$;

CREATE FUNCTION public.gold_leaves_migration_result_v1(p_owner_user_id uuid, p_store_profile_id uuid, p_status text, p_error text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE h public.gold_leaves_identity_migration_v1%rowtype; native_id uuid;
BEGIN
 IF p_owner_user_id IS NULL OR p_status IS NULL OR p_status NOT IN('pending','migrated','awaiting_verification','needs_review') THEN
  RAISE EXCEPTION 'invalid_migration_result';
 END IF;
 IF p_error IS NOT NULL AND p_error NOT IN(
  'native_email_unverified','native_email_ambiguous','canonical_email_ambiguous',
  'identity_conflict','owner_unavailable','owner_email_changed','auth_create_failed',
  'profile_not_ready','activation_failed','retry_required') THEN RAISE EXCEPTION 'invalid_migration_error'; END IF;
 SELECT * INTO h FROM public.gold_leaves_identity_migration_v1 WHERE owner_user_id=p_owner_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 native_id:=coalesce(p_store_profile_id,h.store_profile_id);
 IF h.store_profile_id IS NOT NULL AND p_store_profile_id IS NOT NULL AND h.store_profile_id<>p_store_profile_id THEN
  RAISE EXCEPTION 'identity_conflict';
 END IF;
 -- A late failed worker cannot downgrade an already completed migration.
 IF h.status='migrated' AND p_status<>'migrated' THEN RETURN false; END IF;
 -- Confirmation/retry cannot lift an identity quarantine. Existing durable
 -- crosswalk resolution is performed by activation itself; new resolutions
 -- require a separately reviewed future administrative operation.
 IF h.status='needs_review' AND p_status<>'needs_review' THEN RETURN false; END IF;
 IF p_status='migrated' THEN
  IF native_id IS NULL OR p_error IS NOT NULL OR NOT EXISTS(
   SELECT 1 FROM public.gold_leaves_store_links_v1 s
   JOIN public.mobile_customer_links m ON m.mobile_auth_user_id=s.store_profile_id AND m.owner_user_id=s.owner_user_id
   JOIN public.merchant_wallets w ON w.id=s.wallet_id AND w.owner_user_id=s.owner_user_id
   WHERE s.store_profile_id=native_id AND s.owner_user_id=p_owner_user_id
    AND (h.original_wallet_id IS NULL OR h.original_wallet_id=w.id)) THEN RAISE EXCEPTION 'migration_activation_required'; END IF;
 END IF;
 UPDATE public.gold_leaves_identity_migration_v1 SET store_profile_id=native_id,status=p_status,
  -- A recorded incomplete attempt yields its batch slot to later ready rows.
  -- Persist the delay so a restarted worker cannot immediately select it again.
  next_attempt_at=CASE WHEN p_status='pending' THEN statement_timestamp()+interval '5 minutes' ELSE next_attempt_at END,
  last_error=p_error,updated_at=now() WHERE owner_user_id=p_owner_user_id;
 RETURN true;
END $$;

CREATE FUNCTION public.gold_leaves_refund_store_v1(p_order_id uuid, p_cumulative_eligible_cents bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE a public.gold_leaves_store_attempts_v1%rowtype; reversal bigint; restore bigint;
BEGIN
 SELECT * INTO a FROM public.gold_leaves_store_attempts_v1 WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND OR a.status NOT IN('paid','partially_refunded','refunded') OR p_cumulative_eligible_cents IS NULL
 OR p_cumulative_eligible_cents<a.refunded_eligible_cents OR p_cumulative_eligible_cents>a.eligible_cents THEN RAISE EXCEPTION 'invalid_verified_refund'; END IF;
 reversal:=a.leaves_earned-(a.eligible_cents-p_cumulative_eligible_cents)/100;
 restore:=CASE WHEN a.eligible_cents=0 THEN 0 WHEN p_cumulative_eligible_cents=a.eligible_cents THEN a.leaves_redeemed ELSE floor(a.leaves_redeemed::numeric*p_cumulative_eligible_cents/a.eligible_cents)::bigint END;
 IF reversal>a.earned_reversed THEN PERFORM public.post_gold_leaves_entry(a.wallet_id,'adjustment',a.earned_reversed-reversal,'native_store','order:'||p_order_id,'refund-earn:'||p_order_id||':'||p_cumulative_eligible_cents,'Earned Gold Leaves reversed after refund',jsonb_build_object('orderId',p_order_id),true); END IF;
 IF restore>a.redeemed_restored THEN PERFORM public.post_gold_leaves_entry(a.wallet_id,'adjustment',restore-a.redeemed_restored,'native_store','order:'||p_order_id,'refund-restore:'||p_order_id||':'||p_cumulative_eligible_cents,'Redeemed Gold Leaves returned after refund',jsonb_build_object('orderId',p_order_id),false); END IF;
 UPDATE public.gold_leaves_store_attempts_v1 SET refunded_eligible_cents=p_cumulative_eligible_cents,earned_reversed=reversal,redeemed_restored=restore,status=CASE WHEN p_cumulative_eligible_cents=a.eligible_cents THEN 'refunded' ELSE 'partially_refunded' END,updated_at=now() WHERE attempt_id=a.attempt_id;
 RETURN jsonb_build_object('earnedReversed',reversal,'redeemedRestored',restore);
END $$;

CREATE FUNCTION public.gold_leaves_release_store_v1(p_attempt_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE a public.gold_leaves_store_attempts_v1%rowtype;
BEGIN
 IF p_attempt_id IS NULL THEN RAISE EXCEPTION 'attempt_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-gold-leaves:'||p_attempt_id::text,0));
 SELECT * INTO a FROM public.gold_leaves_store_attempts_v1 WHERE attempt_id=p_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 IF a.status='released' THEN RETURN a.leaves_redeemed; END IF;
 IF a.status<>'reserved' OR a.order_id IS NOT NULL THEN RAISE EXCEPTION 'verified_unpaid_attempt_required'; END IF;
 IF a.leaves_redeemed>0 THEN PERFORM public.post_gold_leaves_entry(a.wallet_id,'adjustment',a.leaves_redeemed,'native_store','attempt:'||p_attempt_id,'release:'||p_attempt_id,'Reserved Gold Leaves returned after unpaid checkout',jsonb_build_object('attemptId',p_attempt_id),false); END IF;
 UPDATE public.gold_leaves_store_attempts_v1 SET status='released',updated_at=now() WHERE attempt_id=p_attempt_id;
 RETURN a.leaves_redeemed;
END $$;

CREATE FUNCTION public.gold_leaves_reserve_store_v1(p_store_profile_id uuid, p_attempt_id uuid, p_eligible_cents bigint, p_leaves bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE w uuid; a public.gold_leaves_store_attempts_v1%rowtype;
BEGIN
 IF p_store_profile_id IS NULL OR p_attempt_id IS NULL OR p_eligible_cents IS NULL OR p_leaves IS NULL
 OR p_eligible_cents<0 OR p_eligible_cents>2147483647 OR p_leaves<0 OR p_leaves>p_eligible_cents THEN RAISE EXCEPTION 'invalid_reservation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-gold-leaves:'||p_attempt_id::text,0));
 SELECT * INTO a FROM public.gold_leaves_store_attempts_v1 WHERE attempt_id=p_attempt_id FOR UPDATE;
 IF FOUND THEN
  IF a.store_profile_id<>p_store_profile_id OR a.eligible_cents<>p_eligible_cents OR a.leaves_redeemed<>p_leaves OR a.status='released' THEN RAISE EXCEPTION 'reservation_conflict'; END IF;
  RETURN jsonb_build_object('attemptId',a.attempt_id,'leaves',a.leaves_redeemed,'status',a.status);
 END IF;
 SELECT wallet_id INTO w FROM public.gold_leaves_store_links_v1 WHERE store_profile_id=p_store_profile_id;
 IF w IS NULL THEN
  SELECT public.gold_leaves_connect_store_v1(p_store_profile_id,owner_user_id) INTO w
  FROM public.mobile_customer_links WHERE mobile_auth_user_id=p_store_profile_id;
 END IF;
 IF w IS NULL THEN RAISE EXCEPTION 'connect_gold_leaves_first'; END IF;
 -- Debit at reservation so existing Woo/mobile/marketplace writers see only available Leaves.
 IF p_leaves>0 THEN PERFORM public.post_gold_leaves_entry(w,'adjustment',-p_leaves,'native_store','attempt:'||p_attempt_id,'reserve:'||p_attempt_id,'Gold Leaves reserved for website checkout',jsonb_build_object('store','fugvpupuwgbnojkyptym','attemptId',p_attempt_id),false); END IF;
 INSERT INTO public.gold_leaves_store_attempts_v1(attempt_id,store_profile_id,wallet_id,eligible_cents,leaves_redeemed,status)
 VALUES(p_attempt_id,p_store_profile_id,w,p_eligible_cents,p_leaves,'reserved');
 RETURN jsonb_build_object('attemptId',p_attempt_id,'leaves',p_leaves,'status','reserved');
END $$;

CREATE FUNCTION public.gold_leaves_settle_store_v1(p_attempt_id uuid, p_order_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE a public.gold_leaves_store_attempts_v1%rowtype; earned bigint;
BEGIN
 IF p_attempt_id IS NULL OR p_order_id IS NULL THEN RAISE EXCEPTION 'verified_order_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-gold-leaves:'||p_attempt_id::text,0));
 SELECT * INTO a FROM public.gold_leaves_store_attempts_v1 WHERE attempt_id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR a.status='released' THEN RAISE EXCEPTION 'active_reservation_required'; END IF;
 IF a.order_id IS NOT NULL THEN
  IF a.order_id<>p_order_id THEN RAISE EXCEPTION 'order_conflict'; END IF;
  RETURN a.leaves_earned;
 END IF;
 earned:=a.eligible_cents/100;
 IF earned>0 THEN PERFORM public.post_gold_leaves_entry(a.wallet_id,'adjustment',earned,'native_store','order:'||p_order_id,'earn:'||p_order_id,'Gold Leaves earned from website purchase',jsonb_build_object('store','fugvpupuwgbnojkyptym','orderId',p_order_id,'attemptId',p_attempt_id),false); END IF;
 UPDATE public.gold_leaves_store_attempts_v1 SET order_id=p_order_id,leaves_earned=earned,status='paid',updated_at=now() WHERE attempt_id=p_attempt_id;
 RETURN earned;
END $$;

CREATE FUNCTION public.valid_trivia_options(p_options jsonb, p_correct_index integer) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_typeof(p_options)='array'
    and jsonb_array_length(p_options) between 2 and 4
    and p_correct_index >= 0
    and p_correct_index < jsonb_array_length(p_options)
    and not exists (
      select 1 from jsonb_array_elements_text(p_options) as option_value(value)
      where length(trim(value))=0
    );
$$;
CREATE TRIGGER breakout_members_add_discovery_member AFTER INSERT ON public.event_breakout_members FOR EACH ROW EXECUTE FUNCTION public.add_discovery_card_member();
CREATE TRIGGER breakout_rooms_create_discovery_card AFTER INSERT ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.create_room_discovery_card();
CREATE TRIGGER breakout_rooms_lock_discovery_card AFTER UPDATE OF status ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.lock_room_discovery_card();
CREATE TRIGGER breakout_sessions_create_discovery_presentation AFTER INSERT ON public.event_breakout_sessions FOR EACH ROW EXECUTE FUNCTION public.create_discovery_presentation();
CREATE TRIGGER events_initialize_live_rewards AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.initialize_live_tasting_reward_settings();
CREATE TRIGGER tea_catalog_prices_resolve_tea BEFORE INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.resolve_merchant_catalog_tea();
CREATE TRIGGER tea_catalog_prices_sync_merchant_progress AFTER INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_catalog();
CREATE TRIGGER discovery_identity_definitions_touch BEFORE UPDATE ON public.discovery_identity_definitions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER events_release_tasting_stamps AFTER UPDATE OF current_flight_item_id, status ON public.events FOR EACH ROW EXECUTE FUNCTION public.release_tasting_stamps_on_host_progress();
CREATE TRIGGER participants_scrub_live_content BEFORE DELETE ON public.participants FOR EACH ROW EXECUTE FUNCTION public.scrub_deleted_participant_live_content();
CREATE TRIGGER responses_touch BEFORE UPDATE ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tasting_cards_touch BEFORE UPDATE ON public.tasting_cards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tea_response_scope BEFORE INSERT OR UPDATE OF participant_id, event_flight_item_id ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.validate_tea_response_scope();
CREATE TRIGGER tea_responses_release_late_stamp BEFORE INSERT OR UPDATE OF completed_at, event_flight_item_id ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.release_late_tasting_stamp_after_host_progress();
CREATE TRIGGER user_discovery_identities_touch BEFORE UPDATE ON public.user_discovery_identities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER user_discovery_profiles_touch BEFORE UPDATE ON public.user_discovery_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE ONLY public.discovery_identity_definitions
    ADD CONSTRAINT discovery_identity_definitions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.discovery_identity_definitions
    ADD CONSTRAINT discovery_identity_definitions_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.discovery_identity_definitions
    ADD CONSTRAINT discovery_identity_definitions_sort_order_key UNIQUE (sort_order);
ALTER TABLE ONLY public.discovery_identity_recalculations
    ADD CONSTRAINT discovery_identity_recalculations_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE ONLY public.discovery_identity_recalculations
    ADD CONSTRAINT discovery_identity_recalculations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_breakout_members
    ADD CONSTRAINT event_breakout_members_pkey PRIMARY KEY (session_id, participant_id);
ALTER TABLE ONLY public.event_breakout_rooms
    ADD CONSTRAINT event_breakout_rooms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_breakout_rooms
    ADD CONSTRAINT event_breakout_rooms_session_id_room_number_key UNIQUE (session_id, room_number);
ALTER TABLE ONLY public.event_breakout_sessions
    ADD CONSTRAINT event_breakout_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_brews
    ADD CONSTRAINT event_brews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_sender_key_client_id_key UNIQUE (sender_key, client_id);
ALTER TABLE ONLY public.event_cheers_sessions
    ADD CONSTRAINT event_cheers_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_discovery_presentations
    ADD CONSTRAINT event_discovery_presentations_pkey PRIMARY KEY (breakout_session_id);
ALTER TABLE ONLY public.event_flight_items
    ADD CONSTRAINT event_flight_items_event_id_position_key UNIQUE (event_id, "position");
ALTER TABLE ONLY public.event_flight_items
    ADD CONSTRAINT event_flight_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_group_reveals
    ADD CONSTRAINT event_group_reveals_event_id_event_flight_item_id_key UNIQUE (event_id, event_flight_item_id);
ALTER TABLE ONLY public.event_group_reveals
    ADD CONSTRAINT event_group_reveals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_canonical_entry_id_key UNIQUE (canonical_entry_id);
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_event_id_user_id_reward_type_key UNIQUE (event_id, user_id, reward_type);
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_live_reward_completion_overrides
    ADD CONSTRAINT event_live_reward_completion_overrides_pkey PRIMARY KEY (event_id, participant_id);
ALTER TABLE ONLY public.event_live_reward_settings
    ADD CONSTRAINT event_live_reward_settings_pkey PRIMARY KEY (event_id);
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_sender_key_client_id_key UNIQUE (sender_key, client_id);
ALTER TABLE ONLY public.event_stage_signals
    ADD CONSTRAINT event_stage_signals_pkey PRIMARY KEY (event_id, participant_id, event_flight_item_id, stage);
ALTER TABLE ONLY public.event_state_log
    ADD CONSTRAINT event_state_log_event_id_sequence_number_key UNIQUE (event_id, sequence_number);
ALTER TABLE ONLY public.event_state_log
    ADD CONSTRAINT event_state_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_invite_code_key UNIQUE (invite_code);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.flavor_descriptors
    ADD CONSTRAINT flavor_descriptors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flavor_descriptors
    ADD CONSTRAINT flavor_descriptors_position_key UNIQUE ("position");
ALTER TABLE ONLY public.flavor_descriptors
    ADD CONSTRAINT flavor_descriptors_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.host_control_leases
    ADD CONSTRAINT host_control_leases_pkey PRIMARY KEY (event_id);
ALTER TABLE ONLY public.live_tasting_reward_policies
    ADD CONSTRAINT live_tasting_reward_policies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.live_tasting_reward_policies
    ADD CONSTRAINT live_tasting_reward_policies_rule_version_key UNIQUE (rule_version);
ALTER TABLE ONLY public.living_tasting_map_fingerprints
    ADD CONSTRAINT living_tasting_map_fingerprints_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.living_tasting_map_fingerprints
    ADD CONSTRAINT living_tasting_map_fingerprints_session_id_key UNIQUE (session_id);
ALTER TABLE ONLY public.living_tasting_map_moderation_actions
    ADD CONSTRAINT living_tasting_map_moderation_actions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.living_tasting_map_observation_events
    ADD CONSTRAINT living_tasting_map_observatio_session_id_participant_id_cli_key UNIQUE (session_id, participant_id, client_id);
ALTER TABLE ONLY public.living_tasting_map_observation_events
    ADD CONSTRAINT living_tasting_map_observation_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.living_tasting_map_sessions
    ADD CONSTRAINT living_tasting_map_sessions_event_id_event_flight_item_id_key UNIQUE (event_id, event_flight_item_id);
ALTER TABLE ONLY public.living_tasting_map_sessions
    ADD CONSTRAINT living_tasting_map_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.living_tasting_map_snapshots
    ADD CONSTRAINT living_tasting_map_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_card_progress
    ADD CONSTRAINT merchant_card_progress_id_key UNIQUE (id);
ALTER TABLE ONLY public.merchant_card_progress
    ADD CONSTRAINT merchant_card_progress_pkey PRIMARY KEY (owner_user_id, tea_identity_key);
ALTER TABLE ONLY public.merchant_ledger_entries
    ADD CONSTRAINT merchant_ledger_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_ledger_entries
    ADD CONSTRAINT merchant_ledger_entries_transaction_id_wallet_id_key UNIQUE (transaction_id, wallet_id);
ALTER TABLE ONLY public.merchant_listings
    ADD CONSTRAINT merchant_listings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_reactions
    ADD CONSTRAINT merchant_reactions_owner_user_id_listing_id_reaction_type_key UNIQUE (owner_user_id, listing_id, reaction_type);
ALTER TABLE ONLY public.merchant_reactions
    ADD CONSTRAINT merchant_reactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_study_copies
    ADD CONSTRAINT merchant_study_copies_buyer_id_source_listing_id_key UNIQUE (buyer_id, source_listing_id);
ALTER TABLE ONLY public.merchant_study_copies
    ADD CONSTRAINT merchant_study_copies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_tasting_verifications
    ADD CONSTRAINT merchant_tasting_verification_owner_user_id_verification_ke_key UNIQUE (owner_user_id, verification_key);
ALTER TABLE ONLY public.merchant_tasting_verifications
    ADD CONSTRAINT merchant_tasting_verifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_buyer_id_listing_id_key UNIQUE (buyer_id, listing_id);
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_study_copy_id_key UNIQUE (study_copy_id);
ALTER TABLE ONLY public.merchant_wallets
    ADD CONSTRAINT merchant_wallets_owner_user_id_key UNIQUE (owner_user_id);
ALTER TABLE ONLY public.merchant_wallets
    ADD CONSTRAINT merchant_wallets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.participant_tokens
    ADD CONSTRAINT participant_tokens_pkey PRIMARY KEY (participant_id);
ALTER TABLE ONLY public.participant_tokens
    ADD CONSTRAINT participant_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.personal_tea_records
    ADD CONSTRAINT personal_tea_records_id_owner_user_id_key UNIQUE (id, owner_user_id);
ALTER TABLE ONLY public.personal_tea_records
    ADD CONSTRAINT personal_tea_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reveal_sync_samples
    ADD CONSTRAINT reveal_sync_samples_participant_id_sequence_number_key UNIQUE (participant_id, sequence_number);
ALTER TABLE ONLY public.reveal_sync_samples
    ADD CONSTRAINT reveal_sync_samples_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.room_discovery_card_items
    ADD CONSTRAINT room_discovery_card_items_card_id_category_normalized_key_key UNIQUE (card_id, category, normalized_key);
ALTER TABLE ONLY public.room_discovery_card_items
    ADD CONSTRAINT room_discovery_card_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_breakout_room_id_key UNIQUE (breakout_room_id);
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tasting_card_descriptors
    ADD CONSTRAINT tasting_card_descriptors_card_id_position_key UNIQUE (card_id, "position");
ALTER TABLE ONLY public.tasting_card_descriptors
    ADD CONSTRAINT tasting_card_descriptors_pkey PRIMARY KEY (card_id, descriptor_id);
ALTER TABLE ONLY public.tasting_card_photos
    ADD CONSTRAINT tasting_card_photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tasting_card_photos
    ADD CONSTRAINT tasting_card_photos_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY public.tasting_cards
    ADD CONSTRAINT tasting_cards_id_owner_user_id_key UNIQUE (id, owner_user_id);
ALTER TABLE ONLY public.tasting_cards
    ADD CONSTRAINT tasting_cards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tasting_cards
    ADD CONSTRAINT tasting_cards_session_id_position_key UNIQUE (session_id, "position");
ALTER TABLE ONLY public.tasting_sessions
    ADD CONSTRAINT tasting_sessions_id_owner_user_id_key UNIQUE (id, owner_user_id);
ALTER TABLE ONLY public.tasting_sessions
    ADD CONSTRAINT tasting_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tea_catalog_prices
    ADD CONSTRAINT tea_catalog_prices_pkey PRIMARY KEY (product_id);
ALTER TABLE ONLY public.tea_response_revisions
    ADD CONSTRAINT tea_response_revisions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tea_responses
    ADD CONSTRAINT tea_responses_participant_id_event_flight_item_id_key UNIQUE (participant_id, event_flight_item_id);
ALTER TABLE ONLY public.tea_responses
    ADD CONSTRAINT tea_responses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.teas
    ADD CONSTRAINT teas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_participant_id_trivia_question_id_key UNIQUE (participant_id, trivia_question_id);
ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trivia_questions
    ADD CONSTRAINT trivia_questions_flight_position_unique UNIQUE (event_flight_item_id, "position");
ALTER TABLE ONLY public.trivia_questions
    ADD CONSTRAINT trivia_questions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_discovery_identities
    ADD CONSTRAINT user_discovery_identities_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_discovery_identities
    ADD CONSTRAINT user_discovery_identities_user_id_identity_definition_id_key UNIQUE (user_id, identity_definition_id);
ALTER TABLE ONLY public.user_discovery_profiles
    ADD CONSTRAINT user_discovery_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.discovery_identity_recalculations
    ADD CONSTRAINT discovery_identity_recalculations_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.discovery_identity_recalculations
    ADD CONSTRAINT discovery_identity_recalculations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_members
    ADD CONSTRAINT event_breakout_members_breakout_room_id_fkey FOREIGN KEY (breakout_room_id) REFERENCES public.event_breakout_rooms(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_members
    ADD CONSTRAINT event_breakout_members_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_members
    ADD CONSTRAINT event_breakout_members_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.event_breakout_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_rooms
    ADD CONSTRAINT event_breakout_rooms_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_rooms
    ADD CONSTRAINT event_breakout_rooms_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.event_breakout_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_rooms
    ADD CONSTRAINT event_breakout_rooms_snapshot_submitted_by_fkey FOREIGN KEY (snapshot_submitted_by) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_breakout_sessions
    ADD CONSTRAINT event_breakout_sessions_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_sessions
    ADD CONSTRAINT event_breakout_sessions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_breakout_sessions
    ADD CONSTRAINT event_breakout_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_brews
    ADD CONSTRAINT event_brews_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_brews
    ADD CONSTRAINT event_brews_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_brews
    ADD CONSTRAINT event_brews_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_answered_by_fkey FOREIGN KEY (answered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_breakout_room_id_fkey FOREIGN KEY (breakout_room_id) REFERENCES public.event_breakout_rooms(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_parent_message_id_fkey FOREIGN KEY (parent_message_id) REFERENCES public.event_chat_messages(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_spotlighted_by_fkey FOREIGN KEY (spotlighted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_cheers_sessions
    ADD CONSTRAINT event_cheers_sessions_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_cheers_sessions
    ADD CONSTRAINT event_cheers_sessions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_cheers_sessions
    ADD CONSTRAINT event_cheers_sessions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_breakout_room_id_fkey FOREIGN KEY (breakout_room_id) REFERENCES public.event_breakout_rooms(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_dismissed_by_participant_id_fkey FOREIGN KEY (dismissed_by_participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_conversation_prompts
    ADD CONSTRAINT event_conversation_prompts_requested_by_participant_id_fkey FOREIGN KEY (requested_by_participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_discovery_presentations
    ADD CONSTRAINT event_discovery_presentations_breakout_session_id_fkey FOREIGN KEY (breakout_session_id) REFERENCES public.event_breakout_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_discovery_presentations
    ADD CONSTRAINT event_discovery_presentations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_discovery_presentations
    ADD CONSTRAINT event_discovery_presentations_surfaced_curiosity_card_id_fkey FOREIGN KEY (surfaced_curiosity_card_id) REFERENCES public.room_discovery_cards(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_discovery_presentations
    ADD CONSTRAINT event_discovery_presentations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_flight_items
    ADD CONSTRAINT event_flight_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_flight_items
    ADD CONSTRAINT event_flight_items_tea_id_fkey FOREIGN KEY (tea_id) REFERENCES public.teas(id);
ALTER TABLE ONLY public.event_group_reveals
    ADD CONSTRAINT event_group_reveals_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_group_reveals
    ADD CONSTRAINT event_group_reveals_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_group_reveals
    ADD CONSTRAINT event_group_reveals_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_canonical_entry_id_fkey FOREIGN KEY (canonical_entry_id) REFERENCES public.merchant_ledger_entries(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_live_reward_awards
    ADD CONSTRAINT event_live_reward_awards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_live_reward_completion_overrides
    ADD CONSTRAINT event_live_reward_completion_overrides_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_live_reward_completion_overrides
    ADD CONSTRAINT event_live_reward_completion_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_live_reward_completion_overrides
    ADD CONSTRAINT event_live_reward_completion_overrides_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_live_reward_settings
    ADD CONSTRAINT event_live_reward_settings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_live_reward_settings
    ADD CONSTRAINT event_live_reward_settings_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.live_tasting_reward_policies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_breakout_room_id_fkey FOREIGN KEY (breakout_room_id) REFERENCES public.event_breakout_rooms(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_reactions
    ADD CONSTRAINT event_reactions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_stage_signals
    ADD CONSTRAINT event_stage_signals_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_stage_signals
    ADD CONSTRAINT event_stage_signals_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_stage_signals
    ADD CONSTRAINT event_stage_signals_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_state_log
    ADD CONSTRAINT event_state_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.event_state_log
    ADD CONSTRAINT event_state_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_backup_host_user_id_fkey FOREIGN KEY (backup_host_user_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_conductor_id_fkey FOREIGN KEY (conductor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_current_breakout_session_id_fkey FOREIGN KEY (current_breakout_session_id) REFERENCES public.event_breakout_sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_current_brew_id_fkey FOREIGN KEY (current_brew_id) REFERENCES public.event_brews(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_current_flight_fk FOREIGN KEY (current_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_current_trivia_question_fk FOREIGN KEY (current_trivia_question_id) REFERENCES public.trivia_questions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_host_user_id_fkey FOREIGN KEY (host_user_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_tasting_opened_flight_item_id_fkey FOREIGN KEY (tasting_opened_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.host_control_leases
    ADD CONSTRAINT host_control_leases_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.host_control_leases
    ADD CONSTRAINT host_control_leases_holder_user_id_fkey FOREIGN KEY (holder_user_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.living_tasting_map_fingerprints
    ADD CONSTRAINT living_tasting_map_fingerprints_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_fingerprints
    ADD CONSTRAINT living_tasting_map_fingerprints_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_fingerprints
    ADD CONSTRAINT living_tasting_map_fingerprints_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.living_tasting_map_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_moderation_actions
    ADD CONSTRAINT living_tasting_map_moderation_actions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.living_tasting_map_moderation_actions
    ADD CONSTRAINT living_tasting_map_moderation_actions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_moderation_actions
    ADD CONSTRAINT living_tasting_map_moderation_actions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.living_tasting_map_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_observation_events
    ADD CONSTRAINT living_tasting_map_observation_events_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_observation_events
    ADD CONSTRAINT living_tasting_map_observation_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_observation_events
    ADD CONSTRAINT living_tasting_map_observation_events_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_observation_events
    ADD CONSTRAINT living_tasting_map_observation_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.living_tasting_map_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_sessions
    ADD CONSTRAINT living_tasting_map_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.living_tasting_map_sessions
    ADD CONSTRAINT living_tasting_map_sessions_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_sessions
    ADD CONSTRAINT living_tasting_map_sessions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_snapshots
    ADD CONSTRAINT living_tasting_map_snapshots_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_snapshots
    ADD CONSTRAINT living_tasting_map_snapshots_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.living_tasting_map_snapshots
    ADD CONSTRAINT living_tasting_map_snapshots_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.living_tasting_map_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_card_progress
    ADD CONSTRAINT merchant_card_progress_canonical_tea_id_fkey FOREIGN KEY (canonical_tea_id) REFERENCES public.teas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.merchant_card_progress
    ADD CONSTRAINT merchant_card_progress_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_card_progress
    ADD CONSTRAINT merchant_card_progress_source_card_id_fkey FOREIGN KEY (source_card_id) REFERENCES public.tasting_cards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_ledger_entries
    ADD CONSTRAINT merchant_ledger_entries_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallets(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_listings
    ADD CONSTRAINT merchant_listings_canonical_tea_id_fkey FOREIGN KEY (canonical_tea_id) REFERENCES public.teas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.merchant_listings
    ADD CONSTRAINT merchant_listings_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_listings
    ADD CONSTRAINT merchant_listings_source_card_id_fkey FOREIGN KEY (source_card_id) REFERENCES public.tasting_cards(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_reactions
    ADD CONSTRAINT merchant_reactions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.merchant_listings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_reactions
    ADD CONSTRAINT merchant_reactions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_study_copies
    ADD CONSTRAINT merchant_study_copies_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_study_copies
    ADD CONSTRAINT merchant_study_copies_source_card_id_fkey FOREIGN KEY (source_card_id) REFERENCES public.tasting_cards(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_study_copies
    ADD CONSTRAINT merchant_study_copies_source_listing_id_fkey FOREIGN KEY (source_listing_id) REFERENCES public.merchant_listings(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_tasting_verifications
    ADD CONSTRAINT merchant_tasting_verifications_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.tasting_cards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_tasting_verifications
    ADD CONSTRAINT merchant_tasting_verifications_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.merchant_listings(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_study_copy_id_fkey FOREIGN KEY (study_copy_id) REFERENCES public.merchant_study_copies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.merchant_wallets
    ADD CONSTRAINT merchant_wallets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.participant_tokens
    ADD CONSTRAINT participant_tokens_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.personal_tea_records
    ADD CONSTRAINT personal_tea_records_canonical_tea_id_fkey FOREIGN KEY (canonical_tea_id) REFERENCES public.teas(id);
ALTER TABLE ONLY public.personal_tea_records
    ADD CONSTRAINT personal_tea_records_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reveal_sync_samples
    ADD CONSTRAINT reveal_sync_samples_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reveal_sync_samples
    ADD CONSTRAINT reveal_sync_samples_flight_item_id_fkey FOREIGN KEY (flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reveal_sync_samples
    ADD CONSTRAINT reveal_sync_samples_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.room_discovery_card_items
    ADD CONSTRAINT room_discovery_card_items_attribution_participant_id_fkey FOREIGN KEY (attribution_participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.room_discovery_card_items
    ADD CONSTRAINT room_discovery_card_items_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.room_discovery_cards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.room_discovery_card_items
    ADD CONSTRAINT room_discovery_card_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.room_discovery_card_items
    ADD CONSTRAINT room_discovery_card_items_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_breakout_room_id_fkey FOREIGN KEY (breakout_room_id) REFERENCES public.event_breakout_rooms(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_room_quote_participant_id_fkey FOREIGN KEY (room_quote_participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.event_breakout_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.room_discovery_cards
    ADD CONSTRAINT room_discovery_cards_spokesperson_participant_id_fkey FOREIGN KEY (spokesperson_participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tasting_card_descriptors
    ADD CONSTRAINT tasting_card_descriptors_card_owner_fk FOREIGN KEY (card_id, owner_user_id) REFERENCES public.tasting_cards(id, owner_user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tasting_card_descriptors
    ADD CONSTRAINT tasting_card_descriptors_descriptor_id_fkey FOREIGN KEY (descriptor_id) REFERENCES public.flavor_descriptors(id);
ALTER TABLE ONLY public.tasting_card_photos
    ADD CONSTRAINT tasting_card_photos_card_owner_fk FOREIGN KEY (card_id, owner_user_id) REFERENCES public.tasting_cards(id, owner_user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tasting_cards
    ADD CONSTRAINT tasting_cards_canonical_tea_id_fkey FOREIGN KEY (canonical_tea_id) REFERENCES public.teas(id);
ALTER TABLE ONLY public.tasting_cards
    ADD CONSTRAINT tasting_cards_personal_tea_owner_fk FOREIGN KEY (personal_tea_record_id, owner_user_id) REFERENCES public.personal_tea_records(id, owner_user_id);
ALTER TABLE ONLY public.tasting_cards
    ADD CONSTRAINT tasting_cards_session_owner_fk FOREIGN KEY (session_id, owner_user_id) REFERENCES public.tasting_sessions(id, owner_user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tasting_sessions
    ADD CONSTRAINT tasting_sessions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tea_catalog_prices
    ADD CONSTRAINT tea_catalog_prices_canonical_tea_id_fkey FOREIGN KEY (canonical_tea_id) REFERENCES public.teas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tea_response_revisions
    ADD CONSTRAINT tea_response_revisions_breakout_room_id_fkey FOREIGN KEY (breakout_room_id) REFERENCES public.event_breakout_rooms(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tea_response_revisions
    ADD CONSTRAINT tea_response_revisions_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tea_response_revisions
    ADD CONSTRAINT tea_response_revisions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tea_responses
    ADD CONSTRAINT tea_responses_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tea_responses
    ADD CONSTRAINT tea_responses_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_trivia_question_id_fkey FOREIGN KEY (trivia_question_id) REFERENCES public.trivia_questions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trivia_questions
    ADD CONSTRAINT trivia_questions_event_flight_item_id_fkey FOREIGN KEY (event_flight_item_id) REFERENCES public.event_flight_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_discovery_identities
    ADD CONSTRAINT user_discovery_identities_earned_event_id_fkey FOREIGN KEY (earned_event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.user_discovery_identities
    ADD CONSTRAINT user_discovery_identities_identity_definition_id_fkey FOREIGN KEY (identity_definition_id) REFERENCES public.discovery_identity_definitions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.user_discovery_identities
    ADD CONSTRAINT user_discovery_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_discovery_profiles
    ADD CONSTRAINT user_discovery_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
SET check_function_bodies=on;
