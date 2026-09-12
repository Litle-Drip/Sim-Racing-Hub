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
//
// UDP_FORMAT was 2024 for everyone, which worked but cost us something else:
// this dropdown sets the *packet layout the game emits*, and the header field
// carrying it is not the game. Telling every F1 25 driver to emit 2024-format
// packets is fine for parsing — the parser handles all three — but a chain of
// code downstream read that number as the game and labelled their sessions
// "F1 24". The companion now reads the game year out of the packet header
// instead, so the label is right either way; recommending the driver's own
// year keeps the two numbers agreeing and avoids the F1 24 struct layout,
// which is a byte-offset fork the parser only maintains for real F1 24.

export const UDP_PORT = '20777';
export const UDP_FORMAT = '2025';
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
      note: 'Pick the newest your game offers — 2025 on F1 25. 2024 and 2026 also work; anything else and the companion cannot read the packets.',
    },
  ];
}
