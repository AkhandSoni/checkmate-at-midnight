/** Historical position facts, independently rendered with original SVG code.
 * Reference: ChessBase, 'Throwback Thursday: Kasparov’s immortal', 11 March 2021.
 * https://en.chessbase.com/newsroom/post/throwback-thursday-kasparov-wijjk-1999
 */
export const famousPosition = {
  title: "Kasparov–Topalov",
  event: "Wijk aan Zee · 1999",
  frames: [
    {
      title: "Before the sacrifice",
      move: "After 23…Qd6 · White to move",
      fen: "b2r3r/k4p1p/p2q1np1/NppP4/3p1Q2/P4PPB/1PP4P/1K1RR3 w - - 0 24",
      from: "d1",
      to: "d4",
      explanation:
        "The white king is on b1 and the black king is exposed on a7. Kasparov’s next move offers a rook to open the centre: 24.Rxd4.",
    },
    {
      title: "The rook is offered",
      move: "24.Rxd4 · Black to move",
      fen: "b2r3r/k4p1p/p2q1np1/NppP4/3R1Q2/P4PPB/1PP4P/1K2R3 b - - 0 24",
      from: "d1",
      to: "d4",
      explanation:
        "The rook captures the pawn on d4. Black can take it with the c5-pawn, but accepting the material opens lines for White’s remaining pieces.",
    },
    {
      title: "Topalov accepts",
      move: "24…cxd4 · White to move",
      fen: "b2r3r/k4p1p/p2q1np1/Np1P4/3p1Q2/P4PPB/1PP4P/1K2R3 w - - 0 25",
      from: "c5",
      to: "d4",
      explanation:
        "The c-pawn captures the rook on d4. White has sacrificed a rook, yet the queen, knight, bishop and remaining rook can coordinate against the black king.",
    },
    {
      title: "The attack continues",
      move: "25.Re7+ · Black to move",
      fen: "b2r3r/k3Rp1p/p2q1np1/Np1P4/3p1Q2/P4PPB/1PP4P/1K6 b - - 1 25",
      from: "e1",
      to: "e7",
      explanation:
        "The remaining rook enters e7 with check. The game continues into a long king hunt. These four positions show the opening of the combination, rather than its entire continuation.",
    },
  ],
};
export type ChessSquare = { file: number; rank: number; piece: string };
export function parseFen(fen: string): ChessSquare[] {
  const ranks = fen.split(" ")[0].split("/");
  if (ranks.length !== 8) throw new Error("FEN must have eight ranks");
  const pieces: ChessSquare[] = [];
  ranks.forEach((row, index) => {
    let file = 0;
    for (const token of row) {
      if (/^[1-8]$/.test(token)) file += Number(token);
      else {
        if (!/^[prnbqkPRNBQK]$/.test(token))
          throw new Error("Unknown chess piece");
        pieces.push({ file, rank: 8 - index, piece: token });
        file++;
      }
    }
    if (file !== 8) throw new Error("Each rank must contain eight squares");
  });
  return pieces;
}
