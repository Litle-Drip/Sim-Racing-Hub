import { useState } from 'react';
import { Check, ExternalLink, UserPlus, Users, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetFriends,
  useAddFriend,
  useAcceptFriendRequest,
  useRemoveFriend,
  getGetFriendsQueryKey,
} from '@workspace/api-client-react';
import type { FriendRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { formatLastActive } from '../lib/lastActive';
import { Toast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function trackLabel(id: string): string {
  const t = F1_TRACKS.find(t => t.id === id);
  return t ? `${t.flag} ${t.short}` : id;
}

function profileHref(username: string): string {
  return `${basePath}/driver/${encodeURIComponent(username)}`;
}

function Avatar({ friend, size = 38 }: { friend: FriendRecord; size?: number }) {
  if (friend.avatarUrl) {
    return (
      <img
        src={friend.avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', border: '1px solid var(--border)', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontSize: size / 2.6, color: 'var(--gray-mid)',
      }}
    >
      {friend.username.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * A friend row is a link to their profile — that's where their sessions live,
 * so the whole card is the target rather than just the name. Remove stays a
 * real button and stops the click from following the link.
 */
function FriendRow({
  friend,
  onRemove,
  busy,
}: {
  friend: FriendRecord;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <a
      href={profileHref(friend.username)}
      className="card friend-row"
      title={`View ${friend.username}'s profile and sessions`}
      style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', textDecoration: 'none' }}
    >
      <Avatar friend={friend} />
      <div className="friend-row-meta">
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.03em', color: 'var(--white)',
          }}
        >
          {friend.username}
          <ExternalLink size={11} aria-hidden="true" style={{ color: 'var(--gray-mid)' }} />
        </span>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 2 }}>
          Last on {formatLastActive(friend.lastActiveAt).toLowerCase()} · {friend.sharedSessions} shared session{friend.sharedSessions === 1 ? '' : 's'}
        </div>
        {friend.lastSession && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-light)', marginTop: 4 }}>
            {trackLabel(friend.lastSession.trackId)} · {friend.lastSession.car}
            {friend.lastSession.bestLap ? <> · <span className="lap-time">{friend.lastSession.bestLap}</span></> : null}
          </div>
        )}
      </div>
      <span className="friend-row-view">View sessions →</span>
      <button
        className="btn btn-secondary"
        style={{ fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        disabled={busy}
      >
        {busy ? '…' : 'Remove'}
      </button>
    </a>
  );
}

function RequestRow({
  friend,
  onAccept,
  onDecline,
  busy,
}: {
  friend: FriendRecord;
  onAccept?: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Avatar friend={friend} size={32} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <a
          href={profileHref(friend.username)}
          style={{ textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--white)' }}
        >
          {friend.username}
        </a>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 2 }}>
          {onAccept ? 'Wants to be friends' : 'Request sent — waiting for them'}
        </div>
      </div>
      {onAccept && (
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={onAccept} disabled={busy}>
          <Check size={12} aria-hidden="true" /> Accept
        </button>
      )}
      <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onDecline} disabled={busy}>
        <X size={12} aria-hidden="true" /> {onAccept ? 'Decline' : 'Cancel'}
      </button>
    </div>
  );
}

export default function Friends() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetFriends();
  const [username, setUsername] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');
  const [busyId, setBusyId] = useState<string | null>(null);

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
  };

  const fail = (fallback: string) => (e: unknown) => {
    setBusyId(null);
    const message = (e as { data?: { error?: string } } | null)?.data?.error;
    setToastVariant('error');
    setToast(message ?? fallback);
  };

  const { mutate: addFriend, isPending: adding } = useAddFriend({
    mutation: {
      onSuccess: () => { setUsername(''); invalidate(); setToastVariant('success'); setToast('Friend request sent'); },
      onError: fail("Couldn't send that friend request"),
    },
  });

  const { mutate: acceptRequest } = useAcceptFriendRequest({
    mutation: {
      onSuccess: () => { setBusyId(null); invalidate(); setToastVariant('success'); setToast('Friend added'); },
      onError: fail("Couldn't accept that request"),
    },
  });

  const { mutate: removeFriend } = useRemoveFriend({
    mutation: {
      onSuccess: () => { setBusyId(null); invalidate(); },
      onError: fail("Couldn't remove that friend"),
    },
  });

  const handleAdd = () => {
    const name = username.trim();
    if (!name) return;
    addFriend({ data: { username: name } });
  };

  return (
    <>
      <div className="section-title">Friends</div>

      {/* Add by username */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <label className="field-label">Add a Friend by Username</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="their-username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !username.trim()}>
            <UserPlus size={12} aria-hidden="true" /> {adding ? 'Sending…' : 'Send Request'}
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 6 }}>
          Their username is the one on their profile — the same one that appears in <span style={{ fontFamily: 'var(--font-mono)' }}>f1simhub.com/driver/…</span>
        </div>
      </div>

      {incoming.length > 0 && (
        <>
          <div className="section-title">Friend Requests ({incoming.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {incoming.map(r => (
              <RequestRow
                key={r.id}
                friend={r}
                busy={busyId === r.id}
                onAccept={() => { setBusyId(r.id); acceptRequest({ id: r.id }); }}
                onDecline={() => { setBusyId(r.id); removeFriend({ id: r.id }); }}
              />
            ))}
          </div>
        </>
      )}

      <div className="section-title">Your Friends{friends.length > 0 ? ` (${friends.length})` : ''}</div>
      {isLoading ? (
        <div className="table-wrap"><div className="empty-state"><div className="empty-state-title">Loading…</div></div></div>
      ) : friends.length === 0 ? (
        <div className="table-wrap">
          <EmptyState
            icon={<Users size={40} />}
            headline="No friends yet"
            subtext="Add someone by their username to see when they were last on, what they've been driving, and jump straight to their profile."
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {friends.map(f => (
            <FriendRow
              key={f.id}
              friend={f}
              busy={busyId === f.id}
              onRemove={() => { setBusyId(f.id); removeFriend({ id: f.id }); }}
            />
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 24 }}>Sent Requests ({outgoing.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {outgoing.map(r => (
              <RequestRow
                key={r.id}
                friend={r}
                busy={busyId === r.id}
                onDecline={() => { setBusyId(r.id); removeFriend({ id: r.id }); }}
              />
            ))}
          </div>
        </>
      )}

      {/* The aggregated Friend Activity table used to sit here. It duplicated
          what each driver's own profile already shows, and the answer to
          "what has this friend been driving" is better read on their page —
          so a friend row now opens their profile instead. */}

      {toast && <Toast message={toast} variant={toastVariant} onDone={() => setToast('')} />}
    </>
  );
}
