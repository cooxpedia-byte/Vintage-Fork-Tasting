"use client";

import { useEffect, useRef, useState } from "react";
import type {
  IAgoraRTC,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  UID
} from "agora-rtc-sdk-ng";
import {
  AGORA_OPERATION_TIMEOUT_MS,
  describeMediaError,
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

  function configureClient(client: IAgoraRTCClient) {
    const refreshRemoteUsers = () => setRemoteUsers([...client.remoteUsers]);
    client.on("user-published", (user, mediaType) => {
      void client.subscribe(user, mediaType).then(() => {
        if (mediaType === "audio") user.audioTrack?.play();
        refreshRemoteUsers();
      }).catch(() => setConnectionError("A participant’s media could not be loaded. Reconnect video to retry."));
    });
    client.on("user-unpublished", refreshRemoteUsers);
    client.on("user-left", refreshRemoteUsers);
    client.on("connection-state-change", current => {
      if (current !== "DISCONNECTED" || intentionalLeaveRef.current || clientRef.current !== client) return;
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
    client.on("token-privilege-will-expire", () => {
      void fetchToken().then(next => client.renewToken(next.token)).catch(() => {
        setConnectionError("Video security needs refreshing. Use Restart video to reconnect safely.");
      });
    });
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

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;
      configureClient(client);
      setProgress("Joining the video room…");
      await withAgoraTimeout(
        client.join(credentials.appId, credentials.channel, credentials.token, credentials.account),
        AGORA_OPERATION_TIMEOUT_MS.join,
        "The video room took too long to connect."
      );
      if (attempt !== attemptRef.current) {
        client.removeAllListeners();
        await client.leave().catch(() => undefined);
        return;
      }

      setStatus("joined");
      setProgress("Connected. Opening microphone…");
      setRemoteUsers([...client.remoteUsers]);
      void initializeLocalMedia(AgoraRTC, client, attempt);
    } catch (joinError) {
      if (attempt !== attemptRef.current) return;
      await releaseClient();
      setStatus("error");
      setProgress("");
      setConnectionError(joinError instanceof Error ? joinError.message : "The video room could not be opened.");
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
  }

  const joined = status === "joined";
  const roomClass = `agora-room agora-room-${presentation}${collapsed ? " agora-room-collapsed" : ""}`;
  const entryLabel = status === "joining" ? (progress || "Connecting to video…") : status === "error" ? "Reconnect video" : "Join with camera & mic";

  return <section className={roomClass} aria-label="Live tasting video room">
    <header className="agora-room-header">
      <div><span className={`agora-live-dot${joined ? " active" : ""}`} aria-hidden="true" /><strong>{joined ? "Live tasting video" : "Join the tasting video"}</strong>{joined && <small>{remoteUsers.length + 1} in video</small>}</div>
      {joined && <button className="btn btn-quiet agora-collapse" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed}>{collapsed ? "Show video" : "Hide video"}</button>}
    </header>
    <div className="agora-room-body">
      {!joined && <div className="agora-room-entry">
        <p>Tea guidance, conversation, and your tasting tools stay together on this screen.</p>
        <button className="btn btn-gold btn-attention" disabled={status === "joining"} onClick={connectRoom}>{entryLabel}</button>
        <p className="help">Your browser will ask permission before anything is shared.</p>
      </div>}
      {joined && <>
        <div className="agora-video-grid">
          <article className="agora-video-tile"><div ref={localVideoRef} className="agora-video-surface" /><span>{displayName} · you</span>{(!hasCamera || !cameraOn) && <div className="agora-camera-off">{cameraBusy ? "Opening camera…" : hasCamera ? "Camera off" : "Camera unavailable"}</div>}</article>
          {remoteUsers.map(user => <RemoteVideoTile key={String(user.uid)} user={user} />)}
          {remoteUsers.length === 0 && <div className="agora-waiting-tile"><span>Waiting for others…</span></div>}
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

function RemoteVideoTile({ user }: { user: IAgoraRTCRemoteUser }) {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const videoTrack = user.videoTrack;
  useEffect(() => {
    if (!videoRef.current || !videoTrack) return;
    videoTrack.play(videoRef.current, { fit: "cover" });
  }, [videoTrack]);
  return <article className="agora-video-tile"><div ref={videoRef} className="agora-video-surface" /><span>{participantLabel(user.uid)}</span>{!videoTrack && <div className="agora-camera-off">Camera off</div>}</article>;
}

function participantLabel(uid: UID) {
  return String(uid).startsWith("host_") ? "Vintage Fork host" : "Tasting guest";
}
