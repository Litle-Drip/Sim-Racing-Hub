export default function Footer() {
  return (
    <div style={{ padding: '24px 0 8px', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', marginBottom: 6 }}>
        F1 Sim Hub — Built for the sim racing community. Not affiliated with Formula 1 or Codemasters.
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)' }}>
        &copy; {new Date().getFullYear()} F1 Sim Hub, a product of{' '}
        <a
          href="https://edison-labs.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--gray-light)', textDecoration: 'underline' }}
        >
          Edison Labs
        </a>
        . All rights reserved.
      </p>
    </div>
  );
}
