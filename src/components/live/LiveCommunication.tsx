"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  TEA_REACTIONS,
  getTeaReaction,
  isSpotlightActive,
  mergeMessages,
  type CommunicationAction,
  type CommunicationPresentation,
  type CommunicationSnapshot,
  type LiveChatMessage,
  type TeaReactionType
} from "@/lib/live-communication";
import type { ConductorCommunicationEmphasis } from "@/lib/conductor";
import { TeaReactionIcon } from "@/components/live/TeaReactionIcon";

type ReactionBurst = {
  id: string;
  reactionType: TeaReactionType;
  count: number;
  createdAt: number;
  expiresAt: number;
};

type LiveCommunicationProps = {
  eventId: string;
  presentation: CommunicationPresentation;
  currentTeaId?: string | null;
  participantCount?: number;
  emphasis?: ConductorCommunicationEmphasis;
  breakoutRoomId?:string|null;
};

const CHAT_EMOJI = ["😊", "🍵", "🌿", "✨", "🤔", "👏"];

export function LiveCommunication({ eventId, presentation, currentTeaId = null, participantCount, emphasis = "normal",breakoutRoomId=null }: LiveCommunicationProps) {
  const [snapshot, setSnapshot] = useState<CommunicationSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reactionTrayOpen, setReactionTrayOpen] = useState(false);
  const [questionView, setQuestionView] = useState(false);
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<LiveChatMessage | null>(null);
  const [askHost, setAskHost] = useState(false);
  const [broadcast, setBroadcast] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const [reactionAnnouncement, setReactionAnnouncement] = useState("");
  const [unreadBoundary, setUnreadBoundary] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const seenReactionClientsRef = useRef(new Set<string>());
  const lastReactionAnnouncementRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const loadSnapshot = useCallback(async (before?: string | null) => {
    const url = new URL(`/api/events/${eventId}/communication`, window.location.origin);
    if (before) url.searchParams.set("before", before);
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as CommunicationSnapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "The room conversation could not be loaded.");
    setNow(Date.now());
    for (const reaction of payload.recentReactions) seenReactionClientsRef.current.add(reaction.clientId);
    setSnapshot(current => {
      if (!current) return payload;
      if(current.event.breakoutRoomId!==payload.event.breakoutRoomId)return payload;
      return {
        ...payload,
        messages: before
          ? mergeMessages(payload.messages, current.messages)
          : mergeMessages(current.messages, payload.messages)
      };
    });
    return payload;
  }, [eventId]);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      void loadSnapshot().catch(loadError => {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "The conversation is unavailable.");
      });
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [breakoutRoomId,loadSnapshot, currentTeaId]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const displayReaction = useCallback((reactionType: TeaReactionType) => {
    const timestamp = Date.now();
    setBursts(current => {
      let matchingIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const burst = current[index];
        if (burst && burst.reactionType === reactionType && timestamp - burst.createdAt <= 3_000) {
          matchingIndex = index;
          break;
        }
      }
      if (matchingIndex >= 0) {
        return current.map((burst, index) => index === matchingIndex
          ? { ...burst, count: burst.count + 1, expiresAt: timestamp + 3_200 }
          : burst
        ).slice(-4);
      }
      return [...current, {
        id: crypto.randomUUID(),
        reactionType,
        count: 1,
        createdAt: timestamp,
        expiresAt: timestamp + 3_200
      }].slice(-4);
    });
    window.setTimeout(() => setBursts(current => current.filter(burst => burst.expiresAt > Date.now())), 3_300);
    if (timestamp - lastReactionAnnouncementRef.current >= 1_500) {
      lastReactionAnnouncementRef.current = timestamp;
      setReactionAnnouncement(`${getTeaReaction(reactionType).label} reaction in the room.`);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-communication-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_chat_messages", filter: `event_id=eq.${eventId}` }, () => {
        void loadSnapshot().catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "event_communication_settings", filter: `event_id=eq.${eventId}` }, () => {
        void loadSnapshot().catch(() => undefined);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_reactions", filter: `event_id=eq.${eventId}` }, payload => {
        const row = payload.new as Record<string, unknown>;
        const reactionType = String(row.reaction_type ?? "") as TeaReactionType;
        const clientId = String(row.client_id ?? "");
        const reactionRoomId=typeof row.breakout_room_id==="string"?row.breakout_room_id:null;
        if(reactionRoomId!==breakoutRoomId)return;
        if (!TEA_REACTIONS.some(reaction => reaction.type === reactionType) || !clientId || seenReactionClientsRef.current.has(clientId)) return;
        seenReactionClientsRef.current.add(clientId);
        displayReaction(reactionType);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [breakoutRoomId,displayReaction, eventId, loadSnapshot]);

  useEffect(() => {
    if (!drawerOpen) return;
    const timer = window.setTimeout(() => {
      void postCommunication(eventId, { action: "mark_read" }).then(() => {
        setSnapshot(current => current ? { ...current, unreadCount: 0, lastReadAt: new Date().toISOString() } : current);
      }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [drawerOpen, eventId, snapshot?.messages.length]);

  const temporaryFeature = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.spotlightMessage && isSpotlightActive(snapshot.spotlightMessage, now)) return snapshot.spotlightMessage;
    const broadcastMessage = [...snapshot.messages].reverse().find(message => message.kind === "broadcast" && !message.deleted);
    return broadcastMessage && new Date(broadcastMessage.createdAt).getTime() + 8_000 > now ? broadcastMessage : null;
  }, [now, snapshot]);

  useEffect(() => {
    if (!temporaryFeature) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [temporaryFeature]);

  useEffect(() => {
    if (!drawerOpen && !reactionTrayOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reactionTrayOpen) setReactionTrayOpen(false);
      else setDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [drawerOpen, reactionTrayOpen]);

  function openDrawer() {
    setUnreadBoundary(snapshot?.lastReadAt ?? null);
    setDrawerOpen(true);
    setReactionTrayOpen(false);
  }

  async function sendReaction(reactionType: TeaReactionType) {
    if (!snapshot?.settings.reactionsEnabled) return;
    const clientId = crypto.randomUUID();
    seenReactionClientsRef.current.add(clientId);
    displayReaction(reactionType);
    setReactionTrayOpen(false);
    setError("");
    try {
      await postCommunication(eventId, { action: "send_reaction", clientId, reactionType });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "That reaction could not be shared.");
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const body = composer.trim();
    if (!body || !snapshot) return;
    setBusy(true);
    setError("");
    try {
      await postCommunication(eventId, {
        action: "send_message",
        clientId: crypto.randomUUID(),
        body,
        parentMessageId: replyTo?.id ?? null,
        askHost: snapshot.viewer.kind === "guest" && askHost,
        kind: snapshot.viewer.canModerate && broadcast ? "broadcast" : "chat"
      });
      setComposer("");
      setReplyTo(null);
      setAskHost(false);
      setBroadcast(false);
      setEmojiOpen(false);
      await loadSnapshot();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "That message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function moderate(operation: "answer" | "pin" | "unpin" | "spotlight" | "delete" | "remove_participant", message: LiveChatMessage, anonymous = false) {
    setError("");
    try {
      await postCommunication(eventId, {
        action: "moderate",
        operation,
        messageId: message.id,
        anonymous,
        reason: operation === "delete"
          ? "Removed from the live room"
          : operation === "remove_participant"
            ? "Participant removed from the live room"
            : undefined
      });
      await loadSnapshot();
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "That host action could not be completed.");
    }
  }

  async function reportMessage(message: LiveChatMessage) {
    setError("");
    try {
      await postCommunication(eventId, {
        action: "report_message",
        messageId: message.id,
        reason: "Reported from the tasting conversation"
      });
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "That message could not be reported.");
    }
  }

  async function changeSettings(patch: { chatEnabled?: boolean; reactionsEnabled?: boolean; slowModeSeconds?: number }) {
    setError("");
    try {
      await postCommunication(eventId, { action: "update_settings", ...patch });
      await loadSnapshot();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Communication settings could not be changed.");
    }
  }

  const viewer = snapshot?.viewer ?? null;
  const messages = snapshot?.messages ?? [];
  const visibleMessages = questionView ? messages.filter(message => message.askHost) : messages;
  const unansweredQuestions = messages.filter(message => message.askHost && !message.answeredAt && !message.deleted).length;
  const canPost = Boolean(snapshot && ["scheduled", "live"].includes(snapshot.event.status) && snapshot.event.phase !== "ended");

  return <>
    {temporaryFeature && <FeaturedCommunication message={temporaryFeature} />}
    <ReactionLane bursts={bursts} reducedMotion={reducedMotion} />
    <div className="sr-only" aria-live="polite" aria-atomic="true">{reactionAnnouncement}</div>

    <section className={`live-communication live-communication-${presentation} live-communication-emphasis-${emphasis}`} aria-label="Live tasting conversation">
      <div className="live-communication-dock">
        <button
          className="live-communication-dock-button"
          type="button"
          disabled={!snapshot || !snapshot.settings.reactionsEnabled || !canPost}
          aria-expanded={reactionTrayOpen}
          aria-controls={`reaction-tray-${eventId}`}
          onClick={() => { setReactionTrayOpen(open => !open); setDrawerOpen(false); }}
        ><TeaReactionIcon type="tea_cup"/><span>React</span></button>
        <button
          className="live-communication-dock-button"
          type="button"
          aria-expanded={drawerOpen}
          aria-controls={`chat-drawer-${eventId}`}
          onClick={openDrawer}
        ><ChatIcon/><span>{breakoutRoomId?"Table chat":"Chat"}</span>{Boolean(snapshot?.unreadCount) && <span className="live-communication-unread" aria-label={`${snapshot?.unreadCount} unread messages`}>{Math.min(99, snapshot?.unreadCount ?? 0)}</span>}</button>
      </div>

      {reactionTrayOpen && <div className="tea-reaction-tray" id={`reaction-tray-${eventId}`} role="dialog" aria-label="Tea reactions">
        <div className="tea-reaction-tray-heading"><strong>What are you noticing?</strong><button type="button" className="live-icon-button" aria-label="Close reactions" onClick={() => setReactionTrayOpen(false)}>×</button></div>
        <div className="tea-reaction-grid">
          {TEA_REACTIONS.map(reaction => <button
            type="button"
            className="tea-reaction-choice"
            key={reaction.type}
            aria-label={`${reaction.label}: ${reaction.meaning}`}
            onClick={() => void sendReaction(reaction.type)}
          ><TeaReactionIcon type={reaction.type}/><span>{reaction.shortLabel}</span></button>)}
        </div>
      </div>}

      {drawerOpen && <aside className="live-chat-drawer" id={`chat-drawer-${eventId}`} role="dialog" aria-modal="false" aria-label="Tasting conversation">
        <header className="live-chat-header">
          <div><span className="eyebrow">{breakoutRoomId?"Tasting table conversation":"Tasting conversation"}</span><strong>{snapshot?.event.title ?? "Live tasting"}</strong><small>{participantCount !== undefined ? `${participantCount} in the room` : "Shared room"}{snapshot?.event.currentTeaTitle ? ` · ${snapshot.event.currentTeaTitle}` : ""}{breakoutRoomId?" · host broadcasts appear here":""}</small></div>
          <button type="button" className="live-icon-button" aria-label="Close chat" onClick={() => setDrawerOpen(false)}>×</button>
        </header>

        {viewer?.canModerate && <HostCommunicationSettings
          settings={snapshot?.settings ?? { chatEnabled: true, reactionsEnabled: true, slowModeSeconds: 0 }}
          onChange={changeSettings}
        />}

        <div className="live-chat-tabs" role="tablist" aria-label="Conversation views">
          <button type="button" role="tab" aria-selected={!questionView} onClick={() => setQuestionView(false)}>{breakoutRoomId?"Table conversation":"Conversation"}</button>
          <button type="button" role="tab" aria-selected={questionView} onClick={() => setQuestionView(true)}>Ask Host{unansweredQuestions > 0 ? ` (${unansweredQuestions})` : ""}</button>
        </div>

        {snapshot?.pinnedMessage && !questionView && <div className="live-chat-pinned"><PinIcon/><div><small>Pinned by the host</small><p>{snapshot.pinnedMessage.body}</p></div></div>}
        {error && <div className="notice error live-chat-error" role="alert">{error}</div>}

        <div className="live-chat-history" aria-label="Chat history">
          {snapshot?.nextCursor && <button className="btn btn-quiet live-chat-load" type="button" onClick={() => void loadSnapshot(snapshot.nextCursor).catch(loadError => setError(loadError instanceof Error ? loadError.message : "Earlier messages could not be loaded."))}>Load earlier</button>}
          {visibleMessages.length === 0 && <div className="live-chat-empty"><TeaReactionIcon type={questionView ? "question" : "tea_cup"}/><strong>{questionView ? "No questions yet." : "The room is quiet for now."}</strong><span>{questionView ? "Ask Host messages will gather here." : "Silence is welcome. Share when something feels worth carrying into the room."}</span></div>}
          {visibleMessages.map((message, index) => {
            const previous = visibleMessages[index - 1];
            const showTeaBoundary = Boolean(message.teaId && message.teaId !== previous?.teaId);
            const showUnread = Boolean(unreadBoundary && new Date(message.createdAt).getTime() > new Date(unreadBoundary).getTime() && (!previous || new Date(previous.createdAt).getTime() <= new Date(unreadBoundary).getTime()));
            return <Fragment key={message.id}>
              {showUnread && <div className="live-chat-unread-marker"><span>New messages</span></div>}
              {showTeaBoundary && <div className="live-chat-tea-boundary"><span>Tea {message.teaPosition ?? ""}</span><strong>{message.teaTitle}</strong></div>}
              <ChatMessageCard
                message={message}
                own={message.own}
                canModerate={Boolean(viewer?.canModerate)}
                onReply={() => { setReplyTo(message); window.setTimeout(() => composerRef.current?.focus(), 0); }}
                onModerate={moderate}
                onReport={reportMessage}
              />
            </Fragment>;
          })}
        </div>

        {replyTo && <div className="live-chat-replying"><div><small>Replying to {replyTo.authorDisplayName}</small><span>{replyTo.body.slice(0, 100)}</span></div><button type="button" className="live-icon-button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>×</button></div>}
        <form className="live-chat-composer" onSubmit={sendMessage}>
          {!snapshot?.settings.chatEnabled && !viewer?.canModerate && <p className="help">The host has paused chat. Reactions may still be available.</p>}
          {viewer?.canModerate && <div className="live-chat-composer-modes">
            <button type="button" aria-pressed={!broadcast} onClick={() => setBroadcast(false)}>Message</button>
            <button type="button" aria-pressed={broadcast} onClick={() => setBroadcast(true)}>Broadcast</button>
          </div>}
          <textarea
            ref={composerRef}
            rows={2}
            maxLength={600}
            value={composer}
            disabled={!canPost || (!snapshot?.settings.chatEnabled && !viewer?.canModerate)}
            aria-label={broadcast ? "Host broadcast" : "Chat message"}
            placeholder={broadcast ? "A short message for everyone…" : "What are you noticing?"}
            onChange={event => setComposer(event.target.value)}
          />
          {emojiOpen && <div className="live-chat-emoji" aria-label="Standard chat emoji">{CHAT_EMOJI.map(emoji => <button type="button" key={emoji} aria-label={`Add ${emoji}`} onClick={() => { setComposer(value => `${value}${emoji}`); composerRef.current?.focus(); }}>{emoji}</button>)}</div>}
          <div className="live-chat-composer-actions">
            <button type="button" className="live-chat-emoji-button" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(open => !open)}>😊 <span className="sr-only">Standard emoji</span></button>
            {viewer?.kind === "guest" && <button type="button" className={`live-chat-ask${askHost ? " active" : ""}`} aria-pressed={askHost} onClick={() => setAskHost(value => !value)}><TeaReactionIcon type="question"/> Ask Host</button>}
            <span className="spacer"/>
            <span className="live-chat-count" aria-live="polite">{composer.length}/600</span>
            <button className="btn btn-gold" disabled={busy || !composer.trim() || !canPost || (!snapshot?.settings.chatEnabled && !viewer?.canModerate)}>{busy ? "Sending…" : broadcast ? "Broadcast" : "Send"}</button>
          </div>
        </form>
      </aside>}
    </section>
  </>;
}

function ChatMessageCard({ message, own, canModerate, onReply, onModerate, onReport }: {
  message: LiveChatMessage;
  own: boolean;
  canModerate: boolean;
  onReply: () => void;
  onModerate: (operation: "answer" | "pin" | "unpin" | "spotlight" | "delete" | "remove_participant", message: LiveChatMessage, anonymous?: boolean) => Promise<void>;
  onReport: (message: LiveChatMessage) => Promise<void>;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return <article className={`live-chat-message${own ? " own" : ""}${message.kind === "broadcast" ? " broadcast" : ""}${message.askHost ? " question" : ""}${message.deleted ? " deleted" : ""}`}>
    <div className="live-chat-message-meta"><strong>{message.kind === "broadcast" ? "Vintage Fork host" : message.authorDisplayName}</strong>{message.askHost && <span className={`chip ${message.answeredAt ? "chip-success" : "chip-warning"}`}>{message.answeredAt ? "Answered" : "Ask Host"}</span>}<time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time></div>
    {message.replyPreview && <div className="live-chat-reply-preview"><strong>{message.replyPreview.authorDisplayName}</strong><span>{message.replyPreview.body}</span></div>}
    <p>{message.deleted ? <em>Message removed by the host.</em> : message.body}</p>
    {!message.deleted && <div className="live-chat-message-actions">
      <button type="button" onClick={onReply}>Reply</button>
      {!own && !canModerate && <button type="button" onClick={() => void onReport(message)}>Report</button>}
      {canModerate && <>
        <button type="button" aria-expanded={actionsOpen} onClick={() => setActionsOpen(open => !open)}>Host actions</button>
        {actionsOpen && <div className="live-chat-host-actions">
          {message.askHost && !message.answeredAt && <button type="button" onClick={() => void onModerate("answer", message)}>Mark answered</button>}
          <button type="button" onClick={() => void onModerate(message.pinnedAt ? "unpin" : "pin", message)}>{message.pinnedAt ? "Unpin" : "Pin"}</button>
          <button type="button" onClick={() => void onModerate("spotlight", message, false)}>Spotlight with name</button>
          <button type="button" onClick={() => void onModerate("spotlight", message, true)}>Spotlight anonymously</button>
          <button type="button" className="danger" onClick={() => {
            if (window.confirm("Remove this message from the live room?")) void onModerate("delete", message);
          }}>Remove message</button>
          {message.participantId && <button type="button" className="danger" onClick={() => {
            if (window.confirm(`Remove ${message.authorDisplayName} from this live room?`)) void onModerate("remove_participant", message);
          }}>Remove participant</button>}
        </div>}
      </>}
    </div>}
  </article>;
}

function HostCommunicationSettings({ settings, onChange }: {
  settings: CommunicationSnapshot["settings"];
  onChange: (patch: { chatEnabled?: boolean; reactionsEnabled?: boolean; slowModeSeconds?: number }) => Promise<void>;
}) {
  return <details className="live-chat-settings">
    <summary>Room communication settings</summary>
    <div>
      <button type="button" aria-pressed={settings.chatEnabled} onClick={() => void onChange({ chatEnabled: !settings.chatEnabled })}>{settings.chatEnabled ? "Chat open" : "Chat paused"}</button>
      <button type="button" aria-pressed={settings.reactionsEnabled} onClick={() => void onChange({ reactionsEnabled: !settings.reactionsEnabled })}>{settings.reactionsEnabled ? "Reactions open" : "Reactions paused"}</button>
      <label>Slow mode<select value={settings.slowModeSeconds} onChange={event => void onChange({ slowModeSeconds: Number(event.target.value) })}><option value="0">Off</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select></label>
    </div>
  </details>;
}

function FeaturedCommunication({ message }: { message: LiveChatMessage }) {
  const label = message.kind === "broadcast" ? "Host message" : "Shared observation";
  const author = message.spotlightAnonymous ? "From the tasting room" : message.authorDisplayName;
  return <aside className={`live-communication-feature${message.kind === "broadcast" ? " broadcast" : ""}`} role="status" aria-live="polite">
    <span className="eyebrow">{label}</span><p>{message.body}</p><small>{author}</small>
  </aside>;
}

function ReactionLane({ bursts, reducedMotion }: { bursts: ReactionBurst[]; reducedMotion: boolean }) {
  return <div className={`live-reaction-lane${reducedMotion ? " reduced-motion" : ""}`} aria-hidden="true">
    {bursts.map(burst => <div className={`live-reaction-burst reaction-${burst.reactionType}${burst.count >= 5 ? " room-pulse" : ""}`} key={burst.id}>
      <TeaReactionIcon type={burst.reactionType}/><span>{getTeaReaction(burst.reactionType).shortLabel}{burst.count > 1 ? ` ×${burst.count}` : ""}</span>
    </div>)}
  </div>;
}

function ChatIcon() {
  return <svg className="live-communication-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8 9h8M8 12h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 8 0-1.2 5 2.2 2.2v1.3H7v-1.3L9.2 9 8 4Zm4 8.5V20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

async function postCommunication(eventId: string, action: CommunicationAction) {
  const response = await fetch(`/api/events/${eventId}/communication`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action)
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The room action could not be completed.");
  return payload;
}

function formatMessageTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}
