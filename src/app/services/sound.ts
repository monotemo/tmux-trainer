import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Sound {
  private actx: AudioContext | null = null;

  beep(f: number, d?: number, type?: OscillatorType, vol?: number): void {
    try {
      this.actx = this.actx || new AudioContext();
      const o = this.actx.createOscillator();
      const g = this.actx.createGain();
      o.type = type || 'square';
      o.frequency.value = f;
      g.gain.value = vol || 0.03;
      g.gain.exponentialRampToValueAtTime(0.0001, this.actx.currentTime + (d || 0.08));
      o.connect(g);
      g.connect(this.actx.destination);
      o.start();
      o.stop(this.actx.currentTime + (d || 0.08));
    } catch {
      // audio unavailable — play silently
    }
  }

  winChime(): void {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.12, 'triangle', 0.05), i * 90);
    });
  }
}
