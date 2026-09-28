'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getEntregasGlobalesProfesor } from '@/lib/actions/entregas';
import { PanelEntregasGlobales } from '@/components/shared/PanelEntregasGlobales';
import { InstitutionLoading } from '@/components/shared/InstitutionLoading';

export default function EntregasActividadesPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: d }) => {
      if (d.user) setUserId(d.user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    const res = await getEntregasGlobalesProfesor(userId);
    setData(res.data || []);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const res = await getEntregasGlobalesProfesor(userId);
    setData(res.data || []);
    setRefreshing(false);
  };

  if (loading) {
    return <InstitutionLoading title="Preparando entregas" />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-800 uppercase">
              Entregas de Actividades
            </h1>
            <p className="text-sm text-slate-400 font-bold mt-1">
              Todas tus actividades descriptivas con entregas activas, organizadas por materia.
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-[11px] font-black uppercase tracking-widest shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Panel principal */}
      {data && (
        <PanelEntregasGlobales
          profesorId={userId}
          initialData={data}
        />
      )}
    </div>
  );
}
