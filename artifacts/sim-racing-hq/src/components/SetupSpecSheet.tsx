import type { SetupRecord } from '@workspace/api-client-react';
import {
  SETUP_FIELD_GROUPS,
  setupFieldFill,
  setupFieldValue,
  type SetupFieldMeta,
} from '../lib/setupFields';

/**
 * One setup parameter: label, a bar showing where the value sits on its
 * in-game slider, and the value itself. Fields whose bounds we don't pin
 * down (see setupFields.ts) show the label and value with no bar, keeping the
 * column grid so rows stay aligned down the sheet.
 */
function SetupSpecRow({ meta, value }: { meta: SetupFieldMeta; value: unknown }) {
  const fill = setupFieldFill(meta, value);
  return (
    <div className="setup-spec-row">
      <div className="setup-spec-label">{meta.label}</div>
      {fill === null ? (
        // No bar track at all — an empty track would read as "this value sits
        // at the bottom of its range", which is a claim we can't make here.
        <div aria-hidden="true" />
      ) : (
        <div className="setup-spec-bar" role="presentation">
          <div className="setup-spec-bar-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
        </div>
      )}
      <div className="setup-spec-value">{setupFieldValue(meta, value)}</div>
    </div>
  );
}

/**
 * The full parameter list for a setup, grouped like the game's setup screen.
 * Takes anything with the setup fields on it, so it serves both a saved setup
 * and a community-shared one.
 */
export function SetupSpecSheet({ setup }: { setup: Partial<SetupRecord> }) {
  return (
    <div className="setup-spec-sheet">
      {SETUP_FIELD_GROUPS.map(({ group, fields }) => (
        <div key={group} className="setup-spec-group">
          <div className="setup-spec-group-title">{group}</div>
          {fields.map(meta => (
            <SetupSpecRow key={String(meta.key)} meta={meta} value={setup[meta.key]} />
          ))}
        </div>
      ))}
    </div>
  );
}
