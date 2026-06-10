import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getConfigCredenciales, getAlumnosCredenciales, getInstitutionConfig } from '@/lib/actions/credenciales';
import { TablaCredenciales } from '@/components/admin/credenciales/TablaCredenciales';
import { CredencialDesigner } from '@/components/admin/credenciales/CredencialDesigner';
import { IdCard } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CredencialesPage() {
  const [config, alumnos, institucion] = await Promise.all([
    getConfigCredenciales(),
    getAlumnosCredenciales(),
    getInstitutionConfig()
  ]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IdCard className="h-8 w-8 text-primary" />
          Credenciales de Institución
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestiona el diseño y la asignación de credenciales para los estudiantes activos.
        </p>
      </div>

      <Tabs defaultValue="listado" className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2 bg-gray-100/80">
          <TabsTrigger value="listado">Listado y Asignación</TabsTrigger>
          <TabsTrigger value="diseno">Gestión de Diseño</TabsTrigger>
        </TabsList>
        
        <TabsContent value="listado" className="space-y-4">
          <TablaCredenciales 
            alumnos={alumnos} 
            config={config} 
            institucion={institucion}
          />
        </TabsContent>
        
        <TabsContent value="diseno" className="space-y-4">
          <CredencialDesigner 
            initialConfig={config} 
            institucion={institucion}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
