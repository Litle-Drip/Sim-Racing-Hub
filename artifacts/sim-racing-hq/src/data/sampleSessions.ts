import type { SessionRecord } from '@workspace/api-client-react';

/**
 * Bundled sample telemetry for the "Try Live Demo" landing page CTA.
 * Loaded straight into guest-mode local storage — no backend call, no account.
 * IDs are prefixed `demo-` so the UI can flag them as sample data.
 */
export function buildSampleSessions(): SessionRecord[] {
  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const raw: Omit<SessionRecord, 'isPB' | 'isPublic' | 'sharedAt' | 'publicNote' | 'createdAt'>[] = [
    {
      id: 'demo-1', date: daysAgo(9), trackId: 'monza', car: 'Ferrari SF-25 — Leclerc', type: 'Race',
      bestLap: '1:20.412', avgLap: '1:22.108', worstLap: '1:24.902', s1: '25.011', s2: '31.204', s3: '24.197',
      tires: 'Medium', fuelLoad: 62, conditions: 'Dry', assists: 'None', rating: 4, position: '2',
      notes: 'Good tow into Turn 1, lost time in the Ascari chicane on old tyres.',
      laps: [
        { lap: 1, time: '1:24.902', s1: '25.9', s2: '32.4', s3: '26.6', tires: 'Medium', penalty: '' },
        { lap: 12, time: '1:21.055', s1: '25.2', s2: '31.5', s3: '24.3', tires: 'Medium', penalty: '' },
        { lap: 28, time: '1:20.412', s1: '25.0', s2: '31.2', s3: '24.2', tires: 'Medium', penalty: '' },
      ],
    },
    {
      id: 'demo-2', date: daysAgo(7), trackId: 'monaco', car: 'Red Bull RB21 — Verstappen', type: 'Qualifying',
      bestLap: '1:11.834', avgLap: '1:12.955', worstLap: '1:14.201', s1: '18.302', s2: '38.611', s3: '14.921',
      tires: 'Soft', fuelLoad: 25, conditions: 'Dry', assists: 'None', rating: 5,
      notes: 'Clean lap in Q3 — nailed the Swimming Pool exit.',
      laps: [
        { lap: 1, time: '1:14.201', s1: '18.9', s2: '39.4', s3: '15.9', tires: 'Soft', penalty: '' },
        { lap: 2, time: '1:11.834', s1: '18.3', s2: '38.6', s3: '14.9', tires: 'Soft', penalty: '' },
      ],
    },
    {
      id: 'demo-3', date: daysAgo(5), trackId: 'silverstone', car: 'McLaren MCL39 — Norris', type: 'Practice',
      bestLap: '1:26.771', avgLap: '1:28.340', worstLap: '1:31.055', s1: '28.402', s2: '35.911', s3: '22.458',
      tires: 'Hard', fuelLoad: 80, conditions: 'Rain', assists: 'Traction Control', rating: 3,
      notes: 'Wet setup felt loose through Maggots-Becketts — need more front wing.',
      laps: null,
    },
    {
      id: 'demo-4', date: daysAgo(3), trackId: 'suzuka', car: 'Mercedes W16 — Russell', type: 'Hotlap',
      bestLap: '1:29.304', avgLap: '1:29.877', worstLap: '1:30.612', s1: '27.611', s2: '38.204', s3: '23.489',
      tires: 'Soft', fuelLoad: 15, conditions: 'Dry', assists: 'None', rating: 5,
      notes: 'PB attempt — flowed 130R better than ever.',
      laps: [
        { lap: 1, time: '1:30.612', s1: '28.0', s2: '38.6', s3: '24.0', tires: 'Soft', penalty: '' },
        { lap: 2, time: '1:29.304', s1: '27.6', s2: '38.2', s3: '23.5', tires: 'Soft', penalty: '' },
        { lap: 3, time: '1:29.712', s1: '27.7', s2: '38.4', s3: '23.6', tires: 'Soft', penalty: '' },
      ],
    },
    {
      id: 'demo-5', date: daysAgo(1), trackId: 'spa', car: 'Ferrari SF-25 — Leclerc', type: 'Race',
      bestLap: '2:16.532', avgLap: '2:18.904', worstLap: '2:22.611', s1: '29.804', s2: '58.302', s3: '48.426',
      tires: 'Wet', fuelLoad: 70, conditions: 'Rain', assists: 'None', rating: 4, position: '1',
      notes: 'Nailed the strategy call to switch to wets one lap early.',
      laps: null,
    },
  ];

  return raw.map(s => ({
    ...s,
    createdAt: new Date().toISOString(),
    isPB: false,
    isPublic: false,
    sharedAt: null,
    publicNote: null,
  }));
}
