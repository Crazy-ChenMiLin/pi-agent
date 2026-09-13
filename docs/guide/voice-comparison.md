# Voice pipeline comparison demo

The main portal on port 4100 retains the optimized parallel pipeline. The comparison portal on port 4101 runs with `VOICE_PIPELINE_MODE=sequential` and displays “Sequential baseline” beside the voice session title.

The sequential path waits for speech to finish before requesting transcription, waits for the whole agent turn before submitting reply text to TTS, buffers every generated speech chunk completely, and only then starts playback. It suppresses thinking/compaction filler speech so it cannot overlap the measured work. Long replies still use the API's bounded text chunks, but all chunks finish synthesis before playback begins. Cancellation and mute still work. The default parallel path is unchanged.

## Recording the comparison

Use the same prompt, Qwen model, Aria voice, guidance mode, VAD settings and starting context. Record one instance at a time because both share llama-server and the managed Whisper/Breeze services. End voice mode on the other instance before switching. Record a warm-up separately from measured turns, enable the timing profiler, and export the report after each take. Label the metric as last detected speech to estimated first reply audio. Browser output timing is a software estimate, not an acoustic measurement.

This is a pipeline baseline on the current model/runtime, not a reconstruction of the original slow Python TTS stack. The current first-call thinking rule, quantization, streaming lookahead and GPU configuration are retained. Subsequent optimization variants should change one stage at a time: speculative STT, incremental LLM-to-TTS submission, then streaming playback/prefetch. Those intermediate variants are not implemented yet.

## Isolation and access

Comparison source: `/opt/pithagoras-sequential`; image/container: `pithagoras-sequential`; data volume: `pithagoras-sequential-data`; workspaces: `/root/pithagoras-sequential-workspaces`. No primary sessions, channels, routines or API credentials were copied. The demo has a new password saved at `/opt/pithagoras-sequential/demo-password.txt`, a separate cookie, the local keyless Qwen connection and the saved Aria reference/settings. It has no Docker control socket. Main instance remains independently deployed.
