"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getInterfaceFeedbackVibrationMs,
  INTERFACE_FEEDBACK_EVENT,
  INTERFACE_FEEDBACK_STORAGE_KEY,
  resolveInterfaceFeedbackEnabled,
  type InterfaceFeedbackKind
} from "@/lib/interface-feedback";

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  VintageForkMobile?: { postMessage: (message:string)=>void };
};
let interfaceAudioContext: AudioContext | null = null;

export function InterfaceFeedback() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const defaultEnabled = !pathname.startsWith("/event/");
    const syncStoredPreference = () => {
      try {
        setEnabled(resolveInterfaceFeedbackEnabled(localStorage.getItem(INTERFACE_FEEDBACK_STORAGE_KEY), defaultEnabled));
      } catch {
        setEnabled(defaultEnabled);
      }
    };
    const syncEventPreference = (event: Event) => setEnabled((event as CustomEvent<boolean>).detail);
    const syncStoragePreference = (event: StorageEvent) => {
      if (event.key === INTERFACE_FEEDBACK_STORAGE_KEY) syncStoredPreference();
    };

    syncStoredPreference();
    window.addEventListener(INTERFACE_FEEDBACK_EVENT, syncEventPreference);
    window.addEventListener("storage", syncStoragePreference);
    return () => {
      window.removeEventListener(INTERFACE_FEEDBACK_EVENT, syncEventPreference);
      window.removeEventListener("storage", syncStoragePreference);
    };
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;

    const handleInterfaceClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLButtonElement | HTMLAnchorElement>("button, a.btn");
      if (!control) return;
      if (control.hasAttribute("data-feedback-silent")) return;
      if (control instanceof HTMLButtonElement && control.disabled) return;
      if (control.getAttribute("aria-disabled") === "true") return;

      const requestedKind = control.getAttribute("data-feedback-kind");
      const isSelection = control.matches(".descriptor, [role='radio'], [aria-pressed]");
      const kind: InterfaceFeedbackKind = requestedKind === "confirm" || requestedKind === "selection"
        ? requestedKind
        : isSelection ? "selection" : "tap";
      playInterfaceFeedback(kind);
    };

    document.addEventListener("click", handleInterfaceClick, true);
    return () => document.removeEventListener("click", handleInterfaceClick, true);
  }, [enabled]);

  return null;
}

export function FeedbackToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const readPreference = () => {
      try {
        setEnabled(resolveInterfaceFeedbackEnabled(localStorage.getItem(INTERFACE_FEEDBACK_STORAGE_KEY), true));
      } catch {
        setEnabled(true);
      }
    };
    const syncEventPreference = (event: Event) => setEnabled((event as CustomEvent<boolean>).detail);
    const syncStoragePreference = (event: StorageEvent) => {
      if (event.key === INTERFACE_FEEDBACK_STORAGE_KEY) readPreference();
    };

    readPreference();
    window.addEventListener(INTERFACE_FEEDBACK_EVENT, syncEventPreference);
    window.addEventListener("storage", syncStoragePreference);
    return () => {
      window.removeEventListener(INTERFACE_FEEDBACK_EVENT, syncEventPreference);
      window.removeEventListener("storage", syncStoragePreference);
    };
  }, []);

  return <button
    className="btn btn-quiet feedback-toggle"
    type="button"
    aria-pressed={enabled}
    aria-label={`Button sound and haptic feedback ${enabled ? "on" : "off"}`}
    onClick={() => setInterfaceFeedbackPreference(!enabled)}
  ><span aria-hidden="true">♪</span><span className="feedback-toggle-copy">{enabled ? "Feedback on" : "Feedback off"}</span></button>;
}

export function setInterfaceFeedbackPreference(enabled: boolean) {
  try { localStorage.setItem(INTERFACE_FEEDBACK_STORAGE_KEY, enabled ? "on" : "off"); } catch { /* Preferences are optional. */ }
  window.dispatchEvent(new CustomEvent<boolean>(INTERFACE_FEEDBACK_EVENT, { detail: enabled }));
  if (enabled) playInterfaceFeedback("confirm");
}

export function playInterfaceFeedback(kind: InterfaceFeedbackKind) {
  playInterfaceSound(kind);
  try {
    const duration = getInterfaceFeedbackVibrationMs(kind, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (duration && typeof navigator.vibrate === "function") navigator.vibrate(duration);
  } catch { /* Haptics are an optional enhancement. */ }
}

export function playInterfaceSound(kind: InterfaceFeedbackKind) {
  try {
    const AudioContextConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) return;
    if (!interfaceAudioContext || interfaceAudioContext.state === "closed") interfaceAudioContext = new AudioContextConstructor();
    const context = interfaceAudioContext;
    const play = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const duration = kind === "confirm" ? .11 : kind === "selection" ? .055 : .04;
      const peak = kind === "confirm" ? .018 : kind === "selection" ? .009 : .006;
      oscillator.type = kind === "confirm" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(kind === "confirm" ? 980 : kind === "selection" ? 720 : 560, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === "confirm" ? 1320 : kind === "selection" ? 620 : 470, now + duration);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + .005);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + .01);
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch { /* Interface sound is an optional enhancement. */ }
}

export function playTeaCheersFeedback(kind:"personal"|"collective",enabled:boolean,reducedMotion:boolean){
  if(!enabled)return;
  playTeaCheersSound(kind);
  if(reducedMotion)return;
  let sentToMobile=false;
  try{
    const mobile=(window as AudioWindow).VintageForkMobile;
    if(mobile){mobile.postMessage(JSON.stringify({type:"teaCheersFeedback",event:kind}));sentToMobile=true}
  }catch{/* Fall through to the web haptic when a shell bridge is unavailable. */}
  try{if(!sentToMobile&&typeof navigator.vibrate==="function")navigator.vibrate(kind==="personal"?8:18)}
  catch{/* Haptics remain optional on unsupported devices. */}
}

export function playGoldLeafRewardFeedback(enabled:boolean,reducedMotion:boolean){
  if(!enabled)return;
  try{
    const AudioContextConstructor=window.AudioContext||(window as AudioWindow).webkitAudioContext;
    if(AudioContextConstructor){
      if(!interfaceAudioContext||interfaceAudioContext.state==="closed")interfaceAudioContext=new AudioContextConstructor();
      const context=interfaceAudioContext;
      const play=()=>{
        const now=context.currentTime;
        for(const voice of [{frequency:420,delay:0,peak:.008},{frequency:630,delay:.07,peak:.011},{frequency:840,delay:.14,peak:.007}]){
          const start=now+voice.delay;const oscillator=context.createOscillator();const gain=context.createGain();
          oscillator.type="triangle";oscillator.frequency.setValueAtTime(voice.frequency,start);oscillator.frequency.exponentialRampToValueAtTime(voice.frequency*.84,start+.16);
          gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(voice.peak,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+.2);
          oscillator.connect(gain).connect(context.destination);oscillator.start(start);oscillator.stop(start+.21);
        }
      };
      if(context.state==="suspended")void context.resume().then(play).catch(()=>undefined);else play();
    }
  }catch{/* The restrained leaf cue is optional. */}
  if(reducedMotion)return;
  let sentToMobile=false;
  try{const mobile=(window as AudioWindow).VintageForkMobile;if(mobile){mobile.postMessage(JSON.stringify({type:"goldLeafRewardFeedback",event:"eventComplete"}));sentToMobile=true}}
  catch{/* Fall through to web haptics. */}
  try{if(!sentToMobile&&typeof navigator.vibrate==="function")navigator.vibrate(14)}catch{/* Haptics are optional. */}
}

function playTeaCheersSound(kind:"personal"|"collective"){
  try{
    const AudioContextConstructor=window.AudioContext||(window as AudioWindow).webkitAudioContext;
    if(!AudioContextConstructor)return;
    if(!interfaceAudioContext||interfaceAudioContext.state==="closed")interfaceAudioContext=new AudioContextConstructor();
    const context=interfaceAudioContext;
    const play=()=>{
      const now=context.currentTime;
      const voices=kind==="collective"
        ? [{frequency:680,delay:0,peak:.018},{frequency:910,delay:.045,peak:.014},{frequency:540,delay:.08,peak:.01}]
        : [{frequency:760,delay:0,peak:.008}];
      for(const voice of voices){
        const start=now+voice.delay;
        const oscillator=context.createOscillator();
        const gain=context.createGain();
        oscillator.type="triangle";
        oscillator.frequency.setValueAtTime(voice.frequency,start);
        oscillator.frequency.exponentialRampToValueAtTime(voice.frequency*.72,start+.09);
        gain.gain.setValueAtTime(.0001,start);
        gain.gain.exponentialRampToValueAtTime(voice.peak,start+.004);
        gain.gain.exponentialRampToValueAtTime(.0001,start+.13);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start+.14);
      }
    };
    if(context.state==="suspended")void context.resume().then(play).catch(()=>undefined);
    else play();
  }catch{/* Ceramic sound is an optional enhancement. */}
}
