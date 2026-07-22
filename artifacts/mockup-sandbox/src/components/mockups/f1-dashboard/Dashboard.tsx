import React from "react";
import { 
  BarChart3, 
  Car, 
  Activity, 
  Trophy, 
  BookOpen, 
  Cpu, 
  Users, 
  LogOut,
  Target,
  Timer,
  CheckCircle2,
  Map,
  Plus
} from "lucide-react";

export function Dashboard() {
  return (
    <div 
      className="min-h-screen text-[var(--white)] overflow-hidden flex"
      style={{ 
        backgroundColor: "var(--bg)", 
        fontFamily: "'Rajdhani', sans-serif",
        "--bg": "#080808",
        "--bg-card": "#111111",
        "--bg-elevated": "#1A1A1A",
        "--border": "#1E1E1E",
        "--border-accent": "#2A2A2A",
        "--red": "#E8002D",
        "--red-dim": "rgba(232,0,45,0.12)",
        "--red-glow": "rgba(232,0,45,0.35)",
        "--white": "#F0F0F0",
        "--gray": "#777777",
        "--gray-mid": "#A8A8A8",
        "--teal": "#00D2BE",
        "--yellow": "#FFF200",
        "--green": "#39B54A"
      } as React.CSSProperties}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside 
        className="w-[240px] flex-shrink-0 flex flex-col border-r"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="h-16 flex items-center px-6 border-b" style={{ borderColor: "var(--border)" }}>
          <Trophy className="w-5 h-5 mr-3" style={{ color: "var(--red)" }} />
          <h1 className="text-xl font-bold tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            F1 SIM HUB
          </h1>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-1">
          <NavItem icon={<BarChart3 className="w-5 h-5" />} label="Dashboard" active />
          <NavItem icon={<Activity className="w-5 h-5" />} label="Session Log" />
          <NavItem icon={<Car className="w-5 h-5" />} label="Setup Vault" />
          <NavItem icon={<BookOpen className="w-5 h-5" />} label="Track Bible" />
          <NavItem icon={<Target className="w-5 h-5" />} label="PB Tracker" />
          <NavItem icon={<Cpu className="w-5 h-5" />} label="AI Engineer" />
          <NavItem icon={<Users className="w-5 h-5" />} label="Community" />
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center">
            <div className="relative w-10 h-10 flex-shrink-0 mr-3">
              <svg className="w-full h-full -rotate-90 absolute top-0 left-0" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" className="stroke-current" style={{ color: "var(--border-accent)", strokeWidth: 2 }} />
                <circle cx="18" cy="18" r="16" fill="none" className="stroke-current" strokeDasharray="100" strokeDashoffset="25" style={{ color: "var(--yellow)", strokeWidth: 2 }} />
              </svg>
              <div 
                className="absolute inset-[2px] rounded-full flex items-center justify-center font-bold text-sm"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--red)" }}
              >
                AR
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-semibold truncate">Alex R.</div>
              <div className="text-xs truncate" style={{ color: "var(--gray-mid)" }}>Gold · 2,840 XP</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 flex items-center justify-between px-8 border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
          <h2 className="text-xl tracking-widest font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>SESSION LOG</h2>
          <button 
            className="flex items-center px-4 py-2 text-sm font-bold tracking-wider transition-colors hover:bg-opacity-80"
            style={{ 
              backgroundColor: "var(--red)", 
              color: "var(--white)",
              fontFamily: "'Orbitron', sans-serif"
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            NEW SESSION
          </button>
        </header>

        <div className="p-8 flex-1 flex flex-col gap-8">
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-6">
            <StatCard 
              label="TOTAL SESSIONS" 
              value="47" 
              icon={<Timer />} 
            />
            <StatCard 
              label="BEST LAP (MONZA)" 
              value="1:21.847" 
              valueColor="var(--teal)"
              icon={<Trophy />} 
            />
            <StatCard 
              label="AVG CONSISTENCY" 
              value="94.2%" 
              icon={<CheckCircle2 />} 
            />
            <StatCard 
              label="TRACKS COVERED" 
              value="12/24" 
              icon={<Map />} 
            />
          </div>

          {/* Session Table */}
          <div className="flex-1 border flex flex-col" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr 
                    className="text-xs uppercase tracking-widest border-b" 
                    style={{ 
                      fontFamily: "'Orbitron', sans-serif", 
                      color: "var(--gray-mid)",
                      borderColor: "var(--border-accent)" 
                    }}
                  >
                    <th className="py-4 px-6 font-medium">Date</th>
                    <th className="py-4 px-6 font-medium">Track</th>
                    <th className="py-4 px-6 font-medium">Type</th>
                    <th className="py-4 px-6 font-medium">Car</th>
                    <th className="py-4 px-6 font-medium">Best Lap</th>
                    <th className="py-4 px-6 font-medium">Laps</th>
                    <th className="py-4 px-6 font-medium">Conditions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <SessionRow date="Jun 24" track="Monaco" type="Qualifying" car="Ferrari SF-25" lap="1:09.841" laps="18" conditions="Dry" />
                  <SessionRow date="Jun 23" track="Monaco" type="Practice" car="Ferrari SF-25" lap="1:10.203" laps="24" conditions="Dry" />
                  <SessionRow date="Jun 22" track="Monaco" type="Practice" car="Ferrari SF-25" lap="1:11.549" laps="31" conditions="Wet" />
                  <SessionRow date="Jun 20" track="Monza" type="Race" car="Red Bull RB21" lap="1:21.847" laps="53" conditions="Dry" />
                  <SessionRow date="Jun 19" track="Monza" type="Qualifying" car="Red Bull RB21" lap="1:21.203" laps="12" conditions="Dry" />
                  <SessionRow date="Jun 18" track="Monza" type="Practice" car="Red Bull RB21" lap="1:22.415" laps="28" conditions="Dry" />
                  <SessionRow date="Jun 15" track="Silverstone" type="Race" car="Mercedes W16" lap="1:26.142" laps="52" conditions="Dry" />
                  <SessionRow date="Jun 14" track="Silverstone" type="Qualifying" car="Mercedes W16" lap="1:25.731" laps="16" conditions="Dry" />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <a 
      href="#"
      className="flex items-center px-6 py-3 text-sm tracking-widest relative group cursor-pointer transition-colors"
      style={{ 
        fontFamily: "'Orbitron', sans-serif",
        color: active ? "var(--white)" : "var(--gray)",
        backgroundColor: active ? "var(--red-dim)" : "transparent"
      }}
    >
      {active && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: "var(--red)" }}
        />
      )}
      <div className={`mr-4 transition-colors ${active ? "" : "group-hover:text-[var(--white)]"}`}>
        {icon}
      </div>
      <span className={`transition-colors ${active ? "" : "group-hover:text-[var(--white)]"}`}>
        {label}
      </span>
    </a>
  );
}

function StatCard({ label, value, valueColor = "var(--white)", icon }: { label: string, value: string, valueColor?: string, icon: React.ReactNode }) {
  return (
    <div 
      className="relative p-6 border-b-2 flex flex-col justify-between overflow-hidden"
      style={{ 
        backgroundColor: "var(--bg-card)", 
        borderColor: "var(--border)",
        borderBottomColor: "var(--red)" 
      }}
    >
      <div 
        className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 pointer-events-none flex items-center justify-center"
      >
        {React.cloneElement(icon as React.ReactElement, { className: "w-full h-full" })}
      </div>
      <div 
        className="text-xs font-bold tracking-widest mb-4 z-10" 
        style={{ color: "var(--gray-mid)", fontFamily: "'Orbitron', sans-serif" }}
      >
        {label}
      </div>
      <div 
        className="text-4xl font-bold z-10"
        style={{ 
          fontFamily: "'Space Mono', monospace", 
          color: valueColor 
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SessionRow({ 
  date, 
  track, 
  type, 
  car, 
  lap, 
  laps, 
  conditions 
}: { 
  date: string, 
  track: string, 
  type: string, 
  car: string, 
  lap: string, 
  laps: string, 
  conditions: string 
}) {
  
  let typeColor = "var(--gray)";
  if (type === "Practice") typeColor = "var(--teal)";
  if (type === "Qualifying") typeColor = "var(--yellow)";
  if (type === "Race") typeColor = "var(--red)";
  if (type === "Hotlap") typeColor = "var(--green)";

  return (
    <tr 
      className="border-b transition-colors hover:bg-white/5" 
      style={{ borderColor: "var(--border-accent)" }}
    >
      <td className="py-4 px-6 font-medium" style={{ color: "var(--gray-mid)" }}>{date}</td>
      <td className="py-4 px-6 text-base font-bold text-white">{track}</td>
      <td className="py-4 px-6">
        <span 
          className="px-2 py-1 text-[10px] font-bold tracking-widest uppercase"
          style={{ 
            fontFamily: "'Orbitron', sans-serif",
            color: typeColor,
            backgroundColor: `${typeColor}20`,
            border: `1px solid ${typeColor}40`
          }}
        >
          {type}
        </span>
      </td>
      <td className="py-4 px-6" style={{ color: "var(--gray-mid)" }}>{car}</td>
      <td className="py-4 px-6 text-lg" style={{ fontFamily: "'Space Mono', monospace" }}>{lap}</td>
      <td className="py-4 px-6" style={{ fontFamily: "'Space Mono', monospace", color: "var(--gray-mid)" }}>{laps}</td>
      <td className="py-4 px-6">
        <span className="flex items-center gap-2">
          {conditions === "Wet" && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--teal)" }} />}
          {conditions === "Dry" && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--yellow)" }} />}
          <span style={{ color: "var(--gray-mid)" }}>{conditions}</span>
        </span>
      </td>
    </tr>
  );
}
