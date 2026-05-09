import React from 'react';
import { MessagesSquare, Hammer } from 'lucide-react';

const Mensajeria: React.FC = () => {
  const bd = 'hsl(var(--border))';
  const mt = 'hsl(var(--muted-foreground))';

  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.15)' }}>
          <MessagesSquare className="w-9 h-9" style={{ color: 'rgba(251,146,60,0.6)' }} strokeWidth={1} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center"
          style={{ background: 'hsl(var(--card))', border: `1px solid ${bd}` }}>
          <Hammer className="w-3.5 h-3.5" style={{ color: mt }} strokeWidth={1.5} />
        </div>
      </div>
      <h2 className="text-lg font-light text-white tracking-wide mb-2">Mensajería</h2>
      <p className="text-sm font-light" style={{ color: mt }}>Módulo en construcción</p>
      <p className="text-xs font-light mt-1" style={{ color: 'rgba(255,255,255,0.15)' }}>Próximamente disponible</p>
    </div>
  );
};

export default Mensajeria;