import { useEffect, useState } from "react";
import { api, type VoiceInstallStatus, type VoiceConfig } from "../api";

export function VoiceAddon({ onError }: { onError: (message: string) => void }) {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [install, setInstall] = useState<VoiceInstallStatus | null>(null);
  useEffect(()=>{if(install?.state==='running')void api.voice().then(value=>{setConfig(value);window.dispatchEvent(new Event('voice-config-changed'));}).catch(e=>onError(e.message));},[install?.state]);
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => {
    let disposed=false, timer: ReturnType<typeof setTimeout>;
    const poll=async()=>{try { const state=await api.voiceInstallStatus(); if(!disposed)setInstall(state); } catch(e) { if(!disposed)setInstall({available:false,state:'unavailable',busy:false,progress:'',error:(e as Error).message}); } finally { if(!disposed)timer=setTimeout(poll,2500); }};
    void poll(); return ()=>{disposed=true;clearTimeout(timer);};
  },[]);
  const manage=async(action:'install'|'start'|'stop')=>{setActionBusy(true);try{await api.voiceAction(action);setInstall(await api.voiceInstallStatus());}catch(e){onError((e as Error).message);}finally{setActionBusy(false);}};
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.voice().then(setConfig).catch(e => onError(e.message)); }, []);
  if (!config) return null;
  const update = (patch: Partial<VoiceConfig>) => { setConfig({ ...config, ...patch }); setSaved(false); };
  return <div className="mt-4 rounded-xl border border-line bg-raised/40 p-3 space-y-3">
    <div><p className="text-sm text-fg">Voice</p><p className="mt-1 text-xs text-fg-faint">Hands-free conversations with Whisper and Breeze-TTS-2. Automatic speech detection and interruption run in your browser.</p></div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.enabled} onChange={e => update({ enabled: e.target.checked })} />Enable voice controls in sessions</label>
    <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between"><span className="text-xs font-medium">Local voice services</span><span className="text-xs text-fg-muted">{install?.state ?? 'Checking…'}</span></div>
      <p className="text-xs text-fg-faint">Automatic setup builds the runtime, downloads Breeze-TTS-2 in full precision, quantizes it to Q8, and installs multilingual Whisper on CPU. Requires Linux, Docker with NVIDIA GPU support, and about 30 GB of free disk space during setup.</p>
      <div className="flex gap-2 flex-wrap">
        {install?.available && <button disabled={actionBusy || install.busy || ['starting','running'].includes(install.state)} className="rounded-lg bg-accent/12 px-3 py-1.5 text-xs text-accent disabled:opacity-40" onClick={()=>manage(install.state==='absent'?'install':'start')}>{install.state==='absent'?'Install voice':install.state==='failed'?'Retry setup':'Start voice'}</button>}
        {install?.available && ['starting','running'].includes(install.state) && <button disabled={actionBusy} className="rounded-lg border border-line px-3 py-1.5 text-xs" onClick={()=>manage('stop')}>Stop · release VRAM</button>}
        {install?.state==='running' && <button disabled={busy} className="rounded-lg bg-accent/12 px-3 py-1.5 text-xs text-accent" onClick={async()=>{setBusy(true);try{setConfig(await api.connectVoice());window.dispatchEvent(new Event('voice-config-changed'));}catch(e){onError((e as Error).message);}finally{setBusy(false);}}}>Use installed voice</button>}
      </div>
      {install?.error && <p role="alert" className="text-xs text-red-400">{install.error}</p>}
      {install?.progress && <details open={install.state==='starting'||install.state==='failed'||install.busy}><summary className="text-xs cursor-pointer text-fg-muted">Setup log</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-fg-faint" aria-label="Voice setup log">{install.progress}</pre></details>}
      <p className="text-xs text-fg-faint">Stopping keeps downloaded models. Microphone access requires HTTPS or localhost. Existing custom services can still be configured below.</p>
    </div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.lazyLoad!==false} onChange={e=>update({lazyLoad:e.target.checked})}/>Lazy load · release GPU memory when voice is idle</label>
    <p className="text-xs text-fg-faint">For managed voice services: load Breeze when a voice session connects, then unload after the last session ends. Turning this off keeps the model warm while the service runs.</p>
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
