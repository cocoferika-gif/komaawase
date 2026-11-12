import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import "./App.css";

// 駒の種類と合体する順番
const PIECES = [
  { name: "歩", emoji: "歩", radius: 19, color: "#eee2c4", score: 2 },
  { name: "香", emoji: "香", radius: 23, color: "#e9c98e", score: 4 },
  { name: "桂", emoji: "桂", radius: 28, color: "#d9a96c", score: 8 },
  { name: "銀", emoji: "銀", radius: 33, color: "#c5cbd0", score: 16 },
  { name: "金", emoji: "金", radius: 39, color: "#e9c45c", score: 32 },
  { name: "角", emoji: "角", radius: 46, color: "#d78b53", score: 64 },
  { name: "飛", emoji: "飛", radius: 54, color: "#bd765c", score: 128 },
  { name: "王", emoji: "王", radius: 64, color: "#d8a82d", score: 256 }
];

const WIDTH = 360;
const HEIGHT = 540;
const DROP_LIMIT = 100;

type PieceBody = Matter.Body & {
  pieceLevel?: number;
  isMerging?: boolean;
};

export default function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [nextPiece, setNextPiece] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [dropX, setDropX] = useState(WIDTH / 2);
  const [pieceCount, setPieceCount] = useState(0);

  const nextRandomPiece = () => Math.floor(Math.random() * 3);

  // ゲーム初期化
  useEffect(() => {
    if (!sceneRef.current) return;

    const engine = Matter.Engine.create();
    engine.gravity.y = 1.1;
    engineRef.current = engine;

    const render = Matter.Render.create({
      element: sceneRef.current,
      engine,
      options: {
        width: WIDTH,
        height: HEIGHT,
        wireframes: false,
        background: "transparent",
        pixelRatio: window.devicePixelRatio || 1
      }
    });

    // 床と左右の壁
    const floor = Matter.Bodies.rectangle(
      WIDTH / 2, HEIGHT + 25, WIDTH, 50,
      { isStatic: true, render: { fillStyle: "#806044" } }
    );

    const leftWall = Matter.Bodies.rectangle(
      -15, HEIGHT / 2, 30, HEIGHT * 2,
      { isStatic: true, render: { visible: false } }
    );

    const rightWall = Matter.Bodies.rectangle(
      WIDTH + 15, HEIGHT / 2, 30, HEIGHT * 2,
      { isStatic: true, render: { visible: false } }
    );

    Matter.Composite.add(engine.world, [floor, leftWall, rightWall]);

    // 駒を作る
    const createPiece = (x: number, y: number, level: number) => {
      const piece = PIECES[level];

      const body = Matter.Bodies.circle(
        x,
        y,
        piece.radius,
        {
          restitution: 0.18,
          friction: 0.35,
          density: 0.001,
          render: {
            fillStyle: piece.color,
            strokeStyle: "#765538",
            lineWidth: 2
          }
        }
      ) as PieceBody;

      body.pieceLevel = level;
      Matter.Composite.add(engine.world, body);
      return body;
    };

    // 衝突時の合体処理
    Matter.Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach(({ bodyA, bodyB }) => {
        const a = bodyA as PieceBody;
        const b = bodyB as PieceBody;

        if (
          a.pieceLevel === undefined ||
          b.pieceLevel === undefined ||
          a.pieceLevel !== b.pieceLevel ||
          a.isMerging ||
          b.isMerging ||
          a.pieceLevel >= PIECES.length - 1
        ) return;

        a.isMerging = true;
        b.isMerging = true;

        const level = a.pieceLevel + 1;
        const x = (a.position.x + b.position.x) / 2;
        const y = (a.position.y + b.position.y) / 2;

        // 少し遅らせて合体させる
        window.setTimeout(() => {
          if (engineRef.current !== engine) return;

          Matter.Composite.remove(engine.world, a);
          Matter.Composite.remove(engine.world, b);

          const merged = createPiece(x, y, level);
          Matter.Body.setVelocity(merged, { x: 0, y: -2 });

          setScore((old) => {
            const updated = old + PIECES[level].score;
            setBest((previous) => {
              const newBest = Math.max(previous, updated);
              localStorage.setItem("shogi-merge-best", String(newBest));
              return newBest;
            });
            return updated;
          });
        }, 80);
      });
    });

    // 描画時に駒の文字を表示
    Matter.Events.on(render, "afterRender", () => {
      const ctx = render.context;

      Matter.Composite.allBodies(engine.world).forEach((body) => {
        const piece = body as PieceBody;
        if (piece.pieceLevel === undefined) return;

        const data = PIECES[piece.pieceLevel];

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        ctx.fillStyle = "#49301e";
        ctx.font = `bold ${Math.max(15, data.radius * 0.75)}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(data.emoji, 0, 1);

        ctx.restore();
      });
    });

    // ゲームオーバー判定
    const checkGameOver = () => {
      const bodies = Matter.Composite.allBodies(engine.world);
      const pieces = bodies.filter(
        (body) => (body as PieceBody).pieceLevel !== undefined
      );

      const dangerous = pieces.some(
        (body) => body.position.y < DROP_LIMIT &&
          Math.abs(body.velocity.y) < 0.5
      );

      if (dangerous) {
        setGameOver(true);
      }
    };

    const interval = window.setInterval(checkGameOver, 700);

    Matter.Render.run(render);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    setBest(Number(localStorage.getItem("shogi-merge-best") || 0));

    return () => {
      window.clearInterval(interval);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Events.off(engine);
      Matter.Events.off(render);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      render.canvas.remove();
      render.textures = {};
      engineRef.current = null;
    };
  }, []);

  // 駒を落とす
  const dropPiece = () => {
    const engine = engineRef.current;
    if (!engine || gameOver) return;

    const level = nextPiece;
    const radius = PIECES[level].radius;
    const x = Math.max(radius + 5, Math.min(WIDTH - radius - 5, dropX));

    const body = Matter.Bodies.circle(
      x,
      35,
      radius,
      {
        restitution: 0.18,
        friction: 0.35,
        density: 0.001,
        render: {
          fillStyle: PIECES[level].color,
          strokeStyle: "#765538",
          lineWidth: 2
        }
      }
    ) as PieceBody;

    body.pieceLevel = level;
    Matter.Composite.add(engine.world, body);

    setNextPiece(nextRandomPiece());
    setPieceCount((count) => count + 1);
  };

  // 画面をタップした位置に駒を落とす
  const handleBoardClick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = WIDTH / rect.width;
    const x = (event.clientX - rect.left) * scale;

    setDropX(Math.max(25, Math.min(WIDTH - 25, x)));
    dropPiece();
  };

  // リセット
  const resetGame = () => {
    const engine = engineRef.current;
    if (!engine) return;

    const bodies = Matter.Composite.allBodies(engine.world);
    bodies.forEach((body) => {
      if ((body as PieceBody).pieceLevel !== undefined) {
        Matter.Composite.remove(engine.world, body);
      }
    });

    setScore(0);
    setNextPiece(nextRandomPiece());
    setPieceCount(0);
    setGameOver(false);
    setDropX(WIDTH / 2);
  };

  const next = PIECES[nextPiece];

  return (
    <main className="game-page">
      <header className="header">
        <div className="logo-mark">将</div>
        <div>
          <p className="eyebrow">JAPANESE PUZZLE GAME</p>
          <h1>駒あわせ</h1>
        </div>
      </header>

      <section className="game-container">
        <div className="game-info">
          <div className="score-card">
            <span>現在のスコア</span>
            <strong>{score.toLocaleString()}</strong>
          </div>
          <div className="score-card best-card">
            <span>ベストスコア</span>
            <strong>{best.toLocaleString()}</strong>
          </div>
        </div>

        <div className="game-layout">
          <div className="board-column">
            <div className="board-heading">
              <span>盤面</span>
              <span className="piece-count">DROP {pieceCount}</span>
            </div>

            <div
              className="game-board"
              onPointerDown={handleBoardClick}
            >
              <div className="danger-line" />
              <div className="danger-label">注意ライン</div>
              <div ref={sceneRef} className="physics-scene" />

              {gameOver && (
                <div className="game-over">
                  <div className="game-over-card">
                    <span className="game-over-icon">王</span>
                    <h2>対局終了</h2>
                    <p>盤面がいっぱいになりました</p>
                    <strong>{score.toLocaleString()} 点</strong>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      resetGame();
                    }}>
                      もう一度遊ぶ
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="board-help">
              盤面をタップした位置に駒が落ちます
            </p>
          </div>

          <aside className="side-panel">
            <div className="next-card">
              <span className="panel-label">NEXT PIECE</span>
              <div
                className="next-piece"
                style={{ backgroundColor: next.color }}
              >
                {next.emoji}
              </div>
              <strong>{next.name}</strong>
              <span className="next-description">次に落ちる駒</span>
            </div>

            <div className="rule-card">
              <span className="panel-label">合体の順番</span>
              <div className="piece-chain">
                {PIECES.map((piece, index) => (
                  <div className="chain-item" key={piece.name}>
                    <span
                      className="chain-piece"
                      style={{ backgroundColor: piece.color }}
                    >
                      {piece.emoji}
                    </span>
                    {index < PIECES.length - 1 && (
                      <span className="chain-arrow">↓</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button className="reset-button" onClick={resetGame}>
              ↻ ゲームをリセット
            </button>
          </aside>
        </div>
      </section>

      <footer className="footer">
        <p>同じ駒をぶつけて、最強の「王」を目指そう。</p>
        <span>© KOMA AWASE</span>
      </footer>
    </main>
  );
}