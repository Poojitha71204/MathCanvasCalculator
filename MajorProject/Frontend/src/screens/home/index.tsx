/* eslint-disable @typescript-eslint/no-explicit-any */
import { ColorSwatch, Group } from "@mantine/core";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Draggable from "react-draggable";
import { SWATCHES } from "@/constants";
import { Eraser } from "lucide-react";

interface GeneratedResult {
  expression: string;
  answer: string;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("rgb(255,255,255)");
  const [reset, setReset] = useState(false);
  const [dictOfVars] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [latexExpression, setLatexExpression] = useState<string[]>([]);

  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [isErasing, setIsErasing] = useState(false);

  const [showWelcome, setShowWelcome] = useState(true);

  const [graphUrl, setGraphUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // ✅ NEW LOADING STATE
  const [loading, setLoading] = useState(false);

  /* ---------------- MathJax ---------------- */
  useEffect(() => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML";
    script.async = true;
    document.head.appendChild(script);

    script.onload = () => {
      if ((window as any).MathJax) {
        (window as any).MathJax.Hub.Config({
          tex2jax: { inlineMath: [["$", "$"], ["\\(", "\\)"]] },
        });
      }
    };

    return () => document.head.removeChild(script);
  }, []);

  useEffect(() => {
    if (latexExpression.length > 0 && (window as any).MathJax) {
      setTimeout(() => {
        (window as any).MathJax.Hub.Queue([
          "Typeset",
          (window as any).MathJax.Hub,
        ]);
      }, 0);
    }
  }, [latexExpression]);

  useEffect(() => {
    if (result) {
      const latex = `\\(\\LARGE{${result.expression} = ${result.answer}}\\)`;
      setLatexExpression((prev) => [...prev, latex]);
    }
  }, [result]);

  useEffect(() => {
    if (reset) {
      const ctx = canvasRef.current?.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);

      setLatexExpression([]);
      setResult(null);
      setHistory([]);
      setRedoStack([]);
      setGraphUrl(null);
      setImageUrl(null);
      setReset(false);
    }
  }, [reset]);

  /* ---------------- Canvas ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = isErasing
      ? "destination-out"
      : "source-over";

    ctx.lineWidth = isErasing ? 25 : 4;
    ctx.strokeStyle = isErasing ? "rgba(0,0,0,1)" : color;

    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const snapshot = canvas.toDataURL();
    setHistory((prev) => [...prev, snapshot]);
    setRedoStack([]);
  };

  const undo = () => {
    if (history.length < 2) {
      const ctx = canvasRef.current?.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      setHistory([]);
      return;
    }

    const newHistory = [...history];
    const last = newHistory.pop();

    setRedoStack((prev) => (last ? [...prev, last] : prev));
    setHistory(newHistory);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const img = new Image();
    img.src = newHistory[newHistory.length - 1];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  };

  const redo = () => {
    if (redoStack.length === 0) return;

    const newRedo = [...redoStack];
    const state = newRedo.pop();
    if (!state) return;

    setRedoStack(newRedo);
    setHistory((prev) => [...prev, state]);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const img = new Image();
    img.src = state;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  };

  const toggleEraser = () => {
    setIsErasing((prev) => !prev);
  };

  /* ---------------- Backend ---------------- */
  const runRoute = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setLoading(true); // ✅ START LOADING

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/calculate`,
        {
          image: canvas.toDataURL("image/png"),
          dict_of_vars: dictOfVars,
          mode: "auto",
        }
      );

      const data = response.data.data;

      data.forEach((item: any) => {

        if (item.type === "math") {
          setResult({
            expression: item.expr,
            answer: item.result,
          });
        }

        if (item.type === "graph") {
          setGraphUrl(item.image);
        }

        if (item.type === "image") {
          setImageUrl(item.image);
        }

        if (item.type === "shape") {
          const name =
            item.shape.charAt(0).toUpperCase() + item.shape.slice(1);

          const shapeLatex = `\\(\\LARGE{${name} \\;\\rightarrow\\; Area = ${item.area},\\; Perimeter = ${item.perimeter}}\\)`;

          setLatexExpression((prev) => [...prev, shapeLatex]);
        }
      });

    } catch {
      alert("Backend error occurred.");
    } finally {
      setLoading(false); // ✅ STOP LOADING
    }
  };

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800">
      {/* ---------------- Instructions Panel ---------------- */}
<div className="absolute top-32 right-6 w-[90%] max-w-5xl bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4 text-white z-10 shadow-lg">

  <h2 className="text-lg font-semibold mb-2 text-center">📌 About Math Sketch AI</h2>

  <p className="text-sm text-gray-300 text-center mb-3">
    This application allows you to draw mathematical expressions, shapes, or graphs 
    and automatically interprets them using AI to provide results instantly.
  </p>

  <div className="grid md:grid-cols-3 gap-4 text-sm">

    <div>
      <h3 className="text-blue-400 font-semibold mb-1">✨ Features</h3>
      <ul className="list-disc ml-4 text-gray-300">
        <li>Recognizes handwritten math</li>
        <li>Generates graphs from equations</li>
        <li>Detects shapes (square, circle, etc.)</li>
        <li>Calculates area & perimeter</li>
      </ul>
    </div>

    <div>
      <h3 className="text-green-400 font-semibold mb-1">🛠 How to Use</h3>
      <ul className="list-disc ml-4 text-gray-300">
        <li>Draw on the canvas</li>
        <li>Click the Run button</li>
        <li>View results on screen</li>
      </ul>
    </div>

    <div>
      <h3 className="text-pink-400 font-semibold mb-1">⚠️ Important</h3>
      <ul className="list-disc ml-4 text-gray-300">
        <li>Draw clearly for better accuracy</li>
        <li>Internet is required (AI processing)</li>
        <li>Supports math, shapes & graphs</li>
      </ul>
    </div>

  </div>
</div>

      {showWelcome && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold mb-6">✨ AI Math Canvas</h1>
            <Button onClick={() => setShowWelcome(false)}>
              Start Drawing 🚀
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex gap-4 bg-white/10 p-3 rounded-xl z-20">
        <Button onClick={() => setReset(true)}>Reset</Button>
        <Button onClick={toggleEraser}><Eraser size={18} /></Button>
        <Button onClick={undo}>Undo</Button>
        <Button onClick={redo}>Redo</Button>

        <Group>
          {SWATCHES.map((swatch) => (
            <ColorSwatch key={swatch} color={swatch}
              onClick={() => {
                setColor(swatch);
                setIsErasing(false);
              }}
            />
          ))}
        </Group>

        {/* ✅ RUN BUTTON WITH LOADING INSIDE */}
        <Button onClick={runRoute} disabled={loading} className="flex items-center justify-center w-20">
          {loading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : (
            "Run"
          )}
        </Button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
      />

      {/* Math + Shape Output */}
      {latexExpression.map((latex, index) => (
  <Draggable key={index}>
    <div
      className="absolute left-10
      bg-white/10 backdrop-blur-xl border border-white/20 
      rounded-xl shadow-lg text-white text-xl cursor-move p-2"
      style={{ top: 120 + index * 80 }}  // ✅ spacing fix
    >
      {latex}
    </div>
  </Draggable>
  ))}
    

      {/* Graph */}
      {graphUrl && (
        <Draggable>
          <div className="absolute top-32 left-10 bg-white/10 p-3 rounded-xl">
            <img src={graphUrl} alt="graph" className="w-80 rounded-lg" />
          </div>
        </Draggable>
      )}

      {/* Image */}
      {imageUrl && (
        <Draggable>
          <div className="absolute top-32 right-10 bg-white/10 p-3 rounded-xl">
            <img src={imageUrl} alt="generated" className="w-80 rounded-lg" />
          </div>
        </Draggable>
      )}

    </div>
  );
}