import { useEffect, useState } from "react";
import { api, type VoiceConfig } from "../api";

export function VoiceAddon({ onError }: { onError: (message: string) => void }) {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.voice().then(setConfig).catch(e => onError(e.message)); }, []);
  if (!config) return null;
  const update = (patch: Partial<VoiceConfig>) => { setConfig({ ...config, ...patch }); setSaved(false); };
  return <div className="mt-4 rounded-xl border border-line bg-raised/40 p-3 space-y-3">
    <div><p className="text-sm text-fg">Voice</p><p className="mt-1 text-xs text-fg-faint">Hands-free conversations with Whisper and Breeze-TTS-2. Automatic speech detection and interruption run in your browser.</p></div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.enabled} onChange={e => update({ enabled: e.target.checked })} />Enable voice controls in sessions</label>
    <p className="text-xs text-fg-faint">Start the voice services on your GPU host using the Voice setup guide. Microphone access requires HTTPS or localhost.</p>
    <label className="block text-xs text-fg-muted">Input language<select className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs" value={config.language || "auto"} onChange={e => update({ language: e.target.value })}>{[["auto", "Auto-detect"], ["en", "English"], ["hi", "Hindi"], ["bn", "Bengali"], ["ta", "Tamil"], ["te", "Telugu"], ["mr", "Marathi"], ["gu", "Gujarati"], ["kn", "Kannada"], ["ml", "Malayalam"], ["ur", "Urdu"], ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"], ["ar", "Arabic"], ["ru", "Russian"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <p className="text-xs text-fg-faint">Choose the language you are speaking to avoid language guessing on short turns. Use Auto-detect when switching languages. Recognition quality depends on the Whisper model.</p>
    <label className="block text-xs text-fg-muted">Speech generation<select className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs" value={config.cfgScale ?? 4} onChange={e => update({ cfgScale: Number(e.target.value) })}><option value={1}>Fast · lighter voice guidance</option><option value={4}>Expressive · stronger voice guidance</option></select></label>
    <label className="block text-xs text-fg-muted">Speaking voice<select className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs" value={config.voice || "design"} onChange={e => update({ voice: e.target.value as "design" | "aria" })}><option value="design">Designed voice</option><option value="aria">Aria · reference clone</option></select></label>
    <label className="block text-xs text-fg-muted">Speech runtime<select className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs" value={config.runtime ?? "breeze"} onChange={e => update({ runtime: e.target.value as "breeze" | "audio-cpp" })}><option value="breeze">Breeze Python</option><option value="audio-cpp">Breeze audio.cpp · streaming</option></select></label>
    {([['whisperUrl', 'Whisper inference URL'], ['breezeUrl', 'Breeze speech URL'], ['instruction', 'Describe the speaking voice']] as const).map(([key, label]) => <label key={key} className="block text-xs text-fg-muted">{label}<input className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs" value={config[key]} onChange={e => update({ [key]: e.target.value })} /></label>)}
    <button disabled={busy} className="rounded-lg bg-accent/12 px-3 py-1.5 text-xs text-accent disabled:opacity-40" onClick={async () => {
      setBusy(true); try { setConfig(await api.setVoice(config)); setSaved(true); window.dispatchEvent(new Event('voice-config-changed')); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
    }}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save voice settings'}</button>
  </div>;
}
