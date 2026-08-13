"use client";

import { useEffect, useRef, useState } from "react";
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import {
  AGORA_OPERATION_TIMEOUT_MS,
  agoraErrorCode,
  selectAgoraVideoCodec,
  withAgoraTimeout
} from "@/lib/agora-session";

type Mode = "direct" | "secure-proxy";
type Credentials = { appId: string; channel: string; account: string; token: string; expiresAt: string };
type DiagnosticEntry = { stage: string; at: string; detail?: string };

export function AgoraDiagnostic() {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const cameraRef = useRef<ICameraVideoTrack | null>(null);
  const videoRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState<Mode | null>(null);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);

  useEffect(() => () => { void stop(); }, []);

  async function report(stage: string, details: Record<string, unknown> = {}) {
    const detail = [details.code, details.current, details.reason, details.message].filter(Boolean).join(" · ");
    setEntries(current => [...current, { stage, at: new Date().toLocaleTimeString("en-CA"), detail }]);
    await fetch("/api/admin/agora-diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report", diagnostic: { stage, ...details } }),
      cache: "no-store"
    }).catch(() => undefined);
  }

  async function getCredentials() {
    const response = await fetch("/api/admin/agora-diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "token" }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({})) as Partial<Credentials> & { error?: string };
    if (!response.ok || !payload.appId || !payload.channel || !payload.account || !payload.token) throw new Error(payload.error ?? "Diagnostic token unavailable.");
    return payload as Credentials;
  }

  async function run(mode: Mode) {
    if (running) return;
    await stop();
    setRunning(mode);
    setResult("idle");
    setEntries([]);
    const startedAt = Date.now();
    try {
      await report("browser", {
        mode,
        browser: navigator.userAgent,
        online: navigator.onLine,
        secureContext: window.isSecureContext
      });
      const credentials = await getCredentials();
      await report("token-ready", { mode, elapsedMs: Date.now() - startedAt });
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
      const compatible = AgoraRTC.checkSystemRequirements();
      const codecs = await AgoraRTC.getSupportedCodec();
      await report("capabilities", { mode, sdk: AgoraRTC.VERSION, compatible, codecs });
      if (!compatible) throw Object.assign(new Error("This browser does not support Agora WebRTC."), { code: "NOT_SUPPORTED" });

      const codec = selectAgoraVideoCodec(codecs.video);
      const client = AgoraRTC.createClient({ mode: "rtc", codec });
      clientRef.current = client;
      client.on("connection-state-change", (current, previous, reason) => { void report("connection-state", { mode, current, previous, reason, elapsedMs: Date.now() - startedAt }); });
      client.on("peerconnection-state-change", (current, previous) => { void report("peerconnection-state", { mode, current, previous, elapsedMs: Date.now() - startedAt }); });
      client.on("is-using-cloud-proxy", usingProxy => { void report("cloud-proxy-state", { mode, usingProxy }); });
      client.on("exception", event => { void report("agora-exception", { mode, code: event.code, message: event.msg }); });
      AgoraRTC.on("security-policy-violation", () => { void report("security-policy-violation", { mode }); });
      if (mode === "secure-proxy") client.startProxyServer(5);

      await report("join-start", { mode, codecs, elapsedMs: Date.now() - startedAt });
      await withAgoraTimeout(
        client.join(credentials.appId, credentials.channel, credentials.token, credentials.account),
        mode === "secure-proxy" ? 60_000 : 30_000,
        `${mode} join timed out.`
      );
      await report("join-success", { mode, current: client.connectionState, elapsedMs: Date.now() - startedAt });
      await report("media-start", { mode });
      const [microphone, camera] = await withAgoraTimeout(
        AgoraRTC.createMicrophoneAndCameraTracks({ AEC: true, ANS: true, AGC: true }, { encoderConfig: "480p_1" }),
        30_000,
        "Camera and microphone permission timed out."
      );
      micRef.current = microphone;
      cameraRef.current = camera;
      if (videoRef.current) camera.play(videoRef.current, { fit: "cover", mirror: true });
      await withAgoraTimeout(client.publish([microphone, camera]), AGORA_OPERATION_TIMEOUT_MS.publish, "Publishing video timed out.");
      await report("publish-success", { mode, current: client.connectionState, elapsedMs: Date.now() - startedAt });
      setResult("success");
    } catch (error) {
      await report("test-failed", {
        mode,
        code: agoraErrorCode(error),
        message: error instanceof Error ? error.message : String(error),
        current: clientRef.current?.connectionState,
        elapsedMs: Date.now() - startedAt
      });
      setResult("error");
      await stop(false);
    } finally {
      setRunning(null);
    }
  }

  async function stop(resetResult = true) {
    micRef.current?.close();
    cameraRef.current?.close();
    micRef.current = null;
    cameraRef.current = null;
    const client = clientRef.current;
    clientRef.current = null;
    client?.removeAllListeners();
    await client?.leave().catch(() => undefined);
    if (resetResult) setResult("idle");
  }

  return <section className="card" style={{ marginTop: 24 }}>
    <div className="row" style={{ alignItems: "stretch" }}>
      <button className="btn btn-primary" disabled={Boolean(running)} onClick={() => run("direct")}>{running === "direct" ? "Testing direct…" : "Test direct connection"}</button>
      <button className="btn btn-gold" disabled={Boolean(running)} onClick={() => run("secure-proxy")}>{running === "secure-proxy" ? "Testing secure proxy…" : "Test secure proxy"}</button>
      {clientRef.current && <button className="btn btn-danger" onClick={() => stop()}>Stop test</button>}
    </div>
    <p className="help">Run each test separately. A test can take up to 60 seconds. Allow camera and microphone if Safari asks.</p>
    <div ref={videoRef} className="agora-video-tile" style={{ position: "relative", minHeight: 240, maxWidth: 420, marginTop: 16 }} />
    {result === "success" && <div className="notice success" role="status"><strong>Video connected and published successfully.</strong></div>}
    {result === "error" && <div className="notice error" role="alert"><strong>The test failed.</strong> The final row below identifies the exact stage and reference code.</div>}
    <div className="table-wrap" style={{ marginTop: 16 }}><table><thead><tr><th>Time</th><th>Stage</th><th>Detail</th></tr></thead><tbody>
      {entries.map((entry, index) => <tr key={`${entry.at}-${entry.stage}-${index}`}><td>{entry.at}</td><td><strong>{entry.stage}</strong></td><td>{entry.detail || "—"}</td></tr>)}
      {entries.length === 0 && <tr><td colSpan={3}>Choose a connection test to begin.</td></tr>}
    </tbody></table></div>
  </section>;
}
