'use client';

import React, { useRef, useState } from 'react';
import { Camera, Upload, User, Loader2, CheckCircle2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { uploadProfilePicture } from '@/lib/actions/perfil';

interface ProfilePictureUploaderProps {
  currentUrl?: string | null;
  userName: string;
}

export function ProfilePictureUploader({ currentUrl, userName }: ProfilePictureUploaderProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const resizeAndCompressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Max dimensions
        const MAX_SIZE = 800;
        
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo obtener el contexto del canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob, starting with quality 0.8
        let quality = 0.8;
        const targetSize = 1024 * 1024; // 1MB

        const compress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Fallo al comprimir la imagen'));
                return;
              }
              if (blob.size > targetSize && quality > 0.1) {
                quality -= 0.1;
                compress();
              } else {
                resolve(blob);
              }
            },
            'image/jpeg',
            quality
          );
        };
        
        compress();
      };
      
      img.onerror = () => reject(new Error('Error al cargar la imagen para redimensionar'));
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Por favor selecciona un archivo de imagen válido', variant: 'destructive' });
      return;
    }

    try {
      setIsUploading(true);
      setProgress(10); // Empezar animación
      
      // Mostrar preview local inmediatamente
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);

      // Simular progreso de compresión
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 40) {
            clearInterval(progressInterval);
            return 40;
          }
          return prev + 5;
        });
      }, 100);

      // 1. Redimensionar y comprimir
      const compressedBlob = await resizeAndCompressImage(file);
      clearInterval(progressInterval);
      setProgress(50); // Compresión lista

      // 2. Subir al servidor
      const formData = new FormData();
      formData.append('file', compressedBlob, file.name.replace(/\.[^/.]+$/, "") + ".jpg");

      // Simular progreso de subida
      const uploadInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(uploadInterval);
            return 90;
          }
          return prev + 5;
        });
      }, 200);

      const result = await uploadProfilePicture(formData);
      clearInterval(uploadInterval);

      if (result.success && result.url) {
        setProgress(100);
        setPreviewUrl(result.url);
        toast({ title: 'Foto de perfil actualizada correctamente' });
        setTimeout(() => setIsUploading(false), 1000);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: error.message || 'Error al actualizar la foto de perfil', variant: 'destructive' });
      setPreviewUrl(currentUrl || null); // Revert on error
      setIsUploading(false);
      setProgress(0);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 bg-white rounded-xl border shadow-sm">
      <div className="relative group">
        <Avatar className="h-32 w-32 border-4 border-white shadow-lg overflow-hidden transition-all duration-300">
          {previewUrl && <AvatarImage src={previewUrl} className="object-cover" />}
          <AvatarFallback className="bg-primary/10 text-primary text-4xl font-bold">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
        
        {!isUploading && (
          <div 
            className="absolute inset-0 bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-8 w-8 mb-1" />
            <span className="text-xs font-medium">Cambiar foto</span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white backdrop-blur-sm transition-all duration-300">
            {progress === 100 ? (
              <CheckCircle2 className="h-10 w-10 text-green-400 animate-in zoom-in duration-300" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-bold">{progress}%</span>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Progress Ring Animation */}
        {isUploading && progress < 100 && (
          <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
            <circle
              className="text-gray-200"
              strokeWidth="4"
              stroke="currentColor"
              fill="transparent"
              r="48"
              cx="50"
              cy="50"
            />
            <circle
              className="text-primary transition-all duration-300 ease-out"
              strokeWidth="4"
              strokeDasharray={2 * Math.PI * 48}
              strokeDashoffset={2 * Math.PI * 48 * (1 - progress / 100)}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="48"
              cx="50"
              cy="50"
            />
          </svg>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        capture="user"
        onChange={handleFileChange}
      />

      <div className="flex gap-3">
        <Button 
          variant="outline" 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="rounded-full px-6 transition-all hover:shadow-md hover:border-primary/50 group"
        >
          <Upload className="mr-2 h-4 w-4 group-hover:-translate-y-0.5 transition-transform" />
          Subir archivo
        </Button>
        <Button 
          variant="secondary" 
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.setAttribute('capture', 'user');
              fileInputRef.current.click();
            }
          }}
          disabled={isUploading}
          className="rounded-full px-6 transition-all hover:shadow-md sm:flex"
        >
          <Camera className="mr-2 h-4 w-4" />
          Cámara
        </Button>
      </div>
      
      <p className="text-xs text-muted-foreground text-center max-w-[250px]">
        Sube una imagen de frente. Se redimensionará automáticamente.
      </p>
    </div>
  );
}
