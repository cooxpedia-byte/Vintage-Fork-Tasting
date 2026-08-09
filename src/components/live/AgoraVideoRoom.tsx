"use client";

import { useEffect, useRef, useState } from "react";
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  UID
} from "agora-rtc-sdk-ng";

type RoomToken = {
  appId: string;
  channel: string;
  account: string;
  token: string;
  expiresAt: string;
};

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
  const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const videoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [error, setError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [localTrackReady, setLocalTrackReady] = useState(false);
  const localVideoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = localVideoRef.current;
    const track = videoTrackRef.current;
    if (!node || !track || !localTrackReady) return;
    track.play(node, { fit: "cover", mirror: true });
  }, [localTrackReady, collapsed]);

  useEffect(() => () => {
    audioTrackRef.current?.close();
    videoTrackRef.current?.close();
    clientRef.current?.removeAllListeners();
    void clientRef.current?.leave();
  }, []);

  async function fetchToken() {
    const result = await fetch(`/api/events/${eventId}/agora-token`, {
      method: "POST",
      cache: "no-store"
    });
    const payload = await result.json().catch(() => ({})) as Partial<RoomToken> & { error?: string };
    if (!result.ok || !payload.appId || !payload.channel || !payload.account || !payload.token) {
      throw new Error(payload.error ?? "The secure video room is unavailable.");
    }
    return payload as RoomToken;
  }

  async function joinRoom() {
    if (status === "joining" || status === "joined") return;
    setStatus("joining");
    setError("");
    try {
      const credentials = await fetchToken();
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      const refreshRemoteUsers = () => setRemoteUsers([...client.remoteUsers]);
      client.on("user-published", (user, mediaType) => {
        void client.subscribe(user, mediaType).then(() => {
          if (mediaType === "audio") user.audioTrack?.play();
          refreshRemoteUsers();
        });
      });
      client.on("user-unpublished", refreshRemoteUsers);
      client.on("user-left", refreshRemoteUsers);
      client.on("token-privilege-will-expire", () => {
        void fetchToken().then(next => client.renewToken(next.token)).catch(() => {
          setError("Video security needs refreshing. Leave and rejoin the room.");
        });
      });

      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        { AEC: true, ANS: true, AGC: true },
        { encoderConfig: "480p_1" }
      );
      audioTrackRef.current = audioTrack;
      videoTrackRef.current = videoTrack;
      await client.join(credentials.appId, credentials.channel, credentials.token, credentials.account);
      await client.publish([audioTrack, videoTrack]);
      setLocalTrackReady(true);
      refreshRemoteUsers();
      setStatus("joined");
    } catch (joinError) {
      audioTrackRef.current?.close();
      videoTrackRef.current?.close();
      audioTrackRef.current = null;
      videoTrackRef.current = null;
      clientRef.current?.removeAllListeners();
      await clientRef.current?.leave().catch(() => undefined);
      clientRef.current = null;
      setStatus("error");
      setError(joinError instanceof Error ? joinError.message : "The video room could not be opened.");
    }
  }

  async function leaveRoom() {
    audioTrackRef.current?.close();
    videoTrackRef.current?.close();
    audioTrackRef.current = null;
    videoTrackRef.current = null;
    clientRef.current?.removeAllListeners();
    await clientRef.current?.leave().catch(() => undefined);
    clientRef.current = null;
    setRemoteUsers([]);
    setLocalTrackReady(false);
    setMicOn(true);
    setCameraOn(true);
    setStatus("idle");
    setError("");
  }

  async function toggleMicrophone() {
    const next = !micOn;
    await audioTrackRef.current?.setEnabled(next);
    setMicOn(next);
  }

  async function toggleCamera() {
    const next = !cameraOn;
    await videoTrackRef.current?.setEnabled(next);
    setCameraOn(next);
  }

  const joined = status === "joined";
  const roomClass = `agora-room agora-room-${presentation}${collapsed ? " agora-room-collapsed" : ""}`;
  return <section className={roomClass} aria-label="Live tasting video room">
    <header className="agora-room-header">
      <div><span className={`agora-live-dot${joined ? " active" : ""}`} aria-hidden="true" /><strong>{joined ? "Live tasting video" : "Join the tasting video"}</strong>{joined && <small>{remoteUsers.length + 1} in video</small>}</div>
      {joined && <button className="btn btn-quiet agora-collapse" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed}>{collapsed ? "Show video" : "Hide video"}</button>}
    </header>
    <div className="agora-room-body">
      {!joined && <div className="agora-room-entry"><p>Tea guidance, conversation, and your tasting tools stay together on this screen.</p><button className="btn btn-gold btn-attention" disabled={status === "joining"} onClick={joinRoom}>{status === "joining" ? "Opening camera…" : "Join with camera & mic"}</button><p className="help">Your browser will ask permission before anything is shared.</p></div>}
      {joined && <>
        <div className="agora-video-grid">
          <article className="agora-video-tile"><div ref={localVideoRef} className="agora-video-surface" /><span>{displayName} · you</span>{!cameraOn && <div className="agora-camera-off">Camera off</div>}</article>
          {remoteUsers.map(user => <RemoteVideoTile key={String(user.uid)} user={user} />)}
          {remoteUsers.length === 0 && <div className="agora-waiting-tile"><span>Waiting for others…</span></div>}
        </div>
        <div className="agora-controls">
          <button className={`btn ${micOn ? "btn-secondary" : "btn-gold"}`} onClick={toggleMicrophone} aria-pressed={!micOn}>{micOn ? "Mute" : "Unmute"}</button>
          <button className={`btn ${cameraOn ? "btn-secondary" : "btn-gold"}`} onClick={toggleCamera} aria-pressed={!cameraOn}>{cameraOn ? "Camera off" : "Camera on"}</button>
          <button className="btn btn-danger" onClick={leaveRoom}>Leave video</button>
        </div>
      </>}
      {error && <div className="notice error" role="alert">{error}</div>}
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
