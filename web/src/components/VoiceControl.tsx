import { useCallback, useEffect, useRef, useState } from "react";
import { voiceCue, type VoiceCue } from "../voice-cues";
import { createPortal } from "react-dom";
import { VoiceStage, type VoiceLevels } from "./VoiceStage";
import { LuMic, LuLoaderCircle } from "react-icons/lu";
import type { MicVAD } from "@ricky0123/vad-web";
import { api, type PortalEvent } from "../api";
import type { Item } from "../transcript";
import { LiveTranscription } from "../live-transcription";
import { preparePcmSpeech, readPcmStream, playAudioBuffer } from "../pcm-stream";
import { samplesWav } from "../voice";
import { HandsFreeVoice, type VoicePhase } from "../hands-free";

export function VoiceControl({ canvasOpen, onCanvasMinimize, sessionId, items, running, onSend, onAbort, stageTarget, onModeChange, title, browserAvailable, browserActivity, terminalActivity, toolEvents }: {
  sessionId: string;
  canvasOpen: boolean; onCanvasMinimize: () => void;
  stageTarget: HTMLElement | null;
  onModeChange: (active: boolean) => void;
  title: string;
  browserAvailable: boolean; browserActivity: number; terminalActivity: number; toolEvents: PortalEvent[];
  items: Item[];
  running: boolean;
  onSend: (text: string, options?: { voice?: boolean }) => Promise<void>;
  onAbort: () => Promise<void>;
}) {
  const [sounds, setSounds] = useState(() => localStorage.getItem('voiceSounds') !== 'off');
  const soundsEnabled = useRef(sounds); soundsEnabled.current = sounds;
  const soundContext = useRef<AudioContext | null>(null);
  const cue = useCallback((kind: VoiceCue) => { if (soundsEnabled.current && soundContext.current) voiceCue(soundContext.current, kind); }, []);
  const toggleSounds = () => setSounds(value => { localStorage.setItem('voiceSounds', value ? 'off' : 'on'); return !value; });
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("Listening");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const transcription = useRef<LiveTranscription | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const mutedRef = useRef(false);
  const muteBusy = useRef(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const levels = useRef<VoiceLevels>({ input: 0, output: 0 });
  const compactionEvent = [...toolEvents].reverse().find(event => event.type === 'compaction_start' || event.type === 'compaction_end');
  const compacting = running && compactionEvent?.type === 'compaction_start';
  const latest = useRef({ items, running, onSend, onAbort, compacting });
  latest.current = { items, running, onSend, onAbort, compacting };
  const epoch = useRef(0);
  const mounted = useRef(false);
  const voice = useRef<HandsFreeVoice | null>(null);
  const vad = useRef<MicVAD | null>(null);
  const context = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const maxTurn = useRef<ReturnType<typeof setTimeout>>();

  const stop = () => {
    epoch.current++;
    const sound = soundContext.current; soundContext.current = null;
    if (sound) { if (soundsEnabled.current && mounted.current) voiceCue(sound, 'end'); setTimeout(() => { if (sound.state !== 'closed') void sound.close(); }, 180); }
    mutedRef.current = false;
    levels.current = { input: 0, output: 0 };
    clearTimeout(maxTurn.current);
    voice.current?.stop(); voice.current = null;
    transcription.current?.reset(); transcription.current = null;
    const detector = vad.current; vad.current = null;
    void detector?.destroy().catch(() => {});
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    const audio = context.current; context.current = null;
    if (audio && audio.state !== "closed") void audio.close();
    if (mounted.current) { setEnabled(false); setStarting(false); setMuted(false); setSpeaking(false); setTranscript(""); }
  };
  useEffect(() => {
    mounted.current = true;
    const load = () => api.voice().then(config => {
      if (!mounted.current) return;
      setAvailable(config.enabled);
      if (!config.enabled) stop();
    }).catch(() => { if (mounted.current) { setAvailable(false); stop(); } });
    void load();
    window.addEventListener("voice-config-changed", load);
    return () => { mounted.current = false; window.removeEventListener("voice-config-changed", load); stop(); };
  }, []);
  useEffect(() => {
    voice.current?.setCompacting(compacting, compactionEvent?.type === 'compaction_end' && !compactionEvent.payload?.aborted && !compactionEvent.payload?.errorMessage);
    voice.current?.observe(items);
    if (compacting) transcription.current?.discard();
  }, [items, running, compacting, compactionEvent]);
  useEffect(() => {
    onModeChange(enabled || starting);
    return () => onModeChange(false);
  }, [enabled, starting, onModeChange]);

  const toggleMute = async () => {
    const detector = vad.current;
    if (!detector || muteBusy.current) return;
    const version = epoch.current;
    const next = !mutedRef.current;
    muteBusy.current = true;
    mutedRef.current = next;
    setMuted(next); cue(next ? "mute" : "unmute");
    clearTimeout(maxTurn.current);
    levels.current.input = 0;
    voice.current?.setMuted(next);
    if (next) transcription.current?.reset();
    try {
      if (next) {
        stream.current?.getTracks().forEach(track => { track.enabled = false; });
        detector.setOptions({ submitUserSpeechOnPause: false });
        await detector.pause();
      } else {
        detector.setOptions({ submitUserSpeechOnPause: true });
        stream.current?.getTracks().forEach(track => { track.enabled = true; });
        await detector.start();
      }
    } catch (e) {
      if (epoch.current === version) { setError((e as Error).message); stop(); }
    } finally { muteBusy.current = false; }
  };
  const endMode = () => {
    stop();
    requestAnimationFrame(() => startButton.current?.focus({ preventScroll: true }));
  };

  const synthesize = async (text: string, signal: AbortSignal, audio: AudioContext) => {
    // The previous cancelled request may still be releasing Breeze's GPU lock.
    let response: Response;
    const deadline = Date.now() + 15000;
    do {
      signal.throwIfAborted();
      response = await fetch(`/api/sessions/${sessionId}/voice/speech`, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "audio/pcm" },
        body: JSON.stringify({ text }), signal,
      });
      if (response.ok) break;
      const failure = await response.json().catch(() => ({}));
      // Older portal processes wrap Breeze's busy response in HTTP 502. This
      // also permits updating the UI without restarting an active session.
      const busy = response.status === 409 && failure.error === "Breeze is finishing another request"
        || response.status === 502 && /^Breeze returned HTTP 409/.test(failure.error || "");
      if (!busy || Date.now() >= deadline) throw new Error(failure.error || "Speech generation failed");
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, 500);
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
      });
    } while (true);
    if (!response.ok) throw new Error((await response.json()).error || "Speech generation failed");
    let buffer: AudioBuffer | undefined;
    let stream: Awaited<ReturnType<typeof preparePcmSpeech>> | undefined;
    if (response.headers.get("content-type")?.startsWith("audio/pcm")) {
      if (response.headers.get("x-sample-rate") !== "24000" || !response.body) throw new Error("Unsupported speech stream");
      if (response.headers.get("x-voice-streaming") === "true") stream = await preparePcmSpeech(response.body, audio, signal);
      else buffer = await readPcmStream(response.body, audio, signal);
    } else {
      const bytes = await response.arrayBuffer(); signal.throwIfAborted();
      buffer = await audio.decodeAudioData(bytes); signal.throwIfAborted();
    }
    const play = async (playbackSignal: AbortSignal) => {
      playbackSignal.throwIfAborted();
      const analyser = audio.createAnalyser(); analyser.fftSize = 256;
      analyser.connect(audio.destination);
      const samples = new Float32Array(analyser.fftSize);
      let animation = 0;
      const meter = () => {
        analyser.getFloatTimeDomainData(samples);
        levels.current.output = Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 5);
        animation = requestAnimationFrame(meter);
      };
      try {
        const started = () => { setSpeaking(true); meter(); };
        if (stream) await stream.play(analyser, started);
        else await playAudioBuffer(buffer!, audio, analyser, playbackSignal, started);
      } finally {
        analyser.disconnect(); cancelAnimationFrame(animation); levels.current.output = 0;
        if (mounted.current) setSpeaking(false);
      }
    };
    return Object.assign(play, { completed: stream?.completed });
  };
  const start = async () => {
    if (voice.current || starting) { stop(); return; }
    const version = ++epoch.current;
    const current = () => mounted.current && epoch.current === version;
    setStarting(true); setError(""); setMuted(false); mutedRef.current = false;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("Microphone access requires HTTPS or localhost.");
      const sound = new AudioContext(); soundContext.current = sound;
      await sound.resume();
      if (!current()) return;
      const audio = new AudioContext(); context.current = audio;
      await audio.resume();
      if (!current()) return;
      const mic = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      if (!current()) { mic.getTracks().forEach(track => track.stop()); return; }
      stream.current = mic;
      const detectorModule = await import("@ricky0123/vad-web");
      if (!current()) return;
      const live = new LiveTranscription(async (samples, signal) => {
        const response = await fetch(`/api/sessions/${sessionId}/voice/transcribe`, {
          method: "POST", headers: { "Content-Type": "audio/wav" }, body: samplesWav(samples), signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Transcription failed");
        return result.text;
      }, text => { if (current()) setTranscript(text); });
      transcription.current = live;
      const controller = new HandsFreeVoice({
        transcribe: (samples, signal) => live.finish(samples, signal),
        send: text => { cue("sent"); return latest.current.onSend(text, { voice: true }); },
        abort: () => latest.current.onAbort(),
        agentRunning: () => latest.current.running,
        synthesize: (text, signal) => synthesize(text, signal, audio),
        phase: value => { if (current()) setPhase(value); },
        error: message => { if (current()) setError(message); },
      }, latest.current.items);
      voice.current = controller;
      controller.setCompacting(latest.current.compacting);
      const detector = await detectorModule.MicVAD.new({
        model: "v5", audioContext: audio, startOnLoad: false,
        baseAssetPath: "/voice-assets/", onnxWASMBasePath: "/voice-assets/",
        ortConfig: ort => { ort.env.wasm.numThreads = 1; },
        getStream: async () => mic,
        pauseStream: async () => {},
        resumeStream: async () => mic,
        positiveSpeechThreshold: 0.65, negativeSpeechThreshold: 0.35,
        minSpeechMs: 256, preSpeechPadMs: 320, redemptionMs: 1000,
        submitUserSpeechOnPause: true,
        onSpeechStart: () => { if (current() && !mutedRef.current && !latest.current.compacting) live.begin(); },
        onVADMisfire: () => { if (current()) live.discard(); },
        onFrameProcessed: (probabilities, frame) => {
          if (current() && !mutedRef.current && !latest.current.compacting) live.frame(probabilities.isSpeech, frame);
          if (current() && !mutedRef.current) levels.current.input = Math.min(1, Math.sqrt(frame.reduce((sum, value) => sum + value * value, 0) / frame.length) * 7);
        },
        onSpeechRealStart: () => {
          if (!current() || mutedRef.current) return;
          setError(""); if (latest.current.compacting) live.discard(); else live.confirm(); controller.speechStart();
          clearTimeout(maxTurn.current);
          maxTurn.current = setTimeout(async () => {
            if (!current() || !vad.current) return;
            // Bound recording size; keep the same mic stream while submitting
            // the segment and automatically listening for the continuation.
            const active = vad.current;
            try { await active.pause(); if (current()) await active.start(); }
            catch (e) { if (current()) { setError((e as Error).message); stop(); } }
          }, 60000);
        },
        onSpeechEnd: samples => {
          clearTimeout(maxTurn.current);
          if (current() && !mutedRef.current) { if (!latest.current.compacting) live.end(samples); controller.speechEnd(samples); }
        },
      });
      if (!current()) { await detector.destroy(); return; }
      vad.current = detector;
      for (const track of mic.getTracks()) track.onended = () => {
        if (current()) { setError("Microphone disconnected. Reconnect it and turn the mic on again."); stop(); }
      };
      await detector.start();
      if (!current()) return;
      setEnabled(true); setStarting(false); cue("start");
    } catch (e) {
      if (current()) { setError((e as Error).message); stop(); }
    }
  };

  if (!available) return null;
  return <>
    {(starting || enabled) && stageTarget && createPortal(
      <VoiceStage canvasOpen={canvasOpen} onCanvasMinimize={onCanvasMinimize} title={title} phase={phase} starting={starting} muted={muted} speaking={speaking}
        browserAvailable={browserAvailable} browserActivity={browserActivity} terminalActivity={terminalActivity} toolEvents={toolEvents} sounds={sounds} onSounds={toggleSounds} onCue={cue}
        levels={levels} transcript={transcript} error={error} onMute={toggleMute} onEnd={endMode} />, stageTarget,
    )}
    <div className="relative">
      {error && !enabled && !starting && <p role="alert" className="absolute bottom-full right-0 mb-3 w-64 rounded-xl border border-line bg-surface p-3 text-xs text-danger shadow-pop">{error}</p>}
      <button ref={startButton} type="button" onClick={start} aria-label="Turn on hands-free voice" title="Start voice conversation" className="prompt-action">
        {starting ? <LuLoaderCircle aria-hidden className="animate-spin" /> : <LuMic aria-hidden />}
      </button>
    </div>
  </>;
}
