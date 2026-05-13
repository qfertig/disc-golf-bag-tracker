'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { initializeDB, seedCatalog } from '@/lib/db';

const DatabaseContext = createContext<boolean>(false);
export const useDatabase = () => useContext(DatabaseContext);

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState('Starting up...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        setProgress('Initializing database...');
        const ready = await initializeDB(setProgress);
        if (ready) {
          setProgress('Loading disc catalog...');
          await seedCatalog(setProgress);
          setProgress('Ready!');
          setIsReady(true);
        } else {
          setErrorMsg('Database failed to initialize.');
        }
      } catch (err: unknown) {
        console.error('Database initialization error:', err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    };
    init();
  }, []);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--surface-0)' }}>
        <div className="text-5xl mb-4">⚠️</div>
        <div className="text-xl font-bold text-red-500 mb-2">Database Error</div>
        <div className="text-muted text-center max-w-sm mb-4">{errorMsg}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 rounded-lg font-bold cursor-pointer"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--surface-0)' }}>
        <div 
          className="w-16 h-16 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, #4ade80, #22c55e, #16a34a, transparent)',
            animation: 'spin 0.9s linear infinite',
            boxShadow: '0 0 32px rgba(74,222,128,0.3)'
          }}
        />
        <div className="mt-6 text-center">
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>DiscIt</div>
          <div className="mt-2 font-medium" style={{ color: 'var(--text-muted)' }}>{progress}</div>
        </div>
      </div>
    );
  }

  return (
    <DatabaseContext.Provider value={isReady}>
      {children}
    </DatabaseContext.Provider>
  );
};
