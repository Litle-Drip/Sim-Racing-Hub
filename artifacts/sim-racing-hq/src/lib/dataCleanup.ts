import type { SessionRecord } from '@workspace/api-client-react';

/**
 * True for sessions that came from the F1 telemetry companion app rather
 * than the manual "Log Session" form — only the companion app ever
 * populates these fields, so their presence is a reliable signal even for
 * historical rows that predate any explicit source tracking.
 */
export function isTelemetrySourced(s: SessionRecord): boolean {
  return (
    s.topSpeedKph != null ||
    s.avgThrottlePct != null ||
    s.avgBrakePct != null ||
    s.maxRpm != null ||
    s.topGear != null ||
    s.drsActivations != null ||
    s.ersEnergyStored != null ||
    s.ersDeployedThisLap != null ||
    s.setupSnapshot != null ||
    (s.tyreStints != null && s.tyreStints.length > 0) ||
    s.fuelRemainingLaps != null ||
    s.brakeTemps != null ||
    s.tyreSurfaceTemps != null ||
    s.tyreWear != null ||
    s.aiDifficulty != null ||
    s.wingDamage != null ||
    (s.lapHistory != null && s.lapHistory.length > 0)
  );
}

function duplicateSignature(s: SessionRecord): string {
  return [s.trackId, s.car, s.type, s.bestLap, s.avgLap, s.worstLap].join('|');
}

export interface DataIssues {
  /** Groups of 2+ telemetry-sourced sessions sharing an identical track/car/
   *  type/lap-time signature — near-certain duplicate uploads of one race. */
  duplicateClusters: SessionRecord[][];
  /** Telemetry-sourced sessions with no laps and no best time recorded —
   *  leftover fragments with nothing useful in them. */
  emptySessions: SessionRecord[];
}

export function findDataIssues(sessions: SessionRecord[]): DataIssues {
  const telemetrySessions = sessions.filter(isTelemetrySourced);

  const groups = new Map<string, SessionRecord[]>();
  for (const s of telemetrySessions) {
    const key = duplicateSignature(s);
    const group = groups.get(key);
    if (group) group.push(s);
    else groups.set(key, [s]);
  }

  const duplicateClusters = [...groups.values()]
    .filter(group => group.length > 1)
    .map(group => [...group].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')));

  const clusteredIds = new Set(duplicateClusters.flat().map(s => s.id));
  const emptySessions = telemetrySessions.filter(
    s => !clusteredIds.has(s.id) && (!s.bestLap || s.bestLap.trim() === '') && (!s.laps || s.laps.length === 0)
  );

  return { duplicateClusters, emptySessions };
}
