// One source of truth for the F1 25 telemetry settings we tell drivers to use.
//
// These strings were previously retyped in the Companion page, the public
// Download page and the desktop wizard, and they had already drifted: the
// wizard shipped "UDP Format: 2023", which the companion's packet parser
// (artifacts/companion/src/main/udp.ts) rejects outright — it only accepts
// 2024, 2025 and 2026. A driver who followed that wizard exactly saw a
// spinner that never resolved and had no way to know why.
//
// If SUPPORTED_FORMATS in the companion parser changes, change UDP_FORMAT
// here too.

export const UDP_PORT = '20777';
export const UDP_FORMAT = '2024';
export const UDP_SEND_RATE = '60Hz';

/** The loopback address, correct whenever F1 25 runs on the same PC as the companion. */
export const UDP_IP_SAME_PC = '127.0.0.1';

export interface UdpSetting {
  label: string;
  value: string;
  /** Set when the correct value depends on where the game runs. */
  note?: string;
}

export function udpSettings(platform: 'pc' | 'console'): UdpSetting[] {
  return [
    { label: 'UDP Telemetry', value: 'On' },
    { label: 'UDP Broadcast Mode', value: 'Off' },
    platform === 'pc'
      ? {
          label: 'UDP IP Address',
          value: UDP_IP_SAME_PC,
          note: 'Loopback — the game and the companion share this PC.',
        }
      : {
          label: 'UDP IP Address',
          value: "Your PC's local IP",
          note: 'The companion app shows this for you on its setup screen. Console and PC must be on the same network.',
        },
    { label: 'UDP Port', value: UDP_PORT },
    { label: 'UDP Send Rate', value: UDP_SEND_RATE },
    {
      label: 'UDP Format',
      value: UDP_FORMAT,
      note: 'Must be 2024, 2025 or 2026. Any other value and the companion cannot read the packets.',
    },
  ];
}
