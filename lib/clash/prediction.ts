import { SPRINT_SPEED, type Vec } from './sim';

/** Reconcile an absolute position report while preserving movement made since it was sent. */
export class PositionCorrection {
  private reports = new Map<number, Vec>();
  private offset = { x: 0, y: 0 };

  record(seq: number, x: number, y: number) {
    this.reports.set(seq, { x, y });
    this.reports.delete(seq - 64);
  }

  acknowledge(local: Vec, host: Vec, seq: number) {
    const sent = this.reports.get(seq);
    if (!sent) return;
    const dx = host.x - sent.x, dy = host.y - sent.y;
    local.x += dx; local.y += dy;
    this.offset.x -= dx; this.offset.y -= dy;

    // Outstanding reports already include the movement we just corrected.
    for (const [id, position] of this.reports) {
      if (id <= seq) this.reports.delete(id);
      else { position.x += dx; position.y += dy; }
    }
  }

  display(local: Vec, dt: number): Vec {
    const distance = Math.hypot(this.offset.x, this.offset.y);
    const decay = Math.min(1 - Math.exp(-10 * dt), SPRINT_SPEED * dt / Math.max(1, distance));
    this.offset.x *= 1 - decay; this.offset.y *= 1 - decay;
    return { x: local.x + this.offset.x, y: local.y + this.offset.y };
  }
}
