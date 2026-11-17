// A self-drawn dungeon map for screenshot tests: drawn in code, so the repository needs no
// image file and the fixture has no third-party rights (SOURCES.md).

/** Map size in map pixels; 100 px per grid cell, as the placeholder grid assumes. */
export const FIXTURE_MAP = { width: 1600, height: 1000 } as const;

export function drawFixtureMap(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FIXTURE_MAP.width;
  canvas.height = FIXTURE_MAP.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas not available");

  // Rock.
  context.fillStyle = "#2b2622";
  context.fillRect(0, 0, FIXTURE_MAP.width, FIXTURE_MAP.height);
  // Rooms and a corridor, aligned to the 100 px grid.
  context.fillStyle = "#b9a888";
  context.fillRect(100, 100, 500, 400);
  context.fillRect(600, 250, 400, 100);
  context.fillRect(1000, 100, 500, 800);
  // A pool and a pillar, so rotation and orientation are visible in screenshots.
  context.fillStyle = "#3c6e91";
  context.beginPath();
  context.arc(1250, 650, 150, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#5a3d2b";
  context.fillRect(200, 200, 100, 100);
  // Grid lines drawn into the map, as on most battle maps.
  context.strokeStyle = "rgba(0, 0, 0, 0.35)";
  context.lineWidth = 2;
  for (let x = 0; x <= FIXTURE_MAP.width; x += 100) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, FIXTURE_MAP.height);
    context.stroke();
  }
  for (let y = 0; y <= FIXTURE_MAP.height; y += 100) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(FIXTURE_MAP.width, y);
    context.stroke();
  }
  // A north marker in the top-left corner.
  context.fillStyle = "#c0392b";
  context.beginPath();
  context.moveTo(50, 10);
  context.lineTo(80, 80);
  context.lineTo(20, 80);
  context.closePath();
  context.fill();
  return canvas;
}
