import { useState } from 'react';
import Nav from './components/Nav';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Tracks from './pages/Tracks';
import Setups from './pages/Setups';
import Progress from './pages/Progress';

export default function App() {
  const [page, setPage] = useState('dashboard');

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard setPage={setPage} />;
      case 'sessions': return <Sessions />;
      case 'tracks': return <Tracks />;
      case 'setups': return <Setups />;
      case 'progress': return <Progress />;
      default: return <Dashboard setPage={setPage} />;
    }
  };

  return (
    <div className="app-layout">
      <Nav page={page} setPage={setPage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
