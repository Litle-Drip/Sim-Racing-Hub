import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  headline: string;
  subtext: string;
  ctaLabel?: string;
  onCta?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  icon,
  headline,
  subtext,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div style={{ color: 'var(--border-accent)', marginBottom: 16, lineHeight: 1 }}>
        {icon}
      </div>
      <div className="empty-state-title">{headline}</div>
      <div className="empty-state-desc">{subtext}</div>
      {ctaLabel && onCta && (
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={onCta}>
            {ctaLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button className="btn btn-secondary" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
