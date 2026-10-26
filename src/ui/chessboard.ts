import { famousPosition, parseFen } from "../chess-position";

/** Crisp, accessible board drawing; no game engine or case-state mutation. */
export function drawChessPosition(
  frame: number,
  flipped: boolean,
): SVGSVGElement {
  const data = famousPosition.frames[frame];
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 560 560");
  svg.setAttribute("class", "position-board");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", data.move + ", " + data.title);
  const make = (
    tag: string,
    attributes: Record<string, string>,
    copy?: string,
  ) => {
    const element = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes))
      element.setAttribute(name, value);
    if (copy) element.textContent = copy;
    svg.append(element);
    return element;
  };
  for (let row = 0; row < 8; row++)
    for (let column = 0; column < 8; column++) {
      make("rect", {
        x: String(40 + column * 60),
        y: String(40 + row * 60),
        width: "60",
        height: "60",
        fill: (row + column) % 2 ? "#48494d" : "#f7f6f0",
      });
    }
  const point = (file: number, rank: number) => ({
    x: 70 + (flipped ? 7 - file : file) * 60,
    y: 70 + (flipped ? rank - 1 : 8 - rank) * 60,
  });
  for (const square of [data.from, data.to]) {
    const p = point(square.charCodeAt(0) - 97, Number(square[1]));
    make("rect", {
      x: String(p.x - 29),
      y: String(p.y - 29),
      width: "58",
      height: "58",
      fill: "#db2038",
      "fill-opacity": ".27",
      stroke: "#ed3047",
      "stroke-width": "3",
    });
  }
  const symbols: Record<string, string> = {
    K: "♔",
    Q: "♕",
    R: "♖",
    B: "♗",
    N: "♘",
    P: "♙",
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  };
  const names: Record<string, string> = {
    k: "king",
    q: "queen",
    r: "rook",
    b: "bishop",
    n: "knight",
    p: "pawn",
  };
  for (const square of parseFen(data.fen)) {
    const p = point(square.file, square.rank),
      white = square.piece === square.piece.toUpperCase();
    const piece = make(
      "text",
      {
        x: String(p.x),
        y: String(p.y + 18),
        "text-anchor": "middle",
        class: "board-piece " + (white ? "white-piece" : "black-piece"),
      },
      symbols[square.piece],
    );
    const title = document.createElementNS(namespace, "title");
    title.textContent =
      (white ? "White " : "Black ") +
      names[square.piece.toLowerCase()] +
      " on " +
      String.fromCharCode(97 + square.file) +
      square.rank;
    piece.append(title);
  }
  for (let index = 0; index < 8; index++) {
    make(
      "text",
      {
        x: String(70 + index * 60),
        y: "545",
        "text-anchor": "middle",
        class: "board-coordinate",
      },
      String.fromCharCode(97 + (flipped ? 7 - index : index)),
    );
    make(
      "text",
      {
        x: "20",
        y: String(76 + index * 60),
        "text-anchor": "middle",
        class: "board-coordinate",
      },
      String(flipped ? index + 1 : 8 - index),
    );
  }
  return svg;
}
