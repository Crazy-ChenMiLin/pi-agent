export type PreparedSpeech = ((signal: AbortSignal) => Promise<void>) & { completed?: Promise<void> };
type Run = { controller: AbortController; text: string[]; audio: PreparedSpeech[]; generating: boolean; playing: boolean };

/** One TTS producer and one audio consumer, running independently in sentence order. */
export class SpeechPipeline {
  private run = this.fresh();
  constructor(
    private synthesize: (text: string, signal: AbortSignal) => Promise<PreparedSpeech>,
    private changed: () => void,
    private error: (error: unknown) => void,
  ) {}
  private fresh(): Run { return { controller: new AbortController(), text: [], audio: [], generating: false, playing: false }; }
  get busy() { const r = this.run; return !!(r.generating || r.playing || r.text.length || r.audio.length); }
  enqueue(text: string[]) { this.run.text.push(...text); this.pump(this.run); }
  cancel() {
    const previous = this.run;
    this.run = this.fresh();
    previous.text = []; previous.audio = []; previous.controller.abort();
    this.changed();
  }
  private fail(run: Run, error: unknown) {
    if (run !== this.run || run.controller.signal.aborted) return;
    this.cancel(); this.error(error);
  }
  private pump(run: Run) {
    if (run !== this.run || run.controller.signal.aborted) return;
    const signal = run.controller.signal;
    if (!run.playing && run.audio.length) {
      const play = run.audio.shift()!;
      run.playing = true;
      void (async () => {
        try { await play(signal); }
        catch (error) { this.fail(run, error); }
        finally { run.playing = false; if (run === this.run) this.pump(run); }
      })();
    }
    if (run !== this.run) return;
    // Keep at most two completed phrases ahead of playback. Breeze itself has
    // one GPU request slot; overlapping playback needs no additional GPU slot.
    if (!run.generating && run.audio.length < 2 && run.text.length) {
      const text = run.text.shift()!;
      run.generating = true;
      void (async () => {
        try {
          const prepared = await this.synthesize(text, signal);
          if (run === this.run && !signal.aborted) { run.audio.push(prepared); this.pump(run); }
          await prepared.completed;
        } catch (error) { this.fail(run, error); }
        finally { run.generating = false; if (run === this.run) this.pump(run); }
      })();
    }
    this.changed();
  }
}
