"use client";

import React, { useEffect, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string; // 'image/jpeg' | 'image/png' | 'application/pdf'
}

export default function FileViewerModal({ isOpen, onClose, fileUrl, fileName, fileType }: FileViewerModalProps) {
  const isImage = fileType.startsWith("image/");
  const isPdf = fileType === "application/pdf";

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm md:text-base truncate">{fileName}</p>
          <p className="text-white/60 text-xs">{isImage ? "Imagen" : "PDF"} — Solo visualización</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white shrink-0"
          aria-label="Cerrar visor"
        >
          <X size={24} />
        </button>
      </div>

      {/* Content */}
      <div
        className="w-full h-full flex items-center justify-center pt-16 pb-4"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isImage && (
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={5}
            centerOnInit
            wheel={{ step: 0.1 }}
            pinch={{ step: 5 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom controls (desktop & mobile) */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-2">
                  <button
                    onClick={() => zoomOut()}
                    className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                    aria-label="Alejar"
                  >
                    <ZoomOut size={20} />
                  </button>
                  <button
                    onClick={() => resetTransform()}
                    className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                    aria-label="Restablecer"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    onClick={() => zoomIn()}
                    className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                    aria-label="Acercar"
                  >
                    <ZoomIn size={20} />
                  </button>
                </div>

                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileUrl}
                    alt={fileName}
                    className="max-w-full max-h-full object-contain select-none pointer-events-none"
                    draggable={false}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        )}

        {isPdf && (
          <iframe
            src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=1`}
            className="w-full h-full max-w-4xl mx-4 rounded-lg border-0 bg-white"
            title={fileName}
            style={{ minHeight: "80vh" }}
          />
        )}
      </div>
    </div>
  );
}
