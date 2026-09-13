# Voice pipeline comparison demo

The main portal on port 4100 retains the optimized parallel pipeline. The comparison portal on port 4101 runs with `VOICE_PIPELINE_MODE=sequential` and displays “Sequential baseline” beside the voice session title.

The sequential path waits for speech to finish before requesting transcription, waits for the whole agent turn before submitting reply text to TTS, buffers every generated speech chunk completely, and only then starts playback. It suppresses thinking/compaction filler speech so it cannot overlap the measured work. Long replies still use the API's bounded text chunks, but all chunks finish synthesis before playback begins. Cancellation and mute still work. The default parallel path is unchanged.

## Recording the comparison

Use the same prompt, Qwen model, Aria voice, guidance mode, VAD settings and starting context. Record one instance at a time because both share llama-server and the managed Whisper/Breeze services. End voice mode on the other instance before switching. Record a warm-up separately from measured turns, enable the timing profiler, and export the report after each take. Label the metric as last detected speech to estimated first reply audio. Browser output timing is a software estimate, not an acoustic measurement.

This is a pipeline baseline on the current model/runtime, not a reconstruction of the original slow Python TTS stack. The comparison sets `VOICE_SKIP_FIRST_THINKING=false`: voice requests preserve the model's normal thinking behavior, including the first response. Quantization, streaming lookahead and GPU configuration are retained. The test instance also sets `VOICE_RESPONSE_INSTRUCTIONS=false`, omitting all voice-specific system rules and the `[Audio mode]` input marker. Replies are not forced to be brief, plain text, or canvas-first. Use a new session for a clean recording; prior conversations can still influence the model. Add optimizations individually only when requested. Subsequent optimization variants should change one stage at a time: speculative STT, incremental LLM-to-TTS submission, then streaming playback/prefetch. The first intermediate variant is now available with `VOICE_SENTENCE_CHUNKS=true`: text sentences are submitted during LLM generation, each complete sentence audio plays before the next sentence is synthesized. Audio is fully buffered per sentence; speculative STT and audio streaming playback remain off. Set the flag to false to restore the full-turn baseline.

## Isolation and access

Comparison source: `/opt/pithagoras-sequential`; image/container: `pithagoras-sequential`; data volume: `pithagoras-sequential-data`; workspaces: `/root/pithagoras-sequential-workspaces`. No primary sessions, channels, routines or API credentials were copied. The demo has a new password saved at `/opt/pithagoras-sequential/demo-password.txt`, a separate cookie, the local keyless Qwen connection and the saved Aria reference/settings. It has no Docker control socket. Main instance remains independently deployed.

## Temporary experiment and rollback

These are temporary comparison changes. Main production is still the code from `3e3c111` on port 4100. Baseline code is recorded through `274a9b5`; all comparison behavior is opt-in through the demo environment. Do not deploy demo configuration to the main portal.

Pinned images on Cortex:

- `pithagoras-portal:before-sequential-demo-20260913`: `sha256:026db1c94edf0c69d2e0ff3c25f5556015370bcff059d3a226158d0b0701f9dd`
- `pithagoras-sequential:baseline-20260913`: `sha256:372128da898a5638474b45209ba1dca2b823c52d5987ad5cd8603116f436093c`

To end the experiment without deleting recordings or sessions, run on Cortex:

```sh
docker update --restart=no pithagoras-sequential
docker stop pithagoras-sequential
```

The main instance and shared LLM/voice services need no rollback. Leave the demo data volume and workspaces intact. `docker start pithagoras-sequential` resumes the saved baseline later.

To turn all application-level voice optimizations back on in a future comparison stage, recreate only the demo container with `VOICE_PIPELINE_MODE=parallel`, `VOICE_SKIP_FIRST_THINKING=true`, and `VOICE_RESPONSE_INSTRUCTIONS=true`, retaining its data volume and other configuration. Stage changes should be recorded individually. Changing pipeline mode also changes the current cookie name, so log in again afterward.

For source rollback, the behavior commits are `980cb59`, `9f5b903`, and `274a9b5`. They can be reverted in reverse order if the experiment code is no longer wanted; preserve later unrelated edits rather than resetting the branch. No rollback has been executed.

Current demo stage: `VOICE_PIPELINE_MODE=sequential`, `VOICE_SENTENCE_CHUNKS=true`, `VOICE_SKIP_FIRST_THINKING=false`, `VOICE_RESPONSE_INSTRUCTIONS=false`. The visible label is “Sentence chunks · buffered audio”. Only sentence-level delivery has been enabled; TTS prefetch during playback remains disabled.
