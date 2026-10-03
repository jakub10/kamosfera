import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

/** QR kód s odkazom. Dospelý ho naskenuje obyčajným fotoaparátom v mobile. */
export function QrCode({ value, size = 220, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [value, size]);

  return (
    <div
      className={cn('grid place-items-center rounded-2xl bg-white p-3 shadow', className)}
      style={{ width: size + 24, height: size + 24 }}
    >
      {src ? (
        <img src={src} alt="QR kód" width={size} height={size} className="[image-rendering:pixelated]" />
      ) : (
        <span className="text-xs text-slate-400">QR kód se načítá…</span>
      )}
    </div>
  );
}
