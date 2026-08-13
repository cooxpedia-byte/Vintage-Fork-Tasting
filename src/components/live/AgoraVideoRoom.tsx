"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import type {
  IAgoraRTC,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  UID
} from "agora-rtc-sdk-ng";
import {
  AGORA_ACTIVE_SPEAKER_HOLD_MS,
  AGORA_OPERATION_TIMEOUT_MS,
  agoraErrorCode,
  type AgoraVideoCodec,
  describeAgoraConnectionError,
  describeMediaError,
  selectAgoraActiveSpeaker,
  selectAgoraVideoCodec,
  withAgoraTimeout
} from "@/lib/agora-session";

type RoomToken = {
  appId: string;
  channel: string;
  account: string;
  token: string;
  expiresAt: string;
};

type RoomStatus = "idle" | "joining" | "joined" | "error";
type VideoLayout = "speaker" | "grid";

export function AgoraVideoRoom({
  eventId,
  displayName,
  presentation = "guest"
}: {
  eventId: string;
  displayName: string;
  presentation?: "guest" | "host";
}) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const agoraRef = useRef<IAgoraRTC | null>(null);
  const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const videoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const attemptRef = useRef(0);
  const joiningRef = useRef(false);
  const restartingRef = useRef(false);
  const microphoneBusyRef = useRef(false);
  const cameraBusyRef = useRef(false);
  const intentionalLeaveRef = useRef(false);
  const mountedRef = useRef(true);
  const activeSpeakerRef = useRef<string | null>(null);
  const speakerSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [status, setStatus] = useState<RoomStatus>("idle");
  const [progress, setProgress] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [microphoneError, setMicrophoneError] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [localTrackReady, setLocalTrackReady] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [videoLayout, setVideoLayout] = useState<VideoLayout>("speaker");

  useEffect(() => {
    const node = localVideoRef.current;
    const track = videoTrackRef.current;
    if (!node || !track || !localTrackReady) return;
    track.play(node, { fit: "cover", mirror: true });
  }, [localTrackReady, collapsed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      audioTrackRef.current?.close();
      videoTrackRef.current?.close();
      audioTrackRef.current = null;
      videoTrackRef.current = null;
      clientRef.current?.removeAllListeners();
      void clientRef.current?.leave();
      clientRef.current = null;
      if (speakerSilenceTimerRef.current) clearTimeout(speakerSilenceTimerRef.current);
      speakerSilenceTimerRef.current = null;
      activeSpeakerRef.current = null;
    };
  }, []);

  async function fetchToken() {
    const controller = new AbortController();
    try {
      const result = await withAgoraTimeout(fetch(`/api/events/${eventId}/agora-token`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal
      }), AGORA_OPERATION_TIMEOUT_MS.token, "The secure video room took too long to respond.");
      const payload = await result.json().catch(() => ({})) as Partial<RoomToken> & { error?: string };
      if (!result.ok || !payload.appId || !payload.channel || !payload.account || !payload.token) {
        throw new Error(payload.error ?? "The secure video room is unavailable.");
      }
      return payload as RoomToken;
    } finally {
      controller.abort();
    }
  }

  function reportClientIssue(stage: string, error: unknown, context: Record<string, unknown> = {}) {
    const reportable = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(reportable, {
      tags: {
        vf_event: "agora_client_issue",
        agora_stage: stage,
        agora_code: agoraErrorCode(error),
        room_role: presentation
      },
      extra: {
        eventId,
        sdkVersion: agoraRef.current?.VERSION,
        ...context
      }
    });
  }

  function configureClient(client: IAgoraRTCClient) {
    const refreshRemoteUsers = () => setRemoteUsers([...client.remoteUsers]);
    client.on("user-published", (user, mediaType) => {
      void client.subscribe(user, mediaType).then(() => {
        if (mediaType === "audio") user.audioTrack?.play();
        refreshRemoteUsers();
      }).catch(error => {
        reportClientIssue("subscribe", error, { mediaType });
        setConnectionError("A participant’s media could not be loaded. Reconnect video to retry.");
      });
    });
    client.on("user-unpublished", (user, mediaType) => {
      refreshRemoteUsers();
      if (mediaType === "video" && activeSpeakerRef.current === String(user.uid)) clearActiveSpeaker();
    });
    client.on("user-left", user => {
      refreshRemoteUsers();
      if (activeSpeakerRef.current === String(user.uid)) clearActiveSpeaker();
    });
    client.enableAudioVolumeIndicator();
    client.on("volume-indicator", levels => {
      if (clientRef.current !== client) return;
      const localUid = client.uid === undefined ? "" : String(client.uid);
      const visibleCameraIds = new Set(
        client.remoteUsers.filter(user => Boolean(user.videoTrack)).map(user => String(user.uid))
      );
      const nextSpeaker = selectAgoraActiveSpeaker(
        levels.map(sample => ({
          id: String(sample.uid) === localUid ? "local" : String(sample.uid),
          level: sample.level
        })),
        visibleCameraIds
      );
      if (!nextSpeaker) return;
      promoteActiveSpeaker(nextSpeaker);
    });
    client.on("connection-state-change", (current, previous, reason) => {
      if (current !== "DISCONNECTED" || intentionalLeaveRef.current || clientRef.current !== client) return;
      if (joiningRef.current) return;
      reportClientIssue("disconnected", new Error(String(reason ?? "DISCONNECTED")), { previous, current, reason });
      attemptRef.current += 1;
      joiningRef.current = false;
      closeLocalTracks();
      client.removeAllListeners();
      clientRef.current = null;
      setRemoteUsers([]);
      setStatus("error");
      setProgress("");
      setConnectionError("Video was disconnected. The tasting is still running; reconnect when ready.");
    });
    client.on("exception", exception => {
      reportClientIssue("quality_exception", new Error(exception.msg), {
        exceptionCode: exception.code,
        participant: String(exception.uid)
      });
    });
    client.on("token-privilege-will-expire", () => {
      void fetchToken().then(next => client.renewToken(next.token)).catch(() => {
        setConnectionError("Video security needs refreshing. Use Restart video to reconnect safely.");
      });
    });
  }

  async function createAndJoinClient(
    AgoraRTC: IAgoraRTC,
    credentials: RoomToken,
    codec: AgoraVideoCodec,
    attempt: number
  ) {
    const client = AgoraRTC.createClient({ mode: "rtc", codec });
    clientRef.current = client;
    configureClient(client);
    try {
      await withAgoraTimeout(
        client.join(credentials.appId, credentials.channel, credentials.token, credentials.account),
        AGORA_OPERATION_TIMEOUT_MS.join,
        "The video connection took too long."
      );
      if (attempt !== attemptRef.current) {
        client.removeAllListeners();
        await client.leave().catch(() => undefined);
        throw new Error("Video connection was replaced by a newer attempt.");
      }
      return client;
    } catch (error) {
      if (clientRef.current === client) clientRef.current = null;
      client.removeAllListeners();
      intentionalLeaveRef.current = true;
      await withAgoraTimeout(client.leave(), AGORA_OPERATION_TIMEOUT_MS.leave, "Video took too long to close.").catch(() => undefined);
      intentionalLeaveRef.current = false;
      throw error;
    }
  }

  async function connectRoom() {
    if (joiningRef.current || clientRef.current) return;
    joiningRef.current = true;
    const attempt = ++attemptRef.current;
    setStatus("joining");
    setProgress("Preparing secure video…");
    setConnectionError("");
    setCameraError("");
    setMicrophoneError("");

    try {
      const credentials = await fetchToken();
      if (attempt !== attemptRef.current) return;
      setProgress("Loading video…");
      const { default: AgoraRTC } = await withAgoraTimeout(
        import("agora-rtc-sdk-ng"),
        AGORA_OPERATION_TIMEOUT_MS.token,
        "The video controls took too long to load."
      );
      if (attempt !== attemptRef.current) return;
      agoraRef.current = AgoraRTC;

      if (!AgoraRTC.checkSystemRequirements()) {
        throw Object.assign(new Error("This browser does not support the required WebRTC features."), { code: "NOT_SUPPORTED" });
      }
      const supportedCodecs = await AgoraRTC.getSupportedCodec().catch(() => ({ video: [], audio: [] }));
      const codec = selectAgoraVideoCodec(supportedCodecs.video);
      setProgress("Joining the video room…");
      // Do not force startProxyServer here. Agora cloud proxy needs separate
      // account-side configuration; join() already owns browser/TLS recovery.
      const client = await createAndJoinClient(AgoraRTC, credentials, codec, attempt);

      setStatus("joined");
      setProgress("Connected. Opening microphone…");
      setRemoteUsers([...client.remoteUsers]);
      void initializeLocalMedia(AgoraRTC, client, attempt);
    } catch (joinError) {
      if (attempt !== attemptRef.current) return;
      reportClientIssue("join_failed", joinError);
      await releaseClient();
      setStatus("error");
      setProgress("");
      setConnectionError(describeAgoraConnectionError(joinError));
    } finally {
      if (attempt === attemptRef.current) joiningRef.current = false;
    }
  }

  async function initializeLocalMedia(AgoraRTC: IAgoraRTC, client: IAgoraRTCClient, attempt: number) {
    await startMicrophone(AgoraRTC, client, attempt);
    if (attempt !== attemptRef.current || clientRef.current !== client) return;
    setProgress("Connected. Opening camera…");
    await startCamera(AgoraRTC, client, attempt);
    if (attempt === attemptRef.current && clientRef.current === client) setProgress("");
  }

  async function startMicrophone(AgoraRTC: IAgoraRTC, client: IAgoraRTCClient, attempt = attemptRef.current) {
    if (audioTrackRef.current || microphoneBusyRef.current) return;
    microphoneBusyRef.current = true;
    setMicrophoneBusy(true);
    setMicrophoneError("");
    let track: IMicrophoneAudioTrack | null = null;
    const operation = AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
    try {
      track = await withAgoraTimeout(operation, AGORA_OPERATION_TIMEOUT_MS.media, "Microphone did not respond.");
      if (attempt !== attemptRef.current || clientRef.current !== client) {
        track.close();
        return;
      }
      await withAgoraTimeout(client.publish(track), AGORA_OPERATION_TIMEOUT_MS.publish, "Microphone took too long to publish.");
      if (attempt !== attemptRef.current || clientRef.current !== client) {
        void client.unpublish(track).catch(() => undefined);
        track.close();
        return;
      }
      audioTrackRef.current = track;
      setHasMicrophone(true);
      setMicOn(true);
    } catch (mediaError) {
      reportClientIssue("microphone", mediaError);
      if (track) {
        void client.unpublish(track).catch(() => undefined);
        track.close();
      } else {
        void operation.then(lateTrack => lateTrack.close()).catch(() => undefined);
      }
      if (attempt === attemptRef.current) setMicrophoneError(describeMediaError(mediaError, "microphone"));
    } finally {
      microphoneBusyRef.current = false;
      if (attempt === attemptRef.current) setMicrophoneBusy(false);
    }
  }

  async function startCamera(AgoraRTC: IAgoraRTC, client: IAgoraRTCClient, attempt = attemptRef.current) {
    if (videoTrackRef.current || cameraBusyRef.current) return;
    cameraBusyRef.current = true;
    setCameraBusy(true);
    setCameraError("");
    let track: ICameraVideoTrack | null = null;
    const operation = AgoraRTC.createCameraVideoTrack({ encoderConfig: "480p_1" });
    try {
      track = await withAgoraTimeout(operation, AGORA_OPERATION_TIMEOUT_MS.media, "Camera did not respond.");
      if (attempt !== attemptRef.current || clientRef.current !== client) {
        track.close();
        return;
      }
      await withAgoraTimeout(client.publish(track), AGORA_OPERATION_TIMEOUT_MS.publish, "Camera took too long to publish.");
      if (attempt !== attemptRef.current || clientRef.current !== client) {
        void client.unpublish(track).catch(() => undefined);
        track.close();
        return;
      }
      videoTrackRef.current = track;
      setHasCamera(true);
      setCameraOn(true);
      setLocalTrackReady(true);
    } catch (mediaError) {
      reportClientIssue("camera", mediaError);
      if (track) {
        void client.unpublish(track).catch(() => undefined);
        track.close();
      } else {
        void operation.then(lateTrack => lateTrack.close()).catch(() => undefined);
      }
      if (attempt === attemptRef.current) setCameraError(describeMediaError(mediaError, "camera"));
    } finally {
      cameraBusyRef.current = false;
      if (attempt === attemptRef.current) setCameraBusy(false);
    }
  }

  async function retryMicrophone() {
    const client = clientRef.current;
    const AgoraRTC = agoraRef.current;
    if (!client || !AgoraRTC) return;
    setProgress("Retrying microphone…");
    await startMicrophone(AgoraRTC, client);
    if (clientRef.current === client) setProgress("");
  }

  async function retryCamera() {
    const client = clientRef.current;
    const AgoraRTC = agoraRef.current;
    if (!client || !AgoraRTC) return;
    setProgress("Retrying camera…");
    await startCamera(AgoraRTC, client);
    if (clientRef.current === client) setProgress("");
  }

  async function restartRoom() {
    if (restartingRef.current) return;
    restartingRef.current = true;
    try {
      setProgress("Restarting video without stopping the tasting…");
      await disconnectRoom("joining");
      await connectRoom();
    } finally {
      restartingRef.current = false;
    }
  }

  async function leaveRoom() {
    await disconnectRoom("idle");
  }

  async function disconnectRoom(nextStatus: RoomStatus) {
    attemptRef.current += 1;
    joiningRef.current = false;
    intentionalLeaveRef.current = true;
    closeLocalTracks();
    setRemoteUsers([]);
    setCameraError("");
    setMicrophoneError("");
    setConnectionError("");
    clearActiveSpeaker();
    setStatus(nextStatus);
    if (nextStatus === "idle") setProgress("");
    await releaseClient();
    intentionalLeaveRef.current = false;
  }

  async function releaseClient() {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    client.removeAllListeners();
    await withAgoraTimeout(client.leave(), AGORA_OPERATION_TIMEOUT_MS.leave, "Video took too long to close.").catch(() => undefined);
  }

  function closeLocalTracks() {
    audioTrackRef.current?.close();
    videoTrackRef.current?.close();
    audioTrackRef.current = null;
    videoTrackRef.current = null;
    if (!mountedRef.current) return;
    setHasMicrophone(false);
    setHasCamera(false);
    setLocalTrackReady(false);
    setMicOn(false);
    setCameraOn(false);
    microphoneBusyRef.current = false;
    cameraBusyRef.current = false;
    setMicrophoneBusy(false);
    setCameraBusy(false);
  }

  async function toggleMicrophone() {
    const track = audioTrackRef.current;
    if (!track) return retryMicrophone();
    const next = !micOn;
    await track.setEnabled(next);
    setMicOn(next);
  }

  async function toggleCamera() {
    const track = videoTrackRef.current;
    if (!track) return retryCamera();
    const next = !cameraOn;
    await track.setEnabled(next);
    setCameraOn(next);
    if (!next && activeSpeakerRef.current === "local") clearActiveSpeaker();
  }

  function promoteActiveSpeaker(id: string) {
    if (activeSpeakerRef.current !== id) {
      activeSpeakerRef.current = id;
      setActiveSpeakerId(id);
    }
    if (speakerSilenceTimerRef.current) clearTimeout(speakerSilenceTimerRef.current);
    speakerSilenceTimerRef.current = setTimeout(() => {
      activeSpeakerRef.current = null;
      speakerSilenceTimerRef.current = null;
      if (mountedRef.current) setActiveSpeakerId(null);
    }, AGORA_ACTIVE_SPEAKER_HOLD_MS);
  }

  function clearActiveSpeaker() {
    if (speakerSilenceTimerRef.current) clearTimeout(speakerSilenceTimerRef.current);
    speakerSilenceTimerRef.current = null;
    activeSpeakerRef.current = null;
    if (mountedRef.current) setActiveSpeakerId(null);
  }

  const joined = status === "joined";
  const visibleRemoteUsers = remoteUsers.filter(user => Boolean(user.videoTrack));
  const speakerView = presentation === "host" && videoLayout === "speaker";
  const visibleVideoCount = visibleRemoteUsers.length + (hasCamera && cameraOn ? 1 : 0);
  const roomClass = `agora-room agora-room-${presentation}${collapsed ? " agora-room-collapsed" : ""}`;
  const entryLabel = status === "joining" ? (progress || "Connecting to video…") : status === "error" ? "Reconnect video" : "Join with camera & mic";
  const localVideoTile = <article className="agora-video-tile agora-video-tile-local"><div ref={localVideoRef} className="agora-video-surface" /><span>{displayName} · you</span>{(!hasCamera || !cameraOn) && <div className="agora-camera-off">{cameraBusy ? "Opening camera…" : hasCamera ? "Camera off" : "Camera unavailable"}</div>}</article>;

  return <section className={roomClass} aria-label="Live tasting video room">
    <header className="agora-room-header">
      <div><span className={`agora-live-dot${joined ? " active" : ""}`} aria-hidden="true" /><strong>{joined ? "Live tasting video" : "Join the tasting video"}</strong>{joined && <small>{visibleVideoCount} {visibleVideoCount === 1 ? "camera" : "cameras"}</small>}</div>
      {joined && <button className="btn btn-quiet agora-collapse" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed}>{collapsed ? "Show video" : "Hide video"}</button>}
    </header>
    <div className="agora-room-body">
      {!joined && <div className="agora-room-entry">
        <p>Tea guidance, conversation, and your tasting tools stay together on this screen.</p>
        <button className="btn btn-gold btn-attention" disabled={status === "joining"} onClick={connectRoom}>{entryLabel}</button>
        <p className="help">Your browser will ask permission before anything is shared.</p>
      </div>}
      {joined && <>
        {presentation === "host" && <div className="agora-view-controls" aria-label="Video layout">
          <button className={`btn ${videoLayout === "speaker" ? "btn-gold" : "btn-secondary"}`} onClick={() => setVideoLayout("speaker")} aria-pressed={videoLayout === "speaker"}>Speaker view</button>
          <button className={`btn ${videoLayout === "grid" ? "btn-gold" : "btn-secondary"}`} onClick={() => setVideoLayout("grid")} aria-pressed={videoLayout === "grid"}>Grid view</button>
        </div>}
        <div className="agora-video-stage">
          <div className={`agora-video-grid${speakerView ? " agora-video-grid-speaker" : " agora-video-grid-gallery"}`}>
            {speakerView && !activeSpeakerId && <div className="agora-speaker-empty"><strong>Active speaker</strong><span>The person speaking will appear here.</span></div>}
            {presentation !== "host" && localVideoTile}
            {visibleRemoteUsers.map((user, index) => <RemoteVideoTile key={String(user.uid)} user={user} label={participantLabel(user.uid, index)} active={speakerView && activeSpeakerId === String(user.uid)} />)}
            {visibleRemoteUsers.length === 0 && <div className="agora-waiting-tile"><span>Waiting for guest cameras…</span></div>}
          </div>
          {presentation === "host" && localVideoTile}
        </div>
        {progress && <div className="notice" role="status" aria-live="polite">{progress}</div>}
        {microphoneError && <div className="notice error" role="alert">{microphoneError}</div>}
        {cameraError && <div className="notice error" role="alert">{cameraError}</div>}
        <div className="agora-controls">
          <button className={`btn ${micOn ? "btn-secondary" : "btn-gold"}`} disabled={microphoneBusy} onClick={toggleMicrophone} aria-pressed={hasMicrophone ? !micOn : undefined}>{microphoneBusy ? "Opening mic…" : !hasMicrophone ? "Retry mic" : micOn ? "Mute" : "Unmute"}</button>
          <button className={`btn ${cameraOn ? "btn-secondary" : "btn-gold"}`} disabled={cameraBusy} onClick={toggleCamera} aria-pressed={hasCamera ? !cameraOn : undefined}>{cameraBusy ? "Opening camera…" : !hasCamera ? "Retry camera" : cameraOn ? "Camera off" : "Camera on"}</button>
          {presentation === "host" && <button className="btn btn-secondary" onClick={restartRoom}>Restart video</button>}
          <button className="btn btn-danger" onClick={leaveRoom}>Leave video</button>
        </div>
        {presentation === "host" && <p className="help" style={{ marginBottom: 0 }}>Restarting or leaving video does not end or reset the tasting.</p>}
      </>}
      {connectionError && <div className="notice error" role="alert">{connectionError}</div>}
    </div>
  </section>;
}

function RemoteVideoTile({ user, label, active }: { user: IAgoraRTCRemoteUser; label: string; active: boolean }) {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const videoTrack = user.videoTrack;
  useEffect(() => {
    if (!videoRef.current || !videoTrack) return;
    videoTrack.play(videoRef.current, { fit: "cover" });
  }, [videoTrack]);
  return <article className={`agora-video-tile${active ? " agora-video-tile-active" : ""}`}><div ref={videoRef} className="agora-video-surface" /><span>{label}</span></article>;
}

function participantLabel(uid: UID, guestIndex: number) {
  return String(uid).startsWith("host_") ? "Vintage Fork host" : `Tasting guest ${guestIndex + 1}`;
}
