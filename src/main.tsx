import { render } from 'preact';

function App() {
  return (
    <div
      style={{
        background: 'var(--bg, #1e1e1e)',
        color: 'var(--text, #d4d4d4)',
        padding: '1.5rem',
        minHeight: '100vh',
      }}
    >
      <h1
        style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          color: 'var(--accent, #569cd6)',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        Git Sync
      </h1>
      <p style={{ color: 'var(--text2, #9d9d9d)', fontSize: '0.875rem' }}>
        Ei meu chapa.
      </p>
    </div>
  );
}

function mount() {
  const root = document.getElementById('root');
  if (root) render(<App />, root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
