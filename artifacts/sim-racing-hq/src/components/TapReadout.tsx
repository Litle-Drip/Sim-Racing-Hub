import { useState, useCallback } from 'react';

/**
 * A `title` attribute never opens on a touch screen, so on an iPad any detail
 * that lives only in one is unreachable. Rather than give each of those places
 * a positioned popover — which then has to dodge the edge of the screen and
 * the `overflow: auto` container it sits inside — the detail is shown in a
 * fixed line underneath the row it belongs to, and tapping an item fills it in.
 *
 * The `title` stays on the item, so hovering with a mouse is unchanged.
 */
export function useTapReadout<T extends { id: string }>() {
  const [selected, setSelected] = useState<T | null>(null);
  // Tapping the selected item again clears it, so there is always a way back
  // to the placeholder without hunting for a dismiss target.
  const toggle = useCallback((item: T) => {
    setSelected(prev => (prev?.id === item.id ? null : item));
  }, []);
  return { selected, toggle, isSelected: (id: string) => selected?.id === id };
}

/**
 * Holds its height when empty so filling it in doesn't shift the page under
 * the finger that just tapped.
 */
export function TapReadout({ text, placeholder }: { text: string | null; placeholder: string }) {
  return (
    <div className="tap-readout" aria-live="polite">
      {text ?? <span className="tap-readout-placeholder">{placeholder}</span>}
    </div>
  );
}
