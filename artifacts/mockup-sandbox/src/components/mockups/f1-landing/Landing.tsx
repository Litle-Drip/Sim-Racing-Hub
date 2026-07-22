import React from 'react';

export function Landing() {
  return (
    <div className="f1-landing-container min-h-[100dvh] text-[var(--white)] selection:bg-[var(--red)] selection:text-white relative overflow-hidden flex flex-col font-rajdhani">
      {/* Non-blocking Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      
      <style>{`
        .f1-landing-container {
          --bg: #080808;
          --bg-card: #111111;
          --bg-elevated: #1A1A1A;
          --border: #1E1E1E;
          --border-accent: #2A2A2A;
          --red: #E8002D;
          --red-dim: rgba(232,0,45,0.12);
          --red-glow: rgba(232,0,45,0.35);
          --white: #F0F0F0;
          --gray: #777777;
          --gray-mid: #A8A8A8;
          --teal: #00D2BE;
          --yellow: #FFF200;
          --green: #39B54A;
          background-color: var(--bg);
          /* Subtle repeating dot grid */
          background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%231E1E1E'/%3E%3C/svg%3E");
        }
        .font-orbitron { font-family: 'Orbitron', sans-serif; }
        .font-rajdhani { font-family: 'Rajdhani', sans-serif; }
        .font-space { font-family: 'Space Mono', monospace; }

        .f1-text-gradient {
          background: linear-gradient(135deg, var(--white) 30%, var(--red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .f1-btn-primary {
          background-color: var(--red);
          color: var(--white);
          border: 1px solid var(--red);
          text-transform: uppercase;
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          letter-spacing: 0.1em;
          transition: all 0.2s ease-in-out;
          box-shadow: 0 0 15px var(--red-glow);
        }
        .f1-btn-primary:hover {
          background-color: #ff0536;
          box-shadow: 0 0 25px rgba(232,0,45,0.6);
          border-color: #ff0536;
        }

        .f1-btn-secondary {
          background-color: transparent;
          color: var(--white);
          border: 1px solid var(--border-accent);
          text-transform: uppercase;
          font-family: 'Orbitron', sans-serif;
          font-weight: 500;
          letter-spacing: 0.05em;
          transition: all 0.2s ease-in-out;
        }
        .f1-btn-secondary:hover {
          border-color: var(--gray-mid);
          background-color: var(--bg-elevated);
        }

        .f1-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
          position: relative;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .f1-card:hover {
          border-color: var(--border-accent);
          transform: translateY(-2px);
        }
        
        .f1-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, var(--red) 0%, transparent 100%);
          opacity: 0.5;
        }

        .f1-card-featured {
          border-left: 1px solid var(--red) !important;
        }
      `}</style>

      {/* Nav */}
      <nav className="w-full max-w-7xl mx-auto px-6 py-8 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="14" width="5" height="8" fill="var(--red)" />
            <rect x="9" y="8" width="5" height="14" fill="var(--red)" />
            <rect x="16" y="2" width="5" height="20" fill="var(--red)" />
          </svg>
          <span className="font-orbitron font-bold text-xl tracking-widest text-[var(--white)]">F1 SIM HUB</span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 flex flex-col justify-center pb-24 pt-12 relative z-10">
        
        {/* Hero Section */}
        <div className="max-w-3xl mb-24">
          <h1 className="font-orbitron text-5xl md:text-7xl font-black uppercase leading-[1.1] mb-6 tracking-tight">
            Your personal <br />
            <span className="f1-text-gradient">F1 sim racing</span> companion
          </h1>
          <p className="font-rajdhani text-xl md:text-2xl text-[var(--gray-mid)] mb-3 leading-snug font-medium max-w-2xl">
            Log sessions, track your PBs, build and share setups, and master every circuit on the F1 25 calendar.
          </p>
          <p className="font-space text-sm text-[var(--gray)] mb-10 tracking-wide">
            For F1 25 on Xbox, PlayStation, and PC — wheel or controller.
          </p>

          <div className="flex flex-col gap-4 max-w-md">
            <button className="f1-btn-primary w-full py-4 px-6 text-sm flex justify-center items-center gap-2">
              CONTINUE AS GUEST — NO SIGN UP REQUIRED
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <div className="flex gap-4">
              <button className="f1-btn-secondary flex-1 py-3 px-4 text-xs">
                CREATE FREE ACCOUNT
              </button>
              <button className="f1-btn-secondary flex-1 py-3 px-4 text-xs">
                SIGN IN
              </button>
            </div>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard 
            icon="🏁"
            title="Session Log" 
            desc="Track every practice, qualifying, and race. Log lap times, tires, weather, and conditions in 30 seconds." 
            featured
          />
          <FeatureCard 
            icon="⚙️"
            title="Setup Vault" 
            desc="Save and share car setups per track. Tag by game version so nothing goes stale after a patch." 
          />
          <FeatureCard 
            icon="📊"
            title="PB Progression" 
            desc="See your personal bests across every circuit. Variance charts show your consistency improving over time." 
          />
          <FeatureCard 
            icon="🗺️"
            title="Track Bible" 
            desc="Corner-by-corner notes for every circuit. Rate difficulty, tag key braking zones and apex points." 
          />
          <FeatureCard 
            icon="🤖"
            title="AI Race Engineer" 
            desc="Describe your problem, get setup advice. Powered by your actual session data." 
          />
          <FeatureCard 
            icon="🏆"
            title="Community" 
            desc="Browse and copy top-rated community setups. Share your best laps on the leaderboard." 
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[var(--border)] py-8 relative z-10 bg-[var(--bg-card)] mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-[var(--gray)] font-space text-xs">
          <span>© 2025 F1 Sim Hub</span>
          <span>For sim racers, by sim racers</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc, featured = false }: { icon: string, title: string, desc: string, featured?: boolean }) {
  return (
    <div className={`f1-card p-6 flex flex-col gap-4 ${featured ? 'f1-card-featured' : ''}`}>
      <div className="text-2xl opacity-80 mb-2">{icon}</div>
      <h3 className="font-orbitron font-bold text-lg text-[var(--white)] uppercase tracking-wide">{title}</h3>
      <p className="font-rajdhani text-[var(--gray-mid)] text-base leading-relaxed font-medium">
        {desc}
      </p>
    </div>
  );
}
