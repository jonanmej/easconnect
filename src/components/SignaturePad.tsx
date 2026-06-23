import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser } from "lucide-react";

type Props = {
  width?: number;
  height?: number;
  onChange?: (dataUrl: string | null) => void;
};

export function SignaturePad({ width = 560, height = 200, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    cv.style.width = `${width}px`;
    cv.style.height = `${height}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, [width, height]);

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) {
      setEmpty(false);
      onChange?.(canvasRef.current?.toDataURL("image/png") ?? null);
    }
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange?.(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx?.clearRect(0, 0, cv.width, cv.height);
    setEmpty(true);
    onChange?.(null);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-input bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Área de firma"
          className="block w-full touch-none select-none cursor-crosshair"
          style={{ maxWidth: width, height }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{empty ? "Firme con el mouse o el dedo." : "Firma capturada."}</span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Eraser className="size-3.5" /> Limpiar
        </button>
      </div>
    </div>
  );
}